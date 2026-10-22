import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "tailwindcss";
import autoprefixer from "autoprefixer";

export default defineConfig({
  plugins: [react()],
  css: { postcss: { plugins: [tailwindcss({ content: ["./src/**/*.{js,jsx}", "./dev/gotus/*.jsx"], theme: { extend: {} }, plugins: [] }), autoprefixer()] } },
  optimizeDeps: { entries: ["dev/gotus/index.html"] },
  server: { host: "127.0.0.1", port: 5192, strictPort: true, hmr: false,
    watch: { ignored: [/(?:^|[/\\])\.tmp(?:[/\\]|$)/i, "**/public/emojis/**"] },
  },
});
