import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

function read(relativePath) {
  return fs.readFileSync(new URL(relativePath, import.meta.url), "utf8");
}

test("mobile layout controller owns viewport locking and measurement", () => {
  const applicationSource = read("../../src/GobbleApplication.jsx");
  const controllerSource = read(
    "../../src/features/layout/useMobileLayoutController.js",
  );

  assert.match(applicationSource, /useMobileLayoutController\(/);
  assert.doesNotMatch(applicationSource, /mobileGameViewportLockRef = useRef/);
  assert.doesNotMatch(applicationSource, /new ResizeObserver/);
  assert.doesNotMatch(applicationSource, /screen\.orientation/);

  assert.match(controllerSource, /mobileGameViewportLockRef = React\.useRef/);
  assert.match(controllerSource, /new ResizeObserver/);
  assert.match(controllerSource, /screen\.orientation/);
  assert.match(controllerSource, /document\.body\.style|bodyStyle\.overflow/);
});
