import { createFeatureStore } from "../../app/core/createFeatureStore.js";
import { INFORTUNE_LAUNCH_WINDOW_MS, INFORTUNE_WINDOW_MS } from "../../../shared/infortuneIntermission.js";
import { selectInfortunePlateau } from "../../../shared/infortunePlateaus.js";
import { createInfortuneRequests } from "./createInfortuneRequests.js";
import { createPlateauExchangeReplay, advancePlateauExchangeReplay } from "./plateauExchangeReplay.js";
import { INFORTUNE_EXCHANGE_STEP_MS } from "../../../shared/infortuneExchangePlan.js";
import { subscribeForegroundClockRefresh } from "../../utils/realtimeClock.js";
import { INFORTUNE_CLIENT_ENABLED } from './infortuneAvailability.js';
import { createWheelLeaderPresentation } from './createWheelLeaderPresentation.js';

const initial = () => ({ key: null, sessionId: null, visible: false, optional: false, entered: false, speaking: false, reminderSpeaking: false, roundNumber: null, stage: "idle", roomId: null, roundId: null,
  result: null, preparation: null, presented: false, gainLanded: false, launchGainLanded: false, closing: null, opensAt: null, nextStartAt: null, launchUntil: null, spinUntil: null, choiceUntil: null, serverOffset: 0, groups: [], plateau: null, plateauStatus: null, economy: null, economyError: null, exchangeReplay: null });
const sameRound = (a, b) => a?.roundId != null && String(a.roundId) === String(b?.roundId)
  && String(a.roomId) === String(b?.roomId);

// Owns the wheel presentation independently from the results pipeline. The
// server announces its opening after the recap and results-reading interval.
export function createInfortuneIntermissionFeature({ getKernel, scope, ports }, { timers = globalThis, now = Date.now, readIdentity,
  documentTarget = globalThis.document, windowTarget = globalThis.window, enabled = INFORTUNE_CLIENT_ENABLED } = {}) {
  const store = createFeatureStore(initial());
  let resolve = null, pending = null, payload = null, wheelDone = false, launched = false;
  let launchTimer = null, finishTimer = null, settleTimer = null, completed = null;
  let gameplay = null;
  let generation = 0;
  let seating = null, clockOffset = 0;
  let deadlineAt = null;
  let presentationDone = false, spinRequested = false, chosenTarget;
  let scheduled = null, openingTimer = null, resumeSnapshot, resumeSessionId, activePolicy = null;
  let remindedRound = null;
  const requests = createInfortuneRequests({ realtime: ports?.realtime, timers, receive: receiveEconomy,
    onError: economyError => { if (pending) store.patch({ economyError }); } });
  const leaders = createWheelLeaderPresentation({ timers, now,
    prepare: closing => store.set('closing', closing),
    begin(closing) {
      if (!pending || store.getState().stage === 'leaders') return;
      wheelDone = presentationDone = true; clearTimers();
      store.patch({ stage: 'leaders', visible: true, speaking: false, reminderSpeaking: false, preparation: null, closing, presented: true, gainLanded: true, exchangeReplay: null });
    },
    skip() {
      if (!pending) return;
      wheelDone = presentationDone = true; clearTimers();
      store.patch({ stage: 'waiting', visible: false, closing: null, presented: true, gainLanded: true, exchangeReplay: null });
    } });
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
    leaders.reset();
    timers.clearTimeout(openingTimer); openingTimer = null; scheduled = null;
    clearTimers();
    requests.reset(); presentationDone = spinRequested = false; chosenTarget = undefined;
    const done = resolve, state = store.getState();
    if (!cancelled) completed = { roomId: state.roomId, roundId: state.roundId };
    const result = { cancelled, payload, wheelResult: state.result };
    resolve = pending = payload = null; wheelDone = launched = false;
    seating = activePolicy = null;
    deadlineAt = null;
    store.replace(initial()); done?.(result);
  }
  function releaseIfReady() {
    if (store.getState().stage === 'leaders') return;
    if (wheelDone && activePolicy?.afterResults) store.patch({ stage: "waiting", presented: true });
    else if (wheelDone && payload) finish();
    else if (wheelDone) store.patch({ stage: "waiting" });
  }
  function complete(result = null, key = store.getState().key) {
    if (!pending || wheelDone || key !== store.getState().key) return;
    presentationDone = true;
    store.set("presented", true);
    if (result) store.patch({ result });
    if (store.getState().economy && store.getState().plateau) {
      recordResult(result, key);
      command({ type: "presented" }, advanceEconomy);
      advanceEconomy(); return;
    }
    wheelDone = true; clearTimers(); store.patch({ result }); releaseIfReady();
  }
  function command(action, done) {
    if (!pending) return;
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
        const exchangeReplay = createPlateauExchangeReplay(economy, state.plateau);
        store.patch({ stage: "settled", exchangeReplay });
        playNextExchange(state.key, exchangeReplay ? INFORTUNE_EXCHANGE_STEP_MS : 1600);
      }
      return;
    }
    wheelDone = true; clearTimers(); releaseIfReady();
  }
  function playNextExchange(key, delay) {
    settleTimer = timers.setTimeout(() => {
      settleTimer = null;
      if (!pending || key !== store.getState().key) return;
      const replay = store.getState().exchangeReplay;
      const next = replay && advancePlateauExchangeReplay(replay);
      if (next) { store.patch({ exchangeReplay: next }); playNextExchange(key, INFORTUNE_EXCHANGE_STEP_MS); }
      else { store.patch({ exchangeReplay: null }); wheelDone = true; clearTimers(); releaseIfReady(); }
    }, delay);
  }
  function receiveEconomy(value) {
    if (!pending || !sameRound(store.getState(), value) || !value?.economy) return;
    const current = store.getState().economy;
    if (current && value.economy.revision < current.revision) return;
    const selfId = store.getState().plateau?.self.id;
    const economy = { ...value.economy, members: { ...value.economy.members } };
    if (selfId && economy.members[selfId] && current?.members[selfId]?.bank != null && economy.members[selfId].bank == null)
      economy.members[selfId] = { ...economy.members[selfId], bank: current.members[selfId].bank };
    if (selfId && economy.members[selfId] && current?.members[selfId]?.result && !economy.members[selfId].result)
      economy.members[selfId] = { ...economy.members[selfId], result: current.members[selfId].result };
    for (const field of ['launchBank', 'launchBonus']) {
      if (selfId && economy.members[selfId] && current?.members[selfId]?.[field] != null && economy.members[selfId][field] == null)
        economy.members[selfId] = { ...economy.members[selfId], [field]: current.members[selfId][field] };
    }
    const launchUntil = economy.members[selfId]?.launchUntil;
    const ownResult = economy.members[selfId]?.result;
    if (ownResult?.automatic) {
      presentationDone = true;
      store.patch({ result: ownResult, presented: true, gainLanded: true, launchGainLanded: true });
    }
    if ((presentationDone || wheelDone) && ownResult && !store.getState().result) store.set("result", ownResult);
    const choiceDeadline = selfId ? economy.members[selfId]?.choiceUntil : economy.choiceUntil;
    store.patch({ economy, serverOffset: clockOffset, launchUntil: !launched && launchUntil ? launchUntil - clockOffset : null,
      spinUntil: economy.spinDeadlineAt ? economy.spinDeadlineAt - clockOffset : null,
      choiceUntil: choiceDeadline ? choiceDeadline - clockOffset : null }); advanceEconomy();
    // Broadcasts intentionally omit private results; fetch our committed draw
    // when a suspended browser missed the acknowledgement.
    if (selfId && economy.members[selfId]?.spin === 'done' && !ownResult && !store.getState().result) command({ type: 'snapshot' });
  }
  function chooseExchange(target, key = store.getState().key) {
    const state = store.getState();
    if (!pending || key !== state.key || state.stage !== "exchange") return;
    if (target !== null && !state.plateau.opponents.some(player => player.id === target)) return;
    chosenTarget = target;
    command({ type: "exchange", target }, advanceEconomy);
  }
  function expire(key) {
    if (!pending || key !== store.getState().key) return;
    if (store.getState().exchangeReplay) return; // Finish the already received trio's animation.
    if (store.getState().economy?.exchangeEnabled && store.getState().plateau) {
      // The room reserves a bounded replay interval after the exchange deadline.
      presentationDone = true;
      finishTimer = timers.setTimeout(() => {
        if (!pending || key !== store.getState().key) return;
        wheelDone = true; clearTimers(); releaseIfReady();
      }, 3 * INFORTUNE_EXCHANGE_STEP_MS + 500);
      command({ type: "snapshot" }, advanceEconomy);
      return;
    }
    // The server independently closes outstanding choices at its deadline.
    wheelDone = true; clearTimers(); releaseIfReady();
  }
  function receive(value) {
    receivePlateau(value);
    if (!pending || !sameRound(store.getState(), value) || !Array.isArray(value.results)) return;
    payload = value; releaseIfReady();
  }
  function schedule(value, serverNow = value?.infortune?.resultsReadyAt) {
    if (!enabled || !value?.infortune?.afterResults || !sameRound(session(), value) || !eligible(value.roundId, value.infortune)) return;
    if (pending) { receive(value); return; }
    const duplicate = sameRound(scheduled, value);
    scheduled = value;
    if (!duplicate && Number.isFinite(serverNow)) clockOffset = serverNow - now();
    openScheduled();
  }
  function openScheduled() {
    timers.clearTimeout(openingTimer); openingTimer = null;
    if (!scheduled || pending) return;
    if (!sameRound(session(), scheduled)) { scheduled = null; return; }
    const remaining = scheduled.infortune.openedAt - now() - clockOffset;
    const optional = !!scheduled.infortune.optional;
    const untilVisible = (scheduled.infortune.resultsVisibleAt ?? scheduled.infortune.openedAt) - now() - clockOffset;
    if (optional && untilVisible <= 0) {
      const value = scheduled; scheduled = null;
      begin(value.roundId, value, now() + clockOffset); return;
    }
    if (remaining > 0) {
      const untilPreparation = (scheduled.infortune.resultsVisibleAt ?? scheduled.infortune.openedAt) - now() - clockOffset;
      const plateau = !optional && untilPreparation <= 0 && Array.isArray(scheduled.infortune.groups)
        ? selectInfortunePlateau(scheduled.infortune.groups, identity()) : null;
      store.patch({ stage: "scheduled", optional, roundNumber: scheduled.infortune.roundNumber, roomId: scheduled.roomId, roundId: scheduled.roundId,
        groups: scheduled.infortune.groups || [],
        preparation: plateau ? (store.getState().preparation || { plateau, economy: scheduled.infortune.economy }) : null,
        opensAt: scheduled.infortune.openedAt - clockOffset });
      openingTimer = timers.setTimeout(openScheduled, untilPreparation > 0 ? Math.min(remaining, untilPreparation) : remaining);
    } else {
      const value = scheduled; scheduled = null;
      begin(value.roundId, value, now() + clockOffset);
    }
  }
  function observeResume() {
    const snapshot = gameplay?.getHydratedSnapshot?.();
    const results = snapshot?.lastRoundResults?.payload || snapshot?.breakState;
    if (!snapshot || snapshot === resumeSnapshot && resumeSessionId === session().sessionId || !sameRound(session(), { roomId: snapshot.roomId,
      roundId: results?.roundId })) return;
    resumeSnapshot = snapshot;
    resumeSessionId = session().sessionId;
    schedule(results, snapshot.capturedAt);
    receiveBreak(snapshot.breakState);
  }
  function receiveBreak(value) {
    if (!sameRound(session(), value)) return;
    // A break snapshot is also authoritative: recover a missed result event.
    if (!pending && !scheduled) schedule(value);
    if (pending && value?.infortune?.economy) receiveEconomy({ ...value, economy: value.infortune.economy });
    if (value?.nextStartAt) store.set("nextStartAt", value.nextStartAt - clockOffset);
    if (pending && value?.wheelClosing) leaders.receive(value.wheelClosing,
      Number.isFinite(value.serverNow) ? value.serverNow - now() : clockOffset);
  }
  function armTimers(openedAt, nowServerMs, waitingForPlateau = false) {
    clearTimers();
    const state = store.getState(), policy = activePolicy || session().infortune, key = state.key;
    const launchUntil = openedAt + (policy.launchWindowMs || INFORTUNE_LAUNCH_WINDOW_MS);
    deadlineAt = openedAt + (policy.windowMs || INFORTUNE_WINDOW_MS);
    store.patch({ launchUntil: waitingForPlateau || state.plateau ? null : launchUntil - clockOffset });
    if (!waitingForPlateau && !state.plateau && !launched) launchTimer = timers.setTimeout(() => complete(null, key), Math.max(0, launchUntil - nowServerMs));
    finishTimer = timers.setTimeout(() => expire(key), Math.max(0, openedAt + (policy.windowMs || INFORTUNE_WINDOW_MS) - nowServerMs));
  }
  function receivePlateau(value) {
    if (!value?.infortune?.enabled || !Array.isArray(value.infortune.groups) || !sameRound(session(), value)
      || !eligible(value.roundId, value.infortune)) return;
    seating ||= value;
    store.set('groups', value.infortune.groups);
    receiveEconomy({ ...value, economy: value.infortune.economy });
    const state = store.getState();
    if (!pending || wheelDone || state.plateauStatus === "assigned" || state.plateauStatus === "absent") return;
    const plateau = state.preparation?.plateau || selectInfortunePlateau(seating.infortune.groups, identity());
    store.patch({ plateau, preparation: null, plateauStatus: plateau ? "assigned" : "absent", stage: plateau ? state.optional && !state.entered ? 'optional' : "wheel" : "waiting" });
    if (!plateau) { complete(); return; }
    armTimers(seating.infortune.openedAt ?? session().endsAt, now() + clockOffset);
    if (seating.infortune.economy) {
      receiveEconomy({ ...seating, economy: seating.infortune.economy });
      const self = store.getState().economy?.members[plateau.self.id];
      if (self && self.spin !== "pending") {
        presentationDone = true;
        store.patch({ presented: true, result: self.result || null });
        command({ type: "presented" }, advanceEconomy);
        advanceEconomy();
      }
      if (state.optional && self?.optedIn && self.spin === 'pending') store.patch({ entered: true, visible: true, stage: 'wheel' });
      if (pending) command({ type: "snapshot" });
    }
  }
  function eligible(roundId, policy = session().infortune) {
    const current = session();
    return current.origin === "live" && policy?.enabled
      && String(current.roundId) === String(roundId) && !sameRound(current, completed);
  }
  function begin(roundId, value, nowServerMs) {
    const policy = value?.infortune || session().infortune;
    if (!eligible(roundId, policy)) return null;
    if (pending) { const promise = pending; receive(value); return { started: false, promise }; }
    const current = session();
    activePolicy = policy;
    clockOffset = nowServerMs - now();
    const openedAt = value?.infortune?.openedAt ?? current.endsAt ?? nowServerMs;
    pending = new Promise(done => { resolve = done; });
    const promise = pending;
    const key = ++generation;
    const preparation = store.getState().preparation;
    const optional = !!policy.optional && !!policy.afterResults;
    store.replace({ ...initial(), preparation, groups: value?.infortune?.groups || store.getState().groups, serverOffset: clockOffset, plateau: preparation?.plateau || null, economy: preparation?.economy || null,
      nextStartAt: store.getState().nextStartAt, key, sessionId: current.sessionId, visible: !optional, optional, roundNumber: policy.roundNumber, opensAt: openedAt - clockOffset,
      stage: preparation ? "wheel" : policy.plateauVersion ? "seating" : "wheel", plateauStatus: policy.plateauVersion ? "waiting" : null,
      roomId: current.roomId, roundId });
    armTimers(openedAt, nowServerMs, !!policy.plateauVersion);
    receivePlateau(seating || { roomId: current.roomId, roundId, infortune: policy });
    receive(value);
    return { started: true, promise };
  }
  return { store, begin, schedule, receive, receivePlateau, complete, eligible, recordResult, chooseExchange,
    showWheelReminder(vocabularyReady, key = store.getState().key) {
      const state = store.getState();
      if (!vocabularyReady || documentTarget?.hidden || !pending || key !== state.key || !state.optional
        || state.roundNumber !== 1 || state.stage !== 'optional' || !state.plateau || state.entered
        || state.result || now() >= state.opensAt || sameRound(state, remindedRound)) return false;
      remindedRound = { roomId: state.roomId, roundId: state.roundId };
      store.set('reminderSpeaking', true);
      return true;
    },
    finishWheelReminder(key = store.getState().key) {
      if (key === store.getState().key) store.set('reminderSpeaking', false);
    },
    requestWheel() {
      const state = store.getState();
      if (!pending || !state.optional || !state.plateau || state.entered || state.result || now() >= state.opensAt) return;
      store.patch({ entered: true, speaking: false, reminderSpeaking: false, preparation: { plateau: state.plateau, economy: state.economy } });
      command({ type: 'join' }, () => {
        if (pending && store.getState().key === state.key) store.set('speaking', true);
      });
    },
    enterWheel(key = store.getState().key) {
      const state = store.getState();
      if (!pending || !state.entered || key !== state.key || state.closing || state.stage === 'leaders') return;
      store.patch({ speaking: false, visible: true, stage: state.result?.automatic ? 'waiting' : 'wheel' });
      if (state.result?.automatic) advanceEconomy();
    },
    autoSpin(key = store.getState().key) { if (pending && key === store.getState().key && !store.getState().result) command({ type: 'spin', skip: true }, advanceEconomy); },
    landLaunch(key = store.getState().key) {
      if (pending && key === store.getState().key) store.set('launchGainLanded', true);
    },
    landResult(key = store.getState().key) {
      if (pending && key === store.getState().key) store.set('gainLanded', true);
    },
    ready(key = store.getState().key) {
      if (!pending || key !== store.getState().key || launched) return;
      command({ type: "ready" });
    },
    retry() {
      if (store.getState().optional && store.getState().entered && !store.getState().visible)
        command({ type: 'join' }, () => store.set('speaking', true));
      else if (chosenTarget !== undefined) chooseExchange(chosenTarget);
      else if (!presentationDone && !store.getState().result) command({ type: "ready" });
      else { spinRequested = false; recordResult(store.getState().result); if (presentationDone && store.getState().economy?.exchangeEnabled) command({ type: "presented" }, advanceEconomy); }
    },
    launched(value, key = store.getState().key) {
      if (!pending || key !== store.getState().key) return;
      launched = true; store.set("launchUntil", null); if (launchTimer !== null) timers.clearTimeout(launchTimer); launchTimer = null;
      if (value) command({ type: 'launch', quality: value.quality?.kind });
    },
    start() {
      const lease = getKernel().features.acquire("gameplaySession");
      gameplay = lease.feature;
      scope.add(lease.release);
      const onHidden = () => {
        if (!documentTarget?.hidden || !pending) return;
        const state = store.getState(), self = state.economy?.members[state.plateau?.self.id];
        if (state.optional && !state.entered) return;
        if (self?.spin === 'pending') command({ type: 'spin', skip: true }, advanceEconomy);
        else if (self) { presentationDone = true; command({ type: 'presented' }, advanceEconomy); }
      };
      documentTarget?.addEventListener?.('visibilitychange', onHidden);
      scope.add(() => documentTarget?.removeEventListener?.('visibilitychange', onHidden));
      scope.add(subscribeForegroundClockRefresh(() => {
        openScheduled();
        if (!pending) return;
        // Do not replay expired exchanges after a long suspended tab. The server
        // has already resolved them and the room's results deadline still wins.
        if (deadlineAt != null && now() + clockOffset >= deadlineAt) {
          wheelDone = true; clearTimers(); releaseIfReady();
        }
        if (store.getState().economy) command({ type: "snapshot" });
        leaders.refresh();
      }, { documentTarget, windowTarget }));
      scope.add(ports?.realtime?.bind?.({ infortunePlateau: receivePlateau, infortuneEconomy: receiveEconomy,
        roundEnded(value) { schedule(value); receive(value); }, breakStarted: receiveBreak,
        connect() { if (pending && store.getState().economy) command({ type: "snapshot" }); } }));
      scope.add(lease.feature.store.subscribe(() => {
        if (pending && (!sameRound(session(), store.getState()) || session().sessionId !== store.getState().sessionId)) finish(true);
        if (seating && !sameRound(session(), seating)) seating = null;
        if (scheduled && !sameRound(session(), scheduled)) finish(true);
        observeResume();
      }));
      scope.add(getKernel().subscribe(observeResume)); observeResume();
      scope.add(() => finish(true));
    },
  };
}
