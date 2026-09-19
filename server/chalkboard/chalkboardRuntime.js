import path from "node:path";
import { fileURLToPath } from "node:url";
import { randomUUID } from "node:crypto";
import { createChalkboardService } from "./chalkboardService.js";
import { openChalkboardRepository } from "./chalkboardRepository.js";

export async function createPersistentChalkboard({
  dataDir = process.env.GOBBLE_DATA_DIR || fileURLToPath(new URL("../../data/", import.meta.url)),
  now = () => Date.now(), repository, ...options
} = {}) {
  const store = repository || await openChalkboardRepository(path.join(dataDir, "chalkboard.sqlite"));
  const core = createChalkboardService({ ...options, now });
  const saved = await store.load();
  if (saved) core.restoreState(saved);
  else await store.save(null, core.exportState(), now());
  let queue = Promise.resolve();
  const exclusive = operation => {
    const result = queue.then(operation);
    queue = result.catch(() => {});
    return result;
  };
  const execute = (method, args) => exclusive(async () => {
    const before = core.exportState();
    try {
      const result = core[method](...args);
      const after = core.exportState();
      if (before.revision !== after.revision || before.weekId !== after.weekId) await store.save(before, after, now());
      return result;
    } catch (error) { core.restoreState(before); throw error; }
  });
  const runtime = Object.fromEntries(["getSnapshot", "addIntervention", "deleteIntervention", "undoLastDeletion", "canUndoDeletion", "exportSealedAudit"].map(method => [method, (...args) => execute(method, args)]));
  runtime.getFonts = core.getFonts;
  runtime.queueExport = async identity => {
    await runtime.getSnapshot("free");
    return exclusive(() => store.enqueue(core.exportState(), `manual-${randomUUID()}`, now(), String(identity.userId)));
  };
  runtime.repository = Object.fromEntries(["nextExport", "setPng", "markSent", "markFailed", "exportStatus", "listArchives", "getArchive"].map(method => [method, (...args) => exclusive(() => store[method](...args))]));
  runtime.close = async () => { await queue; await store.close(); };
  // Reconcile a Monday crossed while the process was offline, before serving.
  await runtime.getSnapshot("free");
  return runtime;
}
