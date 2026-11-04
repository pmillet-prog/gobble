import test from "node:test";
import assert from "node:assert/strict";
import { createStageLedLighting } from "./stageLedLighting.js";

test("synchronous-compiler LEDs use fewer real area lights and preserve emitted power per band", () => {
  const full = createStageLedLighting(6), grouped = createStageLedLighting(3);
  for (const face of ["inner", "outer"]) {
    const lights = rig => rig.root.children.filter(light => light.name.startsWith(`${face}-`));
    const power = rig => lights(rig).reduce((sum, light) => sum + light.width * light.height * light.intensity, 0);
    assert.equal(lights(full).length, 6); assert.equal(lights(grouped).length, 3);
    assert.ok(grouped.root.children.every(light => light.isRectAreaLight));
    // The outer desk has a height-dependent radius; allow its small sampling variation.
    assert.ok(Math.abs(power(grouped) / power(full) - 1) < 0.035);
  }
  full.dispose(); grouped.dispose();
});
