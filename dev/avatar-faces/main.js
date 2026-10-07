import { AVATAR_SKINS, avatarSkinFile } from "../../shared/avatarSkins.js";
import { DEFAULT_AVATAR } from "../../shared/avatarConfiguration.js";
import { createAvatarRenderer, loadAvatarCatalog } from "../../src/features/avatar/avatarRenderer.js";
import { loadAvatarImage } from "../../src/features/avatar/avatarAssetCache.js";
import { createAvatarSkinRenderer } from "../../src/features/avatar/avatarSkinRenderer.js";

const form = document.querySelector("#controls");
const canvas = document.querySelector("#portrait");
const status = document.querySelector("#status");
const makeCanvas = (width, height) => Object.assign(document.createElement("canvas"), { width, height });
const isolatedSkin = createAvatarSkinRenderer(makeCanvas);
const images = new Map();
let revision = 0;

for (const skin of AVATAR_SKINS) form.elements.skinStyle.add(new Option(skin.label, skin.id));
form.elements.skinStyle.value = "slim";

const resources = loadAvatarCatalog().then(async catalog => ({ catalog, renderer: await createAvatarRenderer({ catalog }) }));

function load(file) {
  if (!images.has(file)) images.set(file, loadAvatarImage(`/avatars/v1/${file}`).catch(error => { images.delete(file); throw error; }));
  return images.get(file);
}

async function render() {
  const current = ++revision;
  const { base, skinStyle, tone, customColor, view, hair, background } = form.elements;
  const state = { ...DEFAULT_AVATAR, base: base.value, skinStyle: skinStyle.value, tone: tone.value,
    customColor: customColor.value, hair: hair.checked ? DEFAULT_AVATAR.hair : "" };
  const selectedView = view.value;
  document.querySelector(".canvas-wrap").dataset.background = background.value;
  document.querySelector("#description").textContent = AVATAR_SKINS.find(skin => skin.id === state.skinStyle).description;
  customColor.disabled = state.tone !== "custom";
  hair.disabled = selectedView === "head";
  status.textContent = "Chargement de l’aperçu…";
  try {
    const { catalog, renderer } = await resources;
    if (current !== revision) return;
    if (selectedView === "head") {
      const file = avatarSkinFile(state.base, state.skinStyle) || catalog.bases.find(base => base.id === `head_${state.base}`).file;
      const image = await load(file);
      if (current !== revision) return;
      const head = isolatedSkin.prepare({ skin_relief: image }, state);
      const ctx = canvas.getContext("2d");
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(head, 0, 0, canvas.width, canvas.height);
    } else {
      const avatar = await renderer.prepare(state, { transparent: true });
      if (current !== revision) return;
      avatar.draw(canvas, selectedView);
    }
    canvas.setAttribute("aria-label", `${AVATAR_SKINS.find(skin => skin.id === state.skinStyle).label}, base ${state.base}`);
    status.textContent = ["slim", "crows_feet"].includes(state.skinStyle) ? "Proposition · aucune décision de validation enregistrée." : "Modèle existant · comparaison.";
  } catch (error) {
    if (current !== revision) return;
    status.textContent = `Aperçu indisponible : ${error.message}`;
  }
}

form.addEventListener("submit", event => event.preventDefault());
form.addEventListener("input", render);
render();
