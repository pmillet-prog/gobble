import { createStateFeature } from "../../app/core/createStateFeature.js";

export function createInitialAdminState() {
  return {
    devAccountAllowed: false,
    devAccountLabel: "",
    devBots: [],
    devControls: {
      animatorBotsEnabled: true,
      botChat: false,
      botMedals: false,
      botReactions: false,
      botsEnabled: true,
      chatFill: false,
      enabled: false,
      forcedRoundRandom: false,
      forcedRoundType: "",
      forcedRoundTypes: [],
      selfBronzeNick: false,
      selfCrown: false,
      selfGoldNick: false,
      selfSilverNick: false,
      trainingEnabled: true,
    },
    devControlsAvailable: false,
    devControlsBusy: false,
    devControlsLocked: true,
    devError: "",
    devMenuOpen: false,
    devMenuTapCount: 0,
    devMenuUnlocked: false,
    devPassword: "",
    devPasswordConfigured: false,
    devPasswordRequired: true,
    devRoundTypes: [],
    moderationAccountLabel: "",
    moderationAvailable: false,
    moderationBusy: false,
    moderationError: "",
    moderationMenuOpen: false,
    moderationPlayers: [],
    perfTestEnabled: false,
    targetWaitDevActiveRoundId: null,
    targetWaitDevArmed: false,
    targetWaitDevGridHost: null,
    targetWaitDevSessionState: {
      bestStreak: 0,
      correctCount: 0,
      phase: "idle",
      remainingSeconds: 90,
      score: 0,
      streak: 0,
      wordLength: 0,
      wrongCount: 0,
    },
    targetWaitDevSideHost: null,
  };
}

export function createAdminFeature(context) {
  return createStateFeature(context, createInitialAdminState);
}
