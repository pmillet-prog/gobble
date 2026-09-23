// Isolated frontend only: never starts/restarts the game backend or executes app code.
import { performance } from "node:perf_hooks";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { createServer } from "vite";
import { parseAst } from "rollup/parseAst";

const root = fileURLToPath(new URL("../", import.meta.url));
const started = performance.now();
const ms = value => Math.round(value);
const server = await createServer({ root, logLevel: "error", server: { host: "127.0.0.1", port: 0, hmr: false, proxy: {} } });
let watchReady = false;
server.watcher.once("ready", () => { watchReady = true; });
try {
  const created = performance.now();
  await server.listen();
  const origin = `http://127.0.0.1:${server.httpServer.address().port}`;
  console.log(JSON.stringify({ phase: "frontend ready", createMs: ms(created - started), listenMs: ms(performance.now() - started) }));
  const htmlStarted = performance.now();
  await (await fetch(`${origin}/`)).text();
  console.log(JSON.stringify({ phase: "html", ms: ms(performance.now() - htmlStarted) }));
  for (const pass of ["cold transforms", "warm transforms"]) {
    const pending = ["/src/main.jsx"], seen = new Set(pending), times = [];
    const graphStarted = performance.now();
    while (pending.length) {
      await Promise.all(pending.splice(0, 8).map(async url => {
        const start = performance.now();
        const response = await fetch(origin + url, { signal: AbortSignal.timeout(30000) });
        if (!response.ok) throw new Error(`${response.status}: ${url}`);
        const code = await response.text();
        times.push({ url, ms: ms(performance.now() - start), bytes: Buffer.byteLength(code) });
        if (!/javascript/.test(response.headers.get("content-type") || "")) return;
        const ast = parseAst(code);
        for (const node of ast.body) {
          if (!["ImportDeclaration", "ExportNamedDeclaration", "ExportAllDeclaration"].includes(node.type) || !node.source?.value) continue;
          const dependency = new URL(node.source.value, origin + url);
          if (dependency.origin !== origin) continue;
          const key = dependency.pathname + dependency.search;
          if (seen.has(key)) continue;
          seen.add(key); pending.push(key);
        }
      }));
    }
    console.log(JSON.stringify({ phase: pass, ms: ms(performance.now() - graphStarted), modules: times.length,
      megabytes: +(times.reduce((sum, item) => sum + item.bytes, 0) / 1e6).toFixed(2), slowest: times.sort((a, b) => b.ms - a.ms).slice(0, 8) }));
  }
  const watched = server.watcher.getWatched();
  const counts = {};
  for (const [directory, files] of Object.entries(watched)) {
    const folder = path.relative(root, directory).split(path.sep)[0] || ".";
    counts[folder] = (counts[folder] || 0) + files.length;
  }
  console.log(JSON.stringify({ phase: "watcher", ready: watchReady, directories: Object.keys(watched).length, entriesByFolder: counts }));
} finally {
  await server.close();
}
