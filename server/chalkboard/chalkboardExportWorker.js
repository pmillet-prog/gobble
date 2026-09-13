import { parentPort, workerData } from "node:worker_threads";

try {
  const result = workerData.action === "render"
    ? await (await import("./chalkboardPng.js")).renderChalkboardPng(workerData.snapshot, workerData.filename)
    : await (await import("./chalkboardMail.js")).sendChalkboardPng(workerData);
  parentPort.postMessage({ ok: true, result });
} catch (error) {
  // Never relay SMTP credentials or attachment contents into HTTP/log output.
  parentPort.postMessage({ ok: false, error: String(error.code || error.message || "export_failed").slice(0, 120) });
} finally { parentPort.close(); }
