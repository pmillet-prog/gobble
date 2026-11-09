import { createFeatureStore } from "../../../app/core/createFeatureStore.js";
import { createFinaleController } from "./createFinaleController.js";
import { subscribeForegroundClockRefresh } from "../../../utils/realtimeClock.js";
import { gameAudioFocus } from '../../audio/gameAudioFocus.js';
import { newFinaleWins } from './finaleWins.js';

export const FINALE_RESULT_MS = 4000;
const empty = () => ({ finale: null, controller: null, loaded: false, phase: "idle", seconds: 0, startsIn: 0, introElapsedMs: 0, resultSeconds: 0, rewardWalletHold: null, error: "" });

export function createTournamentFinaleFeature({ getKernel, ports, scope }, { now = Date.now, timers = globalThis, audioFocus = gameAudioFocus } = {}) {
  const store = createFeatureStore(empty());
  let roomId = null, generation = 0, offset = 0, tick = null, controllerUnsubscribe = null, resumeSnapshot;
  let resultUntil = 0, outcomeSeen = false;
  let requestSequence = 0;
  const requestPrefix = `finale-${Math.random().toString(36).slice(2)}-${now()}`;
  const pending = new Set();
  const winListeners = new Set();
  const silence = audioFocus.claim();
  function reset() {
    silence.set({ ambient: false, effects: false });
    generation++;
    resultUntil = 0; outcomeSeen = false;
    syncing = false;
    if (tick !== null) timers.clearTimeout(tick);
    tick = null;
    for (const request of pending) { timers.clearTimeout(request.timer); request.resolve({ ok: false, error: "connection" }); }
    pending.clear(); controllerUnsubscribe?.(); controllerUnsubscribe = null;
    store.getState().controller?.dispose(); store.replace(empty());
  }
  function refresh() {
    if (tick !== null) timers.clearTimeout(tick);
    tick = null;
    const { finale, controller, loaded } = store.getState();
    if (!finale) return;
    const current = now() + offset;
    const introStartsAt = finale.introStartsAt ?? finale.startsAt;
    const expired = current >= finale.deadlineAt;
    const outcome = controller?.store.getState().outcome;
    if (outcome && !outcomeSeen) {
      outcomeSeen = true;
      if (!outcome.expired) resultUntil = current + FINALE_RESULT_MS;
    }
    const phase = current < introStartsAt ? "waiting" : current < finale.startsAt ? "intro"
      : expired && finale.closed && current >= finale.podiumAt ? "idle"
      : current < resultUntil ? 'result'
      : expired || controller?.store.getState().outcome || loaded && !controller ? "ranking"
      : !loaded ? "loading" : "playing";
    silence.set({ ambient: current >= introStartsAt, effects: ['intro', 'playing', 'result', 'loading', 'ranking'].includes(phase) });
    if (phase === 'ranking' || phase === 'idle') store.set('rewardWalletHold', null);
    store.patch({ phase, introElapsedMs: Math.max(0, current - introStartsAt), startsIn: Math.max(0, Math.ceil((introStartsAt - current) / 1000)), seconds: Math.max(0, Math.ceil((finale.deadlineAt - Math.max(current, finale.startsAt)) / 1000)), resultSeconds: Math.max(0, Math.ceil((resultUntil - current) / 1000)) });
    if (phase !== "idle") tick = timers.setTimeout(() => {
      if (now() + offset >= finale.deadlineAt && !store.getState().finale.closed) sync();
      refresh();
    }, expired && current >= finale.podiumAt ? 1000 : Math.min(1000, Math.max(1, (phase === 'result' ? resultUntil : current < introStartsAt ? introStartsAt : current < finale.startsAt ? finale.startsAt : expired ? finale.podiumAt : finale.deadlineAt) - current)));
  }
  function receive(finale, announce = false) {
    if (!finale || String(finale.roomId) !== String(roomId)) return;
    const previous = store.getState().finale;
    const sameTournament = previous?.tournamentId === finale.tournamentId;
    if (sameTournament && (previous.revision > finale.revision ||
      previous.revision === finale.revision && previous.serverNow >= finale.serverNow)) return;
    if (previous && !sameTournament) reset();
    // A result/break snapshot may have waited in transit or in a resume queue.
    // Its serverNow is the time it was created, not the time we receive it.
    // New standings may advance this clock, but must never replay the intro,
    // hide the active board, or give back seconds already elapsed.
    const sampledOffset = finale.serverNow - now();
    offset = sameTournament ? Math.max(offset, sampledOffset) : sampledOffset;
    store.patch({ finale }); refresh();
    if (announce) {
      const wins = newFinaleWins(previous, finale);
      if (wins.length) for (const listener of winListeners) listener(wins);
    }
    if (finale.closed && store.getState().controller && !store.getState().controller.store.getState().outcome) sync();
  }
  function request(type, value = {}) {
    const token = generation, sentRoom = roomId;
    const tournamentId = store.getState().finale?.tournamentId;
    const requestId = `${requestPrefix}-${++requestSequence}`;
    if (type === 'answer') store.set('rewardWalletHold', getKernel().features.prepare('preferences').store.getState().gobblarsBalance ?? null);
    return new Promise(resolve => {
      const job = { resolve, timer: null, tries: 0 }; pending.add(job);
      const attempt = () => {
        if (!pending.has(job)) return;
        job.tries++;
        job.timer = timers.setTimeout(() => {
          if (job.tries < 3) attempt();
          else { pending.delete(job); resolve({ ok: false, error: "connection" }); store.patch({ rewardWalletHold: null, error: "Connexion interrompue. Réessaie pour retrouver ta finale." }); }
        }, 3000);
        ports.realtime.emit("infortune:finale", { roomId: sentRoom, tournamentId, type, ...value, requestId }, reply => {
          if (token !== generation || !pending.has(job)) return;
          timers.clearTimeout(job.timer); pending.delete(job);
          // A winning answer's cached purchase balance can predate its separate
          // reward receipt. Never overwrite that authoritative credit with it.
          if (type !== 'answer' && Number.isSafeInteger(reply?.snapshot?.gobblarsBalance))
            getKernel().features.prepare('preferences').set('gobblarsBalance', reply.snapshot.gobblarsBalance);
          if (type === 'answer' && (!reply?.ok || !reply.snapshot?.outcome?.correct)) store.set('rewardWalletHold', null);
          if (reply?.finale) receive(reply.finale);
          store.set("error", ""); resolve(reply || { ok: false, error: "connection" });
        });
      };
      attempt();
    });
  }
  let syncing = false;
  async function sync() {
    if (!roomId || syncing) return;
    const token = generation; syncing = true;
    const reply = await request("snapshot");
    if (token !== generation) return;
    syncing = false;
    if (!reply.ok) return;
    store.set("loaded", true);
    if (!reply.snapshot) { refresh(); return; }
    let controller = store.getState().controller;
    if (!controller) {
      // An already finished snapshot belongs directly in the ranking; only a
      // newly received answer needs its local acknowledgement screen.
      outcomeSeen = Boolean(reply.snapshot.outcome);
      controller = createFinaleController({ snapshot: () => reply.snapshot,
        buyLetter: (letter, payment = {}) => request("buy", { letter, currency: payment.currency, confirmedCost: payment.confirmedCost }), submitAnswer: answer => request("answer", { answer }) }, { timers });
      store.set("controller", controller);
      controllerUnsubscribe = controller.store.subscribe(refresh);
    } else controller.hydrate(reply.snapshot);
    refresh();
  }
  function handlePayload(value) { if (value?.infortuneFinale) { receive(value.infortuneFinale); if (!store.getState().controller) sync(); } }
  function observeKernel() {
    const state = getKernel().getState();
    const activeRoom = state.session.isLoggedIn && ["live", "vault"].includes(state.navigation.view) ? state.game.currentRoomId : null;
    if (String(activeRoom) !== String(roomId)) { reset(); roomId = activeRoom; syncing = false; if (roomId) sync(); }
    if (resumeSnapshot !== state.session.resumeSnapshot) {
      resumeSnapshot = state.session.resumeSnapshot;
      if (roomId && resumeSnapshot) { handlePayload(resumeSnapshot.breakState); sync(); }
    }
  }
  return { store, subscribeWins(listener) { winListeners.add(listener); return () => winListeners.delete(listener); }, retry: sync, landReward() { store.set('rewardWalletHold', null); }, continueToRanking() { resultUntil = 0; refresh(); }, start() {
    const clearRoom = value => { if (String(value?.roomId) === String(roomId)) reset(); };
    scope.add(ports.realtime.bind({ roundEnded: handlePayload, breakStarted: handlePayload,
      infortuneFinale: value => { receive(value, true); if (!store.getState().controller) sync(); }, connect: sync,
      roundStarted: clearRoom,
      // Presence changes also broadcast this event during the tournament with
      // isOpen:false. Only an actual return to the lobby ends the finale.
      tournamentLobbyUpdate: value => { if (value?.isOpen === true) clearRoom(value); } }));
    scope.add(getKernel().subscribe(observeKernel)); observeKernel();
    scope.add(subscribeForegroundClockRefresh(() => { refresh(); if (roomId) sync(); }));
    scope.add(() => { reset(); silence.release(); roomId = null; winListeners.clear(); });
  } };
}
