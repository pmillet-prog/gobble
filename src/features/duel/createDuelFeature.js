import { createStateFeature } from "../../app/core/createStateFeature.js";

export function createInitialDuelState() {
  return {
    consumedValidatedByView: {
      page: { dateId: "", keys: [] },
      popup: { dateId: "", keys: [] },
    },
    objectivesPopupDismissedDateId: "",
    popup: { mode: null, step: 0, team: null, weekId: null },
    rerollBusyBucket: null,
    resultsTeamDelta: { blue: 0, red: 0 },
    status: {
      crowned: false,
      dailyBattle: null,
      dateId: null,
      error: "",
      lastWeekSummary: null,
      loading: false,
      objectives: null,
      team: null,
      tutorialVersion: null,
      weekId: null,
      weekly: null,
    },
    weekRecapOpen: false,
    weekRecapPage: 0,
    weekRecapPreviewMode: false,
  };
}

const CANCELLED_REQUEST = Symbol("cancelled_duel_status_request");

export function createDuelFeature(
  context,
  {
    abortControllerFactory = () =>
      typeof AbortController === "undefined" ? null : new AbortController(),
    clearTimeoutFn = clearTimeout,
    fetchImpl = (...args) => globalThis.fetch(...args),
    now = Date.now,
    setTimeoutFn = setTimeout,
    warn = (...args) => console.warn(...args),
  } = {}
) {
  let active = false;
  let currentRerollRequest = null;
  let currentStatusRequest = null;
  let feature = null;

  function clearRequestResources(request) {
    if (!request) return;
    if (request.timeoutId != null) {
      clearTimeoutFn(request.timeoutId);
      request.timeoutId = null;
    }
    if (request.retryTimerId != null) {
      clearTimeoutFn(request.retryTimerId);
      request.retryTimerId = null;
    }
    request.controller = null;
  }

  function cancelStatusRequest(request = currentStatusRequest) {
    if (!request || request.cancelled) return;
    request.cancelled = true;
    if (currentStatusRequest === request) currentStatusRequest = null;
    try {
      request.controller?.abort?.();
    } catch (_) {}
    clearRequestResources(request);
    request.cancelResolve(CANCELLED_REQUEST);
  }

  function cancelRerollRequest(request = currentRerollRequest) {
    if (!request || request.cancelled) return;
    request.cancelled = true;
    if (currentRerollRequest === request) currentRerollRequest = null;
    try {
      request.controller?.abort?.();
    } catch (_) {}
    request.controller = null;
    request.cancelResolve(CANCELLED_REQUEST);
  }

  function invokeCallback(callback, ...args) {
    try {
      callback?.(...args);
    } catch (_) {}
  }

  async function waitForRetry(request, delayMs) {
    if (request.cancelled) return CANCELLED_REQUEST;
    const delay = new Promise((resolve) => {
      request.retryTimerId = setTimeoutFn(() => {
        request.retryTimerId = null;
        resolve(null);
      }, delayMs);
    });
    const result = await Promise.race([delay, request.cancelPromise]);
    if (request.retryTimerId != null) {
      clearTimeoutFn(request.retryTimerId);
      request.retryTimerId = null;
    }
    return result;
  }

  async function fetchStatusData(request, config) {
    const params = new URLSearchParams();
    params.set("installId", config.installId);
    if (config.dateId) params.set("dateId", config.dateId);
    let errorCode = "erreur";

    for (let attempt = 0; attempt < 2; attempt += 1) {
      if (request.cancelled) return CANCELLED_REQUEST;
      const query = new URLSearchParams(params);
      if (attempt > 0) query.set("r", String(now()));
      const controller = abortControllerFactory();
      request.controller = controller;
      request.timeoutId = controller
        ? setTimeoutFn(() => controller.abort?.(), 12000)
        : null;
      let response;
      try {
        response = await Promise.race([
          fetchImpl(`/api/duel/status?${query.toString()}`, {
            cache: "no-store",
            credentials: "include",
            signal: controller?.signal,
            headers: {
              Accept: "application/json",
              "Cache-Control": "no-store, no-cache, max-age=0",
              Pragma: "no-cache",
            },
          }),
          request.cancelPromise,
        ]);
      } finally {
        if (request.timeoutId != null) {
          clearTimeoutFn(request.timeoutId);
          request.timeoutId = null;
        }
        if (request.controller === controller) request.controller = null;
      }
      if (response === CANCELLED_REQUEST || request.cancelled) {
        return CANCELLED_REQUEST;
      }
      const parsed = await Promise.race([
        config.readJsonResponse(response),
        request.cancelPromise,
      ]);
      if (parsed === CANCELLED_REQUEST || request.cancelled) {
        return CANCELLED_REQUEST;
      }
      if (!response.ok) {
        errorCode = String(
          parsed?.data?.error || `http_${response.status || "error"}`
        );
      } else if (
        !parsed?.parseOk ||
        !parsed.data ||
        typeof parsed.data !== "object"
      ) {
        errorCode = parsed?.isLikelyHtml ? "bad_payload_html" : "bad_payload";
      } else {
        return parsed.data;
      }
      if (attempt === 0) {
        const retryResult = await waitForRetry(request, 120);
        if (retryResult === CANCELLED_REQUEST) return CANCELLED_REQUEST;
        continue;
      }
      throw new Error(errorCode);
    }
    throw new Error(errorCode);
  }

  function applyStatus(data) {
    feature.set("status", {
      loading: false,
      error: "",
      dateId: data?.dateId || null,
      weekId: data?.weekId || null,
      team: data?.team || null,
      crowned: !!data?.crowned,
      weekly: data?.weekly || null,
      lastWeekSummary: data?.lastWeekSummary || null,
      objectives: data?.objectives || null,
      dailyBattle: data?.dailyBattle || null,
      tutorialVersion: data?.tutorialVersion || null,
    });
  }

  function rerollObjective({
    bucket = "",
    installId = "",
    onError = null,
    onSettled = null,
    onSuccess = null,
  } = {}) {
    const safeBucket = String(bucket || "");
    const safeInstallId = String(installId || "");
    if (!active || !safeBucket || !safeInstallId) return null;
    if (currentRerollRequest) return currentRerollRequest.promise;

    const controller = abortControllerFactory();
    let cancelResolve;
    const request = {
      bucket: safeBucket,
      cancelled: false,
      cancelPromise: new Promise((resolve) => {
        cancelResolve = resolve;
      }),
      cancelResolve: null,
      controller,
      promise: null,
    };
    request.cancelResolve = cancelResolve;
    currentRerollRequest = request;
    feature.set("rerollBusyBucket", safeBucket);

    request.promise = (async () => {
      try {
        const response = await Promise.race([
          fetchImpl("/api/duel/objectives/reroll", {
            method: "POST",
            credentials: "include",
            headers: {
              "Content-Type": "application/json",
              Accept: "application/json",
            },
            body: JSON.stringify({ installId: safeInstallId, bucket: safeBucket }),
            signal: controller?.signal,
          }),
          request.cancelPromise,
        ]);
        if (
          response === CANCELLED_REQUEST ||
          request.cancelled ||
          !active ||
          currentRerollRequest !== request
        ) {
          return null;
        }
        const text = await Promise.race([
          response.text(),
          request.cancelPromise,
        ]);
        if (
          text === CANCELLED_REQUEST ||
          request.cancelled ||
          !active ||
          currentRerollRequest !== request
        ) {
          return null;
        }
        const data = text ? JSON.parse(text) : null;
        if (!response.ok || !data?.ok) {
          throw new Error(data?.error || "reroll_error");
        }
        feature.set("status", (previous) => ({
          ...previous,
          objectives: {
            ...(previous?.objectives || {}),
            dateId: data?.dateId || previous?.objectives?.dateId || null,
            rerollUsed: !!data?.rerollUsed,
            objectives: Array.isArray(data?.objectives)
              ? data.objectives
              : previous?.objectives?.objectives || [],
          },
        }));
        invokeCallback(onSuccess, data);
        return data;
      } catch (error) {
        if (
          error?.name === "AbortError" ||
          request.cancelled ||
          !active ||
          currentRerollRequest !== request
        ) {
          return null;
        }
        invokeCallback(onError, String(error?.message || "reroll_error"));
        return null;
      } finally {
        if (currentRerollRequest === request) {
          currentRerollRequest = null;
          request.controller = null;
          if (active) {
            feature.set("rerollBusyBucket", null);
            invokeCallback(onSettled);
          }
        }
      }
    })();
    return request.promise;
  }

  function fetchStatus({
    dateId = null,
    force = false,
    installId = "",
    isAuthenticated = false,
    onAuthRequired = null,
    onSuccess = null,
    readJsonResponse,
    refreshAuthStatus = null,
    retryAuth = true,
  } = {}) {
    const safeInstallId = String(installId || "");
    if (!active || !safeInstallId) return null;
    if (!isAuthenticated) {
      feature.set("status", (previous) => ({
        ...previous,
        loading: false,
        error: "",
      }));
      return null;
    }
    if (typeof readJsonResponse !== "function") {
      return Promise.reject(new Error("read_json_response_required"));
    }
    const requestKey = `${safeInstallId}|${dateId || ""}`;
    if (
      currentStatusRequest?.key === requestKey &&
      !force
    ) {
      return currentStatusRequest.promise;
    }
    if (currentStatusRequest) cancelStatusRequest(currentStatusRequest);

    let cancelResolve;
    const request = {
      cancelPromise: new Promise((resolve) => {
        cancelResolve = resolve;
      }),
      cancelResolve: null,
      cancelled: false,
      controller: null,
      key: requestKey,
      promise: null,
      retryTimerId: null,
      timeoutId: null,
    };
    request.cancelResolve = cancelResolve;
    currentStatusRequest = request;
    feature.set("status", (previous) => ({
      ...previous,
      loading: true,
      error: "",
    }));

    const config = {
      dateId,
      installId: safeInstallId,
      readJsonResponse,
    };
    request.promise = (async () => {
      let canRetryAuth = retryAuth;
      while (!request.cancelled) {
        try {
          const data = await fetchStatusData(request, config);
          if (
            data === CANCELLED_REQUEST ||
            request.cancelled ||
            !active ||
            currentStatusRequest !== request
          ) {
            return null;
          }
          applyStatus(data);
          try {
            onSuccess?.(data);
          } catch (_) {}
          return data;
        } catch (error) {
          if (
            request.cancelled ||
            !active ||
            currentStatusRequest !== request
          ) {
            return null;
          }
          const code = String(error?.message || "erreur");
          warn("[duel/status] fetch failed", {
            code,
            installId: safeInstallId,
            dateId: dateId || null,
          });
          if (code === "auth_required" && canRetryAuth) {
            canRetryAuth = false;
            let refreshed = null;
            try {
              refreshed = await Promise.race([
                Promise.resolve(refreshAuthStatus?.({ silent: true })),
                request.cancelPromise,
              ]);
            } catch (_) {
              refreshed = null;
            }
            if (
              refreshed === CANCELLED_REQUEST ||
              request.cancelled ||
              currentStatusRequest !== request
            ) {
              return null;
            }
            if (refreshed?.status === "authenticated" && refreshed?.user) {
              continue;
            }
          }
          feature.set("status", (previous) => ({
            ...previous,
            loading: false,
            error: code,
          }));
          if (code === "auth_required") {
            try {
              onAuthRequired?.();
            } catch (_) {}
          }
          return null;
        }
      }
      return null;
    })().finally(() => {
      clearRequestResources(request);
      if (currentStatusRequest === request) currentStatusRequest = null;
    });
    return request.promise;
  }

  feature = createStateFeature(context, createInitialDuelState, {
    start: ({ scope, store }) => {
      active = true;
      scope.add(() => {
        active = false;
        cancelRerollRequest();
        cancelStatusRequest();
        store.patch(createInitialDuelState());
      });
    },
  });

  return Object.freeze({
    ...feature,
    cancelRerollRequest,
    cancelStatusRequest,
    fetchStatus,
    rerollObjective,
  });
}
