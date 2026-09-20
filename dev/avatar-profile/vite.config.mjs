import base from "../../vite.config.js";

export default {
  ...base,
  publicDir: false,
  build: {
    outDir: ".Tmp/avatar-profile-build",
    emptyOutDir: false,
    rollupOptions: { input: "dev/avatar-profile/index.html" },
  },
};
