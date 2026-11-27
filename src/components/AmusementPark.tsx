import React, { useEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import { useFrame } from '@react-three/fiber';
import {
  AMUSEMENT_PARK_RIDES,
  OCEAN_AMUSEMENT_PIER,
  WONDER_PIER_TERRACE_Y,
  getTerrainHeight,
  registerTravelSurface,
  sampleCoasterTrack,
  sampleCoasterU,
} from '../game/worldMath';
import { simState } from '../game/store';
import { coastalNow } from '../game/coastalPlay';
import { PRIZE_WHEEL } from '../game/quirky';
import { createBoardwalkWoodPBR, createLimestonePBR } from './Textures';

function samplePierApronY(x: number, z: number, pierY: number): number {
  const absX = Math.abs(x);
  // 1. South road-to-terrace transition bevel (z in [-513, -509], |x| <= 18.5)
  if (z <= -509 && z > -513 && absX <= 18.5) {
    const f = THREE.MathUtils.clamp((-509 - z) / 4.0, 0, 1);
    return THREE.MathUtils.lerp(4.61, WONDER_PIER_TERRACE_Y, f);
  }
  // 2. Grand Travertine Welcome Terrace beneath WONDER PIER arch (z in [-529.5, -513], |x| <= 29.5)
  if (z <= -513 && z >= -529.5 && absX <= 29.5) {
    return WONDER_PIER_TERRACE_Y;
  }
  // 3. Smooth convex timber-and-travertine promenade ramp down to teak boardwalk (z in [-546.5, -529.5])
  if (z < -529.5 && z >= -546.5 && absX <= 15.5) {
    const f = THREE.MathUtils.clamp((z - -546.5) / 17.0, 0, 1);
    const curved = Math.min(1, f + 0.48 * f * (1 - f));
    return pierY + 0.04 + (WONDER_PIER_TERRACE_Y - (pierY + 0.04)) * curved;
  }
  return -Infinity;
}

function createApronRampGeometry(width: number, zStart: number, zEnd: number, pierY: number, yOffset = 0): THREE.BufferGeometry {
  const segs = 18;
  const hw = width * 0.5;
  const positions: number[] = [];
  const uvs: number[] = [];
  const indices: number[] = [];

  for (let i = 0; i <= segs; i++) {
    const frac = i / segs;
    const z = THREE.MathUtils.lerp(zStart, zEnd, frac);
    const topY = samplePierApronY(0, z, pierY) + yOffset;
    const botY = pierY - 0.35;
    // 4 vertices per cross-section: top-left, top-right, bot-right, bot-left
    positions.push(
      -hw, topY, z,
      hw, topY, z,
      hw, botY, z,
      -hw, botY, z
    );
    uvs.push(
      0, frac * 3,
      width / 8, frac * 3,
      width / 8, frac * 3,
      0, frac * 3
    );
    if (i < segs) {
      const o = i * 4;
      // Top face (winding so normal points +Y)
      indices.push(o, o + 1, o + 5, o, o + 5, o + 4);
      // Right cheek wall (+X)
      indices.push(o + 1, o + 2, o + 6, o + 1, o + 6, o + 5);
      // Left cheek wall (-X)
      indices.push(o + 3, o, o + 4, o + 3, o + 4, o + 7);
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geo.setIndex(indices);
  geo.computeVertexNormals();
  return geo;
}

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

const PENNANT_COLORS = [
  '#ef4444',
  '#38bdf8',
  '#fbbf24',
  '#ec4899',
  '#10b981',
  '#f97316',
  '#a855f7',
  '#fde047',
];

const PRIZE_WHEEL_COLORS = [
  '#ef4444',
  '#fbbf24',
  '#38bdf8',
  '#10b981',
  '#ec4899',
  '#f97316',
  '#8b5cf6',
  '#fde047',
  '#06b6d4',
  '#f43f5e',
  '#22c55e',
  '#eab308',
];

interface MidwayBoothSpec {
  label: string;
  x: number;
  z: number;
  rotY: number;
  stripeA: string;
  stripeB: string;
  accent: string;
  neon: string;
}

const MIDWAY_BOOTHS: MidwayBoothSpec[] = [
  { label: 'TICKETS', x: -34, z: 62, rotY: Math.PI / 2, stripeA: '#dc2626', stripeB: '#fef3c7', accent: '#fbbf24', neon: '#facc15' },
  { label: 'ARCADE', x: -34, z: 42, rotY: Math.PI / 2, stripeA: '#0284c7', stripeB: '#fef3c7', accent: '#38bdf8', neon: '#22d3ee' },
  { label: 'CHURROS', x: -34, z: 22, rotY: Math.PI / 2, stripeA: '#ea580c', stripeB: '#fef3c7', accent: '#fb923c', neon: '#fb923c' },
  { label: 'ICE CREAM', x: 34, z: 62, rotY: -Math.PI / 2, stripeA: '#ec4899', stripeB: '#fff1f2', accent: '#f472b6', neon: '#f472b6' },
  { label: 'RING TOSS', x: PRIZE_WHEEL.x + 5, z: PRIZE_WHEEL.z + 600, rotY: -Math.PI / 2, stripeA: '#dc2626', stripeB: '#fef3c7', accent: '#fde047', neon: '#f43f5e' },
  { label: 'SKY BAR', x: 34, z: 22, rotY: -Math.PI / 2, stripeA: '#0f766e', stripeB: '#fef3c7', accent: '#2dd4bf', neon: '#2dd4bf' },
];

interface FountainSpec {
  id: string;
  x: number;
  z: number;
  y?: number;
  grand: boolean;
}

const PIER_FOUNTAINS: FountainSpec[] = [
  { id: 'entrance-west', x: -23, z: -522.5, y: WONDER_PIER_TERRACE_Y, grand: true },
  { id: 'entrance-east', x: 23, z: -522.5, y: WONDER_PIER_TERRACE_Y, grand: true },
  { id: 'midway-west', x: -12.2, z: -578, grand: false },
  { id: 'midway-east', x: 12.2, z: -578, grand: false },
];

function createSignTexture(title: string, subtitle?: string, bg = '#0f172a', fg = '#fde047'): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 160;
  const ctx = canvas.getContext('2d')!;

  const grad = ctx.createLinearGradient(0, 0, 0, 160);
  grad.addColorStop(0, bg);
  grad.addColorStop(1, '#020617');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, 512, 160);

  // Art-Deco double gold border + corner filigree
  ctx.strokeStyle = fg;
  ctx.lineWidth = 6;
  ctx.strokeRect(10, 10, 492, 140);
  ctx.lineWidth = 2;
  ctx.strokeRect(20, 20, 472, 120);

  // Corner Art-Deco diamonds
  ctx.fillStyle = fg;
  const corners = [
    [20, 20],
    [492, 20],
    [20, 140],
    [492, 140],
  ];
  for (const [cx, cy] of corners) {
    ctx.beginPath();
    ctx.moveTo(cx, cy - 7);
    ctx.lineTo(cx + 7, cy);
    ctx.lineTo(cx, cy + 7);
    ctx.lineTo(cx - 7, cy);
    ctx.closePath();
    ctx.fill();
  }

  ctx.fillStyle = fg;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.font = subtitle ? '900 56px Georgia, serif' : '900 64px Georgia, serif';
  ctx.fillText(title, 256, subtitle ? 66 : 82);

  if (subtitle) {
    ctx.fillStyle = '#f8fafc';
    ctx.font = '700 21px ui-monospace, monospace';
    ctx.fillText(subtitle, 256, 118);
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return tex;
}

function createPrizeWheelTexture(): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 256;
  const ctx = canvas.getContext('2d')!;
  const cx = 128;
  const cy = 128;
  const r = 120;

  ctx.clearRect(0, 0, 256, 256);
  const segs = PRIZE_WHEEL_COLORS.length;
  for (let i = 0; i < segs; i++) {
    const a0 = -Math.PI / 2 + ((i - 0.5) / segs) * Math.PI * 2;
    const a1 = a0 + (Math.PI * 2) / segs;
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.arc(cx, cy, r, a0, a1);
    ctx.closePath();
    ctx.fillStyle = PRIZE_WHEEL_COLORS[i];
    ctx.fill();
    ctx.strokeStyle = '#fef3c7';
    ctx.lineWidth = 3;
    ctx.stroke();

    // Inner star dot on each wedge
    const mid = (a0 + a1) * 0.5;
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.arc(cx + Math.cos(mid) * (r * 0.72), cy + Math.sin(mid) * (r * 0.72), 6, 0, Math.PI * 2);
    ctx.fill();
  }

  // Outer brass ring & hub cap
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.strokeStyle = '#fbbf24';
  ctx.lineWidth = 10;
  ctx.stroke();

  ctx.beginPath();
  ctx.arc(cx, cy, 24, 0, Math.PI * 2);
  ctx.fillStyle = '#0f172a';
  ctx.fill();
  ctx.strokeStyle = '#fbbf24';
  ctx.lineWidth = 5;
  ctx.stroke();

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return tex;
}

function createPennantGeometry(): THREE.BufferGeometry {
  const geo = new THREE.BufferGeometry();
  const vertices = new Float32Array([
    -0.28, 0, 0,
    0.28, 0, 0,
    0, -0.68, 0,
  ]);
  geo.setAttribute('position', new THREE.BufferAttribute(vertices, 3));
  geo.computeVertexNormals();
  return geo;
}

export function AmusementPark() {
  // Core ride refs
  const wheelRotorRef = useRef<THREE.Group>(null);
  const gondolaRefs = useRef<Array<THREE.Group | null>>([]);
  const carouselRotorRef = useRef<THREE.Group>(null);
  const carouselCrownRef = useRef<THREE.Group>(null);
  const carouselFinialRef = useRef<THREE.Group>(null);
  const steedRefs = useRef<Array<THREE.Group | null>>([]);
  const coasterCarRefs = useRef<Array<THREE.Group | null>>([]);
  const coasterBogieWheelRefs = useRef<Array<THREE.Mesh | null>>([]);
  const coasterGateRefs = useRef<Array<THREE.Group | null>>([]);
  const dropRingRef = useRef<THREE.Group>(null);
  const dropBeaconRef = useRef<THREE.Group>(null);

  // New Azurea Galleon Pendulum Ship refs
  const galleonSwingRef = useRef<THREE.Group>(null);
  const galleonFlagRef = useRef<THREE.Mesh>(null);

  // Animated midway activity refs
  const prizeWheelRef = useRef<THREE.Group>(null);
  const prizeClickerRef = useRef<THREE.Group>(null);
  const iceCreamSignRef = useRef<THREE.Group>(null);
  const ticketStarRef = useRef<THREE.Mesh>(null);
  const churroSteamRefs = useRef<Array<THREE.Mesh | null>>([]);
  const catenarySwayRefs = useRef<Array<THREE.Group | null>>([]);
  const buntingRowRefs = useRef<Array<THREE.Group | null>>([]);
  const fountainJetRefs = useRef<Array<THREE.Mesh | null>>([]);
  const fountainRingJetRefs = useRef<Array<THREE.Mesh | null>>([]);
  const fountainMistRefs = useRef<Array<THREE.Mesh | null>>([]);
  const beaconPulseRefs = useRef<Array<THREE.Mesh | null>>([]);

  const pierY = OCEAN_AMUSEMENT_PIER.deckY;

  // Textures & reusable lightweight geometries
  const {
    woodTex,
    travertineTex,
    pierMarqueeTex,
    coasterSignTex,
    galleonSignTex,
    prizeWheelTex,
    boothTextures,
    pennantGeo,
    catenaryWireGeo,
    bulbGeoSmall,
    bulbGeoMed,
    spokeSleeveGeo,
    rimCollarGeo,
    apronRampWoodGeo,
    apronRampCurbGeo,
    apronSouthBevelGeo,
    chevronGeo,
  } = useMemo(() => {
    const wt = createBoardwalkWoodPBR();
    wt.repeat.set(12, 22);
    const trav = createLimestonePBR();
    trav.repeat.set(6, 4);
    const marquee = createSignTexture('WONDER PIER', 'AZUREA COASTLINE BOARDWALK', '#0f172a', '#fbbf24');
    const coasterSign = createSignTexture('CYCLONE', 'OCEAN HYPER-COASTER', '#450a0a', '#fbbf24');
    const galleonSign = createSignTexture('AZUREA GALLEON', 'PENDULUM THRILL SHIP', '#0c1e3a', '#fde047');
    const pWheel = createPrizeWheelTexture();
    const bTex = MIDWAY_BOOTHS.map((b) => createSignTexture(b.label, undefined, '#172554', b.accent));

    // Draped catenary wire geometry spanning x = -15.5..+15.5
    const wirePts: THREE.Vector3[] = [];
    for (let i = 0; i <= 20; i++) {
      const f = i / 20;
      const wx = -15.5 + f * 31.0;
      const wy = -Math.sin(f * Math.PI) * 1.48;
      wirePts.push(new THREE.Vector3(wx, wy, 0));
    }
    const wireCurve = new THREE.CatmullRomCurve3(wirePts);
    const wireGeo = new THREE.TubeGeometry(wireCurve, 24, 0.03, 5, false);

    // Custom V-chevron geometry for coaster lift-hill chase lights
    const chevShape = new THREE.Shape();
    chevShape.moveTo(0, 0.34);
    chevShape.lineTo(0.62, -0.22);
    chevShape.lineTo(0.46, -0.34);
    chevShape.lineTo(0, 0.08);
    chevShape.lineTo(-0.46, -0.34);
    chevShape.lineTo(-0.62, -0.22);
    chevShape.closePath();
    const chevGeo = new THREE.ExtrudeGeometry(chevShape, {
      depth: 0.09,
      bevelEnabled: false,
    });
    chevGeo.center();

    return {
      woodTex: wt,
      travertineTex: trav,
      pierMarqueeTex: marquee,
      coasterSignTex: coasterSign,
      galleonSignTex: galleonSign,
      prizeWheelTex: pWheel,
      boothTextures: bTex,
      pennantGeo: createPennantGeometry(),
      catenaryWireGeo: wireGeo,
      bulbGeoSmall: new THREE.SphereGeometry(0.14, 7, 7),
      bulbGeoMed: new THREE.SphereGeometry(0.17, 8, 8),
      spokeSleeveGeo: new THREE.CylinderGeometry(0.165, 0.165, 2.1, 8),
      rimCollarGeo: new THREE.CylinderGeometry(0.43, 0.43, 0.36, 10),
      apronRampWoodGeo: createApronRampGeometry(16.2, -529.5, -546.5, pierY, 0.02),
      apronRampCurbGeo: createApronRampGeometry(31.0, -529.5, -546.5, pierY, 0),
      apronSouthBevelGeo: createApronRampGeometry(37.0, -509.0, -513.0, pierY, 0),
      chevronGeo: chevGeo,
    };
  }, [pierY]);

  // Phase-channeled animated materials (zero per-frame allocations, crisp real-time chases!)
  const animMats = useMemo(() => {
    const archChase = Array.from({ length: 8 }, () =>
      new THREE.MeshStandardMaterial({
        color: '#fef08a',
        emissive: '#fbbf24',
        emissiveIntensity: 2.0,
        roughness: 0.18,
      })
    );
    const boothChase = Array.from({ length: 6 }, () =>
      new THREE.MeshStandardMaterial({
        color: '#fef3c7',
        emissive: '#f59e0b',
        emissiveIntensity: 1.8,
        roughness: 0.2,
      })
    );
    const boothNeon = MIDWAY_BOOTHS.map((b) =>
      new THREE.MeshStandardMaterial({
        color: b.neon,
        emissive: b.neon,
        emissiveIntensity: 1.8,
        roughness: 0.15,
      })
    );
    const arcadeScreens = Array.from({ length: 4 }, (_, i) =>
      new THREE.MeshStandardMaterial({
        color: ['#22d3ee', '#f472b6', '#a3e635', '#fbbf24'][i],
        emissive: ['#06b6d4', '#ec4899', '#84cc16', '#f59e0b'][i],
        emissiveIntensity: 2.2,
        roughness: 0.12,
      })
    );
    // Solaris Sky Wheel: 6 radial spoke pulse phases + 12 outer rim chase phases
    const wheelSpokeChase = Array.from({ length: 6 }, (_, i) =>
      new THREE.MeshStandardMaterial({
        color: i % 2 === 0 ? '#7dd3fc' : '#f9a8d4',
        emissive: i % 2 === 0 ? '#38bdf8' : '#ec4899',
        emissiveIntensity: 1.4,
        roughness: 0.15,
      })
    );
    const wheelRimChase = Array.from({ length: 12 }, (_, i) =>
      new THREE.MeshStandardMaterial({
        color: '#fef08a',
        emissive: i % 3 === 0 ? '#38bdf8' : i % 3 === 1 ? '#fbbf24' : '#ec4899',
        emissiveIntensity: 1.6,
        roughness: 0.16,
      })
    );
    const wheelHubGlow = new THREE.MeshStandardMaterial({
      color: '#fef08a',
      emissive: '#f59e0b',
      emissiveIntensity: 1.6,
      metalness: 0.7,
      roughness: 0.18,
    });
    // Carousel frieze bulb chase (8 phases)
    const carouselBulbChase = Array.from({ length: 8 }, () =>
      new THREE.MeshStandardMaterial({
        color: '#fef08a',
        emissive: '#fbbf24',
        emissiveIntensity: 2.2,
        roughness: 0.18,
      })
    );
    // Coaster lift-hill chevron chase (7 phases)
    const liftChevronChase = Array.from({ length: 7 }, () =>
      new THREE.MeshStandardMaterial({
        color: '#fef08a',
        emissive: '#f97316',
        emissiveIntensity: 1.4,
        roughness: 0.16,
      })
    );
    // Drop Tower vertical guide chase (6 tiers)
    const dropTowerChase = Array.from({ length: 6 }, () =>
      new THREE.MeshStandardMaterial({
        color: '#38bdf8',
        emissive: '#38bdf8',
        emissiveIntensity: 1.4,
        roughness: 0.18,
      })
    );
    // Galleon apex hull lantern material
    const galleonLantern = new THREE.MeshStandardMaterial({
      color: '#fef08a',
      emissive: '#f59e0b',
      emissiveIntensity: 2.2,
      roughness: 0.16,
    });
    // Sky Bar cocktail neon
    const skyBarNeon = new THREE.MeshStandardMaterial({
      color: '#2dd4bf',
      emissive: '#14b8a6',
      emissiveIntensity: 2.1,
      roughness: 0.15,
    });
    // Edison catenary bulb materials (3 warm twinkle groups)
    const edisonBulbs = [
      new THREE.MeshStandardMaterial({ color: '#fde047', emissive: '#f59e0b', emissiveIntensity: 2.5, roughness: 0.2 }),
      new THREE.MeshStandardMaterial({ color: '#fed7aa', emissive: '#f59e0b', emissiveIntensity: 2.3, roughness: 0.2 }),
      new THREE.MeshStandardMaterial({ color: '#fef08a', emissive: '#fbbf24', emissiveIntensity: 2.6, roughness: 0.2 }),
    ];
    // Arch column lantern glow
    const archLantern = new THREE.MeshStandardMaterial({
      color: '#fef08a',
      emissive: '#f59e0b',
      emissiveIntensity: 2.4,
      roughness: 0.15,
    });

    return {
      archChase,
      boothChase,
      boothNeon,
      arcadeScreens,
      wheelSpokeChase,
      wheelRimChase,
      wheelHubGlow,
      carouselBulbChase,
      liftChevronChase,
      dropTowerChase,
      galleonLantern,
      skyBarNeon,
      edisonBulbs,
      archLantern,
    };
  }, []);

  // Build closed 3D roller-coaster track rails, bents, ties, AND lift-hill chase chevrons
  const { leftRailGeo, rightRailGeo, spineGeo, bents, ties, liftChevrons } = useMemo(() => {
    const sampleCount = 144;
    const leftPts: THREE.Vector3[] = [];
    const rightPts: THREE.Vector3[] = [];
    const spinePts: THREE.Vector3[] = [];
    const tieList: Array<{ pos: [number, number, number]; rot: [number, number, number] }> = [];
    const bentList: Array<{ x: number; z: number; h: number; y: number; yaw: number }> = [];
    const chevronList: Array<{ pos: [number, number, number]; rot: [number, number, number] }> = [];

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

    // 14 animated illuminated lift-hill chevrons mounted cleanly under the rails on the main climb (u = 0.17..0.335)
    const chevCount = 14;
    for (let k = 0; k < chevCount; k++) {
      const u = 0.17 + (k / (chevCount - 1)) * 0.165;
      const { pos, tangent, bankedRight, bankedUp } = sampleCoasterTrack(u);
      const chevPos = pos.clone().addScaledVector(bankedUp, -0.18);
      // Orient chevron flat along the rail bed pointing forward (+tangent)
      const m = new THREE.Matrix4().makeBasis(bankedRight, tangent, bankedUp.clone().negate());
      const e = new THREE.Euler().setFromRotationMatrix(m, 'YXZ');
      chevronList.push({
        pos: [chevPos.x, chevPos.y, chevPos.z],
        rot: [e.x, e.y, e.z],
      });
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
      liftChevrons: chevronList,
    };
  }, [pierY]);

  // Register walkable pier platforms (Entrance Apron, Grand Carousel deck/steps, Ferris, Drop Tower, Galleon)
  // so players step cleanly onto every elevated platform instead of clipping waist-deep into decks!
  useEffect(() => {
    const unregister = registerTravelSurface((x, z, feetY) => {
      let best = -Infinity;

      // 1. Wonder Pier Entrance Terrace & Sloped Boardwalk Ramp
      const apronY = samplePierApronY(x, z, pierY);
      if (apronY > -Infinity && feetY >= apronY - 1.45) {
        best = Math.max(best, apronY);
      }

      // 2. Grand Riviera Carousel (0, -556): smooth 3-tier entry steps from r=11.2m up to turntable y=pierY+0.94m
      const dCarousel = Math.hypot(x, z + 556);
      if (dCarousel <= 11.25) {
        const stepFrac = THREE.MathUtils.clamp((11.25 - dCarousel) / 1.75, 0, 1);
        const carouselY = pierY + stepFrac * 0.94;
        if (feetY >= carouselY - 1.35) best = Math.max(best, carouselY);
      }

      // 3. Solaris Sky Wheel boarding deck (-24, -625, 14m x 46m, height 0.86m)
      const dxF = Math.abs(x + 24);
      const dzF = Math.abs(z + 625);
      if (dxF <= 8.2 && dzF <= 24.2) {
        const rampX = THREE.MathUtils.clamp((8.2 - dxF) / 1.2, 0, 1);
        const rampZ = THREE.MathUtils.clamp((24.2 - dzF) / 1.2, 0, 1);
        const ferrisY = pierY + Math.min(rampX, rampZ) * 0.86;
        if (feetY >= ferrisY - 1.35) best = Math.max(best, ferrisY);
      }

      // 4. Stratosphere Drop Tower plinth (0, -662, r=10.8m, height 0.96m)
      const dDrop = Math.hypot(x, z + 662);
      if (dDrop <= 11.6) {
        const dropFrac = THREE.MathUtils.clamp((11.6 - dDrop) / 1.4, 0, 1);
        const dropY = pierY + dropFrac * 0.96;
        if (feetY >= dropY - 1.35) best = Math.max(best, dropY);
      }

      // 5. Azurea Galleon viewing plinth (-31, -666, r=9.4m, height 0.86m)
      const dGal = Math.hypot(x + 31, z + 666);
      if (dGal <= 10.2) {
        const galFrac = THREE.MathUtils.clamp((10.2 - dGal) / 1.3, 0, 1);
        const galY = pierY + galFrac * 0.86;
        if (feetY >= galY - 1.35) best = Math.max(best, galY);
      }

      return best;
    });
    return () => {
      unregister();
    };
  }, [pierY]);

  // Dispose procedural GPU resources on unmount
  useEffect(() => {
    return () => {
      woodTex.dispose();
      travertineTex.dispose();
      pierMarqueeTex.dispose();
      coasterSignTex.dispose();
      galleonSignTex.dispose();
      prizeWheelTex.dispose();
      boothTextures.forEach((t) => t.dispose());
      pennantGeo.dispose();
      catenaryWireGeo.dispose();
      bulbGeoSmall.dispose();
      bulbGeoMed.dispose();
      spokeSleeveGeo.dispose();
      rimCollarGeo.dispose();
      apronRampWoodGeo.dispose();
      apronRampCurbGeo.dispose();
      apronSouthBevelGeo.dispose();
      chevronGeo.dispose();
      leftRailGeo.dispose();
      rightRailGeo.dispose();
      spineGeo.dispose();
      Object.values(animMats).forEach((entry) => {
        if (Array.isArray(entry)) entry.forEach((m) => m.dispose());
        else entry.dispose();
      });
    };
  }, [
    woodTex,
    travertineTex,
    pierMarqueeTex,
    coasterSignTex,
    galleonSignTex,
    prizeWheelTex,
    boothTextures,
    pennantGeo,
    catenaryWireGeo,
    bulbGeoSmall,
    bulbGeoMed,
    spokeSleeveGeo,
    rimCollarGeo,
    apronRampWoodGeo,
    apronRampCurbGeo,
    apronSouthBevelGeo,
    chevronGeo,
    leftRailGeo,
    rightRailGeo,
    spineGeo,
    animMats,
  ]);

  useFrame((state, rawDelta) => {
    if (simState.startMenuOpen) return;
    const t = state.clock.elapsedTime;
    const dt = Math.min(rawDelta, 0.05);

    // =========================================================================
    // 1. SOLARIS SKY WHEEL: Exact sync with sampleAmusementRidePose('FERRIS', t)
    //    Rotating by -wheelAngle around +X maps gondola 0 (0, 0, +20.5) to
    //    (0, +sin(wheelAngle)*20.5, +cos(wheelAngle)*20.5), locking the cabin around Chloe!
    // =========================================================================
    const wheelAngle = t * 0.32;
    if (wheelRotorRef.current) {
      wheelRotorRef.current.rotation.x = -wheelAngle;
    }
    for (let i = 0; i < 12; i++) {
      const cab = gondolaRefs.current[i];
      if (cab) cab.rotation.x = wheelAngle;
    }
    // Radial outward pulse wave along the 6 spoke rings
    for (let s = 0; s < 6; s++) {
      const wave = 0.5 + 0.5 * Math.sin(t * 5.2 - s * 1.05);
      animMats.wheelSpokeChase[s].emissiveIntensity = 0.35 + wave * wave * 2.8;
    }
    // Circular rainbow-gold-cyan chase wave around the 12 rim channels
    for (let r = 0; r < 12; r++) {
      const wave = 0.5 + 0.5 * Math.sin(t * 6.0 - r * 0.78);
      animMats.wheelRimChase[r].emissiveIntensity = 0.4 + Math.pow(wave, 2.2) * 3.0;
    }
    animMats.wheelHubGlow.emissiveIntensity = 1.2 + Math.sin(t * 2.4) * 0.55;

    // =========================================================================
    // 2. GRAND RIVIERA CAROUSEL: Turntable, galloping + rocking steeds, crown banners & frieze chase
    // =========================================================================
    if (carouselRotorRef.current) {
      carouselRotorRef.current.rotation.y = -t * 0.95;
    }
    if (carouselCrownRef.current) {
      carouselCrownRef.current.rotation.y = t * 0.48;
    }
    if (carouselFinialRef.current) {
      carouselFinialRef.current.rotation.y = t * 1.65;
    }
    for (let i = 0; i < 8; i++) {
      const steed = steedRefs.current[i];
      if (steed) {
        const phase = t * 3.8 + i * 0.8;
        steed.position.y = 1.45 + Math.sin(phase) * 0.48;
        steed.rotation.x = Math.cos(phase) * 0.085;
      }
    }
    for (let i = 0; i < 8; i++) {
      const wave = 0.5 + 0.5 * Math.sin(t * 7.5 - i * 0.85);
      animMats.carouselBulbChase[i].emissiveIntensity = 0.55 + Math.pow(wave, 2.4) * 3.1;
    }

    // =========================================================================
    // 3. CYCLONE PIER COASTER: 3-car train synced to sampleCoasterU(t), rotating bogie wheels,
    //    lift-hill chase chevrons, and rhythmic station loading gates
    // =========================================================================
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
    // Rotate bogie wheels underneath all 3 coaster cars
    for (let w = 0; w < coasterBogieWheelRefs.current.length; w++) {
      const wheel = coasterBogieWheelRefs.current[w];
      if (wheel) wheel.rotation.x += dt * 16.0;
    }
    // Upward chase wave along the 7 lift-hill chevron channels
    for (let k = 0; k < 7; k++) {
      const wave = 0.5 + 0.5 * Math.sin(t * 7.2 - k * 0.92);
      animMats.liftChevronChase[k].emissiveIntensity = 0.25 + Math.pow(wave, 2.8) * 3.2;
    }
    // Animated station loading air-gates (swing smoothly open/closed between cycles)
    const gateWave = 0.5 + 0.5 * Math.sin(t * 0.65);
    const gateOpenAngle = THREE.MathUtils.smoothstep(gateWave, 0.65, 0.95) * 1.15;
    for (let g = 0; g < coasterGateRefs.current.length; g++) {
      const gate = coasterGateRefs.current[g];
      if (gate) {
        gate.rotation.y = (g % 2 === 0 ? 1 : -1) * gateOpenAngle;
      }
    }

    // =========================================================================
    // 4. STRATOSPHERE DROP TOWER: Freefall ring + vertical guide-rail telemetry chase + beacon
    // =========================================================================
    const dropCycle = (t % 14) / 14;
    let heightFrac = 0;
    if (dropCycle < 0.58) {
      const x = dropCycle / 0.58;
      heightFrac = x * x * (3 - 2 * x);
    } else if (dropCycle < 0.72) {
      heightFrac = 1.0;
    } else if (dropCycle < 0.86) {
      const dropT = (dropCycle - 0.72) / 0.14;
      heightFrac = Math.max(0, 1 - dropT * dropT);
    } else {
      heightFrac = 0;
    }
    if (dropRingRef.current) {
      dropRingRef.current.position.y = 3.2 + heightFrac * 52.0;
      dropRingRef.current.rotation.y = t * 0.25;
    }
    if (dropBeaconRef.current) {
      dropBeaconRef.current.rotation.y = t * 2.8;
    }
    for (let tier = 0; tier < 6; tier++) {
      const tierFrac = tier / 5;
      const distToRing = Math.abs(heightFrac - tierFrac);
      const nearBoost = Math.max(0, 1 - distToRing * 3.5);
      const pulse = 0.5 + 0.5 * Math.sin(t * 6.5 - tier * 1.1);
      animMats.dropTowerChase[tier].emissiveIntensity = 0.45 + pulse * 0.9 + nearBoost * 2.6;
    }

    // =========================================================================
    // 5. NEW THRILL ATTRACTION: AZUREA GALLEON PENDULUM SHIP (NW Oceanfront Plaza)
    // =========================================================================
    const swingAngle = Math.sin(t * 1.05) * 0.92; // Smooth ±52.7° high-energy pendulum arc
    if (galleonSwingRef.current) {
      galleonSwingRef.current.rotation.z = swingAngle;
    }
    if (galleonFlagRef.current) {
      galleonFlagRef.current.rotation.y = Math.sin(t * 5.4) * 0.28 + swingAngle * 0.35;
    }
    // Lanterns flare brighter at peak apex!
    animMats.galleonLantern.emissiveIntensity = 1.6 + Math.abs(swingAngle) * 1.8;

    // =========================================================================
    // 6. CHASING MARQUEE LIGHTS (WONDER PIER ARCH + 6 MIDWAY BOOTHS + NEON TRIM)
    // =========================================================================
    for (let i = 0; i < 8; i++) {
      const wave = 0.5 + 0.5 * Math.sin(t * 8.2 - i * 0.82);
      animMats.archChase[i].emissiveIntensity = 0.35 + Math.pow(wave, 2.6) * 3.6;
    }
    animMats.archLantern.emissiveIntensity = 2.0 + Math.sin(t * 2.8) * 0.7;

    const now = coastalNow();
    const { wheelStart, wheelFrom, wheelTo, neonUntil } = simState.coastal;
    const celebrating = now < neonUntil;
    for (let i = 0; i < 6; i++) {
      const wave = 0.5 + 0.5 * Math.sin(t * 7.6 - i * 1.05);
      animMats.boothChase[i].emissiveIntensity = 0.4 + Math.pow(wave, 2.5) * (celebrating ? 7.2 : 3.3);
      // Pulsing neon booth trim
      animMats.boothNeon[i].emissiveIntensity = (celebrating ? 4.4 : 1.35) + 0.95 * Math.sin(t * 3.1 + i * 1.15);
    }

    // =========================================================================
    // 7. ANIMATED MIDWAY ACTIVITIES (Prize Wheel, Arcade CRTs, Ice Cream Cone, Churros, Sky Bar)
    // =========================================================================
    if (prizeWheelRef.current) {
      const progress = wheelStart > 0 ? THREE.MathUtils.clamp((now - wheelStart) / PRIZE_WHEEL.duration, 0, 1) : 1;
      const spinPhase = THREE.MathUtils.lerp(wheelFrom, wheelTo, 1 - (1 - progress) ** 3);
      prizeWheelRef.current.rotation.z = spinPhase;
      if (prizeClickerRef.current) {
        const pegKick = progress < 1 ? Math.abs(Math.sin(spinPhase * 6)) ** 4 : 0;
        prizeClickerRef.current.rotation.z = -pegKick * 0.42;
      }
    }
    // Arcade CRT screens flicker & cycle vibrantly
    for (let s = 0; s < 4; s++) {
      const flicker = 0.5 + 0.5 * Math.sin(t * (7.5 + s * 2.3) + s * 1.7);
      animMats.arcadeScreens[s].emissiveIntensity = 1.1 + flicker * 2.2;
    }
    // Giant pastel soft-serve ice cream cone sign spins gracefully atop ICE CREAM booth
    if (iceCreamSignRef.current) {
      iceCreamSignRef.current.rotation.y = t * 1.35;
      iceCreamSignRef.current.position.y = 5.65 + Math.sin(t * 2.6) * 0.14;
    }
    // Bobbing golden ticket star atop TICKETS booth
    if (ticketStarRef.current) {
      ticketStarRef.current.rotation.y = t * 1.5;
      ticketStarRef.current.position.y = 5.75 + Math.sin(t * 3.0) * 0.12;
    }
    // Rising warm aroma wisps above CHURROS serving counter
    for (let w = 0; w < churroSteamRefs.current.length; w++) {
      const wisp = churroSteamRefs.current[w];
      if (!wisp) continue;
      const cyc = (t * 0.55 + w * 0.33) % 1;
      wisp.position.y = 1.55 + cyc * 1.65;
      wisp.position.x = (w - 1) * 1.1 + Math.sin(t * 2.4 + w * 2.0) * 0.18;
      const s = 0.35 + Math.sin(cyc * Math.PI) * 0.75;
      wisp.scale.setScalar(s);
    }
    // Sky Bar cocktail neon pulse
    animMats.skyBarNeon.emissiveIntensity = 1.6 + Math.sin(t * 3.6) * 0.9;

    // =========================================================================
    // 8. SWAYING EDISON CATENARIES & FLUTTERING PENNANT BUNTING GARLANDS
    // =========================================================================
    for (let r = 0; r < catenarySwayRefs.current.length; r++) {
      const cat = catenarySwayRefs.current[r];
      if (cat) {
        cat.rotation.x = Math.sin(t * 1.25 + r * 0.75) * 0.055;
      }
    }
    for (let b = 0; b < 3; b++) {
      animMats.edisonBulbs[b].emissiveIntensity = 2.0 + Math.sin(t * 3.4 + b * 2.1) * 0.65;
    }
    for (let g = 0; g < buntingRowRefs.current.length; g++) {
      const garland = buntingRowRefs.current[g];
      if (garland) {
        garland.rotation.x = Math.sin(t * 2.2 + g * 0.9) * 0.12;
        garland.rotation.z = Math.cos(t * 1.8 + g * 1.1) * 0.035;
      }
    }

    // =========================================================================
    // 9. ANIMATED OCEAN-PLAZA FOUNTAINS & MIST HALOS + BOARDING BEACON PULSE
    // =========================================================================
    for (let f = 0; f < PIER_FOUNTAINS.length; f++) {
      const centerJet = fountainJetRefs.current[f];
      const ringJet = fountainRingJetRefs.current[f];
      const mist = fountainMistRefs.current[f];
      const waveA = 0.78 + 0.32 * Math.sin(t * 3.4 + f * 1.4);
      const waveB = 0.72 + 0.28 * Math.sin(t * 4.2 + f * 1.4 + 1.2);
      if (centerJet) {
        centerJet.scale.set(1.0, waveA, 1.0);
        centerJet.rotation.y = t * 1.4;
      }
      if (ringJet) {
        ringJet.scale.set(0.95 + waveB * 0.12, waveB, 0.95 + waveB * 0.12);
        ringJet.rotation.y = -t * 1.1;
      }
      if (mist) {
        const mistCycle = (t * 0.7 + f * 0.25) % 1;
        const mScale = 0.7 + mistCycle * 0.65;
        mist.scale.set(mScale, 1, mScale);
        mist.position.y = (PIER_FOUNTAINS[f].grand ? 2.1 : 1.35) + mistCycle * 0.95;
      }
    }
    for (let b = 0; b < beaconPulseRefs.current.length; b++) {
      const ring = beaconPulseRefs.current[b];
      if (ring) {
        const s = 1.0 + 0.14 * Math.sin(t * 2.8 + b * 1.1);
        ring.scale.set(s, s, 1);
      }
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
            <mesh position={[0, 1.15, 0]} castShadow>
              <boxGeometry args={[0.26, 0.14, 169]} />
              <meshStandardMaterial color="#92400e" roughness={0.65} />
            </mesh>
            <mesh position={[0, 0.62, 0]}>
              <boxGeometry args={[0.16, 0.1, 169]} />
              <meshStandardMaterial color="#78350f" roughness={0.7} />
            </mesh>
            <mesh position={[0, 0.14, 0]}>
              <boxGeometry args={[0.32, 0.14, 170]} />
              <meshStandardMaterial
                color={idx === 0 ? '#f59e0b' : '#38bdf8'}
                emissive={idx === 0 ? '#d97706' : '#0284c7'}
                emissiveIntensity={1.2}
              />
            </mesh>
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

        {/* GRAND TRAVERTINE & TIMBER ENTRANCE TRANSITION APRON (Bridging Island II Road -> Teak Pier) */}
        <group position={[0, 0, 600]}>
          {/* Honed Travertine Welcome Terrace beneath WONDER PIER Arch (z = -529.5..-513) */}
          <mesh position={[0, WONDER_PIER_TERRACE_Y - 0.55, -521.25]} receiveShadow castShadow>
            <boxGeometry args={[59, 1.1, 16.5]} />
            <meshStandardMaterial map={travertineTex} color="#f5efe6" roughness={0.58} metalness={0.08} />
          </mesh>
          {/* Central Dark-Slate Promenade Carpet Inlay + Brass Borders on Terrace */}
          <mesh position={[0, WONDER_PIER_TERRACE_Y + 0.015, -521.25]} receiveShadow>
            <boxGeometry args={[16.2, 0.03, 16.5]} />
            <meshStandardMaterial color="#1e293b" roughness={0.5} metalness={0.2} />
          </mesh>
          {[-8.25, 8.25].map((bx) => (
            <mesh key={`apron_brass_${bx}`} position={[bx, WONDER_PIER_TERRACE_Y + 0.03, -521.25]}>
              <boxGeometry args={[0.26, 0.05, 16.5]} />
              <meshStandardMaterial color="#fbbf24" emissive="#d97706" emissiveIntensity={0.65} metalness={0.85} roughness={0.2} />
            </mesh>
          ))}
          {/* Decorative Travertine Curb Trim along Terrace North & South Edges */}
          <mesh position={[0, WONDER_PIER_TERRACE_Y + 0.03, -513.1]}>
            <boxGeometry args={[59.2, 0.08, 0.35]} />
            <meshStandardMaterial color="#fbbf24" emissive="#d97706" emissiveIntensity={0.45} metalness={0.82} roughness={0.22} />
          </mesh>
          {/* Smooth South Bevel connecting Island II Road (-509) onto Welcome Terrace (-513) */}
          <mesh geometry={apronSouthBevelGeo} receiveShadow>
            <meshStandardMaterial map={travertineTex} color="#e7dfd3" roughness={0.62} metalness={0.06} />
          </mesh>
          {/* Smooth Sloped Travertine-Curbed & Teak-Decked Promenade Ramp (-529.5 -> -546.5) */}
          <mesh geometry={apronRampCurbGeo} receiveShadow>
            <meshStandardMaterial map={travertineTex} color="#efe7dc" roughness={0.58} metalness={0.08} />
          </mesh>
          <mesh geometry={apronRampWoodGeo} receiveShadow>
            <meshStandardMaterial map={woodTex} roughness={0.7} metalness={0.06} />
          </mesh>
        </group>

        {/* ORNATE ART-DECO "WONDER PIER" ENTRANCE MARQUEE ARCH (z = -519 world, seated on Travertine Terrace) */}
        <group position={[0, WONDER_PIER_TERRACE_Y, 81]}>
          {[-12.2, 12.2].map((ax, colIdx) => (
            <group key={ax} position={[ax, 0, 0]}>
              {/* Stepped Art-Deco Plinth */}
              <mesh position={[0, 0.9, 0]} castShadow>
                <boxGeometry args={[2.7, 1.8, 2.7]} />
                <meshStandardMaterial color="#1e293b" roughness={0.4} metalness={0.35} />
              </mesh>
              <mesh position={[0, 1.9, 0]}>
                <boxGeometry args={[2.1, 0.22, 2.1]} />
                <meshStandardMaterial color="#fbbf24" metalness={0.85} roughness={0.2} />
              </mesh>
              {/* Fluted Navy & Gold Column */}
              <mesh position={[0, 6.4, 0]} castShadow>
                <cylinderGeometry args={[0.74, 0.94, 10.2, 14]} />
                <meshStandardMaterial color="#172554" roughness={0.35} metalness={0.45} />
              </mesh>
              {/* Gold Column Rings */}
              {[2.4, 6.2, 10.6].map((ry) => (
                <mesh key={ry} position={[0, ry, 0]}>
                  <cylinderGeometry args={[1.0, 1.0, 0.34, 14]} />
                  <meshStandardMaterial color="#fbbf24" emissive="#d97706" emissiveIntensity={0.7} metalness={0.85} roughness={0.18} />
                </mesh>
              ))}
              {/* Vertical Column Chasing Accent Bulbs (front & back) */}
              {Array.from({ length: 6 }, (_, vb) => (
                <React.Fragment key={vb}>
                  <mesh
                    position={[0, 3.0 + vb * 1.35, 0.96]}
                    geometry={bulbGeoSmall}
                    material={animMats.archChase[(vb + colIdx * 4) % 8]}
                  />
                  <mesh
                    position={[0, 3.0 + vb * 1.35, -0.96]}
                    geometry={bulbGeoSmall}
                    material={animMats.archChase[(vb + colIdx * 4) % 8]}
                  />
                </React.Fragment>
              ))}
              {/* Glowing Art-Deco Finial Lantern */}
              <mesh position={[0, 12.15, 0]} material={animMats.archLantern}>
                <sphereGeometry args={[0.72, 12, 12]} />
              </mesh>
              <mesh position={[0, 13.25, 0]}>
                <coneGeometry args={[0.28, 1.15, 8]} />
                <meshStandardMaterial color="#fbbf24" metalness={0.88} roughness={0.18} />
              </mesh>
            </group>
          ))}

          {/* Grand Marquee Span Beam & Signboards (front & back readable) */}
          <mesh position={[0, 11.2, 0]} castShadow>
            <boxGeometry args={[26.2, 3.7, 1.65]} />
            <meshStandardMaterial color="#0f172a" roughness={0.32} metalness={0.55} />
          </mesh>
          {/* Art-Deco Stepped Gold Crest Pediment & Sunburst Rays */}
          <mesh position={[0, 13.65, 0]} castShadow>
            <boxGeometry args={[16.8, 1.35, 1.25]} />
            <meshStandardMaterial color="#fbbf24" emissive="#d97706" emissiveIntensity={0.65} metalness={0.85} roughness={0.2} />
          </mesh>
          <mesh position={[0, 14.7, 0]} castShadow>
            <boxGeometry args={[9.2, 0.95, 1.0]} />
            <meshStandardMaterial color="#172554" roughness={0.35} metalness={0.5} />
          </mesh>
          {/* Radiant Art-Deco Golden Sunburst Rays crowning the crest */}
          {[-0.65, -0.4, -0.18, 0, 0.18, 0.4, 0.65].map((ang, rIdx) => (
            <mesh
              key={rIdx}
              position={[Math.sin(ang) * 2.2, 14.9 + Math.cos(ang) * 1.4, 0]}
              rotation={[0, 0, -ang]}
            >
              <boxGeometry args={[0.24, 2.2, 0.28]} />
              <meshStandardMaterial color="#fde047" emissive="#f59e0b" emissiveIntensity={1.45} metalness={0.8} roughness={0.2} />
            </mesh>
          ))}
          {/* Front & Back "WONDER PIER" Canvas Signboards */}
          <mesh position={[0, 11.2, 0.86]}>
            <planeGeometry args={[22.6, 3.15]} />
            <meshStandardMaterial map={pierMarqueeTex} emissive="#ffffff" emissiveMap={pierMarqueeTex} emissiveIntensity={0.5} />
          </mesh>
          <mesh position={[0, 11.2, -0.86]} rotation={[0, Math.PI, 0]}>
            <planeGeometry args={[22.6, 3.15]} />
            <meshStandardMaterial map={pierMarqueeTex} emissive="#ffffff" emissiveMap={pierMarqueeTex} emissiveIntensity={0.5} />
          </mesh>
          {/* Animated Chasing Marquee Bulbs along Top & Bottom Rims (Front & Back!) */}
          {Array.from({ length: 17 }, (_, bIdx) => {
            const bx = -12.0 + bIdx * 1.5;
            const matTop = animMats.archChase[bIdx % 8];
            const matBot = animMats.archChase[(16 - bIdx) % 8];
            return (
              <React.Fragment key={bIdx}>
                <mesh position={[bx, 13.15, 0.9]} geometry={bulbGeoMed} material={matTop} />
                <mesh position={[bx, 9.25, 0.9]} geometry={bulbGeoMed} material={matBot} />
                <mesh position={[bx, 13.15, -0.9]} geometry={bulbGeoMed} material={matTop} />
                <mesh position={[bx, 9.25, -0.9]} geometry={bulbGeoMed} material={matBot} />
              </React.Fragment>
            );
          })}
        </group>

        {/* 6 STRIPED MIDWAY CARNIVAL & FOOD BOOTHS WITH ANIMATED CHASE LIGHTS, NEON TRIM & ACTIVITIES */}
        {MIDWAY_BOOTHS.map((booth, idx) => {
          const boothY = Math.max(pierY, getTerrainHeight(booth.x, -600 + booth.z) + 0.05);
          const skirtH = Math.max(0.25, boothY - pierY + 0.4);
          return (
          <group key={booth.label} position={[booth.x, boothY, booth.z]} rotation={[0, booth.rotY, 0]}>
            {/* Grounded Foundation Skirt so booths near the Island II bluff never float or clip grass */}
            <mesh position={[0, -skirtH * 0.5, 0]} receiveShadow>
              <boxGeometry args={[9.9, skirtH, 5.1]} />
              <meshStandardMaterial color="#1e293b" roughness={0.62} metalness={0.18} />
            </mesh>
            {/* Timber Booth Base & Counter */}
            <mesh position={[0, 1.8, 0]} castShadow receiveShadow>
              <boxGeometry args={[9.6, 3.6, 4.6]} />
              <meshStandardMaterial color="#1e293b" roughness={0.55} metalness={0.18} />
            </mesh>
            {/* Warm Serving Counter Ledge */}
            <mesh position={[0, 1.18, 2.48]} castShadow>
              <boxGeometry args={[9.2, 0.22, 0.88]} />
              <meshStandardMaterial color="#fef3c7" roughness={0.45} />
            </mesh>
            {/* Pulsing Neon Trim Bar beneath Counter & Framing Marquee */}
            <mesh position={[0, 1.02, 2.9]} material={animMats.boothNeon[idx]}>
              <boxGeometry args={[9.1, 0.09, 0.09]} />
            </mesh>
            <mesh position={[0, 5.14, 2.9]} material={animMats.boothNeon[idx]}>
              <boxGeometry args={[9.8, 0.1, 0.1]} />
            </mesh>
            <mesh position={[0, 3.78, 2.9]} material={animMats.boothNeon[idx]}>
              <boxGeometry args={[9.8, 0.1, 0.1]} />
            </mesh>

            {/* Backlit Showcase Window (dimmed slightly for ARCADE so CRT screens pop!) */}
            <mesh position={[0, 2.22, 2.33]}>
              <planeGeometry args={[7.8, 1.65]} />
              <meshStandardMaterial
                color={booth.label === 'ARCADE' ? '#0f172a' : '#fef08a'}
                emissive={booth.label === 'ARCADE' ? '#1e3a8a' : '#f59e0b'}
                emissiveIntensity={booth.label === 'ARCADE' ? 0.55 : 0.82}
                roughness={0.2}
              />
            </mesh>

            {/* Alternating Striped Carnival Awning Slats */}
            {Array.from({ length: 8 }, (_, sIdx) => (
              <mesh
                key={sIdx}
                position={[-4.2 + sIdx * 1.2, 3.72, 1.92]}
                rotation={[0.38, 0, 0]}
                castShadow
              >
                <boxGeometry args={[1.22, 0.14, 2.48]} />
                <meshStandardMaterial
                  color={sIdx % 2 === 0 ? booth.stripeA : booth.stripeB}
                  roughness={0.45}
                />
              </mesh>
            ))}

            {/* Roof Fascia & Illuminated Booth Marquee Sign */}
            <mesh position={[0, 4.46, 0.4]} castShadow>
              <boxGeometry args={[10.0, 1.38, 4.9]} />
              <meshStandardMaterial color="#0f172a" roughness={0.38} metalness={0.35} />
            </mesh>
            <mesh position={[0, 4.46, 2.88]}>
              <planeGeometry args={[8.6, 1.15]} />
              <meshStandardMaterial
                map={boothTextures[idx]}
                emissive="#ffffff"
                emissiveMap={boothTextures[idx]}
                emissiveIntensity={0.54}
              />
            </mesh>

            {/* Animated Chasing Marquee Bulbs across every Booth Fascia */}
            {Array.from({ length: 9 }, (_, bIdx) => (
              <React.Fragment key={bIdx}>
                <mesh
                  position={[-4.4 + bIdx * 1.1, 5.18, 2.93]}
                  geometry={bulbGeoSmall}
                  material={animMats.boothChase[(bIdx + idx) % 6]}
                />
                <mesh
                  position={[-4.4 + bIdx * 1.1, 3.76, 2.93]}
                  geometry={bulbGeoSmall}
                  material={animMats.boothChase[(8 - bIdx + idx) % 6]}
                />
              </React.Fragment>
            ))}

            {/* === BESPOKE ANIMATED MIDWAY ACTIVITIES PER BOOTH === */}

            {/* 1. TICKETS: Spinning Golden Star Finial + Golden Ticket Roll Dispenser */}
            {booth.label === 'TICKETS' && (
              <group>
                <mesh ref={ticketStarRef} position={[0, 5.75, 1.2]} castShadow>
                  <octahedronGeometry args={[0.72, 0]} />
                  <meshStandardMaterial color="#fde047" emissive="#f59e0b" emissiveIntensity={1.6} metalness={0.85} roughness={0.18} />
                </mesh>
                {[-1.8, 0, 1.8].map((tx) => (
                  <mesh key={tx} position={[tx, 1.48, 2.55]} rotation={[0, 0, Math.PI / 2]}>
                    <cylinderGeometry args={[0.24, 0.24, 0.18, 12]} />
                    <meshStandardMaterial color="#f59e0b" emissive="#d97706" emissiveIntensity={0.6} roughness={0.3} />
                  </mesh>
                ))}
              </group>
            )}

            {/* 2. ARCADE: 4 Retro Arcade Cabinets with Animated Glowing CRT Screens */}
            {booth.label === 'ARCADE' && (
              <group>
                {[-2.85, -0.95, 0.95, 2.85].map((cx, cIdx) => (
                  <group key={cIdx} position={[cx, 1.28, 2.48]}>
                    {/* Cabinet Body */}
                    <mesh position={[0, 0.65, -0.05]} castShadow>
                      <boxGeometry args={[1.15, 1.65, 0.72]} />
                      <meshStandardMaterial
                        color={['#1d4ed8', '#be185d', '#047857', '#6d28d9'][cIdx]}
                        roughness={0.32}
                        metalness={0.25}
                      />
                    </mesh>
                    {/* Animated Glowing CRT Screen */}
                    <mesh position={[0, 0.78, 0.32]} rotation={[-0.18, 0, 0]} material={animMats.arcadeScreens[cIdx]}>
                      <planeGeometry args={[0.88, 0.72]} />
                    </mesh>
                    {/* Illuminated Cabinet Marquee Header */}
                    <mesh position={[0, 1.32, 0.33]} material={animMats.arcadeScreens[(cIdx + 2) % 4]}>
                      <boxGeometry args={[0.96, 0.2, 0.08]} />
                    </mesh>
                    {/* Control Deck & Joystick */}
                    <mesh position={[0, 0.34, 0.42]}>
                      <boxGeometry args={[1.08, 0.14, 0.34]} />
                      <meshStandardMaterial color="#0f172a" roughness={0.4} />
                    </mesh>
                    <mesh position={[-0.22, 0.48, 0.46]}>
                      <sphereGeometry args={[0.07, 8, 8]} />
                      <meshStandardMaterial color="#ef4444" emissive="#dc2626" emissiveIntensity={0.8} />
                    </mesh>
                  </group>
                ))}
              </group>
            )}

            {/* 3. CHURROS: Cinnamon Churro Display Tray + Animated Rising Warm Aroma Wisps */}
            {booth.label === 'CHURROS' && (
              <group>
                {/* Counter Display Basket & Golden Churro Rods */}
                <mesh position={[0, 1.38, 2.55]}>
                  <boxGeometry args={[3.4, 0.22, 0.56]} />
                  <meshStandardMaterial color="#7c2d12" roughness={0.5} />
                </mesh>
                {[-1.1, -0.55, 0, 0.55, 1.1].map((cx, ci) => (
                  <mesh key={ci} position={[cx, 1.56, 2.55]} rotation={[0.15, 0.2 * (ci - 2), 0.35]}>
                    <cylinderGeometry args={[0.07, 0.07, 0.75, 8]} />
                    <meshStandardMaterial color="#d97706" roughness={0.55} />
                  </mesh>
                ))}
                {/* Rising Warm Steam / Aroma Wisps */}
                {[0, 1, 2].map((wIdx) => (
                  <mesh
                    key={wIdx}
                    ref={(el) => {
                      churroSteamRefs.current[wIdx] = el;
                    }}
                    position={[(wIdx - 1) * 1.1, 1.9, 2.58]}
                  >
                    <sphereGeometry args={[0.24, 8, 8]} />
                    <meshStandardMaterial
                      color="#fffbeb"
                      emissive="#fef3c7"
                      emissiveIntensity={0.45}
                      transparent
                      opacity={0.34}
                      depthWrite={false}
                    />
                  </mesh>
                ))}
              </group>
            )}

            {/* 4. ICE CREAM: Rotating Giant Pastel Soft-Serve Cone Sign Atop the Roof! */}
            {booth.label === 'ICE CREAM' && (
              <group ref={iceCreamSignRef} position={[0, 5.65, 1.1]}>
                {/* Waffle Cone */}
                <mesh position={[0, 0.75, 0]} rotation={[Math.PI, 0, 0]} castShadow>
                  <coneGeometry args={[0.78, 1.85, 14]} />
                  <meshStandardMaterial color="#d97706" roughness={0.62} />
                </mesh>
                {/* Triple-Swirl Pastel Soft-Serve Tiers (Strawberry, Vanilla, Mint) */}
                <mesh position={[0, 1.88, 0]} rotation={[Math.PI / 2, 0, 0]} castShadow>
                  <torusGeometry args={[0.62, 0.32, 10, 18]} />
                  <meshStandardMaterial color="#f9a8d4" emissive="#ec4899" emissiveIntensity={0.35} roughness={0.28} />
                </mesh>
                <mesh position={[0, 2.38, 0]} rotation={[Math.PI / 2, 0, 0]} castShadow>
                  <torusGeometry args={[0.46, 0.27, 10, 18]} />
                  <meshStandardMaterial color="#fffbeb" emissive="#fef3c7" emissiveIntensity={0.35} roughness={0.25} />
                </mesh>
                <mesh position={[0, 2.82, 0]} castShadow>
                  <coneGeometry args={[0.42, 0.72, 12]} />
                  <meshStandardMaterial color="#a7f3d0" emissive="#34d399" emissiveIntensity={0.35} roughness={0.26} />
                </mesh>
                {/* Glossy Cherry on Top */}
                <mesh position={[0.14, 3.24, 0.08]}>
                  <sphereGeometry args={[0.2, 10, 10]} />
                  <meshStandardMaterial color="#e11d48" emissive="#be123c" emissiveIntensity={0.6} roughness={0.12} metalness={0.2} />
                </mesh>
              </group>
            )}

            {/* 5. RING TOSS: Spinning Colorful 12-Segment Prize Wheel + Bouncing Clicker + Bottle Stacks */}
            {booth.label === 'RING TOSS' && (
              <group>
                <group position={[0, 2.22, 5]}>
                  {/* Wheel Stand Pedestal */}
                  <mesh position={[0, -1.1, -0.22]}>
                    <boxGeometry args={[0.45, 2.2, 0.4]} />
                    <meshStandardMaterial color="#fbbf24" metalness={0.8} roughness={0.22} />
                  </mesh>
                  {/* Spinning Colorful Wheel Disc & Rim Pegs */}
                  <group ref={prizeWheelRef}>
                    <mesh rotation={[Math.PI / 2, 0, 0]} castShadow>
                      <cylinderGeometry args={[1.65, 1.65, 0.22, 24]} />
                      <meshStandardMaterial color="#452737" metalness={0.42} roughness={0.36} />
                    </mesh>
                    <mesh position={[0, 0, 0.115]}>
                      <planeGeometry args={[3.43, 3.43]} />
                      <meshStandardMaterial map={prizeWheelTex} alphaTest={0.5} emissive="#ffffff" emissiveMap={prizeWheelTex} emissiveIntensity={0.42} roughness={0.28} />
                    </mesh>
                    <mesh position={[0, 0, 0.125]} material={animMats.boothNeon[idx]}>
                      <torusGeometry args={[1.65, 0.045, 6, 48]} />
                    </mesh>
                    {Array.from({ length: 12 }, (_, pegIdx) => {
                      const pAng = (pegIdx / 12) * Math.PI * 2;
                      return (
                        <mesh key={pegIdx} position={[Math.cos(pAng) * 1.56, Math.sin(pAng) * 1.56, 0.14]}>
                          <sphereGeometry args={[0.07, 6, 6]} />
                          <meshStandardMaterial color="#fef08a" emissive="#f59e0b" emissiveIntensity={1.6} />
                        </mesh>
                      );
                    })}
                  </group>
                  {/* Bouncing Red Top Pointer / Clicker pointing down into the rim pegs */}
                  <group ref={prizeClickerRef} position={[0, 1.9, 0.18]}>
                    <mesh position={[0, -0.18, 0]} rotation={[Math.PI, 0, 0]}>
                      <coneGeometry args={[0.16, 0.45, 6]} />
                      <meshStandardMaterial color="#ef4444" emissive="#dc2626" emissiveIntensity={1.2} />
                    </mesh>
                  </group>
                </group>
                {/* Colorful Ring-Toss Milk Bottles & Tossed Rings on Counter */}
                {[-2.2, -1.6, -1.0, 1.0, 1.6, 2.2].map((bx, bi) => (
                  <mesh key={bi} position={[bx, 1.48, 2.55]}>
                    <cylinderGeometry args={[0.08, 0.13, 0.38, 8]} />
                    <meshStandardMaterial color={bi % 2 === 0 ? '#f8fafc' : '#fde047'} roughness={0.3} />
                  </mesh>
                ))}
                {[-1.6, 1.6].map((rx, ri) => (
                  <mesh key={ri} position={[rx, 1.35, 2.75]} rotation={[Math.PI / 2, 0, 0]}>
                    <torusGeometry args={[0.18, 0.04, 6, 12]} />
                    <meshStandardMaterial color={ri === 0 ? '#ef4444' : '#38bdf8'} emissive={ri === 0 ? '#dc2626' : '#0284c7'} emissiveIntensity={0.6} />
                  </mesh>
                ))}
              </group>
            )}

            {/* 6. SKY BAR: Glowing Neon Cocktail Emblem + Bar Stools along Counter */}
            {booth.label === 'SKY BAR' && (
              <group>
                {/* Glowing Neon Martini Glass Rooftop Sign */}
                <group position={[0, 6.25, 1.9]}>
                  <mesh position={[0, 0.42, 0]} rotation={[Math.PI, 0, 0]} material={animMats.skyBarNeon}>
                    <coneGeometry args={[0.92, 0.95, 12, 1, true]} />
                  </mesh>
                  <mesh position={[0, -0.35, 0]} material={animMats.skyBarNeon}>
                    <cylinderGeometry args={[0.07, 0.07, 0.92, 8]} />
                  </mesh>
                  <mesh position={[0, -0.82, 0]} material={animMats.skyBarNeon}>
                    <cylinderGeometry args={[0.48, 0.48, 0.08, 12]} />
                  </mesh>
                  {/* Neon Coral Cocktail Olive & Straw */}
                  <mesh position={[0.25, 0.65, 0]} rotation={[0, 0, -0.45]}>
                    <cylinderGeometry args={[0.05, 0.05, 1.05, 6]} />
                    <meshStandardMaterial color="#fb7185" emissive="#f43f5e" emissiveIntensity={2.2} />
                  </mesh>
                  <mesh position={[0.15, 0.45, 0]}>
                    <sphereGeometry args={[0.16, 8, 8]} />
                    <meshStandardMaterial color="#a3e635" emissive="#84cc16" emissiveIntensity={1.8} />
                  </mesh>
                </group>
                {/* 3 Sleek Bar Stools in Front of the Counter */}
                {[-2.4, 0, 2.4].map((sx) => (
                  <group key={sx} position={[sx, 0, 3.55]}>
                    <mesh position={[0, 0.42, 0]}>
                      <cylinderGeometry args={[0.06, 0.14, 0.84, 8]} />
                      <meshStandardMaterial color="#94a3b8" metalness={0.85} roughness={0.2} />
                    </mesh>
                    <mesh position={[0, 0.86, 0]}>
                      <cylinderGeometry args={[0.32, 0.3, 0.12, 12]} />
                      <meshStandardMaterial color="#0f766e" roughness={0.35} />
                    </mesh>
                  </group>
                ))}
              </group>
            )}
          </group>
          );
        })}

        {/* SWAYING WARM EDISON STRING-LIGHT CATENARIES + FLUTTERING FESTIVE PENNANT BUNTING */}
        {catenaryZPositions.map((pz, rowIdx) => {
          const worldZ = -600 + pz;
          const catBaseY = Math.max(pierY, samplePierApronY(15.5, worldZ, pierY));
          return (
          <group key={`catenary_${pz}`} position={[0, catBaseY, pz]}>
            {[-15.5, 15.5].map((px) => (
              <group key={px} position={[px, 0, 0]}>
                <mesh position={[0, 3.4, 0]} castShadow>
                  <cylinderGeometry args={[0.11, 0.16, 6.8, 8]} />
                  <meshStandardMaterial color="#1e293b" metalness={0.78} roughness={0.24} />
                </mesh>
                <mesh position={[0, 6.95, 0]} material={animMats.edisonBulbs[rowIdx % 3]}>
                  <sphereGeometry args={[0.34, 10, 10]} />
                </mesh>
              </group>
            ))}

            {/* Swaying Draped Wire + Warm Edison Bulbs */}
            <group
              ref={(el) => {
                catenarySwayRefs.current[rowIdx] = el;
              }}
              position={[0, 6.82, 0]}
            >
              <mesh geometry={catenaryWireGeo}>
                <meshStandardMaterial color="#0f172a" roughness={0.7} />
              </mesh>
              {Array.from({ length: 11 }, (_, bIdx) => {
                const frac = bIdx / 10;
                const bx = -14.5 + frac * 29.0;
                const sag = Math.sin(frac * Math.PI) * 1.48;
                return (
                  <mesh
                    key={bIdx}
                    position={[bx, -sag - 0.1, 0]}
                    geometry={bulbGeoSmall}
                    material={animMats.edisonBulbs[(rowIdx + bIdx) % 3]}
                  />
                );
              })}

              {/* Colorful Triangular Festive Pennant Bunting Hanging Along Every Other Span */}
              {rowIdx % 2 === 0 && (
                <group
                  ref={(el) => {
                    buntingRowRefs.current[rowIdx / 2] = el;
                  }}
                >
                  {Array.from({ length: 18 }, (_, fIdx) => {
                    const frac = (fIdx + 0.5) / 18;
                    const fx = -14.8 + frac * 29.6;
                    const sag = Math.sin(frac * Math.PI) * 1.5;
                    return (
                      <mesh
                        key={fIdx}
                        position={[fx, -sag - 0.04, 0.05]}
                        geometry={pennantGeo}
                      >
                        <meshStandardMaterial
                          color={PENNANT_COLORS[(fIdx + rowIdx * 2) % PENNANT_COLORS.length]}
                          emissive={PENNANT_COLORS[(fIdx + rowIdx * 2) % PENNANT_COLORS.length]}
                          emissiveIntensity={0.22}
                          roughness={0.5}
                          side={THREE.DoubleSide}
                        />
                      </mesh>
                    );
                  })}
                </group>
              )}
            </group>
          </group>
          );
        })}

        {/* DIAGONAL FESTIVE PENNANT BUNTING GARLANDS LINKING MIDWAY BOOTHS TO PROMENADE POSTS */}
        {[
          { start: [-31.2, 5.1, 62], end: [-15.5, 6.6, 54], idx: 4 },
          { start: [-31.2, 5.1, 42], end: [-15.5, 6.6, 36], idx: 5 },
          { start: [-31.2, 5.1, 22], end: [-15.5, 6.6, 18], idx: 6 },
          { start: [31.2, 5.1, 62], end: [15.5, 6.6, 54], idx: 7 },
          { start: [31.2, 5.1, 42], end: [15.5, 6.6, 36], idx: 8 },
          { start: [31.2, 5.1, 22], end: [15.5, 6.6, 18], idx: 9 },
        ].map((span) => {
          const mx = (span.start[0] + span.end[0]) * 0.5;
          const my = (span.start[1] + span.end[1]) * 0.5;
          const mz = (span.start[2] + span.end[2]) * 0.5;
          const dx = span.end[0] - span.start[0];
          const dy = span.end[1] - span.start[1];
          const dz = span.end[2] - span.start[2];
          const len = Math.hypot(dx, dz);
          const yaw = Math.atan2(dz, dx);
          return (
            <group
              key={`midway_bunting_${span.idx}`}
              ref={(el) => {
                buntingRowRefs.current[span.idx] = el;
              }}
              position={[mx, pierY + my, mz]}
              rotation={[0, -yaw, 0]}
            >
              {Array.from({ length: 11 }, (_, fIdx) => {
                const f = (fIdx + 0.5) / 11;
                const lx = (f - 0.5) * len;
                const ly = (f - 0.5) * dy - Math.sin(f * Math.PI) * 0.85;
                return (
                  <mesh key={fIdx} position={[lx, ly, 0]} geometry={pennantGeo}>
                    <meshStandardMaterial
                      color={PENNANT_COLORS[(fIdx + span.idx) % PENNANT_COLORS.length]}
                      emissive={PENNANT_COLORS[(fIdx + span.idx) % PENNANT_COLORS.length]}
                      emissiveIntensity={0.25}
                      roughness={0.48}
                      side={THREE.DoubleSide}
                    />
                  </mesh>
                );
              })}
            </group>
          );
        })}

        {/* Coastal Boardwalk Benches & Decorative Planters */}
        {[66, 50, 32, 12, -12, -32].flatMap((bz) =>
          [-12.2, 12.2].map((bx) => {
            const benchY = Math.max(pierY, samplePierApronY(bx, -600 + bz, pierY));
            return (
            <group key={`bench_${bz}_${bx}`} position={[bx, benchY, bz]}>
              <mesh position={[0, 0.45, 0]} castShadow>
                <boxGeometry args={[0.75, 0.12, 2.8]} />
                <meshStandardMaterial color="#92400e" roughness={0.68} />
              </mesh>
              <mesh position={[bx < 0 ? -0.32 : 0.32, 0.82, 0]} castShadow>
                <boxGeometry args={[0.12, 0.65, 2.8]} />
                <meshStandardMaterial color="#78350f" roughness={0.7} />
              </mesh>
            </group>
            );
          })
        )}
      </group>

      {/* =================================================================== */}
      {/* ANIMATED OCEAN-PLAZA FOUNTAINS & MIST ACCENTS ALONG THE PROMENADE   */}
      {/* =================================================================== */}
      {PIER_FOUNTAINS.map((f, fIdx) => {
        const basinR = f.grand ? 3.1 : 1.75;
        const rimH = f.grand ? 0.68 : 0.52;
        const fY = f.y ?? pierY;
        return (
          <group key={f.id} position={[f.x, fY, f.z]}>
            {/* Sculpted Travertine & Brass Fountain Basin */}
            <mesh position={[0, rimH * 0.5, 0]} receiveShadow castShadow>
              <cylinderGeometry args={[basinR, basinR + 0.25, rimH, 20]} />
              <meshStandardMaterial color="#e7dfd3" roughness={0.45} metalness={0.12} />
            </mesh>
            <mesh position={[0, rimH + 0.03, 0]} rotation={[Math.PI / 2, 0, 0]}>
              <torusGeometry args={[basinR - 0.08, 0.12, 8, 24]} />
              <meshStandardMaterial color="#fbbf24" emissive="#d97706" emissiveIntensity={0.55} metalness={0.82} roughness={0.2} />
            </mesh>
            {/* Glowing Shimmering Turquoise Water Pool */}
            <mesh position={[0, rimH - 0.04, 0]} rotation={[-Math.PI / 2, 0, 0]}>
              <circleGeometry args={[basinR - 0.16, 20]} />
              <meshStandardMaterial color="#22d3ee" emissive="#0891b2" emissiveIntensity={0.85} roughness={0.08} metalness={0.35} />
            </mesh>
            {/* Central Tiered Pedestal */}
            <mesh position={[0, rimH + (f.grand ? 0.65 : 0.32), 0]} castShadow>
              <cylinderGeometry args={[f.grand ? 0.42 : 0.26, f.grand ? 0.68 : 0.42, f.grand ? 1.3 : 0.65, 12]} />
              <meshStandardMaterial color="#d6c7b2" roughness={0.4} />
            </mesh>
            {f.grand && (
              <mesh position={[0, rimH + 1.25, 0]} castShadow>
                <cylinderGeometry args={[1.35, 0.45, 0.38, 16]} />
                <meshStandardMaterial color="#e7dfd3" roughness={0.38} />
              </mesh>
            )}
            {/* Animated Rising/Falling Central Water Plume */}
            <mesh
              ref={(el) => {
                fountainJetRefs.current[fIdx] = el;
              }}
              position={[0, rimH + (f.grand ? 1.45 : 0.65), 0]}
            >
              <cylinderGeometry args={[f.grand ? 0.48 : 0.28, f.grand ? 0.14 : 0.1, f.grand ? 2.8 : 1.7, 10, 1, true]} />
              <meshStandardMaterial
                color="#e0f2fe"
                emissive="#38bdf8"
                emissiveIntensity={1.15}
                transparent
                opacity={0.72}
                side={THREE.DoubleSide}
                depthWrite={false}
              />
            </mesh>
            {/* Animated Parabolic Ring Spray Crown */}
            <mesh
              ref={(el) => {
                fountainRingJetRefs.current[fIdx] = el;
              }}
              position={[0, rimH + (f.grand ? 0.85 : 0.45), 0]}
            >
              <cylinderGeometry args={[basinR * 0.65, f.grand ? 0.35 : 0.2, f.grand ? 1.55 : 0.95, 14, 1, true]} />
              <meshStandardMaterial
                color="#bae6fd"
                emissive="#06b6d4"
                emissiveIntensity={0.85}
                transparent
                opacity={0.48}
                side={THREE.DoubleSide}
                depthWrite={false}
              />
            </mesh>
            {/* Soft Translucent Expanding Mist Ring */}
            <mesh
              ref={(el) => {
                fountainMistRefs.current[fIdx] = el;
              }}
              position={[0, f.grand ? 2.1 : 1.35, 0]}
              rotation={[-Math.PI / 2, 0, 0]}
            >
              <ringGeometry args={[basinR * 0.25, basinR * 0.82, 20]} />
              <meshStandardMaterial
                color="#f0f9ff"
                emissive="#7dd3fc"
                emissiveIntensity={0.65}
                transparent
                opacity={0.28}
                side={THREE.DoubleSide}
                depthWrite={false}
              />
            </mesh>
          </group>
        );
      })}

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

        {/* Central Hub Axle with Pulsing Art-Deco Sunburst Medallions */}
        <mesh position={[0, 25.5, 0]} rotation={[0, 0, Math.PI / 2]} material={animMats.wheelHubGlow}>
          <cylinderGeometry args={[1.65, 1.65, 8.6, 18]} />
        </mesh>
        {[-4.38, 4.38].map((hx) => (
          <mesh key={hx} position={[hx, 25.5, 0]} rotation={[0, 0, Math.PI / 2]} material={animMats.wheelHubGlow}>
            <cylinderGeometry args={[2.55, 2.55, 0.24, 16]} />
          </mesh>
        ))}

        {/* Rotating Wheel Rim, Radial Chasing LED Spokes & 12 Self-Leveling Panoramic Gondolas */}
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

          {/* 24 Flush Chasing LED Rim Collars wrapped snugly around Both Outer Rims (zero floating spheres!) */}
          {Array.from({ length: 24 }, (_, rIdx) => {
            const ang = (rIdx / 24) * Math.PI * 2;
            const ry = Math.sin(ang) * 20.5;
            const rz = Math.cos(ang) * 20.5;
            const mat = animMats.wheelRimChase[rIdx % 12];
            return (
              <React.Fragment key={`rimled_${rIdx}`}>
                <mesh position={[-2.4, ry, rz]} rotation={[-ang, 0, 0]} geometry={rimCollarGeo} material={mat} />
                <mesh position={[2.4, ry, rz]} rotation={[-ang, 0, 0]} geometry={rimCollarGeo} material={mat} />
              </React.Fragment>
            );
          })}

          {Array.from({ length: 12 }, (_, i) => {
            const ang = (i / 12) * Math.PI * 2;
            const sy = Math.sin(ang) * 20.5;
            const sz = Math.cos(ang) * 20.5;
            const spokeRotX = Math.PI / 2 - ang;
            const col = GONDOLA_COLORS[i % GONDOLA_COLORS.length];
            const spokeGlow = i % 2 === 0 ? '#38bdf8' : '#ec4899';
            return (
              <React.Fragment key={i}>
                {[-2.3, 2.3].map((sx) => (
                  <React.Fragment key={sx}>
                    <mesh position={[sx, sy * 0.5, sz * 0.5]} rotation={[spokeRotX, 0, 0]}>
                      <cylinderGeometry args={[0.12, 0.12, 20.5, 6]} />
                      <meshStandardMaterial
                        color="#f8fafc"
                        emissive={spokeGlow}
                        emissiveIntensity={0.5}
                        metalness={0.7}
                        roughness={0.22}
                      />
                    </mesh>
                    {/* Flush Coaxial Radial Chasing LED Sleeves mounted directly ON Every Spoke */}
                    {[0.24, 0.42, 0.6, 0.78, 0.92].map((rFrac, bStep) => (
                      <mesh
                        key={bStep}
                        position={[sx, sy * rFrac, sz * rFrac]}
                        rotation={[spokeRotX, 0, 0]}
                        geometry={spokeSleeveGeo}
                        material={animMats.wheelSpokeChase[(bStep + (i % 2)) % 6]}
                      />
                    ))}
                  </React.Fragment>
                ))}

                {/* Counter-rotating Open-Windowed Panoramic Observation Gondola Cabin */}
                {/* Rider feet sit at local y = -1.20; outer C-yoke leaves cabin 100% unobstructed! */}
                <group
                  ref={(el) => {
                    gondolaRefs.current[i] = el;
                  }}
                  position={[0, sy, sz]}
                >
                  {/* External Side Rim Pivot Stubs (outside cabin, x = ±1.78..±2.4) */}
                  {[-2.08, 2.08].map((px) => (
                    <mesh key={px} position={[px, 0, 0]} rotation={[0, 0, Math.PI / 2]}>
                      <cylinderGeometry args={[0.12, 0.12, 0.72, 8]} />
                      <meshStandardMaterial color="#cbd5e1" metalness={0.85} roughness={0.2} />
                    </mesh>
                  ))}
                  {/* Twin Curved Outer C-Yoke Suspension Arms flanking the cabin (zero center pole!) */}
                  {[-1.78, 1.78].map((yx) => (
                    <mesh key={yx} position={[yx, -0.15, 0]}>
                      <boxGeometry args={[0.14, 2.48, 0.16]} />
                      <meshStandardMaterial color="#94a3b8" metalness={0.84} roughness={0.22} />
                    </mesh>
                  ))}
                  {/* Under-Floor Structural Cradle Beam & Overhead Roof Crown Crossbar */}
                  <mesh position={[0, -1.36, 0]}>
                    <boxGeometry args={[3.7, 0.14, 0.24]} />
                    <meshStandardMaterial color="#64748b" metalness={0.8} roughness={0.26} />
                  </mesh>
                  <mesh position={[0, 1.06, 0]}>
                    <boxGeometry args={[3.7, 0.14, 0.22]} />
                    <meshStandardMaterial color="#fbbf24" metalness={0.85} roughness={0.2} />
                  </mesh>

                  {/* Observation Cabin Floor Deck (top surface at y = -1.20 for exact rider stance) */}
                  <mesh position={[0, -1.27, 0]} castShadow receiveShadow>
                    <cylinderGeometry args={[1.56, 1.38, 0.14, 16]} />
                    <meshStandardMaterial color="#1e293b" roughness={0.42} metalness={0.35} />
                  </mesh>
                  {/* Hollow Glossy Colored Lower Waist Wall (y = -1.20 .. -0.35, open interior!) */}
                  <mesh position={[0, -0.78, 0]} castShadow>
                    <cylinderGeometry args={[1.58, 1.46, 0.86, 16, 1, true]} />
                    <meshStandardMaterial color={col} roughness={0.22} metalness={0.38} side={THREE.DoubleSide} />
                  </mesh>
                  {/* Warm Brass Waist Safety Handrail Ring */}
                  <mesh position={[0, -0.35, 0]} rotation={[Math.PI / 2, 0, 0]}>
                    <torusGeometry args={[1.58, 0.06, 8, 24]} />
                    <meshStandardMaterial color="#fbbf24" emissive="#d97706" emissiveIntensity={0.75} metalness={0.88} roughness={0.18} />
                  </mesh>
                  {/* 4 Slender Corner Window Mullions (at 45° diagonals so front/back panorama stays wide open) */}
                  {[Math.PI * 0.25, Math.PI * 0.75, Math.PI * 1.25, Math.PI * 1.75].map((mAng, mIdx) => (
                    <mesh key={mIdx} position={[Math.cos(mAng) * 1.54, 0.34, Math.sin(mAng) * 1.54]}>
                      <cylinderGeometry args={[0.045, 0.045, 1.38, 6]} />
                      <meshStandardMaterial color="#fbbf24" metalness={0.86} roughness={0.2} />
                    </mesh>
                  ))}
                  {/* Ultra-Clear Panoramic Glass Window Band (y = -0.34 .. +0.98) */}
                  <mesh position={[0, 0.32, 0]}>
                    <cylinderGeometry args={[1.54, 1.56, 1.28, 16, 1, true]} />
                    <meshStandardMaterial
                      color="#e0f2fe"
                      emissive={col}
                      emissiveIntensity={0.22}
                      roughness={0.06}
                      metalness={0.2}
                      transparent
                      opacity={0.16}
                      side={THREE.DoubleSide}
                      depthWrite={false}
                    />
                  </mesh>
                  {/* Gilded Panoramic Canopy Dome Roof (high overhead at y = +1.05..+1.48, well above rider!) */}
                  <mesh position={[0, 1.24, 0]} castShadow>
                    <coneGeometry args={[1.72, 0.44, 16]} />
                    <meshStandardMaterial color="#fbbf24" emissive="#d97706" emissiveIntensity={0.35} metalness={0.78} roughness={0.22} />
                  </mesh>
                  <mesh position={[0, 1.02, 0]} rotation={[Math.PI / 2, 0, 0]}>
                    <torusGeometry args={[1.64, 0.065, 8, 24]} />
                    <meshStandardMaterial color={col} emissive={col} emissiveIntensity={0.75} roughness={0.2} />
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
        {/* 3-Tier Circular Entry Steps matching registerTravelSurface so players step right up! */}
        <mesh position={[0, 0.14, 0]} receiveShadow>
          <cylinderGeometry args={[11.15, 11.35, 0.28, 32]} />
          <meshStandardMaterial color="#334155" roughness={0.5} metalness={0.25} />
        </mesh>
        <mesh position={[0, 0.42, 0]} receiveShadow>
          <cylinderGeometry args={[10.35, 10.55, 0.28, 32]} />
          <meshStandardMaterial color="#1e293b" roughness={0.44} metalness={0.3} />
        </mesh>
        <mesh position={[0, 0.69, 0]} receiveShadow>
          <cylinderGeometry args={[9.55, 9.75, 0.28, 32]} />
          <meshStandardMaterial color="#1e293b" roughness={0.4} metalness={0.32} />
        </mesh>
        <mesh position={[0, 0.85, 0]}>
          <cylinderGeometry args={[9.1, 9.45, 0.14, 32]} />
          <meshStandardMaterial color="#fbbf24" emissive="#d97706" emissiveIntensity={0.75} metalness={0.8} roughness={0.2} />
        </mesh>

        {/* Central Mirrored Column with Gilded Capital Rings */}
        <mesh position={[0, 4.2, 0]}>
          <cylinderGeometry args={[1.35, 1.55, 6.8, 16]} />
          <meshStandardMaterial color="#fde047" emissive="#ca8a04" emissiveIntensity={0.6} metalness={0.85} roughness={0.18} />
        </mesh>
        {[1.4, 4.2, 6.9].map((ry) => (
          <mesh key={ry} position={[0, ry, 0]} rotation={[Math.PI / 2, 0, 0]}>
            <torusGeometry args={[1.55, 0.12, 8, 20]} />
            <meshStandardMaterial color="#fef08a" emissive="#f59e0b" emissiveIntensity={1.1} metalness={0.85} roughness={0.18} />
          </mesh>
        ))}

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

        {/* Gilded Frieze Rim + Chasing Fairground Bulb Ring */}
        <mesh position={[0, 7.1, 0]}>
          <cylinderGeometry args={[9.88, 9.88, 0.56, 24]} />
          <meshStandardMaterial color="#fbbf24" emissive="#d97706" emissiveIntensity={0.9} metalness={0.75} roughness={0.22} />
        </mesh>
        {Array.from({ length: 24 }, (_, bIdx) => {
          const ang = (bIdx / 24) * Math.PI * 2;
          return (
            <mesh
              key={bIdx}
              position={[Math.cos(ang) * 9.98, 7.12, Math.sin(ang) * 9.98]}
              geometry={bulbGeoMed}
              material={animMats.carouselBulbChase[bIdx % 8]}
            />
          );
        })}

        {/* Spinning Ornate Crown Banners & Scalloped Valance Flags below the Frieze */}
        <group ref={carouselCrownRef} position={[0, 6.72, 0]}>
          {Array.from({ length: 16 }, (_, vIdx) => {
            const ang = (vIdx / 16) * Math.PI * 2;
            return (
              <group
                key={vIdx}
                position={[Math.cos(ang) * 9.75, 0, Math.sin(ang) * 9.75]}
                rotation={[0, -ang + Math.PI / 2, 0]}
              >
                <mesh position={[0, -0.32, 0]}>
                  <boxGeometry args={[1.45, 0.58, 0.08]} />
                  <meshStandardMaterial
                    color={vIdx % 2 === 0 ? '#991b1b' : '#1e3a8a'}
                    emissive={vIdx % 2 === 0 ? '#dc2626' : '#2563eb'}
                    emissiveIntensity={0.45}
                    roughness={0.35}
                  />
                </mesh>
                <mesh position={[0, -0.66, 0]}>
                  <boxGeometry args={[1.48, 0.1, 0.1]} />
                  <meshStandardMaterial color="#fbbf24" emissive="#d97706" emissiveIntensity={0.85} metalness={0.85} />
                </mesh>
              </group>
            );
          })}
        </group>

        {/* Spinning Golden Finial Crown & Royal Pennant */}
        <group ref={carouselFinialRef} position={[0, 11.0, 0]}>
          <mesh>
            <sphereGeometry args={[0.75, 12, 12]} />
            <meshStandardMaterial color="#fde047" emissive="#f59e0b" emissiveIntensity={1.8} />
          </mesh>
          <mesh position={[0, 1.35, 0]}>
            <cylinderGeometry args={[0.06, 0.1, 2.2, 8]} />
            <meshStandardMaterial color="#fbbf24" metalness={0.9} roughness={0.15} />
          </mesh>
          <mesh position={[0.75, 2.05, 0]} rotation={[0, 0, -Math.PI / 2]}>
            <coneGeometry args={[0.42, 1.45, 4]} />
            <meshStandardMaterial color="#dc2626" emissive="#b91c1c" emissiveIntensity={0.6} roughness={0.35} />
          </mesh>
        </group>

        {/* Rotating Turntable, Brass Poles with Golden Trim & 8 Galloping Steeds */}
        <group ref={carouselRotorRef} position={[0, 0.85, 0]}>
          <mesh position={[0, 0.08, 0]} receiveShadow>
            <cylinderGeometry args={[8.4, 8.4, 0.16, 32]} />
            <meshStandardMaterial color="#78350f" roughness={0.45} />
          </mesh>
          <mesh position={[0, 0.18, 0]} rotation={[-Math.PI / 2, 0, 0]}>
            <ringGeometry args={[5.9, 6.5, 32]} />
            <meshStandardMaterial color="#fbbf24" emissive="#d97706" emissiveIntensity={0.5} metalness={0.8} roughness={0.25} side={THREE.DoubleSide} />
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
                {/* Brass Spiral Pole + Gilded Base & Top Collars */}
                <mesh position={[0, 3.1, 0]}>
                  <cylinderGeometry args={[0.085, 0.085, 6.2, 8]} />
                  <meshStandardMaterial color="#fbbf24" emissive="#ca8a04" emissiveIntensity={0.35} metalness={0.92} roughness={0.12} />
                </mesh>
                <mesh position={[0, 0.28, 0]}>
                  <cylinderGeometry args={[0.18, 0.24, 0.24, 10]} />
                  <meshStandardMaterial color="#fde047" metalness={0.9} roughness={0.15} />
                </mesh>
                <mesh position={[0, 5.95, 0]}>
                  <cylinderGeometry args={[0.22, 0.16, 0.26, 10]} />
                  <meshStandardMaterial color="#fde047" metalness={0.9} roughness={0.15} />
                </mesh>

                {/* Galloping & Gently Rocking Sculpted Curved Riviera Carousel Steed */}
                <group
                  ref={(el) => {
                    steedRefs.current[i] = el;
                  }}
                  position={[0, 1.45, 0]}
                >
                  {/* Golden Pole Collar Ring moving with the Steed */}
                  <mesh position={[0, 0.62, 0]} rotation={[Math.PI / 2, 0, 0]}>
                    <torusGeometry args={[0.16, 0.05, 6, 12]} />
                    <meshStandardMaterial color="#fde047" emissive="#f59e0b" emissiveIntensity={0.9} metalness={0.9} />
                  </mesh>
                  {/* Sleek Sculpted Organic Barrel Torso (Capsule + Rounded Chest & Haunches) */}
                  <mesh rotation={[Math.PI / 2, 0, 0]} castShadow>
                    <capsuleGeometry args={[0.31, 0.88, 6, 12]} />
                    <meshStandardMaterial color={col} roughness={0.2} metalness={0.18} />
                  </mesh>
                  <mesh position={[0, 0.05, 0.44]} castShadow>
                    <sphereGeometry args={[0.34, 10, 10]} />
                    <meshStandardMaterial color={col} roughness={0.2} metalness={0.18} />
                  </mesh>
                  <mesh position={[0, 0.03, -0.44]} castShadow>
                    <sphereGeometry args={[0.33, 10, 10]} />
                    <meshStandardMaterial color={col} roughness={0.2} metalness={0.18} />
                  </mesh>
                  {/* Curved Draped Crimson & Gold Saddle Blanket across the Horse's Back (+Y) */}
                  <mesh position={[0, 0.06, -0.04]} rotation={[Math.PI / 2, 0, 0]}>
                    <cylinderGeometry args={[0.355, 0.355, 0.62, 14, 1, false, Math.PI * 0.45, Math.PI * 1.1]} />
                    <meshStandardMaterial color="#dc2626" roughness={0.34} metalness={0.15} side={THREE.DoubleSide} />
                  </mesh>
                  <mesh position={[0, 0.04, -0.04]} rotation={[Math.PI / 2, 0, 0]}>
                    <cylinderGeometry args={[0.365, 0.365, 0.7, 14, 1, true, Math.PI * 0.43, Math.PI * 1.14]} />
                    <meshStandardMaterial color="#fbbf24" metalness={0.85} roughness={0.2} side={THREE.DoubleSide} />
                  </mesh>
                  {/* Graceful Arched Tapered Neck & Sculpted Flowing Golden Mane */}
                  <mesh position={[0, 0.48, 0.62]} rotation={[0.42, 0, 0]} castShadow>
                    <cylinderGeometry args={[0.16, 0.27, 0.82, 10]} />
                    <meshStandardMaterial color={col} roughness={0.2} metalness={0.18} />
                  </mesh>
                  <mesh position={[0, 0.56, 0.42]} rotation={[0.42, 0, 0]}>
                    <capsuleGeometry args={[0.08, 0.48, 4, 8]} />
                    <meshStandardMaterial color="#fbbf24" roughness={0.3} metalness={0.4} />
                  </mesh>
                  {/* Sculpted Horse Head, Tapered Muzzle, Pointed Ears & Golden Crown Plume */}
                  <mesh position={[0, 0.88, 0.84]} castShadow>
                    <sphereGeometry args={[0.2, 10, 10]} />
                    <meshStandardMaterial color={col} roughness={0.2} />
                  </mesh>
                  <mesh position={[0, 0.78, 1.05]} rotation={[Math.PI / 2 + 0.35, 0, 0]} castShadow>
                    <cylinderGeometry args={[0.095, 0.16, 0.42, 10]} />
                    <meshStandardMaterial color={col} roughness={0.2} />
                  </mesh>
                  {[-0.09, 0.09].map((ex) => (
                    <mesh key={ex} position={[ex, 1.08, 0.8]} rotation={[-0.12, 0, ex < 0 ? 0.18 : -0.18]}>
                      <coneGeometry args={[0.055, 0.18, 6]} />
                      <meshStandardMaterial color={col} roughness={0.22} />
                    </mesh>
                  ))}
                  {/* Golden Bridle Ring & Festive Crimson Feather Crest */}
                  <mesh position={[0, 0.81, 0.99]} rotation={[0.35, 0, 0]}>
                    <torusGeometry args={[0.145, 0.025, 6, 12]} />
                    <meshStandardMaterial color="#fbbf24" metalness={0.9} roughness={0.15} />
                  </mesh>
                  <mesh position={[0, 1.12, 0.84]} rotation={[-0.3, 0, 0]}>
                    <coneGeometry args={[0.08, 0.24, 6]} />
                    <meshStandardMaterial color="#e11d48" emissive="#be123c" emissiveIntensity={0.4} roughness={0.35} />
                  </mesh>
                  {/* Sweeping Curved Flowing Tail */}
                  <mesh position={[0, 0.02, -0.84]} rotation={[-0.72, 0, 0]}>
                    <capsuleGeometry args={[0.095, 0.42, 4, 8]} />
                    <meshStandardMaterial color="#fbbf24" roughness={0.32} metalness={0.35} />
                  </mesh>
                  <mesh position={[0, -0.22, -1.04]} rotation={[-0.28, 0, 0]}>
                    <capsuleGeometry args={[0.075, 0.34, 4, 8]} />
                    <meshStandardMaterial color="#fde047" roughness={0.32} metalness={0.35} />
                  </mesh>
                  {/* Sculpted Articulated Prancing Legs with Gilded Hooves */}
                  {[-0.18, 0.18].map((lx, legIdx) => (
                    <React.Fragment key={lx}>
                      {/* Raised Prancing Front Leg (upper + tucked forearm + hoof) */}
                      <mesh position={[lx, -0.28, 0.56]} rotation={[0.65 + legIdx * 0.15, 0, 0]}>
                        <capsuleGeometry args={[0.075, 0.34, 4, 8]} />
                        <meshStandardMaterial color={col} roughness={0.22} />
                      </mesh>
                      <mesh position={[lx, -0.54, 0.72]} rotation={[-0.35 + legIdx * 0.12, 0, 0]}>
                        <capsuleGeometry args={[0.058, 0.32, 4, 8]} />
                        <meshStandardMaterial color={col} roughness={0.22} />
                      </mesh>
                      <mesh position={[lx, -0.71, 0.67]}>
                        <cylinderGeometry args={[0.055, 0.068, 0.1, 8]} />
                        <meshStandardMaterial color="#b45309" metalness={0.75} roughness={0.25} />
                      </mesh>
                      {/* Driving Rear Leg (haunch thigh + lower cannon + hoof) */}
                      <mesh position={[lx, -0.32, -0.52]} rotation={[-0.45 - legIdx * 0.1, 0, 0]}>
                        <capsuleGeometry args={[0.085, 0.36, 4, 8]} />
                        <meshStandardMaterial color={col} roughness={0.22} />
                      </mesh>
                      <mesh position={[lx, -0.62, -0.68]} rotation={[-0.25, 0, 0]}>
                        <capsuleGeometry args={[0.058, 0.34, 4, 8]} />
                        <meshStandardMaterial color={col} roughness={0.22} />
                      </mesh>
                      <mesh position={[lx, -0.82, -0.74]}>
                        <cylinderGeometry args={[0.055, 0.068, 0.1, 8]} />
                        <meshStandardMaterial color="#b45309" metalness={0.75} roughness={0.25} />
                      </mesh>
                    </React.Fragment>
                  ))}
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
          {/* Steel Station Canopy Support Columns */}
          {[-6.5, 6.5].flatMap((sx) =>
            [-8.2, 0, 8.2].map((sz) => (
              <mesh key={`stcol_${sx}_${sz}`} position={[sx, 6.0, sz]} castShadow>
                <cylinderGeometry args={[0.24, 0.28, 3.1, 8]} />
                <meshStandardMaterial color="#e2e8f0" metalness={0.72} roughness={0.25} />
              </mesh>
            ))
          )}
          {/* Station Roof Canopy + Illuminated CYCLONE Signboards */}
          <mesh position={[0, 7.6, 0]} castShadow>
            <boxGeometry args={[14.8, 0.55, 18.8]} />
            <meshStandardMaterial color="#b91c1c" roughness={0.3} metalness={0.45} />
          </mesh>
          <mesh position={[-7.46, 7.95, 0]} rotation={[0, -Math.PI / 2, 0]}>
            <planeGeometry args={[11.2, 1.85]} />
            <meshStandardMaterial map={coasterSignTex} emissive="#ffffff" emissiveMap={coasterSignTex} emissiveIntensity={0.55} />
          </mesh>
          <mesh position={[0, 7.95, 9.46]}>
            <planeGeometry args={[10.2, 1.85]} />
            <meshStandardMaterial map={coasterSignTex} emissive="#ffffff" emissiveMap={coasterSignTex} emissiveIntensity={0.55} />
          </mesh>

          {/* Animated Station Loading Air-Gates along the West Boarding Edge */}
          {[-5.4, -1.8, 1.8, 5.4].map((gz, gIdx) => (
            <group key={`gate_${gIdx}`} position={[-6.8, 4.65, gz]}>
              {/* Gate Stanchion */}
              <mesh position={[0, 0.62, -0.78]}>
                <cylinderGeometry args={[0.1, 0.12, 1.24, 8]} />
                <meshStandardMaterial color="#fbbf24" metalness={0.82} roughness={0.2} />
              </mesh>
              {/* Animated Pivoting Safety Air-Gate Leaf hinged at the Stanchion */}
              <group
                ref={(el) => {
                  coasterGateRefs.current[gIdx] = el;
                }}
                position={[0, 0.62, -0.78]}
              >
                <mesh position={[0, 0, 0.72]}>
                  <boxGeometry args={[0.1, 0.92, 1.35]} />
                  <meshStandardMaterial color="#f59e0b" emissive="#d97706" emissiveIntensity={0.45} metalness={0.5} roughness={0.25} />
                </mesh>
              </group>
            </group>
          ))}
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

        {/* Animated Glowing Lift-Hill Chase Chevrons on Main Chain-Lift Climb */}
        {liftChevrons.map((chev, idx) => (
          <mesh
            key={`chev_${idx}`}
            position={chev.pos}
            rotation={chev.rot}
            geometry={chevronGeo}
            material={animMats.liftChevronChase[idx % 7]}
          />
        ))}

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

        {/* 3-Car Sculpted Aerodynamic Hyper-Coaster Train with Rotating Bogie Wheels */}
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
            {/* Side Gold Racing Accent Strips */}
            {[-0.99, 0.99].map((sx) => (
              <mesh key={sx} position={[sx, 0.56, 0]}>
                <boxGeometry args={[0.04, 0.14, 2.95]} />
                <meshStandardMaterial color="#fbbf24" emissive="#d97706" emissiveIntensity={0.8} metalness={0.85} />
              </mesh>
            ))}
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
            {/* Subtle Rotating Dual Rail-Hugger Bogie Wheels (4 per car) */}
            {[
              [-0.78, 0.95],
              [0.78, 0.95],
              [-0.78, -0.95],
              [0.78, -0.95],
            ].map(([wx, wz], wLocalIdx) => (
              <mesh
                key={wLocalIdx}
                ref={(el) => {
                  coasterBogieWheelRefs.current[cIdx * 4 + wLocalIdx] = el;
                }}
                position={[wx, 0.06, wz]}
                rotation={[0, 0, Math.PI / 2]}
              >
                <cylinderGeometry args={[0.2, 0.2, 0.16, 8]} />
                <meshStandardMaterial color="#334155" metalness={0.85} roughness={0.22} />
              </mesh>
            ))}
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

        {/* Animated Vertical Telemetry Light Rings Synced to Drop Cycle */}
        {Array.from({ length: 6 }, (_, tier) => (
          <mesh
            key={`dt_ring_${tier}`}
            position={[0, 6.5 + tier * 9.5, 0]}
            rotation={[Math.PI / 2, 0, 0]}
            material={animMats.dropTowerChase[tier]}
          >
            <torusGeometry args={[2.32, 0.14, 8, 20]} />
          </mesh>
        ))}

        <mesh position={[0, 62.4, 0]}>
          <cylinderGeometry args={[4.4, 2.6, 2.6, 16]} />
          <meshStandardMaterial color="#fbbf24" emissive="#f59e0b" emissiveIntensity={1.5} metalness={0.7} roughness={0.2} />
        </mesh>
        <group ref={dropBeaconRef} position={[0, 65.8, 0]}>
          <mesh>
            <cylinderGeometry args={[0.12, 0.35, 4.8, 8]} />
            <meshStandardMaterial color="#f43f5e" emissive="#e11d48" emissiveIntensity={2.2} />
          </mesh>
          <mesh position={[0, 2.45, 0]}>
            <octahedronGeometry args={[0.68, 0]} />
            <meshStandardMaterial color="#fef08a" emissive="#f59e0b" emissiveIntensity={2.8} />
          </mesh>
        </group>

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
      {/* 5. NEW THRILL RIDE: AZUREA GALLEON PENDULUM SHIP (NW Pier -31,-666) */}
      {/*    Clearance verified: X in [-43.3..-18.7], Z in [-671.5..-660.5]   */}
      {/* =================================================================== */}
      <group position={[-31, pierY, -666]}>
        {/* Octagonal Coastal Boarding Deck Plinth */}
        <mesh position={[0, 0.4, 0]} receiveShadow castShadow>
          <cylinderGeometry args={[8.6, 9.4, 0.8, 8]} />
          <meshStandardMaterial color="#0f172a" roughness={0.44} metalness={0.35} />
        </mesh>
        <mesh position={[0, 0.84, 0]}>
          <cylinderGeometry args={[8.2, 8.5, 0.14, 8]} />
          <meshStandardMaterial color="#38bdf8" emissive="#0284c7" emissiveIntensity={1.25} />
        </mesh>

        {/* Twin Heroic A-Frame Gilded Support Towers (spread along Z = ±4.5m -> ±1.9m at crown) */}
        {[-1, 1].map((zDir) => (
          <group key={zDir}>
            {/* Fore & Aft A-Frame Legs meeting cleanly at (0, 14.5, zDir * 1.9) */}
            {[-3.6, 3.6].map((xFoot) => (
              <mesh
                key={xFoot}
                position={[xFoot * 0.5, 7.65, zDir * 3.2]}
                rotation={[-zDir * 0.187, 0, xFoot < 0 ? -0.257 : 0.257]}
                castShadow
              >
                <cylinderGeometry args={[0.32, 0.48, 14.6, 10]} />
                <meshStandardMaterial color="#f8fafc" metalness={0.68} roughness={0.22} />
              </mesh>
            ))}
            {/* Horizontal Gilded Cross-Brace */}
            <mesh position={[0, 7.2, zDir * 3.35]}>
              <boxGeometry args={[4.0, 0.34, 0.34]} />
              <meshStandardMaterial color="#fbbf24" emissive="#d97706" emissiveIntensity={0.65} metalness={0.82} roughness={0.2} />
            </mesh>
          </group>
        ))}

        {/* Overhead Main Pivot Housing & Art-Deco AZUREA GALLEON Marquee Crest */}
        <mesh position={[0, 14.5, 0]} rotation={[Math.PI / 2, 0, 0]} castShadow>
          <cylinderGeometry args={[0.78, 0.78, 4.6, 14]} />
          <meshStandardMaterial color="#fbbf24" emissive="#f59e0b" emissiveIntensity={1.1} metalness={0.85} roughness={0.18} />
        </mesh>
        <mesh position={[0, 16.25, 0]} castShadow>
          <boxGeometry args={[9.4, 1.7, 0.9]} />
          <meshStandardMaterial color="#0c1e3a" roughness={0.32} metalness={0.5} />
        </mesh>
        <mesh position={[0, 16.25, 0.48]}>
          <planeGeometry args={[8.6, 1.45]} />
          <meshStandardMaterial map={galleonSignTex} emissive="#ffffff" emissiveMap={galleonSignTex} emissiveIntensity={0.55} />
        </mesh>
        <mesh position={[0, 16.25, -0.48]} rotation={[0, Math.PI, 0]}>
          <planeGeometry args={[8.6, 1.45]} />
          <meshStandardMaterial map={galleonSignTex} emissive="#ffffff" emissiveMap={galleonSignTex} emissiveIntensity={0.55} />
        </mesh>
        {/* Crest Chasing Bulbs */}
        {Array.from({ length: 9 }, (_, bIdx) => (
          <mesh
            key={`gal_bulb_${bIdx}`}
            position={[-4.0 + bIdx * 1.0, 17.22, 0.45]}
            geometry={bulbGeoSmall}
            material={animMats.archChase[bIdx % 8]}
          />
        ))}

        {/* Continuously Swinging Pendulum Assembly (Pivots around Z, swinging along X!) */}
        <group ref={galleonSwingRef} position={[0, 14.5, 0]}>
          {/* Twin Rigid Steel Suspension Arms descending 10.2m to the Ship Hull */}
          {[-1.75, 1.75].map((armZ) => (
            <React.Fragment key={armZ}>
              <mesh position={[-1.4, -5.1, armZ]} rotation={[0, 0, -0.24]} castShadow>
                <cylinderGeometry args={[0.16, 0.2, 10.5, 8]} />
                <meshStandardMaterial color="#fbbf24" metalness={0.85} roughness={0.2} />
              </mesh>
              <mesh position={[1.4, -5.1, armZ]} rotation={[0, 0, 0.24]} castShadow>
                <cylinderGeometry args={[0.16, 0.2, 10.5, 8]} />
                <meshStandardMaterial color="#fbbf24" metalness={0.85} roughness={0.2} />
              </mesh>
            </React.Fragment>
          ))}

          {/* Sculpted 13m Azurea Galleon Ship Hull */}
          <group position={[0, -10.2, 0]}>
            {/* Deep Mahogany & Royal Navy Main Hull Keel */}
            <mesh position={[0, 0.35, 0]} castShadow>
              <boxGeometry args={[9.4, 1.65, 3.3]} />
              <meshStandardMaterial color="#172554" roughness={0.34} metalness={0.38} />
            </mesh>
            {/* Swept Wooden Lower Keel Strake */}
            <mesh position={[0, -0.58, 0]} castShadow>
              <boxGeometry args={[7.4, 0.55, 2.45]} />
              <meshStandardMaterial color="#78350f" roughness={0.55} />
            </mesh>
            {/* Swept Bow & Stern Forecastles (tilted dramatically upward!) */}
            {[-1, 1].map((xDir) => (
              <group key={xDir} position={[xDir * 5.35, 1.15, 0]} rotation={[0, 0, xDir * 0.42]}>
                <mesh castShadow>
                  <boxGeometry args={[3.4, 1.55, 3.05]} />
                  <meshStandardMaterial color="#92400e" roughness={0.42} metalness={0.18} />
                </mesh>
                {/* Golden Figurehead Prow Tip sweeping outward & upward */}
                <mesh position={[xDir * 1.95, 0.42, 0]} rotation={[0, 0, -xDir * 1.15]}>
                  <coneGeometry args={[0.52, 1.45, 6]} />
                  <meshStandardMaterial color="#fbbf24" emissive="#d97706" emissiveIntensity={0.85} metalness={0.88} roughness={0.18} />
                </mesh>
                {/* Glowing Brass Stern/Bow Lantern (surges at apex!) */}
                <mesh position={[xDir * 1.4, 1.25, 0]} material={animMats.galleonLantern}>
                  <sphereGeometry args={[0.38, 10, 10]} />
                </mesh>
              </group>
            ))}

            {/* Gilded LED Gunwale Trim Strips along Port & Starboard Sides */}
            {[-1.69, 1.69].map((gz) => (
              <mesh key={gz} position={[0, 0.92, gz]} material={animMats.galleonLantern}>
                <boxGeometry args={[9.6, 0.16, 0.08]} />
              </mesh>
            ))}

            {/* 5 Rows of Crimson Passenger Bench Seats with Gold Safety Restraints */}
            {[-3.4, -1.7, 0, 1.7, 3.4].map((sx) => (
              <group key={sx} position={[sx, 1.32, 0]}>
                <mesh>
                  <boxGeometry args={[0.92, 0.52, 2.7]} />
                  <meshStandardMaterial color="#dc2626" roughness={0.4} />
                </mesh>
                <mesh position={[0, 0.34, 0]}>
                  <boxGeometry args={[0.14, 0.1, 2.6]} />
                  <meshStandardMaterial color="#fbbf24" metalness={0.88} roughness={0.18} />
                </mesh>
              </group>
            ))}

            {/* Central Stub Mast & Fluttering Crimson-Gold Ship Pennant */}
            <mesh position={[0, 3.45, 0]}>
              <cylinderGeometry args={[0.1, 0.15, 4.4, 8]} />
              <meshStandardMaterial color="#92400e" roughness={0.5} />
            </mesh>
            <mesh ref={galleonFlagRef} position={[0.95, 5.15, 0]} rotation={[0, 0, -Math.PI / 2]}>
              <coneGeometry args={[0.52, 1.85, 4]} />
              <meshStandardMaterial color="#e11d48" emissive="#be123c" emissiveIntensity={0.55} roughness={0.35} />
            </mesh>
          </group>
        </group>
      </group>

      {/* =================================================================== */}
      {/* RIDE BOARDING BEACON RINGS ON THE OCEAN PIER DECK                   */}
      {/* =================================================================== */}
      {AMUSEMENT_PARK_RIDES.map((ride, rIdx) => (
        <group key={ride.id} position={[ride.x, pierY + 0.08, ride.z]}>
          <mesh rotation={[-Math.PI / 2, 0, 0]}>
            <ringGeometry args={[3.2, 3.85, 32]} />
            <meshStandardMaterial
              color="#fde047"
              emissive="#f59e0b"
              emissiveIntensity={1.6}
              side={THREE.DoubleSide}
            />
          </mesh>
          <mesh
            ref={(el) => {
              beaconPulseRefs.current[rIdx] = el;
            }}
            position={[0, 0.02, 0]}
            rotation={[-Math.PI / 2, 0, 0]}
          >
            <ringGeometry args={[4.05, 4.35, 32]} />
            <meshStandardMaterial
              color="#38bdf8"
              emissive="#0284c7"
              emissiveIntensity={1.25}
              transparent
              opacity={0.62}
              side={THREE.DoubleSide}
              depthWrite={false}
            />
          </mesh>
        </group>
      ))}
    </group>
  );
}
