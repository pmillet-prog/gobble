import test from "node:test";
import assert from "node:assert/strict";
import { Group, Mesh, MeshBasicMaterial, MeshPhysicalMaterial, MeshStandardMaterial, PlaneGeometry, RectAreaLight, Scene, ShaderChunk, ShaderLib } from "three";
import { compactAreaLightShader } from "./compactAreaLightShader.js";
import { createSphericalReflections } from "./sphericalReflections.js";

function fixture() {
  const scene = new Scene(), geometry = new PlaneGeometry(), material = new MeshPhysicalMaterial({ clearcoat: 0.7 });
  const mesh = new Mesh(geometry, material); scene.add(mesh);
  for (let index = 0; index < 6; index++) scene.add(new RectAreaLight());
  const sphere = createSphericalReflections(); sphere.apply(material);
  const key = material.customProgramCacheKey(), chunks = ShaderChunk.lights_fragment_begin;
  compactAreaLightShader(scene);
  const shader = { uniforms: {}, vertexShader: ShaderLib.physical.vertexShader, fragmentShader: ShaderLib.physical.fragmentShader };
  material.onBeforeCompile(shader, {});
  return { scene, material, mesh, shader, key, chunks, dispose() { material.dispose(); geometry.dispose(); } };
}

test("area-light evaluation is kept once; shadowed light loops and reflection patches are preserved", () => {
  const app = fixture(), source = app.shader.fragmentShader;
  assert.equal(app.shader.uniforms.wheelAreaLightCount.value, 6);
  assert.ok(source.includes("i < min( NUM_RECT_AREA_LIGHTS, wheelAreaLightCount )"));
  assert.equal(source.match(/wheelDirectRectArea\( rectAreaLight,/g).length, 1);
  assert.ok(source.includes("stageSphereDirection( reflectVec )"));
  assert.ok(app.material.customProgramCacheKey().startsWith(app.key));
  for (const type of ["SPOT", "POINT", "DIR"]) {
    assert.ok(source.includes(`i < NUM_${type}_LIGHTS`));
  }
  assert.ok(source.includes("UNROLLED_LOOP_INDEX < NUM_DIR_LIGHT_SHADOWS"));
  assert.equal(ShaderChunk.lights_fragment_begin, app.chunks, "No global Three.js shader mutation");
  const key = app.material.customProgramCacheKey();
  compactAreaLightShader(app.scene); assert.equal(app.material.customProgramCacheKey(), key);
  app.dispose();
});

test("LTC material/view work is shared across emitters while edge evaluation and other lighting stay unchanged", () => {
  const app = fixture(), source = app.shader.fragmentShader;
  const loop = source.indexOf("for ( int i = 0; i < min( NUM_RECT_AREA_LIGHTS, wheelAreaLightCount )");
  for (const expression of ["texture2D( ltc_1, wheelLtcUv )", "texture2D( ltc_2, wheelLtcUv )", "mat3 wheelLtcSpecular", "vec3 wheelLtcFresnel"]) {
    assert.ok(source.indexOf(expression) >= 0 && source.indexOf(expression) < loop, expression);
    assert.equal(source.split(expression).length, 2, "The common work has one definition");
  }
  const physical = ShaderChunk.lights_physical_pars_fragment;
  const evaluation = physical.slice(physical.indexOf("\tvec3 coords[ 4 ];"), physical.indexOf("\treturn vec3( result );") + "\treturn vec3( result );".length);
  assert.ok(evaluation.length > 500);
  assert.ok(source.includes(evaluation), "The four edge integrals, order and clipping remain Three's equations");
  assert.ok(source.includes(physical.slice(physical.indexOf("void RE_Direct_Physical("))), "Point, spot, directional and indirect BRDFs are unchanged");
  assert.ok(source.includes("lightColor * fresnel * wheelLtcEvaluate( position, specularTransform, rectCoords )"));
  assert.ok(source.includes("lightColor * material.diffuseColor * wheelLtcEvaluate( position, diffuseTransform, rectCoords )"));
  assert.ok(!source.includes("LTC_Evaluate( normal, viewDir"));
  assert.equal(ShaderChunk.lights_physical_pars_fragment, physical);
  app.dispose();
});

test("hidden exchange materials are covered; unlit materials and scenes without area lights are untouched", () => {
  const root = new Group(), geometry = new PlaneGeometry(), material = new MeshStandardMaterial(), unlit = new MeshBasicMaterial();
  const mesh = new Mesh(geometry, [material, unlit]); mesh.visible = false; root.add(mesh);
  const original = material.onBeforeCompile, unlitCompile = unlit.onBeforeCompile;
  compactAreaLightShader(root); assert.equal(material.onBeforeCompile, original);
  root.add(new RectAreaLight()); compactAreaLightShader(root);
  assert.notEqual(material.onBeforeCompile, original); assert.equal(unlit.onBeforeCompile, unlitCompile);
  material.dispose(); unlit.dispose(); geometry.dispose();
});
