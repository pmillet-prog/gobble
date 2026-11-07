import { buildInfortunePlateaus } from "../../shared/infortunePlateaus.js";
import { createInfortuneRoundEconomy } from "./roundEconomy.js";

export function snapshotInfortunePlayers(room, { isBot, isConnected }) {
  return Array.from(room.players.values()).filter(player => isConnected(player) && !isBot(player)).map(player => ({
    userId: player.userId, installId: player.installId, nick: player.nick, connected: true, isBot: false,
  }));
}

export function finalizeInfortunePlateaus({ round, roomId, infortune, players, ranking, now = Date.now, random, ledger, onEconomyChange, onReward }) {
  if (!infortune) return null;
  if (round.infortune?.groups) return round.infortune;
  Object.assign(infortune, { openedAt: infortune.afterResults ? infortune.openedAt : now(), groups: buildInfortunePlateaus({ roomId, roundId: round.id, players, ranking, random }) });
  if (ledger) {
    round.infortuneGame = createInfortuneRoundEconomy({ ledger, policy: infortune, groups: infortune.groups, now, random, onChange: onEconomyChange, onReward });
    // Reconnection and delayed roundEnded payloads always carry the latest view.
    Object.defineProperty(infortune, "economy", { enumerable: true, get: () => round.infortuneGame.snapshot() });
  }
  round.infortune = Object.freeze(infortune);
  return round.infortune;
}
