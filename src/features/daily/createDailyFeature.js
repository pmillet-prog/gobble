import { createStateFeature } from "../../app/core/createStateFeature.js";
import { DAILY_SPECIAL_MODE } from "../../components/daily/dailyModes.js";
import {
  createDailySpecialPlacements,
  createDailyWordSlots,
} from "../../components/daily/dailySpecialModel.js";

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
  { clearTimeoutFn = clearTimeout, setTimeoutFn = setTimeout } = {}
) {
  let active = false;
  let transportConfig = {};
  const pendingAckRequests = new Set();

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

  const feature = createStateFeature(context, createInitialDailyState, {
    start: ({ scope }) => {
      active = true;
      scope.add(() => {
        active = false;
        cancelPendingAckRequests();
        transportConfig = {};
      });
    },
  });

  return Object.freeze({
    ...feature,
    configureTransport,
    emitSocketAck,
  });
}
