import { fileURLToPath } from "node:url";
import { createServer } from "vite";

const server = await createServer({
  configFile: false,
  root: fileURLToPath(new URL("../../", import.meta.url)),
  resolve: { preserveSymlinks: true },
  cacheDir: ".tmp/avatar-faces-vite",
  optimizeDeps: { noDiscovery: true, include: [], entries: [] },
  server: {
    host: "127.0.0.1", port: 8770, strictPort: true,
    watch: { ignored: [/(?:^|[/\\])\.tmp(?:[/\\]|$)/i, "**/public/emojis/**"] },
  },
});
await server.listen();
console.log("Revue locale des visages : http://127.0.0.1:8770/dev/avatar-faces/");
