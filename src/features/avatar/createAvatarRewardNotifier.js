// One toast per reward, even when the socket and the account refresh race.
// Acknowledgments are grouped; failed delivery stays pending on the server.
export function createAvatarRewardNotifier({ userId, show, acknowledge, nickname, setTimer = setTimeout, clearTimer = clearTimeout }) {
  const shown = new Set(), pending = new Set();
  let timer = null, disposed = false;
  async function flush() {
    timer = null;
    const keys = [...pending];
    pending.clear();
    if (!keys.length || disposed) return;
    try { await acknowledge(keys); }
    catch { keys.forEach(key => pending.add(key)); }
  }
  return {
    receive(payload) {
      if (disposed || payload?.userId !== userId || !Array.isArray(payload.rewards)) return;
      for (const reward of payload.rewards) {
        if (!reward || typeof reward.key !== "string" || !reward.label || !reward.id || !reward.family) continue;
        if (reward.expiresAt && reward.expiresAt <= Date.now()) continue;
        if (!shown.has(reward.key)) {
          shown.add(reward.key);
          show(`Débloqué : ${reward.label}`, 8000, { avatarReward: { ...reward, nickname: nickname() } });
        }
        pending.add(reward.key);
      }
      if (pending.size && !timer) timer = setTimer(flush, 100);
    },
    dispose() { disposed = true; if (timer) clearTimer(timer); pending.clear(); },
  };
}
