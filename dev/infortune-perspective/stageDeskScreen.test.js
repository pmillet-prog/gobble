import test from "node:test";
import assert from "node:assert/strict";
import { BackSide } from "three";
import { createDeskScreen, createDeskScreenGeometry } from "./stageDeskScreen.js";
import { DESK, deskTopBaseAt, deskWallRadius } from "./stageDeskDimensions.js";
import { STAGE_CONTESTANTS } from "./stageFixtures.js";

test("the screen replaces the entire inner wall, including its lower front and curved shoulders", () => {
  const geometry = createDeskScreenGeometry(), positions = geometry.getAttribute("position"), uv = geometry.getAttribute("uv");
  let rearTop = false, frontTop = false, bottom = false;
  for (let i = 0; i < positions.count; i++) {
    const x = positions.getX(i), y = positions.getY(i), z = positions.getZ(i), angle = Math.atan2(x, z);
    assert.ok(Math.abs(Math.hypot(x, z) - deskWallRadius(y, "inner", angle)) < 0.001);
    if (uv.getY(i) === 1) {
      assert.ok(Math.abs(y - deskTopBaseAt(angle)) < 0.001);
      rearTop ||= Math.abs(y - DESK.topBaseY) < 0.001;
      frontTop ||= Math.abs(y - DESK.frontTopBaseY) < 0.001;
    } else { assert.equal(y, DESK.bottomY); bottom = true; }
  }
  assert.ok(rearTop && frontTop && bottom); geometry.dispose();
});

test("bank updates reuse one emissive screen texture and round four clears the visible amounts", () => {
  let texts = [], paints = 0;
  const gradient = { addColorStop() {} };
  const context = { setTransform() { texts = []; paints++; }, createLinearGradient: () => gradient, createRadialGradient: () => gradient,
    fillRect() {}, beginPath() {}, moveTo() {}, bezierCurveTo() {}, stroke() {}, fillText(text) { texts.push(text); } };
  const screen = createDeskScreen(STAGE_CONTESTANTS, { textureWidth: 2048, createCanvas: () => ({ getContext: () => context }) });
  const texture = screen.mesh.material.map;
  assert.ok(texts.includes("Christian Mauresque"));
  assert.equal(screen.mesh.material.emissiveMap, texture); assert.equal(screen.mesh.material.side, BackSide);
  assert.equal(texture.image.width, 2048); assert.equal(texture.image.height, 256);
  screen.setBanks({ members: { alix: { bank: 12345 }, sam: { bank: 67890 } } });
  assert.ok(texts.includes("ALIX") && texts.includes("SAM"));
  assert.ok(texts.includes(`${(12345).toLocaleString("fr-FR")} €`));
  const painted = paints, version = texture.version;
  screen.setBanks({ members: { alix: { bank: 12345 }, sam: { bank: 67890 } } });
  assert.equal(paints, painted); assert.equal(texture.version, version);
  screen.setBanks({ members: { alix: { bank: 12895, spin: "done" }, sam: { bank: 67890, spin: "pending" } } });
  assert.ok(texts.includes(`${(12895).toLocaleString("fr-FR")} €`));
  assert.ok(!texts.includes(`${(12345).toLocaleString("fr-FR")} €`));
  assert.ok(texts.includes("LANCER TERMINÉ") && texts.includes("LANCER EN ATTENTE"));
  assert.equal(screen.mesh.material.map, texture);
  const updatedVersion = texture.version;
  screen.setBanks({ hidden: true, members: { alix: { bank: 12345 }, sam: { bank: 67890 } } });
  assert.equal(screen.mesh.material.map, texture); assert.equal(texture.version, updatedVersion + 1);
  assert.equal(texts.filter(text => text === "CAGNOTTE MASQUÉE").length, 2);
  assert.ok(!texts.some(text => text.includes("€")), "Old amounts must be erased when the balances are concealed");
  screen.setSelected("alix");
  assert.equal(screen.mesh.material.map, texture);
  assert.equal(texts.filter(text => text === "CANDIDAT SÉLECTIONNÉ").length, 1);
  assert.equal(texts.filter(text => text === "CAGNOTTE MASQUÉE").length, 2);
  assert.ok(!texts.some(text => text.includes("€")), "Selecting an avatar must not reveal its bank");
  const selectedVersion = texture.version;
  screen.setSelected("alix"); assert.equal(texture.version, selectedVersion);
  screen.setSelected("sam");
  assert.equal(texts.filter(text => text === "CANDIDAT SÉLECTIONNÉ").length, 1);
  screen.setSelected(null); assert.ok(!texts.includes("CANDIDAT SÉLECTIONNÉ"));
  screen.setBanks(null); assert.equal(texts.filter(text => text === "—").length, 2);
  screen.mesh.geometry.dispose(); screen.mesh.material.dispose(); texture.dispose();
});
