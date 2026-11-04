import test from "node:test";
import assert from "node:assert/strict";
import { Vector3 } from "three";
import { createProjection, DEFAULT_CAMERA, projectPoint, unprojectPoint } from "./projection.js";

test("pointer coordinates return to the exact wheel plane despite perspective and camera changes", () => {
  for (const elevation of [10, 20, 75]) for (const perspective of [0, 80, 100]) for (const framing of [30, 100, 300]) {
    const projection = createProjection(760, 500, { ...DEFAULT_CAMERA, elevation, perspective, framing, roll: 23, offsetX: 18, offsetY: -27 });
    for (let i = 0; i < 72; i++) {
      const angle = i * Math.PI * 2 / 72;
      const x = 320 + 270 * Math.sin(angle), y = 334 - 270 * Math.cos(angle);
      const screen = projectPoint(x, y, projection), plane = unprojectPoint(screen.x, screen.y, projection);
      assert.ok(Math.abs(x - plane.x) < 1e-8 && Math.abs(y - plane.y) < 1e-8);
    }
  }
});

test("the pawl is in front and nearby intervals look larger than distant intervals", () => {
  const projection = createProjection(760, 500);
  const near = projectPoint(320, 24, projection), far = projectPoint(320, 627, projection);
  assert.ok(near.y > far.y, "The pawl should be at the bottom, closest to the viewer");
  const nearWidth = Math.abs(projectPoint(330, 50, projection).x - projectPoint(310, 50, projection).x);
  const farWidth = Math.abs(projectPoint(330, 600, projection).x - projectPoint(310, 600, projection).x);
  assert.ok(nearWidth > farWidth * 1.7, "There should be real perspective foreshortening, not just an ellipse");
});

test("framing beyond 100 is a free crop, without an automatic fit or recenter", () => {
  const base = createProjection(760, 500);
  const close = createProjection(760, 500, { framing: 300 });
  const baseCenter = projectPoint(320, 334, base), closeCenter = projectPoint(320, 334, close);
  const baseEdge = projectPoint(610, 334, base), closeEdge = projectPoint(610, 334, close);
  assert.ok(Math.abs((closeEdge.x - closeCenter.x) / (baseEdge.x - baseCenter.x) - 3) < 1e-8);
  assert.ok(closeEdge.x < 0 || closeEdge.x > close.width, "The frame must allow intentional clipping");
});

test("focal and dolly change near/far proportions while keeping the wheel center at the same scale", () => {
  const wide = createProjection(760, 500, { focal: 14 }), long = createProjection(760, 500, { focal: 70 });
  assert.ok(long.camera.position.length() > wide.camera.position.length());
  const widthAt = (projection, y) => Math.abs(projectPoint(420, y, projection, 0).x - projectPoint(220, y, projection, 0).x);
  assert.ok(Math.abs(widthAt(wide, 334) - widthAt(long, 334)) < 1e-8, "This must not behave like another crop/zoom slider");
  const wideRatio = widthAt(wide, 70) / widthAt(wide, 600), longRatio = widthAt(long, 70) / widthAt(long, 600);
  assert.ok(wideRatio > longRatio * 2, "A close wide-angle camera must emphasize depth");
});

test("the vertical vanishing point shifts with focal and dolly while center scale is held", () => {
  function vanishingPoint(projection) {
    const a = projectPoint(120, 334, projection, 0), b = projectPoint(120, 334, projection, 100);
    const c = projectPoint(520, 334, projection, 0), d = projectPoint(520, 334, projection, 100);
    const ab = { x: b.x - a.x, y: b.y - a.y }, cd = { x: d.x - c.x, y: d.y - c.y };
    const t = ((c.x - a.x) * cd.y - (c.y - a.y) * cd.x) / (ab.x * cd.y - ab.y * cd.x);
    return { x: a.x + t * ab.x, y: a.y + t * ab.y };
  }
  const wide = vanishingPoint(createProjection(760, 500, { focal: 14 }));
  const long = vanishingPoint(createProjection(760, 500, { focal: 70 }));
  assert.ok(Number.isFinite(wide.y) && Number.isFinite(long.y));
  assert.ok(Math.abs(wide.y - long.y) > 500);
});

test("vertical rods have height in the image, with stronger foreshortening near the camera", () => {
  const projection = createProjection(760, 500);
  const nearBase = projectPoint(320, 64, projection, 3), nearTop = projectPoint(320, 64, projection, 28);
  const farBase = projectPoint(320, 604, projection, 3), farTop = projectPoint(320, 604, projection, 28);
  assert.ok(nearTop.y < nearBase.y && farTop.y < farBase.y);
  assert.ok(nearBase.y - nearTop.y > (farBase.y - farTop.y) * 1.7);
});

test("off-axis framing preserves pointer mapping at narrow mobile sizes and focal extremes", () => {
  for (const [width, height] of [[280, 215], [390, 300], [1100, 733]]) for (const focal of [14, 85]) {
    const projection = createProjection(width, height, { focal, framing: 300, offsetX: -80, offsetY: 80, roll: -35 });
    const point = projectPoint(425, 162, projection), inverse = unprojectPoint(point.x, point.y, projection);
    assert.ok(Math.abs(inverse.x - 425) < 1e-8 && Math.abs(inverse.y - 162) < 1e-8);
  }
});

test("long lenses retain depth precision for thin details and keep the complete wheel ahead of the near plane", () => {
  const depthLevels = 2 ** 24 - 1;
  for (const focal of [80, 85]) for (const perspective of [0, 80, 100]) for (const elevation of [10, 20, 75]) {
    const { camera } = createProjection(760, 500, { focal, perspective, elevation });
    for (const z of [-435, 0, 435]) {
      const surface = new Vector3(0, 0, z).project(camera);
      const detail = new Vector3(0, 0.15, z).project(camera);
      assert.ok(Math.abs(surface.z - detail.z) * depthLevels / 2 > 4,
        "Thin raised details must occupy distinct depth values at 80–85 mm");
    }
    for (const x of [-435, 435]) for (const y of [-150, 50]) for (const z of [-435, 435]) {
      const point = new Vector3(x, y, z).project(camera);
      assert.ok(point.z > -1 && point.z < 1, "Depth clipping must preserve the wheel and desk");
    }
  }
});
