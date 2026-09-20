import test from "node:test";
import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import React from "react";
import { renderToString } from "react-dom/server";
import { createServer } from "vite";

const elements = tree => {
  if (!tree || typeof tree !== "object") return [];
  if (Array.isArray(tree)) return tree.flatMap(elements);
  return [tree, ...elements(tree.props?.children)];
};

test("ranking avatars, loading indicators, chat buttons and expense toast render together", async t => {
  const vite = await createServer({ appType: "custom", logLevel: "silent", server: { middlewareMode: true } });
  try {
    const [{ default: WeeklyStatsScreen }, { default: AvatarThumbnail }, { default: PlayerChatAvatar },
      { default: Celebration }, { GOBBLARS_SPEND_SOUND_URL }, { default: RankingWidgetMobile },
      { default: AvatarCheckoutDialog }, { default: AccountMenu }, { default: ProfileAvatar }] = await Promise.all([
      vite.ssrLoadModule("/src/components/stats/WeeklyStatsScreen.jsx"),
      vite.ssrLoadModule("/src/features/avatar/AvatarThumbnail.jsx"),
      vite.ssrLoadModule("/src/components/chat/PlayerChatAvatar.jsx"),
      vite.ssrLoadModule("/src/features/notifications/GobblarsRewardCelebration.jsx"),
      vite.ssrLoadModule("/src/audio/audioAssets.js"),
      vite.ssrLoadModule("/src/components/RankingWidgetMobile.jsx"),
      vite.ssrLoadModule("/src/features/avatar/AvatarCheckoutDialog.jsx"),
      vite.ssrLoadModule("/src/components/account/AccountMenu.jsx"),
      vite.ssrLoadModule("/src/components/profile/ProfileAvatar.jsx"),
    ]);
    await t.test("profile loading never requests the default portrait before the avatar is known", () => {
      const render = props => renderToString(React.createElement(ProfileAvatar, { nickname: "Paul", userId: 42, ...props }));
      for (const own of [false, true]) {
        const pending = render({ own, loading: true, avatar: { base: "homme" }, onEdit() {} });
        assert.match(pending, /Chargement de l’avatar/);
        assert.match(pending, /aria-busy="true"/);
        assert.doesNotMatch(pending, /<img|<canvas|Modifier mon avatar/);
        const custom = render({ own, avatar: { base: "homme" } });
        assert.match(custom, /<canvas/);
        assert.match(custom, /Chargement de l’avatar/, "keep the wheel while the portrait layers are being prepared");
        assert.doesNotMatch(custom, /\/avatars\/default.png/, "own profiles also use the fetched avatar before account sync finishes");
        const empty = render({ own, avatar: null });
        assert.match(empty, /\/avatars\/default.png/, "the default portrait is only for confirmed empty profiles");
        assert.doesNotMatch(empty, /Chargement de l’avatar/);
        const failed = render({ own, error: "Profil indisponible" });
        assert.match(failed, /Avatar indisponible/);
        assert.doesNotMatch(failed, /<img|<canvas|Chargement de l’avatar/);
      }
    });
    await t.test("rankings show lazy avatars with a loading circle, while season keeps vocabulary ranks", () => {
      const opened = [], entry = { nick: "Paul", userId: 42, playerKey: "install:42", totalScore: 1234, vocabCount: 1200 };
      let swiped = false;
      const runtime = {
        statsTab: "weekly", weeklyBoardsMeta: [{ key: "totalScore", label: "Score" }],
        activeWeeklyBoard: { label: "Score" }, weeklyEntriesByBoard: { totalScore: [entry] },
        safeWeeklyIndex: 0, seasonActiveIndex: 0, seasonVocabEntries: [entry], weeklyVocabLookup: new Map(),
        getSeasonPages: () => ["vocab_rank"], weeklySwipeTrack: {}, seasonSwipeTrack: {},
        isCrownedEntry: () => false, getUserIdFromPlayerProfileTarget: row => row.userId,
        shouldIgnoreSwipeClick: () => swiped, openPlayerProfile: target => opened.push(target),
        getImageUrl: key => `/ranks/${key}.png`,
      };
      const tree = WeeklyStatsScreen({ runtime });
      const thumbnail = elements(tree).find(element => element.type === AvatarThumbnail);
      assert.equal(thumbnail.props.userId, 42);
      thumbnail.props.onClick({ stopPropagation() {} });
      assert.deepEqual(opened, [{ userId: 42, nick: "Paul" }]);
      swiped = true;
      thumbnail.props.onClick({ stopPropagation() {} });
      assert.equal(opened.length, 1, "swiping must not open a profile");
      const markup = renderToString(tree);
      assert.match(markup, /\/api\/auth\/avatars\/42\/chat.png/);
      assert.match(markup, /Chargement de l’avatar/);
      assert.match(markup, /loading="lazy"/);
      const season = renderToString(WeeklyStatsScreen({ runtime: { ...runtime, statsTab: "season" } }));
      assert.doesNotMatch(season, /avatar-thumbnail|\/chat.png/);
      assert.match(season, /\/ranks\//);
    });
    await t.test("chat avatars forward the menu click and exclude guests and bots", () => {
      const clicked = [], event = {};
      const message = { userId: 42, installId: "42", nick: "Paul" };
      const element = PlayerChatAvatar.type({ message, onClick: value => clicked.push(value), label: "Menu de Paul" });
      element.props.onClick(event);
      assert.equal(clicked[0], event);
      const markup = renderToString(element);
      assert.match(markup, /<button[^>]+aria-label="Menu de Paul"/);
      assert.match(markup, /data-chat-author-button="true"/);
      assert.equal(renderToString(React.createElement(PlayerChatAvatar, { message: { nick: "Invité", installId: "guest-id" } })), "");
      assert.equal(renderToString(React.createElement(PlayerChatAvatar, { message: { ...message, isBot: true } })), "");
      assert.match(renderToString(React.createElement(AvatarThumbnail, { showPlaceholder: true })), /avatar-thumbnail-placeholder/);
    });
    await t.test("expenses use a minus, red variant and the supplied cash-register asset", () => {
      const reward = { amount: -500, before: 1000, balance: 500, startedAt: Date.now(), label: "Achat d’avatar" };
      const markup = renderToString(React.createElement(Celebration, { reward, sound: false }));
      assert.match(markup, /gobblars-reward-spent/);
      assert.match(markup, /<strong>-500<\/strong>/);
      assert.doesNotMatch(markup, /\+-500/);
      const path = decodeURIComponent(new URL(GOBBLARS_SPEND_SOUND_URL, "http://localhost").pathname);
      assert.equal(path, "/sound/game/Cash Register.mp3");
      assert.ok(existsSync(new URL(`../../public${path}`, import.meta.url)));
    });
    await t.test("result rankings render stored tiny PNGs in both layouts without a canvas", () => {
      const fullRanking = [{ nick: "Paul", userId: 42, score: 100 }, { nick: "Guest", installId: "guest-id", score: 10 }, { nick: "Robot", userId: 43, isBot: true, score: 1 }];
      for (const flatStyle of [false, true]) {
        const markup = renderToString(React.createElement(RankingWidgetMobile, { fullRanking, expanded: true, showWheel: false, showAvatars: true, flatStyle }));
        assert.match(markup, /\/avatars\/42\/chat.png/);
        assert.match(markup, /width="24"/); assert.match(markup, /Chargement de l’avatar/);
        assert.doesNotMatch(markup, /<canvas|\/avatars\/43\//);
      }
      assert.doesNotMatch(renderToString(React.createElement(RankingWidgetMobile, { fullRanking, expanded: true })), /avatar-thumbnail/);
    });
    await t.test("checkout clearly separates paid pieces, objectives and insufficient funds", () => {
      const plan = { purchasable: [{ family: "base", id: "homme", label: "Visage homme", price: 500 }, { family: "hair", id: "quiff", label: "Banane", price: 1000 }], unavailable: [], total: 1500, missing: 500 };
      const render = next => renderToString(React.createElement(AvatarCheckoutDialog, { plan: next, inventory: { balance: 1000 }, busy: false }));
      const markup = render(plan);
      assert.match(markup, /Visage homme/); assert.match(markup, /Banane/);
      assert.match(markup, /Il te manque/); assert.match(markup, /500 gobblars/);
      assert.match(markup, /class="avatar-save" disabled=""/);
      const objective = render({ ...plan, missing: 0, unavailable: [{ family: "headwear", id: "crown", label: "Couronne", description: "Gagner 100 tournois" }] });
      assert.match(objective, /ne s’achètent pas/); assert.match(objective, /Gagner 100 tournois/);
      assert.match(objective, /class="avatar-save" disabled=""/);
      assert.doesNotMatch(render({ ...plan, missing: 0 }), /class="avatar-save" disabled=""/);
    });
    await t.test("the account menu marks Voir mon profil as new", () => {
      const markup = renderToString(React.createElement(AccountMenu, { actions: {}, appearance: {}, auth: { authenticated: true }, labels: {} }));
      assert.match(markup, /Voir mon profil <span class="new-feature-badge ml-2">Nouveau !/);
    });
  } finally { await vite.close(); }
});
