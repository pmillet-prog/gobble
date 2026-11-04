import * as THREE from "three";
import hostUrl from "./assets/christian-morin-v2.png";
import { STAGE_CONTESTANTS, STAGE_HOST } from "./stageFixtures.js";
import { placeStageActor } from "./actorPlacement.js";
import { addActorContourEffects } from "./actorContourEffects.js";
import { createActorShadeState } from "./actorShadeSettings.js";
import { prepareInfortuneContestant } from "../../src/features/infortune/prepareInfortuneContestant.js";

export function createStageActors(backLights = [], contestants = STAGE_CONTESTANTS) {
  const root = new THREE.Group(); root.name = "presenter-and-contestants";
  let disposed = false;
  const canvases = [], contourDisposers = [];
  const shading = createActorShadeState();
  function addActor(source, { position, height }, name) {
    if (disposed) return;
    const texture = source instanceof HTMLCanvasElement ? new THREE.CanvasTexture(source) : new THREE.Texture(source);
    texture.needsUpdate = true; texture.colorSpace = THREE.SRGBColorSpace; texture.anisotropy = 4;
    const aspect = source.width / source.height;
    const actor = new THREE.Mesh(new THREE.PlaneGeometry(height * aspect, height), new THREE.MeshStandardMaterial({
      map: texture, color: "#f4f1ed", roughness: 0.85, metalness: 0, envMapIntensity: 0.25,
      // Keep a little of the artwork's baked shading while letting real stage
      // lights affect it. The cutout alpha is also used in its shadow map.
      emissive: "#ffffff", emissiveMap: texture, emissiveIntensity: 0.3,
      transparent: true, alphaTest: 0.06, depthWrite: true, side: THREE.DoubleSide, shadowSide: THREE.DoubleSide, forceSinglePass: true,
    }));
    actor.name = name; actor.castShadow = true; actor.receiveShadow = true;
    placeStageActor(actor, { position, height }); root.add(actor);
    contourDisposers.push(addActorContourEffects(actor, source, backLights, shading.uniform));
  }
  const host = async () => {
    const image = new Image(); image.src = hostUrl; await image.decode();
    addActor(image, STAGE_HOST, "christian-morin");
  };
  const loadContestants = async () => {
    if (disposed) return;
    let renderer;
    const loadRenderer = async () => renderer ||= await (await import("../../src/features/avatar/avatarRenderer.js")).createAvatarRenderer();
    for (const contestant of contestants) {
      if (disposed) return;
      const canvas = await prepareInfortuneContestant(contestant, { loadRenderer, isDisposed: () => disposed,
        makeCanvas() { const value = Object.assign(document.createElement("canvas"), { width: 600, height: 600 });
          canvases.push(value); return value; } });
      if (canvas && !disposed) addActor(canvas, contestant, `contestant-${contestant.id}`);
    }
  };
  return { root, setShading: shading.update, ready: Promise.allSettled([host(), loadContestants()]).then(results => {
    const failed = results.filter(result => result.status === "rejected");
    if (failed.length) throw new AggregateError(failed.map(result => result.reason), "Certains personnages n’ont pas pu être chargés.");
  }), dispose() {
    disposed = true;
    for (const disposeContours of contourDisposers) disposeContours();
    contourDisposers.length = 0;
    // Meshes and their ordinary material maps belong to the surrounding scene.
    for (const canvas of canvases) { canvas.width = 0; canvas.height = 0; }
    canvases.length = 0;
  } };
}
