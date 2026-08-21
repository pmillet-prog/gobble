export function buildRankingSignature(list) {
  if (!Array.isArray(list) || list.length === 0) return "";
  const size = list.length;
  let signature = `n:${size}|`;
  for (let index = 0; index < Math.min(size, 20); index += 1) {
    const entry = list[index] || {};
    const nick = String(entry.nick || "").trim();
    const userId = Number.isInteger(Number(entry.userId)) ? Number(entry.userId) : "";
    const score = Number.isFinite(entry.score)
      ? entry.score
      : Number.isFinite(entry.points)
      ? entry.points
      : 0;
    const rank = Number.isFinite(entry.rank) ? entry.rank : index + 1;
    const gobbles = Number.isFinite(entry.gobbles) ? entry.gobbles : 0;
    const afk = entry.afk ? "1" : "0";
    const dailyChampion =
      entry.isDailyChampion || entry.crowned || entry.isWeeklyChampion ? "1" : "0";
    const weeklyVocabPodiumRank =
      Number(entry.weeklyVocabPodiumRank) || (entry.isWeeklyVocabChampion ? 1 : 0);
    signature += `${nick}:${userId}:${rank}:${score}:${gobbles}:${afk}:${dailyChampion}:${weeklyVocabPodiumRank}|`;
  }
  return signature;
}

export function buildPlayersSignature(list) {
  if (!Array.isArray(list) || list.length === 0) return "";
  const size = list.length;
  let signature = `n:${size}|`;
  for (let index = 0; index < Math.min(size, 24); index += 1) {
    const entry = list[index] || {};
    const nick = String(entry.nick || "").trim();
    const userId = Number.isInteger(Number(entry.userId)) ? Number(entry.userId) : "";
    const team = String(entry.team || "");
    const bot = entry.isBot ? "1" : "0";
    const afk = entry.afk ? "1" : "0";
    const ready = entry.readyForTournament ? "1" : "0";
    const training = entry.inTraining ? `1:${String(entry.trainingMode || "")}` : "0";
    const dailyChampion =
      entry.isDailyChampion || entry.crowned || entry.isWeeklyChampion ? "1" : "0";
    const weeklyVocabPodiumRank =
      Number(entry.weeklyVocabPodiumRank) || (entry.isWeeklyVocabChampion ? 1 : 0);
    signature += `${nick}:${userId}:${team}:${bot}:${afk}:${ready}:${training}:${dailyChampion}:${weeklyVocabPodiumRank}|`;
  }
  return signature;
}
