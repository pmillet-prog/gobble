import test from "node:test";
import assert from "node:assert/strict";
import { exchangeTilePose, createExchangeArrival } from "./exchangeArrival.js";
import { EXCHANGE_SECTOR_INDICES, infortuneSectors, WHEEL_SECTORS } from "../../shared/infortuneWheel.js";
import { sectorAtPointer, PEG_PITCH } from "../../src/features/infortune/wheelConfig.js";
import { Group, Object3D, Raycaster, Texture, Vector3 } from "three";
import { createExchangeTiles } from "./createExchangeTiles.js";
import { TILE_BASE, TILE_BEVEL, tileExtrusion } from "./tileGeometry.js";

test("overlays retain real slot geometry and preserve the four special sectors", () => {
  const sectors = infortuneSectors(true);
  for (let i = 0; i < 24; i++) {
    const result = sectorAtPointer(-(i * 3 + 1.5) * PEG_PITCH, 0, undefined, sectors);
    assert.equal(result.index, i);
    assert.equal(result.kind === "exchange", EXCHANGE_SECTOR_INDICES.includes(i));
  }
  assert.deepEqual([sectors[6].kind, sectors[12].kind, sectors[0].kind, sectors[18].amount], ["bonus", "bankrupt", "pass", 1000]);
  const hundreds = WHEEL_SECTORS.flatMap((sector, index) => sector.amount === 100 ? [index] : []);
  assert.equal(hundreds.length, 3);
  assert.deepEqual(EXCHANGE_SECTOR_INDICES, hundreds, "Every 100 is covered in round four");
  assert.deepEqual(hundreds.map((index, i) => (hundreds[(i + 1) % 3] - index + 24) % 24), [8, 8, 8]);
});

test("high-value sectors remain separated and repeated amounts are spread around the fixed special sectors", () => {
  for (let index = 0; index < WHEEL_SECTORS.length; index++) {
    const sector = WHEEL_SECTORS[index];
    if (sector.kind !== "bonus" && !(sector.amount >= 400)) continue;
    for (const offset of [-1, 1]) {
      const neighbour = WHEEL_SECTORS[(index + offset + WHEEL_SECTORS.length) % WHEEL_SECTORS.length];
      assert.ok(neighbour.kind === "pass" || neighbour.kind === "bankrupt" || neighbour.kind === "amount" && neighbour.amount < 400,
        `${sector.label} is next to ${neighbour.label}`);
    }
  }
  const amounts = WHEEL_SECTORS.filter(sector => sector.kind === "amount").map(sector => sector.amount).sort((a, b) => a - b);
  assert.deepEqual(amounts, [100, 100, 100, 150, 150, 150, 150, 150, 200, 200, 200, 200, 250, 300, 300, 400, 400, 500, 500, 500, 1000]);
  for (const [amount, minimum, maximum] of [[150, 3, 7], [200, 5, 7], [300, 11, 13], [400, 12, 12], [500, 7, 9]]) {
    const positions = WHEEL_SECTORS.flatMap((sector, index) => sector.amount === amount ? [index] : []);
    const gaps = positions.map((index, i) => (positions[(i + 1) % positions.length] - index + 24) % 24);
    assert.ok(gaps.every(gap => gap >= minimum && gap <= maximum), `${amount}: ${gaps.join(", ")}`);
  }
});

test("landed overlays cover the old lettering without any camera update, and replay restores only the covered amounts", () => {
  const rotor = new Group(), underlays = WHEEL_SECTORS.map(() => ({ label: new Object3D() }));
  const exchange = createExchangeTiles(rotor, { underlays, createLettering: () => new Texture() });
  for (const progress of [0, 0.2, 1, 0, 1]) {
    exchange.update(progress); rotor.updateMatrixWorld(true);
    underlays.forEach(({ label }, index) => assert.equal(label.visible, !(progress === 1 && EXCHANGE_SECTOR_INDICES.includes(index))));
    if (progress !== 1) continue;
    exchange.tiles.forEach((tile, position) => {
      const index = EXCHANGE_SECTOR_INDICES[position], point = tile.localToWorld(new Vector3(0, 0, -170));
      const ray = new Raycaster(new Vector3(point.x, 30, point.z), new Vector3(0, -1, 0));
      const hit = ray.intersectObject(tile.children[0], false)[0];
      assert.ok(hit, "The opaque replacement plate covers the middle of the original sector");
      assert.ok(hit.point.y > TILE_BASE + tileExtrusion(index).depth + TILE_BEVEL + 0.5);
      assert.equal(tile.children[0].material.transparent, false);
    });
  }
  const geometries = new Set(), materials = new Set();
  rotor.traverse(object => { if (object.geometry) geometries.add(object.geometry); if (object.material) materials.add(object.material); });
  for (const geometry of geometries) geometry.dispose();
  for (const material of materials) { material.map?.dispose(); material.dispose(); }
});

test("all overlays land before input is released; a hidden tab pauses and a reset cancels the arrival", () => {
  let clock = 0, hidden = false, done = 0, progress = 0, serial = 0;
  const frames = new Map();
  const arrival = createExchangeArrival({ now: () => clock, hidden: () => hidden,
    requestFrame(callback) { const id = ++serial; frames.set(id, callback); return id; }, cancelFrame: id => frames.delete(id),
    onProgress(value) { progress = value; }, onDone() { done++; } });
  const tick = () => { clock += 100; const callbacks = [...frames.values()]; frames.clear(); callbacks.forEach(callback => callback(clock)); };
  arrival.start(); for (let i = 0; i < 6; i++) tick();
  const before = progress; hidden = true; for (let i = 0; i < 25; i++) tick();
  assert.equal(progress, before); assert.equal(done, 0);
  hidden = false; for (let i = 0; i < 20; i++) tick();
  assert.equal(done, 1); assert.equal(progress, 1);
  for (let i = 0; i < 3; i++) assert.ok(Math.abs(exchangeTilePose(progress, i).height) < 1e-9);
  arrival.reset(); arrival.start(); tick(); arrival.dispose();
  assert.equal(frames.size, 0); assert.equal(done, 1);
});
