export function createDailyHistoryWordsLoader({ fetchImpl = (...args) => fetch(...args) } = {}) {
  const cache = new Map();
  let pending = null;

  function cancel() {
    pending?.controller.abort();
    pending = null;
  }

  function load(dateId, dailyMode, installId) {
    const key = `${installId}|${dateId}|${dailyMode}`;
    if (pending?.key === key) return pending.promise;
    cancel();
    if (cache.has(key)) return Promise.resolve(cache.get(key));
    const controller = new AbortController();
    const request = { key, controller, promise: null };
    pending = request;
    const params = new URLSearchParams({ dateId, dailyMode });
    request.promise = (async () => {
      try {
        const response = await fetchImpl(`/api/daily/history/words?${params}`, {
          credentials: "include", cache: "no-store", signal: controller.signal,
          headers: { Accept: "application/json" },
        });
        const data = await response.json();
        if (controller.signal.aborted) return null;
        if (!response.ok || !data?.ok) throw new Error(data?.error || "unavailable");
        if (cache.size >= 90) cache.delete(cache.keys().next().value);
        cache.set(key, data);
        return data;
      } catch (error) {
        if (controller.signal.aborted) return null;
        throw error;
      } finally {
        if (pending === request) pending = null;
      }
    })();
    return request.promise;
  }

  return { load, cancel };
}
