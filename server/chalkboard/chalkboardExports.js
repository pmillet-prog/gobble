import path from "node:path";
import { fileURLToPath } from "node:url";
import { Worker } from "node:worker_threads";
import { chalkboardMailConfig, isChalkboardMailEnabled } from "./chalkboardMail.js";
import { CHALKBOARD_PNG_VERSION } from './chalkboardExportVersion.js';

export function runChalkboardExportWorker(workerData) {
  return new Promise((resolve, reject) => {
    const worker = new Worker(new URL("./chalkboardExportWorker.js", import.meta.url), { workerData });
    const timer = setTimeout(() => { void worker.terminate(); reject(new Error("export_timeout")); }, 300000);
    worker.once("message", message => {
      clearTimeout(timer);
      if (message.ok) resolve(message.result);
      else reject(new Error(message.error));
    });
    worker.once("error", error => { clearTimeout(timer); reject(error); });
    worker.once("exit", code => { clearTimeout(timer); if (code) reject(new Error(`export_worker_exit_${code}`)); });
  });
}

export function createChalkboardExports({ service,
  directory = path.join(process.env.GOBBLE_DATA_DIR || fileURLToPath(new URL("../../data/", import.meta.url)), "chalkboard-exports"),
  runWorker = runChalkboardExportWorker, now = () => Date.now(), configured = () => !!chalkboardMailConfig(),
  mailEnabled = () => isChalkboardMailEnabled(),
  log = console.warn,
}) {
  let timer = null, active = null, stopped = false;
  const tick = () => {
    if (active) return active;
    active = (async () => {
      await service.getSnapshot("free"); // Monday reset, even with no visitors.
      const deliveryEnabled = !!mailEnabled();
      const pending = await service.repository.nextExport(now(), { mailEnabled: deliveryEnabled });
      const job = pending || await service.repository.nextArchiveToRender?.(now());
      if (!job) return;
      try {
        let filename = job.png_path;
        if (!filename || (job.png_version || 0) < CHALKBOARD_PNG_VERSION) {
          // Keep the previous archive readable until its replacement is complete.
          filename = path.join(directory, `${job.id}${filename ? `.v${CHALKBOARD_PNG_VERSION}` : ''}.png`);
          await runWorker({ action: "render", snapshot: JSON.parse(job.snapshot), filename });
          await service.repository.setPng(job.id, filename, CHALKBOARD_PNG_VERSION);
        }
        // Local archives remain available without SMTP attempts or retries.
        if (!pending || !deliveryEnabled) return;
        if (!configured()) throw new Error("mail_not_configured");
        await runWorker({ action: "send", id: job.id, weekId: job.week_id, filename });
        await service.repository.markSent(job.id, now());
      } catch (error) {
        await service.repository.markFailed(job.id, now(), job.attempts + 1, String(error.message || "export_failed").slice(0, 120));
        log("[chalkboard] PNG delivery pending", job.id, error.message);
      }
    })().finally(() => { active = null; });
    return active;
  };
  const schedule = () => {
    timer = setTimeout(async () => {
      try { await tick(); } catch (error) { log("[chalkboard] archive check failed", error.message); }
      if (!stopped) schedule();
    }, 60000);
    timer.unref?.();
  };
  return {
    tick,
    start() { if (timer || stopped) return; schedule(); void tick().catch(error => log("[chalkboard] archive check failed", error.message)); },
    async stop() { stopped = true; clearTimeout(timer); await active; },
    mailEnabled() { return !!mailEnabled(); },
    configured() {
      // Status routes must remain usable even if a service credential cannot be
      // read. The delivery attempt above records the precise failure for retry.
      try { return !!mailEnabled() && !!configured(); } catch { return false; }
    },
  };
}
