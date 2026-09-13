import { loadLocalMailEnvironment } from "../config/localMailEnvironment.js";

await loadLocalMailEnvironment();
// Import only after configuration is loaded, including for export workers.
await import("../index.js");
