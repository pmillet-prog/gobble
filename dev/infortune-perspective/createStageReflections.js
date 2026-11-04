import * as THREE from "three";
import { createSphericalReflections, REFLECTION_CENTER } from "./sphericalReflections.js";

// Ambience only: the audience, lights and static set. Portrait reflections are
// rendered separately from their real 3D placement on the desk's planar surface.
export function createStageReflections(renderer, scene, wheel, extraMaterials = [], actors, generator = null) {
  const ownsGenerator = !generator;
  generator ||= new THREE.PMREMGenerator(renderer);
  const cubeTarget = new THREE.WebGLCubeRenderTarget(256, { type: THREE.HalfFloatType });
  const camera = new THREE.CubeCamera(1, 4000, cubeTarget); camera.position.set(...REFLECTION_CENTER);
  const materials = new Set(extraMaterials);
  wheel.traverse(object => {
    for (const material of Array.isArray(object.material) ? object.material : [object.material]) {
      if (material?.isMeshStandardMaterial && (material.metalness > 0.5 || material.clearcoat > 0)) materials.add(material);
    }
  });
  const sphere = createSphericalReflections();
  const panels = new THREE.Group(), panelGeometry = new THREE.PlaneGeometry(1, 1), panelMaterials = [];
  for (const [color, position, size] of [["#fff3df", [-650, 550, -450], [150, 380]], ["#d5e5ff", [650, 400, 250], [120, 320]]]) {
    const material = new THREE.MeshBasicMaterial({ color: new THREE.Color(color).multiplyScalar(3), toneMapped: false });
    const panel = new THREE.Mesh(panelGeometry, material); panelMaterials.push(material);
    panel.position.set(...position); panel.scale.set(size[0], size[1], 1); panel.lookAt(0, 0, 0); panels.add(panel);
  }
  let environmentTarget = null;
  return {
    setProjection(projection, settings) { sphere.update(projection, settings); },
    prepare(environment) {
      for (const material of materials) { material.envMap = environment; sphere.apply(material); }
    },
    async capture(compile = (targetScene, targetCamera) => renderer.compileAsync(targetScene, targetCamera), isDisposed = () => false) {
      const wasVisible = wheel.visible, actorsVisible = actors?.visible;
      const shadowAutoUpdate = renderer.shadowMap.autoUpdate;
      const renderTarget = renderer.getRenderTarget();
      try {
        wheel.visible = false; if (actors) actors.visible = false;
        renderer.shadowMap.autoUpdate = false;
        scene.add(panels);
        // Cube captures use a linear render target, hence a different shader
        // variant from the screen. Compile it before the six synchronous views.
        renderer.setRenderTarget(cubeTarget);
        await compile(scene, camera.children[0]);
        if (isDisposed()) return;
        camera.update(renderer, scene);
        environmentTarget?.dispose(); environmentTarget = generator.fromCubemap(cubeTarget.texture);
        for (const material of materials) {
          material.envMap = environmentTarget.texture; material.needsUpdate = true;
        }
      } finally {
        wheel.visible = wasVisible; if (actors) actors.visible = actorsVisible;
        renderer.shadowMap.autoUpdate = shadowAutoUpdate; scene.remove(panels);
        renderer.setRenderTarget(renderTarget);
      }
    },
    dispose() {
      environmentTarget?.dispose(); cubeTarget.dispose(); panelGeometry.dispose();
      if (ownsGenerator) generator.dispose();
      for (const material of panelMaterials) material.dispose();
    },
  };
}
