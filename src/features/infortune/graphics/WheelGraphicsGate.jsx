import React from "react";
import { INFORTUNE_CLIENT_ENABLED } from "../infortuneAvailability.js";
import { readWheelGraphics, readWheelGraphicsPreference, interruptedWheelGraphicsCheck } from "./wheelGraphicsStorage.js";
const Setup = React.lazy(() => import("./WheelGraphicsSetup.jsx"));

function ActiveGate({ children }) {
  const [ready, setReady] = React.useState(() => (Boolean(readWheelGraphics()) || readWheelGraphicsPreference() !== "auto")
    && !interruptedWheelGraphicsCheck());
  return ready ? children : <React.Suspense fallback={<p role="status">Préparation du réglage de la roue…</p>}>
    <Setup onComplete={() => setReady(true)} />
  </React.Suspense>;
}

// Before mounting the game: no round or automatic room resume can start behind
// a compulsory measurement. The current public release keeps this gate off.
export default function WheelGraphicsGate({ children }) {
  return INFORTUNE_CLIENT_ENABLED ? <ActiveGate>{children}</ActiveGate> : children;
}
