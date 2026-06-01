import React from "react";
import { createPortal } from "react-dom";

import { getPerfSnapshot, resetPerfProbe } from "./renderPerfProbe.js";

function round1(value) {
  return Number.isFinite(value) ? Math.round(value * 10) / 10 : 0;
}

function getSessionStats(sessions) {
  const items = Array.isArray(sessions) ? sessions : [];
  const count = items.length;
  if (!count) {
    return {
      avgDurationMs: 0,
      avgRenders: 0,
      avgRendersPerTile: 0,
      avgTiles: 0,
      count: 0,
      maxRenders: 0,
      minRenders: 0,
      totalRenders: 0,
    };
  }
  const totalRenders = items.reduce((sum, item) => sum + (item.appRenders || 0), 0);
  const totalDuration = items.reduce((sum, item) => sum + (item.durationMs || 0), 0);
  const totalTiles = items.reduce((sum, item) => sum + (item.tileCount || 0), 0);
  const renders = items.map((item) => item.appRenders || 0);
  return {
    avgDurationMs: round1(totalDuration / count),
    avgRenders: round1(totalRenders / count),
    avgRendersPerTile: totalTiles > 0 ? round1(totalRenders / totalTiles) : 0,
    avgTiles: round1(totalTiles / count),
    count,
    maxRenders: Math.max(...renders),
    minRenders: Math.min(...renders),
    totalRenders,
  };
}

function formatSession(session) {
  if (!session) return "aucune";
  const tiles = session.tileCount ? ` / ${session.tileCount} tuiles` : "";
  const perTile =
    session.tileCount > 0 ? ` (${round1(session.appRenders / session.tileCount)}/tuile)` : "";
  return `${session.appRenders} r${tiles}${perTile} / ${session.durationMs} ms`;
}

export default function PerfTestOverlay({ phase = "", roundId = "" }) {
  const [snapshot, setSnapshot] = React.useState(() => getPerfSnapshot());
  const [fps, setFps] = React.useState({ avg: 0, rolling: 0 });
  const fpsRef = React.useRef({
    firstAt: 0,
    frames: 0,
    lastAt: 0,
    samples: [],
  });
  const roundKeyRef = React.useRef("");

  const resetAll = React.useCallback(() => {
    const now = performance.now();
    fpsRef.current = { firstAt: now, frames: 0, lastAt: now, samples: [] };
    setFps({ avg: 0, rolling: 0 });
    setSnapshot(resetPerfProbe());
  }, []);

  React.useEffect(() => {
    resetAll();
  }, [resetAll]);

  React.useEffect(() => {
    if (phase !== "playing") return;
    const key = String(roundId || "playing");
    if (!key || roundKeyRef.current === key) return;
    roundKeyRef.current = key;
    resetAll();
  }, [phase, resetAll, roundId]);

  React.useEffect(() => {
    let rafId = 0;
    let cancelled = false;

    const tick = (now) => {
      if (cancelled) return;
      const state = fpsRef.current;
      if (!state.firstAt) state.firstAt = now;
      state.frames += 1;
      state.lastAt = now;
      state.samples.push(now);
      const cutoff = now - 2000;
      while (state.samples.length && state.samples[0] < cutoff) {
        state.samples.shift();
      }
      rafId = window.requestAnimationFrame(tick);
    };

    rafId = window.requestAnimationFrame(tick);
    return () => {
      cancelled = true;
      if (rafId) window.cancelAnimationFrame(rafId);
    };
  }, []);

  React.useEffect(() => {
    const update = () => {
      setSnapshot(getPerfSnapshot());
      const now = performance.now();
      const state = fpsRef.current;
      const elapsedSec = Math.max(0.001, (now - (state.firstAt || now)) / 1000);
      const rollingSec =
        state.samples.length > 1
          ? Math.max(0.001, (state.samples[state.samples.length - 1] - state.samples[0]) / 1000)
          : 0;
      setFps({
        avg: round1(state.frames / elapsedSec),
        rolling: rollingSec > 0 ? round1((state.samples.length - 1) / rollingSec) : 0,
      });
    };
    update();
    const id = window.setInterval(update, 250);
    return () => window.clearInterval(id);
  }, []);

  if (typeof document === "undefined") return null;

  const sessions = Array.isArray(snapshot?.sessions) ? snapshot.sessions : [];
  const stats = getSessionStats(sessions);
  const lastSessions = sessions.slice(-3).reverse();
  const last = lastSessions[0] || null;
  const active = snapshot?.active || null;

  return createPortal(
    <div
      style={{
        position: "fixed",
        left: 8,
        top: 8,
        zIndex: 2147483000,
        width: "min(292px, calc(100vw - 16px))",
        border: "1px solid rgba(248,113,113,0.85)",
        borderRadius: 10,
        background: "rgba(127,29,29,0.92)",
        color: "#fff",
        fontFamily:
          "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace",
        fontSize: 11,
        lineHeight: 1.25,
        padding: "8px 9px",
        pointerEvents: "none",
        boxShadow: "0 10px 30px rgba(0,0,0,0.25)",
      }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", gap: 8 }}>
        <strong>Test perf</strong>
        <button
          type="button"
          onClick={resetAll}
          style={{
            border: "1px solid rgba(255,255,255,0.45)",
            borderRadius: 6,
            background: "rgba(255,255,255,0.12)",
            color: "#fff",
            font: "inherit",
            padding: "1px 6px",
            pointerEvents: "auto",
          }}
        >
          reset
        </button>
      </div>
      <div style={{ marginTop: 5 }}>
        App/tracé moy manche: {stats.avgRenders} r
      </div>
      <div>Tracés mesurés: {stats.count}</div>
      <div>
        Min/max App par tracé: {stats.minRenders} / {stats.maxRenders} r
      </div>
      <div>
        App/tuile moy: {stats.avgRendersPerTile} r / tuiles moy: {stats.avgTiles}
      </div>
      <div>FPS: {fps.rolling} live / {fps.avg} moy</div>
      <div>Duree moy: {stats.avgDurationMs} ms</div>
      <div>App total: {snapshot?.totalAppRenders || 0}</div>
      <div>Active: {active ? formatSession(active) : "non"}</div>
      <div>Derniere: {formatSession(last)}</div>
      {lastSessions.length > 1 ? (
        <div style={{ marginTop: 5, opacity: 0.9 }}>
          {lastSessions.slice(1).map((session, index) => (
            <div key={`${session.startedAt || ""}-${index}`}>
              -{index + 2}: {formatSession(session)}
            </div>
          ))}
        </div>
      ) : null}
    </div>,
    document.body
  );
}
