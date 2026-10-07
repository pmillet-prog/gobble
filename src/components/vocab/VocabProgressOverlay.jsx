import React, { useMemo, useRef } from "react";
import { VOCAB_LEVELS } from "../../vocabRanks";
import VocabProgressOverlayView from "./VocabProgressOverlayView.jsx";

const CALLBACK_NAMES = [
  "onVisibilityChange", "playCloseSound", "playVocabOverlayClingSound",
  "playVocabOverlayTickSound", "playVocabOverlayZeroSound", "triggerConfettiBurst",
];

const VocabProgressOverlay = React.forwardRef(function VocabProgressOverlay(props, controllerRef) {
  const latestPropsRef = useRef(props);
  latestPropsRef.current = props;
  const callbacks = useMemo(() => Object.fromEntries(CALLBACK_NAMES.map((name) => [
    name, (...args) => latestPropsRef.current[name]?.(...args),
  ])), []);

  // Application callbacks change identity during unrelated game updates. Keep
  // the animation isolated while still publishing assets that finish loading.
  const imageUrlsRef = useRef({});
  const imageKeys = new Set(VOCAB_LEVELS.map((level) => level.imageKey));
  if (props.fallbackLevel?.imageKey) imageKeys.add(props.fallbackLevel.imageKey);
  const imageUrls = Object.fromEntries(Array.from(imageKeys, (key) => [
    key, props.getImageUrl?.(key) || "",
  ]));
  if (Object.keys(imageUrlsRef.current).length !== imageKeys.size ||
      Object.keys(imageUrls).some((key) => imageUrlsRef.current[key] !== imageUrls[key])) {
    imageUrlsRef.current = imageUrls;
  }

  return <VocabProgressOverlayView
    ref={controllerRef}
    darkMode={props.darkMode}
    fallbackLevel={props.fallbackLevel}
    isMobileLayout={props.isMobileLayout}
    request={props.request}
    imageUrls={imageUrlsRef.current}
    {...callbacks}
  />;
});

export default VocabProgressOverlay;
