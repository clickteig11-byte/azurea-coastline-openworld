import React, { useMemo, useRef } from 'react';
import * as THREE from 'three';
import { useFrame } from '@react-three/fiber';
import {
  AMUSEMENT_PARK_RIDES,
  OCEAN_AMUSEMENT_PIER,
  sampleCoasterTrack,
  sampleCoasterU,
} from '../game/worldMath';
import { simState } from '../game/store';
import { createBoardwalkWoodPBR } from './Textures';

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

interface MidwayBoothSpec {
  label: string;
  x: number;
  z: number;
  rotY: number;
  stripeA: string;
  stripeB: string;
  accent: string;
}

const MIDWAY_BOOTHS: MidwayBoothSpec[] = [
  { label: 'TICKETS', x: -34, z: 62, rotY: Math.PI / 2, stripeA: '#dc2626', stripeB: '#fef3c7', accent: '#fbbf24' },
  { label: 'ARCADE', x: -34, z: 42, rotY: Math.PI / 2, stripeA: '#0284c7', stripeB: '#fef3c7', accent: '#38bdf8' },
  { label: 'CHURROS', x: -34, z: 22, rotY: Math.PI / 2, stripeA: '#ea580c', stripeB: '#fef3c7', accent: '#fb923c' },
  { label: 'ICE CREAM', x: 34, z: 62, rotY: -Math.PI / 2, stripeA: '#ec4899', stripeB: '#fff1f2', accent: '#f472b6' },
  { label: 'RING TOSS', x: 34, z: 42, rotY: -Math.PI / 2, stripeA: '#dc2626', stripeB: '#fef3c7', accent: '#fde047' },
  { label: 'SKY BAR', x: 34, z: 22, rotY: -Math.PI / 2, stripeA: '#0f766e', stripeB: '#fef3c7', accent: '#2dd4bf' },
];

function createSignTexture(title: string, subtitle?: string, bg = '#0f172a', fg = '#fde047'): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 160;
  const ctx = canvas.getContext('2d')!;

  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, 512, 160);

  // Art-Deco double gold border
  ctx.strokeStyle = fg;
  ctx.lineWidth = 6;
  ctx.strokeRect(10, 10, 492, 140);
  ctx.lineWidth = 2;
  ctx.strokeRect(20, 20, 472, 120);

  ctx.fillStyle = fg;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.font = subtitle ? '900 58px Georgia, serif' : '900 66px Georgia, serif';
  ctx.fillText(title, 256, subtitle ? 68 : 82);

  if (subtitle) {
    ctx.fillStyle = '#f8fafc';
    ctx.font = '700 22px ui-monospace, monospace';
    ctx.fillText(subtitle, 256, 118);
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return tex;
}

export function AmusementPark() {
  const wheelRotorRef = useRef<THREE.Group>(null);
  const gondolaRefs = useRef<Array<THREE.Group | null>>([]);
  const carouselRotorRef = useRef<THREE.Group>(null);
  const steedRefs = useRef<Array<THREE.Group | null>>([]);
  const coasterCarRefs = useRef<Array<THREE.Group | null>>([]);
  const dropRingRef = useRef<THREE.Group>(null);

  const pierY = OCEAN_AMUSEMENT_PIER.deckY;

  const { woodTex, pierMarqueeTex, boothTextures } = useMemo(() => {
    const wt = createBoardwalkWoodPBR();
    wt.repeat.set(12, 22);
    const marquee = createSignTexture('WONDER PIER', 'AZUREA COASTLINE BOARDWALK', '#0f172a', '#fbbf24');
    const bTex = MIDWAY_BOOTHS.map((b) => createSignTexture(b.label, undefined, '#172554', b.accent));
    return { woodTex: wt, pierMarqueeTex: marquee, boothTextures: bTex };
  }, []);

  // Build closed 3D roller-coaster track rails + steel A-frame support bents onto the Ocean Pier
  const { leftRailGeo, rightRailGeo, spineGeo, bents, ties } = useMemo(() => {
    const sampleCount = 144;
    const leftPts: THREE.Vector3[] = [];
    const rightPts: THREE.Vector3[] = [];
    const spinePts: THREE.Vector3[] = [];
    const tieList: Array<{ pos: [number, number, number]; rot: [number, number, number] }> = [];
    const bentList: Array<{ x: number; z: number; h: number; y: number; yaw: number }> = [];

    for (let i = 0; i < sampleCount; i++) {
      const u = i / sampleCount;
      const { pos, tangent, bankedRight, bankedUp } = sampleCoasterTrack(u);

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
      if (i % 9 === 0) {
        const h = Math.max(1.5, pos.y - 0.45 - pierY);
        const yaw = Math.atan2(tangent.x, tangent.z);
        bentList.push({ x: pos.x, z: pos.z, h, y: pierY + h * 0.5, yaw });
      }
    }

    const leftCurve = new THREE.CatmullRomCurve3(leftPts, true);
    const rightCurve = new THREE.CatmullRomCurve3(rightPts, true);
    const spineCurve = new THREE.CatmullRomCurve3(spinePts, true);

    return {
      leftRailGeo: new THREE.TubeGeometry(leftCurve, 168, 0.15, 8, true),
      rightRailGeo: new THREE.TubeGeometry(rightCurve, 168, 0.15, 8, true),
      spineGeo: new THREE.TubeGeometry(spineCurve, 168, 0.25, 8, true),
      bents: bentList,
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

    // 3. Cyclone Pier Coaster 3-car articulated hyper-coaster train synced with sampleCoasterU(t)
    const leadU = sampleCoasterU(t);
    const hideLeadForFpv = simState.activeRide === 'COASTER' && simState.cameraView === 1;
    for (let c = 0; c < 3; c++) {
      const car = coasterCarRefs.current[c];
      if (!car) continue;
      car.visible = !(c === 0 && hideLeadForFpv);
      const u = ((leadU - c * 0.017) % 1 + 1) % 1;
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

  const catenaryZPositions = [72, 54, 36, 18, 0, -18, -36];

  return (
    <group name="AzureaWonderOceanPier">
      {/* =================================================================== */}
      {/* 0. GRAND OCEAN AMUSEMENT PIER (z = -515..-685, 96m x 170m Boardwalk) */}
      {/* =================================================================== */}
      <group position={[0, 0, -600]}>
        {/* Weathered Sun-Bleached Teak Boardwalk Deck */}
        <mesh position={[0, pierY - 0.35, 0]} receiveShadow castShadow>
          <boxGeometry args={[96, 0.7, 170]} />
          <meshStandardMaterial map={woodTex} roughness={0.72} metalness={0.05} />
        </mesh>

        {/* Central Promenade Runner with Brass Edge Trim */}
        <mesh position={[0, pierY + 0.02, 0]} receiveShadow>
          <boxGeometry args={[16, 0.04, 162]} />
          <meshStandardMaterial color="#1e293b" roughness={0.48} metalness={0.22} />
        </mesh>
        {[-8.15, 8.15].map((tx) => (
          <mesh key={tx} position={[tx, pierY + 0.04, 0]}>
            <boxGeometry args={[0.25, 0.05, 162]} />
            <meshStandardMaterial color="#fbbf24" emissive="#d97706" emissiveIntensity={0.65} metalness={0.8} roughness={0.22} />
          </mesh>
        ))}

        {/* Wooden Perimeter Pier Railings & Warm Accent Light Trim */}
        {[-47.3, 47.3].map((px, idx) => (
          <group key={`rail_${idx}`} position={[px, pierY, 0]}>
            {/* Top & Mid Teak Handrails */}
            <mesh position={[0, 1.15, 0]} castShadow>
              <boxGeometry args={[0.26, 0.14, 169]} />
              <meshStandardMaterial color="#92400e" roughness={0.65} />
            </mesh>
            <mesh position={[0, 0.62, 0]}>
              <boxGeometry args={[0.16, 0.1, 169]} />
              <meshStandardMaterial color="#78350f" roughness={0.7} />
            </mesh>
            {/* Warm Golden Rim Accent Strip */}
            <mesh position={[0, 0.14, 0]}>
              <boxGeometry args={[0.32, 0.14, 170]} />
              <meshStandardMaterial
                color={idx === 0 ? '#f59e0b' : '#38bdf8'}
                emissive={idx === 0 ? '#d97706' : '#0284c7'}
                emissiveIntensity={1.2}
              />
            </mesh>
            {/* Vertical Baluster Posts */}
            {Array.from({ length: 22 }, (_, pIdx) => (
              <mesh key={pIdx} position={[0, 0.6, -82 + pIdx * 7.8]} castShadow>
                <boxGeometry args={[0.22, 1.24, 0.22]} />
                <meshStandardMaterial color="#78350f" roughness={0.72} />
              </mesh>
            ))}
          </group>
        ))}
        {/* Ocean-Tip Safety Railing */}
        <group position={[0, pierY, -84.4]}>
          <mesh position={[0, 1.15, 0]} castShadow>
            <boxGeometry args={[95, 0.14, 0.26]} />
            <meshStandardMaterial color="#92400e" roughness={0.65} />
          </mesh>
          <mesh position={[0, 0.14, 0]}>
            <boxGeometry args={[96, 0.16, 0.36]} />
            <meshStandardMaterial color="#fde047" emissive="#f59e0b" emissiveIntensity={1.4} />
          </mesh>
        </group>

        {/* Deep-Water Concrete & Steel Pier Pilings Driven Into the Ocean Seabed */}
        {[-42, -21, 0, 21, 42].flatMap((px) =>
          [-75, -50, -25, 0, 25, 50, 75].map((pz) => (
            <group key={`${px}_${pz}`} position={[px, -1.8, pz]}>
              <mesh castShadow>
                <cylinderGeometry args={[0.85, 1.05, 9.8, 10]} />
                <meshStandardMaterial color="#475569" roughness={0.75} metalness={0.25} />
              </mesh>
              <mesh position={[0, 1.8, 0]}>
                <cylinderGeometry args={[1.15, 1.18, 1.4, 10]} />
                <meshStandardMaterial color="#334155" roughness={0.85} />
              </mesh>
            </group>
          ))
        )}

        {/* ORNATE ART-DECO "WONDER PIER" ENTRANCE MARQUEE ARCH (z = -519 world) */}
        <group position={[0, pierY, 81]}>
          {[-12.2, 12.2].map((ax) => (
            <group key={ax} position={[ax, 0, 0]}>
              {/* Stepped Art-Deco Plinth */}
              <mesh position={[0, 0.9, 0]} castShadow>
                <boxGeometry args={[2.6, 1.8, 2.6]} />
                <meshStandardMaterial color="#1e293b" roughness={0.4} metalness={0.35} />
              </mesh>
              {/* Fluted Navy & Gold Column */}
              <mesh position={[0, 6.4, 0]} castShadow>
                <cylinderGeometry args={[0.72, 0.92, 10.2, 14]} />
                <meshStandardMaterial color="#172554" roughness={0.35} metalness={0.45} />
              </mesh>
              {/* Gold Column Rings */}
              {[2.2, 6.2, 10.6].map((ry) => (
                <mesh key={ry} position={[0, ry, 0]}>
                  <cylinderGeometry args={[0.98, 0.98, 0.34, 14]} />
                  <meshStandardMaterial color="#fbbf24" emissive="#d97706" emissiveIntensity={0.7} metalness={0.85} roughness={0.18} />
                </mesh>
              ))}
              {/* Glowing Art-Deco Finial Lantern */}
              <mesh position={[0, 12.1, 0]}>
                <sphereGeometry args={[0.68, 12, 12]} />
                <meshStandardMaterial color="#fef08a" emissive="#f59e0b" emissiveIntensity={2.4} />
              </mesh>
            </group>
          ))}

          {/* Grand Marquee Span Beam & Signboards (front & back readable) */}
          <mesh position={[0, 11.2, 0]} castShadow>
            <boxGeometry args={[26.2, 3.6, 1.65]} />
            <meshStandardMaterial color="#0f172a" roughness={0.32} metalness={0.55} />
          </mesh>
          {/* Gold Art-Deco Crest Pediment */}
          <mesh position={[0, 13.6, 0]} castShadow>
            <boxGeometry args={[16.5, 1.35, 1.25]} />
            <meshStandardMaterial color="#fbbf24" emissive="#d97706" emissiveIntensity={0.6} metalness={0.85} roughness={0.2} />
          </mesh>
          {/* Front & Back "WONDER PIER" Canvas Signboards */}
          <mesh position={[0, 11.2, 0.86]}>
            <planeGeometry args={[22.5, 3.1]} />
            <meshStandardMaterial map={pierMarqueeTex} emissive="#ffffff" emissiveMap={pierMarqueeTex} emissiveIntensity={0.42} />
          </mesh>
          <mesh position={[0, 11.2, -0.86]} rotation={[0, Math.PI, 0]}>
            <planeGeometry args={[22.5, 3.1]} />
            <meshStandardMaterial map={pierMarqueeTex} emissive="#ffffff" emissiveMap={pierMarqueeTex} emissiveIntensity={0.42} />
          </mesh>
          {/* Warm Marquee Chase Bulbs along Top & Bottom Rim */}
          {Array.from({ length: 15 }, (_, bIdx) => {
            const bx = -11.2 + bIdx * 1.6;
            return (
              <React.Fragment key={bIdx}>
                <mesh position={[bx, 13.15, 0.9]}>
                  <sphereGeometry args={[0.16, 8, 8]} />
                  <meshStandardMaterial color="#fef08a" emissive="#fbbf24" emissiveIntensity={2.5} />
                </mesh>
                <mesh position={[bx, 9.25, 0.9]}>
                  <sphereGeometry args={[0.16, 8, 8]} />
                  <meshStandardMaterial color="#fef08a" emissive="#fbbf24" emissiveIntensity={2.5} />
                </mesh>
              </React.Fragment>
            );
          })}
        </group>

        {/* 6 STRIPED MIDWAY CARNIVAL & FOOD BOOTHS (TICKETS, ARCADE, CHURROS, ICE CREAM, RING TOSS, SKY BAR) */}
        {MIDWAY_BOOTHS.map((booth, idx) => (
          <group key={booth.label} position={[booth.x, pierY, booth.z]} rotation={[0, booth.rotY, 0]}>
            {/* Timber Booth Base & Counter */}
            <mesh position={[0, 1.8, 0]} castShadow receiveShadow>
              <boxGeometry args={[9.6, 3.6, 4.6]} />
              <meshStandardMaterial color="#1e293b" roughness={0.55} metalness={0.18} />
            </mesh>
            {/* Warm Serving Counter Ledge */}
            <mesh position={[0, 1.18, 2.48]} castShadow>
              <boxGeometry args={[9.2, 0.22, 0.85]} />
              <meshStandardMaterial color="#fef3c7" roughness={0.45} />
            </mesh>
            {/* Backlit Warm Showcase Window */}
            <mesh position={[0, 2.18, 2.34]}>
              <planeGeometry args={[7.8, 1.65]} />
              <meshStandardMaterial color="#fef08a" emissive="#f59e0b" emissiveIntensity={0.85} roughness={0.2} />
            </mesh>
            {/* Alternating Striped Carnival Awning Slats */}
            {Array.from({ length: 8 }, (_, sIdx) => (
              <mesh
                key={sIdx}
                position={[-4.2 + sIdx * 1.2, 3.75, 1.9]}
                rotation={[0.38, 0, 0]}
                castShadow
              >
                <boxGeometry args={[1.22, 0.14, 2.45]} />
                <meshStandardMaterial
                  color={sIdx % 2 === 0 ? booth.stripeA : booth.stripeB}
                  roughness={0.45}
                />
              </mesh>
            ))}
            {/* Roof Fascia & Illuminated Booth Marquee Sign */}
            <mesh position={[0, 4.45, 0.4]} castShadow>
              <boxGeometry args={[10.0, 1.35, 4.9]} />
              <meshStandardMaterial color="#0f172a" roughness={0.38} metalness={0.35} />
            </mesh>
            <mesh position={[0, 4.45, 2.88]}>
              <planeGeometry args={[8.6, 1.15]} />
              <meshStandardMaterial
                map={boothTextures[idx]}
                emissive="#ffffff"
                emissiveMap={boothTextures[idx]}
                emissiveIntensity={0.48}
              />
            </mesh>
          </group>
        ))}

        {/* WARM CATENARY EDISON STRING LIGHTS & IRON PROMENADE LAMP POSTS */}
        {catenaryZPositions.map((pz, rowIdx) => (
          <group key={`catenary_${pz}`} position={[0, pierY, pz]}>
            {[-15.5, 15.5].map((px) => (
              <group key={px} position={[px, 0, 0]}>
                <mesh position={[0, 3.4, 0]} castShadow>
                  <cylinderGeometry args={[0.11, 0.16, 6.8, 8]} />
                  <meshStandardMaterial color="#1e293b" metalness={0.78} roughness={0.24} />
                </mesh>
                <mesh position={[0, 6.95, 0]}>
                  <sphereGeometry args={[0.34, 10, 10]} />
                  <meshStandardMaterial color="#fef08a" emissive="#fbbf24" emissiveIntensity={2.4} />
                </mesh>
              </group>
            ))}
            {/* Draped Warm Edison Bulbs Across the Promenade */}
            {Array.from({ length: 11 }, (_, bIdx) => {
              const frac = bIdx / 10;
              const bx = -14.5 + frac * 29.0;
              const sag = Math.sin(frac * Math.PI) * 1.45;
              const bulbColor = (rowIdx + bIdx) % 3 === 0 ? '#fde047' : '#fed7aa';
              return (
                <mesh key={bIdx} position={[bx, 6.8 - sag, 0]}>
                  <sphereGeometry args={[0.14, 8, 8]} />
                  <meshStandardMaterial color={bulbColor} emissive="#f59e0b" emissiveIntensity={2.6} />
                </mesh>
              );
            })}
          </group>
        ))}

        {/* Coastal Boardwalk Benches & Decorative Planters */}
        {[66, 50, 32, 12, -12, -32].flatMap((bz) =>
          [-12.2, 12.2].map((bx) => (
            <group key={`bench_${bz}_${bx}`} position={[bx, pierY, bz]}>
              <mesh position={[0, 0.45, 0]} castShadow>
                <boxGeometry args={[0.75, 0.12, 2.8]} />
                <meshStandardMaterial color="#92400e" roughness={0.68} />
              </mesh>
              <mesh position={[bx < 0 ? -0.32 : 0.32, 0.82, 0]} castShadow>
                <boxGeometry args={[0.12, 0.65, 2.8]} />
                <meshStandardMaterial color="#78350f" roughness={0.7} />
              </mesh>
            </group>
          ))
        )}
      </group>

      {/* =================================================================== */}
      {/* 1. SOLARIS SKY WHEEL (46m Giant Ocean Pier Ferris Wheel, x=-24, z=-625) */}
      {/* =================================================================== */}
      <group position={[-24, pierY, -625]}>
        <mesh position={[0, 0.4, 0]} receiveShadow castShadow>
          <boxGeometry args={[14, 0.8, 46]} />
          <meshStandardMaterial color="#1e293b" roughness={0.45} metalness={0.35} />
        </mesh>
        <mesh position={[0, 0.84, 0]}>
          <boxGeometry args={[14.4, 0.12, 46.4]} />
          <meshStandardMaterial color="#fbbf24" emissive="#f59e0b" emissiveIntensity={1.2} />
        </mesh>

        {/* Heavy A-Frame Support Legs */}
        {[-3.4, 3.4].map((xSide) => (
          <React.Fragment key={xSide}>
            <mesh position={[xSide, 13.0, -9.5]} rotation={[0.36, 0, 0]} castShadow>
              <cylinderGeometry args={[0.45, 0.72, 27.5, 10]} />
              <meshStandardMaterial color="#f8fafc" metalness={0.62} roughness={0.24} />
            </mesh>
            <mesh position={[xSide, 13.0, 9.5]} rotation={[-0.36, 0, 0]} castShadow>
              <cylinderGeometry args={[0.45, 0.72, 27.5, 10]} />
              <meshStandardMaterial color="#f8fafc" metalness={0.62} roughness={0.24} />
            </mesh>
          </React.Fragment>
        ))}

        {/* Central Hub Axle with Warm Gold Halo */}
        <mesh position={[0, 25.5, 0]} rotation={[0, 0, Math.PI / 2]}>
          <cylinderGeometry args={[1.55, 1.55, 8.4, 18]} />
          <meshStandardMaterial color="#fbbf24" emissive="#f59e0b" emissiveIntensity={1.1} metalness={0.8} roughness={0.18} />
        </mesh>

        {/* Rotating Wheel Rim, Radial LED Spokes & 12 Self-Leveling Panoramic Gondolas */}
        <group ref={wheelRotorRef} position={[0, 25.5, 0]}>
          {[-2.4, 2.4].map((xRim) => (
            <mesh key={xRim} position={[xRim, 0, 0]} rotation={[0, Math.PI / 2, 0]}>
              <torusGeometry args={[20.5, 0.38, 10, 48]} />
              <meshStandardMaterial color="#38bdf8" emissive="#0284c7" emissiveIntensity={1.55} metalness={0.5} roughness={0.2} />
            </mesh>
          ))}
          {[-2.4, 2.4].map((xRim) => (
            <mesh key={'inner-' + xRim} position={[xRim, 0, 0]} rotation={[0, Math.PI / 2, 0]}>
              <torusGeometry args={[13.5, 0.24, 8, 36]} />
              <meshStandardMaterial color="#fbbf24" emissive="#f59e0b" emissiveIntensity={1.3} />
            </mesh>
          ))}

          {Array.from({ length: 12 }, (_, i) => {
            const ang = (i / 12) * Math.PI * 2;
            const sy = Math.sin(ang) * 20.5;
            const sz = Math.cos(ang) * 20.5;
            const col = GONDOLA_COLORS[i % GONDOLA_COLORS.length];
            const spokeGlow = i % 2 === 0 ? '#38bdf8' : '#ec4899';
            return (
              <React.Fragment key={i}>
                {[-2.3, 2.3].map((sx) => (
                  <mesh key={sx} position={[sx, sy * 0.5, sz * 0.5]} rotation={[ang, 0, 0]}>
                    <cylinderGeometry args={[0.12, 0.12, 20.5, 6]} />
                    <meshStandardMaterial
                      color="#f8fafc"
                      emissive={spokeGlow}
                      emissiveIntensity={0.55}
                      metalness={0.7}
                      roughness={0.22}
                    />
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
                      color="#fef08a"
                      emissive={col}
                      emissiveIntensity={0.6}
                      roughness={0.08}
                      metalness={0.85}
                    />
                  </mesh>
                </group>
              </React.Fragment>
            );
          })}
        </group>
      </group>

      {/* =================================================================== */}
      {/* 2. GRAND RIVIERA CAROUSEL (Crimson & Cream Striped Pavilion)        */}
      {/* =================================================================== */}
      <group position={[0, pierY, -556]}>
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

        {/* Alternating Crimson & Cream Striped Royal Pavilion Canopy */}
        <group position={[0, 8.8, 0]}>
          <mesh castShadow>
            <coneGeometry args={[9.8, 3.6, 24]} />
            <meshStandardMaterial color="#fef3c7" roughness={0.36} metalness={0.12} />
          </mesh>
          {Array.from({ length: 12 }, (_, wIdx) => {
            const ang = (wIdx / 12) * Math.PI * 2;
            return (
              <mesh key={wIdx} position={[0, 0.02, 0]} rotation={[0, ang, 0]}>
                <coneGeometry args={[9.86, 3.62, 2, 1, false, 0, Math.PI / 12]} />
                <meshStandardMaterial color="#dc2626" roughness={0.34} metalness={0.18} side={THREE.DoubleSide} />
              </mesh>
            );
          })}
        </group>
        {/* Gilded Frieze Rim + Warm Bulb Ring */}
        <mesh position={[0, 7.1, 0]}>
          <cylinderGeometry args={[9.88, 9.88, 0.52, 24]} />
          <meshStandardMaterial color="#fbbf24" emissive="#d97706" emissiveIntensity={0.9} metalness={0.75} roughness={0.22} />
        </mesh>
        {Array.from({ length: 16 }, (_, bIdx) => {
          const ang = (bIdx / 16) * Math.PI * 2;
          return (
            <mesh key={bIdx} position={[Math.cos(ang) * 9.95, 7.1, Math.sin(ang) * 9.95]}>
              <sphereGeometry args={[0.16, 8, 8]} />
              <meshStandardMaterial color="#fef08a" emissive="#fbbf24" emissiveIntensity={2.6} />
            </mesh>
          );
        })}
        <mesh position={[0, 11.1, 0]}>
          <sphereGeometry args={[0.75, 12, 12]} />
          <meshStandardMaterial color="#fde047" emissive="#f59e0b" emissiveIntensity={1.8} />
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
                <mesh position={[0, 3.1, 0]}>
                  <cylinderGeometry args={[0.08, 0.08, 6.2, 8]} />
                  <meshStandardMaterial color="#fbbf24" metalness={0.92} roughness={0.12} />
                </mesh>
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
                  <mesh position={[0, 0.42, -0.1]}>
                    <boxGeometry args={[0.74, 0.18, 0.68]} />
                    <meshStandardMaterial color="#dc2626" roughness={0.4} />
                  </mesh>
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
      {/* 3. CYCLONE PIER COASTER (AAA Hyper-Coaster + Sculpted 3-Car Train)  */}
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
            <meshStandardMaterial color="#fbbf24" emissive="#d97706" emissiveIntensity={1.1} />
          </mesh>
          <mesh position={[0, 7.6, 0]} castShadow>
            <boxGeometry args={[14.8, 0.5, 18.8]} />
            <meshStandardMaterial color="#b91c1c" roughness={0.3} metalness={0.45} />
          </mesh>
        </group>

        {/* Continuous Crimson Tubular Steel Coaster Rails & Gold Box Spine */}
        <mesh geometry={leftRailGeo} castShadow>
          <meshStandardMaterial color="#e11d48" emissive="#9f1239" emissiveIntensity={0.42} metalness={0.68} roughness={0.2} />
        </mesh>
        <mesh geometry={rightRailGeo} castShadow>
          <meshStandardMaterial color="#e11d48" emissive="#9f1239" emissiveIntensity={0.42} metalness={0.68} roughness={0.2} />
        </mesh>
        <mesh geometry={spineGeo} castShadow>
          <meshStandardMaterial color="#fbbf24" metalness={0.65} roughness={0.24} />
        </mesh>

        {/* Track Cross-Ties */}
        {ties.map((tie, idx) => (
          <mesh key={idx} position={tie.pos} rotation={tie.rot}>
            <boxGeometry args={[1.72, 0.13, 0.24]} />
            <meshStandardMaterial color="#f1f5f9" metalness={0.65} roughness={0.28} />
          </mesh>
        ))}

        {/* Steel A-Frame Support Bents Anchored to the Ocean Pier Deck */}
        {bents.map((b, idx) => (
          <group key={idx} position={[b.x, pierY, b.z]} rotation={[0, b.yaw, 0]}>
            <mesh position={[-0.75, b.h * 0.5, 0]} rotation={[0, 0, -0.07]} castShadow>
              <cylinderGeometry args={[0.24, 0.34, b.h, 8]} />
              <meshStandardMaterial color="#e2e8f0" metalness={0.62} roughness={0.3} />
            </mesh>
            <mesh position={[0.75, b.h * 0.5, 0]} rotation={[0, 0, 0.07]} castShadow>
              <cylinderGeometry args={[0.24, 0.34, b.h, 8]} />
              <meshStandardMaterial color="#e2e8f0" metalness={0.62} roughness={0.3} />
            </mesh>
            <mesh position={[0, b.h - 0.3, 0]}>
              <boxGeometry args={[2.1, 0.28, 0.32]} />
              <meshStandardMaterial color="#fbbf24" metalness={0.7} roughness={0.25} />
            </mesh>
          </group>
        ))}

        {/* 3-Car Sculpted Aerodynamic Hyper-Coaster Train */}
        {[0, 1, 2].map((cIdx) => (
          <group
            key={cIdx}
            ref={(el) => {
              coasterCarRefs.current[cIdx] = el;
            }}
          >
            {/* Glossy Crimson Lower Chassis */}
            <mesh position={[0, 0.52, 0]} castShadow>
              <boxGeometry args={[1.95, 0.85, 3.2]} />
              <meshStandardMaterial
                color="#dc2626"
                emissive="#991b1b"
                emissiveIntensity={0.28}
                metalness={0.68}
                roughness={0.18}
              />
            </mesh>
            {/* Carbon-Fiber Center Hood Dome */}
            <mesh position={[0, 0.86, 0.88]} rotation={[-0.14, 0, 0]}>
              <boxGeometry args={[1.15, 0.36, 1.35]} />
              <meshStandardMaterial color="#18181b" metalness={0.5} roughness={0.3} />
            </mesh>
            {/* Twin Glowing Orange-Red LED Headlight Strips */}
            {[-0.65, 0.65].map((lx) => (
              <mesh key={lx} position={[lx, 0.88, 1.25]}>
                <boxGeometry args={[0.16, 0.14, 0.65]} />
                <meshStandardMaterial color="#fb923c" emissive="#f97316" emissiveIntensity={2.5} />
              </mesh>
            ))}
            {/* Padded Bucket Seat & Gold Lap Restraint */}
            <mesh position={[0, 1.05, -0.45]}>
              <boxGeometry args={[1.52, 0.62, 0.95]} />
              <meshStandardMaterial color="#0f172a" roughness={0.48} />
            </mesh>
            <mesh position={[0, 1.06, 0.22]} rotation={[0, 0, Math.PI / 2]}>
              <cylinderGeometry args={[0.07, 0.07, 1.48, 10]} />
              <meshStandardMaterial color="#fbbf24" metalness={0.88} roughness={0.18} />
            </mesh>
          </group>
        ))}
      </group>

      {/* =================================================================== */}
      {/* 4. STRATOSPHERE DROP TOWER (64m Pier-Tip Freefall Spire, z=-662)    */}
      {/* =================================================================== */}
      <group position={[0, pierY, -662]}>
        <mesh position={[0, 0.45, 0]} receiveShadow>
          <cylinderGeometry args={[9.5, 10.8, 0.9, 24]} />
          <meshStandardMaterial color="#0f172a" roughness={0.42} metalness={0.4} />
        </mesh>
        <mesh position={[0, 0.95, 0]}>
          <cylinderGeometry args={[8.6, 9.0, 0.16, 24]} />
          <meshStandardMaterial color="#a855f7" emissive="#9333ea" emissiveIntensity={1.2} />
        </mesh>

        <mesh position={[0, 31.0, 0]} castShadow>
          <cylinderGeometry args={[1.75, 2.25, 62.0, 16]} />
          <meshStandardMaterial color="#f8fafc" metalness={0.7} roughness={0.22} />
        </mesh>
        {[
          [-1.95, -1.95],
          [1.95, -1.95],
          [-1.95, 1.95],
          [1.95, 1.95],
        ].map(([gx, gz], idx) => (
          <mesh key={idx} position={[gx, 31.0, gz]}>
            <boxGeometry args={[0.26, 61.5, 0.26]} />
            <meshStandardMaterial
              color={idx % 2 === 0 ? '#38bdf8' : '#fbbf24'}
              emissive={idx % 2 === 0 ? '#0284c7' : '#d97706'}
              emissiveIntensity={1.3}
            />
          </mesh>
        ))}

        <mesh position={[0, 62.4, 0]}>
          <cylinderGeometry args={[4.4, 2.6, 2.6, 16]} />
          <meshStandardMaterial color="#fbbf24" emissive="#f59e0b" emissiveIntensity={1.5} metalness={0.7} roughness={0.2} />
        </mesh>
        <mesh position={[0, 65.8, 0]}>
          <cylinderGeometry args={[0.12, 0.35, 4.8, 8]} />
          <meshStandardMaterial color="#f43f5e" emissive="#e11d48" emissiveIntensity={2.2} />
        </mesh>

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
                <meshStandardMaterial color="#dc2626" roughness={0.3} metalness={0.5} />
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
