import { fileURLToPath } from "node:url";
import { createServer } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "tailwindcss";
import autoprefixer from "autoprefixer";

// Client fixture only: no game API proxy and no backend process.
const server = await createServer({
  configFile: false, root: fileURLToPath(new URL("../../", import.meta.url)),
  resolve: { preserveSymlinks: true }, plugins: [react()], cacheDir: ".tmp/stats-vite",
  optimizeDeps: { entries: ["dev/stats/index.html"] },
  css: { postcss: { plugins: [tailwindcss({ darkMode: "class", content: ["./src/**/*.{js,jsx}", "./dev/stats/*.{js,jsx}"], theme: { extend: {} }, plugins: [] }), autoprefixer()] } },
  server: { host: "127.0.0.1", port: 8774, strictPort: true, hmr: false, watch: { ignored: [/(?:^|[/\\])\.tmp(?:[/\\]|$)/i, "**/public/emojis/**"] } },
});
await server.listen();
console.log("Statistiques : http://127.0.0.1:8774/dev/stats/");
