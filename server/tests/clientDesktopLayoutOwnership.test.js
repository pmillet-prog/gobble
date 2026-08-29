import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

function read(relativePath) {
  return fs.readFileSync(new URL(relativePath, import.meta.url), "utf8");
}

test("lazy desktop scene owns its DOM measurement lifecycle", () => {
  const applicationSource = read("../../src/GobbleApplication.jsx");
  const sceneSource = read("../../src/components/desktop/DesktopGameScene.jsx");
  const layoutSource = read(
    "../../src/components/desktop/useDesktopSceneLayout.js"
  );

  assert.doesNotMatch(applicationSource, /useDesktopLayoutController/);
  assert.doesNotMatch(applicationSource, /mainGridDesktopRef/);
  assert.doesNotMatch(applicationSource, /playColumnRef/);
  assert.match(sceneSource, /useDesktopSceneLayout\(desktopLayoutRuntime\)/);
  assert.match(sceneSource, /ref=\{mainGridDesktopRef\}/);
  assert.match(layoutSource, /useDesktopLayoutController\(/);
  assert.match(layoutSource, /new ResizeObserver/);
  assert.match(layoutSource, /window\.addEventListener\("scroll"/);
});
