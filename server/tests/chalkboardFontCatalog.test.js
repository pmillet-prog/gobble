import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, utimesSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { createChalkboardFontCatalog } from "../chalkboard/chalkboardFontCatalog.js";
import { createChalkboardService } from "../chalkboard/chalkboardService.js";

test("new font files are discovered without a hardcoded list or service restart", () => {
  const directory = mkdtempSync(path.join(tmpdir(), "gobble-chalkfont-"));
  try {
    for (const file of ["chalk.otf", "white-chalk.ttf", "README.md", "archive.zip"]) {
      writeFileSync(path.join(directory, file), "fixture");
    }
    mkdirSync(path.join(directory, "folder.ttf"));
    const catalog = createChalkboardFontCatalog({ directory });
    const service = createChalkboardService({ fontCatalog: catalog });
    assert.deepEqual(catalog.getFonts().map(font => font.id), ["chalk", "white-chalk"]);
    assert.strictEqual(catalog.getFonts(), catalog.getFonts(), "unchanged directory reuses its catalog");
    writeFileSync(path.join(directory, "Nouvelle Craie.woff2"), "fixture");
    writeFileSync(path.join(directory, "Nouvelle Craie.ttf"), "fixture");
    // Force a distinct directory timestamp even on coarse-resolution filesystems.
    utimesSync(directory, new Date(), new Date(Date.now() + 2000));
    const font = service.getFonts().find(font => font.id === "nouvelle-craie");
    assert.deepEqual(font, { id: "nouvelle-craie", src: "/chalkfont/Nouvelle%20Craie.woff2" });
    assert.equal(service.getFonts().length, 3, "multiple formats do not weight the same face twice");
    const moderator = { userId: 17 };
    const published = service.addIntervention("free", { elements: [{
      type: "text", text: "BONJOUR", font: font.id, cx: 200, cy: 200, width: 240, fontSize: 68,
    }] }, moderator).intervention;
    assert.equal(published.elements[0].font, font.id);
    assert.equal(service.getSnapshot("free").interventions[0].elements[0].font, font.id);
    service.deleteIntervention(published.id, moderator);
    assert.equal(service.undoLastDeletion("free", moderator).intervention.elements[0].font, font.id);
    const invalid = service.addIntervention("free", { elements: [{ ...published.elements[0], font: "https://example.test/font.ttf" }] }, moderator);
    assert.equal(invalid.intervention.elements[0].font, "chalk");
  } finally {
    // Only the exact directory created by mkdtemp, within the OS temporary folder.
    assert.equal(path.dirname(path.resolve(directory)), path.resolve(tmpdir()));
    assert.ok(path.basename(directory).startsWith("gobble-chalkfont-"));
    rmSync(directory, { recursive: true, force: true });
  }
});
