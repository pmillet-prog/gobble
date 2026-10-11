import base from "../../vite.config.js";

export default {
  ...base,
  publicDir: false,
  build: {
    outDir: ".Tmp/trophies-build",
    emptyOutDir: false,
    rollupOptions: { input: "dev/trophies/index.html" },
  },
};
