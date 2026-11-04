import { BackSide, Color, Group, Mesh, MeshBasicMaterial, SRGBColorSpace, TextureLoader } from "three";
import { AUDIENCE_ROWS, audienceRowGeometry, audienceTierGeometry, placeAudienceRow } from "./audienceRows.js";
import { STAGE_FLOOR } from "./stageFixtures.js";

// Independent photographic cutouts on concentric tiers. Their perspective,
// parallax and mutual occlusion come from the camera and depth buffer.
export function createAudienceEnvironment() {
  const root = new Group(); root.name = "tiered-photographic-audience";
  const loader = new TextureLoader();
  const platformMaterial = new MeshBasicMaterial({ color: "#050911", toneMapped: false });
  let platformAttached = false;
  let disposed = false;
  const ready = Promise.allSettled(AUDIENCE_ROWS.map(async row => {
    const texture = await loader.loadAsync(row.url);
    if (disposed) { texture.dispose(); return; }
    texture.colorSpace = SRGBColorSpace; texture.anisotropy = 4;
    const aspect = texture.image.width / texture.image.height;
    const material = new MeshBasicMaterial({ map: texture, color: new Color().setScalar(row.brightness),
      side: BackSide, transparent: true, alphaTest: 0.035, depthWrite: true, toneMapped: false });
    // Shade each row in its own image space: nearly black feet, with a dark veil
    // remaining over the heads. Preserve alpha so the rear rows stay occluded.
    material.onBeforeCompile = shader => {
      shader.fragmentShader = shader.fragmentShader.replace("#include <opaque_fragment>", `
        #ifdef USE_MAP
          float audienceLight = mix(0.04, 0.6, smoothstep(0.04, 0.96, vMapUv.y));
          outgoingLight *= audienceLight;
        #endif
        #include <opaque_fragment>
      `);
    };
    material.customProgramCacheKey = () => "audience-row-dark-gradient-v1";
    const spectators = new Mesh(audienceRowGeometry(aspect, row), material);
    spectators.name = `audience-row-${row.id}`; placeAudienceRow(spectators, row); root.add(spectators);
    // Small dark risers anchor the feet and chairs. They sit behind each image
    // and naturally hide the lowest part of the following rows.
    const top = row.baseY + 18, height = top - STAGE_FLOOR;
    const platform = new Mesh(audienceTierGeometry(row, aspect, height), platformMaterial);
    platform.name = `audience-tier-${row.id}`;
    platform.position.y = STAGE_FLOOR; platform.rotation.y = row.angle; root.add(platform);
    platformAttached = true;
  })).then(results => {
    const failures = results.filter(result => result.status === "rejected");
    if (failures.length) throw new AggregateError(failures.map(result => result.reason), "Certaines rangées du public n’ont pas pu être chargées.");
  });
  // The scene owns loaded mesh resources. Late textures are disposed above.
  return { root, ready, dispose() { disposed = true; if (!platformAttached) platformMaterial.dispose(); } };
}
