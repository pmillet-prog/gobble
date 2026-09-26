import React from "react";
import GameCelebrationDomOverlay from "./GameCelebrationDomOverlay.jsx";
import { getBigscoreRendererMode } from "../features/celebration/bigscore/rendererMode.js";

const PixiOverlay = React.lazy(() => import("../features/celebration/bigscore/PixiCelebrationOverlay.jsx"));

class RendererBoundary extends React.Component {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  render() { return this.state.failed ? this.props.fallback : this.props.children; }
}

export default React.memo(function GameCelebrationOverlay(props) {
  const [mode] = React.useState(getBigscoreRendererMode);
  const fallback = <GameCelebrationDomOverlay {...props} />;
  if (mode !== "pixi") return fallback;
  return <RendererBoundary fallback={fallback}>
    <React.Suspense fallback={fallback}>
      <PixiOverlay {...props} fallback={fallback} />
    </React.Suspense>
  </RendererBoundary>;
});
