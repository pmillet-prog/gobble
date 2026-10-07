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
  cacheDir: ".tmp/presenter-results-vite",
  optimizeDeps: { entries: ["dev/presenter-results/index.html", "dev/presenter-results/definition.html"] },
  css: { postcss: { plugins: [tailwindcss({ darkMode: "class",
    content: ["./src/**/*.{js,jsx}", "./dev/presenter-results/*.{js,jsx}"], theme: { extend: {} }, plugins: [],
  }), autoprefixer()] } },
  server: { host: "127.0.0.1", port: 8771, strictPort: true, hmr: false,
    watch: { ignored: [/(?:^|[/\\])\.tmp(?:[/\\]|$)/i, "**/public/emojis/**"] } },
});
await server.listen();
console.log("Présentateurs et bilan : http://127.0.0.1:8771/dev/presenter-results/");
