import React from "react";
import { useApplicationKernel } from "../../app/react/ApplicationRuntimeProvider.jsx";
import { useFeatureRuntime } from "../../app/react/useFeatureRuntime.js";

// The existing home-chat lifecycle owns reconnects and unread counters. This
// column declares its visibility there instead of binding another socket.
export default function useGotusChat({ training, subscribeLobbyChat }) {
  const kernel = useApplicationKernel();
  const feature = useFeatureRuntime("chat");
  const subscribeRef = React.useRef(subscribeLobbyChat);
  subscribeRef.current = subscribeLobbyChat;
  React.useLayoutEffect(() => {
    if (!training) return undefined;
    const previousOpen = feature.store.getState().homeChatOpen;
    feature.set("homeChatOpen", true);
    subscribeRef.current?.();
    return () => feature.set("homeChatOpen",
      kernel.getState().session?.isLoggedIn ? false : previousOpen);
  }, [feature, kernel, training]);
}
