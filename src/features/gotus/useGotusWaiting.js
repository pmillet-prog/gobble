import React from "react";
import { createGotusWaitingController } from "./createGotusWaitingController.js";

export default function useGotusWaiting(config) {
  const [controller] = React.useState(createGotusWaitingController);
  React.useEffect(() => { controller.start(); return () => controller.dispose(); }, [controller]);
  React.useEffect(() => { controller.configure(config); });
  const state = React.useSyncExternalStore(controller.store.subscribe, controller.store.getState, controller.store.getState);
  return { controller, state };
}
