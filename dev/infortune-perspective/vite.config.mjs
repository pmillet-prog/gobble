import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { stageAvatarAssets } from "./stageAvatarAssets.mjs";
import { cameraTimelineStoragePlugin } from "./cameraTimelineStoragePlugin.mjs";

export default defineConfig({
  root: fileURLToPath(new URL("../../", import.meta.url)),
  resolve: { preserveSymlinks: true }, plugins: [react(), stageAvatarAssets(), cameraTimelineStoragePlugin()],
  cacheDir: ".tmp/infortune-perspective-vite",
  css: { postcss: { plugins: [] } },
  optimizeDeps: { entries: ["dev/infortune-perspective/index.html"] },
  server: { host: "127.0.0.1", port: 8777, strictPort: true,
    watch: { ignored: ["**/.tmp/**", "**/.Tmp/**", "**/public/**", "**/data/**"] } },
  build: { outDir: ".tmp/infortune-perspective-build", emptyOutDir: true, copyPublicDir: false,
    rollupOptions: { input: fileURLToPath(new URL("./index.html", import.meta.url)) } },
});
