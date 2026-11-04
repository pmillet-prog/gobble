import React from "react";
import { bindWheelInput } from "./bindWheelInput.js";
import { createWheelAudio } from "./wheelAudio.js";
import { createWheelController } from "./createWheelController.js";
import { pawlPath, WHEEL_GEOMETRY } from "./wheelGeometry.js";

export function useInfortuneWheel({ physics, muted, onResult, onPhaseChange }) {
  const surface = React.useRef(null), rotor = React.useRef(null), pawl = React.useRef(null);
  const forceFill = React.useRef(null), chargeButton = React.useRef(null), controller = React.useRef(null);
  const callbacks = React.useRef({ onResult, onPhaseChange });
  callbacks.current = { onResult, onPhaseChange };
  const [view, setView] = React.useState({ phase: "ready", message: "", result: null });
  React.useEffect(() => {
    const instance = createWheelController({
      audio: createWheelAudio(),
      onChange(next) { setView(next); callbacks.current.onPhaseChange?.(next.phase); },
      onResult(result) { callbacks.current.onResult?.(result); },
      render(state, phase, power) {
        // Only the rotor transform, blade curve and gauge change per frame; the game and React tree
        // do not rerender for every peg or animation frame.
        rotor.current?.setAttribute("transform", `translate(${WHEEL_GEOMETRY.centerX} ${WHEEL_GEOMETRY.centerY}) rotate(${state.angle * 180 / Math.PI})`);
        pawl.current?.setAttribute("d", pawlPath(state.pawl));
        if (forceFill.current) forceFill.current.style.transform = `scaleX(${power})`;
        if (surface.current) surface.current.dataset.motion = phase;
      },
    });
    controller.current = instance;
    instance.initialize();
    const unbind = bindWheelInput({ surface: surface.current, chargeButton: chargeButton.current, controller: instance });
    return () => { unbind(); instance.dispose(); controller.current = null; };
  }, []);
  React.useEffect(() => { controller.current?.setPhysics(physics); }, [physics]);
  React.useEffect(() => { controller.current?.setMuted(muted); }, [muted]);
  return { view, surface, rotor, pawl, forceFill, chargeButton, reset: () => controller.current?.reset(),
    setSoundFromGesture(value) {
      controller.current?.setMuted(!value);
      if (value) controller.current?.unlockAudio();
    },
  };
}
