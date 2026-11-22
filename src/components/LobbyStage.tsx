import { useEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { DRACOLoader } from 'three/examples/jsm/loaders/DRACOLoader.js';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { LOBBY_THEMES } from '../game/lobbyThemes';
import { simState } from '../game/store';

export const lobbyStage = { x: 262, y: 11.8, z: -178, yaw: 1.72 };

const COMPANION_PADS: [number, number, number][] = [
  [-2.75, 0.02, -0.72],
  [2.75, 0.02, -0.72],
];

const HERO_CAR_CONFIGS = [
  { url: '/models/ferrari.glb', scale: 1.08, rotY: Math.PI, isFerrari: true },
  { url: '/models/gt3_car.glb', scale: 1.06, rotY: 0, isFerrari: false },
  { url: '/models/wedge_coupe.glb', scale: 1.1, rotY: 0, isFerrari: false },
  { url: '/models/muscle_car.glb', scale: 1.08, rotY: 0, isFerrari: false },
  { url: '/models/stretch_limo.glb', scale: 0.92, rotY: 0, isFerrari: false },
] as const;

const PIER_PILINGS: [number, number][] = [
  [-7.8, -5.2],
  [0, -5.2],
  [7.8, -5.2],
  [-7.8, 3.8],
  [0, 3.8],
  [7.8, 3.8],
];

function groundModel(model: THREE.Object3D, scale: number, rotY: number) {
  model.scale.setScalar(scale);
  model.rotation.set(0, rotY, 0);
  model.position.set(0, 0, 0);
  model.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(model);
  if (!box.isEmpty()) {
    const center = box.getCenter(new THREE.Vector3());
    model.position.x = -center.x;
    model.position.z = -center.z;
    model.position.y = -box.min.y;
    model.updateMatrixWorld(true);
  }
}

function createHologramSkirtMaterial(): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    side: THREE.DoubleSide,
    uniforms: {
      uColor: { value: new THREE.Color('#38bdf8') },
      uOpacity: { value: 0.14 },
      uTime: { value: 0 },
    },
    vertexShader: `
      varying vec2 vUv;
      varying vec3 vNormalView;
      varying vec3 vViewPos;
      void main() {
        vUv = uv;
        vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
        vViewPos = -mvPosition.xyz;
        vNormalView = normalize(normalMatrix * normal);
        gl_Position = projectionMatrix * mvPosition;
      }
    `,
    fragmentShader: `
      uniform vec3 uColor;
      uniform float uOpacity;
      uniform float uTime;
      varying vec2 vUv;
      varying vec3 vNormalView;
      varying vec3 vViewPos;
      void main() {
        float verticalFade = pow(1.0 - clamp(vUv.y, 0.0, 1.0), 2.8);
        float scan = 0.88 + 0.12 * sin(vUv.y * 22.0 - uTime * 2.8);
        vec3 viewDir = normalize(vViewPos);
        float rim = 0.45 + 0.55 * (1.0 - abs(dot(normalize(vNormalView), viewDir)));
        float alpha = verticalFade * scan * rim * uOpacity;
        gl_FragColor = vec4(uColor * (1.05 + verticalFade * 0.35), alpha);
      }
    `,
  });
}

export function LobbyStage() {
  const stage = useRef<THREE.Group>(null);
  const keyLightRef = useRef<THREE.PointLight>(null);
  const rimLightRef = useRef<THREE.PointLight>(null);
  const podiumUpLightRef = useRef<THREE.PointLight>(null);
  const carAccentLightRef = useRef<THREE.PointLight>(null);
  const carMountRef = useRef<THREE.Group>(null);
  const palmMountRef = useRef<THREE.Group>(null);

  const carWrappersRef = useRef<(THREE.Group | null)[]>([]);
  const ferrariTailMatRef = useRef<THREE.MeshStandardMaterial | null>(null);

  const deckMatRef = useRef<THREE.MeshStandardMaterial>(null);
  const deckSlabMatRef = useRef<THREE.MeshStandardMaterial>(null);
  const padGlowMatRef = useRef<THREE.MeshStandardMaterial>(null);
  const centerDiscMatRef = useRef<THREE.MeshStandardMaterial>(null);
  const companionRimMatRef = useRef<THREE.MeshStandardMaterial>(null);
  const balustradeLedMatRef = useRef<THREE.MeshStandardMaterial>(null);

  const holoMat = useMemo(() => createHologramSkirtMaterial(), []);
  const targetColor = useMemo(() => new THREE.Color(), []);

  useEffect(() => {
    let disposed = false;
    const dracoLoader = new DRACOLoader();
    dracoLoader.setDecoderPath('/draco/');
    const gltfLoader = new GLTFLoader();
    gltfLoader.setDRACOLoader(dracoLoader);

    const sharedCarMat = new THREE.MeshStandardMaterial({
      vertexColors: true,
      roughness: 0.18,
      metalness: 0.42,
      envMapIntensity: 1.45,
    });

    const createdMaterials: THREE.Material[] = [sharedCarMat];

    HERO_CAR_CONFIGS.forEach((cfg, idx) => {
      gltfLoader.load(cfg.url, (gltf) => {
        if (disposed || !carMountRef.current) return;
        const model = gltf.scene;

        if (cfg.isFerrari) {
          const bodyMat = new THREE.MeshStandardMaterial({
            color: 0xd90429,
            metalness: 0.84,
            roughness: 0.15,
            envMapIntensity: 1.5,
          });
          const detailsMat = new THREE.MeshStandardMaterial({
            color: 0xf1f5f9,
            metalness: 0.92,
            roughness: 0.16,
          });
          const glassMat = new THREE.MeshStandardMaterial({
            color: 0x0f172a,
            metalness: 0.9,
            roughness: 0.06,
            transparent: true,
            opacity: 0.72,
          });
          const brakeMat = new THREE.MeshStandardMaterial({
            color: 0xef4444,
            emissive: 0xef4444,
            emissiveIntensity: 2.2,
            roughness: 0.18,
          });
          ferrariTailMatRef.current = brakeMat;
          createdMaterials.push(bodyMat, detailsMat, glassMat, brakeMat);

          model.traverse((child) => {
            if ((child as THREE.Mesh).isMesh) {
              const mesh = child as THREE.Mesh;
              mesh.castShadow = true;
              mesh.receiveShadow = true;
              const n = mesh.name.toLowerCase();
              if (n === 'body') mesh.material = bodyMat;
              else if (n === 'details' || n === 'metal' || n === 'chrome' || n.startsWith('rim_')) {
                mesh.material = detailsMat;
              } else if (n === 'glass') mesh.material = glassMat;
              else if (n === 'lights_red') mesh.material = brakeMat;
            }
          });
        } else {
          model.traverse((child) => {
            if ((child as THREE.Mesh).isMesh) {
              const mesh = child as THREE.Mesh;
              mesh.castShadow = true;
              mesh.receiveShadow = true;
              mesh.material = sharedCarMat;
            }
          });
        }

        groundModel(model, cfg.scale, cfg.rotY);
        const wrapper = new THREE.Group();
        wrapper.add(model);
        wrapper.visible = (simState.activeCarIdx ?? 0) === idx;
        carMountRef.current.add(wrapper);
        carWrappersRef.current[idx] = wrapper;
      });
    });

    // Flanking real palm trees at terrace ends
    gltfLoader.load('/models/palm_tree.glb', (gltf) => {
      if (disposed || !palmMountRef.current) return;
      const placements: { pos: [number, number, number]; rot: number; scale: number }[] = [
        { pos: [-8.9, 0.72, -5.3], rot: 0.5, scale: 1.05 },
        { pos: [8.9, 0.72, -5.3], rot: -1.1, scale: 1.12 },
      ];
      for (const p of placements) {
        const clone = gltf.scene.clone(true);
        groundModel(clone, p.scale, p.rot);
        clone.position.set(...p.pos);
        palmMountRef.current.add(clone);
      }
    });

    return () => {
      disposed = true;
      dracoLoader.dispose();
      holoMat.dispose();
      createdMaterials.forEach((m) => m.dispose());
    };
  }, [holoMat]);

  useFrame(({ clock }, rawDelta) => {
    if (!stage.current) return;
    stage.current.visible = simState.startMenuOpen;
    if (!simState.startMenuOpen) return;

    const dt = Math.min(0.05, rawDelta);
    const lerpAlpha = 1 - Math.exp(-6.0 * dt);
    const t = clock.elapsedTime;
    const theme = LOBBY_THEMES[simState.lobbyTheme] ?? LOBBY_THEMES.SUNLIT_RIVIERA;
    const pulse = 0.5 + 0.5 * Math.sin(t * 2.2);

    const activeCarIdx = simState.activeCarIdx ?? 0;
    carWrappersRef.current.forEach((w, idx) => {
      if (w) w.visible = idx === activeCarIdx;
    });
    if (ferrariTailMatRef.current) {
      ferrariTailMatRef.current.emissiveIntensity = theme.carLightsOn ? 4.2 : 1.3;
    }

    if (keyLightRef.current) {
      targetColor.set(theme.keyLightColor);
      keyLightRef.current.color.lerp(targetColor, lerpAlpha);
      keyLightRef.current.intensity = THREE.MathUtils.lerp(
        keyLightRef.current.intensity,
        theme.keyLightIntensity,
        lerpAlpha
      );
    }
    if (rimLightRef.current) {
      targetColor.set(theme.rimLightColor);
      rimLightRef.current.color.lerp(targetColor, lerpAlpha);
      rimLightRef.current.intensity = THREE.MathUtils.lerp(
        rimLightRef.current.intensity,
        theme.rimLightIntensity,
        lerpAlpha
      );
    }
    if (podiumUpLightRef.current) {
      targetColor.set(theme.padGlowColor);
      podiumUpLightRef.current.color.lerp(targetColor, lerpAlpha);
      const desired = (theme.carLightsOn ? 2.6 : 1.5) + pulse * 0.35;
      podiumUpLightRef.current.intensity = THREE.MathUtils.lerp(
        podiumUpLightRef.current.intensity,
        desired,
        lerpAlpha
      );
    }
    if (carAccentLightRef.current) {
      targetColor.set(theme.terraceAccentColor);
      carAccentLightRef.current.color.lerp(targetColor, lerpAlpha);
      carAccentLightRef.current.intensity = THREE.MathUtils.lerp(
        carAccentLightRef.current.intensity,
        theme.carLightsOn ? 6.5 : 1.5,
        lerpAlpha
      );
    }

    if (deckMatRef.current) {
      targetColor.set(theme.terraceDeckColor);
      deckMatRef.current.color.lerp(targetColor, lerpAlpha);
    }
    if (deckSlabMatRef.current) {
      targetColor.set(theme.terraceDeckColor).multiplyScalar(0.84);
      deckSlabMatRef.current.color.lerp(targetColor, lerpAlpha);
    }

    if (padGlowMatRef.current) {
      targetColor.set(theme.padGlowColor);
      padGlowMatRef.current.color.lerp(targetColor, lerpAlpha);
      padGlowMatRef.current.emissive.lerp(targetColor, lerpAlpha);
      padGlowMatRef.current.emissiveIntensity = THREE.MathUtils.lerp(
        padGlowMatRef.current.emissiveIntensity,
        (theme.carLightsOn ? 2.4 : 1.7) + pulse * 0.4,
        lerpAlpha * 1.4
      );
    }
    if (centerDiscMatRef.current) {
      targetColor.set(theme.padGlowColor);
      centerDiscMatRef.current.emissive.lerp(targetColor, lerpAlpha);
      centerDiscMatRef.current.emissiveIntensity = THREE.MathUtils.lerp(
        centerDiscMatRef.current.emissiveIntensity,
        theme.carLightsOn ? 0.30 : 0.16,
        lerpAlpha
      );
    }
    if (companionRimMatRef.current) {
      targetColor.set(theme.padGlowColor);
      companionRimMatRef.current.emissive.lerp(targetColor, lerpAlpha);
      companionRimMatRef.current.emissiveIntensity = THREE.MathUtils.lerp(
        companionRimMatRef.current.emissiveIntensity,
        theme.carLightsOn ? 0.42 : 0.18,
        lerpAlpha
      );
    }
    if (balustradeLedMatRef.current) {
      targetColor.set(theme.terraceAccentColor);
      balustradeLedMatRef.current.emissive.lerp(targetColor, lerpAlpha);
      balustradeLedMatRef.current.emissiveIntensity = THREE.MathUtils.lerp(
        balustradeLedMatRef.current.emissiveIntensity,
        theme.carLightsOn ? 1.45 : 0.28,
        lerpAlpha
      );
    }

    holoMat.uniforms.uColor.value.lerp(targetColor.set(theme.padGlowColor), lerpAlpha);
    holoMat.uniforms.uOpacity.value = THREE.MathUtils.lerp(
      holoMat.uniforms.uOpacity.value,
      theme.carLightsOn ? 0.18 : 0.10,
      lerpAlpha
    );
    holoMat.uniforms.uTime.value = t;
  });

  return (
    <group
      ref={stage}
      position={[lobbyStage.x, lobbyStage.y, lobbyStage.z]}
      rotation={[0, lobbyStage.yaw, 0]}
      visible={false}
    >
      {/* Concrete Pier Caisson Supports into Ocean Water */}
      {PIER_PILINGS.map(([px, pz], idx) => (
        <mesh key={idx} position={[px, -9.2, pz]} castShadow receiveShadow>
          <cylinderGeometry args={[0.48, 0.56, 18.0, 14]} />
          <meshStandardMaterial color="#6e7780" roughness={0.84} metalness={0.12} />
        </mesh>
      ))}

      {/* Main Coastal Pier Architectural Slab */}
      <mesh position={[0, -0.34, 0]} castShadow receiveShadow>
        <boxGeometry args={[21.4, 0.62, 14.4]} />
        <meshStandardMaterial ref={deckSlabMatRef} color="#9aa3ad" roughness={0.72} metalness={0.12} />
      </mesh>
      {Array.from({ length: 14 }, (_, i) => (
        <mesh key={i} position={[(i - 6.5) * 1.52, -0.016, 0]} receiveShadow>
          <boxGeometry args={[1.49, 0.033, 14.0]} />
          <meshStandardMaterial
            ref={i === 7 ? deckMatRef : undefined}
            color={i % 3 === 0 ? '#b7c1c9' : '#aab4bc'}
            roughness={0.82}
            metalness={0.08}
          />
        </mesh>
      ))}

      {/* Hero Center Podium — Sleek Brushed Metallic Center + Crisp Cyan Plasma Ring Halo */}
      <group position={[0, 0, 0]}>
        <mesh position={[0, 0.02, 0]} receiveShadow castShadow>
          <cylinderGeometry args={[1.92, 2.02, 0.068, 64]} />
          <meshStandardMaterial color="#1b2633" metalness={0.78} roughness={0.28} />
        </mesh>
        <mesh position={[0, 0.056, 0]} receiveShadow>
          <cylinderGeometry args={[1.64, 1.66, 0.02, 64]} />
          <meshStandardMaterial
            ref={centerDiscMatRef}
            color="#152330"
            emissive="#38bdf8"
            emissiveIntensity={0.18}
            roughness={0.34}
            metalness={0.62}
          />
        </mesh>
        <mesh rotation={[Math.PI / 2, 0, 0]} position={[0, 0.066, 0]}>
          <torusGeometry args={[1.68, 0.044, 14, 72]} />
          <meshStandardMaterial
            ref={padGlowMatRef}
            color="#bae6fd"
            emissive="#38bdf8"
            emissiveIntensity={1.9}
            roughness={0.16}
            metalness={0.22}
          />
        </mesh>
        <mesh position={[0, 0.56, 0]} material={holoMat} renderOrder={4}>
          <cylinderGeometry args={[1.68, 1.72, 1.0, 48, 1, true]} />
        </mesh>
      </group>

      {/* Two Matte Dark-Metallic Companion Pads */}
      {COMPANION_PADS.map((pos, idx) => (
        <group key={idx} position={pos}>
          <mesh receiveShadow castShadow>
            <cylinderGeometry args={[1.38, 1.44, 0.055, 48]} />
            <meshStandardMaterial color="#18222e" metalness={0.74} roughness={0.34} />
          </mesh>
          <mesh rotation={[Math.PI / 2, 0, 0]} position={[0, 0.032, 0]}>
            <torusGeometry args={[1.28, 0.022, 10, 48]} />
            <meshStandardMaterial
              ref={idx === 0 ? companionRimMatRef : undefined}
              color="#475569"
              emissive="#38bdf8"
              emissiveIntensity={0.22}
              metalness={0.45}
              roughness={0.35}
            />
          </mesh>
        </group>
      ))}

      {/* Real 3D GLB Supercar Showcase (Three-Quarter Hero Angle on Terrace) */}
      <group ref={carMountRef} position={[2.95, 0.02, -3.35]} rotation={[0, -2.26, 0]} />

      {/* Coastal Glass Balustrade & Subtle LED Strip */}
      <mesh position={[0, 0.94, -6.55]} castShadow>
        <boxGeometry args={[20.8, 0.09, 0.14]} />
        <meshStandardMaterial color="#334155" metalness={0.68} roughness={0.32} />
      </mesh>
      <mesh position={[0, 0.04, -6.48]}>
        <boxGeometry args={[20.4, 0.05, 0.07]} />
        <meshStandardMaterial
          ref={balustradeLedMatRef}
          color="#bae6fd"
          emissive="#38bdf8"
          emissiveIntensity={0.35}
          roughness={0.22}
        />
      </mesh>
      {Array.from({ length: 9 }, (_, i) => (
        <group key={i} position={[(i - 4) * 2.48, 0, -6.55]}>
          <mesh position={[0, 0.47, 0]} castShadow>
            <boxGeometry args={[0.09, 0.94, 0.14]} />
            <meshStandardMaterial color="#334155" metalness={0.55} roughness={0.38} />
          </mesh>
          {i < 8 && (
            <mesh position={[1.24, 0.45, 0]}>
              <boxGeometry args={[2.38, 0.78, 0.025]} />
              <meshPhysicalMaterial
                color="#a5d8e8"
                transparent
                opacity={0.14}
                roughness={0.12}
                metalness={0.12}
                depthWrite={false}
              />
            </mesh>
          )}
        </group>
      ))}

      {/* Flanking Terrace Planters + Mounted Real Palm Trees */}
      {[-8.9, 8.9].map((x) => (
        <group key={x} position={[x, 0, -5.3]}>
          <mesh position={[0, 0.36, 0]} castShadow receiveShadow>
            <boxGeometry args={[2.2, 0.72, 1.8]} />
            <meshStandardMaterial color="#948b7e" roughness={0.82} />
          </mesh>
          {Array.from({ length: 5 }, (_, i) => (
            <mesh
              key={i}
              position={[(i - 2) * 0.35, 0.78 + (i % 2) * 0.1, Math.sin(i * 2.4) * 0.22]}
              rotation={[0, i * 1.1, 0.12]}
              castShadow
            >
              <icosahedronGeometry args={[0.28 + (i % 2) * 0.05, 1]} />
              <meshStandardMaterial color={i % 2 === 0 ? '#2f5e48' : '#4a7a52'} roughness={0.9} />
            </mesh>
          ))}
        </group>
      ))}
      <group ref={palmMountRef} />

      {/* Theme-Driven Stage Key, Rim & Subtle Podium Lights */}
      <pointLight
        ref={keyLightRef}
        position={[2.8, 3.6, 3.2]}
        color="#fff1d8"
        intensity={14}
        distance={13}
        decay={2}
      />
      <pointLight
        ref={rimLightRef}
        position={[-2.4, 2.5, -3.4]}
        color="#bae6fd"
        intensity={10}
        distance={13}
        decay={2}
      />
      <pointLight
        ref={podiumUpLightRef}
        position={[0, 0.32, 0.25]}
        color="#38bdf8"
        intensity={1.6}
        distance={4.5}
        decay={2}
      />
      <pointLight
        ref={carAccentLightRef}
        position={[3.0, 1.9, -2.9]}
        color="#38bdf8"
        intensity={2.0}
        distance={9}
        decay={2}
      />
    </group>
  );
}
