import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  optimizeDeps: {
    entries: ["index.html"],
    include: ["@react-three/fiber", "three"],
  },
  server: {
    host: "0.0.0.0",
    port: 3000,
    // Local builds and investigations can contain hundreds of thousands of
    // files. They must not be watched by the game's development server.
    watch: { ignored: ["**/.tmp/**"] },
    proxy: {
      "/api": "http://127.0.0.1:4000",
      "/socket.io": {
        target: "http://127.0.0.1:4000",
        ws: true,
      },
    },
  },
});
