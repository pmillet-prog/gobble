import { loadLocalMailEnvironment } from "../config/localMailEnvironment.js";
import { loadLocalTournamentEnvironment } from "../config/localTournamentEnvironment.js";

if (await loadLocalTournamentEnvironment()) {
  console.info("[local] Mini-tournoi : quatre lancers de roue, échanges et finale activés.");
}

await loadLocalMailEnvironment();
// Import only after configuration is loaded, including for export workers.
await import("../index.js");
