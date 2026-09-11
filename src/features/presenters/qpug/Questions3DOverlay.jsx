import React, { useEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import { Canvas, useFrame, useLoader, useThree } from "@react-three/fiber";
import { LEPERS_ROUND_ANNOUNCEMENT_MS } from "../../../../shared/lepersRules.js";
import { QPUG_HEIGHT, QPUG_SHAPES, QPUG_WIDTH } from "./qpugShapes.js";
import "./Questions3DOverlay.css";

const clamp01 = (v) => Math.max(0, Math.min(1, v));
const smoothstep = (t) => t * t * (3 - 2 * t);

function makeShape(record) {
  const outer = record.outer.map(([x, y]) => new THREE.Vector2(x, y));
  const shape = new THREE.Shape(outer);

  for (const holePoints of record.holes) {
    const hole = new THREE.Path(
      holePoints.map(([x, y]) => new THREE.Vector2(x, y))
    );
    shape.holes.push(hole);
  }

  return shape;
}

function LogoMesh({
  textureUrl,
  duration,
  depth,
  bevel,
  frontOpacity,
  backOpacity,
  sideOpacity,
  scale,
  loop,
  onDone,
}) {
  const group = useRef();
  const start = useRef(null);
  const finished = useRef(false);

  const texture = useLoader(THREE.TextureLoader, textureUrl);
  const backTexture = useMemo(() => texture.clone(), [texture]);
  const { viewport, gl } = useThree();

  useEffect(() => {
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.anisotropy = Math.min(
      8,
      gl.capabilities.getMaxAnisotropy?.() || 1
    );
    texture.needsUpdate = true;

    backTexture.colorSpace = THREE.SRGBColorSpace;
    backTexture.wrapS = THREE.RepeatWrapping;
    backTexture.repeat.x = -1;
    backTexture.offset.x = 1;
    backTexture.anisotropy = Math.min(
      8,
      gl.capabilities.getMaxAnisotropy?.() || 1
    );
    backTexture.needsUpdate = true;
  }, [texture, backTexture, gl]);

  const shapes = useMemo(
    () => QPUG_SHAPES.map(makeShape),
    []
  );

  const geometry = useMemo(() => {
    const g = new THREE.ExtrudeGeometry(shapes, {
      depth,
      bevelEnabled: bevel > 0,
      bevelThickness: bevel,
      bevelSize: bevel * 0.72,
      bevelSegments: bevel > 0 ? 2 : 0,
      curveSegments: 6,
      steps: 1,
    });

    // ExtrudeGeometry goes from z=0 to z=depth.
    // Center it around z=0 so front/back are symmetrical.
    g.translate(0, 0, -depth / 2);
    g.computeVertexNormals();
    return g;
  }, [shapes, depth, bevel]);

  useEffect(() => () => geometry.dispose(), [geometry]);

  // ExtrudeGeometry uses material index 0 for caps, 1 for side walls.
  const capMaterial = useMemo(
    () =>
      new THREE.MeshBasicMaterial({
        transparent: true,
        opacity: 0,
        depthWrite: false,
        colorWrite: false,
      }),
    []
  );

  const sideMaterial = useMemo(
    () =>
      new THREE.MeshPhysicalMaterial({
        color: new THREE.Color("#17436d"),
        transparent: true,
        opacity: sideOpacity,
        roughness: 0.32,
        metalness: 0.04,
        clearcoat: 0.5,
        clearcoatRoughness: 0.28,
        side: THREE.DoubleSide,
        depthWrite: false,
      }),
    []
  );

  const frontMaterial = useMemo(
    () =>
      new THREE.MeshBasicMaterial({
        map: texture,
        transparent: true,
        opacity: frontOpacity,
        alphaTest: 0.02,
        depthWrite: false,
        side: THREE.FrontSide,
        toneMapped: false,
      }),
    [texture]
  );

  const backMaterial = useMemo(
    () =>
      new THREE.MeshBasicMaterial({
        map: backTexture,
        transparent: true,
        opacity: backOpacity,
        alphaTest: 0.02,
        depthWrite: false,
        side: THREE.FrontSide,
        toneMapped: false,
      }),
    [backTexture]
  );

  useEffect(() => {
    sideMaterial.opacity = sideOpacity;
    sideMaterial.needsUpdate = true;
  }, [sideMaterial, sideOpacity]);

  useEffect(() => {
    frontMaterial.opacity = frontOpacity;
    frontMaterial.needsUpdate = true;
  }, [frontMaterial, frontOpacity]);

  useEffect(() => {
    backMaterial.opacity = backOpacity;
    backMaterial.needsUpdate = true;
  }, [backMaterial, backOpacity]);

  useEffect(
    () => () => {
      capMaterial.dispose();
      sideMaterial.dispose();
      frontMaterial.dispose();
      backMaterial.dispose();
      backTexture.dispose();
    },
    [capMaterial, sideMaterial, frontMaterial, backMaterial, backTexture]
  );

  const fitScale = Math.min(
    (viewport.width * 0.90) / QPUG_WIDTH,
    (viewport.height * 0.82) / QPUG_HEIGHT
  );

  useFrame(({ clock }) => {
    if (!group.current) return;

    if (start.current == null) start.current = clock.elapsedTime;

    const seconds = duration / 1000;
    let t = (clock.elapsedTime - start.current) / seconds;

    if (loop) {
      t = t % 1;
      finished.current = false;
    } else {
      t = Math.min(t, 1);
    }

    // Face-on entrance, short readable hold, then a fast true-3D spin that
    // grows past the camera so the player appears to cross the logo.
    const entry = smoothstep(clamp01(t / 0.13));
    const spin = smoothstep(clamp01((t - 0.55) / 0.45));
    const yDeg = 360 * spin;
    const xDeg = 12 * spin;
    const zDeg = 7 * spin;

    group.current.rotation.set(
      THREE.MathUtils.degToRad(xDeg),
      THREE.MathUtils.degToRad(yDeg),
      THREE.MathUtils.degToRad(zDeg)
    );

    const entryScale = THREE.MathUtils.lerp(0.86, 1, entry);
    const flyThroughScale = THREE.MathUtils.lerp(1, 7.5, spin * spin);
    const s = fitScale * scale * entryScale * flyThroughScale;
    group.current.scale.setScalar(s);

    // WebGL fade: update materials, never CSS opacity on a preserve-3d parent.
    let fade = 1;
    if (t < 0.1) fade = smoothstep(t / 0.1);
    if (t > 0.94) fade = smoothstep((1 - t) / 0.06);

    frontMaterial.opacity = frontOpacity * fade;
    backMaterial.opacity = backOpacity * fade;
    sideMaterial.opacity = sideOpacity * fade;

    if (!loop && t >= 1 && !finished.current) {
      finished.current = true;
      onDone?.();
    }
  });

  return (
    <group ref={group}>
      {/* True extruded side walls */}
      <mesh geometry={geometry} material={[capMaterial, sideMaterial]} />

      {/* Exact original PNG on the front cap */}
      <mesh position={[0, 0, depth / 2 + bevel + 0.012]} renderOrder={3}>
        <planeGeometry args={[QPUG_WIDTH, QPUG_HEIGHT]} />
        <primitive object={frontMaterial} attach="material" />
      </mesh>

      {/* Same PNG on the rear cap. Rotated so it reads correctly from behind. */}
      <mesh
        position={[0, 0, -(depth / 2 + bevel + 0.012)]}
        rotation={[0, Math.PI, 0]}
        renderOrder={2}
      >
        <planeGeometry args={[QPUG_WIDTH, QPUG_HEIGHT]} />
        <primitive object={backMaterial} attach="material" />
      </mesh>
    </group>
  );
}

export default function Questions3DOverlay({
  visible = true,
  textureUrl = "/assets/qpug-flat.png",
  duration = LEPERS_ROUND_ANNOUNCEMENT_MS,
  depth = 0.72,
  bevel = 0.035,
  frontOpacity = 0.95,
  backOpacity = 0.27,
  sideOpacity = 0.31,
  scale = 1,
  loop = false,
  onDone,
  className = "",
}) {
  useEffect(() => {
    if (typeof Image === "undefined") return;
    const image = new Image();
    image.decoding = "async";
    image.src = textureUrl;
  }, [textureUrl]);

  if (!visible) return null;

  return (
    <div className={`qpug-real3d-overlay ${className}`} aria-hidden="true">
      <Canvas
        dpr={[1, 1.5]}
        camera={{ position: [0, 0, 18], fov: 34, near: 0.1, far: 100 }}
        gl={{
          alpha: true,
          antialias: true,
          powerPreference: "high-performance",
        }}
        onCreated={({ gl }) => {
          gl.setClearColor(0x000000, 0);
        }}
      >
        <ambientLight intensity={1.0} />
        <directionalLight position={[4, 5, 8]} intensity={2.2} />
        <directionalLight position={[-5, -1, 4]} intensity={0.8} />

        <LogoMesh
          textureUrl={textureUrl}
          duration={duration}
          depth={depth}
          bevel={bevel}
          frontOpacity={frontOpacity}
          backOpacity={backOpacity}
          sideOpacity={sideOpacity}
          scale={scale}
          loop={loop}
          onDone={onDone}
        />
      </Canvas>
    </div>
  );
}
