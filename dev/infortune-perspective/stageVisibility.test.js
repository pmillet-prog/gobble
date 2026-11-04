import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { inflateSync } from "node:zlib";
import { BackSide, CylinderGeometry, DoubleSide, InstancedMesh, Mesh, MeshBasicMaterial, Object3D, Raycaster, Vector3 } from "three";
import { AUDIENCE_ROWS, AUDIENCE_ROW_HEIGHT, audienceRowGeometry, audienceRowPoint, placeAudienceRow } from "./audienceRows.js";
import { LED_BANDS, ledBandGeometry } from "./createStageLedBand.js";
import { createProjection, STAGE_CAMERA } from "./projection.js";
import { createDeskTopGeometry, createDeskWallGeometry } from "./stageDeskGeometry.js";
import { DESK, DESK_SCREEN_TEXT, deskWallRadius } from "./stageDeskDimensions.js";
import { createDeskScreenGeometry } from "./stageDeskScreen.js";
import { PEG_BASE, PEG_HEIGHT, PEG_RADIUS } from "./wheelDimensions.js";
import { PEG_COUNT, TAU } from "../../src/features/infortune/wheelConfig.js";
import { WHEEL_GEOMETRY } from "../../src/features/infortune/wheelGeometry.js";
import { STAGE_CONTESTANTS } from "./stageFixtures.js";

// Decode only alpha from the generated RGBA PNGs. PNG prediction is independent
// per channel, so no image library or browser is needed to verify actual cutouts.
async function rowImage(row) {
  const bytes = await readFile(new URL(row.url)), chunks = [];
  const width = bytes.readUInt32BE(16), height = bytes.readUInt32BE(20);
  assert.equal(bytes[24], 8); assert.equal(bytes[25], 6); assert.equal(bytes[28], 0);
  for (let offset = 8; offset < bytes.length;) {
    const length = bytes.readUInt32BE(offset);
    if (bytes.toString("ascii", offset + 4, offset + 8) === "IDAT") chunks.push(bytes.subarray(offset + 8, offset + 8 + length));
    offset += length + 12;
  }
  const raw = inflateSync(Buffer.concat(chunks)), alpha = new Uint8Array(width * height), stride = width * 4 + 1;
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    const i = y * width + x, filter = raw[y * stride];
    const left = x ? alpha[i - 1] : 0, up = y ? alpha[i - width] : 0, corner = x && y ? alpha[i - width - 1] : 0;
    let prediction = 0;
    if (filter === 1) prediction = left;
    if (filter === 2) prediction = up;
    if (filter === 3) prediction = Math.floor((left + up) / 2);
    if (filter === 4) {
      const p = left + up - corner, a = Math.abs(p - left), b = Math.abs(p - up), c = Math.abs(p - corner);
      prediction = a <= b && a <= c ? left : b <= c ? up : corner;
    }
    alpha[i] = raw[y * stride + x * 4 + 4] + prediction;
  }
  return { width, height, alpha, at(uv) {
    const x = Math.max(0, Math.min(width - 1, Math.floor(uv.x * width)));
    const y = Math.max(0, Math.min(height - 1, Math.floor((1 - uv.y) * height)));
    return alpha[y * width + x];
  } };
}

test("the audience uses three transparent frontal rows on close concentric tiers with real occlusion", async () => {
  const images = await Promise.all(AUDIENCE_ROWS.map(rowImage));
  const meshes = images.map((image, index) => {
    assert.equal(image.alpha[0], 0);
    assert.ok(image.alpha.some(value => value === 255), "Dark people must remain opaque, rather than disappear with their background");
    const mesh = new Mesh(audienceRowGeometry(image.width / image.height, AUDIENCE_ROWS[index]), new MeshBasicMaterial({ side: BackSide }));
    placeAudienceRow(mesh, AUDIENCE_ROWS[index]); mesh.userData.image = image; return mesh;
  });
  const { camera } = createProjection(760, 584, STAGE_CAMERA);
  for (let i = 1; i < meshes.length; i++) {
    assert.ok(AUDIENCE_ROWS[i].radius > AUDIENCE_ROWS[i - 1].radius);
    assert.ok(meshes[i].position.y > meshes[i - 1].position.y);
    assert.equal(meshes[i].geometry.parameters.height, AUDIENCE_ROW_HEIGHT);
  }
  assert.ok(AUDIENCE_ROWS.every(row => row.radius < 1000 && row.brightness < 0.1));
  for (const u of [0.02, 0.98]) for (const v of [0.02, 0.98]) {
    const point = audienceRowPoint(AUDIENCE_ROWS[0], images[0].width / images[0].height, u, v).project(camera);
    assert.ok(Math.abs(point.x) < 1 && Math.abs(point.y) < 1, "The entire front row, including feet and chairs, must fit the establishing shot");
  }
  let hiddenBodies = 0, visibleHeads = 0;
  for (let rowIndex = 1; rowIndex < meshes.length; rowIndex++) for (let seat = 0; seat < 8; seat++) for (const v of [0.2, 0.4, 0.82]) {
    const mesh = meshes[rowIndex], row = AUDIENCE_ROWS[rowIndex];
    const uv = { x: (seat + 0.5) / 8, y: v };
    if (mesh.userData.image.at(uv) < 200) continue;
    const point = audienceRowPoint(row, images[rowIndex].width / images[rowIndex].height, uv.x, v);
    const ray = new Raycaster(camera.position, point.clone().sub(camera.position).normalize());
    const first = ray.intersectObjects(meshes).find(hit => hit.object.userData.image.at(hit.uv) >= 9);
    if (v < 0.5 && first?.object !== mesh) hiddenBodies++;
    if (v > 0.5 && first?.object === mesh) visibleHeads++;
  }
  assert.ok(hiddenBodies >= 8, `Only ${hiddenBodies} rear body samples are hidden by nearer spectators`);
  assert.ok(visibleHeads >= 8, `Only ${visibleHeads} rear heads remain visible`);
  const separation = focal => {
    const view = createProjection(760, 584, { ...STAGE_CAMERA, focal }).camera;
    return audienceRowPoint(AUDIENCE_ROWS[2], 3, 0.5, 0.5).project(view).y
      - audienceRowPoint(AUDIENCE_ROWS[0], 3, 0.5, 0.5).project(view).y;
  };
  assert.ok(Math.abs(separation(14) - separation(28)) > 0.05, "Rows must show real relative perspective changes with the dolly zoom");
  for (const mesh of meshes) { mesh.geometry.dispose(); mesh.material.dispose(); }
});

test("the inner LED band faces the camera and sits in front of the facade, inside the frame", () => {
  const face = LED_BANDS.find(value => value.name === "inner");
  const strip = new Mesh(ledBandGeometry(face, 13, 1.1), new MeshBasicMaterial({ side: face.side }));
  const wall = new Mesh(createDeskWallGeometry("inner"), new MeshBasicMaterial({ side: BackSide }));
  wall.updateMatrixWorld(true); strip.updateMatrixWorld(true);
  const { camera } = createProjection(760, 584, STAGE_CAMERA);
  for (const angle of [-0.35, 0, 0.35]) {
    const radius = face.radius(face.centerY) - 1.1;
    const target = new Vector3(Math.sin(angle) * radius, face.centerY, Math.cos(angle) * radius);
    const projected = target.clone().project(camera);
    assert.ok(Math.abs(projected.x) < 0.95 && Math.abs(projected.y) < 0.95);
    const ray = new Raycaster(camera.position, target.clone().sub(camera.position).normalize());
    const hits = ray.intersectObjects([wall, strip]);
    assert.equal(hits[0]?.object, strip, "The LED must not be hidden inside the facade");
  }
  for (const mesh of [strip, wall]) { mesh.geometry.dispose(); mesh.material.dispose(); }
});

test("continuous screen text clears the LED strip and pegs and reads left to right from inside the desk", () => {
  const led = LED_BANDS.find(value => value.name === "inner"), display = DESK_SCREEN_TEXT;
  assert.ok(display.bottomY > led.centerY + 20, "Keep text above the LED light spill");
  assert.ok(display.topY < DESK.topBaseY - DESK.bevel, "Keep text below the counter");
  const material = new MeshBasicMaterial({ side: DoubleSide });
  const top = new Mesh(createDeskTopGeometry(), material); top.position.y = DESK.topBaseY;
  const obstacles = [top, new Mesh(createDeskWallGeometry("outer"), material), new Mesh(ledBandGeometry(led, 17, 0.45), material)];
  const pegs = new InstancedMesh(new CylinderGeometry(PEG_RADIUS, PEG_RADIUS, PEG_HEIGHT, 16), material, PEG_COUNT);
  const transform = new Object3D();
  for (let i = 0; i < PEG_COUNT; i++) {
    const angle = i * TAU / PEG_COUNT;
    transform.position.set(Math.sin(angle) * WHEEL_GEOMETRY.pegOrbit, PEG_BASE + PEG_HEIGHT / 2, Math.cos(angle) * WHEEL_GEOMETRY.pegOrbit);
    transform.updateMatrix(); pegs.setMatrixAt(i, transform.matrix);
  }
  obstacles.push(pegs); obstacles.forEach(mesh => mesh.updateMatrixWorld(true));
  const screen = new Mesh(createDeskScreenGeometry(), new MeshBasicMaterial({ side: BackSide }));
  screen.updateMatrixWorld(true);
  const angles = [0, ...STAGE_CONTESTANTS.map(actor => Math.atan2(actor.position[0], actor.position[2]))];
  for (const angle of angles) {
    for (const elevation of [20, 35, 55]) for (const focal of [28, 85]) {
      const { camera } = createProjection(760, 584, { ...STAGE_CAMERA, elevation, focal });
      const samples = [];
      for (const x of [-0.45, 0, 0.45]) for (const y of [display.bottomY, display.topY]) {
        const a = angle + x * display.arcWidth, radius = deskWallRadius(y, "inner", a);
        const target = new Vector3(Math.sin(a) * radius, y, Math.cos(a) * radius);
        const ray = new Raycaster(camera.position, target.clone().sub(camera.position).normalize());
        const hit = ray.intersectObjects([...obstacles, screen])[0];
        assert.equal(hit?.object, screen,
          `Display hidden at elevation=${elevation}, focal=${focal}, angle=${angle}`);
        if (y === display.topY) samples.push({ x: hit.point.clone().project(camera).x, u: hit.uv.x });
      }
      samples.sort((a, b) => a.x - b.x);
      assert.ok(samples[0].u < samples[1].u && samples[1].u < samples[2].u, "Text must not be mirrored on the inside face");
    }
  }
  for (const mesh of [...obstacles, screen]) mesh.geometry.dispose(); pegs.dispose(); material.dispose(); screen.material.dispose();
});
