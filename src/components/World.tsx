import React, { useEffect, useMemo, useRef, useState } from 'react';
import * as THREE from 'three';
import { useFrame } from '@react-three/fiber';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import {
  skyVertexShader,
  skyFragmentShader,
  waterVertexShader,
  waterFragmentShader,
  terrainVertexShader,
  terrainFragmentShader,
} from './Shaders';
import {
  createSkyscraperPBR,
  createLimestonePBR,
  createNormalMapFromCanvas,
  createBarkPBR,
} from './Textures';
import { VegasLandmarks } from './Landmarks';
import { getTerrainHeight, LANDMARKS } from '../game/worldMath';
import { simState } from '../game/store';

export { VegasLandmarks };

const SUN_DIR = new THREE.Vector3(0.55, 0.48, -0.68).normalize();

export function SkyDome() {
  const uniforms = useMemo(
    () => ({
      uTime: { value: 0 },
      uZenith: { value: new THREE.Color('#0284c7') },
      uHorizon: { value: new THREE.Color('#bae6fd') },
      uSunColor: { value: new THREE.Color('#fef08a') },
      uSunDir: { value: SUN_DIR.clone() },
    }),
    []
  );

  useFrame((state) => {
    uniforms.uTime.value = state.clock.elapsedTime;
    if (simState.roulette === 'BLACK') {
      uniforms.uZenith.value.lerp(new THREE.Color('#0369a1'), 0.04);
      uniforms.uHorizon.value.lerp(new THREE.Color('#7dd3fc'), 0.04);
    } else if (simState.roulette === 'RED') {
      uniforms.uZenith.value.lerp(new THREE.Color('#9a3412'), 0.04);
      uniforms.uHorizon.value.lerp(new THREE.Color('#fdba74'), 0.04);
    } else {
      uniforms.uZenith.value.lerp(new THREE.Color('#0284c7'), 0.04);
      uniforms.uHorizon.value.lerp(new THREE.Color('#bae6fd'), 0.04);
    }
  });

  return (
    <mesh scale={[-1, 1, 1]}>
      <sphereGeometry args={[1400, 32, 20]} />
      <shaderMaterial
        vertexShader={skyVertexShader}
        fragmentShader={skyFragmentShader}
        uniforms={uniforms}
        side={THREE.BackSide}
        depthWrite={false}
      />
    </mesh>
  );
}

export function StylizedOcean() {
  const meshRef = useRef<THREE.Mesh>(null);
  const uniforms = useMemo(
    () => ({
      uTime: { value: 0 },
      uShallow: { value: new THREE.Color('#06b6d4') },
      uDeep: { value: new THREE.Color('#0369a1') },
      uFoam: { value: new THREE.Color('#f8fafc') },
      uSunDir: { value: SUN_DIR.clone() },
      uCameraPos: { value: new THREE.Vector3() },
    }),
    []
  );

  useFrame((state) => {
    uniforms.uTime.value = state.clock.elapsedTime;
    uniforms.uCameraPos.value.copy(state.camera.position);
    if (meshRef.current) {
      meshRef.current.position.y = simState.tideOffset;
    }
  });

  return (
    <mesh ref={meshRef} rotation={[-Math.PI / 2, 0, 0]} position={[0, 0, 0]}>
      <planeGeometry args={[1800, 1800, 64, 64]} />
      <shaderMaterial
        vertexShader={waterVertexShader}
        fragmentShader={waterFragmentShader}
        uniforms={uniforms}
        transparent
      />
    </mesh>
  );
}

export function IslandTerrain() {
  const uniforms = useMemo(
    () => ({
      uSunDir: { value: SUN_DIR.clone() },
      uCameraPos: { value: new THREE.Vector3() },
      uTime: { value: 0 },
    }),
    []
  );

  const geometry = useMemo(() => {
    const geo = new THREE.PlaneGeometry(660, 660, 192, 192);
    geo.rotateX(-Math.PI / 2);
    const pos = geo.attributes.position;

    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i);
      const z = pos.getZ(i);
      pos.setY(i, getTerrainHeight(x, z));
    }

    geo.computeVertexNormals();
    return geo;
  }, []);

  useFrame((state) => {
    uniforms.uTime.value = state.clock.elapsedTime;
    uniforms.uCameraPos.value.copy(state.camera.position);
  });

  return (
    <mesh geometry={geometry} receiveShadow>
      <shaderMaterial
        vertexShader={terrainVertexShader}
        fragmentShader={terrainFragmentShader}
        uniforms={uniforms}
      />
    </mesh>
  );
}

export function LuxuryCruiseShip({
  position,
  rotationY = 0,
  scale = 1,
  name = 'MS AZUREA ODYSSEY',
  cruising = false,
  phaseOffset = 0,
}: {
  position: [number, number, number];
  rotationY?: number;
  scale?: number;
  name?: string;
  cruising?: boolean;
  phaseOffset?: number;
}) {
  const shipRef = useRef<THREE.Group>(null);
  const radarRef = useRef<THREE.Group>(null);

  useFrame((state) => {
    const t = state.clock.elapsedTime + phaseOffset;
    if (shipRef.current) {
      const heave = (simState.tideOffset ?? 0) + Math.sin(t * 1.15) * 0.24;
      const roll = Math.sin(t * 0.85) * 0.018;
      const pitch = Math.cos(t * 0.72) * 0.009;
      if (cruising) {
        const driftZ = Math.sin(t * 0.12) * 18;
        const driftX = Math.cos(t * 0.12) * 4.5;
        const headingYaw = rotationY + Math.cos(t * 0.12) * 0.08;
        shipRef.current.position.set(position[0] + driftX, position[1] + heave, position[2] + driftZ);
        shipRef.current.rotation.set(pitch, headingYaw, roll);
      } else {
        shipRef.current.position.set(position[0], position[1] + heave, position[2]);
        shipRef.current.rotation.set(pitch, rotationY, roll);
      }
    }
    if (radarRef.current) {
      radarRef.current.rotation.y = t * 2.8;
    }
  });

  const deckHeights = [3.6, 5.2, 6.8, 8.4, 10.0, 11.6];

  return (
    <group ref={shipRef} position={position} rotation={[0, rotationY, 0]} scale={scale} name={name}>
      {/* Ocean Foam Wake Halo around the 68m Mega-Hull */}
      <mesh position={[0, 0.05, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <ringGeometry args={[7.2, 10.5, 48]} />
        <meshBasicMaterial color="#e0f2fe" transparent opacity={0.28} side={THREE.DoubleSide} depthWrite={false} />
      </mesh>

      {/* Crimson Waterline Boot-Topping Stripe (#dc2626) */}
      <mesh position={[0, 0.45, 0]} castShadow receiveShadow>
        <boxGeometry args={[13.2, 0.75, 58]} />
        <meshStandardMaterial color="#dc2626" roughness={0.38} metalness={0.22} />
      </mesh>
      {/* Flared Sub-Waterline Bulbous Bow */}
      <mesh position={[0, 0.35, 32.5]} rotation={[Math.PI / 2, 0, 0]}>
        <cylinderGeometry args={[2.1, 3.2, 8.5, 16]} />
        <meshStandardMaterial color="#dc2626" roughness={0.35} metalness={0.25} />
      </mesh>

      {/* Sculpted Dark-Navy Lower Hull (#0f172a, length ~68m, beam ~13m) */}
      <mesh position={[0, 1.85, -1.5]} castShadow receiveShadow>
        <boxGeometry args={[13.0, 2.5, 55]} />
        <meshStandardMaterial color="#0f172a" roughness={0.28} metalness={0.48} />
      </mesh>
      {/* Tapered Forward Bow Hull Wedge */}
      <mesh position={[0, 1.95, 29.5]} rotation={[Math.PI / 2, 0, 0]} castShadow receiveShadow>
        <coneGeometry args={[6.6, 11.5, 4]} />
        <meshStandardMaterial color="#0f172a" roughness={0.28} metalness={0.48} />
      </mesh>
      {/* Rounded Cruiser Transom Stern */}
      <mesh position={[0, 1.9, -29.0]} castShadow receiveShadow>
        <cylinderGeometry args={[6.4, 5.8, 2.5, 18]} />
        <meshStandardMaterial color="#0f172a" roughness={0.28} metalness={0.48} />
      </mesh>
      {/* Gold Hull Pinstripe Shear Line */}
      <mesh position={[0, 2.95, 0]}>
        <boxGeometry args={[13.25, 0.16, 56.5]} />
        <meshStandardMaterial color="#fbbf24" emissive="#f59e0b" emissiveIntensity={0.65} metalness={0.85} roughness={0.2} />
      </mesh>

      {/* 6 Stepped White Alabaster Superstructure Promenade Decks (#f8fafc) */}
      {deckHeights.map((dy, idx) => {
        const deckLen = 52 - idx * 3.1;
        const deckBeam = 12.4 - idx * 0.28;
        const zOffset = -1.5 - idx * 0.7;
        return (
          <group key={idx} position={[0, dy, zOffset]}>
            {/* White Alabaster Structural Deck Slab */}
            <mesh castShadow receiveShadow>
              <boxGeometry args={[deckBeam, 1.38, deckLen]} />
              <meshStandardMaterial color="#f8fafc" roughness={0.25} metalness={0.15} />
            </mesh>
            {/* Continuous Wrap-Around Tinted Glass Balcony Ribbons (#0284c7, emissive #38bdf8) */}
            <mesh position={[0, 0.08, 0]}>
              <boxGeometry args={[deckBeam + 0.18, 0.62, deckLen - 1.2]} />
              <meshStandardMaterial
                color="#0284c7"
                emissive="#38bdf8"
                emissiveIntensity={0.65}
                roughness={0.12}
                metalness={0.65}
              />
            </mesh>
            {/* Warm Golden Cabin Lighting Strips (#fef08a) */}
            <mesh position={[0, -0.34, 0]}>
              <boxGeometry args={[deckBeam + 0.22, 0.14, deckLen - 2.0]} />
              <meshStandardMaterial
                color="#fef08a"
                emissive="#fef08a"
                emissiveIntensity={1.35}
                roughness={0.2}
              />
            </mesh>
          </group>
        );
      })}

      {/* 6 Orange Davit Lifeboats (#f97316) Hung Along Port and Starboard Flanks (3 per side) */}
      {[-1, 1].map((side) =>
        [-14, -2, 10].map((lz, lIdx) => (
          <group key={`lifeboat-${side}-${lIdx}`} position={[side * 6.65, 5.3, lz]}>
            <mesh castShadow>
              <boxGeometry args={[1.25, 0.85, 4.4]} />
              <meshStandardMaterial color="#f97316" roughness={0.3} metalness={0.2} />
            </mesh>
            <mesh position={[0, 0.48, 0]}>
              <boxGeometry args={[1.05, 0.25, 3.6]} />
              <meshStandardMaterial color="#f8fafc" roughness={0.35} />
            </mesh>
          </group>
        ))
      )}

      {/* Cantilevered Panoramic Glass Navigation Bridge Wing (#0ea5e9) near the Bow */}
      <group position={[0, 12.1, 15.5]}>
        <mesh castShadow>
          <boxGeometry args={[16.2, 1.15, 3.8]} />
          <meshStandardMaterial color="#f8fafc" roughness={0.22} metalness={0.25} />
        </mesh>
        <mesh position={[0, 0.08, 0.35]}>
          <boxGeometry args={[15.8, 0.65, 3.4]} />
          <meshStandardMaterial
            color="#0ea5e9"
            emissive="#38bdf8"
            emissiveIntensity={0.85}
            roughness={0.1}
            metalness={0.75}
          />
        </mesh>
        {/* Navigation Bridge Roof Mast & Rotating Radar Array Dome */}
        <mesh position={[0, 1.4, 0]}>
          <sphereGeometry args={[0.95, 16, 16]} />
          <meshStandardMaterial color="#f8fafc" roughness={0.2} metalness={0.3} />
        </mesh>
        <mesh position={[0, 2.8, -0.5]}>
          <cylinderGeometry args={[0.16, 0.28, 3.4, 8]} />
          <meshStandardMaterial color="#e2e8f0" metalness={0.8} roughness={0.2} />
        </mesh>
        <group ref={radarRef} position={[0, 4.4, -0.5]}>
          <mesh>
            <boxGeometry args={[3.4, 0.22, 0.42]} />
            <meshStandardMaterial color="#38bdf8" emissive="#0284c7" emissiveIntensity={1.1} />
          </mesh>
        </group>
      </group>

      {/* Deck 7 Rooftop Lido Sun Deck with Two Glowing Turquoise Swimming Pools, Cabanas & Waterslide Arch */}
      <group position={[0, 12.55, -3.5]}>
        {/* Teak & Alabaster Sun Deck Promenade Surface */}
        <mesh receiveShadow>
          <boxGeometry args={[10.4, 0.28, 34.0]} />
          <meshStandardMaterial color="#fde68a" roughness={0.62} metalness={0.08} />
        </mesh>
        {/* Forward & Aft Glowing Turquoise Lido Swimming Pools (#06b6d4) */}
        {[-6.5, 5.5].map((pz, pIdx) => (
          <group key={`pool-${pIdx}`} position={[0, 0.16, pz]}>
            <mesh>
              <boxGeometry args={[5.4, 0.14, 7.6]} />
              <meshStandardMaterial
                color="#06b6d4"
                emissive="#22d3ee"
                emissiveIntensity={1.15}
                roughness={0.08}
                metalness={0.3}
              />
            </mesh>
            <mesh position={[0, -0.03, 0]}>
              <boxGeometry args={[6.1, 0.1, 8.3]} />
              <meshStandardMaterial color="#f8fafc" roughness={0.3} />
            </mesh>
          </group>
        ))}
        {/* Luxury Poolside Lounge Cabanas */}
        {[-4.0, 4.0].map((cx) =>
          [-12, -6.5, -1, 5.5, 11].map((cz, cIdx) => (
            <mesh key={`cabana-${cx}-${cIdx}`} position={[cx, 0.55, cz]} castShadow>
              <boxGeometry args={[1.35, 0.75, 1.85]} />
              <meshStandardMaterial color="#f8fafc" roughness={0.35} />
            </mesh>
          ))
        )}
        {/* Sculpted Waterslide Arch Coiling Over Stern Lido Deck */}
        <mesh position={[0, 2.2, -13.5]} rotation={[0.25, 0, 0]}>
          <torusGeometry args={[3.2, 0.42, 10, 24, Math.PI]} />
          <meshStandardMaterial color="#f97316" emissive="#fb923c" emissiveIntensity={0.45} roughness={0.22} />
        </mesh>
      </group>

      {/* Twin Raked Royal-Blue & Gold Cruise Funnels (#1d4ed8 with #fbbf24 gold bands) */}
      {[-3.2, -11.8].map((fz, fIdx) => (
        <group key={`funnel-${fIdx}`} position={[0, 14.8, fz]} rotation={[-0.24, 0, 0]}>
          <mesh castShadow>
            <cylinderGeometry args={[1.35, 1.85, 5.2, 16]} />
            <meshStandardMaterial color="#1d4ed8" roughness={0.25} metalness={0.45} />
          </mesh>
          {/* Gold Sovereign Crown Band */}
          <mesh position={[0, 1.1, 0]}>
            <cylinderGeometry args={[1.48, 1.56, 0.68, 16]} />
            <meshStandardMaterial color="#fbbf24" emissive="#f59e0b" emissiveIntensity={0.75} metalness={0.88} roughness={0.18} />
          </mesh>
          {/* Exhaust Wing Fin Cap */}
          <mesh position={[0, 2.55, -0.35]}>
            <boxGeometry args={[3.8, 0.35, 2.4]} />
            <meshStandardMaterial color="#0f172a" metalness={0.65} roughness={0.25} />
          </mesh>
        </group>
      ))}
    </group>
  );
}

export function VegasStripDetails() {
  const fountainRef = useRef<THREE.Group>(null);
  const arcJetsRef = useRef<THREE.Group>(null);
  const mistRef = useRef<THREE.Mesh>(null);
  const checkpointGateRef = useRef<THREE.Group>(null);
  const chevronRef = useRef<THREE.Group>(null);
  const gatePulseRef = useRef<THREE.Mesh>(null);
  const stormWallRef = useRef<THREE.Mesh>(null);
  const stormRingRef = useRef<THREE.Mesh>(null);
  const lootCratesGroupRef = useRef<THREE.Group>(null);
  const marinaGroupRef = useRef<THREE.Group>(null);

  const [streetLightModel, setStreetLightModel] = useState<THREE.Group | null>(null);
  const [palmModel, setPalmModel] = useState<THREE.Group | null>(null);
  const [chileanPalmModel, setChileanPalmModel] = useState<THREE.Group | null>(null);
  const [lootCrateModel, setLootCrateModel] = useState<THREE.Group | null>(null);
  const [ammoCrateModel, setAmmoCrateModel] = useState<THREE.Group | null>(null);
  const [sloopYachtModel, setSloopYachtModel] = useState<THREE.Group | null>(null);
  const [galleonShipModel, setGalleonShipModel] = useState<THREE.Group | null>(null);
  const [caiqueBoatModel, setCaiqueBoatModel] = useState<THREE.Group | null>(null);

  useEffect(() => {
    const loader = new GLTFLoader();
    const sharedEnvMat = new THREE.MeshStandardMaterial({
      vertexColors: true,
      roughness: 0.65,
      metalness: 0.1,
    });
    const sharedCrateMat = new THREE.MeshStandardMaterial({
      vertexColors: true,
      roughness: 0.35,
      metalness: 0.45,
    });
    loader.load('/models/street_light.glb', (gltf) => {
      gltf.scene.traverse((child) => {
        if ((child as THREE.Mesh).isMesh) {
          (child as THREE.Mesh).material = sharedEnvMat;
        }
      });
      setStreetLightModel(gltf.scene);
    });
    loader.load('/models/palm_tree.glb', (gltf) => {
      gltf.scene.traverse((child) => {
        if ((child as THREE.Mesh).isMesh) {
          (child as THREE.Mesh).material = sharedEnvMat;
        }
      });
      setPalmModel(gltf.scene);
    });
    loader.load('/models/chilean_palm.glb', (gltf) => {
      gltf.scene.traverse((child) => {
        if ((child as THREE.Mesh).isMesh) {
          (child as THREE.Mesh).material = sharedEnvMat;
        }
      });
      setChileanPalmModel(gltf.scene);
    });
    loader.load('/models/loot_crate.glb', (gltf) => {
      gltf.scene.traverse((child) => {
        if ((child as THREE.Mesh).isMesh) {
          (child as THREE.Mesh).material = sharedCrateMat;
        }
      });
      setLootCrateModel(gltf.scene);
    });
    loader.load('/models/ammo_crate.glb', (gltf) => {
      gltf.scene.traverse((child) => {
        if ((child as THREE.Mesh).isMesh) {
          (child as THREE.Mesh).material = sharedCrateMat;
        }
      });
      setAmmoCrateModel(gltf.scene);
    });
    loader.load('/models/sloop_yacht.glb', (gltf) => {
      setSloopYachtModel(gltf.scene);
    });
    loader.load('/models/galleon_ship.glb', (gltf) => {
      setGalleonShipModel(gltf.scene);
    });
    loader.load('/models/caique_boat.glb', (gltf) => {
      setCaiqueBoatModel(gltf.scene);
    });
  }, []);

  const limestoneTex = useMemo(() => createLimestonePBR(), []);
  const limestoneNormal = useMemo(
    () => createNormalMapFromCanvas(limestoneTex.image as HTMLCanvasElement, 2.5, 3, 3),
    [limestoneTex]
  );

  // Cloned real 3D GLB cobra-head street lamps every 36m along the Strip curbs
  const streetLampClones = useMemo(() => {
    if (!streetLightModel) return [];
    const list: { key: string; obj: THREE.Group; pos: [number, number, number]; rotY: number }[] = [];
    for (let z = -108; z <= 108; z += 36) {
      for (const x of [-22.5, 22.5]) {
        const y = getTerrainHeight(x, z);
        const clone = streetLightModel.clone(true);
        list.push({
          key: `lamp-${x}-${z}`,
          obj: clone,
          pos: [x, y, z],
          rotY: x < 0 ? Math.PI / 2 : -Math.PI / 2,
        });
      }
    }
    return list;
  }, [streetLightModel]);

  // Cloned real 3D GLB botanical palm trees along the Strip boulevard and resort plazas
  const stripPalmClones = useMemo(() => {
    if (!palmModel && !chileanPalmModel) return [];
    const list: { key: string; obj: THREE.Group; pos: [number, number, number]; rotY: number; scale: number }[] = [];

    // Strip Boulevard rows (x = ±23.5, z = -108..108 every 24m)
    let idx = 0;
    for (let z = -108; z <= 108; z += 24) {
      for (const x of [-23.5, 23.5]) {
        const useChilean = idx % 2 === 1 && chileanPalmModel;
        const src = useChilean ? chileanPalmModel! : (palmModel || chileanPalmModel)!;
        const y = getTerrainHeight(x, z);
        const scale = useChilean ? 0.92 + (idx % 3) * 0.08 : 1.38 + (idx % 3) * 0.12;
        list.push({
          key: `strip-palm-${x}-${z}`,
          obj: src.clone(true),
          pos: [x, y, z],
          rotY: (idx * 1.37) % (Math.PI * 2),
          scale,
        });
        idx++;
      }
    }

    // Resort Plaza palms (Bellagio Fountain perimeter, Venice Canal promenade, Luxor & Eiffel plazas)
    const plazaCoords: [number, number][] = [
      [-18, -22], [18, -22], [-18, 2], [18, 2],
      [68, -72], [-75, 22], [68, 22],
    ];
    plazaCoords.forEach(([px, pz], pIdx) => {
      const useChilean = pIdx % 2 === 0 && chileanPalmModel;
      const src = useChilean ? chileanPalmModel! : (palmModel || chileanPalmModel)!;
      const py = getTerrainHeight(px, pz);
      const scale = useChilean ? 1.02 : 1.48;
      list.push({
        key: `plaza-palm-${pIdx}`,
        obj: src.clone(true),
        pos: [px, py, pz],
        rotY: (pIdx * 2.1) % (Math.PI * 2),
        scale,
      });
    });

    return list;
  }, [palmModel, chileanPalmModel]);

  // Cloned real 3D GLB Battle Royale Supply (LOOT) & Ammo (AMMO) Crates at all 8 simState.lootCrates coordinates
  const crateClones = useMemo(() => {
    return simState.lootCrates.map((crate, idx) => {
      const src = crate.kind === 'LOOT' ? lootCrateModel : ammoCrateModel;
      const [cx, , cz] = crate.position;
      const cy = getTerrainHeight(cx, cz);
      return {
        id: crate.id,
        kind: crate.kind,
        pos: [cx, cy, cz] as [number, number, number],
        rotY: (idx * 0.85) % (Math.PI * 2),
        obj: src ? src.clone(true) : null,
      };
    });
  }, [lootCrateModel, ammoCrateModel]);

  useFrame((state) => {
    const t = state.clock.elapsedTime;
    if (fountainRef.current) {
      fountainRef.current.children.forEach((jet, i) => {
        const wave = 0.5 + 0.5 * Math.sin(t * 4.2 + i * 0.55);
        jet.scale.y = 0.55 + wave * 1.9;
        jet.position.y = 0.4 + jet.scale.y * 1.45;
      });
    }
    if (arcJetsRef.current) {
      arcJetsRef.current.children.forEach((arc, i) => {
        const pulse = 0.72 + 0.35 * Math.sin(t * 3.1 + i * 0.52);
        arc.scale.setScalar(pulse);
      });
    }
    if (mistRef.current) {
      const m = 0.92 + 0.14 * Math.sin(t * 2.4);
      mistRef.current.scale.set(m, 1, m);
    }
    if (checkpointGateRef.current) {
      const cp = simState.checkpoints[simState.activeCheckpoint] ?? simState.checkpoints[0];
      if (cp) {
        const gy = getTerrainHeight(cp.position[0], cp.position[2]);
        checkpointGateRef.current.position.set(cp.position[0], gy, cp.position[2]);
        checkpointGateRef.current.rotation.set(0, cp.yaw, 0);
      }
    }
    if (chevronRef.current) {
      chevronRef.current.position.y = 11.8 + Math.sin(t * 4.2) * 0.55;
      chevronRef.current.rotation.y = t * 2.0;
    }
    if (gatePulseRef.current) {
      const s = 0.96 + 0.08 * Math.sin(t * 5.0);
      gatePulseRef.current.scale.set(s, 1, s);
    }
    const sr = simState.stormRadius ?? 235;
    if (stormWallRef.current) {
      stormWallRef.current.scale.set(sr, 1, sr);
      stormWallRef.current.rotation.y = t * 0.06;
    }
    if (stormRingRef.current) {
      stormRingRef.current.scale.set(sr, sr, 1);
    }
    if (lootCratesGroupRef.current) {
      lootCratesGroupRef.current.children.forEach((crateGroup, idx) => {
        const node = simState.lootCrates[idx];
        if (!node) return;
        const beacon = crateGroup.getObjectByName('crate-beacon');
        const ring = crateGroup.getObjectByName('crate-ring');
        if (beacon) {
          beacon.visible = !node.opened;
        }
        if (ring) {
          ring.visible = !node.opened;
          const pulse = 0.92 + 0.12 * Math.sin(t * 4.0 + idx);
          ring.scale.set(pulse, pulse, 1);
        }
      });
    }
    if (marinaGroupRef.current) {
      marinaGroupRef.current.children.forEach((vessel, idx) => {
        vessel.position.y = (simState.tideOffset ?? 0) + 0.35 + Math.sin(t * 1.6 + idx * 1.1) * 0.16;
        vessel.rotation.z = Math.sin(t * 1.2 + idx * 0.9) * 0.025;
      });
    }
  });

  const archY = getTerrainHeight(0, 62);
  const poolY = getTerrainHeight(0, -10);

  return (
    <group>
      {/* 3D Battle Royale Shrinking Storm Wall & Ground Storm Ring */}
      <mesh
        ref={stormWallRef}
        position={[0, 75, 0]}
        scale={[simState.stormRadius, 1, simState.stormRadius]}
      >
        <cylinderGeometry args={[1, 1, 160, 36, 1, true]} />
        <meshBasicMaterial
          color="#a855f7"
          transparent
          opacity={0.12}
          side={THREE.BackSide}
          depthWrite={false}
        />
      </mesh>
      <mesh
        ref={stormRingRef}
        position={[0, 0.25, 0]}
        rotation={[-Math.PI / 2, 0, 0]}
        scale={[simState.stormRadius, simState.stormRadius, 1]}
      >
        <ringGeometry args={[0.985, 1.015, 64]} />
        <meshBasicMaterial
          color="#38bdf8"
          transparent
          opacity={0.58}
          side={THREE.DoubleSide}
          depthWrite={false}
        />
      </mesh>

      {/* 8 Real 3D .glb Battle Royale Supply & Ammo Crates */}
      <group ref={lootCratesGroupRef}>
        {crateClones.map((c) => {
          const accentColor = c.kind === 'LOOT' ? '#fbbf24' : '#38bdf8';
          return (
            <group key={c.id} position={c.pos}>
              {c.obj ? (
                <primitive object={c.obj} scale={1.65} rotation={[0, c.rotY, 0]} />
              ) : (
                <mesh position={[0, 0.55, 0]} castShadow receiveShadow>
                  <boxGeometry args={[1.4, 1.1, 1.0]} />
                  <meshStandardMaterial color={accentColor} roughness={0.35} metalness={0.45} />
                </mesh>
              )}
              <mesh
                name="crate-ring"
                position={[0, 0.14, 0]}
                rotation={[-Math.PI / 2, 0, 0]}
              >
                <ringGeometry args={[1.35, 1.85, 32]} />
                <meshBasicMaterial
                  color={accentColor}
                  transparent
                  opacity={0.62}
                  side={THREE.DoubleSide}
                  depthWrite={false}
                />
              </mesh>
              <mesh name="crate-beacon" position={[0, 26, 0]}>
                <cylinderGeometry args={[0.24, 0.68, 52, 12, 1, true]} />
                <meshBasicMaterial
                  color={accentColor}
                  transparent
                  opacity={0.22}
                  side={THREE.DoubleSide}
                  depthWrite={false}
                />
              </mesh>
            </group>
          );
        })}
      </group>

      {/* Physical Raised Granite Curb Edges bordering the GLSL Strip Boulevard */}
      {[-22.3, 22.3].map((sx) => (
        <mesh key={sx} position={[sx, getTerrainHeight(sx, 0) + 0.09, 0]} receiveShadow castShadow>
          <boxGeometry args={[0.55, 0.18, 250]} />
          <meshStandardMaterial
            map={limestoneTex}
            normalMap={limestoneNormal}
            bumpMap={limestoneTex}
            bumpScale={0.12}
            roughness={0.62}
          />
        </mesh>
      ))}

      {/* Real 3D GLB Botanical Palm Trees along the Strip Boulevard & Resort Plazas */}
      {stripPalmClones.map((item) => (
        <primitive
          key={item.key}
          object={item.obj}
          position={item.pos}
          rotation={[0, item.rotY, 0]}
          scale={item.scale}
        />
      ))}

      {/* Real 3D GLB Cobra-Head Street Lamps every 22m along the Strip */}
      {streetLampClones.map((lamp) => (
        <group key={lamp.key} position={lamp.pos} rotation={[0, lamp.rotY, 0]}>
          <primitive object={lamp.obj} scale={1.08} />
          <mesh position={[0, 8.35, 1.35]}>
            <boxGeometry args={[0.38, 0.1, 0.55]} />
            <meshStandardMaterial color="#fef9c3" emissive="#fef08a" emissiveIntensity={1.8} />
          </mesh>
        </group>
      ))}

      {/* Active 3D Grand Prix Checkpoint Gate (Twin Carbon/Gold Pilasters + Laser Arch + Bobbing Chevron) */}
      <group ref={checkpointGateRef} position={[0, getTerrainHeight(0, 52), 52]}>
        {[-8.5, 8.5].map((px) => (
          <group key={px} position={[px, 0, 0]}>
            {/* Brushed Gold Plinth Base */}
            <mesh position={[0, 0.45, 0]} castShadow>
              <cylinderGeometry args={[0.85, 1.05, 0.9, 12]} />
              <meshStandardMaterial color="#f59e0b" metalness={0.88} roughness={0.2} />
            </mesh>
            {/* Carbon-Fiber Pilaster Tower */}
            <mesh position={[0, 5.0, 0]} castShadow>
              <boxGeometry args={[0.92, 8.8, 0.92]} />
              <meshStandardMaterial color="#0f172a" metalness={0.78} roughness={0.22} />
            </mesh>
            {/* Glowing Cyan Vertical Laser Channels */}
            <mesh position={[px > 0 ? -0.48 : 0.48, 5.0, 0]}>
              <boxGeometry args={[0.12, 8.2, 0.36]} />
              <meshStandardMaterial color="#22d3ee" emissive="#06b6d4" emissiveIntensity={2.2} />
            </mesh>
            {/* Gold Crown Capital */}
            <mesh position={[0, 9.5, 0]}>
              <boxGeometry args={[1.25, 0.55, 1.25]} />
              <meshStandardMaterial color="#fbbf24" emissive="#f59e0b" emissiveIntensity={0.8} metalness={0.85} roughness={0.18} />
            </mesh>
          </group>
        ))}
        {/* Overhead Carbon & Gold Gantry Arch */}
        <mesh position={[0, 9.65, 0]} castShadow>
          <boxGeometry args={[18.4, 0.85, 0.95]} />
          <meshStandardMaterial color="#1e293b" metalness={0.82} roughness={0.2} />
        </mesh>
        {/* Glowing Cyan & Gold Overhead Laser Arch Bars */}
        <mesh position={[0, 9.65, 0]}>
          <boxGeometry args={[16.6, 0.32, 1.08]} />
          <meshStandardMaterial color="#22d3ee" emissive="#06b6d4" emissiveIntensity={2.4} />
        </mesh>
        <mesh position={[0, 10.18, 0]}>
          <boxGeometry args={[14.8, 0.2, 0.65]} />
          <meshStandardMaterial color="#fde047" emissive="#f59e0b" emissiveIntensity={1.8} />
        </mesh>
        {/* Translucent Holographic Laser Curtain */}
        <mesh position={[0, 8.6, 0]}>
          <planeGeometry args={[15.8, 1.6]} />
          <meshBasicMaterial color="#22d3ee" transparent opacity={0.18} side={THREE.DoubleSide} depthWrite={false} />
        </mesh>
        {/* Ground Threshold Target Ring */}
        <mesh ref={gatePulseRef} position={[0, 0.14, 0]} rotation={[-Math.PI / 2, 0, 0]}>
          <ringGeometry args={[6.8, 8.2, 36]} />
          <meshBasicMaterial color="#22d3ee" transparent opacity={0.42} side={THREE.DoubleSide} depthWrite={false} />
        </mesh>
        {/* Bobbing 3D Chevron Marker + Skyward Waypoint Filament */}
        <group ref={chevronRef} position={[0, 11.8, 0]}>
          <mesh rotation={[Math.PI, 0, 0]}>
            <coneGeometry args={[1.35, 2.2, 4]} />
            <meshStandardMaterial color="#fde047" emissive="#f59e0b" emissiveIntensity={2.2} metalness={0.7} roughness={0.15} />
          </mesh>
          <mesh position={[0, 1.45, 0]} rotation={[Math.PI / 2, 0, 0]}>
            <torusGeometry args={[1.6, 0.12, 8, 24]} />
            <meshStandardMaterial color="#22d3ee" emissive="#06b6d4" emissiveIntensity={2.4} />
          </mesh>
        </group>
        <mesh position={[0, 48, 0]}>
          <cylinderGeometry args={[0.18, 0.45, 76, 8]} />
          <meshBasicMaterial color="#22d3ee" transparent opacity={0.16} depthWrite={false} />
        </mesh>
      </group>

      {/* Glowing Stunt Launch Ramp on South Strip */}
      <group position={[6.5, getTerrainHeight(6.5, 86) + 0.1, 86]} rotation={[-0.28, 0, 0]}>
        <mesh receiveShadow castShadow>
          <boxGeometry args={[6.5, 0.4, 9.5]} />
          <meshStandardMaterial color="#1e293b" metalness={0.7} roughness={0.25} />
        </mesh>
        <mesh position={[0, 0.22, 0]}>
          <boxGeometry args={[5.4, 0.06, 8.6]} />
          <meshStandardMaterial color="#22d3ee" emissive="#06b6d4" emissiveIntensity={1.2} />
        </mesh>
      </group>

      {/* Brushed Steel & Gold Azurea Coastline Archway */}
      <group position={[0, archY, 62]}>
        <mesh position={[-15, 7, 0]} castShadow>
          <cylinderGeometry args={[0.55, 0.75, 14, 12]} />
          <meshStandardMaterial color="#e2e8f0" metalness={0.8} roughness={0.25} />
        </mesh>
        <mesh position={[15, 7, 0]} castShadow>
          <cylinderGeometry args={[0.55, 0.75, 14, 12]} />
          <meshStandardMaterial color="#e2e8f0" metalness={0.8} roughness={0.25} />
        </mesh>
        <mesh position={[0, 13.5, 0]} castShadow>
          <boxGeometry args={[32, 2.6, 1.2]} />
          <meshStandardMaterial color="#1e293b" metalness={0.75} roughness={0.22} />
        </mesh>
        <mesh position={[0, 13.5, 0]}>
          <boxGeometry args={[28, 1.2, 1.35]} />
          <meshStandardMaterial color="#f59e0b" emissive="#f59e0b" emissiveIntensity={0.95} />
        </mesh>
      </group>

      {/* Bellagio-Style Limestone Fountain Plaza */}
      <group position={[0, poolY + 0.12, -10]}>
        <mesh rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
          <ringGeometry args={[13.2, 15.8, 48]} />
          <meshStandardMaterial
            map={limestoneTex}
            normalMap={limestoneNormal}
            bumpMap={limestoneTex}
            bumpScale={0.14}
            roughness={0.56}
          />
        </mesh>
        <mesh rotation={[-Math.PI / 2, 0, 0]}>
          <circleGeometry args={[13.2, 48]} />
          <meshPhysicalMaterial color="#0369a1" roughness={0.08} metalness={0.35} clearcoat={1.0} />
        </mesh>
        {/* Warm Underwater Pool Glow */}
        <mesh position={[0, 0.04, 0]} rotation={[-Math.PI / 2, 0, 0]}>
          <ringGeometry args={[4.4, 11.4, 48]} />
          <meshBasicMaterial color="#38bdf8" transparent opacity={0.22} depthWrite={false} />
        </mesh>
        <mesh position={[0, 0.05, 0]} rotation={[-Math.PI / 2, 0, 0]}>
          <ringGeometry args={[5.2, 6.2, 48]} />
          <meshBasicMaterial color="#fde68a" transparent opacity={0.38} depthWrite={false} />
        </mesh>
        <mesh position={[0, 0.05, 0]} rotation={[-Math.PI / 2, 0, 0]}>
          <ringGeometry args={[9.4, 10.2, 48]} />
          <meshBasicMaterial color="#fbbf24" transparent opacity={0.28} depthWrite={false} />
        </mesh>
        <mesh position={[0, 0.65, 0]} castShadow receiveShadow>
          <cylinderGeometry args={[3.4, 4.2, 1.3, 24]} />
          <meshStandardMaterial
            map={limestoneTex}
            normalMap={limestoneNormal}
            bumpMap={limestoneTex}
            bumpScale={0.12}
            roughness={0.48}
          />
        </mesh>
        {/* Vertical Choreographed Plumes */}
        <group ref={fountainRef}>
          {Array.from({ length: 12 }).map((_, i) => {
            const ang = (i / 12) * Math.PI * 2;
            const r = i % 2 === 0 ? 7.8 : 4.8;
            return (
              <mesh key={i} position={[Math.cos(ang) * r, 1.8, Math.sin(ang) * r]}>
                <cylinderGeometry args={[0.11, 0.38, 3.0, 8]} />
                <meshStandardMaterial color="#e0f2fe" emissive="#7dd3fc" emissiveIntensity={0.42} transparent opacity={0.55} roughness={0.1} />
              </mesh>
            );
          })}
        </group>
        {/* Curved Water Arc Jets */}
        <group ref={arcJetsRef}>
          {Array.from({ length: 12 }).map((_, i) => {
            const ang = (i / 12) * Math.PI * 2 + Math.PI / 12;
            const r = 7.2;
            return (
              <group key={i} position={[Math.cos(ang) * r, 0.4, Math.sin(ang) * r]} rotation={[0, -ang, 0]}>
                <mesh rotation={[0, 0, 0.08]}>
                  <torusGeometry args={[2.7, 0.085, 6, 16, Math.PI * 0.88]} />
                  <meshStandardMaterial color="#f0f9ff" emissive="#bae6fd" emissiveIntensity={0.5} transparent opacity={0.62} roughness={0.12} />
                </mesh>
              </group>
            );
          })}
        </group>
        {/* Misty Spray Halo */}
        <mesh ref={mistRef} position={[0, 2.2, 0]} rotation={[Math.PI / 2, 0, 0]}>
          <torusGeometry args={[6.4, 1.15, 8, 28]} />
          <meshBasicMaterial color="#e0f2fe" transparent opacity={0.14} depthWrite={false} />
        </mesh>
      </group>

      {/* 2 Giant 7-Deck Luxury Mega-Cruise Ships: MS AZUREA ODYSSEY & MS SOLARIS ROYAL in Deep Ocean Water */}
      <LuxuryCruiseShip
        position={[276, 0.2, -62]}
        rotationY={-0.55}
        scale={1.08}
        name="MS AZUREA ODYSSEY"
        cruising={true}
        phaseOffset={0}
      />
      <LuxuryCruiseShip
        position={[-282, 0.2, -85]}
        rotationY={2.45}
        scale={1.04}
        name="MS SOLARIS ROYAL"
        cruising={true}
        phaseOffset={2.4}
      />

      {/* Offshore Yacht & Tall Ship Marina Fleet Moored in the Deep Venetian Bay & Ocean Channel */}
      <group ref={marinaGroupRef}>
        {sloopYachtModel && (
          <group position={[204, 0.35, -91]} rotation={[0, -0.65, 0]}>
            <primitive object={sloopYachtModel} scale={1.15} />
          </group>
        )}
        {galleonShipModel && (
          <group position={[252, 0.45, -104]} rotation={[0, -2.15, 0]}>
            <primitive object={galleonShipModel} scale={0.68} />
          </group>
        )}
        {caiqueBoatModel && (
          <group position={[182, 0.35, -98]} rotation={[0, 0.85, 0]}>
            <primitive object={caiqueBoatModel} scale={1.32} />
          </group>
        )}
      </group>
    </group>
  );
}

export function InstancedFoliage() {
  const trunkRef = useRef<THREE.InstancedMesh>(null);
  const frondRefs = [
    useRef<THREE.InstancedMesh>(null),
    useRef<THREE.InstancedMesh>(null),
    useRef<THREE.InstancedMesh>(null),
    useRef<THREE.InstancedMesh>(null),
    useRef<THREE.InstancedMesh>(null),
    useRef<THREE.InstancedMesh>(null),
  ];
  const buildingRef = useRef<THREE.InstancedMesh>(null);
  const setbackRef = useRef<THREE.InstancedMesh>(null);
  const crownRef = useRef<THREE.InstancedMesh>(null);
  const spireRef = useRef<THREE.InstancedMesh>(null);
  const helipadRef = useRef<THREE.InstancedMesh>(null);
  const canopyRef = useRef<THREE.InstancedMesh>(null);
  const lobbyGlowRef = useRef<THREE.InstancedMesh>(null);
  const boulderRef = useRef<THREE.InstancedMesh>(null);

  const { map: glassTex, roughnessMap: glassRough } = useMemo(() => createSkyscraperPBR(), []);
  const { map: barkMap, normalMap: barkNormal } = useMemo(() => createBarkPBR(), []);

  // Organic fractured coastal boulder geometry (single shared geometry, 1 draw call)
  const boulderGeo = useMemo(() => {
    const geo = new THREE.DodecahedronGeometry(1, 1);
    const pos = geo.attributes.position;
    for (let i = 0; i < pos.count; i++) {
      const vx = pos.getX(i);
      const vy = pos.getY(i);
      const vz = pos.getZ(i);
      const n = 0.84 + 0.32 * Math.sin(vx * 3.7 + vy * 2.3 + vz * 4.1);
      pos.setXYZ(i, vx * n, vy * (vy < 0 ? 0.65 * n : n), vz * n);
    }
    geo.computeVertexNormals();
    return geo;
  }, []);

  // Arched sculpted palm frond blade
  const frondGeo = useMemo(() => {
    const shape = new THREE.Shape();
    shape.moveTo(0, 0);
    shape.quadraticCurveTo(0.42, 1.6, 0.36, 3.3);
    shape.quadraticCurveTo(0.18, 4.4, 0, 5.1);
    shape.quadraticCurveTo(-0.18, 4.4, -0.36, 3.3);
    shape.quadraticCurveTo(-0.42, 1.6, 0, 0);
    const geo = new THREE.ExtrudeGeometry(shape, { depth: 0.06, bevelEnabled: false, curveSegments: 8 });
    geo.rotateX(Math.PI / 2);
    // Arch downward gracefully toward tip
    const pos = geo.attributes.position;
    for (let i = 0; i < pos.count; i++) {
      const z = pos.getZ(i);
      pos.setY(i, pos.getY(i) - 0.055 * z * z);
    }
    geo.computeVertexNormals();
    return geo;
  }, []);

  const {
    palmTransforms,
    buildingTransforms,
    buildingColors,
    setbackTransforms,
    crownTransforms,
    crownColors,
    spireTransforms,
    helipadTransforms,
    canopyTransforms,
    lobbyTransforms,
    boulderTransforms,
    boulderColors,
  } = useMemo(() => {
    const palms: THREE.Matrix4[] = [];
    const dummy = new THREE.Object3D();

    for (let i = 0; i < 220; i++) {
      const angle = (i * 137.5 * Math.PI) / 180;
      const radius = 58 + ((i * 29) % 185);
      const x = Math.cos(angle) * radius;
      const z = Math.sin(angle) * radius;
      const y = getTerrainHeight(x, z);
      if (y > 0.7 && y < 8.5 && Math.abs(x) > 32 && !(x > -215 && x < -40 && z > 130 && z < 180)) {
        const s = 0.9 + ((i % 5) * 0.14);
        dummy.position.set(x, y + 3.5 * s, z);
        dummy.rotation.set(0.05, (i * 0.7) % Math.PI, 0.03);
        dummy.scale.set(s, s, s);
        dummy.updateMatrix();
        palms.push(dummy.matrix.clone());
      }
    }

    // Coastal boulders scattered naturally along the shoreline (0.2 <= y <= 2.5)
    const boulders: THREE.Matrix4[] = [];
    const bColors: THREE.Color[] = [];
    const rockPalette = [
      new THREE.Color('#b6aea0'), // warm coastal limestone
      new THREE.Color('#9e9689'), // weathered limestone
      new THREE.Color('#565b63'), // dark coastal basalt
      new THREE.Color('#6b7078'), // slate granite
    ];
    for (let i = 0; i < 360; i++) {
      const angle = (i * 137.508 * Math.PI) / 180;
      const radius = 185 + ((i * 37) % 85);
      const x = Math.cos(angle) * radius;
      const z = Math.sin(angle) * radius;
      const y = getTerrainHeight(x, z);
      const nearStrip = Math.abs(x) < 32 && Math.abs(z) < 135;
      const nearRunway = x > -218 && x < -38 && z > 128 && z < 182;
      const nearCanal = x > 60 && Math.abs(z + 95) < 30;
      if (y >= 0.2 && y <= 2.5 && !nearStrip && !nearRunway && !nearCanal) {
        const sx = 1.05 + ((i * 13) % 17) * 0.12;
        const sy = 0.55 + ((i * 7) % 11) * 0.08;
        const sz = 0.95 + ((i * 19) % 15) * 0.11;
        dummy.position.set(x, y + sy * 0.32, z);
        dummy.rotation.set(((i % 5) - 2) * 0.12, (i * 1.13) % (Math.PI * 2), ((i % 3) - 1) * 0.1);
        dummy.scale.set(sx, sy, sz);
        dummy.updateMatrix();
        boulders.push(dummy.matrix.clone());
        bColors.push(rockPalette[i % rockPalette.length]);
      }
    }

    const bMats: THREE.Matrix4[] = [];
    const bTints: THREE.Color[] = [];
    const sMats: THREE.Matrix4[] = [];
    const cMats: THREE.Matrix4[] = [];
    const cTints: THREE.Color[] = [];
    const spMats: THREE.Matrix4[] = [];
    const hpMats: THREE.Matrix4[] = [];
    const canMats: THREE.Matrix4[] = [];
    const lobMats: THREE.Matrix4[] = [];

    const towerPalette = [
      new THREE.Color('#94a3b8'), // architectural slate glass
      new THREE.Color('#cbd5e1'), // silver architectural glass
      new THREE.Color('#d6d3cd'), // limestone-clad modern
      new THREE.Color('#a8a29e'), // warm titanium travertine
      new THREE.Color('#64748b'), // deep sapphire-slate curtain wall
    ];
    const crownPalette = [
      new THREE.Color('#334155'), // obsidian steel
      new THREE.Color('#475569'), // brushed titanium
      new THREE.Color('#78716c'), // architectural dark bronze
    ];

    for (let i = 0; i < 34; i++) {
      const side = i % 2 === 0 ? -1 : 1;
      const x = side * (40 + (i % 3) * 18);
      const z = -105 + Math.floor(i / 2) * 13;
      const y = getTerrainHeight(x, z);
      const w = 12 + (i % 4) * 2.2;
      const d = 12 + ((i + 1) % 3) * 2.2;
      const h = 20 + ((i * 17) % 42);

      // Main tower shaft
      dummy.position.set(x, y + h / 2, z);
      dummy.rotation.set(0, 0, 0);
      dummy.scale.set(w, h, d);
      dummy.updateMatrix();
      bMats.push(dummy.matrix.clone());
      bTints.push(towerPalette[i % towerPalette.length]);

      // Art Deco stepped setback tier
      const sbH = Math.max(4.5, h * 0.18);
      dummy.position.set(x, y + h + sbH / 2, z);
      dummy.scale.set(w * 0.74, sbH, d * 0.74);
      dummy.updateMatrix();
      sMats.push(dummy.matrix.clone());

      // Art Deco upper crown cap
      const crH = 3.2 + (i % 3) * 0.9;
      dummy.position.set(x, y + h + sbH + crH / 2, z);
      dummy.scale.set(w * 0.46, crH, d * 0.46);
      dummy.updateMatrix();
      cMats.push(dummy.matrix.clone());
      cTints.push(crownPalette[i % crownPalette.length]);

      // Alternating rooftop spire or helipad
      const roofY = y + h + sbH + crH;
      if (i % 2 === 0) {
        const spH = 7.5 + (i % 4) * 2.2;
        dummy.position.set(x, roofY + spH / 2, z);
        dummy.scale.set(1, spH, 1);
        dummy.updateMatrix();
        spMats.push(dummy.matrix.clone());
      } else {
        dummy.position.set(x, roofY + 0.25, z);
        dummy.scale.set(Math.min(w, d) * 0.34, 0.5, Math.min(w, d) * 0.34);
        dummy.updateMatrix();
        hpMats.push(dummy.matrix.clone());
      }

      // Ground-floor cantilevered resort canopy & warm lobby glow facing the Strip
      const faceDir = -side;
      dummy.position.set(x + faceDir * (w / 2 + 1.6), y + 4.1, z);
      dummy.scale.set(3.4, 0.52, d * 0.68);
      dummy.updateMatrix();
      canMats.push(dummy.matrix.clone());

      dummy.position.set(x + faceDir * (w / 2 + 0.12), y + 2.0, z);
      dummy.scale.set(0.35, 3.8, d * 0.56);
      dummy.updateMatrix();
      lobMats.push(dummy.matrix.clone());
    }

    return {
      palmTransforms: palms,
      buildingTransforms: bMats,
      buildingColors: bTints,
      setbackTransforms: sMats,
      crownTransforms: cMats,
      crownColors: cTints,
      spireTransforms: spMats,
      helipadTransforms: hpMats,
      canopyTransforms: canMats,
      lobbyTransforms: lobMats,
      boulderTransforms: boulders,
      boulderColors: bColors,
    };
  }, []);

  React.useLayoutEffect(() => {
    const dummy = new THREE.Object3D();
    if (trunkRef.current) {
      const pos = new THREE.Vector3();
      const quat = new THREE.Quaternion();
      const scl = new THREE.Vector3();
      palmTransforms.forEach((mat, i) => {
        trunkRef.current!.setMatrixAt(i, mat);
        mat.decompose(pos, quat, scl);
        frondRefs.forEach((fRef, fIdx) => {
          if (!fRef.current) return;
          const yaw = (fIdx / 6) * Math.PI * 2 + (i % 3) * 0.5;
          dummy.position.set(pos.x, pos.y + 3.4 * scl.y, pos.z);
          dummy.rotation.set(-0.22, yaw, 0);
          dummy.scale.set(scl.x, scl.y, scl.z);
          dummy.updateMatrix();
          fRef.current.setMatrixAt(i, dummy.matrix);
        });
      });
      trunkRef.current.instanceMatrix.needsUpdate = true;
      frondRefs.forEach((fRef) => {
        if (fRef.current) fRef.current.instanceMatrix.needsUpdate = true;
      });
    }
    if (buildingRef.current && setbackRef.current && crownRef.current && canopyRef.current && lobbyGlowRef.current) {
      buildingTransforms.forEach((mat, i) => {
        buildingRef.current!.setMatrixAt(i, mat);
        buildingRef.current!.setColorAt(i, buildingColors[i]);
        setbackRef.current!.setMatrixAt(i, setbackTransforms[i]);
        crownRef.current!.setMatrixAt(i, crownTransforms[i]);
        crownRef.current!.setColorAt(i, crownColors[i]);
        canopyRef.current!.setMatrixAt(i, canopyTransforms[i]);
        lobbyGlowRef.current!.setMatrixAt(i, lobbyTransforms[i]);
      });
      buildingRef.current.instanceMatrix.needsUpdate = true;
      if (buildingRef.current.instanceColor) buildingRef.current.instanceColor.needsUpdate = true;
      setbackRef.current.instanceMatrix.needsUpdate = true;
      crownRef.current.instanceMatrix.needsUpdate = true;
      if (crownRef.current.instanceColor) crownRef.current.instanceColor.needsUpdate = true;
      canopyRef.current.instanceMatrix.needsUpdate = true;
      lobbyGlowRef.current.instanceMatrix.needsUpdate = true;
    }
    if (spireRef.current) {
      spireTransforms.forEach((mat, i) => spireRef.current!.setMatrixAt(i, mat));
      spireRef.current.instanceMatrix.needsUpdate = true;
    }
    if (helipadRef.current) {
      helipadTransforms.forEach((mat, i) => helipadRef.current!.setMatrixAt(i, mat));
      helipadRef.current.instanceMatrix.needsUpdate = true;
    }
    if (boulderRef.current) {
      boulderTransforms.forEach((mat, i) => {
        boulderRef.current!.setMatrixAt(i, mat);
        boulderRef.current!.setColorAt(i, boulderColors[i]);
      });
      boulderRef.current.instanceMatrix.needsUpdate = true;
      if (boulderRef.current.instanceColor) boulderRef.current.instanceColor.needsUpdate = true;
    }
  }, [
    palmTransforms,
    buildingTransforms,
    buildingColors,
    setbackTransforms,
    crownTransforms,
    crownColors,
    spireTransforms,
    helipadTransforms,
    canopyTransforms,
    lobbyTransforms,
    boulderTransforms,
    boulderColors,
  ]);

  return (
    <group>
      <instancedMesh ref={trunkRef} args={[undefined, undefined, palmTransforms.length]} castShadow>
        <cylinderGeometry args={[0.24, 0.52, 7.0, 8]} />
        <meshStandardMaterial
          map={barkMap}
          normalMap={barkNormal}
          bumpMap={barkMap}
          bumpScale={0.22}
          color="#a87c56"
          roughness={0.88}
        />
      </instancedMesh>
      {frondRefs.map((fRef, idx) => (
        <instancedMesh key={idx} ref={fRef} args={[frondGeo, undefined, palmTransforms.length]} castShadow>
          <meshStandardMaterial color={idx % 2 === 0 ? '#3f6212' : '#4d7c0f'} roughness={0.58} side={THREE.DoubleSide} />
        </instancedMesh>
      ))}
      <instancedMesh ref={boulderRef} args={[boulderGeo, undefined, boulderTransforms.length]} castShadow receiveShadow>
        <meshStandardMaterial roughness={0.88} metalness={0.04} />
      </instancedMesh>
      <instancedMesh ref={buildingRef} args={[undefined, undefined, buildingTransforms.length]} castShadow receiveShadow>
        <boxGeometry args={[1, 1, 1]} />
        <meshPhysicalMaterial map={glassTex} roughnessMap={glassRough} metalness={0.45} roughness={0.22} clearcoat={0.8} />
      </instancedMesh>
      <instancedMesh ref={setbackRef} args={[undefined, undefined, setbackTransforms.length]} castShadow receiveShadow>
        <boxGeometry args={[1, 1, 1]} />
        <meshPhysicalMaterial map={glassTex} roughnessMap={glassRough} color="#e2e8f0" metalness={0.48} roughness={0.24} clearcoat={0.75} />
      </instancedMesh>
      <instancedMesh ref={crownRef} args={[undefined, undefined, crownTransforms.length]} castShadow>
        <boxGeometry args={[1, 1, 1]} />
        <meshStandardMaterial metalness={0.72} roughness={0.22} />
      </instancedMesh>
      <instancedMesh ref={spireRef} args={[undefined, undefined, spireTransforms.length]}>
        <cylinderGeometry args={[0.08, 0.48, 1, 8]} />
        <meshStandardMaterial color="#f8fafc" metalness={0.85} roughness={0.18} />
      </instancedMesh>
      <instancedMesh ref={helipadRef} args={[undefined, undefined, helipadTransforms.length]}>
        <cylinderGeometry args={[1, 1, 1, 16]} />
        <meshStandardMaterial color="#334155" metalness={0.45} roughness={0.55} />
      </instancedMesh>
      <instancedMesh ref={canopyRef} args={[undefined, undefined, canopyTransforms.length]} castShadow>
        <boxGeometry args={[1, 1, 1]} />
        <meshStandardMaterial color="#1e293b" metalness={0.78} roughness={0.25} />
      </instancedMesh>
      <instancedMesh ref={lobbyGlowRef} args={[undefined, undefined, lobbyTransforms.length]}>
        <boxGeometry args={[1, 1, 1]} />
        <meshStandardMaterial color="#fef3c7" emissive="#f59e0b" emissiveIntensity={1.15} roughness={0.2} />
      </instancedMesh>
    </group>
  );
}

export function ChipCollectibles() {
  const groupRef = useRef<THREE.Group>(null);
  useFrame((state) => {
    const t = state.clock.elapsedTime;
    if (!groupRef.current) return;
    groupRef.current.children.forEach((child, idx) => {
      const node = simState.chipNodes[idx];
      if (!node) return;
      child.visible = !node.collected;
      if (!node.collected) {
        child.rotation.y = t * 1.8 + idx;
        if (!node.isAerial) {
          child.position.y = node.position[1] + Math.sin(t * 2.5 + idx) * 0.35;
        }
      }
    });
  });

  return (
    <group ref={groupRef}>
      {simState.chipNodes.map((c) => (
        <mesh key={c.id} position={c.position}>
          {c.isAerial ? <torusGeometry args={[6.2, 0.42, 8, 28]} /> : <cylinderGeometry args={[1.1, 1.1, 0.32, 16]} />}
          <meshStandardMaterial
            color={c.isAerial ? '#22d3ee' : '#fbbf24'}
            emissive={c.isAerial ? '#06b6d4' : '#f59e0b'}
            emissiveIntensity={1.4}
            metalness={0.6}
            roughness={0.2}
          />
        </mesh>
      ))}
    </group>
  );
}

export function LandmarkBeacons() {
  return (
    <group>
      {LANDMARKS.map((lm) => (
        <mesh key={lm.id} position={[lm.position[0], 115, lm.position[2]]}>
          <cylinderGeometry args={[0.35, 0.35, 220, 8]} />
          <meshBasicMaterial color={lm.color} transparent opacity={0.12} depthWrite={false} />
        </mesh>
      ))}
    </group>
  );
}
