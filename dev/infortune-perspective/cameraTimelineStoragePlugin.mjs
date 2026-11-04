import { readFile, writeFile, rename } from "node:fs/promises";
import { fileURLToPath } from "node:url";

const savedFile = fileURLToPath(new URL("./cameraTimeline.saved.json", import.meta.url));
const endpoint = "/__atelier/infortune/camera-sequence";
const durations = { intro: 5, launch: 3, results: 3 };
const tracks = ["elevation", "perspective", "focal", "framing", "offsetX", "offsetY", "roll"];

export function validateSavedSequence(value) {
  const duration = Object.hasOwn(durations, value?.sequence) ? durations[value.sequence] : null;
  if (!duration || !value.tracks) throw new Error("Séquence invalide.");
  const sequence = Object.fromEntries(tracks.map(key => {
    const points = value.tracks[key];
    if (!Array.isArray(points) || points.length > 100 || points.some(point =>
      !Number.isFinite(point?.time) || point.time < 0 || point.time > duration || !Number.isFinite(point?.value))) {
      throw new Error("Points de caméra invalides.");
    }
    return [key, points.map(({ time, value }) => ({ time, value }))];
  }));
  if (value.sequence === "launch" && (!Number.isFinite(value.speedThreshold) || value.speedThreshold < 0.05 || value.speedThreshold > 3)) {
    throw new Error("Seuil de vitesse invalide.");
  }
  return { sequence: value.sequence, tracks: sequence, speedThreshold: value.speedThreshold };
}

// Local Vite workshop only: one fixed JSON file, no gameplay API or backend.
// Serialize saves so two sequence buttons cannot overwrite each other's data.
export function cameraTimelineStoragePlugin({ file = savedFile } = {}) {
  let writing = Promise.resolve();
  return {
    name: "infortune-camera-sequence-storage", apply: "serve",
    handleHotUpdate(context) { if (context.file.replaceAll("\\", "/") === file.replaceAll("\\", "/")) return []; },
    configureServer(server) {
      server.middlewares.use(endpoint, async (request, response) => {
        const reply = (status, body) => {
          response.writeHead(status, { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" });
          response.end(JSON.stringify(body));
        };
        if (request.method === "GET") {
          try {
            await writing;
            reply(200, { project: JSON.parse(await readFile(file, "utf8")) });
          } catch (error) {
            if (error.code === "ENOENT") reply(200, { project: {} });
            else reply(500, { error: "Impossible de lire les séquences sauvegardées." });
          }
          return;
        }
        if (request.method !== "POST") { reply(405, { error: "Méthode non autorisée." }); return; }
        // Reject cross-origin forms/fetches; LAN phones served by this Vite
        // instance may save their own workshop edits through the same origin.
        const origin = request.headers.origin;
        if (!["http", "https"].some(protocol => origin === `${protocol}://${request.headers.host}`)
          || !request.headers["content-type"]?.startsWith("application/json")) {
          reply(403, { error: "Sauvegarde autorisée uniquement depuis cet atelier." }); return;
        }
        let value;
        try {
          let body = "";
          for await (const chunk of request) {
            body += chunk;
            if (Buffer.byteLength(body) > 64000) { reply(413, { error: "Séquence trop volumineuse." }); return; }
          }
          value = validateSavedSequence(JSON.parse(body));
        } catch { reply(400, { error: "Séquence invalide." }); return; }
        const save = writing.then(async () => {
          let saved;
          try { saved = JSON.parse(await readFile(file, "utf8")); }
          catch (error) { if (error.code === "ENOENT") saved = {}; else throw error; }
          saved[value.sequence] = value.tracks;
          if (value.sequence === "launch") saved.launchSpeedThreshold = value.speedThreshold;
          const temporary = `${file}.pending`;
          await writeFile(temporary, `${JSON.stringify(saved, null, 2)}\n`, "utf8");
          await rename(temporary, file);
        });
        writing = save.catch(() => {});
        try { await save; reply(200, { saved: value.sequence }); }
        catch { reply(500, { error: "Impossible d’écrire la sauvegarde dans le projet. Tes points restent dans le navigateur." }); }
      });
    },
  };
}
