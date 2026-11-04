import { ShaderChunk } from "three";

// These values depend on the fragment's material/view, never on the emitter.
// Keeping them outside the uniform-bound loop avoids repeating the LTC lookup
// and basis construction in every light evaluation without changing the BRDF.
export const areaLightSetup = /* glsl */`
  vec2 wheelLtcUv = LTC_Uv( geometryNormal, geometryViewDir, material.roughness );
  vec4 wheelLtc1 = texture2D( ltc_1, wheelLtcUv );
  vec4 wheelLtc2 = texture2D( ltc_2, wheelLtcUv );
  mat3 wheelLtcInverse = mat3(
    vec3( wheelLtc1.x, 0, wheelLtc1.y ),
    vec3( 0, 1, 0 ),
    vec3( wheelLtc1.z, 0, wheelLtc1.w )
  );
  vec3 wheelLtcTangent = normalize( geometryViewDir - geometryNormal * dot( geometryViewDir, geometryNormal ) );
  vec3 wheelLtcBitangent = - cross( geometryNormal, wheelLtcTangent );
  mat3 wheelLtcBasis = transposeMat3( mat3( wheelLtcTangent, wheelLtcBitangent, geometryNormal ) );
  mat3 wheelLtcSpecular = wheelLtcInverse * wheelLtcBasis;
  mat3 wheelLtcDiffuse = mat3( 1.0 ) * wheelLtcBasis;
  vec3 wheelLtcFresnel = material.specularColor * wheelLtc2.x + ( vec3( 1.0 ) - material.specularColor ) * wheelLtc2.y;
`;

const source = ShaderChunk.lights_physical_pars_fragment;
const basis = /\tvec3 T1, T2;[\s\S]*?\tmat3 mat = mInv \* transposeMat3\( mat3\( T1, T2, N \) \);/;
const lookup = /\t\tvec2 uv = LTC_Uv\( normal, viewDir, roughness \);[\s\S]*?\t\treflectedLight.directSpecular/;
const evaluateSignature = "vec3 LTC_Evaluate( const in vec3 N, const in vec3 V, const in vec3 P, const in mat3 mInv, const in vec3 rectCoords[ 4 ] )";
const directSignature = "void RE_Direct_RectArea_Physical( const in RectAreaLight rectAreaLight, const in vec3 geometryPosition, const in vec3 geometryNormal, const in vec3 geometryViewDir, const in vec3 geometryClearcoatNormal, const in PhysicalMaterial material, inout ReflectedLight reflectedLight )";
if (!source.includes(evaluateSignature) || !source.includes(directSignature) || !basis.test(source) || !lookup.test(source)) {
  throw new Error("Adapt the wheel LTC shader to this Three.js version.");
}

export const hoistedAreaLightShader = source
  .replace(evaluateSignature, "vec3 wheelLtcEvaluate( const in vec3 P, const in mat3 mat, const in vec3 rectCoords[ 4 ] )")
  .replace(basis, "")
  .replace(directSignature, "void wheelDirectRectArea( const in RectAreaLight rectAreaLight, const in vec3 geometryPosition, const in PhysicalMaterial material, const in mat3 specularTransform, const in mat3 diffuseTransform, const in vec3 fresnel, inout ReflectedLight reflectedLight )")
  .replace("\t\tvec3 normal = geometryNormal;\n\t\tvec3 viewDir = geometryViewDir;\n", "")
  .replace("\t\tfloat roughness = material.roughness;\n", "")
  .replace(lookup, "\t\treflectedLight.directSpecular")
  .replace("LTC_Evaluate( normal, viewDir, position, mInv, rectCoords )", "wheelLtcEvaluate( position, specularTransform, rectCoords )")
  .replace("LTC_Evaluate( normal, viewDir, position, mat3( 1.0 ), rectCoords )", "wheelLtcEvaluate( position, diffuseTransform, rectCoords )");
