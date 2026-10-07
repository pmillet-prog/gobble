import { fileURLToPath } from "node:url";
import { createServer } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "tailwindcss";
import autoprefixer from "autoprefixer";

// Standalone client fixture: no game backend and no API proxy.
const server = await createServer({
  configFile: false,
  root: fileURLToPath(new URL("../../", import.meta.url)),
  resolve: { preserveSymlinks: true },
  plugins: [react()],
  cacheDir: ".tmp/gobblars-history-vite",
  optimizeDeps: { entries: ["dev/gobblars-history/index.html"] },
  css: { postcss: { plugins: [tailwindcss({ darkMode: "class",
    content: ["./src/**/*.{js,jsx}", "./dev/gobblars-history/*.{js,jsx}"], theme: { extend: {} }, plugins: [],
  }), autoprefixer()] } },
  server: { host: "127.0.0.1", port: 8774, strictPort: true, hmr: false,
    watch: { ignored: [/(?:^|[/\\])\.tmp(?:[/\\]|$)/i, "**/public/emojis/**"] } },
});
await server.listen();
console.log("Historique gobblars : http://127.0.0.1:8774/dev/gobblars-history/");
