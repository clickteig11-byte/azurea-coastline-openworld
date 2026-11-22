import React, { useEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import { useFrame } from '@react-three/fiber';
import { GLTFLoader, GLTF } from 'three/examples/jsm/loaders/GLTFLoader.js';
import * as SkeletonUtils from 'three/examples/jsm/utils/SkeletonUtils.js';
import { animateHumanoid, createHumanoidRig, type HumanoidRig } from '../game/humanoid';
import { getTerrainHeight, getTravelHeight, getWaveHeight } from '../game/worldMath';
import { simState, COASTAL_CHARACTERS } from '../game/store';
import { pedestrianContact } from '../game/vehicleContact';
import { injureBot, injurePlayer } from '../game/combat';
import { launchTumble, stepTumble, type Tumble } from '../game/motion';
import { damageWorld, emitEnvironment, traceWorld } from '../game/worldDamage';
import { soundEngine } from '../game/soundEngine';
import { createShadowTexture } from './Textures';

// ============================================================================
// Pre-allocated scratch objects (zero per-frame GC allocations)
// ============================================================================
const _vecA = new THREE.Vector3();
const _vecB = new THREE.Vector3();
const _X_AXIS = new THREE.Vector3(1, 0, 0);
const _Y_AXIS = new THREE.Vector3(0, 1, 0);
const _Z_AXIS = new THREE.Vector3(0, 0, 1);
const _quatScratch = new THREE.Quaternion();

// ============================================================================
// Shared Glossy Automotive Clearcoat, Airliner, Vessel & Weapon Materials
// ============================================================================
const sharedCarClearcoatMat = new THREE.MeshStandardMaterial({
  vertexColors: true,
  roughness: 0.16,
  metalness: 0.42,
  envMapIntensity: 1.5,
});

const sharedAirlinerMat = new THREE.MeshStandardMaterial({
  vertexColors: true,
  roughness: 0.24,
  metalness: 0.34,
  envMapIntensity: 1.35,
});

const sharedVesselMat = new THREE.MeshStandardMaterial({
  vertexColors: true,
  roughness: 0.32,
  metalness: 0.22,
  envMapIntensity: 1.25,
});

const sharedWeaponMat = new THREE.MeshStandardMaterial({
  vertexColors: true,
  roughness: 0.32,
  metalness: 0.65,
});

// ============================================================================
// 24 Smooth-Shaded PBR Human Outfit Palettes (Streetwear, Blazer, Tactical, VIP)
// ============================================================================
interface HumanOutfitPalette {
  topColor: string;
  topRoughness: number;
  topMetalness: number;
  bottomColor: string;
  footwearColor: string;
  skinTint: string;
  headwearOn: boolean;
  headwearColor: string;
  beardOn: boolean;
  beardColor: string;
}

const TOP_PALETTE_HEX = [
  '#991b1b', '#0284c7', '#1e293b', '#f8fafc', '#f59e0b', '#10b981',
  '#7c3aed', '#f43f5e', '#0f172a', '#0ea5e9', '#d97706', '#047857',
  '#4f46e5', '#be123c', '#334155', '#e2e8f0', '#b45309', '#0369a1',
  '#6d28d9', '#15803d', '#dc2626', '#1d4ed8', '#475569', '#a21caf',
];

const BOTTOM_PALETTE_HEX = [
  '#0f172a', '#1e3a8a', '#334155', '#d6d3d1', '#78350f', '#18181b',
  '#1e293b', '#44403c', '#312e81', '#27272a', '#3f3f46', '#172554',
];

const FOOTWEAR_PALETTE_HEX = [
  '#f8fafc', '#ef4444', '#0f172a', '#f59e0b', '#38bdf8', '#a855f7',
  '#ffffff', '#dc2626', '#18181b', '#eab308', '#0284c7', '#e11d48',
];

const NATURAL_SKIN_TINTS = [
  '#ffffff', '#fae3d0', '#f5cfa8', '#e6b88a', '#d2996c', '#b57c50',
];

const HEADWEAR_PALETTE_HEX = [
  '#0f172a', '#991b1b', '#0284c7', '#f59e0b', '#f8fafc', '#1e293b', '#065f46', '#4c1d95',
];

const BEARD_PALETTE_HEX = [
  '#18181b', '#27272a', '#3f2305', '#44403c', '#09090b',
];

function getHumanPalette(seedIndex: number, isCombatBot = false): HumanOutfitPalette {
  const idx = Math.abs(seedIndex) % 24;
  return {
    topColor: isCombatBot
      ? ['#1e293b', '#991b1b', '#0f172a', '#047857', '#7c3aed', '#0369a1', '#b45309', '#be123c'][
          seedIndex % 8
        ]
      : TOP_PALETTE_HEX[idx],
    topRoughness: isCombatBot ? 0.34 : 0.26 + (idx % 4) * 0.1,
    topMetalness: isCombatBot ? 0.28 : 0.08 + (idx % 3) * 0.1,
    bottomColor: BOTTOM_PALETTE_HEX[(idx * 3) % BOTTOM_PALETTE_HEX.length],
    footwearColor: FOOTWEAR_PALETTE_HEX[(idx * 5) % FOOTWEAR_PALETTE_HEX.length],
    skinTint: NATURAL_SKIN_TINTS[idx % NATURAL_SKIN_TINTS.length],
    headwearOn: isCombatBot ? seedIndex % 2 === 0 : idx % 3 !== 1,
    headwearColor: HEADWEAR_PALETTE_HEX[idx % HEADWEAR_PALETTE_HEX.length],
    beardOn: idx % 2 === 0,
    beardColor: BEARD_PALETTE_HEX[idx % BEARD_PALETTE_HEX.length],
  };
}

// ============================================================================
// Animated pedestrian population
const PED_COUNT = 16;

const pedShadowGeo = new THREE.PlaneGeometry(0.9, 0.9);
pedShadowGeo.rotateX(-Math.PI / 2);

interface PedestrianAgent {
  kind: 'STRIP' | 'CROSSWALK' | 'BELLAGIO';
  modelUrl: string;
  paletteIndex: number;
  x: number;
  z: number;
  yaw: number;
  speed: number;
  phase: number;
  axisPos: number;
  minBound: number;
  maxBound: number;
  dir: 1 | -1;
  laneCoord: number;
  ringAngle: number;
  ringRadius: number;
  ringDir: 1 | -1;
  dodgeX: number;
  dodgeZ: number;
  dodgeAlert: number;
  resilience?: number;
  impact?: Tumble & { y: number; duration: number };
}

interface BotTactics {
  round: number;
  awareness: number;
  exposed: boolean;
  coverX: number;
  coverZ: number;
  direction: number;
  cooldown: number;
  burst: number;
  retreat: number;
  phase: number;
  tracer: number;
  from: THREE.Vector3;
  to: THREE.Vector3;
}

function positionFall(mount: THREE.Group, fall: Tumble, recovery = 1) {
  mount.rotation.set(fall.pitch * recovery, 0, fall.roll * recovery, 'YXZ');
  mount.position.y = (0.13 + Math.min(0.56, Math.abs(Math.sin(fall.pitch)) * 0.42)) * recovery;
}

function moveTumbling(
  actor: { x: number; z: number }, fall: Tumble, height: number, dt: number,
) {
  const speed = Math.hypot(fall.vx, fall.vz);
  let x = actor.x + fall.vx * dt;
  let z = actor.z + fall.vz * dt;
  if (speed > 0.15) {
    const obstacle = traceWorld(_vecA.set(actor.x, height + 0.56, actor.z),
      _vecB.set(fall.vx / speed, 0, fall.vz / speed), speed * dt, 0.18);
    if (obstacle && Math.abs(obstacle.normal.y) < 0.72) {
      x = actor.x;
      z = actor.z;
      fall.vx *= -0.33;
      fall.vz *= -0.33;
    }
  }
  actor.x = x;
  actor.z = z;
  const ground = getTravelHeight(x, z, height + 0.35);
  const result = stepTumble(fall, height, ground, dt);
  if (result.impulse > 1.8) {
    emitEnvironment('dust', _vecA.set(x, result.y + 0.13, z), Math.min(0.7, result.impulse * 0.1));
  }
  return result.y;
}

const civilianLooks = ['commuter', 'tourist', 'hotel_guest', 'high_roller', 'server', 'pool_guest', 'security'];
const combatLooks = ['rifleman', 'commander', 'medic', 'police'];

function selectHumanModelUrl(index: number) {
  if (index === 8) return COASTAL_CHARACTERS.COAST_NAVIGATOR.url;
  if (index === 12) return COASTAL_CHARACTERS.RESCUE_PILOT.url;
  return '/models/human_' + civilianLooks[index % civilianLooks.length] + '.glb';
}

function createPedestrians(): PedestrianAgent[] {
  const list: PedestrianAgent[] = [];

  // 10 Grand Central Avenue Sidewalk citizens (x = -20.5 and x = +20.5, z = -140..+140)
  for (let i = 0; i < 10; i++) {
    const isEast = i % 2 === 0;
    const sidewalkOffset = ((i % 3) - 1) * 0.28;
    const laneX = (isEast ? 20.5 : -20.5) + sidewalkOffset;
    const zStart = -126 + i * 28;
    const dir: 1 | -1 = i % 3 === 0 ? -1 : 1;
    list.push({
      kind: 'STRIP',
      modelUrl: selectHumanModelUrl(i),
      paletteIndex: i,
      x: laneX,
      z: zStart,
      yaw: dir > 0 ? 0 : Math.PI,
      speed: 1.5 + (i % 4) * 0.16,
      phase: i * 1.37,
      axisPos: zStart,
      minBound: -140,
      maxBound: 140,
      dir,
      laneCoord: laneX,
      ringAngle: 0,
      ringRadius: 0,
      ringDir: 1,
      dodgeX: 0,
      dodgeZ: 0,
      dodgeAlert: 0,
    });
  }

  // 6 Midtown Crosswalk citizens crossing at z = 0, z = -60, and z = +60 between x = -20.5 and x = +20.5
  const crosswalkZCoords = [0, 0, -60, -60, 60, 60];
  for (let i = 0; i < 6; i++) {
    const zCross = crosswalkZCoords[i] + (i % 2 === 0 ? -0.55 : 0.55);
    const dir: 1 | -1 = i % 2 === 0 ? 1 : -1;
    const xStart = i % 2 === 0 ? -18 + i * 4 : 18 - i * 4;
    const idx = 10 + i;
    list.push({
      kind: 'CROSSWALK',
      modelUrl: selectHumanModelUrl(idx),
      paletteIndex: idx,
      x: xStart,
      z: zCross,
      yaw: dir > 0 ? Math.PI / 2 : -Math.PI / 2,
      speed: 1.65 + (i % 2) * 0.2,
      phase: idx * 1.5,
      axisPos: xStart,
      minBound: -20.5,
      maxBound: 20.5,
      dir,
      laneCoord: zCross,
      ringAngle: 0,
      ringRadius: 0,
      ringDir: 1,
      dodgeX: 0,
      dodgeZ: 0,
      dodgeAlert: 0,
    });
  }

  return list;
}

// ============================================================================
// 4-Lane Grand Central Avenue AI Traffic Circuits (Lanes x = -11.5, -5.5, +5.5, +11.5)
// ============================================================================
interface CircuitSample {
  x: number;
  z: number;
  s: number;
}

interface BuiltCircuit {
  samples: CircuitSample[];
  totalLength: number;
}

function buildStripCircuit(laneOffset: number, _bypassBump = 0): BuiltCircuit {
  const rawPts: Array<{ x: number; z: number }> = [];
  const zSouth = 175;
  const zNorth = -185;

  // Northbound lane (+laneOffset) from z = +175 to z = -185
  for (let i = 0; i < 72; i++) {
    const t = i / 72;
    rawPts.push({ x: laneOffset, z: zSouth - t * (zSouth - zNorth) });
  }
  // Smooth North turnaround loop at z = -185
  for (let i = 0; i < 16; i++) {
    const ang = (i / 16) * Math.PI;
    rawPts.push({ x: Math.cos(ang) * laneOffset, z: zNorth - Math.sin(ang) * laneOffset });
  }
  // Southbound lane (-laneOffset) from z = -185 to z = +175
  for (let i = 0; i < 72; i++) {
    const t = i / 72;
    rawPts.push({ x: -laneOffset, z: zNorth + t * (zSouth - zNorth) });
  }
  // Smooth South turnaround loop at z = +175
  for (let i = 0; i < 16; i++) {
    const ang = Math.PI + (i / 16) * Math.PI;
    rawPts.push({ x: Math.cos(ang) * laneOffset, z: zSouth - Math.sin(ang) * laneOffset });
  }

  const samples: CircuitSample[] = [];
  let accum = 0;
  for (let i = 0; i < rawPts.length; i++) {
    const curr = rawPts[i];
    if (i > 0) {
      const prev = rawPts[i - 1];
      accum += Math.hypot(curr.x - prev.x, curr.z - prev.z);
    }
    samples.push({ x: curr.x, z: curr.z, s: accum });
  }
  const last = rawPts[rawPts.length - 1];
  const first = rawPts[0];
  const totalLength = accum + Math.hypot(first.x - last.x, first.z - last.z);

  return { samples, totalLength };
}

const INNER_CIRCUIT = buildStripCircuit(5.5, 0);
const OUTER_CIRCUIT = buildStripCircuit(11.5, 0);

function sampleCircuit(circuit: BuiltCircuit, sInput: number, outPos: THREE.Vector3): number {
  const { samples, totalLength } = circuit;
  let s = sInput % totalLength;
  if (s < 0) s += totalLength;

  let lo = 0;
  let hi = samples.length - 1;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (samples[mid].s <= s) lo = mid;
    else hi = mid - 1;
  }

  const a = samples[lo];
  const b = samples[(lo + 1) % samples.length];
  const segLen = lo === samples.length - 1 ? totalLength - a.s : b.s - a.s;
  const alpha = segLen > 1e-4 ? (s - a.s) / segLen : 0;

  outPos.x = a.x + (b.x - a.x) * alpha;
  outPos.z = a.z + (b.z - a.z) * alpha;
  return Math.atan2(b.x - a.x, b.z - a.z);
}

// ============================================================================
// 12 Real 3D GLB Traffic Vehicle Specs & 6 Parked Showcase VIP Specs
// ============================================================================
export interface GlbVehicleSpec {
  id: string;
  label: string;
  url: string;
  circuitKind: 'INNER' | 'OUTER';
  halfX: number;
  frontZ: number;
  rearZ: number;
  lightY: number;
  shadowWidth: number;
  shadowLength: number;
  baseSpeed: number;
  isPolice?: boolean;
  isTaxi?: boolean;
}

export const TRAFFIC_GLB_SPECS: GlbVehicleSpec[] = [
  {
    id: 'yellow_cab',
    label: 'Metro Yellow Taxi Cab',
    url: '/models/yellow_cab.glb',
    circuitKind: 'INNER',
    halfX: 0.96,
    frontZ: 2.31,
    rearZ: -2.30,
    lightY: 0.62,
    shadowWidth: 2.3,
    shadowLength: 5.0,
    baseSpeed: 15.2,
    isTaxi: true,
  },
  {
    id: 'police_cruiser',
    label: 'Metropolis Police Cruiser',
    url: '/models/police_cruiser.glb',
    circuitKind: 'INNER',
    halfX: 0.98,
    frontZ: 2.39,
    rearZ: -2.40,
    lightY: 0.64,
    shadowWidth: 2.35,
    shadowLength: 5.2,
    baseSpeed: 15.8,
    isPolice: true,
  },
  {
    id: 'town_car_inner',
    label: 'Executive City Sedan',
    url: '/models/town_car.glb',
    circuitKind: 'INNER',
    halfX: 0.99,
    frontZ: 2.49,
    rearZ: -2.49,
    lightY: 0.58,
    shadowWidth: 2.35,
    shadowLength: 5.35,
    baseSpeed: 15.0,
  },
  {
    id: 'gt3_car',
    label: 'Sports Coupe',
    url: '/models/gt3_car.glb',
    circuitKind: 'INNER',
    halfX: 1.10,
    frontZ: 2.34,
    rearZ: -2.35,
    lightY: 0.52,
    shadowWidth: 2.45,
    shadowLength: 5.1,
    baseSpeed: 16.0,
  },
  {
    id: 'wedge_coupe',
    label: 'Grand Touring Coupe',
    url: '/models/wedge_coupe.glb',
    circuitKind: 'INNER',
    halfX: 0.99,
    frontZ: 2.23,
    rearZ: -2.21,
    lightY: 0.48,
    shadowWidth: 2.35,
    shadowLength: 4.85,
    baseSpeed: 15.6,
  },
  {
    id: 'muscle_car',
    label: 'Classic Fastback Sedan',
    url: '/models/muscle_car.glb',
    circuitKind: 'INNER',
    halfX: 1.00,
    frontZ: 2.36,
    rearZ: -2.36,
    lightY: 0.56,
    shadowWidth: 2.35,
    shadowLength: 5.1,
    baseSpeed: 15.4,
  },
  {
    id: 'casino_convertible',
    label: 'City Roadster Convertible',
    url: '/models/casino_convertible.glb',
    circuitKind: 'OUTER',
    halfX: 0.97,
    frontZ: 2.21,
    rearZ: -2.21,
    lightY: 0.54,
    shadowWidth: 2.3,
    shadowLength: 4.85,
    baseSpeed: 14.8,
  },
  {
    id: 'convertible',
    label: 'Boulevard Convertible',
    url: '/models/convertible.glb',
    circuitKind: 'OUTER',
    halfX: 1.09,
    frontZ: 2.64,
    rearZ: -2.64,
    lightY: 0.58,
    shadowWidth: 2.45,
    shadowLength: 5.65,
    baseSpeed: 14.5,
  },
  {
    id: 'crossover_suv',
    label: 'Family Crossover SUV',
    url: '/models/crossover_suv.glb',
    circuitKind: 'OUTER',
    halfX: 1.17,
    frontZ: 2.28,
    rearZ: -2.28,
    lightY: 0.78,
    shadowWidth: 2.6,
    shadowLength: 5.0,
    baseSpeed: 14.4,
  },
  {
    id: 'town_car',
    label: 'Midtown Commuter Sedan',
    url: '/models/town_car.glb',
    circuitKind: 'OUTER',
    halfX: 0.99,
    frontZ: 2.49,
    rearZ: -2.49,
    lightY: 0.58,
    shadowWidth: 2.35,
    shadowLength: 5.35,
    baseSpeed: 14.6,
  },
  {
    id: 'pickup_truck',
    label: 'Utility Pickup Truck',
    url: '/models/pickup_truck.glb',
    circuitKind: 'OUTER',
    halfX: 1.00,
    frontZ: 2.79,
    rearZ: -2.79,
    lightY: 0.76,
    shadowWidth: 2.4,
    shadowLength: 5.95,
    baseSpeed: 14.2,
  },
  {
    id: 'hatchback',
    label: 'Compact City Hatchback',
    url: '/models/hatchback.glb',
    circuitKind: 'OUTER',
    halfX: 0.99,
    frontZ: 1.99,
    rearZ: -1.99,
    lightY: 0.58,
    shadowWidth: 2.3,
    shadowLength: 4.4,
    baseSpeed: 14.9,
  },
];

interface ParkedShowcaseSpec {
  id: string;
  url: string;
  x: number;
  z: number;
  yaw: number;
  frontZ: number;
  rearZ: number;
  lightY: number;
  shadowWidth: number;
  shadowLength: number;
  isPolice?: boolean;
}

const PARKED_SHOWCASE_SPECS: ParkedShowcaseSpec[] = [
  {
    id: 'parked-gt3',
    url: '/models/gt3_car.glb',
    x: -25.8,
    z: -42,
    yaw: 0.08,
    frontZ: 2.34,
    rearZ: -2.35,
    lightY: 0.52,
    shadowWidth: 2.45,
    shadowLength: 5.1,
  },
  {
    id: 'parked-casino-conv',
    url: '/models/town_car.glb',
    x: -25.8,
    z: -19,
    yaw: 0.03,
    frontZ: 2.49,
    rearZ: -2.49,
    lightY: 0.58,
    shadowWidth: 2.35,
    shadowLength: 5.35,
  },
  {
    id: 'parked-wedge',
    url: '/models/crossover_suv.glb',
    x: -25.8,
    z: 22,
    yaw: -0.06,
    frontZ: 2.28,
    rearZ: -2.28,
    lightY: 0.78,
    shadowWidth: 2.6,
    shadowLength: 5.0,
  },
  {
    id: 'parked-limo',
    url: '/models/yellow_cab.glb',
    x: 25.8,
    z: -42,
    yaw: Math.PI - 0.05,
    frontZ: 2.31,
    rearZ: -2.30,
    lightY: 0.62,
    shadowWidth: 2.3,
    shadowLength: 5.0,
  },
  {
    id: 'parked-muscle',
    url: '/models/pickup_truck.glb',
    x: 25.8,
    z: -19,
    yaw: Math.PI + 0.04,
    frontZ: 2.79,
    rearZ: -2.79,
    lightY: 0.76,
    shadowWidth: 2.4,
    shadowLength: 5.95,
  },
  {
    id: 'parked-police',
    url: '/models/police_cruiser.glb',
    x: 25.8,
    z: 22,
    yaw: Math.PI + 0.08,
    frontZ: 2.39,
    rearZ: -2.40,
    lightY: 0.64,
    shadowWidth: 2.35,
    shadowLength: 5.2,
    isPolice: true,
  },
];

interface TrafficVehicleState {
  spec: GlbVehicleSpec;
  circuit: BuiltCircuit;
  laneSlotIndex: number;
  laneTotalCount: number;
  s: number;
  baseSpeed: number;
  currentSpeed: number;
  wheelAngle: number;
  steerAngle: number;
  isBraking: boolean;
}

const unitShadowGeo = new THREE.PlaneGeometry(1, 1);
unitShadowGeo.rotateX(-Math.PI / 2);

const headlightGeo = new THREE.BoxGeometry(0.32, 0.13, 0.08);
const taillightGeo = new THREE.BoxGeometry(0.38, 0.13, 0.08);
const policeBarBaseGeo = new THREE.BoxGeometry(1.06, 0.08, 0.24);
const policeStrobeGeo = new THREE.BoxGeometry(0.46, 0.11, 0.22);

const headlightMat = new THREE.MeshStandardMaterial({
  color: '#fef9c3',
  emissive: '#fef08a',
  emissiveIntensity: 1.9,
});

const parkedTaillightMat = new THREE.MeshStandardMaterial({
  color: '#ef4444',
  emissive: '#dc2626',
  emissiveIntensity: 1.4,
});

const policeBarBaseMat = new THREE.MeshStandardMaterial({
  color: '#0f172a',
  metalness: 0.8,
  roughness: 0.2,
});

// ============================================================================
// Battle Royale Combat Bot Shared Geometries & Materials
// ============================================================================
const botBarBackingGeo = new THREE.BoxGeometry(0.96, 0.22, 0.025);
const botBarFillGeo = new THREE.BoxGeometry(0.88, 0.068, 0.032);
const botHitFlashRingGeo = new THREE.RingGeometry(0.48, 0.66, 20);
botHitFlashRingGeo.rotateX(-Math.PI / 2);

const botBarBackingMat = new THREE.MeshBasicMaterial({
  color: '#090d16',
  transparent: true,
  opacity: 0.85,
});

const botHpFillMat = new THREE.MeshBasicMaterial({
  color: '#22c55e',
});

const botShieldFillMat = new THREE.MeshBasicMaterial({
  color: '#38bdf8',
});

const botHitFlashMat = new THREE.MeshBasicMaterial({
  color: '#ef4444',
  side: THREE.DoubleSide,
  transparent: true,
  opacity: 0.9,
});

const muzzleFlashCoreGeo = new THREE.SphereGeometry(0.14, 8, 8);
const muzzleTracerGeo = new THREE.BoxGeometry(0.045, 0.045, 3.6);
const muzzleFlashMat = new THREE.MeshBasicMaterial({
  color: '#fef08a',
});
const muzzleTracerMat = new THREE.MeshBasicMaterial({
  color: '#fb923c',
  transparent: true,
  opacity: 0.85,
});

const parachuteCenterGeo = new THREE.BoxGeometry(1.75, 0.14, 1.15);
const parachuteWingGeo = new THREE.BoxGeometry(0.95, 0.12, 1.1);
const parachuteCordGeo = new THREE.CylinderGeometry(0.012, 0.012, 1.65, 5);
const parachuteCanopyMat = new THREE.MeshStandardMaterial({
  color: '#f97316',
  roughness: 0.5,
  metalness: 0.1,
});
const parachuteTrimMat = new THREE.MeshStandardMaterial({
  color: '#1e293b',
  roughness: 0.6,
  metalness: 0.2,
});
const parachuteCordMat = new THREE.MeshBasicMaterial({
  color: '#cbd5e1',
});

// ============================================================================
// Venetian Gondolas, 3 Offshore Coastal Vessels & 4 Diverse Overhead Aircraft
// ============================================================================
interface GondolaAgent {
  x: number;
  zBase: number;
  dir: 1 | -1;
  speed: number;
  phase: number;
  canopyColor: string;
}

const GONDOLAS: GondolaAgent[] = [
  { x: 96, zBase: -98.5, dir: 1, speed: 3.1, phase: 0.2, canopyColor: '#991b1b' },
  { x: 158, zBase: -95.0, dir: -1, speed: 2.7, phase: 1.7, canopyColor: '#1e3a8a' },
  { x: 204, zBase: -91.5, dir: 1, speed: 3.3, phase: 3.1, canopyColor: '#065f46' },
];

interface OffshoreVesselAgent {
  id: string;
  url: string;
  scale: number;
  centerX: number;
  centerZ: number;
  radiusX: number;
  radiusZ: number;
  angularSpeed: number;
  angle: number;
  dir: 1 | -1;
  draftOffset: number;
}

// 3 AI Offshore Maritime Vessels sailing along the Azurea deep-water coast
const OFFSHORE_VESSELS: OffshoreVesselAgent[] = [
  {
    id: 'offshore-galleon',
    url: '/models/galleon_ship.glb',
    scale: 0.55,
    centerX: 0,
    centerZ: -10,
    radiusX: 298,
    radiusZ: 290,
    angularSpeed: 0.028,
    angle: 0.35,
    dir: 1,
    draftOffset: -0.25,
  },
  {
    id: 'offshore-sloop',
    url: '/models/sloop_yacht.glb',
    scale: 1.1,
    centerX: 12,
    centerZ: -18,
    radiusX: 288,
    radiusZ: 282,
    angularSpeed: 0.042,
    angle: 2.25,
    dir: -1,
    draftOffset: -0.18,
  },
  {
    id: 'offshore-caique',
    url: '/models/caique_boat.glb',
    scale: 1.2,
    centerX: -8,
    centerZ: 8,
    radiusX: 292,
    radiusZ: 286,
    angularSpeed: 0.036,
    angle: 4.35,
    dir: 1,
    draftOffset: -0.12,
  },
];

interface AircraftAgent {
  id: string;
  url: string;
  scale: number;
  centerX: number;
  centerZ: number;
  radiusX: number;
  radiusZ: number;
  altitude: number;
  angularSpeed: number;
  angle: number;
  dir: 1 | -1;
  wingSpanHalf: number;
  isHelicopter?: boolean;
  hasProps?: boolean;
}

// 4 Diverse Overhead AI Aircraft (Widebody Airliner, Narrow Airliner, Turboprop & Low-Altitude Patrol Helicopter)
const AIRCRAFT_AGENTS: AircraftAgent[] = [
  {
    id: 'ai-widebody-airliner',
    url: '/models/airliner.glb',
    scale: 0.42,
    centerX: 0,
    centerZ: -20,
    radiusX: 215,
    radiusZ: 205,
    altitude: 92,
    angularSpeed: 0.082,
    angle: 0.4,
    dir: 1,
    wingSpanHalf: 12.5,
  },
  {
    id: 'ai-narrow-airliner',
    url: '/models/narrow_airliner.glb',
    scale: 0.48,
    centerX: 15,
    centerZ: -35,
    radiusX: 255,
    radiusZ: 245,
    altitude: 106,
    angularSpeed: 0.068,
    angle: 3.5,
    dir: -1,
    wingSpanHalf: 9.2,
  },
  {
    id: 'ai-regional-turboprop',
    url: '/models/turboprop.glb',
    scale: 0.56,
    centerX: -25,
    centerZ: 15,
    radiusX: 175,
    radiusZ: 165,
    altitude: 68,
    angularSpeed: 0.105,
    angle: 1.9,
    dir: 1,
    wingSpanHalf: 7.4,
    hasProps: true,
  },
  {
    id: 'ai-strip-helicopter',
    url: '/models/helicopter.glb',
    scale: 0.92,
    centerX: 0,
    centerZ: -12,
    radiusX: 54,
    radiusZ: 92,
    altitude: 44,
    angularSpeed: 0.165,
    angle: 5.1,
    dir: -1,
    wingSpanHalf: 2.2,
    isHelicopter: true,
  },
];

interface AircraftRotorRefs {
  rotorMain: THREE.Object3D | null;
  rotorTail: THREE.Object3D | null;
  propL: THREE.Object3D | null;
  propR: THREE.Object3D | null;
}

// ============================================================================
// Main Component
// ============================================================================
export function LivingWorldNPCs() {
  const shadowTex = useMemo(() => createShadowTexture(), []);

  const contactShadowMat = useMemo(
    () =>
      new THREE.MeshBasicMaterial({
        map: shadowTex,
        transparent: true,
        opacity: 0.72,
        depthWrite: false,
      }),
    [shadowTex]
  );

  const pedShadowMat = useMemo(
    () =>
      new THREE.MeshBasicMaterial({
        map: shadowTex,
        transparent: true,
        opacity: 0.58,
        depthWrite: false,
      }),
    [shadowTex]
  );

  // 16 Smooth-Shaded PBR Human Citizen Refs & Skeletal Stride Rigs
  const citizenGroupRefs = useRef<Array<THREE.Group | null>>([]);
  const citizenModelMountRefs = useRef<Array<THREE.Group | null>>([]);
  const citizenStrideRigs = useRef<Array<HumanoidRig | null>>(
    Array.from({ length: PED_COUNT }, () => null)
  );

  // 8 Armed Battle Royale Combat Bot Refs & Skeletal Stride Rigs
  const botGroupRefs = useRef<Array<THREE.Group | null>>([]);
  const botModelMountRefs = useRef<Array<THREE.Group | null>>([]);
  const botGunMountRefs = useRef<Array<THREE.Group | null>>([]);
  const botParachuteRefs = useRef<Array<THREE.Group | null>>([]);
  const botHudBillboardRefs = useRef<Array<THREE.Group | null>>([]);
  const botHpBarRefs = useRef<Array<THREE.Mesh | null>>([]);
  const botShieldBarRefs = useRef<Array<THREE.Mesh | null>>([]);
  const botTracers = useRef<(THREE.Mesh | null)[]>([]);
  const botDrops = useRef<(THREE.Group | null)[]>([]);
  const tactic = useMemo<BotTactics[]>(() => simState.botTargets.map((_, i) => ({
    round: -1, awareness: 0, exposed: false, coverX: 0, coverZ: 0, direction: i % 2 ? 1 : -1,
    cooldown: 0, burst: 0, retreat: i % 3 === 1 ? 39 : 26, phase: i, tracer: 0,
    from: new THREE.Vector3(), to: new THREE.Vector3(),
  })), []);
  const botMuzzleFlashRefs = useRef<Array<THREE.Group | null>>([]);
  const botStrideRigs = useRef<Array<HumanoidRig | null>>(
    simState.botTargets.map(() => null)
  );

  // Traffic, Parked Showcase, Gondola, Offshore Vessels & 4 Aircraft group refs
  const carRefs = useRef<Array<THREE.Group | null>>([]);
  const carModelMountRefs = useRef<Array<THREE.Group | null>>([]);
  const carWheelRefs = useRef<Array<Array<THREE.Object3D | null>>>(
    TRAFFIC_GLB_SPECS.map(() => [null, null, null, null])
  );
  const carSteerRefs = useRef<Array<Array<THREE.Object3D | null>>>(
    TRAFFIC_GLB_SPECS.map(() => [null, null])
  );

  const parkedModelMountRefs = useRef<Array<THREE.Group | null>>([]);
  const policeRedLightRefs = useRef<Array<THREE.Mesh | null>>([]);
  const policeBlueLightRefs = useRef<Array<THREE.Mesh | null>>([]);

  const gondolaRefs = useRef<Array<THREE.Group | null>>([]);
  const offshoreVesselRefs = useRef<Array<THREE.Group | null>>([]);
  const offshoreVesselMountRefs = useRef<Array<THREE.Group | null>>([]);

  const aircraftRefs = useRef<Array<THREE.Group | null>>([]);
  const aircraftModelMountRefs = useRef<Array<THREE.Group | null>>([]);
  const aircraftRotorRefs = useRef<Array<AircraftRotorRefs>>(
    AIRCRAFT_AGENTS.map(() => ({
      rotorMain: null,
      rotorTail: null,
      propL: null,
      propR: null,
    }))
  );

  // Mutable simulation arrays (zero React re-renders per frame)
  const pedestrians = useMemo(() => createPedestrians(), []);

  const vehicles = useMemo<TrafficVehicleState[]>(() => {
    let innerIdx = 0;
    let outerIdx = 0;
    const innerCount = TRAFFIC_GLB_SPECS.filter((s) => s.circuitKind === 'INNER').length;
    const outerCount = TRAFFIC_GLB_SPECS.filter((s) => s.circuitKind === 'OUTER').length;

    return TRAFFIC_GLB_SPECS.map((spec) => {
      const isInner = spec.circuitKind === 'INNER';
      const circuit = isInner ? INNER_CIRCUIT : OUTER_CIRCUIT;
      const slotIdx = isInner ? innerIdx++ : outerIdx++;
      const totalInLane = isInner ? innerCount : outerCount;
      const phaseOffset = isInner ? 55 : 95;
      const s =
        ((slotIdx / totalInLane) * circuit.totalLength + phaseOffset) % circuit.totalLength;

      return {
        spec,
        circuit,
        laneSlotIndex: slotIdx,
        laneTotalCount: totalInLane,
        s,
        baseSpeed: spec.baseSpeed,
        currentSpeed: spec.baseSpeed,
        wheelAngle: 0,
        steerAngle: 0,
        isBraking: false,
      };
    });
  }, []);

  const gondolas = useMemo(() => GONDOLAS.map((g) => ({ ...g })), []);
  const offshoreVessels = useMemo(() => OFFSHORE_VESSELS.map((v) => ({ ...v })), []);
  const aircraftList = useMemo(() => AIRCRAFT_AGENTS.map((a) => ({ ...a })), []);

  // Per-vehicle dynamic brake-light materials
  const taillightMaterials = useMemo(
    () =>
      TRAFFIC_GLB_SPECS.map(
        () =>
          new THREE.MeshStandardMaterial({
            color: '#ef4444',
            emissive: '#dc2626',
            emissiveIntensity: 1.3,
          })
      ),
    []
  );

  // Police strobe materials (shared animated emissive for red/blue alternating flash)
  const policeRedMat = useMemo(
    () =>
      new THREE.MeshStandardMaterial({
        color: '#ef4444',
        emissive: '#ef4444',
        emissiveIntensity: 3.2,
      }),
    []
  );
  const policeBlueMat = useMemo(
    () =>
      new THREE.MeshStandardMaterial({
        color: '#3b82f6',
        emissive: '#3b82f6',
        emissiveIntensity: 0.4,
      }),
    []
  );

  // Load Smooth-Shaded PBR Humans, 3D Weapons, 12 Traffic Vehicles, 4 Aircraft & 3 Offshore Vessels
  useEffect(() => {
    let disposed = false;
    const loader = new GLTFLoader();
    const vehicleTemplateCache = new Map<string, Promise<THREE.Group>>();
    const gltfAssetCache = new Map<string, Promise<GLTF>>();

    const loadCachedGLTF = (url: string): Promise<GLTF> => {
      const existing = gltfAssetCache.get(url);
      if (existing) return existing;
      const promise = new Promise<GLTF>((resolve, reject) => {
        loader.load(
          url,
          (gltf) => resolve(gltf),
          undefined,
          (err) => reject(err)
        );
      });
      gltfAssetCache.set(url, promise);
      return promise;
    };

    const loadNormalizedVehicleTemplate = (
      url: string,
      material: THREE.Material,
      scale = 1.0
    ): Promise<THREE.Group> => {
      const cacheKey = `${url}::${scale}`;
      const existing = vehicleTemplateCache.get(cacheKey);
      if (existing) return existing;

      const promise = new Promise<THREE.Group>((resolve, reject) => {
        loader.load(
          url,
          (gltf) => {
            const scene = gltf.scene.clone(true);
            scene.scale.setScalar(scale);
            scene.updateMatrixWorld(true);

            // Auto-grounding: flush lowest point at y = 0.0
            const box = new THREE.Box3().setFromObject(scene);
            if (Number.isFinite(box.min.y)) {
              scene.position.y = -box.min.y;
            }

            scene.traverse((child) => {
              if ((child as THREE.Mesh).isMesh) {
                const mesh = child as THREE.Mesh;
                mesh.material = material;
                mesh.castShadow = false;
                mesh.receiveShadow = false;
              }
            });

            const wrapper = new THREE.Group();
            wrapper.add(scene);
            resolve(wrapper);
          },
          undefined,
          (err) => reject(err)
        );
      });

      vehicleTemplateCache.set(cacheKey, promise);
      return promise;
    };

    /**
     * Clones a smooth-shaded high-res PBR human (`/models/readyplayer_me.glb` or `/models/michelle.glb`),
     * preserving all original PBR normal/roughness/albedo textures while tinting each sub-mesh with
     * a unique outfit & skin palette and capturing rest-pose quaternions for smooth stride animation.
     */
    const prepareHuman = (gltf: Awaited<ReturnType<typeof loadCachedGLTF>>, palette: HumanOutfitPalette, height: number) => {
      const clone = SkeletonUtils.clone(gltf.scene);
      clone.traverse((child) => {
        const mesh = child as THREE.Mesh;
        if (!mesh.isMesh) return;
        mesh.frustumCulled = true;
        const original = Array.isArray(mesh.material) ? mesh.material[0] : mesh.material;
        if (!(original as THREE.MeshStandardMaterial).isMeshStandardMaterial) return;
        const mat = (original as THREE.MeshStandardMaterial).clone();
        if (/top|coat/.test(mesh.name)) {
          mat.color.lerp(new THREE.Color(palette.topColor), 0.24);
          mat.roughness = Math.max(0.52, palette.topRoughness);
        } else if (/bottom/.test(mesh.name)) {
          mat.color.lerp(new THREE.Color(palette.bottomColor), 0.18);
          mat.roughness = 0.72;
        } else if (/feet/.test(mesh.name)) {
          mat.color.lerp(new THREE.Color(palette.footwearColor), 0.2);
          mat.roughness = 0.56;
        }
        mesh.material = mat;
      });
      clone.updateWorldMatrix(true, true);
      const bounds = new THREE.Box3().setFromObject(clone);
      const scale = height / Math.max(0.2, bounds.max.y - bounds.min.y);
      clone.scale.multiplyScalar(scale);
      clone.position.y -= bounds.min.y * scale;
      const wrapper = new THREE.Group();
      wrapper.add(clone);
      const rig = createHumanoidRig(wrapper, clone, gltf.animations);
      return { wrapper, rig };
    };

    // 1. Populate 16 Smooth-Shaded High-Res PBR Citizens (~70% ReadyPlayerMe, ~30% Michelle)
    pedestrians.forEach((ped, idx) => {
      loadCachedGLTF(ped.modelUrl)
        .then((gltf) => {
          if (disposed) return;
          const mount = citizenModelMountRefs.current[idx];
          if (!mount) return;
          while (mount.children.length > 0) {
            mount.remove(mount.children[0]);
          }
          const palette = getHumanPalette(ped.paletteIndex, false);
          const { wrapper, rig } = prepareHuman(gltf, palette, 1.61 + (idx * 37 % 23) * 0.01);
          mount.add(wrapper);
          citizenStrideRigs.current[idx] = rig;
        })
        .catch(() => {});
    });

    // 2. Populate 8 Armed Battle Royale Combat Bots on Open Sidewalks/Plazas with Smooth PBR Humans + 3D GLB Weapons
    const safeBotHomes: Array<{ homeX: number; homeZ: number }> = [
      { homeX: -21.2, homeZ: 24 },
      { homeX: 21.2, homeZ: 24 },
      { homeX: -21.2, homeZ: -38 },
      { homeX: 21.2, homeZ: -38 },
      { homeX: -21.2, homeZ: 52 },
      { homeX: 21.2, homeZ: 52 },
      { homeX: -21.2, homeZ: -96 },
      { homeX: 21.2, homeZ: -96 },
    ];
    simState.botTargets.forEach((bot, idx) => {
      const safeHome = safeBotHomes[idx % safeBotHomes.length];
      bot.homeX = safeHome.homeX;
      bot.homeZ = safeHome.homeZ;
      if (!bot.parachuting) {
        bot.x = safeHome.homeX;
        bot.z = safeHome.homeZ;
        bot.y = getTerrainHeight(bot.x, bot.z);
      }

      const botHumanUrl = '/models/human_' + combatLooks[idx % combatLooks.length] + '.glb';

      loadCachedGLTF(botHumanUrl)
        .then((gltf) => {
          if (disposed) return;
          const mount = botModelMountRefs.current[idx];
          if (!mount) return;
          while (mount.children.length > 0) {
            mount.remove(mount.children[0]);
          }
          const palette = getHumanPalette(16 + idx, true);
          const { wrapper, rig } = prepareHuman(gltf, palette, 1.7 + (idx * 11 % 18) * 0.01);
          mount.add(wrapper);
          botStrideRigs.current[idx] = rig;

          // Load & mount the bot's 3D GLB Weapon (gun_ar, gun_shotgun, gun_sniper, gun_minigun, gun_rpg)
          loadCachedGLTF(bot.gunUrl)
            .then((gunGltf) => {
              if (disposed) return;
              const gunClone = gunGltf.scene.clone(true);
              gunClone.traverse((c) => {
                if ((c as THREE.Mesh).isMesh) {
                  const m = c as THREE.Mesh;
                  m.material = sharedWeaponMat;
                  m.castShadow = false;
                  m.receiveShadow = false;
                }
              });
              gunClone.rotation.set(0, Math.PI, 0);
              gunClone.scale.setScalar(1.15);

              const gunMount = botGunMountRefs.current[idx];
              if (gunMount) {
                while (gunMount.children.length > 0) {
                  gunMount.remove(gunMount.children[0]);
                }
                gunMount.add(gunClone);
              }
            })
            .catch(() => {});
        })
        .catch(() => {});
    });

    // 3. Populate all 12 Active AI Traffic Vehicles
    TRAFFIC_GLB_SPECS.forEach((spec, idx) => {
      loadNormalizedVehicleTemplate(spec.url, sharedCarClearcoatMat, 1.0)
        .then((template) => {
          if (disposed) return;
          const mount = carModelMountRefs.current[idx];
          if (!mount) return;

          while (mount.children.length > 0) {
            mount.remove(mount.children[0]);
          }

          const clone = template.clone(true);
          mount.add(clone);

          const wheelNames = ['wheel-fl', 'wheel-fr', 'wheel-rl', 'wheel-rr'];
          carWheelRefs.current[idx] = wheelNames.map(
            (name) => clone.getObjectByName(name) || null
          );
          const steerNames = ['steer-fl', 'steer-fr'];
          carSteerRefs.current[idx] = steerNames.map(
            (name) => clone.getObjectByName(name) || null
          );
        })
        .catch(() => {});
    });

    // 4. Populate all 6 Parked Exotic/VIP Showcase Vehicles along Bellagio & Sphere Valet Bays
    PARKED_SHOWCASE_SPECS.forEach((parkedSpec, idx) => {
      loadNormalizedVehicleTemplate(parkedSpec.url, sharedCarClearcoatMat, 1.0)
        .then((template) => {
          if (disposed) return;
          const mount = parkedModelMountRefs.current[idx];
          if (!mount) return;

          while (mount.children.length > 0) {
            mount.remove(mount.children[0]);
          }

          const clone = template.clone(true);
          mount.add(clone);
        })
        .catch(() => {});
    });

    // 5. Populate 4 Diverse Overhead AI Aircraft (airliner, narrow_airliner, turboprop, helicopter)
    AIRCRAFT_AGENTS.forEach((spec, idx) => {
      loadNormalizedVehicleTemplate(spec.url, sharedAirlinerMat, spec.scale)
        .then((template) => {
          if (disposed) return;
          const mount = aircraftModelMountRefs.current[idx];
          if (!mount) return;
          while (mount.children.length > 0) {
            mount.remove(mount.children[0]);
          }
          const clone = template.clone(true);
          mount.add(clone);

          aircraftRotorRefs.current[idx] = {
            rotorMain: clone.getObjectByName('rotor-main') || null,
            rotorTail: clone.getObjectByName('rotor-tail') || null,
            propL: clone.getObjectByName('prop-l') || null,
            propR: clone.getObjectByName('prop-r') || null,
          };
        })
        .catch(() => {});
    });

    // 6. Populate 3 AI Offshore Maritime Vessels (galleon_ship, sloop_yacht, caique_boat)
    OFFSHORE_VESSELS.forEach((vesselSpec, idx) => {
      loadNormalizedVehicleTemplate(vesselSpec.url, sharedVesselMat, vesselSpec.scale)
        .then((template) => {
          if (disposed) return;
          const mount = offshoreVesselMountRefs.current[idx];
          if (!mount) return;
          while (mount.children.length > 0) {
            mount.remove(mount.children[0]);
          }
          const clone = template.clone(true);
          mount.add(clone);
        })
        .catch(() => {});
    });

    return () => {
      disposed = true;
    };
  }, [pedestrians]);

  useFrame((state, rawDelta) => {
    const dt = Math.min(rawDelta, 0.05);
    const elapsed = state.clock.elapsedTime;

    // Alternating Police Cruiser Red/Blue Strobe Flash
    const strobePhase = Math.sin(elapsed * 16.0) > 0;
    policeRedMat.emissiveIntensity = strobePhase ? 4.2 : 0.35;
    policeBlueMat.emissiveIntensity = strobePhase ? 0.35 : 4.2;

    const threatX = simState.mode === 'CAR' ? simState.carPos.x : simState.playerPos.x;
    const threatZ = simState.mode === 'CAR' ? simState.carPos.z : simState.playerPos.z;
    const camPos = state.camera.position;

    const sweep = simState.carSweep;
    const canStrike = simState.mode === 'CAR' && !simState.startMenuOpen && (!simState.brActive || simState.brResult !== 'OUT');
    const applyBump = (severity: number) => {
      simState.carSpeed *= 0.95 - 0.16 * severity;
      simState.cameraShake = Math.max(simState.cameraShake, 0.10 + severity * 0.24);
      soundEngine.playSurface('landing', 0.24 + severity * 0.44);
    };

    // ------------------------------------------------------------------------
    // 1. Update 16 Smooth-Shaded PBR Human Citizens (Skeletal Stride + Sidewalks/Crosswalks/Dodge)
    // ------------------------------------------------------------------------
    for (let i = 0; i < PED_COUNT; i++) {
      const p = pedestrians[i];
      const crossingClosed = (simState.startMenuOpen || simState.gameMode === 'GRAND_PRIX') && p.kind === 'CROSSWALK';
      if (citizenGroupRefs.current[i]) citizenGroupRefs.current[i]!.visible = !crossingClosed;
      if (crossingClosed) continue;
      const model = citizenModelMountRefs.current[i];
      const group = citizenGroupRefs.current[i];
      const contact = canStrike && !p.impact &&
        pedestrianContact(sweep, p.x, getTerrainHeight(p.x, p.z), p.z);
      if (contact) {
        const remaining = Math.max(0, (p.resilience ?? 100) - contact.damage);
        p.resilience = remaining;
        p.impact = {
          ...launchTumble(contact.travelX, contact.travelZ, contact.severity, contact.side),
          y: getTravelHeight(p.x, p.z), duration: remaining === 0 ? 7.5 : 2 + contact.severity * 2,
        };
        p.yaw = Math.atan2(contact.travelX, contact.travelZ);
        applyBump(contact.severity);
      }
      if (p.impact) {
        const fall = p.impact;
        fall.y = moveTumbling(p, fall, fall.y, dt);
        const recover = p.resilience === 0 ? 1 : 1 - THREE.MathUtils.smoothstep(fall.elapsed, fall.duration - 0.76, fall.duration);
        if (group) {
          group.position.set(p.x, fall.y, p.z);
          group.rotation.y = p.yaw;
          group.scale.setScalar(p.resilience === 0 ? 1 - THREE.MathUtils.smoothstep(fall.elapsed, 6.1, fall.duration) : 1);
        }
        if (model) positionFall(model, fall, recover);
        const rig = citizenStrideRigs.current[i];
        if (rig) animateHumanoid(rig, { dt, time: elapsed, phase: p.phase, speed: 0,
          airborne: fall.grounded ? undefined : 'jump', fallSpeed: fall.vy, landing: recover * (fall.grounded ? 0.87 : 0.39) });
        if (fall.elapsed >= fall.duration && Math.hypot(threatX - p.x, threatZ - p.z) > 3.5) {
          p.resilience = 100;
          p.impact = undefined;
          group?.scale.setScalar(1);
          if (model) {
            model.position.y = 0;
            model.rotation.set(0, 0, 0);
          }
        }
        continue;
      }
      const speedBoost = 1 + p.dodgeAlert * 0.85;
      p.phase += dt * p.speed * speedBoost * 4.4;

      let baseX = p.x;
      let baseZ = p.z;

      if (p.kind === 'STRIP') {
        p.axisPos += p.dir * p.speed * speedBoost * dt;
        if (p.axisPos >= p.maxBound) {
          p.axisPos = p.maxBound;
          p.dir = -1;
        } else if (p.axisPos <= p.minBound) {
          p.axisPos = p.minBound;
          p.dir = 1;
        }
        baseX = p.laneCoord;
        baseZ = p.axisPos;
        p.yaw = p.dir > 0 ? 0 : Math.PI;
      } else if (p.kind === 'CROSSWALK') {
        p.axisPos += p.dir * p.speed * speedBoost * dt;
        if (p.axisPos >= p.maxBound) {
          p.axisPos = p.maxBound;
          p.dir = -1;
        } else if (p.axisPos <= p.minBound) {
          p.axisPos = p.minBound;
          p.dir = 1;
        }
        baseX = p.axisPos;
        baseZ = p.laneCoord;
        p.yaw = p.dir > 0 ? Math.PI / 2 : -Math.PI / 2;
      } else {
        // BELLAGIO ring
        const angularVel = (p.speed / p.ringRadius) * p.ringDir;
        p.ringAngle += angularVel * dt;
        baseX = Math.cos(p.ringAngle) * p.ringRadius;
        baseZ = -10 + Math.sin(p.ringAngle) * p.ringRadius;
        const tx = -Math.sin(p.ringAngle) * p.ringDir;
        const tz = Math.cos(p.ringAngle) * p.ringDir;
        p.yaw = Math.atan2(tx, tz);
      }

      // Reactive dodge/sidestep when player's car or player approaches within 8.5m
      const dxThreat = baseX + p.dodgeX - threatX;
      const dzThreat = baseZ + p.dodgeZ - threatZ;
      const distSq = dxThreat * dxThreat + dzThreat * dzThreat;
      if (distSq < 8.5 * 8.5 && distSq > 1e-4) {
        const dist = Math.sqrt(distSq);
        const urgency = (8.5 - dist) / 8.5;
        const nx = dxThreat / dist;
        const nz = dzThreat / dist;
        p.dodgeX += nx * urgency * 7.5 * dt;
        p.dodgeZ += nz * urgency * 7.5 * dt;
        const dodgeMag = Math.hypot(p.dodgeX, p.dodgeZ);
        if (dodgeMag > 2.8) {
          p.dodgeX = (p.dodgeX / dodgeMag) * 2.8;
          p.dodgeZ = (p.dodgeZ / dodgeMag) * 2.8;
        }
        p.dodgeAlert = Math.min(1, p.dodgeAlert + dt * 5.0);
        p.yaw = Math.atan2(nx, nz);
      } else {
        const decay = Math.max(0, 1 - dt * 2.6);
        p.dodgeX *= decay;
        p.dodgeZ *= decay;
        p.dodgeAlert = Math.max(0, p.dodgeAlert - dt * 2.2);
      }

      p.x = baseX + p.dodgeX;
      p.z = baseZ + p.dodgeZ;

      const groundY = getTerrainHeight(p.x, p.z);
      const citizenGroup = citizenGroupRefs.current[i];
      if (citizenGroup) {
        citizenGroup.position.set(p.x, groundY, p.z);
        const yaw = citizenGroup.rotation.y;
        citizenGroup.rotation.y += Math.atan2(Math.sin(p.yaw - yaw), Math.cos(p.yaw - yaw)) * (1 - Math.exp(-10 * dt));
      }

      // Smooth humanoid skeletal stride animation when within 85m of camera
      const rig = citizenStrideRigs.current[i];
      const dxCamCit = camPos.x - p.x;
      const dzCamCit = camPos.z - p.z;
      if (rig && dxCamCit * dxCamCit + dzCamCit * dzCamCit < 85 * 85) {
        animateHumanoid(rig, {
          dt, time: elapsed + i * 0.57, phase: p.phase, speed: p.speed * speedBoost,
          lookYaw: p.dodgeAlert * 0.45, lateral: p.dodgeAlert * 0.35,
        });
      }
    }

    // ------------------------------------------------------------------------
    // 2. Battle Royale combat, drops, and character reactions.
    const combat = simState.brActive && simState.gameMode === 'BATTLE_ROYALE' && !simState.startMenuOpen;
    for (let i = 0; i < simState.botTargets.length; i++) {
      const bot = simState.botTargets[i];
      const ai = tactic[i];
      const group = botGroupRefs.current[i];
      const tracer = botTracers.current[i];
      const drop = botDrops.current[i];
      if (!combat) {
        if (group) group.visible = false;
        if (tracer) tracer.visible = false;
        if (drop) drop.visible = false;
        continue;
      }
      if (ai.round !== simState.brRound) {
        ai.round = simState.brRound;
        ai.awareness = i * 0.065;
        ai.cooldown = 0.7 + i * 0.28;
        ai.burst = ai.tracer = 0;
        ai.exposed = false;
        ai.coverX = ai.coverZ = 0;
      }
      const parachute = botParachuteRefs.current[i];
      const billboard = botHudBillboardRefs.current[i];
      const hpBar = botHpBarRefs.current[i];
      const shieldBar = botShieldBarRefs.current[i];
      const muzzle = botMuzzleFlashRefs.current[i];
      const mount = botModelMountRefs.current[i];
      const gun = botGunMountRefs.current[i];
      const rig = botStrideRigs.current[i];
      let visualSpeed = 0;
      let lateral = 0;
      let aim = 0;

      if (group) {
        group.visible = bot.alive || Boolean(bot.fall && bot.fall.elapsed < 9);
        group.scale.setScalar(bot.alive ? 1 : 1 - THREE.MathUtils.smoothstep(bot.fall?.elapsed ?? 8, 7.1, 9));
      }
      if (canStrike && bot.alive && !bot.fall && !bot.parachuting) {
        const hit = pedestrianContact(sweep, bot.x, bot.y, bot.z);
        if (hit && simState.brResult === null) {
          injureBot(bot, hit.damage, hit.travelX, hit.travelZ, hit.severity, hit.side);
          applyBump(hit.severity);
        }
      }
      if (bot.fall) {
        const fall = bot.fall;
        bot.y = moveTumbling(bot, fall, bot.y, dt);
        if (fall.grounded && !bot.alive && !bot.dropSpawned) {
          bot.drop = [bot.x + fall.side * 0.72, bot.y + 0.085, bot.z + 0.36];
          bot.dropSpawned = true;
        }
        const recovery = bot.alive ? 1 - THREE.MathUtils.smoothstep(fall.elapsed, (bot.downUntil ?? 2) - 0.64, bot.downUntil ?? 2) : 1;
        if (mount) positionFall(mount, fall, recovery);
        if (rig) animateHumanoid(rig, { dt, time: elapsed, phase: ai.phase, speed: 0,
          airborne: fall.grounded ? undefined : 'jump', fallSpeed: fall.vy, landing: recovery * 0.88 });
        if (bot.alive && recovery < 0.01 && fall.grounded) bot.fall = undefined;
      } else if (bot.parachuting) {
        bot.parachuteY -= 9.5 * dt;
        bot.x = bot.homeX + Math.sin(elapsed * 1.2 + i) * 1.4;
        bot.z = bot.homeZ + Math.cos(elapsed * 1.1 + i) * 1.4;
        const surface = getTravelHeight(bot.x, bot.z);
        bot.y = Math.max(surface, bot.parachuteY);
        bot.yaw = Math.sin(elapsed * 0.74 + i) * 0.4;
        if (bot.y <= surface + 0.04) bot.parachuting = false;
      } else if (bot.alive) {
        if (mount) {
          mount.position.y = 0;
          mount.rotation.set(0, 0, -Math.sin(bot.hitFlash * 16) * bot.hitFlash * 0.42);
        }
        const dx = threatX - bot.x;
        const dz = threatZ - bot.z;
        const dist = Math.hypot(dx, dz);
        const engaging = simState.brResult === null && !simState.parachuting && dist < 70 && dist > 0.02;
        let moveX = bot.homeX + Math.cos(elapsed * 0.43 + i) * 4 - bot.x;
        let moveZ = bot.homeZ + Math.sin(elapsed * 0.37 + i) * 7 - bot.z;
        let pace = 2.15;
        if (engaging) {
          const fx = dx / dist;
          const fz = dz / dist;
          ai.awareness -= dt;
          const targetY = simState.playerPos.y + (simState.mode === 'FOOT' ? 1.05 : 0.74);
          if (ai.awareness <= 0) {
            ai.awareness = 0.31 + i * 0.021;
            _vecA.set(bot.x, bot.y + 1.3, bot.z);
            _vecB.set(dx, targetY - _vecA.y, dz);
            const rayLength = _vecB.length();
            ai.exposed = !traceWorld(_vecA, _vecB.divideScalar(rayLength), rayLength, 0.02);
            if (ai.coverX === 0 && bot.hitFlash > 0.04 && bot.shield < bot.maxShield / 2) {
              for (const side of [ai.direction, -ai.direction]) {
                const cx = bot.x + fz * side * 5.5 - fx * 2;
                const cz = bot.z - fx * side * 5.5 - fz * 2;
                const cy = getTravelHeight(cx, cz) + 1.28;
                _vecA.set(cx, cy, cz);
                _vecB.set(threatX - cx, targetY - cy, threatZ - cz);
                const length = _vecB.length();
                if (traceWorld(_vecA, _vecB.divideScalar(length), length, 0.025)) {
                  ai.coverX = cx;
                  ai.coverZ = cz;
                  ai.direction = side;
                  break;
                }
              }
            }
          }
          const desired = ai.retreat;
          const approach = THREE.MathUtils.clamp((dist - desired) / 12, -0.8, 0.94);
          const sideStep = ai.direction * (ai.exposed ? 0.86 : 1.22);
          moveX = fx * approach + fz * sideStep;
          moveZ = fz * approach - fx * sideStep;
          pace = ai.exposed ? 3.65 : 4.65;
          if (ai.coverX !== 0) {
            moveX = ai.coverX - bot.x;
            moveZ = ai.coverZ - bot.z;
            pace = 5.15;
            if (Math.hypot(moveX, moveZ) < 0.9) {
              ai.coverX = ai.coverZ = 0;
              ai.cooldown = 0.72;
            }
          }
          if (canStrike && simState.carSpeed > 6 && dist < 16) {
            const heading = (bot.x - threatX) * Math.sin(sweep.yaw) + (bot.z - threatZ) * Math.cos(sweep.yaw);
            const side = (bot.x - threatX) * Math.cos(sweep.yaw) - (bot.z - threatZ) * Math.sin(sweep.yaw);
            if (heading > 0 && Math.abs(side) < 3.1 && heading < simState.carSpeed * 1.05) {
              moveX = Math.cos(sweep.yaw) * (Math.sign(side) || ai.direction);
              moveZ = -Math.sin(sweep.yaw) * (Math.sign(side) || ai.direction);
              pace = 5.9;
            }
          }

          bot.yaw = Math.atan2(dx, dz);
          lateral = ai.direction * 0.7;
          aim = ai.exposed && dist < 54 ? 1 : 0.43;
          ai.cooldown -= dt;
          if (ai.exposed && dist < 51 && bot.hitFlash < 0.17 && ai.cooldown <= 0) {
            const accurate = 1 - THREE.MathUtils.smoothstep(dist, 9, 52) * 0.58;
            const chance = accurate * (simState.mode === 'CAR' ? 0.67 : 0.81);
            const hitTarget = Math.random() < chance;
            const miss = hitTarget ? 0 : (Math.random() < 0.5 ? -1 : 1) * (0.64 + Math.random() * 2.45);
            ai.from.set(bot.x + fz * 0.21 + fx * 0.68, bot.y + 1.34, bot.z - fx * 0.21 + fz * 0.68);
            ai.to.set(threatX + fz * miss, targetY + (hitTarget ? 0 : Math.random() * 0.86), threatZ - fx * miss);
            _vecB.copy(ai.to).sub(ai.from);
            const length = _vecB.length();
            const obstruction = traceWorld(ai.from, _vecB.divideScalar(length), length, 0);
            if (obstruction && obstruction.distance < length - 0.1) {
              ai.to.copy(obstruction.point);
              damageWorld(obstruction, 6 + 3 * accurate);
            } else if (hitTarget) injurePlayer((simState.mode === 'CAR' ? 6 : 9) + accurate * 2.3);
            if (dist < 32) soundEngine.playDistantShot(1 - dist / 42);
            ai.tracer = 0.085;
            bot.muzzleFlash = 0.115;
            ai.burst++;
            if (ai.burst >= 2 + i % 3) {
              ai.burst = 0;
              ai.cooldown = 1 + i * 0.105 + Math.random() * 0.46;
            } else ai.cooldown = 0.18 + i % 3 * 0.018;
          }
        } else {
          ai.cooldown = Math.max(0.42, ai.cooldown - dt);
          if (Math.hypot(moveX, moveZ) > 0.15) bot.yaw = Math.atan2(moveX, moveZ);
        }

        if (Math.hypot(bot.x, bot.z) > simState.stormRadius - 7) {
          moveX -= bot.x / 42;
          moveZ -= bot.z / 42;
        }
        const length = Math.hypot(moveX, moveZ);
        if (length > 0.02) {
          let x = moveX / length;
          let z = moveZ / length;
          const step = Math.min(pace * dt, length);
          const origin = _vecA.set(bot.x, bot.y + 0.7, bot.z);
          let wall = traceWorld(origin, _vecB.set(x, 0, z), step + 0.45, 0.29, (hit) => Math.abs(hit.normal.y) < 0.72);
          if (wall) {
            const against = x * wall.normal.x + z * wall.normal.z;
            x -= against * wall.normal.x;
            z -= against * wall.normal.z;
            if (Math.hypot(x, z) < 0.25) {
              x = wall.normal.z * ai.direction;
              z = -wall.normal.x * ai.direction;
            }
            wall = traceWorld(origin, _vecB.set(x, 0, z).normalize(), step, 0.29, (hit) => Math.abs(hit.normal.y) < 0.72);
          }
          if (!wall) {
            const nx = bot.x + x * step;
            const nz = bot.z + z * step;
            const surface = getTravelHeight(nx, nz, bot.y + 0.5);
            if (surface > simState.tideOffset - 0.1 && Math.abs(surface - bot.y) < 0.67) {
              bot.x = nx;
              bot.z = nz;
              bot.y = surface;
              visualSpeed = step / dt;
            }
          }
        }
        ai.phase += dt * visualSpeed * 3.4;
      }

      bot.hitFlash = Math.max(0, bot.hitFlash - dt);
      bot.muzzleFlash = Math.max(0, bot.muzzleFlash - dt);
      ai.tracer = Math.max(0, ai.tracer - dt);
      if (group) {
        group.position.set(bot.x, bot.y, bot.z);
        const turn = Math.atan2(Math.sin(bot.yaw - group.rotation.y), Math.cos(bot.yaw - group.rotation.y));
        group.rotation.y += turn * (1 - Math.exp(-13 * dt));
      }
      if (parachute) parachute.visible = bot.parachuting;
      if (gun) gun.visible = bot.alive && !bot.fall && !bot.parachuting;
      if (muzzle) muzzle.visible = bot.alive && bot.muzzleFlash > 0 && !bot.parachuting;
      if (tracer) {
        tracer.visible = ai.tracer > 0;
        if (tracer.visible) {
          _vecA.copy(ai.to).sub(ai.from);
          tracer.position.copy(ai.from).lerp(ai.to, 0.5);
          tracer.quaternion.setFromUnitVectors(_Y_AXIS, _vecB.copy(_vecA).normalize());
          tracer.scale.set(1, _vecA.length(), 1);
        }
      }
      if (drop) {
        drop.visible = Boolean(bot.drop);
        if (bot.drop) {
          drop.position.fromArray(bot.drop);
          drop.rotation.y = bot.yaw;
          if (simState.brResult === null && simState.mode === 'FOOT' &&
              simState.playerPos.distanceTo(drop.position) < 1.72) {
            simState.ammo = Math.min(simState.maxAmmo, simState.ammo + 13);
            simState.playerShield = Math.min(100, simState.playerShield + 11);
            bot.drop = undefined;
            drop.visible = false;
            soundEngine.playChipPickup(false);
          }
        }
      }
      if (billboard) {
        billboard.visible = bot.alive && !bot.fall && bot.hitFlash > 0 && Math.hypot(threatX - bot.x, threatZ - bot.z) < 45;
        billboard.rotation.y = Math.atan2(camPos.x - bot.x, camPos.z - bot.z) - bot.yaw;
      }
      if (hpBar) {
        hpBar.scale.x = Math.max(0.001, bot.hp / bot.maxHp);
        hpBar.position.x = -0.44 * (1 - hpBar.scale.x);
      }
      if (shieldBar) {
        shieldBar.scale.x = Math.max(0.001, bot.shield / Math.max(1, bot.maxShield));
        shieldBar.position.x = -0.44 * (1 - shieldBar.scale.x);
      }
      if (rig && !bot.fall && Math.hypot(camPos.x - bot.x, camPos.z - bot.z) < 86) {
        animateHumanoid(rig, { dt, time: elapsed, phase: ai.phase, speed: visualSpeed, lateral, aim,
          airborne: bot.parachuting ? 'parachute' : undefined, recoil: bot.muzzleFlash / 0.115 });
      }
    }

    // ------------------------------------------------------------------------
    // 3. Update 12 Real 3D GLB Traffic Vehicles (Proximity Braking + Wheel Rotation + Minimap Sync)
    // ------------------------------------------------------------------------
    const circuitReserved = simState.startMenuOpen || simState.gameMode === 'GRAND_PRIX';
    simState.trafficPositions.length = 0;
    for (let i = 0; i < vehicles.length; i++) {
      if (carRefs.current[i]) carRefs.current[i]!.visible = !circuitReserved;
      if (circuitReserved) continue;
      const v = vehicles[i];
      const circuitLen = v.circuit.totalLength;

      let minGap = circuitLen;
      let leadSpeed = v.baseSpeed;
      for (let j = 0; j < vehicles.length; j++) {
        if (i === j || vehicles[j].circuit !== v.circuit) continue;
        let d = vehicles[j].s - v.s;
        if (d < 0) d += circuitLen;
        if (d < minGap) {
          minGap = d;
          leadSpeed = vehicles[j].currentSpeed;
        }
      }

      const yawPre = sampleCircuit(v.circuit, v.s, _vecA);
      const fwdX = Math.sin(yawPre);
      const fwdZ = Math.cos(yawPre);

      let targetSpeed =
        minGap < 18 ? Math.min(v.baseSpeed, Math.max(4.0, leadSpeed * 0.95)) : v.baseSpeed;
      if (minGap < 8.5) {
        targetSpeed = Math.max(2.0, leadSpeed * 0.75);
      }

      let blockedByObstacle = false;
      const checkObstacle = (ox: number, oz: number, lateralHalfWidth: number) => {
        const dx = ox - _vecA.x;
        const dz = oz - _vecA.z;
        const forwardDist = dx * fwdX + dz * fwdZ;
        const lateralDist = Math.abs(dx * fwdZ - dz * fwdX);
        if (forwardDist > 0.0 && forwardDist < 9.5 && lateralDist < lateralHalfWidth) {
          blockedByObstacle = true;
          targetSpeed = 0;
        }
      };

      checkObstacle(simState.carPos.x, simState.carPos.z, 2.5);
      if (simState.mode === 'FOOT') {
        checkObstacle(simState.playerPos.x, simState.playerPos.z, 2.2);
      }

      const accelRate = targetSpeed < v.currentSpeed ? 7.5 : 3.2;
      v.currentSpeed += (targetSpeed - v.currentSpeed) * Math.min(1, dt * accelRate);
      if (v.currentSpeed < 0.05 && targetSpeed === 0) v.currentSpeed = 0;

      v.isBraking = blockedByObstacle || targetSpeed < v.currentSpeed - 0.6;
      const tailMat = taillightMaterials[i];
      if (tailMat) {
        tailMat.emissiveIntensity = v.isBraking ? 4.8 : 1.3;
        tailMat.color.set(v.isBraking ? '#fca5a5' : '#ef4444');
      }

      v.s = (v.s + v.currentSpeed * dt) % circuitLen;
      v.wheelAngle = (v.wheelAngle + v.currentSpeed * dt * 2.6) % (Math.PI * 2);

      const yaw = sampleCircuit(v.circuit, v.s, _vecA);
      const yawAhead = sampleCircuit(v.circuit, v.s + 2.2, _vecB);

      let yawDiff = yawAhead - yaw;
      while (yawDiff > Math.PI) yawDiff -= Math.PI * 2;
      while (yawDiff < -Math.PI) yawDiff += Math.PI * 2;
      v.steerAngle = THREE.MathUtils.clamp(yawDiff * 1.4, -0.45, 0.45);

      const yCenter = getTerrainHeight(_vecA.x, _vecA.z);
      const yAhead = getTerrainHeight(_vecB.x, _vecB.z);
      const pitch = -Math.atan2(yAhead - yCenter, 2.2);

      simState.trafficPositions[i] = [_vecA.x, yCenter + 0.02, _vecA.z];

      const carGroup = carRefs.current[i];
      if (carGroup) {
        carGroup.position.set(_vecA.x, yCenter + 0.02, _vecA.z);
        carGroup.rotation.set(pitch, yaw, 0, 'YXZ');
      }

      const wheels = carWheelRefs.current[i];
      if (wheels) {
        for (let w = 0; w < 4; w++) {
          const wheelNode = wheels[w];
          if (wheelNode) {
            wheelNode.rotation.x += v.currentSpeed * dt * 2.6;
          }
        }
      }

      const steers = carSteerRefs.current[i];
      if (steers) {
        for (let sIdx = 0; sIdx < 2; sIdx++) {
          const steerNode = steers[sIdx];
          if (steerNode) {
            steerNode.rotation.y = v.steerAngle;
          }
        }
      }
    }

    // ------------------------------------------------------------------------
    // 4. Update 3 Venetian Gondolas / Cruisers
    // ------------------------------------------------------------------------
    for (let i = 0; i < gondolas.length; i++) {
      const g = gondolas[i];
      g.x += g.dir * g.speed * dt;
      if (g.x >= 218) {
        g.x = 218;
        g.dir = -1;
      } else if (g.x <= 82) {
        g.x = 82;
        g.dir = 1;
      }

      const z = g.zBase + Math.sin(elapsed * 0.5 + g.phase) * 0.35;
      const waterY = getWaveHeight(g.x, z, elapsed) * 0.25 + simState.tideOffset;
      const roll = Math.sin(elapsed * 1.4 + g.phase) * 0.035;
      const pitch = Math.cos(elapsed * 1.1 + g.phase) * 0.025;

      const gondolaGroup = gondolaRefs.current[i];
      if (gondolaGroup) {
        gondolaGroup.position.set(g.x, waterY + 0.12, z);
        gondolaGroup.rotation.set(pitch, g.dir > 0 ? Math.PI / 2 : -Math.PI / 2, roll, 'YXZ');
      }
    }

    // ------------------------------------------------------------------------
    // 5. Update 3 AI Offshore Maritime Vessels (galleon_ship, sloop_yacht, caique_boat)
    // ------------------------------------------------------------------------
    for (let i = 0; i < offshoreVessels.length; i++) {
      const vessel = offshoreVessels[i];
      vessel.angle += vessel.dir * vessel.angularSpeed * dt;

      const vx = vessel.centerX + Math.cos(vessel.angle) * vessel.radiusX;
      const vz = vessel.centerZ + Math.sin(vessel.angle) * vessel.radiusZ;
      const waveY = getWaveHeight(vx, vz, elapsed) * 0.55 + simState.tideOffset;

      const tx = -Math.sin(vessel.angle) * vessel.radiusX * vessel.dir;
      const tz = Math.cos(vessel.angle) * vessel.radiusZ * vessel.dir;
      const yaw = Math.atan2(tx, tz);
      const roll = Math.sin(elapsed * 1.2 + i * 1.7) * 0.05;
      const pitch = Math.cos(elapsed * 0.95 + i * 1.3) * 0.035;

      const vesselGroup = offshoreVesselRefs.current[i];
      if (vesselGroup) {
        vesselGroup.position.set(vx, waveY + vessel.draftOffset, vz);
        vesselGroup.rotation.set(pitch, yaw, roll, 'YXZ');
      }
    }

    // ------------------------------------------------------------------------
    // 6. Update 4 Diverse Overhead AI Aircraft (airliner, narrow_airliner, turboprop, helicopter)
    // ------------------------------------------------------------------------
    for (let i = 0; i < aircraftList.length; i++) {
      const a = aircraftList[i];
      a.angle += a.dir * a.angularSpeed * dt;
      const x = a.centerX + Math.cos(a.angle) * a.radiusX;
      const z = a.centerZ + Math.sin(a.angle) * a.radiusZ;
      const y = a.altitude + Math.sin(elapsed * (a.isHelicopter ? 1.1 : 0.4) + i * 2) * 1.4;

      const tx = -Math.sin(a.angle) * a.radiusX * a.dir;
      const tz = Math.cos(a.angle) * a.radiusZ * a.dir;
      const yaw = Math.atan2(tx, tz);
      const bank = a.dir * (a.isHelicopter ? -0.14 : -0.22);
      const pitch = a.isHelicopter ? 0.08 : 0.02;

      const planeGroup = aircraftRefs.current[i];
      if (planeGroup) {
        planeGroup.position.set(x, y, z);
        planeGroup.rotation.set(pitch, yaw, bank, 'YXZ');
      }

      // Spin helicopter main/tail rotors and turboprop twin propellers
      const rotors = aircraftRotorRefs.current[i];
      if (rotors) {
        if (rotors.rotorMain) rotors.rotorMain.rotation.y += dt * 28.0;
        if (rotors.rotorTail) rotors.rotorTail.rotation.x += dt * 34.0;
        if (rotors.propL) rotors.propL.rotation.z += dt * 32.0;
        if (rotors.propR) rotors.propR.rotation.z += dt * 32.0;
      }
    }
  });

  return (
    <group>
      {/* 16 Smooth-Shaded High-Res PBR Human Citizens */}
      {pedestrians.map((ped, i) => (
        <group
          key={`citizen-${i}-${ped.modelUrl}`}
          ref={(el) => {
            citizenGroupRefs.current[i] = el;
          }}
        >
          {/* Soft radial ground contact shadow disc */}
          <mesh
            geometry={pedShadowGeo}
            material={pedShadowMat}
            position={[0, 0.03, 0]}
          />
          {/* Cloned Smooth PBR SkinnedMesh Human Mount */}
          <group
            ref={(el) => {
              citizenModelMountRefs.current[i] = el;
            }}
          />
        </group>
      ))}

      {simState.botTargets.map((bot, i) => (
        <React.Fragment key={bot.id + '-effects'}>
          <mesh ref={(mesh) => { botTracers.current[i] = mesh; }} visible={false}>
            <cylinderGeometry args={[0.019, 0.031, 1, 4]} />
            <meshBasicMaterial color="#ffe0a1" transparent opacity={0.79} />
          </mesh>
          <group ref={(group) => { botDrops.current[i] = group; }} visible={false}>
            <mesh position={[0, 0.04, 0]}><boxGeometry args={[0.14, 0.10, 0.66]} /><meshStandardMaterial color="#3d4949" metalness={0.64} roughness={0.39} /></mesh>
            <mesh position={[0, 0.04, 0.42]}><boxGeometry args={[0.034, 0.045, 0.19]} /><meshStandardMaterial color="#667579" metalness={0.75} roughness={0.31} /></mesh>
            <mesh position={[0.14, 0.016, 0.05]}><boxGeometry args={[0.19, 0.07, 0.13]} /><meshStandardMaterial color="#866445" roughness={0.72} /></mesh>
          </group>
        </React.Fragment>
      ))}
      {/* 8 Armed Battle Royale Combat Bots (Smooth PBR Humans + 3D GLB Weapons + Parachute + Overhead HP/Shield Bars) */}
      {simState.botTargets.map((bot, i) => (
        <group
          key={bot.id}
          ref={(el) => {
            botGroupRefs.current[i] = el;
          }}
          position={[bot.x, bot.y, bot.z]}
          rotation={[0, bot.yaw, 0]}
        >
          {/* Soft radial ground contact shadow disc */}
          <mesh
            geometry={pedShadowGeo}
            material={pedShadowMat}
            position={[0, 0.03, 0]}
          />

          {/* Cloned Smooth PBR 3D Human Model Mount */}
          <group
            ref={(el) => {
              botModelMountRefs.current[i] = el;
            }}
          />

          {/* Armed 3D GLB Weapon Mount (Rifle / Shotgun / Sniper / Minigun / RPG) */}
          <group
            ref={(el) => {
              botGunMountRefs.current[i] = el;
            }}
            position={[0.24, 1.15, 0.32]}
          />

          {/* Glowing Muzzle Flash + Forward Tracer Beam */}
          <group
            ref={(el) => {
              botMuzzleFlashRefs.current[i] = el;
            }}
            position={[0.24, 1.22, 0.92]}
            visible={false}
          >
            <mesh geometry={muzzleFlashCoreGeo} material={muzzleFlashMat} />
            <mesh
              geometry={muzzleTracerGeo}
              material={muzzleTracerMat}
              position={[0, 0, 1.85]}
            />
          </group>

          {/* Tactical Parachute Canopy + Rigging Lines (visible during sky-drop) */}
          <group
            ref={(el) => {
              botParachuteRefs.current[i] = el;
            }}
            position={[0, 2.8, 0]}
            visible={bot.parachuting}
          >
            <mesh geometry={parachuteCenterGeo} material={parachuteCanopyMat} />
            <mesh
              geometry={parachuteWingGeo}
              material={parachuteTrimMat}
              position={[-1.25, -0.15, 0]}
              rotation={[0, 0, 0.28]}
            />
            <mesh
              geometry={parachuteWingGeo}
              material={parachuteTrimMat}
              position={[1.25, -0.15, 0]}
              rotation={[0, 0, -0.28]}
            />
            {/* 4 Suspension Rigging Cords */}
            <mesh
              geometry={parachuteCordGeo}
              material={parachuteCordMat}
              position={[-0.55, -0.78, 0.28]}
              rotation={[0.16, 0, 0.32]}
            />
            <mesh
              geometry={parachuteCordGeo}
              material={parachuteCordMat}
              position={[0.55, -0.78, 0.28]}
              rotation={[0.16, 0, -0.32]}
            />
            <mesh
              geometry={parachuteCordGeo}
              material={parachuteCordMat}
              position={[-0.55, -0.78, -0.28]}
              rotation={[-0.16, 0, 0.32]}
            />
            <mesh
              geometry={parachuteCordGeo}
              material={parachuteCordMat}
              position={[0.55, -0.78, -0.28]}
              rotation={[-0.16, 0, -0.32]}
            />
          </group>

          {/* Overhead 3D Health Bar (#22c55e) + Shield Bar (#38bdf8) at y = 2.15 */}
          <group
            ref={(el) => {
              botHudBillboardRefs.current[i] = el;
            }}
            position={[0, 2.15, 0]}
          >
            <mesh geometry={botBarBackingGeo} material={botBarBackingMat} />
            {/* Top Bar: Shield (#38bdf8) */}
            <mesh
              ref={(el) => {
                botShieldBarRefs.current[i] = el;
              }}
              geometry={botBarFillGeo}
              material={botShieldFillMat}
              position={[0, 0.046, 0.015]}
            />
            {/* Bottom Bar: Health (#22c55e) */}
            <mesh
              ref={(el) => {
                botHpBarRefs.current[i] = el;
              }}
              geometry={botBarFillGeo}
              material={botHpFillMat}
              position={[0, -0.046, 0.015]}
            />
          </group>
        </group>
      ))}

      {/* 12 Active AI Traffic Vehicles (Real 3D GLB Models with Glossy Clearcoat & Spinning Wheels) */}
      {vehicles.map((v, i) => {
        const { spec } = v;
        const lightX = Math.max(0.55, spec.halfX * 0.66);
        return (
          <group
            key={`glb-traffic-${spec.id}-${i}`}
            ref={(el) => {
              carRefs.current[i] = el;
            }}
          >
            <mesh
              geometry={unitShadowGeo}
              material={contactShadowMat}
              position={[0, 0.03, 0]}
              scale={[spec.shadowWidth, 1, spec.shadowLength]}
            />

            <group
              ref={(el) => {
                carModelMountRefs.current[i] = el;
              }}
            />

            <mesh
              geometry={headlightGeo}
              material={headlightMat}
              position={[-lightX, spec.lightY, spec.frontZ]}
            />
            <mesh
              geometry={headlightGeo}
              material={headlightMat}
              position={[lightX, spec.lightY, spec.frontZ]}
            />
            <mesh
              geometry={taillightGeo}
              material={taillightMaterials[i]}
              position={[-lightX, spec.lightY + 0.03, spec.rearZ]}
            />
            <mesh
              geometry={taillightGeo}
              material={taillightMaterials[i]}
              position={[lightX, spec.lightY + 0.03, spec.rearZ]}
            />

            {spec.isPolice && (
              <group position={[0, 1.54, -0.12]}>
                <mesh geometry={policeBarBaseGeo} material={policeBarBaseMat} />
                <mesh
                  ref={(el) => {
                    policeRedLightRefs.current[0] = el;
                  }}
                  geometry={policeStrobeGeo}
                  material={policeRedMat}
                  position={[-0.27, 0.05, 0]}
                />
                <mesh
                  ref={(el) => {
                    policeBlueLightRefs.current[0] = el;
                  }}
                  geometry={policeStrobeGeo}
                  material={policeBlueMat}
                  position={[0.27, 0.05, 0]}
                />
              </group>
            )}
          </group>
        );
      })}

      {/* 6 Parked Exotic / VIP Showcase Vehicles at Bellagio & Sphere Valet Drop-Off Bays */}
      {PARKED_SHOWCASE_SPECS.map((parked, idx) => {
        const yGround = getTerrainHeight(parked.x, parked.z);
        return (
          <group
            key={parked.id}
            position={[parked.x, yGround + 0.02, parked.z]}
            rotation={[0, parked.yaw, 0]}
          >
            <mesh
              geometry={unitShadowGeo}
              material={contactShadowMat}
              position={[0, 0.03, 0]}
              scale={[parked.shadowWidth, 1, parked.shadowLength]}
            />

            <group
              ref={(el) => {
                parkedModelMountRefs.current[idx] = el;
              }}
            />

            <mesh
              geometry={headlightGeo}
              material={headlightMat}
              position={[-0.66, parked.lightY, parked.frontZ]}
            />
            <mesh
              geometry={headlightGeo}
              material={headlightMat}
              position={[0.66, parked.lightY, parked.frontZ]}
            />
            <mesh
              geometry={taillightGeo}
              material={parkedTaillightMat}
              position={[-0.66, parked.lightY + 0.03, parked.rearZ]}
            />
            <mesh
              geometry={taillightGeo}
              material={parkedTaillightMat}
              position={[0.66, parked.lightY + 0.03, parked.rearZ]}
            />

            {parked.isPolice && (
              <group position={[0, 1.54, -0.12]}>
                <mesh geometry={policeBarBaseGeo} material={policeBarBaseMat} />
                <mesh
                  geometry={policeStrobeGeo}
                  material={policeRedMat}
                  position={[-0.27, 0.05, 0]}
                />
                <mesh
                  geometry={policeStrobeGeo}
                  material={policeBlueMat}
                  position={[0.27, 0.05, 0]}
                />
              </group>
            )}
          </group>
        );
      })}

      {/* 3 Venetian Gondolas / Cruisers */}
      {gondolas.map((g, i) => (
        <group
          key={`gondola-${i}`}
          ref={(el) => {
            gondolaRefs.current[i] = el;
          }}
        >
          <mesh position={[0, 0.25, 0]}>
            <boxGeometry args={[1.45, 0.55, 6.4]} />
            <meshStandardMaterial color="#1c1917" roughness={0.35} metalness={0.2} />
          </mesh>
          <mesh position={[0, 0.62, 3.05]}>
            <boxGeometry args={[0.22, 0.65, 0.38]} />
            <meshStandardMaterial color="#f59e0b" metalness={0.85} roughness={0.2} />
          </mesh>
          <mesh position={[0, 0.56, -3.0]}>
            <boxGeometry args={[0.32, 0.48, 0.35]} />
            <meshStandardMaterial color="#f59e0b" metalness={0.85} roughness={0.2} />
          </mesh>
          <mesh position={[0, 0.92, -0.3]}>
            <boxGeometry args={[1.15, 0.72, 2.2]} />
            <meshStandardMaterial color={g.canopyColor} roughness={0.7} />
          </mesh>
          <mesh position={[0, 0.95, 3.05]}>
            <sphereGeometry args={[0.14, 8, 8]} />
            <meshStandardMaterial color="#fef3c7" emissive="#fbbf24" emissiveIntensity={1.6} />
          </mesh>
        </group>
      ))}

      {/* 3 AI Offshore Maritime Vessels (galleon_ship.glb, sloop_yacht.glb, caique_boat.glb) */}
      {offshoreVessels.map((vessel, i) => (
        <group
          key={vessel.id}
          ref={(el) => {
            offshoreVesselRefs.current[i] = el;
          }}
        >
          <group
            ref={(el) => {
              offshoreVesselMountRefs.current[i] = el;
            }}
          />
          {/* Masthead warm maritime navigation beacon */}
          <mesh position={[0, 5.2, 1.8]}>
            <sphereGeometry args={[0.22, 6, 6]} />
            <meshStandardMaterial color="#fef3c7" emissive="#f59e0b" emissiveIntensity={2.0} />
          </mesh>
        </group>
      ))}

      {/* 4 Diverse Overhead AI Aircraft (airliner.glb, narrow_airliner.glb, turboprop.glb, helicopter.glb) */}
      {aircraftList.map((aircraft, i) => (
        <group
          key={aircraft.id}
          ref={(el) => {
            aircraftRefs.current[i] = el;
          }}
        >
          <group
            ref={(el) => {
              aircraftModelMountRefs.current[i] = el;
            }}
          />
          {/* Port (red) & Starboard (green) navigation strobes */}
          <mesh position={[-aircraft.wingSpanHalf, 1.6, -0.8]}>
            <sphereGeometry args={[0.22, 6, 6]} />
            <meshStandardMaterial color="#ef4444" emissive="#ef4444" emissiveIntensity={2.4} />
          </mesh>
          <mesh position={[aircraft.wingSpanHalf, 1.6, -0.8]}>
            <sphereGeometry args={[0.22, 6, 6]} />
            <meshStandardMaterial color="#22c55e" emissive="#22c55e" emissiveIntensity={2.4} />
          </mesh>
        </group>
      ))}
    </group>
  );
}
