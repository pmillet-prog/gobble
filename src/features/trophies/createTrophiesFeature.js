import { createFeatureStore } from "../../app/core/createFeatureStore.js";
import { TROPHY_BY_ID } from "../../../shared/trophyCatalog.js";
import { collectRoundTrophyAwards, getTrophyRewardName, normalizeTrophyAward, trophyCount, trophyRewardCount } from "./trophyPresentation.js";
import { createTrophyRequestId } from "./createTrophyRequestId.js";

const EMPTY = Object.freeze([]);
const DISPLAY_MS = 4500;
const PENDING_PAGE_SIZE = 64;
const DEV_REQUEST_MS = 8000;
const DEV_ACCESS_ERRORS = new Set(["auth_required", "dev_tools_unavailable", "dev_tools_locked", "account_not_allowed"]);

export function createTrophiesFeature({ getKernel, ports, scope }, {
  setTimeoutFn = setTimeout, clearTimeoutFn = clearTimeout,
  createRequestId = createTrophyRequestId,
} = {}) {
  const store = createFeatureStore({ userId: null, counts: {}, roundAwards: EMPTY,
    devCounts: {}, devAllowed: false, devBusy: false, devError: "" });
  const socket = ports?.realtime;
  let kernel;
  let active = false;
  let generation = 0;
  let identity = null;
  let roundId = null;
  let results = null;
  let privateAwards = [];
  let queue = [];
  let pendingIds = new Set();
  let displayedIds = new Set();
  let timer = null;
  let currentToast = null;
  let currentAward = null;
  let notificationFeature = null;
  let syncToken = null;
  let pageToDrain = null;
  const acknowledgments = new Map();
  const devReceiptIds = new Set();
  let devGeneration = 0;
  let devRequest = null;
  let devAccessRequest = null;
  let disconnected = false;

  const notifications = () => notificationFeature ||= kernel.features.prepare("notifications");

  function drainNextPage() {
    if (!active || !identity || syncToken || timer != null || queue.length || acknowledgments.size || pageToDrain?.size !== 0) return;
    pageToDrain = null;
    sync();
  }

  function acknowledge(eventId) {
    if (acknowledgments.has(eventId)) return;
    const token = {};
    const expectedGeneration = generation;
    acknowledgments.set(eventId, token);
    socket?.emit?.("achievement:ack", { eventIds: [eventId] }, response => {
      if (!active || expectedGeneration !== generation || acknowledgments.get(eventId) !== token) return;
      acknowledgments.delete(eventId);
      // Failed acknowledgments stay in this page until a later reconnect retries them.
      if (response?.ok) pageToDrain?.delete(eventId);
      drainNextPage();
    });
  }

  function publishRound() {
    store.set("roundAwards", collectRoundTrophyAwards(results, privateAwards, roundId));
  }

  function showNext() {
    if (!active || !identity || timer != null || !queue.length) return;
    const award = queue.shift();
    currentAward = award;
    const trophy = TROPHY_BY_ID[award.id];
    currentToast = notifications().show(`Trophée obtenu : ${getTrophyRewardName(trophy)}`, DISPLAY_MS - 500, {
      achievementReward: award.dev ? { ...award, count: trophyRewardCount(trophy, trophyCount(store.getState().counts[award.id]) + award.devCount) } : award,
    });
    const expectedGeneration = generation;
    timer = setTimeoutFn(() => {
      timer = null;
      if (!active || expectedGeneration !== generation) return;
      pendingIds.delete(award.eventId);
      currentToast = null;
      currentAward = null;
      if (!award.dev) {
        displayedIds.add(award.eventId);
        // Bound session bookkeeping; server acknowledgments own long-term delivery.
        if (displayedIds.size > 256) displayedIds.delete(displayedIds.values().next().value);
        acknowledge(award.eventId);
      }
      showNext();
      drainNextPage();
    }, DISPLAY_MS);
  }

  function receive(raw) {
    if (!active || !identity || (raw?.userId != null && Number(raw.userId) !== identity)) return;
    if (raw?.dev === true) return receiveDev(raw);
    // A malformed test receipt must never enter the persisted collection path.
    if (String(raw?.eventId || "").startsWith("achievement-dev:")) return;
    const award = normalizeTrophyAward(raw);
    if (!award) return;
    store.set("counts", previous => ({ ...previous, [award.id]: trophyRewardCount(award.id, Math.max(trophyCount(previous[award.id]), award.count)) }));
    enqueue(award);
  }

  function enqueue(award) {
    if (award.roundId != null && String(award.roundId) === String(roundId) && !privateAwards.some(item => item.eventId === award.eventId)) {
      privateAwards = [...privateAwards, { ...award, nick: kernel.getState().session.nickname || "Toi" }];
      publishRound();
    }
    if (displayedIds.has(award.eventId)) { acknowledge(award.eventId); return; }
    if (pendingIds.has(award.eventId)) return;
    pendingIds.add(award.eventId);
    queue.push(award);
    showNext();
  }

  function receiveDev(raw) {
    if (!active || !identity || Number(raw?.userId) !== identity || raw?.dev !== true
      || !String(raw?.eventId || "").startsWith("achievement-dev:")) return false;
    if (TROPHY_BY_ID[raw.id]?.repeat === "once" && raw.count === 1 && raw.delta === 0) {
      store.set("devCounts", counts => ({ ...counts, [raw.id]: 1 }));
      return true;
    }
    const award = normalizeTrophyAward(raw);
    if (!award) return false;
    if (devReceiptIds.has(award.eventId)) return true;
    devReceiptIds.add(award.eventId);
    const previous = trophyCount(store.getState().devCounts[award.id]);
    if (award.count <= previous) return true;
    store.set("devCounts", counts => ({ ...counts, [award.id]: award.count }));
    enqueue({ ...award, devCount: award.count, count: trophyRewardCount(award.id, trophyCount(store.getState().counts[award.id]) + award.count) });
    return true;
  }

  function cancelDevAccess() {
    if (devAccessRequest) clearTimeoutFn(devAccessRequest.timer);
    devAccessRequest = null;
  }

  function checkDevAccess() {
    cancelDevAccess();
    if (!active || !identity || disconnected || socket?.connected === false || !socket?.emit) return;
    const token = {};
    const expectedGeneration = generation;
    devAccessRequest = token;
    token.timer = setTimeoutFn(() => {
      if (devAccessRequest !== token) return;
      devAccessRequest = null;
      store.set("devAllowed", false);
    }, DEV_REQUEST_MS);
    try {
      socket.emit("dev:achievement:status", {}, response => {
        if (!active || generation !== expectedGeneration || devAccessRequest !== token) return;
        cancelDevAccess();
        store.set("devAllowed", response?.ok === true && response.allowed === true);
      });
    } catch {
      cancelDevAccess();
      store.set("devAllowed", false);
    }
  }

  function clearDevSession(error = "dev_cancelled", forgetAccess = false) {
    devGeneration += 1;
    if (devRequest) {
      const request = devRequest;
      devRequest = null;
      clearTimeoutFn(request.timer);
      request.resolve({ ok: false, error });
    }
    if (forgetAccess) cancelDevAccess();
    queue = queue.filter(award => !award.dev);
    for (const eventId of devReceiptIds) pendingIds.delete(eventId);
    devReceiptIds.clear();
    privateAwards = privateAwards.filter(award => !award.dev);
    if (currentAward?.dev) {
      if (timer != null) clearTimeoutFn(timer);
      timer = null;
      if (currentToast) notifications().remove(currentToast.id);
      currentToast = null;
      currentAward = null;
    }
    store.patch({ devCounts: {}, devBusy: false, devError: "", ...(forgetAccess ? { devAllowed: false } : {}) });
    publishRound();
    showNext();
    drainNextPage();
  }

  function devFailure(error) {
    store.set("devError", error);
    return Promise.resolve({ ok: false, error });
  }

  function clearDevError() {
    store.set("devError", "");
  }

  function devCommand(event, payload, accept) {
    if (!active || !identity) return devFailure("auth_required");
    if (disconnected || socket?.connected === false || !socket?.emit) return devFailure("disconnected");
    if (devRequest) return Promise.resolve({ ok: false, error: "dev_busy" });
    return new Promise(resolve => {
      const token = { resolve };
      const expectedGeneration = generation, expectedDevGeneration = devGeneration;
      devRequest = token;
      store.patch({ devBusy: true, devError: "" });
      const finish = response => {
        if (!active || generation !== expectedGeneration || devGeneration !== expectedDevGeneration || devRequest !== token) return;
        clearTimeoutFn(token.timer);
        devRequest = null;
        let result = response?.ok === true ? response : { ...response, ok: false, error: response?.error || "request_failed" };
        if (result.ok && accept && !accept(result)) result = { ok: false, error: "invalid_achievement" };
        if (!result.ok && DEV_ACCESS_ERRORS.has(result.error)) {
          clearDevSession("dev_cancelled", true);
        }
        store.patch({ devBusy: false, devError: result.ok ? "" : result.error });
        resolve(result);
      };
      token.timer = setTimeoutFn(() => finish({ ok: false, error: "dev_timeout" }), DEV_REQUEST_MS);
      try { socket.emit(event, payload, finish); }
      catch { finish({ ok: false, error: "request_failed" }); }
    });
  }

  function grantDevTrophy(id) {
    clearDevError();
    if (!TROPHY_BY_ID[id]) return devFailure("invalid_achievement");
    let requestId;
    try { requestId = createRequestId(); }
    catch (error) { return devFailure(error?.code === "crypto_unavailable" ? "crypto_unavailable" : "request_failed"); }
    return devCommand("dev:achievement:grant", { id, requestId }, response =>
      response.award?.id === id && receiveDev(response.award));
  }

  function resetDevTrophies() {
    return devCommand("dev:achievement:reset", {}, () => {
      clearDevSession();
      return true;
    });
  }

  function sync() {
    if (!active || !identity) return;
    const expectedGeneration = generation;
    const token = {};
    syncToken = token;
    socket?.emit?.("achievement:sync", {}, response => {
      if (!active || expectedGeneration !== generation || syncToken !== token) return;
      if (!response?.ok) { syncToken = null; return; }
      const counts = response.achievements?.counts || {};
      store.set("counts", previous => Object.fromEntries(Object.keys(TROPHY_BY_ID).map(id =>
        [id, trophyRewardCount(id, Math.max(trophyCount(previous[id]), trophyCount(counts[id])))])));
      const awards = Array.isArray(response.awards) ? response.awards : [];
      pageToDrain = awards.length >= PENDING_PAGE_SIZE ? new Set(awards.map(award => award?.eventId)) : null;
      for (const award of awards) receive(award);
      syncToken = null;
      drainNextPage();
    });
  }

  function clearDelivery() {
    if (timer != null) clearTimeoutFn(timer);
    timer = null;
    if (currentToast) notifications().remove(currentToast.id);
    currentToast = null;
    currentAward = null;
    queue = [];
    pendingIds = new Set();
    displayedIds = new Set();
    syncToken = null;
    pageToDrain = null;
    acknowledgments.clear();
  }

  function reconcile() {
    const state = kernel.getState();
    const nextIdentity = Number(state.session.authState?.user?.id) || null;
    if (nextIdentity !== identity) {
      generation += 1;
      clearDelivery();
      clearDevSession("dev_cancelled", true);
      identity = nextIdentity;
      privateAwards = [];
      store.patch({ userId: identity, counts: {}, roundAwards: EMPTY });
      sync();
      checkDevAccess();
    }
    const nextRoundId = state.realtime.roundId;
    const nextResults = state.realtime.finalResults;
    if (roundId !== nextRoundId || results !== nextResults) {
      roundId = nextRoundId;
      results = nextResults;
      privateAwards = privateAwards.filter(award => String(award.roundId) === String(roundId));
      publishRound();
    }
  }

  function start() {
    if (active) return;
    active = true;
    kernel = getKernel();
    scope.add(kernel.subscribe(reconcile));
    scope.add(socket?.bind?.({ "achievement:earned": receive,
      disconnect: () => { disconnected = true; clearDevSession("disconnected", true); },
      connect: () => {
        disconnected = false;
        clearDevSession("dev_cancelled", true);
        acknowledgments.clear();
        sync();
        checkDevAccess();
      },
    }));
    scope.add(() => {
      active = false;
      generation += 1;
      clearDelivery();
      clearDevSession("dev_cancelled", true);
      privateAwards = [];
      store.patch({ userId: null, counts: {}, roundAwards: EMPTY });
    });
    reconcile();
  }

  return Object.freeze({ start, store, receive, sync, grantDevTrophy, resetDevTrophies, clearDevError });
}
