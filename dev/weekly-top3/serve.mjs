import { fileURLToPath } from "node:url";
import { createServer } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "tailwindcss";
import autoprefixer from "autoprefixer";

// Standalone client fixture, no game API proxy or backend process.
const server = await createServer({
  configFile: false,
  root: fileURLToPath(new URL("../../", import.meta.url)),
  resolve: { preserveSymlinks: true },
  plugins: [react()],
  cacheDir: ".tmp/weekly-top3-vite",
  optimizeDeps: { entries: ["dev/weekly-top3/index.html"] },
  css: { postcss: { plugins: [tailwindcss({ darkMode: "class",
    content: ["./src/**/*.{js,jsx}", "./dev/weekly-top3/*.{js,jsx}"], theme: { extend: {} }, plugins: [],
  }), autoprefixer()] } },
  server: { host: "127.0.0.1", port: 8773, strictPort: true, hmr: false,
    watch: { ignored: [/(?:^|[/\\])\.tmp(?:[/\\]|$)/i, "**/public/emojis/**"] } },
});
await server.listen();
console.log("Top 3 hebdo : http://127.0.0.1:8773/dev/weekly-top3/");
