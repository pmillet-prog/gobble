import { initPlayerProfileService } from "./playerProfileService.js";
import { runSerializedSqliteWrite } from "../sqliteQueue.js";
import { createGotusStatsRepository } from "./gotusStatsRepository.js";

// Worker-only: Gotus uses the existing profile DB and shared write queue.
const repository = createGotusStatsRepository({ getDb: initPlayerProfileService });
export function recordGotusWin(payload) {
  return runSerializedSqliteWrite(() => repository.recordWin(payload), { label: "gotus-win" });
}
export function getGotusProfile({ userId } = {}) {
  return runSerializedSqliteWrite(() => repository.profile(Number(userId)), { label: "gotus-profile" });
}
