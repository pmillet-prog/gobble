import { infortunePlayerKey } from "../../shared/infortunePlateaus.js";
import { readPlayerBank } from "./readPlayerBank.js";

export function registerInfortuneHandlers(socket, { getRoom }) {
  socket.on("infortune:bank", (value, acknowledge) => {
    if (typeof acknowledge !== "function") return;
    const room = getRoom(socket.roomId), player = room?.players?.get(socket.id);
    if (!player || player.connected === false || player.isBot || String(player.token || "").startsWith("bot-")
      || String(value?.roomId) !== String(room.id)) return acknowledge({ ok: false, error: "unavailable" });
    acknowledge(readPlayerBank(room, player));
  });
  socket.on("infortune:finale", (value, acknowledge) => {
    if (typeof acknowledge !== "function") return;
    const room = getRoom(socket.roomId), player = room?.players?.get(socket.id);
    if (!value || !player || player.connected === false || player.isBot || String(player.token || "").startsWith("bot-")
      || String(value.roomId) !== String(room.id) || !room.infortuneFinale
      || value.tournamentId && String(value.tournamentId) !== String(room.infortuneFinale.publicSnapshot().tournamentId))
      return acknowledge({ ok: false, error: "unavailable" });
    const result = room.infortuneFinale.submit(infortunePlayerKey(player), value);
    if (result?.then) result.then(acknowledge, () => acknowledge({ ok: false, error: 'connection' }));
    else acknowledge(result);
  });
  socket.on("infortune:action", (value, acknowledge) => {
    if (typeof acknowledge !== "function") return;
    const room = getRoom(socket.roomId), round = room?.currentRound, player = room?.players?.get(socket.id);
    if (!value || !player || player.connected === false || player.isBot || String(player.token || "").startsWith("bot-")
      || String(value.roomId) !== String(room.id) || String(value.roundId) !== String(round?.id) || !round?.infortuneGame)
      return acknowledge({ ok: false, error: "Ce plateau n’est plus disponible." });
    acknowledge(round.infortuneGame.submit(infortunePlayerKey(player), value));
  });
}
