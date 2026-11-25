import React, { useMemo, useRef } from 'react';
import * as THREE from 'three';
import { useFrame } from '@react-three/fiber';
import {
  AMUSEMENT_PARK_RIDES,
  OCEAN_AMUSEMENT_PIER,
  sampleCoasterTrack,
} from '../game/worldMath';
import { simState } from '../game/store';

const GONDOLA_COLORS = [
  '#ef4444',
  '#38bdf8',
  '#f59e0b',
  '#10b981',
  '#ec4899',
  '#8b5cf6',
  '#f97316',
  '#06b6d4',
  '#eab308',
  '#14b8a6',
  '#f43f5e',
  '#6366f1',
];

const STEED_COLORS = [
  '#f8fafc',
  '#f59e0b',
  '#38bdf8',
  '#ec4899',
  '#e2e8f0',
  '#fbbf24',
  '#a855f7',
  '#34d399',
];

export function AmusementPark() {
  const wheelRotorRef = useRef<THREE.Group>(null);
  const gondolaRefs = useRef<Array<THREE.Group | null>>([]);
  const carouselRotorRef = useRef<THREE.Group>(null);
  const steedRefs = useRef<Array<THREE.Group | null>>([]);
  const coasterCarRefs = useRef<Array<THREE.Group | null>>([]);
  const dropRingRef = useRef<THREE.Group>(null);

  const pierY = OCEAN_AMUSEMENT_PIER.deckY;

  // Build closed 3D roller-coaster track rails + vertical support pylons onto the Ocean Pier once
  const { leftRailGeo, rightRailGeo, spineGeo, pylons, ties } = useMemo(() => {
    const sampleCount = 128;
    const leftPts: THREE.Vector3[] = [];
    const rightPts: THREE.Vector3[] = [];
    const spinePts: THREE.Vector3[] = [];
    const tieList: Array<{ pos: [number, number, number]; rot: [number, number, number] }> = [];
    const pylonList: Array<{ x: number; z: number; h: number; y: number }> = [];

    const up = new THREE.Vector3(0, 1, 0);
    for (let i = 0; i < sampleCount; i++) {
      const u = i / sampleCount;
      const { pos, tangent, bank } = sampleCoasterTrack(u);
      const right = new THREE.Vector3().crossVectors(tangent, up).normalize();
      const bankedRight = right.clone().applyAxisAngle(tangent, bank);
      const bankedUp = new THREE.Vector3().crossVectors(bankedRight, tangent).normalize();

      leftPts.push(pos.clone().addScaledVector(bankedRight, -0.78));
      rightPts.push(pos.clone().addScaledVector(bankedRight, 0.78));
      spinePts.push(pos.clone().addScaledVector(bankedUp, -0.45));

      if (i % 2 === 0) {
        const m = new THREE.Matrix4().makeBasis(bankedRight, bankedUp, tangent);
        const e = new THREE.Euler().setFromRotationMatrix(m, 'YXZ');
        tieList.push({
          pos: [pos.x, pos.y - 0.14, pos.z],
          rot: [e.x, e.y, e.z],
        });
      }
      if (i % 8 === 0) {
        const h = Math.max(1.5, pos.y - 0.45 - pierY);
        pylonList.push({ x: pos.x, z: pos.z, h, y: pierY + h * 0.5 });
      }
    }

    const leftCurve = new THREE.CatmullRomCurve3(leftPts, true);
    const rightCurve = new THREE.CatmullRomCurve3(rightPts, true);
    const spineCurve = new THREE.CatmullRomCurve3(spinePts, true);

    return {
      leftRailGeo: new THREE.TubeGeometry(leftCurve, 144, 0.14, 7, true),
      rightRailGeo: new THREE.TubeGeometry(rightCurve, 144, 0.14, 7, true),
      spineGeo: new THREE.TubeGeometry(spineCurve, 144, 0.24, 7, true),
      pylons: pylonList,
      ties: tieList,
    };
  }, [pierY]);

  useFrame((state) => {
    if (simState.startMenuOpen) return;
    const t = state.clock.elapsedTime;

    // 1. Solaris Sky Wheel rotation (counter-rotate gondolas so cabins stay level over the ocean)
    const wheelAngle = t * 0.32;
    if (wheelRotorRef.current) {
      wheelRotorRef.current.rotation.x = wheelAngle;
    }
    for (let i = 0; i < 12; i++) {
      const cab = gondolaRefs.current[i];
      if (cab) cab.rotation.x = -wheelAngle;
    }

    // 2. Grand Riviera Carousel rotation & galloping steeds
    if (carouselRotorRef.current) {
      carouselRotorRef.current.rotation.y = -t * 0.95;
    }
    for (let i = 0; i < 8; i++) {
      const steed = steedRefs.current[i];
      if (steed) {
        steed.position.y = 1.45 + Math.sin(t * 3.8 + i * 0.8) * 0.48;
      }
    }

    // 3. Cyclone Pier Coaster 3-car articulated train
    for (let c = 0; c < 3; c++) {
      const car = coasterCarRefs.current[c];
      if (!car) continue;
      const u = ((t * 0.072 - c * 0.019) % 1 + 1) % 1;
      const sample = sampleCoasterTrack(u);
      car.position.copy(sample.pos);
      const yaw = Math.atan2(sample.tangent.x, sample.tangent.z);
      const pitch = -Math.asin(THREE.MathUtils.clamp(sample.tangent.y, -0.85, 0.85));
      car.rotation.set(pitch, yaw, sample.bank, 'YXZ');
    }

    // 4. Stratosphere Drop Tower 64m Freefall Ring at the Ocean Tip of the Pier
    if (dropRingRef.current) {
      const cycle = (t % 14) / 14;
      let heightFrac = 0;
      if (cycle < 0.58) {
        const x = cycle / 0.58;
        heightFrac = x * x * (3 - 2 * x);
      } else if (cycle < 0.72) {
        heightFrac = 1.0;
      } else if (cycle < 0.86) {
        const dropT = (cycle - 0.72) / 0.14;
        heightFrac = Math.max(0, 1 - dropT * dropT);
      } else {
        heightFrac = 0;
      }
      dropRingRef.current.position.y = 3.2 + heightFrac * 52.0;
      dropRingRef.current.rotation.y = t * 0.25;
    }
  });

  return (
    <group name="AzureaWonderOceanPier">
      {/* =================================================================== */}
      {/* 0. GRAND OCEAN AMUSEMENT PIER (z = -515..-685, 96m x 170m Over-Ocean Boardwalk) */}
      {/* =================================================================== */}
      <group position={[0, 0, -600]}>
        {/* Heavy Timber & Brushed Teak Boardwalk Deck above Ocean Waves */}
        <mesh position={[0, pierY - 0.35, 0]} receiveShadow castShadow>
          <boxGeometry args={[96, 0.7, 170]} />
          <meshStandardMaterial color="#855836" roughness={0.68} metalness={0.08} />
        </mesh>
        {/* Central Neon Promenade Walkway Carpet */}
        <mesh position={[0, pierY + 0.02, 0]} receiveShadow>
          <boxGeometry args={[18, 0.04, 162]} />
          <meshStandardMaterial color="#1e293b" roughness={0.45} metalness={0.25} />
        </mesh>
        {/* Glowing Magenta & Cyan Pier Perimeter Neon Strips */}
        {[-47.6, 47.6].map((px, idx) => (
          <mesh key={idx} position={[px, pierY + 0.12, 0]}>
            <boxGeometry args={[0.45, 0.24, 170]} />
            <meshStandardMaterial
              color={idx === 0 ? '#ec4899' : '#38bdf8'}
              emissive={idx === 0 ? '#db2777' : '#0284c7'}
              emissiveIntensity={1.6}
            />
          </mesh>
        ))}
        <mesh position={[0, pierY + 0.12, -84.8]}>
          <boxGeometry args={[96, 0.24, 0.45]} />
          <meshStandardMaterial color="#fde047" emissive="#f59e0b" emissiveIntensity={1.6} />
        </mesh>

        {/* Deep-Water Concrete & Steel Pier Pilings Driven Into the Ocean Seabed */}
        {[-42, -21, 0, 21, 42].flatMap((px) =>
          [-75, -50, -25, 0, 25, 50, 75].map((pz) => (
            <group key={`${px}_${pz}`} position={[px, -1.8, pz]}>
              <mesh castShadow>
                <cylinderGeometry args={[0.85, 1.05, 9.8, 10]} />
                <meshStandardMaterial color="#475569" roughness={0.75} metalness={0.25} />
              </mesh>
              {/* Tidal Barnacle / Waterline Collar */}
              <mesh position={[0, 1.8, 0]}>
                <cylinderGeometry args={[1.15, 1.18, 1.4, 10]} />
                <meshStandardMaterial color="#334155" roughness={0.85} />
              </mesh>
            </group>
          ))
        )}

        {/* Pier Entrance Neon Archway at North Shoreline (z = -518) */}
        <group position={[0, pierY, 82]}>
          {[-10.5, 10.5].map((ax) => (
            <mesh key={ax} position={[ax, 5.5, 0]} castShadow>
              <cylinderGeometry args={[0.55, 0.7, 11, 12]} />
              <meshStandardMaterial color="#ec4899" emissive="#be185d" emissiveIntensity={0.9} metalness={0.5} roughness={0.25} />
            </mesh>
          ))}
          <mesh position={[0, 10.8, 0]}>
            <boxGeometry args={[23.5, 1.8, 1.4]} />
            <meshStandardMaterial color="#0f172a" roughness={0.3} metalness={0.6} />
          </mesh>
          <mesh position={[0, 10.8, 0.76]}>
            <boxGeometry args={[21.5, 0.45, 0.12]} />
            <meshStandardMaterial color="#fde047" emissive="#f59e0b" emissiveIntensity={2.0} />
          </mesh>
        </group>

        {/* Boardwalk String-Light Festoon Pylons Along the Ocean Pier */}
        {[-68, -44, -20, 4, 28, 52, 72].flatMap((pz, idx) =>
          [-45.5, 45.5].map((px, sIdx) => {
            const col = (idx + sIdx) % 2 === 0 ? '#ec4899' : '#38bdf8';
            return (
              <group key={`lamp_${pz}_${px}`} position={[px, pierY, pz]}>
                <mesh position={[0, 2.8, 0]}>
                  <cylinderGeometry args={[0.12, 0.16, 5.6, 8]} />
                  <meshStandardMaterial color="#1e293b" metalness={0.7} roughness={0.25} />
                </mesh>
                <mesh position={[0, 5.75, 0]}>
                  <sphereGeometry args={[0.38, 10, 10]} />
                  <meshStandardMaterial color={col} emissive={col} emissiveIntensity={2.2} />
                </mesh>
              </group>
            );
          })
        )}
      </group>

      {/* =================================================================== */}
      {/* 1. SOLARIS SKY WHEEL (46m Giant Ocean Pier Ferris Wheel, x=-24, z=-625) */}
      {/* =================================================================== */}
      <group position={[-24, pierY, -625]}>
        {/* Boarding Deck & Neon Ticket Arch */}
        <mesh position={[0, 0.4, 0]} receiveShadow castShadow>
          <boxGeometry args={[14, 0.8, 46]} />
          <meshStandardMaterial color="#1e293b" roughness={0.45} metalness={0.35} />
        </mesh>
        <mesh position={[0, 0.84, 0]}>
          <boxGeometry args={[14.4, 0.12, 46.4]} />
          <meshStandardMaterial color="#ec4899" emissive="#db2777" emissiveIntensity={1.2} />
        </mesh>

        {/* Heavy A-Frame Support Legs */}
        {[-3.4, 3.4].map((xSide) => (
          <React.Fragment key={xSide}>
            <mesh position={[xSide, 13.0, -9.5]} rotation={[0.36, 0, 0]} castShadow>
              <cylinderGeometry args={[0.45, 0.72, 27.5, 10]} />
              <meshStandardMaterial color="#f8fafc" metalness={0.6} roughness={0.25} />
            </mesh>
            <mesh position={[xSide, 13.0, 9.5]} rotation={[-0.36, 0, 0]} castShadow>
              <cylinderGeometry args={[0.45, 0.72, 27.5, 10]} />
              <meshStandardMaterial color="#f8fafc" metalness={0.6} roughness={0.25} />
            </mesh>
          </React.Fragment>
        ))}

        {/* Central Hub Axle */}
        <mesh position={[0, 25.5, 0]} rotation={[0, 0, Math.PI / 2]}>
          <cylinderGeometry args={[1.4, 1.4, 8.2, 16]} />
          <meshStandardMaterial color="#fbbf24" emissive="#f59e0b" emissiveIntensity={0.8} metalness={0.75} roughness={0.2} />
        </mesh>

        {/* Rotating Wheel Rim, Spokes & 12 Self-Leveling Panoramic Gondolas */}
        <group ref={wheelRotorRef} position={[0, 25.5, 0]}>
          {[-2.4, 2.4].map((xRim) => (
            <mesh key={xRim} position={[xRim, 0, 0]} rotation={[0, Math.PI / 2, 0]}>
              <torusGeometry args={[20.5, 0.36, 10, 48]} />
              <meshStandardMaterial color="#38bdf8" emissive="#0284c7" emissiveIntensity={1.4} metalness={0.5} roughness={0.2} />
            </mesh>
          ))}
          {[-2.4, 2.4].map((xRim) => (
            <mesh key={'inner-' + xRim} position={[xRim, 0, 0]} rotation={[0, Math.PI / 2, 0]}>
              <torusGeometry args={[13.5, 0.22, 8, 36]} />
              <meshStandardMaterial color="#ec4899" emissive="#db2777" emissiveIntensity={1.2} />
            </mesh>
          ))}

          {Array.from({ length: 12 }, (_, i) => {
            const ang = (i / 12) * Math.PI * 2;
            const sy = Math.sin(ang) * 20.5;
            const sz = Math.cos(ang) * 20.5;
            const col = GONDOLA_COLORS[i % GONDOLA_COLORS.length];
            return (
              <React.Fragment key={i}>
                {/* Dual Spokes */}
                {[-2.3, 2.3].map((sx) => (
                  <mesh
                    key={sx}
                    position={[sx, sy * 0.5, sz * 0.5]}
                    rotation={[ang, 0, 0]}
                  >
                    <cylinderGeometry args={[0.11, 0.11, 20.5, 6]} />
                    <meshStandardMaterial color="#e2e8f0" metalness={0.7} roughness={0.25} />
                  </mesh>
                ))}

                {/* Counter-rotating Panoramic Gondola Cabin */}
                <group
                  ref={(el) => {
                    gondolaRefs.current[i] = el;
                  }}
                  position={[0, sy, sz]}
                >
                  <mesh position={[0, 0, 0]}>
                    <cylinderGeometry args={[0.14, 0.14, 4.8, 8]} />
                    <meshStandardMaterial color="#94a3b8" metalness={0.8} />
                  </mesh>
                  <mesh position={[0, -1.45, 0]} castShadow>
                    <cylinderGeometry args={[1.65, 1.35, 2.1, 12]} />
                    <meshStandardMaterial color={col} roughness={0.22} metalness={0.35} />
                  </mesh>
                  <mesh position={[0, -1.25, 0]}>
                    <cylinderGeometry args={[1.7, 1.7, 0.85, 12]} />
                    <meshStandardMaterial
                      color="#e0f2fe"
                      emissive={col}
                      emissiveIntensity={0.45}
                      roughness={0.08}
                      metalness={0.9}
                    />
                  </mesh>
                </group>
              </React.Fragment>
            );
          })}
        </group>
      </group>

      {/* =================================================================== */}
      {/* 2. GRAND RIVIERA CAROUSEL (Gilded Pier Pavilion & Galloping Steeds) */}
      {/* =================================================================== */}
      <group position={[0, pierY, -556]}>
        {/* Stepped Marble & Gold Plinth */}
        <mesh position={[0, 0.35, 0]} receiveShadow>
          <cylinderGeometry args={[9.5, 10.4, 0.7, 32]} />
          <meshStandardMaterial color="#1e293b" roughness={0.4} metalness={0.3} />
        </mesh>
        <mesh position={[0, 0.75, 0]}>
          <cylinderGeometry args={[8.8, 9.2, 0.18, 32]} />
          <meshStandardMaterial color="#fbbf24" emissive="#d97706" emissiveIntensity={0.75} metalness={0.8} roughness={0.2} />
        </mesh>

        {/* Central Mirrored Column */}
        <mesh position={[0, 4.2, 0]}>
          <cylinderGeometry args={[1.35, 1.55, 6.8, 16]} />
          <meshStandardMaterial color="#fde047" emissive="#ca8a04" emissiveIntensity={0.6} metalness={0.85} roughness={0.18} />
        </mesh>

        {/* Striped Royal Pavilion Canopy Dome */}
        <mesh position={[0, 8.8, 0]} castShadow>
          <coneGeometry args={[9.8, 3.6, 24]} />
          <meshStandardMaterial color="#ec4899" roughness={0.32} metalness={0.2} />
        </mesh>
        <mesh position={[0, 7.1, 0]}>
          <cylinderGeometry args={[9.85, 9.85, 0.45, 24]} />
          <meshStandardMaterial color="#fde047" emissive="#f59e0b" emissiveIntensity={1.1} />
        </mesh>
        <mesh position={[0, 11.1, 0]}>
          <sphereGeometry args={[0.75, 12, 12]} />
          <meshStandardMaterial color="#fde047" emissive="#f59e0b" emissiveIntensity={1.6} />
        </mesh>

        {/* Rotating Turntable, Brass Poles & 8 Galloping Steeds */}
        <group ref={carouselRotorRef} position={[0, 0.85, 0]}>
          <mesh position={[0, 0.08, 0]} receiveShadow>
            <cylinderGeometry args={[8.4, 8.4, 0.16, 32]} />
            <meshStandardMaterial color="#78350f" roughness={0.45} />
          </mesh>

          {Array.from({ length: 8 }, (_, i) => {
            const ang = (i / 8) * Math.PI * 2;
            const r = 6.2;
            const sx = Math.cos(ang) * r;
            const sz = Math.sin(ang) * r;
            const tangentYaw = -ang;
            const col = STEED_COLORS[i % STEED_COLORS.length];
            return (
              <group key={i} position={[sx, 0, sz]} rotation={[0, tangentYaw, 0]}>
                {/* Brass Pole */}
                <mesh position={[0, 3.1, 0]}>
                  <cylinderGeometry args={[0.08, 0.08, 6.2, 8]} />
                  <meshStandardMaterial color="#fbbf24" metalness={0.92} roughness={0.12} />
                </mesh>
                {/* Galloping Steed / Chariot Mount */}
                <group
                  ref={(el) => {
                    steedRefs.current[i] = el;
                  }}
                  position={[0, 1.45, 0]}
                >
                  <mesh castShadow>
                    <boxGeometry args={[0.68, 0.72, 1.65]} />
                    <meshStandardMaterial color={col} roughness={0.25} metalness={0.2} />
                  </mesh>
                  {/* Saddle */}
                  <mesh position={[0, 0.42, -0.1]}>
                    <boxGeometry args={[0.74, 0.18, 0.68]} />
                    <meshStandardMaterial color="#dc2626" roughness={0.4} />
                  </mesh>
                  {/* Neck & Head */}
                  <mesh position={[0, 0.58, 0.65]} rotation={[0.35, 0, 0]}>
                    <boxGeometry args={[0.42, 0.75, 0.45]} />
                    <meshStandardMaterial color={col} roughness={0.25} />
                  </mesh>
                  <mesh position={[0, 0.92, 0.88]} rotation={[0.2, 0, 0]}>
                    <boxGeometry args={[0.36, 0.34, 0.58]} />
                    <meshStandardMaterial color={col} roughness={0.25} />
                  </mesh>
                </group>
              </group>
            );
          })}
        </group>
      </group>

      {/* =================================================================== */}
      {/* 3. CYCLONE PIER COASTER (Over-Water Steel Track + 3-Car Train)      */}
      {/* =================================================================== */}
      <group>
        {/* Coaster Boarding Station Platform on East Pier Deck at (24, -600) */}
        <group position={[24, pierY, -600]}>
          <mesh position={[0, 2.2, 0]} receiveShadow castShadow>
            <boxGeometry args={[14, 4.4, 18]} />
            <meshStandardMaterial color="#0f172a" roughness={0.45} metalness={0.35} />
          </mesh>
          <mesh position={[0, 4.5, 0]}>
            <boxGeometry args={[14.6, 0.25, 18.6]} />
            <meshStandardMaterial color="#38bdf8" emissive="#0284c7" emissiveIntensity={1.2} />
          </mesh>
          <mesh position={[0, 7.6, 0]}>
            <boxGeometry args={[14.8, 0.5, 18.8]} />
            <meshStandardMaterial color="#f59e0b" roughness={0.3} metalness={0.45} />
          </mesh>
        </group>

        {/* Continuous Tubular Steel Coaster Rails & Box Spine */}
        <mesh geometry={leftRailGeo} castShadow>
          <meshStandardMaterial color="#f43f5e" emissive="#e11d48" emissiveIntensity={0.35} metalness={0.65} roughness={0.22} />
        </mesh>
        <mesh geometry={rightRailGeo} castShadow>
          <meshStandardMaterial color="#f43f5e" emissive="#e11d48" emissiveIntensity={0.35} metalness={0.65} roughness={0.22} />
        </mesh>
        <mesh geometry={spineGeo} castShadow>
          <meshStandardMaterial color="#fbbf24" metalness={0.55} roughness={0.28} />
        </mesh>

        {/* Track Cross-Ties */}
        {ties.map((tie, idx) => (
          <mesh key={idx} position={tie.pos} rotation={tie.rot}>
            <boxGeometry args={[1.7, 0.12, 0.22]} />
            <meshStandardMaterial color="#e2e8f0" metalness={0.6} roughness={0.3} />
          </mesh>
        ))}

        {/* Vertical Steel Support Pylons Anchored to the Ocean Pier Deck */}
        {pylons.map((p, idx) => (
          <mesh key={idx} position={[p.x, p.y, p.z]} castShadow>
            <cylinderGeometry args={[0.32, 0.44, p.h, 8]} />
            <meshStandardMaterial color="#38bdf8" metalness={0.55} roughness={0.32} />
          </mesh>
        ))}

        {/* 3-Car Articulated Hyper-Coaster Train */}
        {[0, 1, 2].map((cIdx) => (
          <group
            key={cIdx}
            ref={(el) => {
              coasterCarRefs.current[cIdx] = el;
            }}
          >
            <mesh position={[0, 0.55, 0]} castShadow>
              <boxGeometry args={[1.95, 0.95, 3.2]} />
              <meshStandardMaterial
                color={cIdx === 0 ? '#38bdf8' : '#f43f5e'}
                emissive={cIdx === 0 ? '#0284c7' : '#be123c'}
                emissiveIntensity={0.45}
                metalness={0.65}
                roughness={0.18}
              />
            </mesh>
            {/* Aerodynamic Nose Fairing & Restraint Bar */}
            <mesh position={[0, 0.85, 1.1]}>
              <boxGeometry args={[1.75, 0.45, 0.85]} />
              <meshStandardMaterial color="#fde047" emissive="#f59e0b" emissiveIntensity={0.8} />
            </mesh>
            <mesh position={[0, 1.05, -0.3]}>
              <boxGeometry args={[1.55, 0.55, 1.2]} />
              <meshStandardMaterial color="#0f172a" roughness={0.4} />
            </mesh>
          </group>
        ))}
      </group>

      {/* =================================================================== */}
      {/* 4. STRATOSPHERE DROP TOWER (64m Pier-Tip Freefall Spire, z=-662)    */}
      {/* =================================================================== */}
      <group position={[0, pierY, -662]}>
        {/* Launch Pad Base */}
        <mesh position={[0, 0.45, 0]} receiveShadow>
          <cylinderGeometry args={[9.5, 10.8, 0.9, 24]} />
          <meshStandardMaterial color="#0f172a" roughness={0.42} metalness={0.4} />
        </mesh>
        <mesh position={[0, 0.95, 0]}>
          <cylinderGeometry args={[8.6, 9.0, 0.16, 24]} />
          <meshStandardMaterial color="#a855f7" emissive="#9333ea" emissiveIntensity={1.2} />
        </mesh>

        {/* 64m Lattice Steel Tower Core */}
        <mesh position={[0, 31.0, 0]} castShadow>
          <cylinderGeometry args={[1.75, 2.25, 62.0, 16]} />
          <meshStandardMaterial color="#f8fafc" metalness={0.7} roughness={0.22} />
        </mesh>
        {/* 4 Corner Neon Guide Rails */}
        {[
          [-1.95, -1.95],
          [1.95, -1.95],
          [-1.95, 1.95],
          [1.95, 1.95],
        ].map(([gx, gz], idx) => (
          <mesh key={idx} position={[gx, 31.0, gz]}>
            <boxGeometry args={[0.26, 61.5, 0.26]} />
            <meshStandardMaterial
              color={idx % 2 === 0 ? '#38bdf8' : '#ec4899'}
              emissive={idx % 2 === 0 ? '#0284c7' : '#db2777'}
              emissiveIntensity={1.3}
            />
          </mesh>
        ))}

        {/* Crown Observation Beacon at 63m */}
        <mesh position={[0, 62.4, 0]}>
          <cylinderGeometry args={[4.4, 2.6, 2.6, 16]} />
          <meshStandardMaterial color="#fbbf24" emissive="#f59e0b" emissiveIntensity={1.5} metalness={0.7} roughness={0.2} />
        </mesh>
        <mesh position={[0, 65.8, 0]}>
          <cylinderGeometry args={[0.12, 0.35, 4.8, 8]} />
          <meshStandardMaterial color="#f43f5e" emissive="#e11d48" emissiveIntensity={2.2} />
        </mesh>

        {/* Animated Freefall Passenger Ring */}
        <group ref={dropRingRef} position={[0, 3.2, 0]}>
          <mesh rotation={[Math.PI / 2, 0, 0]} castShadow>
            <torusGeometry args={[3.6, 0.62, 12, 24]} />
            <meshStandardMaterial color="#f59e0b" emissive="#d97706" emissiveIntensity={0.85} metalness={0.65} roughness={0.2} />
          </mesh>
          {Array.from({ length: 12 }, (_, sIdx) => {
            const sAng = (sIdx / 12) * Math.PI * 2;
            return (
              <mesh
                key={sIdx}
                position={[Math.sin(sAng) * 3.85, -0.25, Math.cos(sAng) * 3.85]}
                rotation={[0, sAng, 0]}
              >
                <boxGeometry args={[0.68, 0.95, 0.65]} />
                <meshStandardMaterial color="#0ea5e9" roughness={0.3} metalness={0.5} />
              </mesh>
            );
          })}
        </group>
      </group>

      {/* =================================================================== */}
      {/* RIDE BOARDING BEACON RINGS ON THE OCEAN PIER DECK                   */}
      {/* =================================================================== */}
      {AMUSEMENT_PARK_RIDES.map((ride) => (
        <mesh
          key={ride.id}
          position={[ride.x, pierY + 0.08, ride.z]}
          rotation={[-Math.PI / 2, 0, 0]}
        >
          <ringGeometry args={[3.2, 3.85, 32]} />
          <meshStandardMaterial
            color="#fde047"
            emissive="#f59e0b"
            emissiveIntensity={1.6}
            side={THREE.DoubleSide}
          />
        </mesh>
      ))}
    </group>
  );
}
