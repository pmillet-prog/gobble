import { fileURLToPath } from "node:url";
import { createServer } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "tailwindcss";
import autoprefixer from "autoprefixer";

const server = await createServer({
  configFile: false,
  root: fileURLToPath(new URL("../../", import.meta.url)),
  resolve: { preserveSymlinks: true },
  plugins: [react()],
  cacheDir: ".tmp/target-quiz-vite",
  optimizeDeps: { entries: ["dev/target-quiz/index.html"] },
  css: { postcss: { plugins: [tailwindcss({ darkMode: "class",
    content: ["./src/**/*.{js,jsx}", "./dev/target-quiz/*.{js,jsx}"], theme: { extend: {} }, plugins: [],
  }), autoprefixer()] } },
  server: { host: "127.0.0.1", port: 8773, strictPort: true, hmr: false,
    watch: { ignored: [/(?:^|[/\\])\.tmp(?:[/\\]|$)/i, "**/public/emojis/**"] } },
});
await server.listen();
console.log("Mots rares : http://127.0.0.1:8773/dev/target-quiz/ — aucune connexion au serveur de jeu.");
