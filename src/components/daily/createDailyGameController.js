import { findBestPathForWord } from "../gameLogic.js";
import {
  DAILY_FAKE_TWINS_MODE,
  DAILY_SPECIAL_MODE,
} from "./dailyModes.js";
import {
  createDailySpecialPlacements,
  createDailyWordSlots,
  stripBoardBonuses,
} from "./dailySpecialModel.js";
import {
  getDailyModeDefinition,
  getDailyModeStatusPatch,
  normalizeDailyMode,
} from "../../features/daily/dailyModePolicy.js";
import {
  isCurrentDailyGameplaySession,
  isCurrentDailyStartRequest,
} from "./dailyGameplayScope.js";

export function createDailyGameController(runtime) {
  const [
    getGameProgress,
    acceptedRef,
    appViewRef,
    applyThemeVisualState,
    board,
    clearSelection,
    dailyAcceptedPathsRef,
    dailyLaunchDialog,
    dailyLifecycleRef,
    dailyPlayMode,
    dailySessionRef,
    dailySpecialDragRef,
    dailySpecialPlacements,
    dailyStatus,
    dailySubmitRef,
    dailyTictocPlayedRef,
    dailyWordSlots,
    emitSocketAck,
    ensureAuthenticated,
    fetchDailyBoard,
    fetchDailyStatus,
    fetchThemeProfileRef,
    inputLockedRef,
    installId,
    isDailyPlayRef,
    isDailySpecialMode,
    nickname,
    readJsonResponseLoose,
    requestAudioUnlock,
    resetSubmissionQueue,
    setAppView,
    setDailyActiveSlot,
    setDailyBoard,
    setDailyInvalidSlot,
    setDailyLaunchDialog,
    setDailyPlayMode,
    setDailyResult,
    setDailySection,
    setDailySpecialDrag,
    setDailySpecialPlacements,
    setDailyStartError,
    setDailyStatus,
    setDailySubmitError,
    setDailyWordSlots,
    setDuelStatus,
    setInputLocked,
    setPhase,
    setRoundId,
    setServerEndsAt,
    setServerRoundDurationMs,
    setServerStatus,
    showToast,
    specialScoreConfig,
    startGameFromServerRef,
    themeAppliedSafe,
    gameplaySession,
  ] = runtime;

function classifyDailyStartNetworkError(err) {
  const name = String(err?.name || "").trim();
  const msg = String(err?.message || "").toLowerCase();
  if (msg === "bad_grid") return "E_DAILY_BAD_GRID";
  if (msg === "bad_json") return "E_DAILY_BAD_JSON";
  if (msg === "bad_json_html") return "ENET_PROXY_HTML";
  if (msg === "bad_payload") return "E_DAILY_BAD_PAYLOAD";
  if (name === "AbortError" || msg.includes("abort") || msg.includes("timeout")) {
    return "ENET_TIMEOUT";
  }
  if (typeof navigator !== "undefined" && navigator && navigator.onLine === false) {
    return "ENET_OFFLINE";
  }
  if (
    msg.includes("ssl") ||
    msg.includes("tls") ||
    msg.includes("certificate") ||
    msg.includes("cert")
  ) {
    return "ENET_TLS";
  }
  if (msg.includes("cors")) return "ENET_CORS";
  if (msg.includes("networkerror")) return "ENET_NETWORK";
  if (msg.includes("failed to fetch") || msg.includes("load failed")) {
    return "ENET_FETCH";
  }
  return "ENET_UNKNOWN";
}

async function startDailyGame(requestedMode = DAILY_SPECIAL_MODE, e) {
  requestAudioUnlock(e);
  if (!ensureAuthenticated({ source: "daily" })) {
    return;
  }
  const pseudo = String(nickname || "").trim();
  if (!pseudo) {
    setDailyStartError("Pseudo requis");
    return;
  }
  const modeToStart = normalizeDailyMode(requestedMode);
  const startGeneration =
    Math.max(0, Number(dailyLifecycleRef?.current?.startGeneration) || 0) + 1;
  if (dailyLifecycleRef?.current) {
    dailyLifecycleRef.current.startGeneration = startGeneration;
  }
  const isStartRequestCurrent = () =>
    isCurrentDailyStartRequest({
      appViewRef,
      dailyLifecycleRef,
      startGeneration,
    });
  setDailyStartError(null);
  setDailySubmitError("");
  const payload = { installId, pseudo, dailyMode: modeToStart };
  const applyDailyStartSuccess = (data) => {
    if (!isStartRequestCurrent()) return false;
    if (!data?.grid || !Array.isArray(data.grid)) {
      throw new Error("bad_grid");
    }
    const modeFromServer =
      typeof data?.mode === "string" && data.mode.trim() ? data.mode.trim() : modeToStart;
    const mode = normalizeDailyMode(modeFromServer);
    const gridForPlay =
      mode === DAILY_SPECIAL_MODE ? stripBoardBonuses(data.grid) : data.grid;
    if (data?.duel && typeof data.duel === "object") {
      setDuelStatus({
        loading: false,
        error: "",
        dateId: data.duel.dateId || null,
        weekId: data.duel.weekId || null,
        team: data.duel.team || null,
        crowned: !!data.duel.crowned,
        weekly: data.duel.weekly || null,
        objectives: data.duel.objectives || null,
        dailyBattle: data.duel.dailyBattle || null,
        tutorialVersion: data.duel.tutorialVersion || null,
      });
    }
    dailySessionRef.current = {
      dateId: data.dateId || null,
      startedAt: Date.now(),
    };
    setDailyResult(null);
    setDailyPlayMode(mode);
    setDailySection(mode);
    setDailySpecialPlacements(createDailySpecialPlacements());
    setDailyWordSlots(createDailyWordSlots());
    setDailyActiveSlot(0);
    setDailyInvalidSlot(null);
    setDailySpecialDrag(null);
    dailySpecialDragRef.current = null;
    dailyTictocPlayedRef.current = false;
    // Assure que le thème est bien appliqué au moment du basculement vers la vue de jeu daily.
    applyThemeVisualState(themeAppliedSafe);
    appViewRef.current = "daily_play";
    isDailyPlayRef.current = true;
    setAppView("daily_play");
    const openedSession = gameplaySession?.startRound?.(
      {
        roomId: null,
        roundId: `daily:${data.dateId || "current"}:${mode}`,
        startsAt: dailySessionRef.current.startedAt,
        endsAt:
          Number.isFinite(data.durationMs) && data.durationMs > 0
            ? dailySessionRef.current.startedAt + data.durationMs
            : null,
        status: "running",
      },
      { origin: "daily", entryKind: "daily" }
    );
    if (typeof window !== "undefined" && typeof window.requestAnimationFrame === "function") {
      window.requestAnimationFrame(() => {
        if (!gameplaySession?.isCurrent?.(openedSession?.state?.sessionId)) return;
        if (appViewRef.current !== "daily_play") return;
        applyThemeVisualState(themeAppliedSafe);
      });
    }
    startGameFromServerRef.current?.(
      gridForPlay,
      null,
      data.durationMs || null,
      null,
      null,
      data.gridSize || null,
      null,
      data.gridQuality || null,
      null,
      [],
      data.solutions ? { solutions: data.solutions } : null
    );
    fetchDailyBoard(data.dateId || null);
    return true;
  };
  try {
    let res = null;
    let data = null;
    let parseMeta = { raw: "", parseOk: false, isLikelyHtml: false };
    for (let attempt = 0; attempt < 2; attempt += 1) {
      const cacheBust = attempt > 0 ? `?r=${Date.now()}` : "";
      res = await fetch(`/api/daily/start${cacheBust}`, {
        method: "POST",
        cache: "no-store",
        credentials: "include",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
          "Cache-Control": "no-store, no-cache, max-age=0",
          Pragma: "no-cache",
        },
        body: JSON.stringify(payload),
      });
      parseMeta = await readJsonResponseLoose(res);
      data = parseMeta.data;
      if (!isStartRequestCurrent()) return;
      if (parseMeta.parseOk || !res.ok || attempt > 0) break;
      await new Promise((resolve) => setTimeout(resolve, 120));
    }
    if (!res) {
      throw new Error("bad_payload");
    }
    if (!res.ok) {
      if (data?.error === "maintenance_mode") {
        setDailyStartError("Maintenance en cours");
        fetchDailyStatus();
        fetchDailyBoard();
        return;
      }
      if (data?.error === "already_played") {
        setDailyStartError(getDailyModeDefinition(modeToStart).alreadyPlayedLabel);
        fetchDailyStatus();
        fetchDailyBoard();
        return;
      }
      if (data?.error === "bad_grid") {
        setDailyStartError("E_DAILY_BAD_GRID");
        console.warn("[daily/start] bad_grid", {
          status: res.status,
          hasInstallId: !!installId,
          pseudoLen: pseudo.length,
          installIdLen: typeof installId === "string" ? installId.length : 0,
        });
        fetchDailyStatus();
        fetchDailyBoard();
        return;
      }
      const code = `E${res.status || 0}`;
      setDailyStartError(code);
      console.warn("[daily/start] http", {
        status: res.status,
        error: data?.error || null,
        hasInstallId: !!installId,
        pseudoLen: pseudo.length,
        installIdLen: typeof installId === "string" ? installId.length : 0,
      });
      fetchDailyStatus();
      fetchDailyBoard();
      return;
    }
    if (!data || typeof data !== "object") {
      throw new Error(parseMeta.isLikelyHtml ? "bad_json_html" : parseMeta.raw ? "bad_json" : "bad_payload");
    }
    applyDailyStartSuccess(data);
  } catch (err) {
    if (!isStartRequestCurrent()) return;
    const code = classifyDailyStartNetworkError(err);
    if (code === "ENET_PROXY_HTML") {
      try {
        const socketData = await emitSocketAck("daily:start", payload, { timeoutMs: 7000 });
        if (!isStartRequestCurrent()) return;
        if (!socketData || typeof socketData !== "object") {
          throw new Error("bad_payload");
        }
        if (socketData.ok === false) {
          const socketError = String(socketData.error || "error");
          if (socketError === "already_played") {
            setDailyStartError(getDailyModeDefinition(modeToStart).alreadyPlayedLabel);
          } else if (socketError === "bad_grid") {
            setDailyStartError("E_DAILY_BAD_GRID");
          } else if (socketError === "not_ready") {
            setDailyStartError("E503");
          } else if (socketError === "maintenance_mode") {
            setDailyStartError("Maintenance en cours");
          } else if (socketError === "bad_request") {
            setDailyStartError("E400");
          } else {
            setDailyStartError("E_SOCKET");
          }
          fetchDailyStatus();
          fetchDailyBoard();
          return;
        }
        applyDailyStartSuccess(socketData);
        return;
      } catch (socketErr) {
        if (!isStartRequestCurrent()) return;
        console.warn("[daily/start] socket fallback failed", {
          name: socketErr?.name || null,
          message: socketErr?.message || String(socketErr || ""),
        });
      }
    }
    if (!isStartRequestCurrent()) return;
    setDailyStartError(code);
    console.warn("[daily/start] network", {
      code,
      name: err?.name || null,
      message: err?.message || String(err || ""),
      online:
        typeof navigator !== "undefined" && navigator
          ? navigator.onLine
          : null,
    });
    fetchDailyStatus();
    fetchDailyBoard();
  }
}

async function submitDailyScore() {
  if (dailySubmitRef.current.inFlight) return;
  dailySubmitRef.current.inFlight = true;
  const gameplaySessionId = gameplaySession?.refs?.sessionId?.current || null;
  const isSubmitSessionCurrent = () =>
    isCurrentDailyGameplaySession({
      appViewRef,
      gameplaySession,
      sessionId: gameplaySessionId,
    });
  setDailySubmitError("");
  const session = dailySessionRef.current;
  const dateId = session?.dateId || dailyStatus?.dateId || null;
  const durationMs = session?.startedAt ? Date.now() - session.startedAt : null;
  const gameProgress = getGameProgress?.() || {};
  const currentAccepted = Array.isArray(gameProgress.accepted)
    ? gameProgress.accepted
    : [];
  const currentScore = Number.isFinite(gameProgress.score) ? gameProgress.score : 0;
  const wordSubmissions = isDailySpecialMode
    ? (Array.isArray(dailyWordSlots) ? dailyWordSlots : [])
        .map((slot) => ({
          word: String(slot?.word || "").trim(),
          path: Array.isArray(slot?.path) ? slot.path : [],
        }))
        .filter((slot) => slot.word && slot.path.length > 0)
    : (Array.isArray(acceptedRef.current) ? acceptedRef.current : [])
        .map((word) => {
          const entry = dailyAcceptedPathsRef.current.get(word);
          const fallbackPath =
            Array.isArray(entry?.path) && entry.path.length > 0
              ? entry.path
              : findBestPathForWord(board, word, specialScoreConfig) || [];
          return {
            word: String(entry?.word || word || "").trim(),
            path: Array.isArray(fallbackPath) ? fallbackPath : [],
          };
        })
        .filter((entry) => entry.word && entry.path.length > 0);
  const payload = {
    dateId,
    installId,
    pseudo: String(nickname || "").trim() || "Joueur",
    foundWords: Array.isArray(acceptedRef.current)
      ? acceptedRef.current
      : currentAccepted,
    wordSubmissions,
    specialPlacements: isDailySpecialMode ? dailySpecialPlacements : null,
    dailyMode: isDailySpecialMode ? DAILY_SPECIAL_MODE : dailyPlayMode,
    clientScore: currentScore,
    durationMs,
  };
  const applyDailySubmitSuccess = (data) => {
    if (!isSubmitSessionCurrent()) return false;
    if (data?.duel && typeof data.duel === "object") {
      setDuelStatus({
        loading: false,
        error: "",
        dateId: data.duel.dateId || null,
        weekId: data.duel.weekId || null,
        team: data.duel.team || null,
        crowned: !!data.duel.crowned,
        weekly: data.duel.weekly || null,
        objectives: data.duel.objectives || null,
        dailyBattle: data.duel.dailyBattle || null,
        tutorialVersion: data.duel.tutorialVersion || null,
      });
    }
    setDailyResult({
      dateId: data?.dateId || dateId,
      mode: dailyPlayMode,
      score: Number.isFinite(data?.score) ? data.score : currentScore,
      gobbles: Number.isFinite(data?.gobbles) ? data.gobbles : 0,
      rank: Number.isFinite(data?.rank) ? data.rank : null,
      totalPlayers: Number.isFinite(data?.totalPlayers) ? data.totalPlayers : null,
      fakeTwinsCompletionBonus: Number.isFinite(data?.fakeTwinsCompletionBonus)
        ? data.fakeTwinsCompletionBonus
        : 0,
      fakeTwinWordsFound: Number.isFinite(data?.fakeTwinWordsFound)
        ? data.fakeTwinWordsFound
        : null,
      fakeTwinWordsTotal: Number.isFinite(data?.fakeTwinWordsTotal)
        ? data.fakeTwinWordsTotal
        : null,
      fakeTwinBonusWordsTotal: Number.isFinite(data?.fakeTwinBonusWordsTotal)
        ? data.fakeTwinBonusWordsTotal
        : null,
    });
    const fakeTwinsCompletionBonus = Number(data?.fakeTwinsCompletionBonus) || 0;
    if (dailyPlayMode === DAILY_FAKE_TWINS_MODE && fakeTwinsCompletionBonus > 0) {
      showToast(`Faux jumeaux complétés : +${fakeTwinsCompletionBonus} pts`, 3400);
    }
    if (Array.isArray(data?.board)) {
      setDailyBoard((prev) => ({
        ...prev,
        entries: data.board,
        ready: true,
        dateId: data.dateId || prev.dateId,
        battle: data?.duel?.dailyBattle || prev?.battle || null,
        error: "",
      }));
    }
    const submittedResult = {
      score: Number.isFinite(data?.score) ? data.score : currentScore,
      gobbles: Number.isFinite(data?.gobbles) ? data.gobbles : 0,
      rank: Number.isFinite(data?.rank) ? data.rank : null,
      submittedAt: Date.now(),
    };
    setDailyStatus((prev) => ({
      ...prev,
      ...getDailyModeStatusPatch(dailyPlayMode, submittedResult, prev),
    }));
    void fetchThemeProfileRef.current?.({ silent: true, announceGain: true });
    clearSelection();
    resetSubmissionQueue();
    setInputLocked(true);
    inputLockedRef.current = true;
    setRoundId(null);
    setServerEndsAt(null);
    setServerRoundDurationMs(null);
    setServerStatus("waiting");
    setPhase("lobby");
    appViewRef.current = "daily_results";
    isDailyPlayRef.current = false;
    setAppView("daily_results");
    return true;
  };
  try {
    let data = null;
    try {
      const res = await fetch("/api/daily/submit", {
        method: "POST",
        cache: "no-store",
        credentials: "include",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify(payload),
      });
      const parsed = await readJsonResponseLoose(res);
      data = parsed.data;
      if (!res.ok) {
        const error = data?.error || (parsed.isLikelyHtml ? "bad_json_html" : "erreur");
        throw new Error(error);
      }
      if (!data || typeof data !== "object") {
        throw new Error(parsed.isLikelyHtml ? "bad_json_html" : parsed.raw ? "bad_json" : "bad_payload");
      }
    } catch (httpErr) {
      if (String(httpErr?.message || "") !== "bad_json_html") {
        throw httpErr;
      }
      const socketData = await emitSocketAck("daily:submit", payload, { timeoutMs: 7000 });
      if (!socketData || typeof socketData !== "object") {
        throw new Error("bad_payload");
      }
      if (socketData.ok === false) {
        throw new Error(socketData.error || "erreur");
      }
      data = socketData;
    }
    applyDailySubmitSuccess(data);
  } catch (err) {
    if (!isSubmitSessionCurrent()) return;
    const msg = err?.message === "already_played" ? "Déjà joué" : "Erreur";
    setDailySubmitError(msg);
    fetchDailyStatus();
    fetchDailyBoard();
  } finally {
    dailySubmitRef.current.inFlight = false;
  }
}

function openDailyLaunchDialog(mode) {
  if (dailyStatus?.maintenanceMode) {
    setDailyStartError("Maintenance en cours");
    return;
  }
  const safeMode = normalizeDailyMode(mode);
  setDailyLaunchDialog({ mode: safeMode });
}

function closeDailyLaunchDialog() {
  setDailyLaunchDialog(null);
}

function confirmDailyLaunch(e) {
  const mode = dailyLaunchDialog?.mode;
  setDailyLaunchDialog(null);
  if (!mode) return;
  void startDailyGame(mode, e);
}


  return [
    startDailyGame,
    submitDailyScore,
    openDailyLaunchDialog,
    closeDailyLaunchDialog,
    confirmDailyLaunch,
  ];
}
