import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// No backend proxy: this fixture only serves local components and assets.
export default defineConfig({
  plugins: [react()],
  optimizeDeps: { entries: ["dev/mobile-viewport/index.html"] },
  server: {
    host: "127.0.0.1",
    port: 5186,
    strictPort: true,
    hmr: false,
    watch: { ignored: [/(?:^|[/\\])\.tmp(?:[/\\]|$)/i, "**/public/emojis/**"] },
  },
});
