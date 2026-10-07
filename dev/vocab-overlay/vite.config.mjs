import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "tailwindcss";
import autoprefixer from "autoprefixer";

// Isolated client fixture: deliberately no API proxy and no game server.
export default defineConfig({
  plugins: [{
    name: "vocab-fixture-render-counter", enforce: "pre",
    transform(code, id) {
      if (!/\/VocabProgressOverlay(?:View)?\.jsx(?:\?|$)/.test(id.replaceAll("\\", "/"))) return null;
      // Instrument only the full view body; the public bridge is intentionally excluded.
      const instrumented = code.replace(/(controllerRef\s*\r?\n\s*\) \{)/, "$1\n    window.__vocabViewRender?.();");
      return instrumented === code ? null : { code: instrumented, map: null };
    },
  }, react()],
  css: { postcss: { plugins: [tailwindcss({
    darkMode: "class",
    content: ["./src/**/*.{js,jsx}", "./.tmp/vocab-overlay/baseline/src/**/*.{js,jsx}", "./dev/vocab-overlay/*.jsx"],
    theme: { extend: {} }, plugins: [],
  }), autoprefixer()] } },
  optimizeDeps: { entries: ["dev/vocab-overlay/index.html"] },
  server: {
    host: "127.0.0.1", port: 5187, strictPort: true, hmr: false,
    watch: { ignored: [/(?:^|[/\\])\.tmp(?:[/\\]|$)/i, "**/public/emojis/**"] },
  },
});
