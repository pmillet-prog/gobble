import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { getAvatarRenderState } from "../avatar/avatarRenderState.js";
import { normalizeAvatar } from "../avatar/avatarState.js";
import { CELEBRATION_DURATION, CELEBRATION_CUES, getPodiumPose, startCelebration } from "./celebrationTimeline.js";
import { createCelebrationFixture } from "./demo/celebrationFixtures.js";
import { getPresenterPodiumAvatar } from "./presenterPodiumAvatars.js";
import { preparePodiumAvatars, releasePodiumAvatars } from "./preparePodiumAvatars.js";
import { PRESENTER_IDENTITIES, resolvePresenterKey } from "../presenters/presenterIdentity.js";

const catalog = JSON.parse(fs.readFileSync(new URL("../../../public/avatars/v1/catalog.json", import.meta.url)));

test("celebration expressions use the matching mouth and never modify saved appearance", () => {
  for (const mouth of catalog.families.mouths.filter(part => part.expression === "neutral")) {
    const saved = Object.freeze(normalizeAvatar({ mouths: mouth.id, backdrops: "forest", auras: "weekly_gold" }));
    const happy = getAvatarRenderState(saved, catalog, { expression: "happy", transparent: true, blink: true });
    assert.equal(catalog.families.mouths.find(part => part.id === happy.mouths).model_id, mouth.model_id);
    assert.equal(happy.mouths, mouth.id.replace("_neutral", "_happy"));
    assert.equal(happy.backdrops, "");
    assert.equal(happy.auras, "weekly_gold");
    assert.equal(saved.mouths, mouth.id);
    assert.equal(saved.openness, 1);
    assert.equal(normalizeAvatar(happy).mouths, mouth.id, "saving remains neutral");
  }
});

test("skipping or unmounting cancels the full sequence, including already queued callbacks", () => {
  const tasks = new Map(), cues = [], cancelled = [];
  const stop = startCelebration({ onCue: value => cues.push(value), schedule: (callback, delay) => { tasks.set(delay, callback); return delay; }, cancel: id => cancelled.push(id) });
  tasks.get(1000)();
  assert.deepEqual(cues, [1000]);
  stop();
  tasks.get(3450)();
  assert.deepEqual(cues, [1000]);
  assert.deepEqual(cancelled, CELEBRATION_CUES);
  assert.equal(CELEBRATION_CUES.at(-1), CELEBRATION_DURATION);
  for (const rank of [1, 2, 3]) assert.equal(getPodiumPose(rank, CELEBRATION_DURATION), "happy");
});

test("all demo situations and outfits resolve without missing assets or fake podium membership", () => {
  for (const position of ["winner", "second", "other"]) for (const look of [0, 1]) {
    const fixture = createCelebrationFixture(position, look);
    assert.deepEqual(fixture.players.map(player => player.rank), [1, 2, 3]);
    assert.equal(fixture.self.rank, position === "winner" ? 1 : position === "second" ? 2 : 7);
    for (const player of [...fixture.players, fixture.self]) assert.deepEqual(normalizeAvatar(player.avatar, catalog), player.avatar);
  }
});

test("the four presenter bots use existing images while a human namesake keeps their avatar", () => {
  for (const [key, presenter] of Object.entries(PRESENTER_IDENTITIES)) {
    const portrait = getPresenterPodiumAvatar({ isBot: true, nick: presenter.nick });
    assert.equal(portrait.key, key);
    assert.equal(getPresenterPodiumAvatar({ isBot: false, nick: presenter.nick, presenterKey: key }), null);
    assert.equal(getPresenterPodiumAvatar({ nick: presenter.nick }), null);
    for (const url of Object.values(portrait.poses)) assert.ok(fs.existsSync(new URL(`../../../public${url}`, import.meta.url)), url);
    assert.equal(resolvePresenterKey({ nick: ` ${presenter.nick.toLocaleUpperCase("fr")} ` }), key);
  }
  assert.equal(getPresenterPodiumAvatar({ isBot: true, nick: "Autre bot" }), null);
  assert.equal(resolvePresenterKey({ nick: "Bernard Pinot", meta: { presenterKey: "lepers" } }), "lepers");
  assert.equal(resolvePresenterKey({ meta: { category: "coach" } }), "capello");
});

test("a bot guest can win or place second without replacing the demo user's result", () => {
  for (const botKey of Object.keys(PRESENTER_IDENTITIES)) for (const position of ["winner", "second", "other"]) {
    const fixture = createCelebrationFixture(position, 0, botKey);
    const bot = fixture.players.find(player => player.isBot);
    assert.equal(bot.rank, position === "winner" ? 2 : 1);
    assert.equal(getPresenterPodiumAvatar(bot).key, botKey);
    assert.equal(fixture.self.userId, "demo-self");
    assert.equal(fixture.self.rank, position === "winner" ? 1 : position === "second" ? 2 : 7);
  }
});

test("a bot podium prepares only existing poses, shares identical frames and releases them", async () => {
  const previous = Object.fromEntries(["Image", "document", "fetch"].map(key => [key, Object.getOwnPropertyDescriptor(globalThis, key)]));
  const decoded = [], draws = [];
  globalThis.Image = class {
    naturalWidth = 500;
    naturalHeight = 600;
    async decode() { decoded.push(this.src); }
  };
  globalThis.document = { createElement: () => ({ getContext: () => ({ drawImage: (...args) => draws.push(args) }) }) };
  globalThis.fetch = () => { throw Error("Bot-only podium must not load the modular avatar catalog"); };
  try {
    const players = Object.values(PRESENTER_IDENTITIES).map(presenter => ({ nick: presenter.nick, isBot: true }));
    const actors = await preparePodiumAvatars(players);
    assert.equal(decoded.length, 8);
    assert.equal(draws.length, 8);
    for (const actor of actors) {
      assert.equal(actor.frames.neutral, actor.frames.happy);
      assert.notEqual(actor.frames.blink, actor.frames.neutral);
      assert.equal(actor.frames.neutral.width, 600);
    }
    assert.ok(draws.every(args => args.slice(1).every(Number.isFinite)));
    releasePodiumAvatars(actors);
    assert.ok(actors.every(actor => Object.values(actor.frames).every(canvas => canvas.width === 0 && canvas.height === 0)));
  } finally {
    for (const [key, descriptor] of Object.entries(previous)) {
      if (descriptor) Object.defineProperty(globalThis, key, descriptor);
      else delete globalThis[key];
    }
  }
});
