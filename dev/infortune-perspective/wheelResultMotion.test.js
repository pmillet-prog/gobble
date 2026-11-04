import test from "node:test";
import assert from "node:assert/strict";
import { Object3D, Vector3 } from "three";
import { WHEEL_SECTORS } from "../../src/features/infortune/wheelConfig.js";
import { TILE_BASE, TILE_BEVEL, SECTOR_ANGLE, tileExtrusion } from "./tileGeometry.js";
import { horizontalResultLayout, resultMotion, resultTilePose, RESULT_TILE_CENTER } from "./wheelResultMotion.js";
import { sectorLetteringLayout } from "./sectorLetteringLayout.js";

const measure = (character, size) => ({ width: size * (character === "I" ? 0.3 : 0.6), ascent: size * 0.75, descent: size * 0.1 });

test("the lifted tile begins on the real winning wedge for every sector and rotation direction", () => {
  for (const angle of [-48.31, 0, 85.69]) for (const [index, sector] of WHEEL_SECTORS.entries()) {
    // Independent reconstruction of the scene's rotor / tile / lettering chain.
    const rotor = new Object3D(), tile = new Object3D(), surface = new Object3D();
    rotor.rotation.y = -angle; tile.rotation.y = -(index + 0.5) * SECTOR_ANGLE;
    surface.rotation.x = -Math.PI / 2;
    surface.position.y = TILE_BASE + tileExtrusion(index, sector.kind === "bonus" || sector.amount === 1000).depth + TILE_BEVEL + 0.045;
    rotor.add(tile); tile.add(surface); rotor.updateMatrixWorld(true);
    const pose = resultTilePose({ ...sector, index }, angle);
    for (const [x, y] of [[-20, 240], [0, 80], [25, 220]]) {
      const expected = new Vector3(x, y, 0).applyMatrix4(surface.matrixWorld);
      const actual = new Vector3(x, y - RESULT_TILE_CENTER, 0).applyQuaternion(pose.quaternion).add(pose.position);
      assert.ok(expected.distanceTo(actual) < 1e-10);
    }
  }
});

test("amounts preserve the painted baseline positions and become ordered horizontal characters", () => {
  const sector = WHEEL_SECTORS.find(sector => sector.amount === 1000);
  const glyphs = sectorLetteringLayout(sector, measure), row = horizontalResultLayout(glyphs);
  assert.equal(glyphs.map(glyph => glyph.character).join(""), "1000€");
  glyphs.slice(0, -1).forEach((glyph, index) => {
    assert.equal(glyph.y + (glyph.ascent - glyph.descent) / 2, 34 + 29 * index);
  });
  for (let index = 1; index < row.letters.length; index++) assert.ok(row.letters[index].x > row.letters[index - 1].x);
  assert.ok(row.letters.every(letter => letter.y === 0));
});

test("special words retain their characters, including the future optional exchange tile", () => {
  for (const [kind, label, text] of [["bankrupt", "Banqueroute", "BANQUEROUTE"], ["bonus", "Bonus", "BONUS"], ["pass", "Passe", "PASSE"], ["exchange", "Échange", "ÉCHANGE"]]) {
    const glyphs = sectorLetteringLayout({ kind, label }, measure), row = horizontalResultLayout(glyphs);
    assert.equal(glyphs.map(glyph => glyph.character).join(""), text);
    assert.ok(glyphs[0].size > glyphs.at(-1).size);
    assert.ok(glyphs.every(glyph => Number.isFinite(glyph.x) && Number.isFinite(glyph.y)));
    for (let index = 1; index < row.letters.length; index++) assert.ok(row.letters[index].x > row.letters[index - 1].x);
  }
});

test("the return first lights the sector, then lifts it, unfolds the text and removes its contour", () => {
  assert.equal(resultMotion(0).ignite, 0);
  assert.deepEqual(resultMotion(0.25), { ignite: 1, lift: 0, spread: 0, outline: 1, caption: 0 });
  assert.equal(resultMotion(1.4).lift, 1);
  assert.ok(resultMotion(1.9).spread > 0 && resultMotion(1.9).spread < 1);
  assert.deepEqual(resultMotion(3), { ignite: 1, lift: 1, spread: 1, outline: 0, caption: 1 });
});
