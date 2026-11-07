import { AdditiveBlending, Color, DoubleSide, ShaderMaterial, Vector3, Vector4 } from "three";

export function createDynamicActorHalo(texture, lights) {
  const sources = Array.from({ length: 3 }, () => new Vector3());
  const directions = Array.from({ length: 3 }, () => new Vector3());
  const colors = Array.from({ length: 3 }, () => new Color(0, 0, 0));
  const cones = Array.from({ length: 3 }, () => new Vector4());
  const material = new ShaderMaterial({
    uniforms: { contourMap: { value: texture }, haloSources: { value: sources },
      haloDirections: { value: directions }, haloColors: { value: colors }, haloCones: { value: cones },
      selectedHalo: { value: 0 }, selectedHaloColor: { value: new Color("#ffd36b") } },
    vertexShader: /* glsl */`
      varying vec2 contourUv;
      varying vec3 contourPosition;
      varying vec3 contourAxisX;
      varying vec3 contourAxisY;
      void main() {
        contourUv = uv;
        vec4 world = modelMatrix * vec4(position, 1.0);
        contourPosition = world.xyz;
        contourAxisX = normalize(mat3(modelMatrix) * vec3(1.0, 0.0, 0.0));
        contourAxisY = normalize(mat3(modelMatrix) * vec3(0.0, 1.0, 0.0));
        gl_Position = projectionMatrix * viewMatrix * world;
      }`,
    fragmentShader: /* glsl */`
      uniform sampler2D contourMap;
      uniform vec3 haloSources[3];
      uniform vec3 haloDirections[3];
      uniform vec3 haloColors[3];
      uniform vec4 haloCones[3];
      uniform float selectedHalo;
      uniform vec3 selectedHaloColor;
      varying vec2 contourUv;
      varying vec3 contourPosition;
      varying vec3 contourAxisX;
      varying vec3 contourAxisY;
      void main() {
        vec4 mask = texture2D(contourMap, contourUv);
        if (mask.a < 0.002) discard;
        vec2 edge = mask.rg * 2.0 - 1.0;
        vec3 edgeNormal = normalize(contourAxisX * edge.x + contourAxisY * edge.y);
        vec3 viewDirection = normalize(cameraPosition - contourPosition);
        vec3 radiance = vec3(0.0);
        for (int i = 0; i < 3; i++) {
          vec3 towardSource = haloSources[i] - contourPosition;
          float distanceSquared = max(dot(towardSource, towardSource), 1.0);
          vec3 lightDirection = towardSource * inversesqrt(distanceSquared);
          float cone = smoothstep(haloCones[i].z, haloCones[i].w, dot(-lightDirection, haloDirections[i]));
          float rangeFade = haloCones[i].y > 0.0 ? pow(clamp(1.0 - pow(sqrt(distanceSquared) / haloCones[i].y, 4.0), 0.0, 1.0), 2.0) : 1.0;
          float edgeLight = 0.08 + 0.92 * pow(max(dot(edgeNormal, lightDirection), 0.0), 1.5);
          float towardCamera = 0.25 + 0.75 * pow(max(dot(-lightDirection, viewDirection), 0.0), 4.0);
          radiance += haloColors[i] * haloCones[i].x / distanceSquared * cone * rangeFade * edgeLight * towardCamera;
        }
        gl_FragColor = vec4(mix(radiance * 3.2, selectedHaloColor * 2.4, selectedHalo), mask.a * mix(0.9, 1.0, selectedHalo));
        #include <colorspace_fragment>
      }`,
    transparent: true, depthWrite: false, side: DoubleSide, forceSinglePass: true,
    blending: AdditiveBlending, toneMapped: false,
  });
  return { material, setSelected(selected) { material.uniforms.selectedHalo.value = selected ? 1 : 0; }, update() {
    for (let i = 0; i < 3; i++) {
      const light = lights[i];
      if (!light || !light.visible) { cones[i].set(0, 1, -1, 1); colors[i].setRGB(0, 0, 0); continue; }
      light.getWorldPosition(sources[i]);
      light.target.getWorldPosition(directions[i]); directions[i].sub(sources[i]).normalize();
      colors[i].copy(light.color);
      const contourIntensity = light.intensity / (light.userData.actorHaloPowerGain || 1);
      cones[i].set(contourIntensity, light.distance, Math.cos(light.angle), Math.max(Math.cos(light.angle) + 0.00001, Math.cos(light.angle * (1 - light.penumbra))));
    }
    material.uniformsNeedUpdate = true;
  } };
}
