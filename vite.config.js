import { defineConfig } from "vite";
import { fileURLToPath } from "node:url";
import react from "@vitejs/plugin-react";
import { nativeMediaManifestPlugin } from "./scripts/android/mediaManifestPlugin.mjs";
import { cameraTimelineStoragePlugin } from "./dev/infortune-perspective/cameraTimelineStoragePlugin.mjs";
import { clientVersionPlugin } from './scripts/clientVersionPlugin.mjs';

export default defineConfig({
  plugins: [react(), nativeMediaManifestPlugin(), cameraTimelineStoragePlugin(), clientVersionPlugin()],
  worker: { format: 'es' },
  optimizeDeps: {
    entries: ["index.html"],
    include: ["@react-three/fiber", "three"],
  },
  build: {
    rollupOptions: {
      // Separate documents keep the workshop's renderer and styles out of the
      // home screen, while sharing the normal dev and preview server.
      input: {
        game: fileURLToPath(new URL("./index.html", import.meta.url)),
        wheelTraining: fileURLToPath(new URL("./entrainement/roue/index.html", import.meta.url)),
        wheel3d: fileURLToPath(new URL("./dev/infortune-perspective/index.html", import.meta.url)),
        wheel2d: fileURLToPath(new URL("./dev/infortune/index.html", import.meta.url)),
        wheelFinale: fileURLToPath(new URL("./dev/infortune-finale/index.html", import.meta.url)),
        roundIntro: fileURLToPath(new URL("./dev/round-intro/index.html", import.meta.url)),
      },
    },
  },
  server: {
    host: "0.0.0.0",
    port: 3000,
    // Local builds and investigations can contain hundreds of thousands of
    // files. They must not be watched by the game's development server.
    watch: {
      ignored: [
        /(?:^|[/\\])\.tmp(?:[/\\]|$)/i,
        // The installed emoji pack is static, like a dependency: watching its
        // 4,500 images costs seconds on Windows. Files are still served normally;
        // restart Vite after replacing the pack or adding emoji files.
        "**/public/emojis/**",
      ],
    },
    proxy: {
      // Append the actual peer so a client-supplied forwarding header cannot
      // masquerade as the client address in the connection security journal.
      "/api": { target: "http://127.0.0.1:4000", xfwd: true },
      "/socket.io": {
        target: "http://127.0.0.1:4000",
        ws: true,
      },
    },
  },
});
