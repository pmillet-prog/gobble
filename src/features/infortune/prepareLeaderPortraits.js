import { loadInfortuneContestants } from './loadInfortuneContestants.js';

const releaseFrames = frames => {
  for (const actor of frames.values()) for (const canvas of new Set(Object.values(actor))) {
    canvas.width = 0; canvas.height = 0;
  }
};

// One short-lived preparation per parade. Never enlarge the 64px chat thumbnail.
export function createLeaderPortraitPreparation(cue, dependencies = {}) {
  const controller = new AbortController(), { signal } = controller;
  const listeners = new Set();
  let frames = new Map();
  const makeCanvas = dependencies.makeCanvas || (size => Object.assign(document.createElement('canvas'), { width: size, height: size }));
  const size = cue.leaders.length <= 3 ? 400 : cue.leaders.length <= 6 ? 320 : cue.leaders.length <= 24 ? 200 : 144;
  const prepare = async () => {
    let renderer;
    const players = cue.leaders.map(player => ({ ...player }));
    const missing = players.filter(player => !player.avatar && player.userId);
    // The public appearance endpoint accepts at most 24 accounts per request.
    for (let i = 0; i < missing.length; i += 24) {
      try {
        const loaded = await loadInfortuneContestants(missing.slice(i, i + 24), { signal, fetchImpl: dependencies.fetchImpl });
        for (const player of loaded) {
          const target = players.find(value => value.id === player.id);
          if (target) target.avatar = player.avatar;
        }
      } catch (error) { if (signal.aborted) throw error; }
    }
    const appearances = new Map();
    for (const player of players) {
      signal.throwIfAborted();
      // Identical appearances share their two source frames (e.g. default avatars).
      const appearanceKey = JSON.stringify([player.avatar || null, player.avatar?.accessories?.length ? player.nick : '']);
      if (appearances.has(appearanceKey)) {
        frames = new Map(frames).set(player.id, appearances.get(appearanceKey));
        listeners.forEach(listener => listener());
        continue;
      }
      const poses = {};
      try {
        if (player.avatar) {
          renderer ||= await (dependencies.createRenderer ? dependencies.createRenderer()
            : (await import('../avatar/avatarRenderer.js')).createAvatarRenderer());
          for (const pose of ['happy', 'blink']) {
            const frame = await renderer.prepare(player.avatar, { transparent: true, expression: 'happy', blink: pose === 'blink', nickname: player.nick, portraitOffsetY: 0 });
            signal.throwIfAborted();
            const canvas = makeCanvas(size); poses[pose] = canvas;
            frame.draw(canvas, 'portrait');
          }
        } else {
          // Accounts without a created avatar keep the game's actual default.
          const image = await (dependencies.loadDefault ? dependencies.loadDefault()
            : (await import('../avatar/avatarAssetCache.js')).loadAvatarImage('/avatars/default.png'));
          signal.throwIfAborted();
          const canvas = makeCanvas(size), scale = Math.min(size / image.width, size / image.height);
          canvas.getContext('2d').drawImage(image, (size - image.width * scale) / 2, (size - image.height * scale) / 2, image.width * scale, image.height * scale);
          poses.happy = poses.blink = canvas;
        }
        appearances.set(appearanceKey, poses);
        frames = new Map(frames).set(player.id, poses);
        listeners.forEach(listener => listener());
      } catch (error) {
        releaseFrames(new Map([[player.id, poses]]));
        if (signal.aborted) throw error;
      }
      // Yield between players: large ties must not stall the scene or timers.
      await new Promise(resolve => setTimeout(resolve, 0));
    }
  };
  const ready = prepare().catch(() => {});
  return { ready, getSnapshot: () => frames, subscribe(listener) { listeners.add(listener); return () => listeners.delete(listener); },
    dispose() { controller.abort(); releaseFrames(frames); frames = new Map(); listeners.clear(); } };
}

let current;
export function getLeaderPortraits(cue) {
  if (current?.id === cue.id) return current.job;
  if (current) { clearTimeout(current.timer); current.job.dispose(); }
  const job = createLeaderPortraitPreparation(cue);
  current = { id: cue.id, job, timer: setTimeout(() => releaseLeaderPortraits(cue.id), Math.max(1000, Math.min(30000, cue.endsAt - Date.now() + 1000))) };
  return job;
}
export function releaseLeaderPortraits(id) {
  if (current?.id !== id) return;
  clearTimeout(current.timer); current.job.dispose(); current = null;
}
