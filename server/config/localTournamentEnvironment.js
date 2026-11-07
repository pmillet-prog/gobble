import { readFile } from "node:fs/promises";

// Explicit configuration of this checkout, ignored by Git and never read in
// production. It lets the usual `npm start` retain the local tournament opt-in.
export async function loadLocalTournamentEnvironment({
  env = process.env,
  args = process.argv.slice(2),
  readFileImpl = readFile,
  filename = new URL("../../.Tmp/gobble-development.json", import.meta.url),
} = {}) {
  const explicit = args.includes("--local");
  if (env.NODE_ENV === "production") {
    if (explicit) throw new Error("Le mode local ne peut pas démarrer avec NODE_ENV=production.");
    return false;
  }
  let enabled = explicit;
  if (!enabled) {
    let config;
    try { config = JSON.parse(await readFileImpl(filename, "utf8")); }
    catch (error) {
      if (error.code === "ENOENT") return false;
      throw new Error("Configuration locale du tournoi illisible.", { cause: error });
    }
    enabled = config.version === 1 && config.infortuneTournament === true;
  }
  if (!enabled) return false;
  env.GOBBLE_LOCAL_INFORTUNE_ENABLED = "1";
  return true;
}
