const COSTUME_ROOT = "costumes/2026-10-08/";
const FILE_VERSIONS = { rabbit: "rabbit-v2", musketeer: "musketeer-v2" };
const OPEN_HAT_COSTUMES = new Set(["pirate", "santa", "scarecrow", "musketeer"]);
const HOOD_HAIR_CLIP = Object.freeze({ ellipse: Object.freeze([512, 445, 215, 245]) });
const HAT_HAIR_CLIP = Object.freeze({ rect: Object.freeze([0, 240, 1024, 784]) });
const RABBIT_HAIR_CLIP = Object.freeze({ ellipse: Object.freeze([512, 450, 210, 210]) });
const definitions = [
  ["dinosaur", "Dinosaure"], ["chicken", "Poulet"], ["penguin", "Pingouin"],
  ["unicorn", "Licorne"], ["bear", "Ours"], ["frog", "Grenouille"],
  ["shark", "Requin"], ["panda", "Panda"], ["bee", "Abeille"],
  ["rabbit", "Lapin"], ["cow", "Vache"], ["astronaut", "Astronaute"],
  ["pirate", "Pirate"], ["knight", "Chevalier"], ["vampire", "Vampire", false, false],
  ["mummy", "Momie"], ["clown", "Clown", false], ["santa", "Père Noël"],
  ["scarecrow", "Épouvantail"], ["robot", "Robot"], ["musketeer", "Mousquetaire"],
  ["baby", "Bébé"],
];

// Costumes cover clothes without changing the stored outfit. Their openings
// leave the player's own face, expression, glasses and accessories available.
export const AVATAR_COSTUMES = Object.freeze(definitions.map(([id, label, hideHair = false, hideHeadwear = true]) => Object.freeze({
  id, label, file: `${COSTUME_ROOT}${FILE_VERSIONS[id] || id}.png`, thumbnail: `${COSTUME_ROOT}thumbnails/${id === "musketeer" ? "musketeer-v2" : id}.webp`,
  layers: {}, masks: {}, hideHair, hideHeadwear, hairUnderCostume: !["vampire", "clown"].includes(id),
  hairClip: ["vampire", "clown"].includes(id) ? null
    : id === "rabbit" ? RABBIT_HAIR_CLIP : OPEN_HAT_COSTUMES.has(id) ? HAT_HAIR_CLIP : HOOD_HAIR_CLIP,
  ...(id === "clown" ? { headwearFrontBottom: 300 } : {}),
  ...(id === "rabbit" ? { headClip: [280, 240, 464, 460] } : {}),
})));

export function getAvatarCostume(id) {
  return AVATAR_COSTUMES.find(part => part.id === id);
}
