import base from "../../vite.config.js";

export default {
  ...base,
  publicDir: false,
  build: {
    outDir: ".Tmp/avatar-celebration-build",
    emptyOutDir: false,
    rollupOptions: { input: "dev/avatar-celebration/index.html" },
  },
};
