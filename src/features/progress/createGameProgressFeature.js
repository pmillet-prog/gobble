import { createFeatureStore } from "../../app/core/createFeatureStore.js";
import {
  DAILY_FAKE_TWINS_MODE,
} from "../../components/daily/dailyModes.js";
import {
  FAKE_TWINS_TYPE,
  getFakeTwinsCompletionTarget,
  normalizeWord,
} from "../../components/gameLogic.js";

const EMPTY_LIST = Object.freeze([]);
const hasOwn = (value, key) => Object.prototype.hasOwnProperty.call(value, key);

export function createInitialGameProgressState() {
  return {
    accepted: EMPTY_LIST,
    acceptedCount: 0,
    bannerText: "",
    foundWordsCount: 0,
    inputShake: false,
    score: 0,
    statusText: "",
    submissionTick: 0,
  };
}

function countPendingWords(pendingStatusRef) {
  const statuses = pendingStatusRef?.current;
  if (!(statuses instanceof Map)) return 0;
  let count = 0;
  statuses.forEach((meta) => {
    if (meta?.status === "pending") count += 1;
  });
  return count;
}

function collectFakeTwinsWords(accepted, allWords, acceptedWordMetaRef, pendingStatusRef) {
  const counted = new Set();
  const solutionMeta = new Map(
    (Array.isArray(allWords) ? allWords : []).map((entry) => [entry?.word, entry])
  );
  (Array.isArray(accepted) ? accepted : EMPTY_LIST).forEach((word) => {
    const meta = acceptedWordMetaRef?.current?.get?.(word) || solutionMeta.get(word);
    if (meta?.usedFakeTwins) counted.add(word);
  });
  pendingStatusRef?.current?.forEach?.((meta, word) => {
    if (!meta || meta.status === "rejected" || !meta.usedFakeTwins) return;
    counted.add(word);
  });
  return counted;
}

function getFakeTwinsProgress(config, accepted) {
  const active =
    config.specialRound?.type === FAKE_TWINS_TYPE ||
    (config.isDailyPlay && config.dailyPlayMode === DAILY_FAKE_TWINS_MODE);
  if (!active) return { active: false, remaining: null, target: 0 };

  const counted = collectFakeTwinsWords(
    accepted,
    config.allWords,
    config.acceptedWordMetaRef,
    config.pendingStatusRef
  );
  if (Array.isArray(config.allWords) && config.allWords.length > 0) {
    const total = config.allWords.filter(
      (entry) => entry?.usedFakeTwins && entry?.word
    ).length;
    const target = getFakeTwinsCompletionTarget(total);
    return {
      active: true,
      remaining: Math.max(0, target - counted.size),
      target,
    };
  }

  const statsTarget = Number(config.roundStats?.fakeTwinCompletionTarget);
  const statsTwinWords = Number(
    config.roundStats?.fakeTwinBonusWords ??
      config.roundStats?.fakeTwinCompletionWords ??
      config.roundStats?.fakeTwinWords
  );
  const target =
    Number.isFinite(statsTarget) && statsTarget > 0
      ? statsTarget
      : getFakeTwinsCompletionTarget(statsTwinWords);
  return {
    active: true,
    remaining:
      Number.isFinite(target) && target > 0
        ? Math.max(0, target - counted.size)
        : null,
    target: Number.isFinite(target) ? target : 0,
  };
}

function getCultureThemeProgress(config, accepted) {
  const challenge = config.cultureThemeChallenge;
  const wordSet = challenge?.wordSet;
  if (!(wordSet instanceof Set) || wordSet.size === 0) {
    return { active: false, remaining: null, target: 0 };
  }
  const found = new Set();
  (Array.isArray(accepted) ? accepted : EMPTY_LIST).forEach((word) => {
    const normalized = normalizeWord(word);
    if (wordSet.has(normalized)) found.add(normalized);
  });
  config.pendingStatusRef?.current?.forEach?.((meta, word) => {
    if (!meta || meta.status === "rejected") return;
    const normalized = normalizeWord(word);
    if (wordSet.has(normalized)) found.add(normalized);
  });
  const total = Array.isArray(challenge.words) ? challenge.words.length : wordSet.size;
  const target = Math.max(
    1,
    Math.min(
      total,
      Math.trunc(Number(challenge.requiredCount) || Math.ceil(total * 0.7))
    )
  );
  return {
    active: true,
    remaining: Math.max(0, target - found.size),
    target,
  };
}

function formatProgressNumber(value) {
  return Number.isFinite(value) ? value.toLocaleString("fr-FR") : String(value ?? "");
}

function buildBannerText(config, fakeTwinsProgress, cultureThemeProgress) {
  const labels = [];
  if (fakeTwinsProgress.active && Number.isFinite(fakeTwinsProgress.remaining)) {
    const twinCell = (Array.isArray(config.board) ? config.board : EMPTY_LIST).find(
      (cell) =>
        cell?.specialType === FAKE_TWINS_TYPE &&
        String(cell?.letter || "").trim() &&
        String(cell?.altLetter || "").trim()
    );
    const twinLetters = twinCell
      ? `${String(twinCell.letter).trim()}/${String(twinCell.altLetter).trim()}`
      : "la case jumelle";
    labels.push(
      `${formatProgressNumber(fakeTwinsProgress.remaining)} mots avec ${twinLetters} avant bonus`
    );
  }
  if (cultureThemeProgress.active && Number.isFinite(cultureThemeProgress.remaining)) {
    const challenge = config.cultureThemeChallenge;
    const theme = challenge?.theme ? ` thème ${challenge.theme}` : "";
    const bonus = Number(challenge?.bonus) || 0;
    const suffix = bonus > 0 ? ` · bonus ${bonus} pts` : "";
    labels.push(
      `${formatProgressNumber(cultureThemeProgress.remaining)} mots WikiMama${theme} restants${suffix}`
    );
  }
  return labels.join(" · ");
}

export function createGameProgressFeature({ scope }) {
  const store = createFeatureStore(createInitialGameProgressState());
  let config = {};
  let fakeTwinsCelebrationKey = "";
  let cultureThemeCelebrationKey = "";
  let statusTimer = null;
  let inputShakeFrame = null;
  let inputShakeTimer = null;
  let stopped = false;

  function sync(nextValues = {}, { force = false } = {}) {
    if (stopped) return;
    const current = store.getState();
    const accepted = hasOwn(nextValues, "accepted")
      ? Array.isArray(nextValues.accepted)
        ? nextValues.accepted
        : EMPTY_LIST
      : current.accepted;
    const score = hasOwn(nextValues, "score")
      ? Number.isFinite(nextValues.score)
        ? nextValues.score
        : 0
      : current.score;
    const submissionTick = hasOwn(nextValues, "submissionTick")
      ? Number.isFinite(nextValues.submissionTick)
        ? nextValues.submissionTick
        : 0
      : current.submissionTick;
    if (
      !force &&
      accepted === current.accepted &&
      score === current.score &&
      submissionTick === current.submissionTick
    ) {
      return;
    }

    const pendingCount = countPendingWords(config.pendingStatusRef);
    const fakeTwinsProgress = getFakeTwinsProgress(config, accepted);
    const cultureThemeProgress = getCultureThemeProgress(config, accepted);
    const playing = config.phase === "playing";

    if (!playing || !fakeTwinsProgress.active) {
      fakeTwinsCelebrationKey = "";
    } else if (
      fakeTwinsProgress.target > 0 &&
      fakeTwinsProgress.remaining === 0
    ) {
      const key = config.isDailyPlay
        ? `daily:${config.dailyPlayMode}:${config.dailyDateId || "current"}`
        : `live:${config.roundId || "current"}`;
      if (fakeTwinsCelebrationKey !== key) {
        fakeTwinsCelebrationKey = key;
        config.onFakeTwinsCompleted?.();
      }
    }

    if (!playing || !cultureThemeProgress.active) {
      cultureThemeCelebrationKey = "";
    } else if (
      cultureThemeProgress.target > 0 &&
      cultureThemeProgress.remaining === 0
    ) {
      const key = `live:${config.roundId || "current"}:${
        config.cultureThemeChallenge?.theme || "theme"
      }`;
      if (cultureThemeCelebrationKey !== key) {
        cultureThemeCelebrationKey = key;
        config.onCultureThemeCompleted?.();
      }
    }

    if (playing && accepted.length > 0) {
      config.onAcceptedWordsAvailable?.();
    }

    store.patch({
      accepted,
      acceptedCount: accepted.length,
      bannerText: playing
        ? buildBannerText(config, fakeTwinsProgress, cultureThemeProgress)
        : "",
      foundWordsCount: accepted.length + pendingCount,
      score,
      submissionTick,
    });
  }

  function configure(nextConfig = {}) {
    config = nextConfig;
    sync({}, { force: true });
  }

  function setAccepted(nextOrUpdater) {
    const current = store.getState().accepted;
    const next =
      typeof nextOrUpdater === "function"
        ? nextOrUpdater(current)
        : nextOrUpdater;
    sync({ accepted: next });
  }

  function setScore(nextOrUpdater) {
    const current = store.getState().score;
    const next =
      typeof nextOrUpdater === "function"
        ? nextOrUpdater(current)
        : nextOrUpdater;
    sync({ score: next });
  }

  function setSubmissionTick(nextOrUpdater) {
    const current = store.getState().submissionTick;
    const next =
      typeof nextOrUpdater === "function"
        ? nextOrUpdater(current)
        : nextOrUpdater;
    sync({ submissionTick: next });
  }

  function showStatus(message, holdMs = 1000) {
    const text = typeof message === "string" ? message : "";
    if (!text) return;
    if (statusTimer != null) clearTimeout(statusTimer);
    store.set("statusText", text);
    statusTimer = setTimeout(() => {
      statusTimer = null;
      store.set("statusText", "");
    }, Math.max(0, Number(holdMs) || 0));
  }

  function clearStatus({ force = false } = {}) {
    if (!force) return;
    if (statusTimer != null) clearTimeout(statusTimer);
    statusTimer = null;
    store.set("statusText", "");
  }

  function clearInputShake() {
    if (inputShakeFrame != null) {
      globalThis.window?.cancelAnimationFrame?.(inputShakeFrame);
      inputShakeFrame = null;
    }
    if (inputShakeTimer != null) clearTimeout(inputShakeTimer);
    inputShakeTimer = null;
    store.set("inputShake", false);
  }

  function triggerInputShake({ enabled = true, durationMs = 300 } = {}) {
    clearInputShake();
    if (!enabled) return;
    const start = () => {
      inputShakeFrame = null;
      store.set("inputShake", true);
    };
    if (typeof globalThis.window?.requestAnimationFrame === "function") {
      inputShakeFrame = globalThis.window.requestAnimationFrame(start);
    } else {
      start();
    }
    inputShakeTimer = setTimeout(() => {
      inputShakeTimer = null;
      store.set("inputShake", false);
    }, Math.max(0, Number(durationMs) || 0));
  }

  function start() {
    stopped = false;
    sync({}, { force: true });
    scope.add(() => {
      stopped = true;
      config = {};
      fakeTwinsCelebrationKey = "";
      cultureThemeCelebrationKey = "";
      if (statusTimer != null) clearTimeout(statusTimer);
      statusTimer = null;
      clearInputShake();
      store.patch(createInitialGameProgressState());
    });
  }

  return Object.freeze({
    clearInputShake,
    clearStatus,
    configure,
    setAccepted,
    setScore,
    setSubmissionTick,
    showStatus,
    start,
    store,
    triggerInputShake,
  });
}
