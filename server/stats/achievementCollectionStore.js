import { initPlayerProfileService } from "./playerProfileService.js";
import { runSerializedSqliteWrite } from "../sqliteQueue.js";
import { createAchievementCollectionRepository } from "./achievementCollectionRepository.js";

const repository = createAchievementCollectionRepository({ getDb: initPlayerProfileService });
export function achievementCollectionJob({ action, ...payload }) {
  // The module is worker-only; no additional connection or timer on the game loop.
  return runSerializedSqliteWrite(async () => {
    if (action === "record") return repository.record(payload);
    if (action === "bootstrap") return repository.bootstrap();
    if (action === "read") return repository.snapshot(payload.userId);
    if (action === "sync") return { achievements: await repository.snapshot(payload.userId), awards: await repository.pending(payload.userId) };
    if (action === "ack") return repository.acknowledge(payload.userId, payload.eventIds);
    if (action === "round") return repository.roundAwards(payload.roundId);
    if (action === "weeklyRecap") return repository.weeklyRecap(payload.weekStartTs);
    if (action === "leaderboard") return repository.leaderboard(payload.topN);
    throw new Error("invalid_achievement_action");
  }, { label: "achievement-collection" });
}
