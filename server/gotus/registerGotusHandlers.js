import { resolveTargetQuizContext } from "../targetMiniGame/registerTargetQuizHandlers.js";
import { recordGotusResult } from "./gotusRoundResults.js";

export function createGotusSocketHandlers({ service, markActivity, ...dependencies }) {
  const owners = new Map();

  function register(socket) {
    let connected = true;
    let binding = null;
    let pending = 0;
    let queue = Promise.resolve();
    const contextFor = payload => resolveTargetQuizContext(socket, payload, { ...dependencies, miniGameKind: "gotus" });

    function bind(context) {
      const owner = owners.get(context.playerKey);
      if (owner && owner !== socket.id) throw new Error("gotus_in_use");
      if (binding && binding.playerKey !== context.playerKey && owners.get(binding.playerKey) === socket.id) owners.delete(binding.playerKey);
      owners.set(context.playerKey, socket.id);
      binding = context;
    }

    function handle(event, action) {
      socket.on(event, (payload = {}, cb) => {
        if (!connected || pending >= 8) {
          if (typeof cb === "function") cb({ ok: false, error: "gotus_busy" });
          return;
        }
        pending += 1;
        const execute = async () => {
          try {
            if (!connected) return;
            const result = await action(payload && typeof payload === "object" ? payload : {});
            if (connected && typeof cb === "function") cb(result);
          } catch (error) {
            if (connected && typeof cb === "function") cb({ ok: false, error: error?.message || "gotus_unavailable" });
          } finally { pending -= 1; }
        };
        queue = queue.then(execute, execute);
      });
    }

    handle("gotus:start", async payload => {
      const context = contextFor(payload);
      bind(context);
      try {
        const response = await service.start({ ...context, onSummary(snapshot) {
          recordGotusResult(context, snapshot);
          if (connected) socket.emit("gotus:progress", snapshot);
        } });
        if (!connected) throw new Error("not_logged_in");
        const current = contextFor(payload);
        if (current.playerKey !== context.playerKey || current.roundId !== context.roundId) throw new Error("stale_round");
        return response;
      } catch (error) {
        if (owners.get(context.playerKey) === socket.id) owners.delete(context.playerKey);
        binding = null;
        throw error;
      }
    });

    for (const [event, method] of [["gotus:guess", "guess"], ["gotus:dismiss", "dismiss"]]) {
      handle(event, async payload => {
        const context = contextFor(payload);
        if (!binding || context.roundId !== binding.roundId || context.playerKey !== binding.playerKey) throw new Error("gotus_session_missing");
        if (owners.get(context.playerKey) !== socket.id) throw new Error("gotus_in_use");
        const response = await service[method](context, payload);
        if (method === "guess" && response.ok) markActivity?.(context.room, socket, "gotus_guess");
        return response;
      });
    }

    socket.on("disconnect", () => {
      connected = false;
      if (binding && owners.get(binding.playerKey) === socket.id) owners.delete(binding.playerKey);
      binding = null;
    });
  }

  return Object.freeze({ register, closeRoomRound: service.closeRoomRound });
}
