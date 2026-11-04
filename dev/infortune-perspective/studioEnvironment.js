import { Color, Mesh, MeshBasicMaterial, PlaneGeometry, PMREMGenerator, Scene } from "three";

// A dark studio with narrow softboxes gives steel alternating dark areas and
// highlights. This reflection map is baked once; it is not a scene capture.
export function createStudioEnvironment(renderer, sharedGenerator) {
  const studio = new Scene(); studio.background = new Color("#171b24");
  const geometry = new PlaneGeometry(1, 1), materials = [];
  function softbox(color, intensity, position, width, height) {
    const material = new MeshBasicMaterial({ color: new Color(color).multiplyScalar(intensity), toneMapped: false });
    materials.push(material);
    const panel = new Mesh(geometry, material);
    panel.position.set(...position); panel.scale.set(width, height, 1); panel.lookAt(0, 0, 0); studio.add(panel);
  }
  softbox("#fff3df", 4.0, [-6, 4, -4], 1.4, 6);
  softbox("#d5e5ff", 2.5, [6, 3, 2], 1.2, 5);
  softbox("#fff8ee", 2.0, [0, 7, 3], 4, 1.4);
  const generator = sharedGenerator || new PMREMGenerator(renderer);
  try { return generator.fromScene(studio, 0.02); }
  finally {
    if (!sharedGenerator) generator.dispose();
    geometry.dispose();
    for (const material of materials) material.dispose();
  }
}
