import test from "node:test";
import assert from "node:assert/strict";
import { createResourceScope } from "../../app/core/createResourceScope.js";
import { createLayoutFeature } from "./createLayoutFeature.js";
import { VIEWPORT_EVENTS } from "./createViewportEventHub.js";

function harness(t, initial) {
  let viewport = { isMobileLayout: true, isUltraCompact: false, ...initial };
  const scope = createResourceScope("landscape-test");
  const layout = createLayoutFeature({ scope }, { windowTarget: {}, readViewportModeFn: () => viewport });
  t.after(() => scope.dispose());
  return { layout, state: () => layout.store.getState(), resize(changes, orientation = false) {
    viewport = { ...viewport, ...changes };
    layout.refreshViewportMode({ types: [orientation ? VIEWPORT_EVENTS.ORIENTATION_CHANGE : VIEWPORT_EVENTS.WINDOW_RESIZE] });
  } };
}

test("landscape stays mobile by default; opting in and out updates the current layout immediately", t => {
  const h = harness(t, { width: 844, height: 390, landscape: true });
  assert.equal(h.state().isMobileLayout, true);
  h.layout.configureMobileLandscapeDesktop(true);
  assert.equal(h.state().isMobileLayout, false);
  h.layout.configureMobileLandscapeDesktop(false);
  assert.equal(h.state().isMobileLayout, true);
});

test("keyboard height and toggling the setting while typing cannot imitate a rotation", t => {
  const h = harness(t, { width: 390, height: 844, landscape: false });
  h.layout.configureMobileLandscapeDesktop(true);
  assert.equal(h.state().isMobileLayout, true);
  h.resize({ height: 200, landscape: true }); // Browser without physical orientation API.
  h.layout.configureMobileLandscapeDesktop(false);
  h.layout.configureMobileLandscapeDesktop(true);
  assert.equal(h.state().isMobileLayout, true);
  h.resize({ width: 844, height: 390, landscape: true }, true);
  assert.equal(h.state().isMobileLayout, false);
  h.resize({ height: 150 });
  assert.equal(h.state().isMobileLayout, false);
  h.resize({ width: 390, height: 844, landscape: false }, true);
  assert.equal(h.state().isMobileLayout, true);
});

test("near-square mobile rotation is applied even below the keyboard width threshold", t => {
  const h = harness(t, { width: 720, height: 700, landscape: true, isUltraCompact: true });
  h.layout.configureMobileLandscapeDesktop(true);
  assert.equal(h.state().isMobileLayout, false);
  assert.equal(h.state().isUltraCompact, false);
  h.resize({ width: 700, height: 720, landscape: false }, true);
  assert.equal(h.state().isMobileLayout, true);
  assert.equal(h.state().isUltraCompact, true);
});

test("ordinary desktop selection is independent of the mobile landscape preference", t => {
  const h = harness(t, { width: 900, height: 650, landscape: true, isMobileLayout: false });
  for (const enabled of [true, false]) {
    h.layout.configureMobileLandscapeDesktop(enabled);
    assert.equal(h.state().isMobileLayout, false);
  }
});
