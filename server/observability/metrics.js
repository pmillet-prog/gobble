import { monitorEventLoopDelay } from "perf_hooks";

const histogram = monitorEventLoopDelay({ resolution: 20 });
histogram.enable();

const startedAt = Date.now();

function safePercentile(h, p) {
  if (!h || typeof h.percentile !== "function") return null;
  try {
    const value = h.percentile(p);
    return Number.isFinite(value) ? value : null;
  } catch (_) {
    return null;
  }
}

export function getMetrics({ roomsCount = null, socketsCount = null } = {}) {
  const mem = process.memoryUsage();
  const p50 = safePercentile(histogram, 50);
  const p95 = safePercentile(histogram, 95);
  const p99 = safePercentile(histogram, 99);

  return {
    eventLoopDelay: {
      p50: p50 ?? 0,
      p95: p95 ?? 0,
      p99: p99 ?? 0,
    },
    memory: {
      rss: mem.rss,
      heapUsed: mem.heapUsed,
      heapTotal: mem.heapTotal,
    },
    uptimeMs: Date.now() - startedAt,
    rooms: roomsCount ?? undefined,
    sockets: socketsCount ?? undefined,
  };
}

export function resetMetrics() {
  try {
    histogram.reset();
  } catch (_) {}
}
