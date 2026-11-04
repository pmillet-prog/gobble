import React from "react";
import { createRoot } from "react-dom/client";
import WheelTraining from "./WheelTraining.jsx";
import "./wheelTraining.css";

const Admin = React.lazy(() => import("./WheelDiagnosticsAdmin.jsx"));
const diagnostics = new URLSearchParams(window.location.search).get("diagnostics") === "1";
createRoot(document.getElementById("root")).render(<React.StrictMode>
  {diagnostics ? <React.Suspense fallback={<p>Chargement des diagnostics…</p>}><Admin /></React.Suspense> : <WheelTraining />}
</React.StrictMode>);
