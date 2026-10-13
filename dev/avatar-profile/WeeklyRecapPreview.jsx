import React from "react";
import DuelWeekRecapOverlay from "../../src/components/DuelWeekRecapOverlay.jsx";
import { normalizeAvatar } from "../../src/features/avatar/avatarState.js";
import { TROPHY_REWARDS } from "../../shared/trophyCatalog.js";

function demoTrophyAwards(players) {
  const mode = new URLSearchParams(window.location.search).get("weeklyTrophies");
  if (mode === "empty") return [];
  if (mode === "absent" || mode === "unavailable") return undefined;
  if (mode === "all") return TROPHY_REWARDS.map((reward, index) => ({ id: reward.id,
    recipients: Array.from({ length: index === 0 ? 66 : 12 }, (_, playerIndex) => ({
      userId: 987654400 + playerIndex,
      nick: playerIndex === 0 ? "LeJoueurAuPseudonymeParticulièrementLong" : `Joueur ${playerIndex + 1}`,
      count: reward.repeatable ? playerIndex + 1 : 1,
    })),
  }));
  const winner = (index, count = 1) => ({ userId: players[index].userId, nick: players[index].nick, count });
  return [
    { id: "weekly_gold", recipients: [winner(0)] },
    { id: "volume_100", recipients: [winner(0), winner(1)] },
    { id: "word_16", recipients: [winner(1, 3)] },
    { id: "words_100000:bronze", recipients: [winner(0), winner(1)] },
    { id: "words_100000:silver", recipients: [winner(0)] },
    { id: "words_100000", recipients: [winner(0, 16), winner(1, 2)] },
  ];
}

export default function WeeklyRecapPreview({ avatar, onClose }) {
  const [page, setPage] = React.useState(0);
  const summary = React.useMemo(() => {
    const players = [
      { userId: 987654322, nick: "Tigre", avatar, weeklyVocabCount: 1824, points: 1250, total: 24, wordsCount: 48, totalScore: 22410 },
      { userId: 987654323, nick: "Myrtille", avatar: normalizeAvatar({ base: "femme", hair: "bob", glasses: "vue_ronde", hairColor: "#934b32" }), weeklyVocabCount: 1548, points: 1105, total: 18, wordsCount: 45, totalScore: 19650 },
      { isBot: true, nick: "Bernard Pinot", weeklyVocabCount: 1320, points: 940, total: 12, wordsCount: 41, totalScore: 18300 },
    ];
    return { weekId: "Semaine de démonstration", totalsByTeam: { red: 12480, blue: 11360 }, winnerTeam: "red",
      contributorsByTeam: { red: [players[0], players[2]], blue: [players[1]] },
      weeklyRecords: { medals: players, mostWordsInGame: players, totalScore: players },
      weeklyVocabPodium: players,
      trophyAwards: demoTrophyAwards(players),
    };
  }, [avatar]);
  return <DuelWeekRecapOverlay open summary={summary} page={page} onNext={() => setPage(value => value + 1)} onClose={onClose} formatNumber={value => value.toLocaleString("fr-FR")} />;
}
