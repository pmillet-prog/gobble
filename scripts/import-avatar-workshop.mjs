// Explicit, repeatable import. The workshop stays read-only. Clothes/hat candidates
// are included at Paul's request for this local editor, without approving them.
import fs from "node:fs/promises";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { orderAvatarHair } from "./avatar-hair-order.mjs";

const root = path.resolve(".Tmp/avatar/avatar");
const output = path.resolve("public/avatars/v1");
const rendererOutput = path.resolve("src/features/avatar/renderer");
const familyOption = process.argv.find(arg => arg.startsWith("--families="));
const selectedFamilies = familyOption ? new Set(familyOption.slice(11).split(",")) : null;
if (selectedFamilies && [...selectedFamilies].some(family => !["hair", "headwear"].includes(family))) throw Error("Partial import supports hair,headwear only.");
const catalog = JSON.parse(await fs.readFile(path.join(root, "catalog/catalog.json"), "utf8"));
// Paul explicitly keeps his refitted Gavroche despite its older review status.
const retainedRejectedParts = { headwear: new Set(["newsboy"]) };
const clothes = JSON.parse(await fs.readFile(path.join(root, "assets/candidates/clothes/lot_009/assembly.json"), "utf8"));
const clothesReview = JSON.parse(await fs.readFile(path.join(root, "catalog/reviews/lot_009_habits.json"), "utf8"));
const approvedClothes = new Set(catalog.clothes.map(part => part.id.split(":")[1]));
catalog.clothes = [...catalog.clothes, ...clothes.parts
  .filter(part => !approvedClothes.has(part.id) && (clothesReview.assets[part.id]?.status || part.status) !== "rejected")
  .map(part => ({ ...part, file: part.result.file, localCandidate: true }))];
// Import the current versions used in the workshop, including the remaining
// ready pieces requested for the local player editor. Review history stays intact.
for (const [family, folder, lot, review] of [
  ["headwear", "headwear", "007", "couvrechefs"],
  ["glasses", "glasses", "008", "lunettes"],
  ["lashes", "eyelashes", "003", "cils"],
  ["hair", "hair", "005", "coiffures"],
  ["facialhair", "facialhair", "010", "pilosite"],
]) {
  const assembly = JSON.parse(await fs.readFile(path.join(root, `assets/candidates/${folder}/lot_${lot}/assembly.json`), "utf8"));
  const decisions = await fs.readFile(path.join(root, `catalog/reviews/lot_${lot}_${review}.json`), "utf8")
    .then(JSON.parse).catch(error => { if (error.code === "ENOENT") return { assets: {} }; throw error; });
  const parts = new Map((catalog[family] || []).map(part => [part.id.split(":").pop(), part]));
  for (const part of assembly.parts) {
    const status = decisions.assets[part.id]?.status || part.status;
    if (status === "rejected" && !retainedRejectedParts[family]?.has(part.id)) { parts.delete(part.id); continue; }
    parts.set(part.id, { ...parts.get(part.id), ...part, file: part.result.file, localCandidate: status !== "approved" });
  }
  catalog[family] = [...parts.values()];
}
await fs.mkdir(output, { recursive: true });
await fs.mkdir(rendererOutput, { recursive: true });
const copied = new Map();
async function asset(file) {
  if (!file) return undefined;
  if (copied.has(file)) return copied.get(file);
  const target = file.replace(/^assets\//, "");
  const destination = path.join(output, target);
  await fs.mkdir(path.dirname(destination), { recursive: true });
  await fs.copyFile(path.join(root, file), destination);
  copied.set(file, target);
  return target;
}
const pack = selectedFamilies ? JSON.parse(await fs.readFile(path.join(output, "catalog.json"), "utf8")) : { version: 1, bases: [], families: {} };
for (const base of selectedFamilies ? [] : catalog.eyes[0].base_dependencies) {
  pack.bases.push({ id: base.id, file: await asset(base.file), mask: await asset(base.coloration.mask.file) });
}
const families = { eyes: "eyes", brows: "eyebrows", lashes: "lashes", nose: "noses", mouths: "mouths", hair: "hair", headwear: "headwear", glasses: "glasses", facialhair: "facialhair", clothes: "clothes", backdrops: "backgrounds", auras: "auras" };
for (const [family, source] of Object.entries(families)) {
  if (selectedFamilies && !selectedFamilies.has(family)) continue;
  pack.families[family] = [];
  for (const part of catalog[source]) {
    if (!part.localCandidate && (!part.approved_at || !part.file.startsWith("assets/approved/"))) continue;
    const entry = { id: part.id.split(":").pop(), label: part.label, file: await asset(part.file) };
    for (const key of ["anchor", "attachment", "fitting", "eye_centers", "iris", "brow_centers", "lash_strips", "lash_height", "layer_partition", "model_id", "expression", "allowed_bases", "base", "counterpart", "unlock", "localCandidate"]) {
      if (part[key]) entry[key] = part[key];
    }
    if (part.coloration?.mask) entry.mask = await asset(part.coloration.mask.file);
    if (part.coloration?.method) entry.coloration = { method: part.coloration.method };
    // Tint selection previews only; the renderer keeps the original neutral PNG.
    if (family === "hair" && part.coloration?.method === "multiply") entry.previewTone = "brown";
    entry.layers = {};
    for (const [key, layer] of Object.entries(part.layers || {})) entry.layers[key] = await asset(layer.file);
    entry.masks = {};
    for (const [key, mask] of Object.entries(part.masks || {})) entry.masks[key] = await asset(mask.file);
    pack.families[family].push(entry);
  }
  if (family === "hair") pack.families.hair = orderAvatarHair(pack.families.hair);
}
// Measure transparency once during import, never on the player's main thread.
// Only display framing changes; no PNG or avatar attachment is altered.
const previews = selectedFamilies ? (selectedFamilies.has("headwear") ? pack.families.headwear : []) : [...pack.families.headwear, ...pack.families.glasses, ...pack.families.brows];
const bounds = JSON.parse(execFileSync("python", [path.resolve("scripts/avatar-preview-bounds.py")], {
  input: JSON.stringify(previews.map(part => path.join(output, part.file))), encoding: "utf8",
}));
previews.forEach((part, index) => { part.preview = bounds[index]; });
await fs.writeFile(path.join(output, "catalog.json"), JSON.stringify(pack));

// Preserve the workshop's drawing/placement functions, packaged as ES modules.
// No review UI, development server, global registration, or authoring assets.
const modules = {
  "adjustment_limits": [],
  "lot_001_renderer": ["adjustment_limits"],
  "background-renderer": [],
  "aura-renderer": [],
  "lot_002_renderer": ["lot_001_renderer", "adjustment_limits", "background-renderer", "aura-renderer"],
  "lot_003_004_renderer": ["lot_001_renderer"],
  "hair-fitting": ["headwear-fitting"],
  "lot_005_renderer": ["lot_001_renderer", "hair-fitting"],
  "lot_006_renderer": ["lot_001_renderer"],
  "headwear-fitting": [],
  "lot_007_renderer": ["lot_001_renderer", "headwear-fitting"],
  "lot_008_renderer": ["lot_001_renderer"],
  "lot_009_renderer": ["lot_001_renderer"],
  "lot_010_renderer": ["lot_001_renderer"],
};
for (const [name, dependencies] of Object.entries(modules)) {
  if (selectedFamilies && ![...(selectedFamilies.has("hair") ? ["hair-fitting", "lot_005_renderer"] : []), ...(selectedFamilies.has("headwear") ? ["headwear-fitting", "lot_007_renderer"] : [])].includes(name)) continue;
  const source = await fs.readFile(path.join(root, "editor", name + ".js"), "utf8");
  const factoryMatch = /,\s*(function\s*\([^)]*\)\s*\{)/.exec(source);
  const factoryStart = factoryMatch ? factoryMatch.index + factoryMatch[0].indexOf("function") : -1;
  const factoryEnd = source.lastIndexOf("});");
  if (factoryStart < 2 || factoryEnd < factoryStart) throw Error("Unknown renderer wrapper: " + name);
  // The player uses a handful of active combinations, unlike the workshop's
  // comparison grids. Bound its 1024px tint/layer caches to four entries each.
  let factory = source.slice(factoryStart, factoryEnd + 1).replace(/(\b\w+\.size\s*(?:>=|>)\s*)\d+/g, "$14");
  // The workshop's nose-only preview supports these adjustments. Apply them to
  // the assembled player too, keeping the same approved nose pivot and limits.
  if (name === "lot_002_renderer") {
    const headDraw = "ctx.drawImage(skin.tinted(id, assets[id], role, state.tone || 'native', assets[id + '_mask'], state.customColor, state.showMask), 0, 0);";
    if (!factory.includes(headDraw)) throw Error("Head renderer changed; review the skin relief adapter.");
    factory = factory.replace(headDraw, "if (role === 'head' && options.drawSkin) { options.drawSkin(ctx); continue; }\n          " + headDraw);
    const characterStart = "if (!options.authoring) auras.draw(ctx, assets, state);";
    if (!factory.includes(characterStart)) throw Error("Character renderer changed; review the silhouette adapter.");
    factory = factory.replace(characterStart, characterStart + "\n        if (!options.authoring) options.transformCharacter?.(ctx, canvas.gobbleViewport);");
    factory = factory.replace("if (!assets['eye_' + part.id]) return;", "if (state.eyes && !assets['eye_' + part.id]) return;")
      .replace("if (view === 'iris') {", "if (view === 'iris') { if (!state.eyes) return;")
      .replace("if (!decorOnly && state.visible !== false)", "if (state.eyes && !decorOnly && state.visible !== false)");
    const original = "ctx.drawImage(skin.tinted(id, assets[id], 'nose', state.tone || 'native', assets[id + '_mask'], state.customColor, state.showMask), 0, 0);";
    if (!factory.includes(original)) throw Error("Nose renderer changed; review the player adapter.");
    factory = factory.replace(original, "ctx.save(); ctx.translate(512 + (state.noseDx || 0), 470 + (state.noseDy || 0)); ctx.scale(state.noseScale ?? 1, state.noseScale ?? 1); ctx.drawImage(skin.tinted(id, assets[id], 'nose', state.tone || 'native', assets[id + '_mask'], state.customColor, state.showMask), -512, -470); ctx.restore();");
  }
  if (name === "lot_003_004_renderer") {
    factory = factory.replace("function boundaries(assets, eyes) {", "function boundaries(assets, eyes) { if (!eyes || !assets['eye_' + eyes + '_opening']) return [[], []];");
  }
  if (name === "adjustment_limits") {
    const heads = "['femme', 'homme'].map(base => geometry(assets['head_' + base])).filter(Boolean)";
    if (!factory.includes(heads)) throw Error("Head constraints changed; review the replacement head adapter.");
    factory = factory.replace(heads, "(state.skinStyle && state.skinStyle !== 'classic' ? [state.base || 'femme'] : ['femme', 'homme']).map(base => geometry(assets['head_' + base])).filter(Boolean)");
    const original = "const zoneTop = nose ? nose.bounds.bottom + 10 : 481;";
    if (!factory.includes(original)) throw Error("Mouth constraints changed; review the nose adapter.");
    factory = factory.replace(original, "const zoneTop = nose ? 470 + (nose.bounds.bottom - 470) * (state.noseScale ?? 1) + (state.noseDy || 0) + 10 : 481;");
  }
  const imports = dependencies.map((dep, i) => `import dependency${i} from "./${dep}.js";`).join("\n");
  await fs.writeFile(path.join(rendererOutput, name + ".js"), `// Generated by scripts/import-avatar-workshop.mjs from the avatar workshop.\n${imports}\nexport default (${factory})(${dependencies.map((_, i) => `dependency${i}`).join(", ")});\n`);
}
console.log(`Avatar pack: ${copied.size} files; ${Object.values(pack.families).reduce((n, parts) => n + parts.length, 0)} parts, including ${pack.families.clothes.filter(part => part.localCandidate).length} clothes and ${pack.families.headwear.filter(part => part.localCandidate).length} hat candidates for the local editor.`);
