import base from "../../vite.config.js";
export default { ...base, publicDir: false, build: { outDir: ".Tmp/avatar-rewards-build", emptyOutDir: false, rollupOptions: { input: "dev/avatar-rewards/index.html" } } };
