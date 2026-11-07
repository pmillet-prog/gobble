import * as THREE from "three";
import { STAGE_CONTESTANTS, STAGE_HOST } from "./stageFixtures.js";
import { placeStageActor } from "./actorPlacement.js";
import { addActorContourEffects } from "./actorContourEffects.js";
import { createActorShadeState } from "./actorShadeSettings.js";
import { createRenderCanvas, loadRenderImage } from './wheelRenderPlatform.js';

// Keep image loading out of the worker's JavaScript module graph. In Vite dev,
// Firefox can reject the PNG's ?import module before the renderer even starts.
const hostUrl = new URL('./assets/christian-morin-v2.png', import.meta.url).href;

export function createStageActors(backLights = [], contestants = STAGE_CONTESTANTS, portraits = null) {
  const root = new THREE.Group(); root.name = "presenter-and-contestants";
  let disposed = false, selectedId = null;
  const abort = new AbortController();
  const canvases = [], contours = new Map();
  const shading = createActorShadeState();
  function addActor(source, { position, height }, name) {
    if (disposed) return;
    const texture = new THREE.CanvasTexture(source);
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
    const contour = addActorContourEffects(actor, source, backLights, shading.uniform);
    contour.setSelected(name === `contestant-${selectedId}`);
    contours.set(actor, contour);
  }
  const host = async () => {
    const image = await loadRenderImage(hostUrl, { signal: abort.signal });
    if (disposed) { image.width = image.height = 0; return; }
    canvases.push(image);
    addActor(image, STAGE_HOST, "christian-morin");
  };
  const loadContestants = async () => {
    if (disposed) return;
    let renderer;
    const loadRenderer = async () => renderer ||= await (await import("../../src/features/avatar/avatarRenderer.js")).createAvatarRenderer();
    for (const contestant of contestants) {
      if (disposed) return;
      if (portraits) {
        const source = portraits.find(portrait => portrait.id === contestant.id)?.image;
        if (!source) throw new Error('Missing worker portrait');
        const canvas = createRenderCanvas(source.width, source.height); canvases.push(canvas);
        canvas.getContext('2d').drawImage(source, 0, 0); source.close();
        addActor(canvas, contestant, `contestant-${contestant.id}`);
        continue;
      }
      const { prepareInfortuneContestant } = await import('../../src/features/infortune/prepareInfortuneContestant.js');
      const canvas = await prepareInfortuneContestant(contestant, { loadRenderer, isDisposed: () => disposed,
        makeCanvas() { const value = createRenderCanvas(600, 600);
          canvases.push(value); return value; } });
      if (canvas && !disposed) addActor(canvas, contestant, `contestant-${contestant.id}`);
    }
  };
  return { root, setShading: shading.update,
    setSelected(id) {
      selectedId = id;
      for (const [actor, contour] of contours) contour.setSelected(actor.name === `contestant-${id}`);
    }, ready: Promise.allSettled([host(), loadContestants()]).then(results => {
    const failed = results.filter(result => result.status === "rejected");
    if (failed.length) throw new AggregateError(failed.map(result => result.reason), "Certains personnages n’ont pas pu être chargés.");
  }), dispose() {
    disposed = true; abort.abort();
    for (const contour of contours.values()) contour.dispose();
    contours.clear();
    // Meshes and their ordinary material maps belong to the surrounding scene.
    for (const canvas of canvases) { canvas.width = 0; canvas.height = 0; }
    canvases.length = 0;
  } };
}
