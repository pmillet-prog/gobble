import { fileURLToPath } from "node:url";
import { createServer } from "vite";
import react from "@vitejs/plugin-react";

const server = await createServer({
  configFile: false,
  root: fileURLToPath(new URL("../../", import.meta.url)),
  resolve: { preserveSymlinks: true },
  plugins: [react()],
  cacheDir: ".tmp/chalkboard-unread-vite",
  optimizeDeps: { entries: ["dev/chalkboard-unread/index.html"] },
  css: { postcss: { plugins: [] } },
  server: { host: "127.0.0.1", port: 8772, strictPort: true, hmr: false,
    watch: { ignored: [/(?:^|[/\\])\.tmp(?:[/\\]|$)/i, "**/public/emojis/**"] } },
});
await server.listen();
console.log("Grand tableau : http://127.0.0.1:8772/dev/chalkboard-unread/");
