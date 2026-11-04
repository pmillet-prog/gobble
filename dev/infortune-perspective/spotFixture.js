import { CircleGeometry, CylinderGeometry, Group, Mesh, MeshBasicMaterial, MeshStandardMaterial, Vector3 } from "three";

// A physical lens and housing at the SpotLight's origin. The SpotLight supplies
// direct illumination; these meshes give environment captures a real 3D source.
export function createSpotFixture(light) {
  const root = new Group(); root.name = "spot-fixture";
  root.position.copy(light.position);
  root.quaternion.setFromUnitVectors(new Vector3(0, 0, 1), new Vector3().subVectors(light.target.position, light.position).normalize());
  const housing = new Mesh(new CylinderGeometry(22, 22, 38, 24),
    new MeshStandardMaterial({ color: "#141820", metalness: 0.75, roughness: 0.38 }));
  housing.rotation.x = Math.PI / 2; housing.position.z = -20;
  const lens = new Mesh(new CircleGeometry(18, 32), new MeshBasicMaterial());
  lens.name = "spot-lens";
  lens.onBeforeRender = () => {
    lens.material.color.copy(light.color).multiplyScalar(light.visible ? light.intensity / 20000 : 0);
  };
  root.add(housing, lens); return root;
}
