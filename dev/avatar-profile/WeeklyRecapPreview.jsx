import React from "react";
import DuelWeekRecapOverlay from "../../src/components/DuelWeekRecapOverlay.jsx";
import { normalizeAvatar } from "../../src/features/avatar/avatarState.js";

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
    };
  }, [avatar]);
  return <DuelWeekRecapOverlay open summary={summary} page={page} onNext={() => setPage(value => value + 1)} onClose={onClose} formatNumber={value => value.toLocaleString("fr-FR")} />;
}
