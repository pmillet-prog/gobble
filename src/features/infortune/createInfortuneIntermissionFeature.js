import { createFeatureStore } from "../../app/core/createFeatureStore.js";
import { INFORTUNE_LAUNCH_WINDOW_MS, INFORTUNE_WINDOW_MS } from "../../../shared/infortuneIntermission.js";
import { selectInfortunePlateau } from "../../../shared/infortunePlateaus.js";
import { createInfortuneRequests } from "./createInfortuneRequests.js";

const initial = () => ({ key: null, sessionId: null, visible: false, stage: "idle", roomId: null, roundId: null,
  result: null, launchUntil: null, plateau: null, plateauStatus: null, economy: null, economyError: null });
const sameRound = (a, b) => a?.roundId != null && String(a.roundId) === String(b?.roundId)
  && String(a.roomId) === String(b?.roomId);

// Owns the gate between a completed round and its results. No scoring rules or
// wheel frames enter application state. Both the presentation and payload must
// finish before releasing the existing results pipeline.
export function createInfortuneIntermissionFeature({ getKernel, scope, ports }, { timers = globalThis, now = Date.now, readIdentity } = {}) {
  const store = createFeatureStore(initial());
  let resolve = null, pending = null, payload = null, wheelDone = false, launched = false;
  let launchTimer = null, finishTimer = null, settleTimer = null, completed = null;
  let gameplay = null;
  let generation = 0;
  let seating = null, clockOffset = 0;
  let presentationDone = false, spinRequested = false, chosenTarget;
  const requests = createInfortuneRequests({ realtime: ports?.realtime, timers, receive: receiveEconomy,
    onError: economyError => { if (pending) store.patch({ economyError }); } });
  const session = () => (gameplay || getKernel().features.prepare("gameplaySession")).store.getState();
  const identity = readIdentity || (() => { const state = getKernel().getState().session;
    return { userId: state.authState?.user?.id, nick: state.nickname }; });
  function clearTimers() {
    if (launchTimer !== null) timers.clearTimeout(launchTimer);
    if (finishTimer !== null) timers.clearTimeout(finishTimer);
    if (settleTimer !== null) timers.clearTimeout(settleTimer);
    launchTimer = finishTimer = settleTimer = null;
  }
  function finish(cancelled = false) {
    clearTimers();
    requests.reset(); presentationDone = spinRequested = false; chosenTarget = undefined;
    const done = resolve, state = store.getState();
    if (!cancelled) completed = { roomId: state.roomId, roundId: state.roundId };
    const result = { cancelled, payload, wheelResult: state.result };
    resolve = pending = payload = null; wheelDone = launched = false;
    seating = null;
    store.replace(initial()); done?.(result);
  }
  function releaseIfReady() {
    if (wheelDone && payload) finish();
    else if (wheelDone) store.patch({ stage: "waiting" });
  }
  function complete(result = null, key = store.getState().key) {
    if (!pending || wheelDone || key !== store.getState().key) return;
    presentationDone = true;
    if (result) store.patch({ result });
    if (store.getState().economy && store.getState().plateau) { recordResult(result, key); advanceEconomy(); return; }
    wheelDone = true; clearTimers(); store.patch({ result }); releaseIfReady();
  }
  function command(action, done) {
    const { roomId, roundId } = store.getState(); requests.send({ roomId, roundId, ...action }, done);
  }
  function recordResult(result, key = store.getState().key) {
    const state = store.getState();
    if (!pending || key !== state.key || !state.economy || spinRequested) return;
    if (state.economy.members[state.plateau?.self.id]?.spin !== "pending") return;
    spinRequested = true;
    if (result) store.patch({ result });
    command(result ? { type: "spin", index: result.index, quality: result.launchQuality?.kind }
      : { type: "spin", skip: true }, advanceEconomy);
  }
  function advanceEconomy() {
    const state = store.getState(), economy = state.economy;
    if (!pending || !presentationDone || wheelDone || !economy || !state.plateau) return;
    const self = economy.members[state.plateau?.self.id];
    if (self?.spin === "pending") { store.patch({ stage: "accounting" }); return; }
    if (self?.needsExchange && !self.choiceMade && !economy.resolvedGroups.includes(state.plateau.id)) {
      store.patch({ stage: "exchange" }); return;
    }
    if (economy.exchangeEnabled && !economy.resolvedGroups.includes(state.plateau.id)) {
      store.patch({ stage: "exchange-wait" }); return;
    }
    if (economy.exchangeEnabled && state.plateau.members.some(player => economy.members[player.id]?.target)) {
      if (state.stage !== "settled") {
        store.patch({ stage: "settled" });
        settleTimer = timers.setTimeout(() => { settleTimer = null; wheelDone = true; clearTimers(); releaseIfReady(); }, 1600);
      }
      return;
    }
    wheelDone = true; clearTimers(); releaseIfReady();
  }
  function receiveEconomy(value) {
    if (!pending || !sameRound(store.getState(), value) || !value?.economy) return;
    const current = store.getState().economy;
    if (current && value.economy.revision < current.revision) return;
    store.patch({ economy: value.economy }); advanceEconomy();
  }
  function chooseExchange(target, key = store.getState().key) {
    const state = store.getState();
    if (!pending || key !== state.key || state.stage !== "exchange") return;
    if (!state.plateau.opponents.some(player => player.id === target)) return;
    chosenTarget = target;
    command({ type: "exchange", target }, advanceEconomy);
  }
  function expire(key) {
    if (!pending || key !== store.getState().key) return;
    // The server independently closes outstanding choices at its deadline.
    wheelDone = true; clearTimers(); releaseIfReady();
  }
  function receive(value) {
    receivePlateau(value);
    if (!pending || !sameRound(store.getState(), value) || !Array.isArray(value.results)) return;
    payload = value; releaseIfReady();
  }
  function armTimers(openedAt, nowServerMs, waitingForPlateau = false) {
    clearTimers();
    const state = store.getState(), policy = session().infortune, key = state.key;
    const launchUntil = openedAt + (policy.launchWindowMs || INFORTUNE_LAUNCH_WINDOW_MS);
    store.patch({ launchUntil: waitingForPlateau ? null : launchUntil });
    if (!waitingForPlateau && !launched) launchTimer = timers.setTimeout(() => complete(null, key), Math.max(0, launchUntil - nowServerMs));
    finishTimer = timers.setTimeout(() => expire(key), Math.max(0, openedAt + (policy.windowMs || INFORTUNE_WINDOW_MS) - nowServerMs));
  }
  function receivePlateau(value) {
    if (!value?.infortune?.enabled || !Array.isArray(value.infortune.groups) || !sameRound(session(), value)
      || !eligible(value.roundId)) return;
    seating ||= value;
    receiveEconomy({ ...value, economy: value.infortune.economy });
    const state = store.getState();
    if (!pending || wheelDone || state.plateauStatus === "assigned" || state.plateauStatus === "absent") return;
    const plateau = selectInfortunePlateau(seating.infortune.groups, identity());
    store.patch({ plateau, plateauStatus: plateau ? "assigned" : "absent", stage: plateau ? "wheel" : "waiting" });
    if (!plateau) { complete(); return; }
    armTimers(seating.infortune.openedAt ?? session().endsAt, now() + clockOffset);
    if (seating.infortune.economy) {
      receiveEconomy({ ...seating, economy: seating.infortune.economy });
      const self = store.getState().economy?.members[plateau.self.id];
      if (self && self.spin !== "pending") { presentationDone = true; advanceEconomy(); }
      if (pending) command({ type: "snapshot" });
    }
  }
  function eligible(roundId) {
    const current = session();
    return current.origin === "live" && current.infortune?.enabled
      && String(current.roundId) === String(roundId) && !sameRound(current, completed);
  }
  function begin(roundId, value, nowServerMs) {
    if (!eligible(roundId)) return null;
    if (pending) { const promise = pending; receive(value); return { started: false, promise }; }
    const current = session(), policy = current.infortune;
    clockOffset = nowServerMs - now();
    const openedAt = value?.infortune?.openedAt ?? current.endsAt ?? nowServerMs;
    pending = new Promise(done => { resolve = done; });
    const promise = pending;
    const key = ++generation;
    store.replace({ ...initial(), key, sessionId: current.sessionId, visible: true,
      stage: policy.plateauVersion ? "seating" : "wheel", plateauStatus: policy.plateauVersion ? "waiting" : null,
      roomId: current.roomId, roundId });
    armTimers(openedAt, nowServerMs, !!policy.plateauVersion);
    receivePlateau(seating || { roomId: current.roomId, roundId, infortune: policy });
    receive(value);
    return { started: true, promise };
  }
  return { store, begin, receive, receivePlateau, complete, eligible, recordResult, chooseExchange,
    retry() {
      if (chosenTarget !== undefined) chooseExchange(chosenTarget);
      else { spinRequested = false; recordResult(store.getState().result); }
    },
    launched(key = store.getState().key) {
      if (!pending || key !== store.getState().key) return;
      launched = true; if (launchTimer !== null) timers.clearTimeout(launchTimer); launchTimer = null;
    },
    start() {
      const lease = getKernel().features.acquire("gameplaySession");
      gameplay = lease.feature;
      scope.add(lease.release);
      scope.add(ports?.realtime?.bind?.({ infortunePlateau: receivePlateau, infortuneEconomy: receiveEconomy, roundEnded: receive,
        connect() { if (pending && store.getState().economy) command({ type: "snapshot" }); } }));
      scope.add(lease.feature.store.subscribe(() => {
        if (pending && (!sameRound(session(), store.getState()) || session().sessionId !== store.getState().sessionId)) finish(true);
        if (seating && !sameRound(session(), seating)) seating = null;
      }));
      scope.add(() => finish(true));
    },
  };
}
