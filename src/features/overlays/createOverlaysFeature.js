import { createStateFeature } from "../../app/core/createStateFeature.js";
import { createEmptyAuthForm } from "../../components/auth/authFormModel.js";

export function createInitialOverlaysState() {
  return {
    aboutOpen: false,
    accountMenuOpen: false,
    accountNotice: "",
    authError: "",
    authForm: createEmptyAuthForm(),
    authInfo: "",
    authModalMode: null,
    authSubmitting: false,
    broadcastNotice: {
      error: "",
      loading: false,
      message: null,
    },
    definitionModal: {
      definitions: [],
      definition: "",
      etymology: "",
      fromVault: false,
      fromWordInfo: false,
      inflectionBase: "",
      inflectionGuess: false,
      inflectionLabel: "",
      lemma: "",
      lemmaGuess: false,
      lemmaLabel: "",
      loading: false,
      matchedTitle: "",
      ok: false,
      open: false,
      participleBase: "",
      participleGuess: false,
      participleLabel: "",
      phraseGuess: false,
      preferLongDefinition: false,
      source: "",
      title: "",
      url: "",
      word: "",
    },
    facebookInviteOpen: false,
    helpOpen: false,
    keyboardMenuOpen: false,
    mobileExitConfirmOpen: false,
    patchNotesOpen: false,
    playerProfileModal: {
      error: "",
      loading: false,
      open: false,
      profile: null,
      userId: null,
      nick: "",
    },
    playersOverlayMode: "snapshot",
    playersOverlayOpen: false,
    playersOverlaySnapshot: [],
    recordModal: {
      categoryKey: "",
      categoryLabel: "",
      nick: "",
      open: false,
      pts: null,
      rank: null,
      rankTotal: null,
      records: [],
      timeMs: null,
      word: "",
      wordsCount: null,
    },
    roundPlayerModal: {
      allWords: [],
      anchorRect: null,
      nick: "",
      open: false,
      records: [],
      targetBoardEntries: [],
      targetBoardKey: "",
      targetBoardLabel: "",
      words: [],
    },
    settingsOpen: false,
    soundMenuOpen: false,
    supportModalSection: "support",
    supportOpen: false,
    trainingConfirm: null,
    trainingBusy: false,
    visualMenuOpen: false,
    vaultWordOfDayPopup: {
      dateId: "",
      definition: "",
      displayWord: "",
      open: false,
      source: "",
      url: "",
      word: "",
    },
    wordInfoModal: {
      foundBy: [],
      open: false,
      word: "",
    },
  };
}

const CANCELLED_PROFILE_REQUEST = Symbol("cancelled_player_profile_request");
const CANCELLED_BROADCAST_REQUEST = Symbol("cancelled_broadcast_request");

export function createOverlaysFeature(
  context,
  {
    abortControllerFactory = () => new AbortController(),
    fetchImpl = (...args) => globalThis.fetch(...args),
  } = {}
) {
  let active = false;
  let broadcastRequest = null;
  let feature = null;
  let profileRequest = null;

  function cancelBroadcastRequest(request = broadcastRequest) {
    if (!request || request.cancelled) return;
    request.cancelled = true;
    if (broadcastRequest === request) broadcastRequest = null;
    try {
      request.controller?.abort?.();
    } catch (_) {}
    request.cancelResolve(CANCELLED_BROADCAST_REQUEST);
  }

  function fetchBroadcastNotice({ force = false } = {}) {
    if (!active) return null;
    if (broadcastRequest && !force) return broadcastRequest.promise;
    cancelBroadcastRequest();
    const controller = abortControllerFactory();
    let cancelResolve;
    const request = {
      cancelled: false,
      cancelPromise: new Promise((resolve) => {
        cancelResolve = resolve;
      }),
      cancelResolve: null,
      controller,
      promise: null,
    };
    request.cancelResolve = cancelResolve;
    broadcastRequest = request;
    feature.set("broadcastNotice", (previous) => ({
      ...previous,
      loading: true,
      error: "",
    }));

    request.promise = (async () => {
      try {
        const response = await Promise.race([
          fetchImpl("/api/broadcast/current", {
            cache: "no-store",
            headers: { Accept: "application/json" },
            signal: controller?.signal,
          }),
          request.cancelPromise,
        ]);
        if (
          response === CANCELLED_BROADCAST_REQUEST ||
          request.cancelled ||
          !active ||
          broadcastRequest !== request
        ) {
          return null;
        }
        const text = await Promise.race([
          response.text(),
          request.cancelPromise,
        ]);
        if (
          text === CANCELLED_BROADCAST_REQUEST ||
          request.cancelled ||
          !active ||
          broadcastRequest !== request
        ) {
          return null;
        }
        let data = null;
        try {
          data = text ? JSON.parse(text) : null;
        } catch (_) {
          throw new Error("bad_json");
        }
        if (!response.ok || data?.ok === false) {
          throw new Error(data?.error || `http_${response.status || "error"}`);
        }
        const message =
          data?.message && typeof data.message === "object" ? data.message : null;
        feature.set("broadcastNotice", {
          loading: false,
          message,
          error: "",
        });
        return message;
      } catch (error) {
        if (
          error?.name === "AbortError" ||
          request.cancelled ||
          !active ||
          broadcastRequest !== request
        ) {
          return null;
        }
        feature.set("broadcastNotice", (previous) => ({
          ...previous,
          loading: false,
          error: "erreur",
        }));
        return null;
      } finally {
        if (broadcastRequest === request) broadcastRequest = null;
      }
    })();
    return request.promise;
  }

  function cancelPlayerProfileRequest(request = profileRequest) {
    if (!request || request.cancelled) return;
    request.cancelled = true;
    if (profileRequest === request) profileRequest = null;
    try {
      request.controller?.abort?.();
    } catch (_) {}
    request.cancelResolve(CANCELLED_PROFILE_REQUEST);
  }

  function closePlayerProfile() {
    cancelPlayerProfileRequest();
    if (!active) return;
    feature.set("playerProfileModal", (previous) => ({
      ...previous,
      open: false,
      loading: false,
      error: "",
    }));
  }

  function openPlayerProfile({ nick = "", userId = null } = {}) {
    if (!active || !userId) return null;
    cancelPlayerProfileRequest();
    const targetNick = String(nick || "").trim();
    const controller = abortControllerFactory();
    let cancelResolve;
    const request = {
      cancelled: false,
      cancelPromise: new Promise((resolve) => {
        cancelResolve = resolve;
      }),
      cancelResolve: null,
      controller,
      promise: null,
    };
    request.cancelResolve = cancelResolve;
    profileRequest = request;
    feature.set("playerProfileModal", {
      open: true,
      userId,
      nick: targetNick,
      loading: true,
      error: "",
      profile: null,
    });

    const query = targetNick ? `?nick=${encodeURIComponent(targetNick)}` : "";
    request.promise = (async () => {
      try {
        const response = await Promise.race([
          fetchImpl(
            `/api/player-profile/user/${encodeURIComponent(userId)}${query}`,
            {
              cache: "no-store",
              headers: { Accept: "application/json" },
              signal: controller?.signal,
            }
          ),
          request.cancelPromise,
        ]);
        if (
          response === CANCELLED_PROFILE_REQUEST ||
          request.cancelled ||
          !active ||
          profileRequest !== request
        ) {
          return null;
        }
        const data = await Promise.race([
          response.json().catch(() => null),
          request.cancelPromise,
        ]);
        if (
          data === CANCELLED_PROFILE_REQUEST ||
          request.cancelled ||
          !active ||
          profileRequest !== request
        ) {
          return null;
        }
        if (!response.ok || !data?.ok || !data?.profile) {
          throw new Error(data?.error || `http_${response.status || "error"}`);
        }
        feature.set("playerProfileModal", {
          open: true,
          userId,
          nick: targetNick,
          loading: false,
          error: "",
          profile: data.profile,
        });
        return data.profile;
      } catch (error) {
        if (
          error?.name === "AbortError" ||
          request.cancelled ||
          !active ||
          profileRequest !== request
        ) {
          return null;
        }
        feature.set("playerProfileModal", (previous) => ({
          ...previous,
          open: true,
          loading: false,
          error: "Profil indisponible",
        }));
        return null;
      } finally {
        if (profileRequest === request) profileRequest = null;
      }
    })();
    return request.promise;
  }

  feature = createStateFeature(context, createInitialOverlaysState, {
    start: ({ scope, store }) => {
      active = true;
      scope.add(() => {
        active = false;
        cancelBroadcastRequest();
        cancelPlayerProfileRequest();
        store.patch(createInitialOverlaysState());
      });
    },
  });

  return Object.freeze({
    ...feature,
    cancelBroadcastRequest,
    cancelPlayerProfileRequest,
    closePlayerProfile,
    fetchBroadcastNotice,
    openPlayerProfile,
  });
}
