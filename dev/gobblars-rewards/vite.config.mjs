import base from "../../vite.config.js";
export default { ...base, publicDir: false, build: { outDir: ".Tmp/gobblars-rewards-build", emptyOutDir: false, rollupOptions: { input: "dev/gobblars-rewards/index.html" } } };
