import { infortunePlayerKey } from "../../shared/infortunePlateaus.js";

export function registerInfortuneHandlers(socket, { getRoom }) {
  socket.on("infortune:action", (value, acknowledge) => {
    if (typeof acknowledge !== "function") return;
    const room = getRoom(socket.roomId), round = room?.currentRound, player = room?.players?.get(socket.id);
    if (!value || !player || player.connected === false || player.isBot || String(player.token || "").startsWith("bot-")
      || String(value.roomId) !== String(room.id) || String(value.roundId) !== String(round?.id) || !round?.infortuneGame)
      return acknowledge({ ok: false, error: "Ce plateau n’est plus disponible." });
    acknowledge(round.infortuneGame.submit(infortunePlayerKey(player), value));
  });
}
