import { infortunePlayerKey } from "../../shared/infortunePlateaus.js";

// Private, authenticated account data. Never return the room ledger or accept
// a player id supplied by the caller (including during the blind fourth spin).
export function readPlayerBank(room, player) {
  const key = infortunePlayerKey(player);
  const finale = room.infortuneFinale?.snapshot(key);
  return { ok: true, roomId: room.id,
    tournamentId: finale?.finale.tournamentId ?? room.tournament?.id ?? null,
    bank: finale?.snapshot?.bank ?? room.tournament?.infortune?.banks.get(key) ?? 0 };
}
