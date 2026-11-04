export function createWheelAudio() {
  let context, buffer, lastClick = -1, muted = false, disposed = false;
  const sources = new Set();

  function unlock() {
    if (disposed || muted) return;
    try {
      if (!context) {
        const AudioContext = globalThis.AudioContext || globalThis.webkitAudioContext;
        if (!AudioContext) return;
        context = new AudioContext();
        buffer = context.createBuffer(1, Math.ceil(context.sampleRate * 0.022), context.sampleRate);
        const data = buffer.getChannelData(0);
        let seed = 73;
        for (let i = 0; i < data.length; i++) {
          seed = (seed * 1664525 + 1013904223) >>> 0;
          data[i] = (seed / 2147483648 - 1) * Math.exp(-i / (context.sampleRate * 0.003));
        }
      }
      if (context.state === "suspended") void context.resume().catch(() => {});
    } catch { /* The wheel remains usable when audio is unavailable. */ }
  }

  return {
    unlock,
    setMuted(value) { muted = value; },
    resume() { if (context?.state === "suspended") void context.resume().catch(() => {}); },
    suspend() { if (context?.state === "running") void context.suspend().catch(() => {}); },
    tick(speed) {
      if (disposed || muted || !buffer || context?.state !== "running") return;
      const now = context.currentTime;
      // Many pegs pass in one frame at full speed; avoid stacking loud clicks.
      if (now - lastClick < 0.025) return;
      lastClick = now;
      const source = context.createBufferSource();
      const gain = context.createGain();
      source.buffer = buffer;
      source.playbackRate.value = 0.8 + Math.min(Math.abs(speed) / 22, 0.5);
      gain.gain.value = 0.2 + Math.min(Math.abs(speed) / 45, 0.18);
      source.connect(gain).connect(context.destination);
      sources.add(source);
      source.onended = () => { source.disconnect(); gain.disconnect(); sources.delete(source); };
      source.start();
    },
    dispose() {
      disposed = true;
      for (const source of sources) { try { source.stop(); } catch {} }
      sources.clear();
      if (context && context.state !== "closed") void context.close().catch(() => {});
    },
  };
}
