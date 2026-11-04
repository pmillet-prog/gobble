import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  root: fileURLToPath(new URL("../../", import.meta.url)),
  resolve: { preserveSymlinks: true },
  plugins: [react()],
  cacheDir: ".tmp/infortune-vite",
  css: { postcss: { plugins: [] } },
  optimizeDeps: { entries: ["dev/infortune/index.html"] },
  server: { host: "127.0.0.1", port: 8776, strictPort: true,
    watch: { ignored: ["**/.tmp/**", "**/.Tmp/**", "**/public/**", "**/data/**"] } },
  build: { outDir: ".tmp/infortune-build", emptyOutDir: true, copyPublicDir: false,
    rollupOptions: { input: fileURLToPath(new URL("./index.html", import.meta.url)) } },
});
