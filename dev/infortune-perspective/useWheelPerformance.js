import React from "react";
import { createWheelPerformance, readWheelPerformance } from "./wheelPerformance.js";
const localStore = () => { try { return window.localStorage; } catch { return null; } };

export function useWheelPerformance(forcedProfile = null) {
  const storage = React.useRef(forcedProfile ? null : localStore());
  const [initial] = React.useState(() => forcedProfile ? { preference: forcedProfile, profile: forcedProfile }
    : readWheelPerformance(storage.current, { memory: navigator.deviceMemory, cores: navigator.hardwareConcurrency }));
  const [report, setReport] = React.useState({ ...initial, metrics: null });
  const monitor = React.useRef(null);
  if (!monitor.current) monitor.current = createWheelPerformance({ initial, storage: storage.current, onChange: setReport });
  // The wheel's renderer owns all sampling. The monitor has no listener, timer,
  // or subscription to clean up, and survives StrictMode's effect rehearsal.
  return { report, monitor: monitor.current, choose: value => monitor.current.setPreference(value) };
}
