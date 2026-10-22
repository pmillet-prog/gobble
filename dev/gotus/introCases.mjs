import assert from "node:assert/strict";

const INTRO_SECONDS = 68132 / 48000;
const INTRO_SOUNDS = "gotusFixture.sounds.filter(sound => Math.abs(sound.duration - 68132 / 48000) < .002)";

export async function runGotusIntroChecks({ cdp, evaluate, capture, waitFor, delay, origin, cases }) {
  const failures = [];
  const check = (condition, label, detail) => { if (!condition) failures.push({ label, detail }); };
  await cdp("Emulation.setDeviceMetricsOverride", { width: 390, height: 844, deviceScaleFactor: 1, mobile: true });
  await cdp("Page.navigate", { url: `${origin}/dev/gotus/?intro-test=1` });
  await waitFor(() => evaluate("!!window.gotusFixture?.closeAll"), "intro fixture");
  await evaluate("gotusFixture.unlock()");

  const open = async surface => {
    await evaluate("gotusFixture.intro.reset()");
    await evaluate(`gotusFixture.responsive(${JSON.stringify(surface)}, true)`);
    await evaluate(`(async () => {
      const deadline=performance.now()+5000;
      while(document.querySelector('.gotus-intro')?.dataset.state!=='running') {
        if(performance.now()>deadline) throw new Error('Intro did not start');
        await new Promise(resolve=>requestAnimationFrame(resolve));
      }
      return true;
    })()`);
  };
  const close = async () => {
    await evaluate("gotusFixture.closeAll()");
    await waitFor(() => evaluate("!document.querySelector('.gotus__playground,.gotus-intro')"), "Gotus unmounted");
  };
  const telemetry = () => evaluate(`({ frames:gotusFixture.intro.frames, events:gotusFixture.intro.events,
    sounds:${INTRO_SOUNDS}, audioNow:gotusFixture.intro.audioNow() })`);

  for (const surface of ["training", "live"]) {
    const before = await evaluate(`${INTRO_SOUNDS}.length`);
    await open(surface);
    check(await evaluate("!!document.querySelector('.gotus__playground').closest('[inert]')"), `${surface}: jeu inerte pendant l'intro`);
    await capture(`intro-${surface}-beginning`);
    await delay(330); await capture(`intro-${surface}-growing`);
    await waitFor(() => evaluate("!document.querySelector('.gotus-intro')"), `${surface} intro finished`);
    await delay(80);
    const data = await telemetry(), sound = data.sounds.at(-1);
    const running = data.frames.filter(frame => frame.state === "running" && frame.connected && frame.rect?.width > 0);
    const removal = data.events.find(event => event.type === "removed");
    check(data.sounds.length === before + 1, `${surface}: un seul son d'intro`, data.sounds);
    check(data.events.filter(event => event.type === "mounted").length === 1, `${surface}: un seul portail d'intro`, data.events);
    check(running.length >= 12, `${surface}: animation continue`, running.length);
    check(running.every((frame, index) => !index || frame.progress >= running[index - 1].progress), `${surface}: progression monotone`);
    check(running.every((frame, index) => !index || frame.rect.width + .1 >= running[index - 1].rect.width), `${surface}: logo grossit continuellement`);
    check(running.every(frame => Math.abs(frame.durationMs / 1000 - INTRO_SECONDS) < .002), `${surface}: durée exacte du WAV`, running[0]?.durationMs);
    if (sound) {
      const maxDrift = Math.max(...running.map(frame => Math.abs((frame.audio - sound.scheduledAt) - frame.progress * sound.duration)));
      check(maxDrift <= .065, `${surface}: animation alignée sur AudioContext à 65 ms près`, maxDrift);
      check(removal && Math.abs(removal.audio - (sound.scheduledAt + sound.duration)) <= .075,
        `${surface}: disparition à la fin audio à 75 ms près`, { sound, removal });
      check(sound.endedAt != null, `${surface}: source audio terminée`, sound);
    }
    const last = running.at(-1)?.rect;
    check(last && last.width > 390 && last.height > 844, `${surface}: logo déborde les deux dimensions finales`, last);
    check(await evaluate("!document.querySelector('.gotus__playground').closest('[inert]')"), `${surface}: contrôles libérés après l'intro`);
    await capture(`intro-${surface}-finished`);
    cases.push({ intro: `${surface}-complete`, ...data });

    if (surface === "training") {
      await evaluate("[...document.querySelectorAll('.gotus__footer button')].find(button=>button.textContent.includes('Voir la solution')).click()");
      await waitFor(() => evaluate("!!document.querySelector('.gotus__finish .gotus__primary')"), "training solution");
      await evaluate("document.querySelector('.gotus__finish .gotus__primary').click()");
      await waitFor(() => evaluate("!!document.querySelector('.gotus__form input:not(:disabled)')"), "training next word");
      await delay(1700);
      const afterNext = await telemetry();
      check(afterNext.sounds.length === before + 1 && afterNext.events.filter(event => event.type === "mounted").length === 1,
        "training: Nouveau mot ne rejoue pas l'intro", afterNext.events);
      cases.push({ intro: "training-next-word", sounds: afterNext.sounds, events: afterNext.events });
    }
    await close();
  }

  for (const surface of ["training", "live"]) {
    const before = await evaluate(`${INTRO_SOUNDS}.length`);
    await open(surface); await delay(180);
    await close();
    const data = await telemetry(), last = data.sounds.at(-1), frozen = data.frames.length;
    check(data.sounds.length === before + 1, `${surface}: réouverture rejoue une fois`, data.sounds.length - before);
    check(last?.stoppedAt != null && last.stoppedAt - last.scheduledAt < INTRO_SECONDS,
      `${surface}: fermeture interrompt le son`, last);
    await delay(1600);
    check(await evaluate("gotusFixture.intro.frames.length") === frozen, `${surface}: aucune animation après démontage`);
    check(await evaluate(`${INTRO_SOUNDS}.length`) === before + 1, `${surface}: aucun replay tardif`);
    cases.push({ intro: `${surface}-cancelled`, ...await telemetry() });
  }

  const beforeMute = await evaluate(`${INTRO_SOUNDS}.length`);
  await evaluate("gotusFixture.mute(true)");
  await open("training");
  await waitFor(() => evaluate("!document.querySelector('.gotus-intro')"), "muted visual intro finished");
  const muted = await telemetry(), frames = muted.frames.filter(frame => frame.state === "running");
  check(muted.sounds.length === beforeMute, "mute global: aucune source sonore");
  check(frames.length >= 12 && frames.every(frame => Math.abs(frame.durationMs / 1000 - INTRO_SECONDS) < .002), "mute global: même durée visuelle", frames[0]);
  const elapsed = (muted.events.find(event => event.type === "removed")?.wall - frames[0]?.wall) / 1000;
  check(Math.abs(elapsed - INTRO_SECONDS) <= .075, "mute global: animation terminée après la durée du son", elapsed);
  cases.push({ intro: "training-muted", ...muted });
  await close(); await evaluate("gotusFixture.mute(false)");
  assert.deepEqual(failures, [], JSON.stringify(failures, null, 2));
}
