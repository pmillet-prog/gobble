import React from "react";
import { useApplicationFields } from "../../app/react/ApplicationRuntimeProvider.jsx";
import { useFeatureFields, useFeatureRuntime, useFeatureSelector } from "../../app/react/useFeatureRuntime.js";
import { buildUserScopedInstallId } from "../../app/adapters/browserIdentity.js";
import StatsApplication from "./StatsApplication.jsx";
import VocabularyProgressPanel from "./VocabularyProgressPanel.jsx";
import { getStatsImageUrl, getStatsProfileUserId } from "./statsPresentation.js";
import { STATS_SEASON_TARGET_LIMIT, STATS_WEEKLY_DISPLAY_LIMIT, WEEKLY_BOARDS } from "./statsConfig.js";

export default function StatsOverlayRuntime() {
  const stats = useFeatureRuntime("stats");
  const overlays = useFeatureRuntime("overlays");
  const chat = useFeatureRuntime("chat");
  const preferences = useFeatureRuntime("preferences");
  const layout = useFeatureRuntime("layout");
  const { authState, nickname, isLoggedIn } = useApplicationFields("session", ["authState", "nickname", "isLoggedIn"]);
  const { isMobileLayout } = useFeatureFields(layout, ["isMobileLayout"]);
  const darkMode = useFeatureSelector(preferences, (state) => !!state.themeVisual?.darkMode);
  const overlayBlocked = useFeatureSelector(overlays, (state) => !!(
    state.authModalMode || state.definitionModal?.open || state.settingsOpen ||
    state.playerProfileModal?.open || state.roundPlayerModal?.open
  ));
  const chatBlocked = useFeatureSelector(chat, (state) => !!(state.rulesOpen || state.userMenu?.open));
  const userId = Number(authState.user?.id);
  const installId = Number.isInteger(userId) && userId > 0 ? buildUserScopedInstallId(userId) : "";
  const renderCrownIcon = (className = "") => (
    <span className={`inline-flex items-center ${darkMode ? "text-amber-300" : "text-amber-600"} ${className}`} title="Equipe gagnante de la semaine precedente">
      <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M4 6l4.5 3 3.5-4 3.5 4L20 6l-2 10H6L4 6zm3 12h10l.4 2H6.6l.4-2z" /></svg>
    </span>
  );
  return (
    <StatsApplication
      appearance={{ darkMode, menuDarkMode: !isLoggedIn || darkMode, isMobileLayout }}
      blockers={{ keyboardBlocked: overlayBlocked || chatBlocked }}
      identity={{ installId, selfNick: String(nickname || "").trim() }}
      navigation={{ onClose: stats.closeOverlay }}
      presentation={{
        getImageUrl: getStatsImageUrl,
        getUserIdFromPlayerProfileTarget: getStatsProfileUserId,
        isCrownedEntry: stats.isCrownedEntry,
        openDefinition: stats.openDefinition,
        openPlayerProfile: overlays.openPlayerProfile,
        playCloseSound: stats.playCloseSound,
        playSwipeSound: stats.playSwipeSound,
        renderCrownIcon,
        renderVocabPanel: (options) => <VocabularyProgressPanel darkMode={darkMode} {...options} />,
      }}
      requests={{ fetchWeeklyStats: stats.fetchWeekly, requestTrophyStatus: stats.requestTrophyStatus }}
      statsConfig={{ seasonTargetLimit: STATS_SEASON_TARGET_LIMIT, weeklyBoardDisplayLimit: STATS_WEEKLY_DISPLAY_LIMIT, weeklyBoards: WEEKLY_BOARDS }}
    />
  );
}
