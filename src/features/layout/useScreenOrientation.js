import React from "react";
import { watchScreenOrientation } from "./screenOrientation.js";

export default function useScreenOrientation({ isMobileLayout, allowLandscape }) {
  React.useEffect(() => {
    if (typeof screen === "undefined") return;
    return watchScreenOrientation({
      orientation: screen.orientation, document,
      mode: allowLandscape ? "any" : isMobileLayout ? "portrait" : null,
    });
  }, [isMobileLayout, allowLandscape]);
}
