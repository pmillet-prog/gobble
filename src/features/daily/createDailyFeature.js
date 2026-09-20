import { createStateFeature } from "../../app/core/createStateFeature.js";
import { DAILY_SPECIAL_MODE } from "../../components/daily/dailyModes.js";
import {
  createDailySpecialPlacements,
  createDailyWordSlots,
} from "../../components/daily/dailySpecialModel.js";

const CANCELLED_HTTP_REQUEST = Symbol("cancelled_daily_http_request");

export function createInitialDailyState() {
  return {
    activeSlot: 0,
    board: {
      battle: null,
      dateId: null,
      entries: [],
      error: "",
      loading: false,
      ready: false,
    },
    history: { crownTotals: [], days: [] },
    historyError: "",
    historyIndex: 0,
    historyLoading: false,
    invalidPulseKey: 0,
    invalidSlot: null,
    launchDialog: null,
    lockPulseKey: 0,
    playMode: DAILY_SPECIAL_MODE,
    rankingView: "today",
    result: null,
    section: "overview",
    specialDrag: null,
    specialPlacements: createDailySpecialPlacements(),
    startError: "",
    status: {
      champion: null,
      dateId: null,
      error: "",
      hasPlayed: false,
      hasPlayedFakeTwins: false,
      hasPlayedMonstrous: false,
      hasPlayedSpecial: false,
      loading: false,
      maintenanceMode: false,
      maintenanceMessage: "",
      myFakeTwinsResult: null,
      myMonstrousResult: null,
      myResult: null,
      mySpecialResult: null,
      ready: false,
    },
    submitError: "",
    wordSlots: createDailyWordSlots(),
  };
}

export function createDailyFeature(
  context,
  {
    abortControllerFactory = () => new AbortController(),
    clearTimeoutFn = clearTimeout,
    fetchImpl = (...args) => globalThis.fetch(...args),
    setTimeoutFn = setTimeout,
  } = {}
) {
  let active = false;
  let feature = null;
  let transportConfig = {};
  const httpRequests = {
    board: null,
    history: null,
    status: null,
  };
  const pendingAckRequests = new Set();

  function cancelHttpRequest(kind) {
    const request = httpRequests[kind];
    if (!request || request.cancelled) return;
    request.cancelled = true;
    if (httpRequests[kind] === request) httpRequests[kind] = null;
    try {
      request.controller?.abort?.();
    } catch (_) {}
    request.cancelResolve(CANCELLED_HTTP_REQUEST);
  }

  function cancelHttpRequests() {
    cancelHttpRequest("board");
    cancelHttpRequest("history");
    cancelHttpRequest("status");
  }

  async function readJsonRequest(request, url, options = {}) {
    const response = await Promise.race([
      fetchImpl(url, {
        ...options,
        signal: request.controller?.signal,
      }),
      request.cancelPromise,
    ]);
    if (response === CANCELLED_HTTP_REQUEST || request.cancelled) {
      return CANCELLED_HTTP_REQUEST;
    }
    const text = await Promise.race([
      response.text(),
      request.cancelPromise,
    ]);
    if (text === CANCELLED_HTTP_REQUEST || request.cancelled) {
      return CANCELLED_HTTP_REQUEST;
    }
    return {
      data: text ? JSON.parse(text) : null,
      response,
    };
  }

  function runHttpRequest({ execute, key, kind, onError, onStart }) {
    if (!active) return null;
    const pendingRequest = httpRequests[kind];
    if (pendingRequest?.key === key) return pendingRequest.promise;
    cancelHttpRequest(kind);

    let cancelResolve;
    const request = {
      cancelled: false,
      cancelPromise: new Promise((resolve) => {
        cancelResolve = resolve;
      }),
      cancelResolve: null,
      controller: abortControllerFactory(),
      key,
      promise: null,
    };
    request.cancelResolve = cancelResolve;
    httpRequests[kind] = request;
    onStart();
    request.promise = (async () => {
      try {
        const result = await execute(request);
        if (
          result === CANCELLED_HTTP_REQUEST ||
          request.cancelled ||
          !active ||
          httpRequests[kind] !== request
        ) {
          return null;
        }
        return result;
      } catch (error) {
        if (
          request.cancelled ||
          !active ||
          httpRequests[kind] !== request
        ) {
          return null;
        }
        onError(error);
        return null;
      } finally {
        if (httpRequests[kind] === request) httpRequests[kind] = null;
      }
    })();
    return request.promise;
  }

  function fetchDailyStatus({ installId = "", onDuelStatus = null } = {}) {
    const safeInstallId = String(installId || "");
    const query = safeInstallId
      ? `?installId=${encodeURIComponent(safeInstallId)}`
      : "";
    return runHttpRequest({
      key: safeInstallId,
      kind: "status",
      onStart: () => {
        feature.set("status", (previous) => ({
          ...previous,
          loading: true,
          error: "",
        }));
      },
      execute: async (request) => {
        const result = await readJsonRequest(
          request,
          `/api/daily/status${query}`,
          {
            cache: "no-store",
            credentials: "include",
            headers: { Accept: "application/json" },
          }
        );
        if (result === CANCELLED_HTTP_REQUEST) return result;
        const { data, response } = result;
        if (!response.ok) {
          throw new Error(data?.error || `http_${response.status || "error"}`);
        }
        feature.set("status", {
          loading: false,
          ready: !!data?.ready,
          hasPlayed: !!data?.hasPlayed,
          hasPlayedMonstrous: !!data?.hasPlayedMonstrous,
          hasPlayedSpecial: !!data?.hasPlayedSpecial,
          hasPlayedFakeTwins: !!data?.hasPlayedFakeTwins,
          dateId: data?.dateId || null,
          myResult: data?.myResult || null,
          myMonstrousResult: data?.myMonstrousResult || null,
          mySpecialResult: data?.mySpecialResult || null,
          myFakeTwinsResult: data?.myFakeTwinsResult || null,
          champion: data?.champion || null,
          maintenanceMode: !!data?.maintenanceMode,
          maintenanceMessage: data?.maintenanceMessage || "",
          error: "",
        });
        if (data?.duel && typeof data.duel === "object") {
          try {
            onDuelStatus?.(data.duel);
          } catch (_) {}
        }
        return data;
      },
      onError: () => {
        feature.set("status", (previous) => ({
          ...previous,
          loading: false,
          error: "erreur",
        }));
      },
    });
  }

  function fetchDailyHistory({ days = 10, installId = "" } = {}) {
    if (!active) return null;
    if (httpRequests.history) return httpRequests.history.promise;
    const safeInstallId = String(installId || "");
    const params = new URLSearchParams();
    params.set("days", String(days));
    if (safeInstallId) params.set("installId", safeInstallId);
    return runHttpRequest({
      key: `${safeInstallId}|${days}`,
      kind: "history",
      onStart: () => {
        feature.patch({ historyError: "", historyLoading: true });
      },
      execute: async (request) => {
        const result = await readJsonRequest(
          request,
          `/api/daily/history?${params.toString()}`,
          {
            cache: "no-store",
            credentials: "include",
            headers: { Accept: "application/json" },
          }
        );
        if (result === CANCELLED_HTTP_REQUEST) return result;
        const { data, response } = result;
        if (!response.ok) {
          throw new Error(data?.error || `http_${response.status || "error"}`);
        }
        const rawCrowns = Array.isArray(data?.crownTotals)
          ? data.crownTotals
          : Array.isArray(data?.medalTotals)
          ? data.medalTotals
          : [];
        const history = {
          days: Array.isArray(data?.days) ? data.days : [],
          crownTotals: rawCrowns.map((entry) => ({
            nick: entry?.nick || "Joueur",
            crowns: Number.isFinite(entry?.crowns)
              ? entry.crowns
              : Number.isFinite(entry?.gold)
              ? entry.gold
              : 0,
          })),
        };
        feature.patch({ history, historyError: "", historyLoading: false });
        return history;
      },
      onError: () => {
        feature.patch({
          history: { days: [], crownTotals: [] },
          historyError: "erreur",
          historyLoading: false,
        });
      },
    });
  }

  function fetchDailyBoard({ dateId = null } = {}) {
    const safeDateId = dateId ? String(dateId) : "";
    const query = safeDateId ? `?dateId=${encodeURIComponent(safeDateId)}` : "";
    return runHttpRequest({
      key: safeDateId,
      kind: "board",
      onStart: () => {
        feature.set("board", (previous) => ({
          ...previous,
          loading: true,
          error: "",
        }));
      },
      execute: async (request) => {
        const result = await readJsonRequest(
          request,
          `/api/daily/board${query}`,
          {
            cache: "no-store",
            headers: { Accept: "application/json" },
          }
        );
        if (result === CANCELLED_HTTP_REQUEST) return result;
        const { data, response } = result;
        if (!data || typeof data !== "object") {
          throw new Error(`http_${response.status || "error"}`);
        }
        const board = {
          loading: false,
          ready: !!data?.ready,
          dateId: data?.dateId || null,
          entries: Array.isArray(data?.entries) ? data.entries : [],
          battle: data?.battle || null,
          error: "",
        };
        feature.set("board", board);
        return board;
      },
      onError: () => {
        feature.set("board", (previous) => ({
          ...previous,
          loading: false,
          error: "erreur",
        }));
      },
    });
  }

  function getSocket(config = transportConfig) {
    return config.socket || context.ports?.realtime || null;
  }

  function cancelPendingAckRequests(reason = "cancelled") {
    const error = new Error(reason);
    for (const request of [...pendingAckRequests]) {
      request.reject(error);
    }
  }

  function configureTransport(nextConfig = {}) {
    const previousSocket = getSocket();
    const nextSocket = getSocket(nextConfig);
    transportConfig = nextConfig;
    if (previousSocket && nextSocket !== previousSocket) {
      cancelPendingAckRequests("transport_replaced");
    }
  }

  function emitSocketAck(eventName, payload, { timeoutMs = 6500 } = {}) {
    if (!active) return Promise.reject(new Error("inactive"));
    const socket = getSocket();
    if (!socket || typeof socket.emit !== "function") {
      return Promise.reject(new Error("connection_unavailable"));
    }

    return new Promise((resolve, reject) => {
      const request = {
        reject: null,
        settled: false,
        timeoutId: null,
      };

      const detachConnectionListeners = () => {
        socket.off?.("connect", onConnect);
        socket.off?.("connect_error", onConnectError);
      };

      const cleanup = () => {
        detachConnectionListeners();
        if (request.timeoutId != null) {
          clearTimeoutFn(request.timeoutId);
          request.timeoutId = null;
        }
        pendingAckRequests.delete(request);
      };

      const settleResolve = (value) => {
        if (request.settled) return;
        request.settled = true;
        cleanup();
        resolve(value);
      };

      const settleReject = (error) => {
        if (request.settled) return;
        request.settled = true;
        cleanup();
        reject(error);
      };
      request.reject = settleReject;
      pendingAckRequests.add(request);

      const send = () => {
        if (request.settled) return;
        request.timeoutId = setTimeoutFn(() => {
          settleReject(new Error("timeout"));
        }, timeoutMs);
        socket.emit(eventName, payload, (response) => {
          if (!response || typeof response !== "object") {
            settleReject(new Error("bad_payload"));
            return;
          }
          if (response.ok === false) {
            const error = new Error(String(response.error || "error"));
            error.payload = response;
            settleReject(error);
            return;
          }
          settleResolve(response);
        });
      };

      function onConnect() {
        detachConnectionListeners();
        send();
      }

      function onConnectError(error) {
        settleReject(new Error(error?.message || "connect_error"));
      }

      if (socket.connected) {
        send();
        return;
      }

      socket.once?.("connect", onConnect);
      socket.once?.("connect_error", onConnectError);
      try {
        const connectionAttempt = transportConfig.ensureConnection?.();
        connectionAttempt?.catch?.(onConnectError);
      } catch (error) {
        onConnectError(error);
      }
    });
  }

  feature = createStateFeature(context, createInitialDailyState, {
    start: ({ scope, store }) => {
      active = true;
      scope.add(() => {
        active = false;
        cancelHttpRequests();
        cancelPendingAckRequests();
        transportConfig = {};
        store.patch(createInitialDailyState());
      });
    },
  });

  return Object.freeze({
    ...feature,
    cancelHttpRequests,
    configureTransport,
    emitSocketAck,
    fetchDailyBoard,
    fetchDailyHistory,
    fetchDailyStatus,
  });
}
