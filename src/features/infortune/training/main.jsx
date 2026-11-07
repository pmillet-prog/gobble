import React from "react";
import { createRoot } from "react-dom/client";
import WheelTraining from "./WheelTraining.jsx";
import "./wheelTraining.css";

const Admin = React.lazy(() => import("./WheelDiagnosticsAdmin.jsx"));
const diagnostics = new URLSearchParams(window.location.search).get("diagnostics") === "1";
const setupMode = new URLSearchParams(window.location.search).get("reglage");
const setup = setupMode === "1" || (import.meta.env.DEV && setupMode === "initial");
const GraphicsSetup = React.lazy(() => import("../graphics/WheelGraphicsSetup.jsx"));
createRoot(document.getElementById("root")).render(<React.StrictMode>
  {diagnostics ? <React.Suspense fallback={<p>Chargement des diagnostics…</p>}><Admin /></React.Suspense>
    : setup ? <React.Suspense fallback={<p>Chargement du réglage…</p>}><GraphicsSetup force={setupMode === "1"} onComplete={() => window.location.assign("/")} /></React.Suspense>
      : <WheelTraining />}
</React.StrictMode>);
