import React from "react";
import { normalizeInstallId } from "../../app/adapters/browserIdentity.js";
import {
  ENABLE_FAKE_DAILY_HISTORY,
  buildFakeDailyHistoryDays,
} from "./dailyHistoryModel.js";
import {
  DAILY_FAKE_TWINS_MODE,
  DAILY_FUTURE_SECTION,
  DAILY_MONSTROUS_MODE,
  DAILY_OVERVIEW_SECTION,
  DAILY_SPECIAL_MODE,
} from "./dailyModes.js";

export default function DailyHubScreen({
  view,
  daily,
  identity,
  background,
  preparation,
  overlays,
  actions,
  renderers,
}) {
  const { appView, darkMode, isMobileLayout, menuDarkMode } = view;
  const {
    dailyBoard,
    dailyEntries,
    dailyHistory,
    dailyHistoryError,
    dailyHistoryIndex,
    dailyHistoryLoading,
    dailyHistoryScrollRef,
    dailyLaunchDialog,
    dailyRankingView,
    dailyResult,
    dailySection,
    dailyStartError,
    dailyStatus,
    dailySubmitError,
    duelStatus,
  } = daily;
  const { installId, selfNick } = identity;
  const { homeBackgroundDesktop, homeBackgroundMobile } = background;
  const {
    shouldPrepareDailyOrDuelStandaloneView,
    shouldPrepareDailyStandaloneView,
  } = preparation;
  const {
    aboutModalView,
    authDialogView,
    chatOverlays,
    globalChatLayer,
    quickHelpOverlay,
    settingsMenuView,
    tutorialOverlay,
  } = overlays;
  const {
    closeDailyLaunchDialog,
    confirmDailyLaunch,
    openDailyLaunchDialog,
    openDefinition,
    setAppView,
    setDailyHistoryIndex,
    setDailyRankingView,
    setDailySection,
  } = actions;
  const { renderCrownIcon, renderGobbleBadge, renderHumanDot } = renderers;

  const getDailySectionMeta = (section) => {
    if (section === DAILY_MONSTROUS_MODE) {
      return {
        key: DAILY_MONSTROUS_MODE,
        label: "Grille monstrueuse",
        shortLabel: "Monstrueuse",
        accentClass: "from-blue-500 via-cyan-500 to-sky-600",
        buttonClass: "bg-blue-600 hover:bg-blue-500 text-white",
        description: "La grille principale du jour, riche en volume et en gros scores.",
      };
    }
    if (section === DAILY_SPECIAL_MODE) {
      return {
        key: DAILY_SPECIAL_MODE,
        label: "3 mots",
        shortLabel: "3 mots",
        accentClass: "from-emerald-500 via-green-500 to-lime-500",
        buttonClass: "bg-emerald-600 hover:bg-emerald-500 text-white",
        description: "Trois cartouches, peu d'essais, lecture rapide de la grille.",
      };
    }
    if (section === DAILY_FAKE_TWINS_MODE) {
      return {
        key: DAILY_FAKE_TWINS_MODE,
        label: "Faux jumeaux",
        shortLabel: "Faux jumeaux",
        accentClass: "from-teal-500 via-emerald-500 to-green-600",
        buttonClass: "bg-teal-600 hover:bg-teal-500 text-white",
        description: "Une case vaut deux lettres possibles, avec les mots de 2 lettres et plus.",
      };
    }
    if (section === DAILY_FUTURE_SECTION) {
      return {
        key: DAILY_FUTURE_SECTION,
        label: "Grille à venir",
        shortLabel: "À venir",
        accentClass: "from-amber-400 via-orange-400 to-rose-500",
        buttonClass: "bg-amber-500 hover:bg-amber-400 text-slate-900",
        description: "Nouveau format daily réservé pour la prochaine mise à jour.",
      };
    }
    return {
      key: DAILY_OVERVIEW_SECTION,
      label: "Général",
      shortLabel: "Général",
      accentClass: "from-slate-500 via-slate-600 to-slate-800",
      buttonClass: "bg-slate-700 hover:bg-slate-600 text-white",
      description: isMobileLayout
        ? "Toutes les grilles du jour confondues."
        : "Toutes les grilles du jour confondues, pour garder une vue d'ensemble.",
    };
  };
  const getDailyModeResult = (mode) => {
    if (mode === DAILY_MONSTROUS_MODE) {
      return dailyStatus?.myMonstrousResult ||
        (dailyResult?.mode === DAILY_MONSTROUS_MODE ? dailyResult : null);
    }
    if (mode === DAILY_SPECIAL_MODE) {
      return dailyStatus?.mySpecialResult ||
        (dailyResult?.mode === DAILY_SPECIAL_MODE ? dailyResult : null);
    }
    if (mode === DAILY_FAKE_TWINS_MODE) {
      return dailyStatus?.myFakeTwinsResult ||
        (dailyResult?.mode === DAILY_FAKE_TWINS_MODE ? dailyResult : null);
    }
    return null;
  };
  const selectedDailySectionMeta = shouldPrepareDailyStandaloneView
    ? getDailySectionMeta(dailySection)
    : getDailySectionMeta(DAILY_OVERVIEW_SECTION);
  const dailyMyResult =
    shouldPrepareDailyStandaloneView &&
    (dailySection === DAILY_MONSTROUS_MODE ||
      dailySection === DAILY_SPECIAL_MODE ||
      dailySection === DAILY_FAKE_TWINS_MODE)
      ? getDailyModeResult(dailySection)
      : null;
  const dailyBattle =
    shouldPrepareDailyOrDuelStandaloneView
      ? (dailyBoard?.battle && typeof dailyBoard.battle === "object" ? dailyBoard.battle : null) ||
        (duelStatus?.dailyBattle && typeof duelStatus.dailyBattle === "object"
          ? duelStatus.dailyBattle
          : null)
      : null;
  const dailyBattleRedBalanced = Number(dailyBattle?.totalsBalancedByTeam?.red) || 0;
  const dailyBattleBlueBalanced = Number(dailyBattle?.totalsBalancedByTeam?.blue) || 0;
  const dailyBattleIgnoredInstallIds = new Set(
    Array.isArray(dailyBattle?.ignoredInstallIds)
      ? dailyBattle.ignoredInstallIds.map((value) => normalizeInstallId(value)).filter(Boolean)
      : []
  );
  const dailyBattleCountedPlayersByTeam =
    dailyBattle?.countedPlayersByTeam && typeof dailyBattle.countedPlayersByTeam === "object"
      ? dailyBattle.countedPlayersByTeam
      : { red: 0, blue: 0 };
  const todayDateId = dailyStatus?.dateId || dailyBoard?.dateId || null;
  const fakeDailyHistoryDays = shouldPrepareDailyStandaloneView
    ? buildFakeDailyHistoryDays(todayDateId)
    : [];
  const dailyHistoryDaysRaw = shouldPrepareDailyStandaloneView
    ? (() => {
        const realDays = Array.isArray(dailyHistory?.days) ? dailyHistory.days : [];
        if (!ENABLE_FAKE_DAILY_HISTORY) return realDays;
        const existingDateIds = new Set(realDays.map((entry) => String(entry?.dateId || "")));
        const merged = [...realDays];
        fakeDailyHistoryDays.forEach((entry) => {
          const key = String(entry?.dateId || "");
          if (!key || existingDateIds.has(key)) return;
          merged.push(entry);
        });
        return merged;
      })()
    : [];
  const dailyHistoryDays = shouldPrepareDailyStandaloneView
    ? (todayDateId
        ? dailyHistoryDaysRaw.filter((entry) => entry?.dateId && entry.dateId !== todayDateId)
        : dailyHistoryDaysRaw
      ).sort((a, b) => String(b?.dateId || "").localeCompare(String(a?.dateId || "")))
    : [];
  const dailyHistoryPages = [...dailyHistoryDays.map((entry) => ({ type: "day", ...entry }))];
  const dailyEntrySort = (a, b) => {
    const scoreDiff = (Number(b?.score) || 0) - (Number(a?.score) || 0);
    if (scoreDiff !== 0) return scoreDiff;
    const gobbleDiff = (Number(b?.gobbles) || 0) - (Number(a?.gobbles) || 0);
    if (gobbleDiff !== 0) return gobbleDiff;
    const submittedDiff = (Number(a?.submittedAt) || 0) - (Number(b?.submittedAt) || 0);
    if (submittedDiff !== 0) return submittedDiff;
    return String(a?.nick || "").localeCompare(String(b?.nick || ""));
  };
  const formatDailyGobbleLabel = (gobbles) => {
    const count = Number(gobbles) || 0;
    if (count <= 0) return "";
    return `${count} gobble${count > 1 ? "s" : ""}`;
  };
  const formatDailyEntryLabel = (
    entry,
    { includeWords = true, includeGobbles = false } = {}
  ) => {
    if (!Number.isFinite(entry?.score)) return "-";
    const parts = [];
    if (includeWords && Number.isFinite(entry?.wordsCount) && entry.wordsCount > 0) {
      parts.push(`${entry.wordsCount} mots`);
    }
    parts.push(`${entry.score} pts`);
    if (includeGobbles) {
      const gobbleLabel = formatDailyGobbleLabel(entry?.gobbles);
      if (gobbleLabel) parts.push(gobbleLabel);
    }
    return parts.join(" · ");
  };
  const dailyScoreLabel =
    dailyMyResult && Number.isFinite(dailyMyResult.score) ? dailyMyResult.score : null;
  const dailyGobblesLabel = formatDailyGobbleLabel(dailyMyResult?.gobbles);
  const dailyRankLabel =
    dailyMyResult && Number.isFinite(dailyMyResult.rank) ? dailyMyResult.rank : null;
  const aggregateDailyOverviewEntries = (entries) => {
    const list = Array.isArray(entries) ? entries : [];
    const grouped = new Map();
    list.forEach((entry, idx) => {
      if (!entry || typeof entry !== "object") return;
      const normalizedInstallId = normalizeInstallId(entry?.installId);
      const team = entry?.team === "red" || entry?.team === "blue" ? entry.team : "";
      const nickKey = String(entry?.nick || "").trim().toLowerCase();
      const key = normalizedInstallId
        ? `id:${normalizedInstallId}`
        : `nick:${team}:${nickKey || `anonymous-${idx}`}`;
      const score = Number.isFinite(entry?.score) ? Number(entry.score) : 0;
      const gobbles = Number.isFinite(entry?.gobbles) ? Number(entry.gobbles) : 0;
      const existing = grouped.get(key);
      if (!existing) {
        grouped.set(key, {
          ...entry,
          score,
          gobbles,
          wordsCount: null,
          playerKey: entry?.playerKey || key,
        });
        return;
      }
      existing.score = (Number(existing.score) || 0) + score;
      existing.gobbles = (Number(existing.gobbles) || 0) + gobbles;
      existing.wordsCount = null;
      if (!existing.installId && entry?.installId) existing.installId = entry.installId;
      if (!existing.nick && entry?.nick) existing.nick = entry.nick;
    });
    return Array.from(grouped.values()).sort(dailyEntrySort);
  };
  const filterDailyEntriesBySection = (entries, section) => {
    const list = Array.isArray(entries) ? entries : [];
    if (
      section === DAILY_MONSTROUS_MODE ||
      section === DAILY_SPECIAL_MODE ||
      section === DAILY_FAKE_TWINS_MODE
    ) {
      return list.filter((entry) => entry?.mode === section).sort(dailyEntrySort);
    }
    if (section === DAILY_FUTURE_SECTION) {
      return [];
    }
    return aggregateDailyOverviewEntries(list);
  };
  const filteredDailyEntries = shouldPrepareDailyStandaloneView
    ? filterDailyEntriesBySection(dailyEntries, dailySection)
    : [];
  const filteredDailyHistoryPages =
    !shouldPrepareDailyStandaloneView || dailySection === DAILY_FUTURE_SECTION
      ? []
      : dailyHistoryPages
          .map((page) => ({
            ...page,
            entries: filterDailyEntriesBySection(page?.entries, dailySection),
            findableWords:
              dailySection === DAILY_MONSTROUS_MODE ||
              dailySection === DAILY_SPECIAL_MODE ||
              dailySection === DAILY_FAKE_TWINS_MODE
                ? Array.isArray(page?.findableWordsByMode?.[dailySection])
                  ? page.findableWordsByMode[dailySection]
                  : []
                : Array.isArray(page?.findableWords)
                ? page.findableWords
                : [],
            myWords:
              dailySection === DAILY_MONSTROUS_MODE ||
              dailySection === DAILY_SPECIAL_MODE ||
              dailySection === DAILY_FAKE_TWINS_MODE
                ? Array.isArray(page?.myWordsByMode?.[dailySection])
                  ? page.myWordsByMode[dailySection]
                  : []
                : [],
          }))
          .filter((page) =>
            dailySection === DAILY_OVERVIEW_SECTION
              ? true
              : Array.isArray(page?.entries) && page.entries.length > 0
          );
  const dailyHistoryPageCount = filteredDailyHistoryPages.length;
  const dailyTodayRedEntries = filteredDailyEntries
    .filter((entry) => entry?.team === "red")
    .sort(dailyEntrySort);
  const dailyTodayBlueEntries = filteredDailyEntries
    .filter((entry) => entry?.team === "blue")
    .sort(dailyEntrySort);
  const dailyMaintenanceActive = !!dailyStatus?.maintenanceMode;
  const dailySections = shouldPrepareDailyStandaloneView
    ? [
        { key: DAILY_OVERVIEW_SECTION, playable: false, available: true },
        {
          key: DAILY_MONSTROUS_MODE,
          playable: true,
          available: !!dailyStatus.ready && !dailyMaintenanceActive,
          played: !!dailyStatus.hasPlayedMonstrous,
          result: getDailyModeResult(DAILY_MONSTROUS_MODE),
        },
        {
          key: DAILY_SPECIAL_MODE,
          playable: true,
          available: !!dailyStatus.ready && !dailyMaintenanceActive,
          played: !!dailyStatus.hasPlayedSpecial,
          result: getDailyModeResult(DAILY_SPECIAL_MODE),
        },
        {
          key: DAILY_FAKE_TWINS_MODE,
          playable: true,
          available: !!dailyStatus.ready && !dailyMaintenanceActive,
          played: !!dailyStatus.hasPlayedFakeTwins,
          result: getDailyModeResult(DAILY_FAKE_TWINS_MODE),
        },
      ]
    : [];
  const selectedDailySectionState =
    dailySections.find((entry) => entry.key === dailySection) || dailySections[0];
  const selectedDailyEntriesCount = filteredDailyEntries.length;
  const overallDailyResultsSummary = [
    getDailyModeResult(DAILY_MONSTROUS_MODE)
      ? `Monstrueuse : ${getDailyModeResult(DAILY_MONSTROUS_MODE).score || 0} pts`
      : null,
    getDailyModeResult(DAILY_SPECIAL_MODE)
      ? `3 mots : ${getDailyModeResult(DAILY_SPECIAL_MODE).score || 0} pts`
      : null,
    getDailyModeResult(DAILY_FAKE_TWINS_MODE)
      ? `Faux jumeaux : ${getDailyModeResult(DAILY_FAKE_TWINS_MODE).score || 0} pts`
      : null,
  ].filter(Boolean);
  const dailyHomePanelClass = "border-amber-200/25 bg-slate-950/35 text-amber-50";
  const dailyHomeInnerPanelClass = "border-amber-200/20 bg-slate-950/30 text-amber-50";
  const dailyHomeRowBorderClass = "border-amber-200/10";
  const dailyHomeActiveButtonClass =
    "border border-amber-300/70 bg-gradient-to-b from-amber-200 to-amber-600 text-slate-950 shadow";
  const dailyHomeInactiveButtonClass =
    "border border-amber-200/25 bg-slate-950/35 text-amber-50 hover:bg-slate-950/50";

  const renderDailyBoardList = (
    entries = filteredDailyEntries,
    maxHeightClass = "max-h-[360px]",
    emptyLabel = "Aucun score pour le moment."
  ) => (
    <div
      className={`rounded-xl border px-3 py-2 ${maxHeightClass} overflow-auto ${dailyHomePanelClass}`}
    >
      {entries.length ? (
        entries.map((entry, idx) => {
          const isPalier = !!entry?.isPalier;
          const label = entry?.rightLabel
            ? entry.rightLabel
            : formatDailyEntryLabel(entry, { includeWords: true, includeGobbles: false });
          const gobbleBadge = !isPalier ? renderGobbleBadge(entry?.gobbles) : null;
          const isSelfDaily =
            !isPalier &&
            ((entry?.installId && installId && entry.installId === installId) ||
              (entry?.nick && selfNick && entry.nick === selfNick));
          return (
            <div
              key={entry?.playerKey || entry?.installId || `${entry?.nick}-${idx}`}
              className={`flex items-center justify-between gap-3 py-2 text-sm border-b last:border-b-0 ${dailyHomeRowBorderClass} ${
                isPalier ? "text-amber-200" : ""
              } ${
                isSelfDaily
                  ? "bg-emerald-900/30 text-emerald-100"
                  : ""
              }`}
            >
              <div className="flex items-center gap-2 min-w-0">
                <span className="text-[11px] font-black tabular-nums w-6 text-right opacity-70">
                  {idx + 1}
                </span>
                <span className="truncate font-semibold flex items-center gap-1">
                  {entry?.nick || "Joueur"}
                  {renderHumanDot(entry?.nick, entry)}
                  {gobbleBadge}
                </span>
              </div>
              <span className="text-[11px] font-semibold opacity-80 shrink-0">{label}</span>
            </div>
          );
        })
      ) : (
        <div className="text-xs opacity-70 py-6 text-center">{emptyLabel}</div>
      )}
    </div>
  );
  const renderDailyBattleList = (maxHeightClass = "max-h-[46vh] sm:max-h-[520px]") => {
    const redCountedCap = Math.max(0, Number(dailyBattleCountedPlayersByTeam?.red) || 0);
    const blueCountedCap = Math.max(0, Number(dailyBattleCountedPlayersByTeam?.blue) || 0);
    const requestedGlobalCountedCap = Math.max(0, Math.min(redCountedCap, blueCountedCap));
    const sections = [
      {
        team: "red",
        title: "Rouges",
        titleClass: "text-red-500",
        entries: dailyTodayRedEntries,
      },
      {
        team: "blue",
        title: "Bleus",
        titleClass: "text-blue-500",
        entries: dailyTodayBlueEntries,
      },
    ];
    const sectionRowsBase = sections.map((section) => {
      const totalCount = Array.isArray(section.entries) ? section.entries.length : 0;
      const parsedRows = section.entries.map((entry, idx) => {
        const label = Number.isFinite(entry?.score) ? `${entry.score} pts` : "-";
        const gobbleBadge = renderGobbleBadge(entry?.gobbles);
        const normalizedInstallId = normalizeInstallId(entry?.installId);
        const isIgnored =
          normalizedInstallId && dailyBattleIgnoredInstallIds.has(normalizedInstallId);
        const isSelfDaily =
          (entry?.installId && installId && entry.installId === installId) ||
          (entry?.nick && selfNick && entry.nick === selfNick);
        return {
          entry,
          idx,
          label,
          gobbleBadge,
          isIgnored,
          isSelfDaily,
        };
      });
      return {
        ...section,
        totalCount,
        parsedRows,
        eligibleCount: parsedRows.filter((row) => !row.isIgnored).length,
      };
    });
    const globalCountedCap = Math.max(
      0,
      Math.min(requestedGlobalCountedCap, ...sectionRowsBase.map((section) => section.eligibleCount))
    );
    const sectionsWithRows = sectionRowsBase.map((section) => {
      let eligibleRank = 0;
      const parsedRows = section.parsedRows.map((row) => {
        if (row.isIgnored) return { ...row, isCounted: false };
        eligibleRank += 1;
        return { ...row, isCounted: eligibleRank <= globalCountedCap };
      });
      return {
        ...section,
        parsedRows,
        countedRows: parsedRows.filter((row) => row.isCounted),
        otherRows: parsedRows.filter((row) => !row.isCounted),
      };
    });
    const hasAnyRows = sectionsWithRows.some((section) => section.totalCount > 0);
    const hasCountedRows = sectionsWithRows.some((section) => section.countedRows.length > 0);

    const renderDailyBattleRow = (row, team, options = {}) => {
      const { insideCountedFrame = false } = options;
      const rowKey = row.entry?.playerKey || row.entry?.installId || `${row.entry?.nick}-${row.idx}`;
      return (
        <div
          key={rowKey}
          className={`px-2 py-2 text-sm ${
            insideCountedFrame
              ? `border-b last:border-b-0 ${dailyHomeRowBorderClass}`
              : `rounded-lg border ${dailyHomeInnerPanelClass}`
          } ${
            row.isSelfDaily
              ? "bg-emerald-900/30 text-emerald-100"
              : ""
          } ${row.isIgnored ? "opacity-60" : ""}`}
        >
          <div className="flex flex-col gap-0.5 min-w-0">
            <div className="flex items-center gap-1.5 min-w-0">
              <span className="text-[11px] font-black tabular-nums w-6 text-right opacity-70 shrink-0">
                {row.idx + 1}
              </span>
              <span className="min-w-0 truncate text-[11px] sm:text-xs font-semibold flex items-center gap-1">
                {row.entry?.nick || "Joueur"}
                {renderHumanDot(row.entry?.nick, { ...row.entry, team })}
                {row.gobbleBadge}
              </span>
            </div>
            <div className="pl-7 text-[10px] font-semibold opacity-80 leading-tight break-words">
              {row.label}
            </div>
          </div>
        </div>
      );
    };

    return (
      <div
        className={`rounded-xl px-3 py-2 ${maxHeightClass} overflow-y-auto custom-scrollbar custom-scrollbar-gray ${
          isMobileLayout ? "bg-slate-950/30" : `border ${dailyHomePanelClass}`
        }`}
      >
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3 items-start">
            {sectionsWithRows.map((section) => {
              return (
                <div key={`daily-battle-section-${section.team}`} className="space-y-1.5 min-w-0">
                  <div className="flex flex-col items-center gap-0.5 text-center">
                    <div className={`text-xs font-black uppercase tracking-[0.14em] ${section.titleClass}`}>
                      {section.title}
                    </div>
                    <div className="text-[11px] font-semibold opacity-70">
                      {section.countedRows.length}/{section.totalCount} comptés
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
          {hasAnyRows ? (
            <>
              {hasCountedRows ? (
                <div
                  className={`rounded-lg border overflow-hidden px-2 py-2 ${
                    "border-amber-300/50 bg-amber-300/10"
                  }`}
                >
                  <div className="grid grid-cols-2 gap-3 items-start">
                    {sectionsWithRows.map((section) => (
                      <div key={`daily-battle-counted-${section.team}`} className="space-y-0 min-w-0">
                        {section.countedRows.map((row) =>
                          renderDailyBattleRow(row, section.team, { insideCountedFrame: true })
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              ) : null}
              <div className="grid grid-cols-2 gap-3 items-start">
                {sectionsWithRows.map((section) => (
                  <div key={`daily-battle-other-${section.team}`} className="space-y-1.5 min-w-0">
                    {section.otherRows.length ? (
                      section.otherRows.map((row) => renderDailyBattleRow(row, section.team))
                    ) : section.totalCount === 0 ? (
                      <div className="text-xs opacity-70 py-3 text-center">Aucun score pour le moment.</div>
                    ) : null}
                  </div>
                ))}
              </div>
            </>
          ) : (
            <div className="text-xs opacity-70 py-3 text-center">Aucun score pour le moment.</div>
          )}
        </div>
      </div>
    );
  };
  const renderDailyTodaySplit = (maxHeightClass = "max-h-[46vh] sm:max-h-[520px]") => (
    (() => {
      const fillHeight = String(maxHeightClass || "").includes("h-full");
      const listHeightClass = fillHeight ? "h-full min-h-0" : maxHeightClass;
      return (
        <div className={fillHeight ? "h-full min-h-0 flex flex-col gap-2" : "space-y-2"}>
          <div className="grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-2">
            <div className="text-red-500 text-center truncate text-xl sm:text-2xl font-black tabular-nums">
              {dailyBattleRedBalanced}
            </div>
            <div className="opacity-70 text-xs">VS</div>
            <div className="text-blue-500 text-center truncate text-xl sm:text-2xl font-black tabular-nums">
              {dailyBattleBlueBalanced}
            </div>
          </div>
          <div className={fillHeight ? "flex-1 min-h-0" : ""}>
            {renderDailyBattleList(listHeightClass)}
          </div>
        </div>
      );
    })()
  );
  const dailyHistoryFoundDotStyle = {
    width: "0.4rem",
    height: "0.4rem",
    borderRadius: "9999px",
    backgroundColor: menuDarkMode ? "#f8fafc" : "#0f172a",
    flexShrink: 0,
  };
  const renderDailyHistoryWords = (page) => {
    if (
      dailySection !== DAILY_MONSTROUS_MODE &&
      dailySection !== DAILY_SPECIAL_MODE &&
      dailySection !== DAILY_FAKE_TWINS_MODE
    ) {
      return null;
    }
    const words = Array.isArray(page?.findableWords) ? page.findableWords : [];
    const selfEntry = Array.isArray(page?.entries)
      ? page.entries.find((entry) => entry?.installId && installId && entry.installId === installId)
      : null;
    if (!words.length) {
      return (
        <div className="text-xs opacity-70 py-3 text-center">
          Liste des mots indisponible pour cette grille.
        </div>
      );
    }
    const foundSet = new Set(
      (Array.isArray(page?.myWords) ? page.myWords : [])
        .map((word) => String(word || "").trim())
        .filter(Boolean)
    );
    const highlightUnavailable =
      !!selfEntry && (Number(selfEntry?.wordsCount) || 0) > 0 && foundSet.size === 0;
    return (
      <div className="space-y-2">
        <div className="flex items-center justify-between gap-2">
          <div className="text-sm font-semibold">Mots trouvables</div>
          <div className="text-[11px] opacity-70">{words.length}</div>
        </div>
        {highlightUnavailable ? (
          <div className="text-[11px] opacity-70">
            Mise en surbrillance indisponible pour cette ancienne grille.
          </div>
        ) : null}
        <div className="max-h-[240px] overflow-y-auto custom-scrollbar custom-scrollbar-gray pr-1">
          <ul className="relative flex flex-col text-sm">
            {words.map((word) => {
              const isFound = foundSet.has(word);
              return (
                <li
                  key={`daily-history-word-${page?.dateId || "day"}-${word}`}
                  className="rounded px-1 flex items-center justify-between gap-2 transition hover:bg-slate-950/45"
                >
                  <button
                    type="button"
                    className="flex items-center gap-2 text-left min-w-0"
                    onClick={() => openDefinition(word)}
                    aria-label={`Voir la définition de ${word}`}
                    title="Voir la définition"
                  >
                    <span
                      style={{
                        ...dailyHistoryFoundDotStyle,
                        opacity: isFound ? 1 : 0,
                      }}
                      aria-hidden="true"
                    />
                    <span
                      className={`min-w-0 truncate ${
                        isFound
                          ? "font-semibold"
                          : "text-amber-50/70"
                      }`}
                    >
                      {word}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
      </div>
    );
  };
  const renderDailyHistorySlider = (pages = filteredDailyHistoryPages, panelHeightClass = "max-h-[320px]") =>
    dailyHistoryPageCount > 0 ? (
      <div
        className={
          String(panelHeightClass || "").includes("h-full")
            ? "h-full min-h-0 flex flex-col gap-2"
            : "space-y-2"
        }
      >
        <div className="text-sm font-semibold">Historique</div>
        {dailyHistoryLoading ? (
          <div className="text-xs opacity-70">Chargement...</div>
        ) : dailyHistoryError ? (
          <div className="text-xs text-red-500">Erreur historique ({dailyHistoryError})</div>
        ) : (
          <>
            <div
              ref={dailyHistoryScrollRef}
              className={`flex gap-3 overflow-x-auto scroll-smooth snap-x snap-mandatory pb-2 ${
                String(panelHeightClass || "").includes("h-full") ? "flex-1 min-h-0" : ""
              }`}
              onScroll={(e) => {
                const el = e.currentTarget;
                const width = el.clientWidth || 1;
                const page = Math.round(el.scrollLeft / width);
                if (page !== dailyHistoryIndex) setDailyHistoryIndex(page);
              }}
            >
              {pages.map((page, idx) => (
                <div
                  key={`daily-history-${page.type}-${idx}`}
                  className={`w-full shrink-0 snap-start ${
                    String(panelHeightClass || "").includes("h-full") ? "h-full min-h-0" : ""
                  }`}
                >
                  <div
                    className={`rounded-xl border px-3 py-3 ${dailyHomePanelClass} ${
                      String(panelHeightClass || "").includes("h-full")
                        ? "h-full min-h-0 flex flex-col"
                        : ""
                    }`}
                  >
                    {page.type === "day" ? (
                      <>
                        <div className="flex items-baseline justify-between gap-2 mb-2">
                          <div className="text-sm font-bold">Date : {page.dateId}</div>
                          {Number.isFinite(
                            dailySection === DAILY_OVERVIEW_SECTION
                              ? Array.isArray(page?.entries)
                                ? page.entries.length
                                : page.totalPlayers
                              : Array.isArray(page.entries)
                              ? page.entries.length
                              : null
                          ) ? (
                            <div className="text-[11px] opacity-70">
                              {dailySection === DAILY_OVERVIEW_SECTION
                                ? Array.isArray(page?.entries)
                                  ? page.entries.length
                                  : page.totalPlayers
                                : Array.isArray(page.entries)
                                ? page.entries.length
                                : 0}{" "}
                              joueurs
                            </div>
                          ) : null}
                        </div>
                        <div
                          className={`${
                            String(panelHeightClass || "").includes("h-full")
                              ? "flex-1 min-h-0"
                              : panelHeightClass
                          } overflow-y-auto custom-scrollbar custom-scrollbar-gray pr-1 space-y-3`}
                        >
                          {dailySection === DAILY_OVERVIEW_SECTION && page?.battle ? (
                            <div className="space-y-1">
                              <div className="grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-2">
                                <span className="text-red-500 text-center truncate text-lg sm:text-xl font-black tabular-nums">
                                  {Number(page?.battle?.totalsBalancedByTeam?.red) || 0}
                                </span>
                                <span className="opacity-70 text-[11px]">VS</span>
                                <span className="text-blue-500 text-center truncate text-lg sm:text-xl font-black tabular-nums">
                                  {Number(page?.battle?.totalsBalancedByTeam?.blue) || 0}
                                </span>
                              </div>
                              {page?.battle?.winnerTeam === "red" ? (
                                <div className="text-xs text-center">
                                  <span className="font-bold text-red-500">ROUGES</span>{" "}
                                  <span className="opacity-80">gagnent !</span>
                                </div>
                              ) : page?.battle?.winnerTeam === "blue" ? (
                                <div className="text-xs text-center">
                                  <span className="font-bold text-blue-500">BLEUS</span>{" "}
                                  <span className="opacity-80">gagnent !</span>
                                </div>
                              ) : (
                                <div className="text-xs text-center opacity-70">Match nul</div>
                              )}
                              <div className="text-[11px] text-center opacity-70">
                                {Number(page?.battle?.countedPlayersByTeam?.red) || 0} rouges vs{" "}
                                {Number(page?.battle?.countedPlayersByTeam?.blue) || 0} bleus comptabilisés
                              </div>
                            </div>
                          ) : null}
                          {dailySection === DAILY_OVERVIEW_SECTION ? (
                            Array.isArray(page?.entries) && page.entries.length > 0 ? (
                              <div
                                className={`rounded-lg border overflow-hidden ${dailyHomeInnerPanelClass}`}
                              >
                                <div
                                  className={`px-3 py-2 text-[11px] font-bold uppercase tracking-[0.14em] text-amber-50/75 border-b ${dailyHomeRowBorderClass}`}
                                >
                                  Classement cumulé du jour
                                </div>
                                <div>
                                  {page.entries.map((entry, entryIdx) => {
                                    const label = formatDailyEntryLabel(entry, {
                                      includeWords: false,
                                      includeGobbles: false,
                                    });
                                    const gobbleBadge = renderGobbleBadge(entry?.gobbles);
                                    return (
                                      <div
                                        key={entry?.playerKey || entry?.installId || `${entry?.nick}-${entryIdx}`}
                                        className={`flex items-center justify-between gap-3 py-2 px-3 text-sm border-b last:border-b-0 ${dailyHomeRowBorderClass}`}
                                      >
                                        <div className="flex items-center gap-2 min-w-0">
                                          <span className="text-[11px] font-black tabular-nums w-6 text-right opacity-70">
                                            {entryIdx + 1}
                                          </span>
                                          <span className="truncate font-semibold flex items-center gap-1">
                                            {entry?.nick || "Joueur"}
                                            {renderHumanDot(entry?.nick, entry)}
                                            {gobbleBadge}
                                          </span>
                                        </div>
                                        <span className="text-[11px] font-semibold opacity-80 shrink-0">
                                          {label}
                                        </span>
                                      </div>
                                    );
                                  })}
                                </div>
                              </div>
                            ) : !page?.battle ? (
                              <div className="text-xs opacity-70 py-6 text-center">
                                Résumé duel indisponible pour ce jour.
                              </div>
                            ) : (
                              <div className="text-xs opacity-70 py-6 text-center">
                                Aucun score pour ce jour.
                              </div>
                            )
                          ) : Array.isArray(page.entries) && page.entries.length > 0 ? (
                            <div>
                              {page.entries.map((entry, entryIdx) => {
                                const label = formatDailyEntryLabel(entry, {
                                  includeWords: true,
                                  includeGobbles: false,
                                });
                                const gobbleBadge = renderGobbleBadge(entry?.gobbles);
                                return (
                                  <div
                                    key={entry?.installId || `${entry?.nick}-${entryIdx}`}
                                    className={`flex items-center justify-between gap-3 py-2 text-sm border-b last:border-b-0 ${dailyHomeRowBorderClass}`}
                                  >
                                    <div className="flex items-center gap-2 min-w-0">
                                      <span className="text-[11px] font-black tabular-nums w-6 text-right opacity-70">
                                        {entryIdx + 1}
                                      </span>
                                      <span className="truncate font-semibold flex items-center gap-1">
                                        {entry?.nick || "Joueur"}
                                        {renderHumanDot(entry?.nick, entry)}
                                        {gobbleBadge}
                                      </span>
                                    </div>
                                    <span className="text-[11px] font-semibold opacity-80 shrink-0">
                                      {label}
                                    </span>
                                  </div>
                                );
                              })}
                            </div>
                          ) : (
                            <div className="text-xs opacity-70 py-6 text-center">
                              Aucun score pour ce jour.
                            </div>
                          )}
                          {dailySection !== DAILY_OVERVIEW_SECTION ? (
                            <div
                              className={`pt-3 border-t ${dailyHomeRowBorderClass}`}
                            >
                              {renderDailyHistoryWords(page)}
                            </div>
                          ) : null}
                        </div>
                      </>
                    ) : (
                      <>
                        <div className="flex items-baseline justify-between gap-2 mb-2">
                          <div className="text-sm font-bold">Total couronnes</div>
                        </div>
                        {Array.isArray(page.crownTotals) && page.crownTotals.length > 0 ? (
                          <div
                            className={`${
                              String(panelHeightClass || "").includes("h-full")
                                ? "flex-1 min-h-0"
                                : panelHeightClass
                            } overflow-y-auto custom-scrollbar custom-scrollbar-gray pr-1`}
                          >
                            {page.crownTotals.map((entry, entryIdx) => (
                              <div
                                key={`${entry.nick}-${entryIdx}`}
                                className={`flex items-center justify-between gap-3 py-2 text-sm border-b last:border-b-0 ${dailyHomeRowBorderClass}`}
                              >
                                <div className="flex items-center gap-2 min-w-0">
                                  <span className="text-[11px] font-black tabular-nums w-6 text-right opacity-70">
                                    {entryIdx + 1}
                                  </span>
                                  <span className="truncate font-semibold flex items-center gap-1">
                                    {entry?.nick || "Joueur"}
                                    {entryIdx === 0 ? renderCrownIcon() : null}
                                  </span>
                                </div>
                                <span className="text-[11px] font-semibold opacity-80 shrink-0">
                                  {entry.crowns || 0} couronne{entry.crowns > 1 ? "s" : ""}
                                </span>
                              </div>
                            ))}
                          </div>
                        ) : (
                          <div className="text-xs opacity-70 py-6 text-center">
                            Aucune couronne pour l'instant.
                          </div>
                        )}
                      </>
                    )}
                  </div>
                </div>
              ))}
            </div>
            {pages.length > 1 ? (
              <div className="flex items-center justify-center gap-2">
                {pages.map((_, idx) => {
                  const active = idx === dailyHistoryIndex;
                  const dotColor = active
                    ? "bg-amber-300"
                    : "bg-amber-100/30";
                  return (
                    <button
                      key={`daily-history-dot-${idx}`}
                      type="button"
                      className={`h-2.5 w-2.5 rounded-full transition ${dotColor} ${
                        active ? "scale-110" : ""
                      }`}
                      aria-label={`Page ${idx + 1}`}
                      aria-current={active ? "true" : undefined}
                      onClick={() => {
                        const el = dailyHistoryScrollRef.current;
                        if (!el) return;
                        const width = el.clientWidth || 1;
                        el.scrollTo({ left: idx * width, behavior: "smooth" });
                        setDailyHistoryIndex(idx);
                      }}
                    />
                  );
                })}
              </div>
            ) : null}
          </>
        )}
      </div>
    ) : null;
  const dailyLaunchDialogView = dailyLaunchDialog ? (
    <div className="fixed inset-0 z-[20140] flex items-center justify-center px-4">
      <button
        type="button"
        className="absolute inset-0 bg-black/55 backdrop-blur-[2px]"
        onClick={closeDailyLaunchDialog}
        aria-label="Fermer la confirmation de grille du jour"
      />
      <div
        className="relative w-full max-w-md overflow-hidden rounded-[28px] border-2 border-amber-300/70 bg-[linear-gradient(180deg,rgba(18,47,103,0.97),rgba(7,22,55,0.99))] text-amber-50 shadow-2xl"
      >
        <div className={`h-2 w-full bg-gradient-to-r ${selectedDailySectionMeta.accentClass}`} />
        <div className="p-5 space-y-4">
          <div className="space-y-1">
            <div className="text-[11px] uppercase tracking-[0.22em] font-black opacity-60">
              Grilles du jour
            </div>
            <div className="text-2xl font-black leading-tight">
              Lancer {getDailySectionMeta(dailyLaunchDialog.mode).label}
            </div>
            <div className="text-sm opacity-80">
              Assurez-vous d'avoir une connexion stable avant de lancer la grille.
            </div>
          </div>
          <div
            className={`rounded-2xl border px-4 py-3 text-sm ${dailyHomeInnerPanelClass}`}
          >
            Une fois lancée, la tentative compte pour le duel hebdomadaire indépendamment du live.
          </div>
          <div className="flex items-center gap-3">
            <button
              type="button"
              className={`flex-1 rounded-2xl px-4 py-3 text-sm font-semibold ${dailyHomeInactiveButtonClass}`}
              onClick={closeDailyLaunchDialog}
            >
              Annuler
            </button>
            <button
              type="button"
              className={`flex-1 rounded-2xl px-4 py-3 text-sm font-semibold ${dailyHomeActiveButtonClass}`}
              onClick={confirmDailyLaunch}
            >
              Jouer
            </button>
          </div>
        </div>
      </div>
    </div>
  ) : null;

  if (appView === "daily") {
    const dailyTodayHeightClass = isMobileLayout ? "h-full min-h-0" : "max-h-[46vh] sm:max-h-[520px]";
    const dailyHistoryHeightClass = isMobileLayout ? "h-full min-h-0" : "max-h-[520px]";
    return (
      <>
        {tutorialOverlay}
        {authDialogView}
        {settingsMenuView}
        {aboutModalView}
        {quickHelpOverlay}
        {dailyLaunchDialogView}
        <div
          className={`relative overflow-hidden text-amber-50 ${
            isMobileLayout
              ? "h-[100svh] min-h-[100svh] flex items-stretch justify-center px-2 py-2"
              : "min-h-screen flex items-center justify-center px-4"
          }`}
        >
          <div
            className="absolute inset-0 bg-cover bg-center"
            style={{
              backgroundImage: `url('${
                isMobileLayout ? homeBackgroundMobile : homeBackgroundDesktop
              }')`,
            }}
            aria-hidden="true"
          />
          <div className="absolute inset-0 bg-black/42 backdrop-blur-[1px]" aria-hidden="true" />
          <div
            className={`relative z-[1] w-full max-w-2xl rounded-2xl border-2 border-amber-300/70 shadow-2xl bg-[linear-gradient(180deg,rgba(18,47,103,0.94),rgba(7,22,55,0.97))] text-amber-50 ${
              isMobileLayout ? "h-full min-h-0 flex flex-col p-3 gap-2 overflow-hidden" : "p-4 sm:p-6 space-y-4"
            }`}
          >
            <div className="flex items-center justify-between gap-3">
              <div>
                <div className="text-2xl font-black tracking-tight">Grilles du jour</div>
                <div className="text-xs opacity-70">
                  {dailyStatus?.dateId ? `Date : ${dailyStatus.dateId}` : "Chargement..."}
                </div>
              </div>
              <button
                type="button"
                className={`px-3 py-2 rounded-lg text-xs font-semibold transition ${
                  "border border-amber-300/70 bg-gradient-to-b from-amber-200 to-amber-600 text-slate-950 shadow"
                }`}
                onClick={() => setAppView("home")}
              >
                Retour accueil
              </button>
            </div>

            <div className={isMobileLayout ? "flex-1 min-h-0 flex flex-col gap-2" : "space-y-4"}>
            <div
              className={`rounded-2xl border p-3 sm:p-4 space-y-3 ${
                "border-amber-200/25 bg-slate-950/35"
              }`}
            >
              <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div className="space-y-1">
                  <div className="text-[11px] uppercase tracking-[0.22em] font-black opacity-60">
                    {isMobileLayout ? "Duel" : "Duel hebdomadaire"}
                  </div>
                  {isMobileLayout ? (
                    <div className="text-sm font-black">200 points de duel à remporter aujourd'hui.</div>
                  ) : (
                    <>
                      <div className="text-sm sm:text-base font-black">
                        Les grilles du jour comptent pour le duel, indépendamment du live.
                      </div>
                      <div className="opacity-75 text-sm">
                        L'équipe gagnante du jour empoche 200 points de duel. Même un score modeste reste
                        utile pour pousser ton camp.
                      </div>
                    </>
                  )}
                </div>
                <div className="grid grid-cols-[auto_auto_auto] items-center justify-center gap-2 text-sm font-black self-center sm:self-start mx-auto">
                  <span className="text-red-500 tabular-nums">{dailyBattleRedBalanced}</span>
                  <span className="opacity-60">VS</span>
                  <span className="text-blue-500 tabular-nums">{dailyBattleBlueBalanced}</span>
                </div>
              </div>
              {!isMobileLayout && overallDailyResultsSummary.length ? (
                <div className="flex flex-wrap gap-2">
                  {overallDailyResultsSummary.map((item) => (
                  <span
                    key={item}
                    className="rounded-full border border-amber-200/20 bg-slate-950/35 px-3 py-1 text-[11px] font-semibold text-amber-50/85"
                  >
                      {item}
                    </span>
                  ))}
                </div>
              ) : null}
            </div>

            {!dailyBoard.ready ? (
              <div className="text-sm font-semibold text-amber-500">Grilles en préparation...</div>
            ) : null}
            {dailyMaintenanceActive ? (
              <div className="rounded-xl border border-orange-300/50 bg-orange-500/15 px-3 py-2 text-sm font-extrabold text-orange-300">
                Maintenance en cours
              </div>
            ) : null}
            {dailyStatus.error ? (
              <div className="text-xs text-red-500">Erreur daily ({dailyStatus.error})</div>
            ) : null}
            {dailyBoard.error ? (
              <div className="text-xs text-red-500">Erreur classement ({dailyBoard.error})</div>
            ) : null}

            <div className="grid grid-cols-4 gap-2">
              {dailySections.map((section) => {
                const meta = getDailySectionMeta(section.key);
                const active = dailySection === section.key;
                return (
                  <button
                    key={section.key}
                    type="button"
                    className={`min-w-0 px-2 py-2 rounded-xl font-semibold transition ${
                      active
                        ? dailyHomeActiveButtonClass
                        : dailyHomeInactiveButtonClass
                    } ${isMobileLayout ? "text-[10px] leading-tight tracking-[-0.01em]" : "text-xs"}`}
                    onClick={() => {
                      setDailySection(section.key);
                      setDailyHistoryIndex(0);
                    }}
                  >
                    <span className="block truncate">{meta.shortLabel}</span>
                  </button>
                );
              })}
            </div>

            <div
              className={`overflow-hidden rounded-2xl border ${dailyHomePanelClass} ${
                isMobileLayout ? "flex-1 min-h-0 flex flex-col" : ""
              }`}
            >
              <div className={`h-1.5 w-full bg-gradient-to-r ${selectedDailySectionMeta.accentClass}`} />
              <div className={isMobileLayout ? "p-3 flex-1 min-h-0 flex flex-col gap-3" : "p-4 space-y-4"}>
                <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                  <div className="space-y-1">
                    <div className="text-xl font-black">{selectedDailySectionMeta.label}</div>
                    <div className="text-sm opacity-75">{selectedDailySectionMeta.description}</div>
                    {dailySection === DAILY_MONSTROUS_MODE ||
                    dailySection === DAILY_SPECIAL_MODE ||
                    dailySection === DAILY_FAKE_TWINS_MODE ? (
                      <div className="text-xs font-semibold opacity-80">
                        {!isMobileLayout && dailySection === DAILY_SPECIAL_MODE
                          ? "—"
                          : dailyScoreLabel != null
                          ? `${dailyScoreLabel} pts${dailyGobblesLabel ? ` · ${dailyGobblesLabel}` : ""}`
                          : "Pas encore de score"}
                        {dailyRankLabel != null ? ` · Rang #${dailyRankLabel}` : ""}
                        {selectedDailyEntriesCount ? ` · ${selectedDailyEntriesCount} joueurs` : ""}
                      </div>
                    ) : dailySection === DAILY_OVERVIEW_SECTION ? (
                      !isMobileLayout ? (
                        <div className="text-xs font-semibold opacity-80">
                          Classement global et historique de toutes les grilles du jour.
                        </div>
                      ) : null
                    ) : (
                      <div className="text-xs font-semibold opacity-80">
                        Cette rubrique est réservée à une prochaine grille daily.
                      </div>
                    )}
                    {dailyStartError ? (
                      <div className="text-[11px] font-bold text-red-400">{dailyStartError}</div>
                    ) : null}
                  </div>
                  {dailySection !== DAILY_OVERVIEW_SECTION && dailySection !== DAILY_FUTURE_SECTION ? (
                    <div className="w-full md:w-auto md:min-w-[180px]">
                      <button
                        type="button"
                        className={`w-full rounded-2xl px-4 py-3 text-sm font-semibold transition ${
                          !selectedDailySectionState.playable ||
                          !selectedDailySectionState.available ||
                          ((dailySection === DAILY_MONSTROUS_MODE ||
                            dailySection === DAILY_SPECIAL_MODE ||
                            dailySection === DAILY_FAKE_TWINS_MODE) &&
                            selectedDailySectionState.played)
                            ? "bg-slate-400/60 text-white cursor-not-allowed"
                            : dailyHomeActiveButtonClass
                        }`}
                        disabled={
                          !selectedDailySectionState.playable ||
                          !selectedDailySectionState.available ||
                          ((dailySection === DAILY_MONSTROUS_MODE ||
                            dailySection === DAILY_SPECIAL_MODE ||
                            dailySection === DAILY_FAKE_TWINS_MODE) &&
                            selectedDailySectionState.played)
                        }
                        onClick={() => openDailyLaunchDialog(dailySection)}
                      >
                        {(dailySection === DAILY_MONSTROUS_MODE ||
                          dailySection === DAILY_SPECIAL_MODE ||
                          dailySection === DAILY_FAKE_TWINS_MODE) &&
                        selectedDailySectionState.played
                          ? "Déjà jouée"
                          : "Jouer"}
                      </button>
                    </div>
                  ) : null}
                </div>

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition ${
                      dailyRankingView === "today"
                        ? dailyHomeActiveButtonClass
                        : dailyHomeInactiveButtonClass
                    }`}
                    onClick={() => setDailyRankingView("today")}
                  >
                    Classement
                  </button>
                  <button
                    type="button"
                    className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition ${
                      dailyRankingView === "history"
                        ? dailyHomeActiveButtonClass
                        : dailyHomeInactiveButtonClass
                    }`}
                    onClick={() => setDailyRankingView("history")}
                    disabled={dailyHistoryPageCount === 0}
                  >
                    Historique
                  </button>
                </div>

                <div className={isMobileLayout ? "min-h-0 flex-1" : ""}>
                  {dailyRankingView === "today" ? (
                    dailySection === DAILY_OVERVIEW_SECTION ? (
                      renderDailyTodaySplit(dailyTodayHeightClass)
                    ) : dailySection === DAILY_FUTURE_SECTION ? (
                      <div className="text-xs opacity-70 py-8 text-center">
                        Classement à venir dès que la nouvelle grille sera en ligne.
                      </div>
                    ) : (
                      renderDailyBoardList(filteredDailyEntries, dailyTodayHeightClass)
                    )
                  ) : (
                    renderDailyHistorySlider(filteredDailyHistoryPages, dailyHistoryHeightClass) || (
                      <div className="text-xs opacity-70 py-6 text-center">
                        Aucun historique disponible.
                      </div>
                    )
                  )}
                </div>
              </div>
            </div>
            </div>
          </div>
        </div>
        {globalChatLayer}
        {chatOverlays}
      </>
    );
  }

  if (appView === "daily_results") {
    return (
      <>
        {tutorialOverlay}
        {authDialogView}
        {settingsMenuView}
        {aboutModalView}
        {quickHelpOverlay}
        <div
          className={`min-h-screen flex items-center justify-center px-4 ${
            darkMode
              ? "bg-gradient-to-br from-slate-900 via-slate-950 to-slate-800 text-white"
              : "bg-gradient-to-br from-slate-50 via-white to-slate-100 text-slate-900"
          }`}
        >
          <div
            className={`w-full max-w-2xl rounded-2xl shadow-2xl p-6 space-y-4 ${
              darkMode
                ? "bg-slate-900/70 border border-white/10"
                : "bg-white/90 border border-slate-200"
            }`}
          >
            <div className="flex items-center justify-between gap-3">
              <div>
                <div className="text-2xl font-black tracking-tight">Résultat grille du jour</div>
                <div className="text-xs opacity-70">
                  {dailyResult?.dateId ? `Date : ${dailyResult.dateId}` : ""}
                </div>
              </div>
              <button
                type="button"
                className={`px-3 py-2 rounded-lg text-xs font-semibold transition ${
                  darkMode
                    ? "bg-slate-800/80 border border-white/10 text-slate-100"
                    : "bg-white border border-slate-200 text-slate-700"
                }`}
                onClick={() => setAppView("daily")}
              >
                Retour classement
              </button>
            </div>

            <div className="text-sm font-semibold">
              {dailyScoreLabel != null
                ? `Score : ${dailyScoreLabel} pts${dailyGobblesLabel ? ` · ${dailyGobblesLabel}` : ""}`
                : "Score : -"}
              {dailyRankLabel != null ? ` · Rang #${dailyRankLabel}` : ""}
              {dailyResult?.totalPlayers ? ` / ${dailyResult.totalPlayers}` : ""}
            </div>
            {dailyResult?.mode === DAILY_FAKE_TWINS_MODE &&
              Number.isFinite(dailyResult?.fakeTwinWordsFound) &&
              Number.isFinite(dailyResult?.fakeTwinWordsTotal) && (
                <div className="text-xs font-semibold opacity-80">
                  Faux jumeaux cibles : {dailyResult.fakeTwinWordsFound}/
                  {dailyResult.fakeTwinWordsTotal}
                </div>
              )}
            {dailySubmitError && (
              <div className="text-xs text-red-400">{dailySubmitError}</div>
            )}

            {renderDailyBoardList()}

            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                className="px-4 py-2 rounded-lg text-sm font-semibold transition bg-blue-600 hover:bg-blue-500 text-white"
                onClick={() => setAppView("home")}
              >
                Retour accueil
              </button>
            </div>
          </div>
        </div>
      </>
    );
  }


  return null;
}
