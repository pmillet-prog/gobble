import { createFeatureStore } from "../../app/core/createFeatureStore.js";

const PROPOSAL_SYNC_DELAY_MS = 350;
const EMPTY_LATEST_PROPOSAL = Object.freeze({
  roundId: null,
  word: "",
  path: [],
});

export function createInitialOcidState() {
  return {
    mobileResultDismissedKey: "",
    proposal: "",
    proposalPath: [],
    proposalSubmitted: "",
    selectedOptionId: "",
    statusMessage: "",
    vote: null,
  };
}

export function createOcidFeature(
  { scope },
  {
    clearTimeoutFn = clearTimeout,
    documentTarget = globalThis.document,
    setTimeoutFn = setTimeout,
    windowTarget = globalThis.window,
  } = {}
) {
  const store = createFeatureStore(createInitialOcidState());
  const refs = Object.freeze({
    latestProposal: { current: EMPTY_LATEST_PROPOSAL },
  });
  let active = false;
  let config = {};
  let draftSyncTimerId = null;
  let suspendListenersAttached = false;

  function clearDraftSyncTimer() {
    if (draftSyncTimerId != null) clearTimeoutFn(draftSyncTimerId);
    draftSyncTimerId = null;
  }

  function isProposalOpen() {
    return !!config.isOcidRound && !!config.roundId && !store.getState().vote;
  }

  function clearProposalServer() {
    if (!config.socket?.connected || !isProposalOpen()) return false;
    config.socket.emit("ocid:clearProposal", { roundId: config.roundId }, () => {});
    return true;
  }

  function syncProposal({ manual = false } = {}) {
    if (!config.socket?.connected || !isProposalOpen()) return false;
    const state = store.getState();
    const word = String(state.proposal || "").trim();
    if (!word) {
      refs.latestProposal.current = EMPTY_LATEST_PROPOSAL;
      config.socket.emit("ocid:clearProposal", { roundId: config.roundId }, () => {});
      store.patch({
        ...(manual ? { statusMessage: "Trace un mot sur la grille." } : {}),
        proposalSubmitted: "",
      });
      return true;
    }
    const roundId = config.roundId;
    const path = Array.isArray(state.proposalPath) ? state.proposalPath : [];
    refs.latestProposal.current = { roundId, word, path };
    config.socket.emit("ocid:propose", { roundId, word, path }, (response) => {
      if (response?.ok) {
        const accepted = String(response?.proposal || word).trim();
        store.patch({
          proposalSubmitted: accepted,
          statusMessage: manual
            ? `Proposition retenue : ${accepted}`
            : "Proposition retenue.",
        });
        return;
      }
      store.patch({
        proposalSubmitted: "",
        statusMessage:
          response?.error === "proposal_closed"
            ? "Les propositions sont fermées."
            : response?.error === "not_traceable"
              ? "Ce mot n'est pas traçable sur la grille."
              : "Proposition refusée.",
      });
    });
    return true;
  }

  function scheduleDraftSync() {
    clearDraftSyncTimer();
    if (!active || config.phase !== "playing" || !isProposalOpen()) return;
    draftSyncTimerId = setTimeoutFn(() => {
      draftSyncTimerId = null;
      syncProposal({ manual: false });
    }, PROPOSAL_SYNC_DELAY_MS);
  }

  function flushProposalBeforeSuspend() {
    if (config.phase !== "playing" || !config.socket?.connected) return false;
    const draft = refs.latestProposal.current || EMPTY_LATEST_PROPOSAL;
    const word = String(draft.word || "").trim();
    if (!word || draft.roundId !== config.roundId) return false;
    clearDraftSyncTimer();
    config.socket.emit(
      "ocid:propose",
      {
        roundId: config.roundId,
        word,
        path: Array.isArray(draft.path) ? draft.path : [],
      },
      () => {}
    );
    return true;
  }

  function onVisibilityChange() {
    if (documentTarget?.visibilityState === "hidden") {
      flushProposalBeforeSuspend();
    }
  }

  function attachSuspendListeners() {
    if (suspendListenersAttached || !windowTarget || !documentTarget) return;
    suspendListenersAttached = true;
    documentTarget.addEventListener?.("visibilitychange", onVisibilityChange);
    windowTarget.addEventListener?.("pagehide", flushProposalBeforeSuspend);
  }

  function detachSuspendListeners() {
    if (!suspendListenersAttached) return;
    suspendListenersAttached = false;
    documentTarget?.removeEventListener?.("visibilitychange", onVisibilityChange);
    windowTarget?.removeEventListener?.("pagehide", flushProposalBeforeSuspend);
  }

  function reconcileSuspendListeners() {
    if (active && isProposalOpen()) attachSuspendListeners();
    else detachSuspendListeners();
  }

  function configureRound(nextConfig = {}) {
    config = { ...config, ...nextConfig };
    scheduleDraftSync();
    reconcileSuspendListeners();
  }

  function updateProposal(value) {
    store.patch({
      proposal: value,
      proposalPath: [],
      proposalSubmitted: "",
    });
  }

  function clearProposal() {
    refs.latestProposal.current = EMPTY_LATEST_PROPOSAL;
    store.patch({
      proposal: "",
      proposalPath: [],
      proposalSubmitted: "",
      statusMessage: "",
    });
    clearProposalServer();
  }

  function submitVote(optionId) {
    if (!config.socket?.connected || !config.roundId || !config.isOcidRound || !optionId) {
      return false;
    }
    config.socket.emit(
      "ocid:vote",
      { roundId: config.roundId, optionId },
      (response) => {
        store.patch(
          response?.ok
            ? {
                selectedOptionId: optionId,
                statusMessage: "Vote enregistre.",
              }
            : {
                statusMessage:
                  response?.error === "vote_closed"
                    ? "Le vote est termine."
                    : "Vote refuse.",
              }
        );
      }
    );
    return true;
  }

  function start() {
    active = true;
    let observedState = store.getState();
    const unsubscribe = store.subscribe(() => {
      const nextState = store.getState();
      const draftChanged =
        nextState.proposal !== observedState.proposal ||
        nextState.proposalPath !== observedState.proposalPath ||
        nextState.vote !== observedState.vote;
      const voteChanged = nextState.vote !== observedState.vote;
      observedState = nextState;
      if (draftChanged) scheduleDraftSync();
      if (voteChanged) reconcileSuspendListeners();
    });
    scheduleDraftSync();
    reconcileSuspendListeners();
    scope.add(() => {
      active = false;
      unsubscribe();
      clearDraftSyncTimer();
      detachSuspendListeners();
      config = {};
      refs.latestProposal.current = EMPTY_LATEST_PROPOSAL;
    });
  }

  return Object.freeze({
    clearProposal,
    clearProposalServer,
    configureRound,
    flushProposalBeforeSuspend,
    patch: store.patch,
    refs,
    set: store.set,
    start,
    store,
    submitProposal: () => syncProposal({ manual: true }),
    submitVote,
    syncProposal,
    updateProposal,
  });
}
