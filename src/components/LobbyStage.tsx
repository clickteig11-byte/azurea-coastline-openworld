import { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { LOBBY_THEMES } from '../game/lobbyThemes';
import { simState } from '../game/store';

export const lobbyStage = { x: 262, y: 2.35, z: -178, yaw: 1.72 };

const PIER_PILINGS: [number, number][] = [
  [-8.2, -5.6],
  [0, -5.6],
  [8.2, -5.6],
  [-8.2, 3.6],
  [0, 3.6],
  [8.2, 3.6],
];

const COMPASS_TICKS = Array.from({ length: 16 }, (_, i) => (i * Math.PI) / 8);

export function LobbyStage() {
  const stage = useRef<THREE.Group>(null);
  const keyLightRef = useRef<THREE.PointLight>(null);

  const deckMatRef = useRef<THREE.MeshStandardMaterial>(null);
  const deckSlabMatRef = useRef<THREE.MeshStandardMaterial>(null);
  const brassAccentMatRef = useRef<THREE.MeshStandardMaterial>(null);
  const helipadBeaconMatRef = useRef<THREE.MeshStandardMaterial>(null);
  const balustradeLedMatRef = useRef<THREE.MeshStandardMaterial>(null);

  const targetColor = useMemo(() => new THREE.Color(), []);

  useFrame(({ clock }, rawDelta) => {
    if (!stage.current) return;
    stage.current.visible = simState.startMenuOpen;
    if (!simState.startMenuOpen) return;

    const dt = Math.min(0.05, rawDelta);
    const lerpAlpha = 1 - Math.exp(-6.0 * dt);
    const t = clock.elapsedTime;
    const theme = LOBBY_THEMES[simState.lobbyTheme] ?? LOBBY_THEMES.SUNLIT_RIVIERA;
    const pulse = 0.5 + 0.5 * Math.sin(t * 2.0);

    if (keyLightRef.current) {
      targetColor.set(theme.keyLightColor);
      keyLightRef.current.color.lerp(targetColor, lerpAlpha);
      keyLightRef.current.intensity = THREE.MathUtils.lerp(
        keyLightRef.current.intensity,
        theme.keyLightIntensity * 0.9,
        lerpAlpha
      );
    }

    if (deckMatRef.current) {
      targetColor.set(theme.terraceDeckColor);
      deckMatRef.current.color.lerp(targetColor, lerpAlpha);
    }
    if (deckSlabMatRef.current) {
      targetColor.set(theme.terraceDeckColor).multiplyScalar(0.82);
      deckSlabMatRef.current.color.lerp(targetColor, lerpAlpha);
    }

    if (brassAccentMatRef.current) {
      targetColor.set(theme.terraceAccentColor);
      brassAccentMatRef.current.emissive.lerp(targetColor, lerpAlpha);
      brassAccentMatRef.current.emissiveIntensity = THREE.MathUtils.lerp(
        brassAccentMatRef.current.emissiveIntensity,
        theme.carLightsOn ? 0.55 + pulse * 0.15 : 0.18,
        lerpAlpha
      );
    }

    if (helipadBeaconMatRef.current) {
      helipadBeaconMatRef.current.emissiveIntensity = theme.carLightsOn
        ? 1.6 + pulse * 0.8
        : 0.45;
    }

    if (balustradeLedMatRef.current) {
      targetColor.set(theme.terraceAccentColor);
      balustradeLedMatRef.current.emissive.lerp(targetColor, lerpAlpha);
      balustradeLedMatRef.current.emissiveIntensity = THREE.MathUtils.lerp(
        balustradeLedMatRef.current.emissiveIntensity,
        theme.carLightsOn ? 1.15 : 0.22,
        lerpAlpha
      );
    }
  });

  return (
    <group
      ref={stage}
      position={[lobbyStage.x, lobbyStage.y, lobbyStage.z]}
      rotation={[0, lobbyStage.yaw, 0]}
      visible={false}
    >
      {/* Concrete Marina Pier Caissons into Ocean Floor */}
      {PIER_PILINGS.map(([px, pz], idx) => (
        <mesh key={idx} position={[px, -4.6, pz]} receiveShadow>
          <cylinderGeometry args={[0.46, 0.54, 9.2, 10]} />
          <meshStandardMaterial color="#646e78" roughness={0.86} metalness={0.1} />
        </mesh>
      ))}

      {/* Main Architectural Travertine & Teak Waterfront Promenade */}
      <mesh position={[0, -0.32, 0]} receiveShadow>
        <boxGeometry args={[21.6, 0.6, 13.8]} />
        <meshStandardMaterial ref={deckSlabMatRef} color="#949da6" roughness={0.76} metalness={0.1} />
      </mesh>
      {Array.from({ length: 12 }, (_, i) => (
        <mesh key={i} position={[(i - 5.5) * 1.76, -0.014, 0]} receiveShadow>
          <boxGeometry args={[1.72, 0.028, 13.4]} />
          <meshStandardMaterial
            ref={i === 6 ? deckMatRef : undefined}
            color={i % 2 === 0 ? '#c5ccd2' : '#b7c0c7'}
            roughness={0.78}
            metalness={0.08}
          />
        </mesh>
      ))}

      {/* Teak Harbor Boardwalk Apron Strip along Balustrade */}
      <mesh position={[0, 0.008, -5.75]} receiveShadow>
        <boxGeometry args={[20.8, 0.024, 1.45]} />
        <meshStandardMaterial color="#7c5637" roughness={0.74} metalness={0.06} />
      </mesh>

      {/* 1. CENTER STATION: Architectural Basalt & Brushed-Brass Compass Rose Medallion (No Fortnite Hologram) */}
      <group position={[0, 0, 0]}>
        <mesh position={[0, 0.018, 0]} receiveShadow>
          <cylinderGeometry args={[1.78, 1.88, 0.044, 36]} />
          <meshStandardMaterial color="#18202c" metalness={0.62} roughness={0.34} />
        </mesh>
        <mesh position={[0, 0.042, 0]} receiveShadow>
          <cylinderGeometry args={[1.52, 1.54, 0.016, 36]} />
          <meshStandardMaterial color="#222d3d" metalness={0.48} roughness={0.42} />
        </mesh>
        {/* Outer & Inner Inlaid Champagne-Brass Compass Rings */}
        <mesh rotation={[Math.PI / 2, 0, 0]} position={[0, 0.052, 0]}>
          <torusGeometry args={[1.56, 0.028, 8, 48]} />
          <meshStandardMaterial
            ref={brassAccentMatRef}
            color="#e5c384"
            emissive="#fb923c"
            emissiveIntensity={0.24}
            metalness={0.86}
            roughness={0.22}
          />
        </mesh>
        <mesh rotation={[Math.PI / 2, 0, 0]} position={[0, 0.052, 0]}>
          <torusGeometry args={[0.92, 0.016, 8, 36]} />
          <meshStandardMaterial color="#d4af6a" metalness={0.85} roughness={0.26} />
        </mesh>
        {/* 16 Radial Brass Compass Degree Ticks */}
        {COMPASS_TICKS.map((angle, idx) => {
          const major = idx % 4 === 0;
          const r = major ? 1.24 : 1.36;
          return (
            <mesh
              key={idx}
              position={[Math.sin(angle) * r, 0.052, Math.cos(angle) * r]}
              rotation={[0, angle, 0]}
            >
              <boxGeometry args={[major ? 0.065 : 0.032, 0.01, major ? 0.46 : 0.22]} />
              <meshStandardMaterial color="#e5c384" metalness={0.88} roughness={0.22} />
            </mesh>
          );
        })}
      </group>

      {/* 2. RIGHT FORECOURT STATION: Obsidian & Brass Concours Supercar Turntable ([2.95, 0.02, -3.15]) */}
      <group position={[2.95, 0.015, -3.15]}>
        <mesh receiveShadow>
          <cylinderGeometry args={[2.55, 2.68, 0.055, 36]} />
          <meshStandardMaterial color="#121822" metalness={0.76} roughness={0.24} />
        </mesh>
        <mesh position={[0, 0.032, 0]} receiveShadow>
          <cylinderGeometry args={[2.28, 2.3, 0.015, 36]} />
          <meshStandardMaterial color="#1c2533" metalness={0.68} roughness={0.28} />
        </mesh>
        <mesh rotation={[Math.PI / 2, 0, 0]} position={[0, 0.042, 0]}>
          <torusGeometry args={[2.36, 0.026, 8, 48]} />
          <meshStandardMaterial color="#e5c384" metalness={0.86} roughness={0.22} />
        </mesh>
      </group>

      {/* 3. LEFT-REAR OVERLOOK STATION: Cantilevered Octagonal Helipad & Aviation Apron ([-3.85, 0.16, -5.65]) */}
      <group position={[-3.85, 0.12, -5.65]}>
        <mesh receiveShadow>
          <cylinderGeometry args={[3.15, 3.35, 0.22, 8]} />
          <meshStandardMaterial color="#1e2631" roughness={0.68} metalness={0.28} />
        </mesh>
        {/* Painted Gold Helipad Circle & 'H' Insignia */}
        <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.115, 0]}>
          <ringGeometry args={[2.15, 2.32, 32]} />
          <meshStandardMaterial color="#e5c384" roughness={0.45} metalness={0.35} />
        </mesh>
        <mesh position={[-0.55, 0.116, 0]}>
          <boxGeometry args={[0.24, 0.01, 1.45]} />
          <meshStandardMaterial color="#f8fafc" roughness={0.5} />
        </mesh>
        <mesh position={[0.55, 0.116, 0]}>
          <boxGeometry args={[0.24, 0.01, 1.45]} />
          <meshStandardMaterial color="#f8fafc" roughness={0.5} />
        </mesh>
        <mesh position={[0, 0.116, 0]}>
          <boxGeometry args={[1.1, 0.01, 0.24]} />
          <meshStandardMaterial color="#f8fafc" roughness={0.5} />
        </mesh>
        {/* 6 Perimeter Helipad Amber Deck Beacons */}
        {Array.from({ length: 6 }, (_, i) => {
          const a = (i * Math.PI) / 3 + Math.PI / 6;
          return (
            <mesh key={i} position={[Math.cos(a) * 2.78, 0.14, Math.sin(a) * 2.78]}>
              <cylinderGeometry args={[0.09, 0.11, 0.06, 8]} />
              <meshStandardMaterial
                ref={i === 0 ? helipadBeaconMatRef : undefined}
                color="#fb923c"
                emissive="#f97316"
                emissiveIntensity={1.2}
                roughness={0.25}
              />
            </mesh>
          );
        })}
      </group>

      {/* 4. RIGHT-REAR WATERLINE STATION: Floating Teak Marina Yacht Slip & Mooring Jetty ([4.8, -1.92, -7.2]) */}
      <group position={[4.85, -1.92, -6.95]}>
        <mesh receiveShadow>
          <boxGeometry args={[5.4, 0.24, 2.2]} />
          <meshStandardMaterial color="#6e4c30" roughness={0.78} metalness={0.08} />
        </mesh>
        {/* Stainless Mooring Bollards */}
        {[-2.1, 0, 2.1].map((bx) => (
          <mesh key={bx} position={[bx, 0.24, -0.82]}>
            <cylinderGeometry args={[0.08, 0.1, 0.28, 8]} />
            <meshStandardMaterial color="#cbd5e1" metalness={0.85} roughness={0.2} />
          </mesh>
        ))}
      </group>

      {/* 5. LEFT FOREGROUND STATION: Tactical Expedition Crate & Arsenal Display Table ([-2.25, 0.02, -1.95]) */}
      <group position={[-2.25, 0.02, -1.95]} rotation={[0, 0.42, 0]}>
        {/* Brushed Steel & Teak Expedition Table */}
        <mesh position={[0, 0.34, 0]} receiveShadow>
          <boxGeometry args={[1.55, 0.68, 0.86]} />
          <meshStandardMaterial color="#1e293b" metalness={0.62} roughness={0.38} />
        </mesh>
        <mesh position={[0, 0.7, 0]} receiveShadow>
          <boxGeometry args={[1.64, 0.06, 0.94]} />
          <meshStandardMaterial color="#7c5637" roughness={0.65} metalness={0.12} />
        </mesh>
        {/* Tactical Supply Crate & Ammo Case */}
        <mesh position={[-0.38, 0.88, 0.04]} castShadow>
          <boxGeometry args={[0.56, 0.32, 0.44]} />
          <meshStandardMaterial color="#365314" roughness={0.62} metalness={0.24} />
        </mesh>
        <mesh position={[-0.38, 0.96, 0.04]}>
          <boxGeometry args={[0.58, 0.05, 0.46]} />
          <meshStandardMaterial color="#eab308" metalness={0.72} roughness={0.28} />
        </mesh>
        {/* Illuminated Weapon Display Cradle Pillar */}
        <mesh position={[0.36, 0.86, 0]}>
          <boxGeometry args={[0.62, 0.26, 0.38]} />
          <meshStandardMaterial color="#0f172a" metalness={0.78} roughness={0.24} />
        </mesh>
        <mesh position={[0.36, 1.0, 0]}>
          <boxGeometry args={[0.54, 0.025, 0.28]} />
          <meshStandardMaterial color="#e5c384" emissive="#fb923c" emissiveIntensity={0.65} metalness={0.85} roughness={0.2} />
        </mesh>
      </group>

      {/* Coastal Glass & Bronze Balustrade along Water's Edge */}
      <mesh position={[0, 0.9, -6.55]}>
        <boxGeometry args={[20.8, 0.08, 0.12]} />
        <meshStandardMaterial color="#273240" metalness={0.72} roughness={0.28} />
      </mesh>
      <mesh position={[0, 0.04, -6.48]}>
        <boxGeometry args={[20.4, 0.045, 0.065]} />
        <meshStandardMaterial
          ref={balustradeLedMatRef}
          color="#fde68a"
          emissive="#fb923c"
          emissiveIntensity={0.32}
          roughness={0.24}
        />
      </mesh>
      {Array.from({ length: 9 }, (_, i) => (
        <group key={i} position={[(i - 4) * 2.48, 0, -6.55]}>
          <mesh position={[0, 0.45, 0]}>
            <boxGeometry args={[0.08, 0.9, 0.12]} />
            <meshStandardMaterial color="#273240" metalness={0.62} roughness={0.35} />
          </mesh>
          {i < 8 && (
            <mesh position={[1.24, 0.44, 0]}>
              <boxGeometry args={[2.38, 0.74, 0.022]} />
              <meshPhysicalMaterial
                color="#bae6fd"
                transparent
                opacity={0.13}
                roughness={0.12}
                metalness={0.1}
                depthWrite={false}
              />
            </mesh>
          )}
        </group>
      ))}

      {/* Single Lightweight Stage Key Light (avoids multi-light fragment shader throttling) */}
      <pointLight
        ref={keyLightRef}
        position={[2.4, 3.8, 3.2]}
        color="#fff1d8"
        intensity={12}
        distance={15}
        decay={2}
      />
    </group>
  );
}
