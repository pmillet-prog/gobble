import { createAdminFeature } from "../features/admin/createAdminFeature.js";
import { createPlayerActivityFeature } from "../features/activity/createPlayerActivityFeature.js";
import { createChatFeature } from "../features/chat/createChatFeature.js";
import { createRoundClockFeature } from "../features/clock/createRoundClockFeature.js";
import { createCelebrationFeature } from "../features/celebration/createCelebrationFeature.js";
import { createConnectionHealthFeature } from "../features/connection/createConnectionHealthFeature.js";
import { createDailyFeature } from "../features/daily/createDailyFeature.js";
import { createClientDictionaryFeature } from "../features/dictionary/createClientDictionaryFeature.js";
import { createPerformanceDiagnosticsFeature } from "../features/diagnostics/createPerformanceDiagnosticsFeature.js";
import { createDuelFeature } from "../features/duel/createDuelFeature.js";
import { createGameplaySessionFeature } from "../features/gameplay/createGameplaySessionFeature.js";
import { createIdentityFeature } from "../features/identity/createIdentityFeature.js";
import { createIntermissionClockFeature } from "../features/intermission/createIntermissionClockFeature.js";
import { createLayoutFeature } from "../features/layout/createLayoutFeature.js";
import { createLiveRosterFeature } from "../features/live/createLiveRosterFeature.js";
import { createLiveFeedFeature } from "../features/live/createLiveFeedFeature.js";
import { createLiveRoundFeature } from "../features/live/createLiveRoundFeature.js";
import { createLiveUiFeature } from "../features/live/createLiveUiFeature.js";
import { createNotificationsFeature } from "../features/notifications/createNotificationsFeature.js";
import { createOcidFeature } from "../features/ocid/createOcidFeature.js";
import { createOverlaysFeature } from "../features/overlays/createOverlaysFeature.js";
import { createPreferencesFeature } from "../features/preferences/createPreferencesFeature.js";
import { createGameProgressFeature } from "../features/progress/createGameProgressFeature.js";
import { createRefreshSchedulerFeature } from "../features/refresh/createRefreshSchedulerFeature.js";
import { createResultsFeature } from "../features/results/createResultsFeature.js";
import { createLiveEntryFeature } from "../features/session/createLiveEntryFeature.js";
import { createSessionPersistenceFeature } from "../features/session/createSessionPersistenceFeature.js";
import { createStatsFeature } from "../features/stats/createStatsFeature.js";
import { createStandaloneTrainingFeature } from "../features/training/createStandaloneTrainingFeature.js";
import { createTutorialFeature } from "../features/tutorial/createTutorialFeature.js";
import { createTraceFeature } from "../features/trace/createTraceFeature.js";

const FEATURE_FACTORIES = Object.freeze({
  activity: createPlayerActivityFeature,
  admin: createAdminFeature,
  chat: createChatFeature,
  clock: createRoundClockFeature,
  celebration: createCelebrationFeature,
  connection: createConnectionHealthFeature,
  daily: createDailyFeature,
  dictionary: createClientDictionaryFeature,
  diagnostics: createPerformanceDiagnosticsFeature,
  duel: createDuelFeature,
  gameplaySession: createGameplaySessionFeature,
  identity: createIdentityFeature,
  intermission: createIntermissionClockFeature,
  layout: createLayoutFeature,
  feed: createLiveFeedFeature,
  roster: createLiveRosterFeature,
  liveUi: createLiveUiFeature,
  liveRound: createLiveRoundFeature,
  notifications: createNotificationsFeature,
  ocid: createOcidFeature,
  overlays: createOverlaysFeature,
  preferences: createPreferencesFeature,
  progress: createGameProgressFeature,
  refresh: createRefreshSchedulerFeature,
  results: createResultsFeature,
  liveEntry: createLiveEntryFeature,
  sessionPersistence: createSessionPersistenceFeature,
  stats: createStatsFeature,
  standaloneTraining: createStandaloneTrainingFeature,
  tutorial: createTutorialFeature,
  trace: createTraceFeature,
});

export const CLIENT_FEATURE_NAMES = Object.freeze(Object.keys(FEATURE_FACTORIES));

export function registerClientFeatures(kernel, options = {}) {
  for (const [name, factory] of Object.entries(FEATURE_FACTORIES)) {
    kernel.features.define(name, (context) => factory(context, options[name]));
  }
  return kernel;
}
