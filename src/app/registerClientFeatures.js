import { createAdminFeature } from "../features/admin/createAdminFeature.js";
import { createPlayerActivityFeature } from "../features/activity/createPlayerActivityFeature.js";
import { createChatFeature } from "../features/chat/createChatFeature.js";
import { createRoundClockFeature } from "../features/clock/createRoundClockFeature.js";
import { createDailyFeature } from "../features/daily/createDailyFeature.js";
import { createDuelFeature } from "../features/duel/createDuelFeature.js";
import { createIdentityFeature } from "../features/identity/createIdentityFeature.js";
import { createIntermissionClockFeature } from "../features/intermission/createIntermissionClockFeature.js";
import { createLayoutFeature } from "../features/layout/createLayoutFeature.js";
import { createLiveRosterFeature } from "../features/live/createLiveRosterFeature.js";
import { createLiveUiFeature } from "../features/live/createLiveUiFeature.js";
import { createNotificationsFeature } from "../features/notifications/createNotificationsFeature.js";
import { createOcidFeature } from "../features/ocid/createOcidFeature.js";
import { createOverlaysFeature } from "../features/overlays/createOverlaysFeature.js";
import { createPreferencesFeature } from "../features/preferences/createPreferencesFeature.js";
import { createRefreshSchedulerFeature } from "../features/refresh/createRefreshSchedulerFeature.js";
import { createResultsFeature } from "../features/results/createResultsFeature.js";
import { createStatsFeature } from "../features/stats/createStatsFeature.js";
import { createTutorialFeature } from "../features/tutorial/createTutorialFeature.js";

const FEATURE_FACTORIES = Object.freeze({
  activity: createPlayerActivityFeature,
  admin: createAdminFeature,
  chat: createChatFeature,
  clock: createRoundClockFeature,
  daily: createDailyFeature,
  duel: createDuelFeature,
  identity: createIdentityFeature,
  intermission: createIntermissionClockFeature,
  layout: createLayoutFeature,
  roster: createLiveRosterFeature,
  liveUi: createLiveUiFeature,
  notifications: createNotificationsFeature,
  ocid: createOcidFeature,
  overlays: createOverlaysFeature,
  preferences: createPreferencesFeature,
  refresh: createRefreshSchedulerFeature,
  results: createResultsFeature,
  stats: createStatsFeature,
  tutorial: createTutorialFeature,
});

export const CLIENT_FEATURE_NAMES = Object.freeze(Object.keys(FEATURE_FACTORIES));

export function registerClientFeatures(kernel, options = {}) {
  for (const [name, factory] of Object.entries(FEATURE_FACTORIES)) {
    kernel.features.define(name, (context) => factory(context, options[name]));
  }
  return kernel;
}
