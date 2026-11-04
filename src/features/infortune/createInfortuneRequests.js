// Small acknowledged, idempotent commands. Retry a lost ack without replaying
// financial effects; timers and callbacks are cancelled with the round lease.
export function createInfortuneRequests({ realtime, timers, receive, onError }) {
  const pending = new Map();
  function send(value, done = () => {}) {
    if (pending.has(value.type)) return;
    const request = { value, done, timer: null, tries: 0 }; pending.set(value.type, request);
    function attempt() {
      if (pending.get(value.type) !== request) return;
      request.tries++;
      request.timer = timers.setTimeout(() => {
        if (request.tries < 3) attempt();
        else { pending.delete(value.type); onError("Connexion au plateau interrompue. Réessaie pour enregistrer ton choix."); }
      }, 3000);
      realtime?.emit?.("infortune:action", value, reply => {
        if (pending.get(value.type) !== request) return;
        timers.clearTimeout(request.timer); pending.delete(value.type);
        if (reply?.economy) receive({ roomId: value.roomId, roundId: value.roundId, economy: reply.economy });
        if (reply?.ok) { onError(null); done(); } else onError(reply?.error || "Enregistrement impossible.");
      });
    }
    attempt();
  }
  return { send, reset() { for (const request of pending.values()) timers.clearTimeout(request.timer); pending.clear(); } };
}
