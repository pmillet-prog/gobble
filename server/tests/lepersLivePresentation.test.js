import assert from "node:assert/strict";
import test from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { createServer } from "vite";

test("Julien live cards, feed and cymbals use the gameplay presentation", async (t) => {
  const vite = await createServer({
    appType: "custom", logLevel: "silent", server: { middlewareMode: true },
  });
  try {
    const [
      { default: RankingWidgetMobile },
      { default: useLiveRanking },
      { default: useGameSounds },
      { buildMixedFeed },
      { SFX_KEYS },
    ] = await Promise.all([
      vite.ssrLoadModule("/src/components/RankingWidgetMobile.jsx"),
      vite.ssrLoadModule("/src/components/results/useLiveRanking.js"),
      vite.ssrLoadModule("/src/audio/useGameSounds.js"),
      vite.ssrLoadModule("/src/components/LiveFeed.jsx"),
      vite.ssrLoadModule("/src/assets/assetKeys.js"),
    ]);

    await t.test("desktop and mobile show the card beside gobbles, results keep their points", () => {
      let liveRanking;
      function RankingProbe() {
        liveRanking = useLiveRanking(null, null, null, () => null,
          [{ nick: "Test" }], [{ nick: "Test", score: 100, rank: 1, gobbles: 1, lepersBonus: 2 }],
          100, "Test");
        return null;
      }
      renderToStaticMarkup(React.createElement(RankingProbe));
      assert.equal(liveRanking[0].score, 100);
      assert.equal(liveRanking[0].lepersBonus, 2);
      const before = liveRanking.map((entry) => ({ ...entry, lepersBonus: 0 }));
      // The real memo comparator must not suppress an update when only the card changes.
      assert.equal(RankingWidgetMobile.compare({ fullRanking: before }, { fullRanking: liveRanking }), false);
      for (const mode of [
        { expanded: true, flatStyle: true, stackNickDecorations: true },
        { expanded: true, flatStyle: true, stackNickDecorations: false },
        { expanded: false, flatStyle: true, compactRoller: true, animateRank: false },
      ]) {
        const props = { ...mode, fullRanking: liveRanking, selfNick: "Test", showScores: true };
        const html = renderToStaticMarkup(React.createElement(RankingWidgetMobile, props));
        assert.match(html, /question-champion-bonus\.webp/);
        assert.match(html, /Julien Lechéper : \+2 points au général/);
        assert.match(html, /100 pts/);
        const resultHtml = renderToStaticMarkup(React.createElement(RankingWidgetMobile, {
          ...props, showRoundAward: true,
          fullRanking: [{ ...liveRanking[0], roundLepersBonus: 2 }],
        }));
        assert.equal((resultHtml.match(/question-champion-bonus\.webp/g) || []).length, 1);
      }
    });

    await t.test("the card event survives a simultaneous gobble event", () => {
      const entries = [
        { id: "card", ts: 1000, nick: "Test", type: "lepers_bonus_awarded", text: "Carte gagnée !" },
        { id: "gobble", ts: 1000, nick: "Test", type: "longest_possible", text: "Gobble !" },
      ];
      for (const announcements of [entries, [...entries].reverse()]) {
        const mixed = buildMixedFeed({ announcements });
        assert.equal(mixed.length, 2);
        assert.deepEqual(new Set(mixed.map((entry) => entry.id)), new Set(["card", "gobble"]));
      }
    });

    await t.test("another finder plays exactly the target-round sound, respecting mute and phase", () => {
      let sounds;
      const played = [];
      const phaseRef = { current: "playing" };
      const appViewRef = { current: "live" };
      function SoundProbe({ muted = false }) {
        sounds = useGameSounds({
          phaseRef, appViewRef, nicknameRef: { current: "Tigre" }, isSfxMuted: muted,
          playOneShotAudio: (...args) => played.push(args),
        });
        return null;
      }
      renderToStaticMarkup(React.createElement(SoundProbe));
      sounds.playSpecialFoundSound();
      const targetSound = played.pop();
      sounds.maybePlayAnnouncementSound({ type: "lepers_bonus_awarded", nick: "Test" });
      assert.equal(played.length, 1);
      assert.equal(played[0][0], SFX_KEYS.specialFound);
      assert.deepEqual(played[0], targetSound);
      played.length = 0;
      sounds.maybePlayAnnouncementSound({ type: "lepers_bonus_awarded", nick: " TIGRE " });
      assert.equal(played.length, 0);
      phaseRef.current = "results";
      sounds.maybePlayAnnouncementSound({ type: "lepers_bonus_awarded", nick: "Test" });
      assert.equal(played.length, 0);
      phaseRef.current = "playing";
      appViewRef.current = "daily_play";
      sounds.maybePlayAnnouncementSound({ type: "lepers_bonus_awarded", nick: "Test" });
      assert.equal(played.length, 0);
      appViewRef.current = "live";
      renderToStaticMarkup(React.createElement(SoundProbe, { muted: true }));
      sounds.maybePlayAnnouncementSound({ type: "lepers_bonus_awarded", nick: "Test" });
      assert.equal(played.length, 0);
    });
  } finally {
    await vite.close();
  }
});
