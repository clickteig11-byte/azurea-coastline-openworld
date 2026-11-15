import React, { useEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import { useFrame } from '@react-three/fiber';
import { GLTFLoader, GLTF } from 'three/examples/jsm/loaders/GLTFLoader.js';
import * as SkeletonUtils from 'three/examples/jsm/utils/SkeletonUtils.js';
import { getTerrainHeight, getWaveHeight } from '../game/worldMath';
import { simState } from '../game/store';
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
// Smooth Humanoid Skeletal StrideRig Interface & Helper
// ============================================================================
interface HumanoidStrideRig {
  leftUpLeg: THREE.Object3D | null;
  rightUpLeg: THREE.Object3D | null;
  leftLeg: THREE.Object3D | null;
  rightLeg: THREE.Object3D | null;
  leftArm: THREE.Object3D | null;
  rightArm: THREE.Object3D | null;
  spine: THREE.Object3D | null;
}

function captureRestQuat(bone: THREE.Object3D | null, preRotX = 0): THREE.Object3D | null {
  if (!bone) return null;
  if (preRotX !== 0) {
    _quatScratch.setFromAxisAngle(_X_AXIS, preRotX);
    bone.quaternion.multiply(_quatScratch);
  }
  bone.userData.restQuat = bone.quaternion.clone();
  return bone;
}

function applyBoneAxisSwing(
  bone: THREE.Object3D | null,
  axis: THREE.Vector3,
  angleRad: number
) {
  if (!bone || !bone.userData.restQuat) return;
  _quatScratch.setFromAxisAngle(axis, angleRad);
  bone.quaternion.copy(bone.userData.restQuat as THREE.Quaternion).multiply(_quatScratch);
}

function updateHumanoidStride(rig: HumanoidStrideRig, phase: number, strideScale = 1.0) {
  const s = Math.sin(phase);
  const c = Math.cos(phase);
  const legSwing = 0.48 * strideScale;
  const kneeBend = 0.55 * strideScale;
  const armSwing = 0.34 * strideScale;

  // Swing LeftUpLeg and RightUpLeg in opposite phase around local X
  applyBoneAxisSwing(rig.leftUpLeg, _X_AXIS, s * legSwing);
  applyBoneAxisSwing(rig.rightUpLeg, _X_AXIS, -s * legSwing);

  // Bend LeftLeg and RightLeg knees naturally around local X during back-to-forward recovery
  applyBoneAxisSwing(rig.leftLeg, _X_AXIS, -Math.max(0, s) * kneeBend);
  applyBoneAxisSwing(rig.rightLeg, _X_AXIS, -Math.max(0, -s) * kneeBend);

  // Counter-swing LeftArm and RightArm
  applyBoneAxisSwing(rig.leftArm, _X_AXIS, -s * armSwing);
  applyBoneAxisSwing(rig.rightArm, _X_AXIS, s * armSwing);

  // Subtle torso counter-sway
  applyBoneAxisSwing(rig.spine, _Y_AXIS, c * 0.06 * strideScale);
}

// ============================================================================
// 16 High-Res Smooth-Shaded PBR Human Citizens (70% ReadyPlayerMe, 30% Michelle)
// ============================================================================
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
}

function selectHumanModelUrl(index: number): string {
  // ~70% /models/readyplayer_me.glb (11 of 16) and ~30% /models/michelle.glb (5 of 16)
  return index % 3 === 2 ? '/models/michelle.glb' : '/models/readyplayer_me.glb';
}

function createPedestrians(): PedestrianAgent[] {
  const list: PedestrianAgent[] = [];

  // 8 Strip Sidewalk citizens (x = ±23.4, z = -105..105)
  for (let i = 0; i < 8; i++) {
    const isEast = i % 2 === 0;
    const laneX = (isEast ? 1 : -1) * (23.4 + ((i * 3) % 5) * 0.16);
    const zStart = -98 + i * 26;
    const dir: 1 | -1 = i % 3 === 0 ? -1 : 1;
    list.push({
      kind: 'STRIP',
      modelUrl: selectHumanModelUrl(i),
      paletteIndex: i,
      x: laneX,
      z: zStart,
      yaw: dir > 0 ? 0 : Math.PI,
      speed: 1.45 + (i % 4) * 0.15,
      phase: i * 1.37,
      axisPos: zStart,
      minBound: -108,
      maxBound: 108,
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

  // 4 Strip Crosswalk citizens walking back and forth across z = 22 and z = -52
  const crosswalkZCoords = [22, 22, -52, -52];
  for (let i = 0; i < 4; i++) {
    const zCross = crosswalkZCoords[i] + (i % 2 === 0 ? -0.65 : 0.65);
    const dir: 1 | -1 = i % 2 === 0 ? 1 : -1;
    const xStart = i % 2 === 0 ? -15 + i * 5 : 15 - i * 4;
    const idx = 8 + i;
    list.push({
      kind: 'CROSSWALK',
      modelUrl: selectHumanModelUrl(idx),
      paletteIndex: idx,
      x: xStart,
      z: zCross,
      yaw: dir > 0 ? Math.PI / 2 : -Math.PI / 2,
      speed: 1.55 + (i % 2) * 0.2,
      phase: idx * 1.5,
      axisPos: xStart,
      minBound: -23.4,
      maxBound: 23.4,
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

  // 4 Bellagio Fountain Plaza promenade citizens (around x = 0, z = -10)
  for (let i = 0; i < 4; i++) {
    const ringRadius = 14.8 + (i % 2) * 0.9;
    const ringAngle = (i / 4) * Math.PI * 2;
    const ringDir: 1 | -1 = i % 2 === 0 ? 1 : -1;
    const idx = 12 + i;
    list.push({
      kind: 'BELLAGIO',
      modelUrl: selectHumanModelUrl(idx),
      paletteIndex: idx,
      x: Math.cos(ringAngle) * ringRadius,
      z: -10 + Math.sin(ringAngle) * ringRadius,
      yaw: ringAngle + (ringDir > 0 ? Math.PI : 0),
      speed: 1.38 + (i % 3) * 0.15,
      phase: idx * 1.9,
      axisPos: 0,
      minBound: 0,
      maxBound: 0,
      dir: 1,
      laneCoord: 0,
      ringAngle,
      ringRadius,
      ringDir,
      dodgeX: 0,
      dodgeZ: 0,
      dodgeAlert: 0,
    });
  }

  return list;
}

// ============================================================================
// 4-Lane Strip AI Traffic Circuits (Inner x = ±6, Outer x = ±14)
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

function buildStripCircuit(laneOffset: number, bypassBump: number): BuiltCircuit {
  const rawPts: Array<{ x: number; z: number }> = [];

  for (let i = 0; i < 32; i++) {
    const t = i / 32;
    rawPts.push({ x: laneOffset, z: 115 - t * (115 - 9) });
  }
  for (let i = 0; i < 28; i++) {
    const u = i / 28;
    const z = 9 - u * 38;
    const bump = 0.5 * (1 - Math.cos(2 * Math.PI * u));
    rawPts.push({ x: laneOffset + bypassBump * bump, z });
  }
  for (let i = 0; i < 28; i++) {
    const t = i / 28;
    rawPts.push({ x: laneOffset, z: -29 - t * (115 - 29) });
  }
  for (let i = 0; i < 16; i++) {
    const ang = (i / 16) * Math.PI;
    rawPts.push({ x: Math.cos(ang) * laneOffset, z: -115 - Math.sin(ang) * laneOffset });
  }
  for (let i = 0; i < 28; i++) {
    const t = i / 28;
    rawPts.push({ x: -laneOffset, z: -115 + t * (115 - 29) });
  }
  for (let i = 0; i < 28; i++) {
    const u = i / 28;
    const z = -29 + u * 38;
    const bump = 0.5 * (1 - Math.cos(2 * Math.PI * u));
    rawPts.push({ x: -(laneOffset + bypassBump * bump), z });
  }
  for (let i = 0; i < 32; i++) {
    const t = i / 32;
    rawPts.push({ x: -laneOffset, z: 9 + t * (115 - 9) });
  }
  for (let i = 0; i < 16; i++) {
    const ang = Math.PI + (i / 16) * Math.PI;
    rawPts.push({ x: Math.cos(ang) * laneOffset, z: 115 - Math.sin(ang) * laneOffset });
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

const INNER_CIRCUIT = buildStripCircuit(6.0, 9.8);
const OUTER_CIRCUIT = buildStripCircuit(14.0, 3.6);

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
    label: 'Yellow Taxi Cab',
    url: '/models/yellow_cab.glb',
    circuitKind: 'INNER',
    halfX: 0.96,
    frontZ: 2.31,
    rearZ: -2.30,
    lightY: 0.62,
    shadowWidth: 2.3,
    shadowLength: 5.0,
    baseSpeed: 11.4,
    isTaxi: true,
  },
  {
    id: 'police_cruiser',
    label: 'Metro Police Cruiser',
    url: '/models/police_cruiser.glb',
    circuitKind: 'INNER',
    halfX: 0.98,
    frontZ: 2.39,
    rearZ: -2.40,
    lightY: 0.64,
    shadowWidth: 2.35,
    shadowLength: 5.2,
    baseSpeed: 12.6,
    isPolice: true,
  },
  {
    id: 'stretch_limo',
    label: 'Vegas VIP Stretch Limousine',
    url: '/models/stretch_limo.glb',
    circuitKind: 'INNER',
    halfX: 1.11,
    frontZ: 4.24,
    rearZ: -4.24,
    lightY: 0.62,
    shadowWidth: 2.55,
    shadowLength: 8.9,
    baseSpeed: 10.2,
  },
  {
    id: 'gt3_car',
    label: 'GT3 Gymkhana Race Car',
    url: '/models/gt3_car.glb',
    circuitKind: 'INNER',
    halfX: 1.10,
    frontZ: 2.34,
    rearZ: -2.35,
    lightY: 0.52,
    shadowWidth: 2.45,
    shadowLength: 5.1,
    baseSpeed: 13.2,
  },
  {
    id: 'wedge_coupe',
    label: '80s Wedge Supercar',
    url: '/models/wedge_coupe.glb',
    circuitKind: 'INNER',
    halfX: 0.99,
    frontZ: 2.23,
    rearZ: -2.21,
    lightY: 0.48,
    shadowWidth: 2.35,
    shadowLength: 4.85,
    baseSpeed: 12.8,
  },
  {
    id: 'muscle_car',
    label: '60s Muscle Car',
    url: '/models/muscle_car.glb',
    circuitKind: 'INNER',
    halfX: 1.00,
    frontZ: 2.36,
    rearZ: -2.36,
    lightY: 0.56,
    shadowWidth: 2.35,
    shadowLength: 5.1,
    baseSpeed: 12.0,
  },
  {
    id: 'casino_convertible',
    label: 'Casino Jackpot Convertible',
    url: '/models/casino_convertible.glb',
    circuitKind: 'OUTER',
    halfX: 0.97,
    frontZ: 2.21,
    rearZ: -2.21,
    lightY: 0.54,
    shadowWidth: 2.3,
    shadowLength: 4.85,
    baseSpeed: 11.8,
  },
  {
    id: 'convertible',
    label: 'Cruiser Convertible',
    url: '/models/convertible.glb',
    circuitKind: 'OUTER',
    halfX: 1.09,
    frontZ: 2.64,
    rearZ: -2.64,
    lightY: 0.58,
    shadowWidth: 2.45,
    shadowLength: 5.65,
    baseSpeed: 11.2,
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
    baseSpeed: 10.8,
  },
  {
    id: 'town_car',
    label: 'Executive Town Car',
    url: '/models/town_car.glb',
    circuitKind: 'OUTER',
    halfX: 0.99,
    frontZ: 2.49,
    rearZ: -2.49,
    lightY: 0.58,
    shadowWidth: 2.35,
    shadowLength: 5.35,
    baseSpeed: 11.0,
  },
  {
    id: 'pickup_truck',
    label: 'Suburban Pickup Truck',
    url: '/models/pickup_truck.glb',
    circuitKind: 'OUTER',
    halfX: 1.00,
    frontZ: 2.79,
    rearZ: -2.79,
    lightY: 0.76,
    shadowWidth: 2.4,
    shadowLength: 5.95,
    baseSpeed: 10.6,
  },
  {
    id: 'hatchback',
    label: 'Compact Hatchback',
    url: '/models/hatchback.glb',
    circuitKind: 'OUTER',
    halfX: 0.99,
    frontZ: 1.99,
    rearZ: -1.99,
    lightY: 0.58,
    shadowWidth: 2.3,
    shadowLength: 4.4,
    baseSpeed: 11.6,
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
    x: -20.2,
    z: -18,
    yaw: 0.14,
    frontZ: 2.34,
    rearZ: -2.35,
    lightY: 0.52,
    shadowWidth: 2.45,
    shadowLength: 5.1,
  },
  {
    id: 'parked-casino-conv',
    url: '/models/casino_convertible.glb',
    x: -20.2,
    z: 0,
    yaw: 0.05,
    frontZ: 2.21,
    rearZ: -2.21,
    lightY: 0.54,
    shadowWidth: 2.3,
    shadowLength: 4.85,
  },
  {
    id: 'parked-wedge',
    url: '/models/wedge_coupe.glb',
    x: -20.2,
    z: 18,
    yaw: -0.12,
    frontZ: 2.23,
    rearZ: -2.21,
    lightY: 0.48,
    shadowWidth: 2.35,
    shadowLength: 4.85,
  },
  {
    id: 'parked-limo',
    url: '/models/stretch_limo.glb',
    x: 20.2,
    z: -18,
    yaw: Math.PI - 0.08,
    frontZ: 4.24,
    rearZ: -4.24,
    lightY: 0.62,
    shadowWidth: 2.55,
    shadowLength: 8.9,
  },
  {
    id: 'parked-muscle',
    url: '/models/muscle_car.glb',
    x: 20.2,
    z: 0,
    yaw: Math.PI + 0.06,
    frontZ: 2.36,
    rearZ: -2.36,
    lightY: 0.56,
    shadowWidth: 2.35,
    shadowLength: 5.1,
  },
  {
    id: 'parked-police',
    url: '/models/police_cruiser.glb',
    x: 20.2,
    z: 18,
    yaw: Math.PI + 0.15,
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
  const citizenStrideRigs = useRef<Array<HumanoidStrideRig | null>>(
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
  const botHitFlashRefs = useRef<Array<THREE.Mesh | null>>([]);
  const botMuzzleFlashRefs = useRef<Array<THREE.Group | null>>([]);
  const botStrideRigs = useRef<Array<HumanoidStrideRig | null>>(
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
    const prepareSmoothPbrHumanClone = (
      gltf: GLTF,
      isMichelle: boolean,
      palette: HumanOutfitPalette
    ): { clone: THREE.Object3D; strideRig: HumanoidStrideRig } => {
      const clone = SkeletonUtils.clone(gltf.scene);

      let leftUpLeg: THREE.Object3D | null = null;
      let rightUpLeg: THREE.Object3D | null = null;
      let leftLeg: THREE.Object3D | null = null;
      let rightLeg: THREE.Object3D | null = null;
      let leftArm: THREE.Object3D | null = null;
      let rightArm: THREE.Object3D | null = null;
      let spine: THREE.Object3D | null = null;

      clone.traverse((child) => {
        const name = child.name || '';

        // Discover skeletal stride bones on both ReadyPlayerMe and Mixamo Michelle rigs
        if (name === 'LeftUpLeg' || name.endsWith('LeftUpLeg')) leftUpLeg = child;
        else if (name === 'RightUpLeg' || name.endsWith('RightUpLeg')) rightUpLeg = child;
        else if (name === 'LeftLeg' || name.endsWith('LeftLeg')) leftLeg = child;
        else if (name === 'RightLeg' || name.endsWith('RightLeg')) rightLeg = child;
        else if (name === 'LeftArm' || name.endsWith('LeftArm')) leftArm = child;
        else if (name === 'RightArm' || name.endsWith('RightArm')) rightArm = child;
        else if (name === 'Spine' || name.endsWith(':Spine') || name === 'mixamorigSpine') {
          spine = child;
        }

        if ((child as THREE.Mesh).isMesh) {
          const mesh = child as THREE.Mesh;
          mesh.castShadow = false;
          mesh.receiveShadow = false;
          mesh.frustumCulled = false;

          // Clone original MeshStandardMaterial so all 19 PBR normal/roughness/albedo maps remain intact
          const origMat = Array.isArray(mesh.material) ? mesh.material[0] : mesh.material;
          if (origMat && (origMat as THREE.MeshStandardMaterial).isMeshStandardMaterial) {
            const mat = (origMat as THREE.MeshStandardMaterial).clone();
            const matName = mat.name || '';

            if (name === 'Wolf3D_Outfit_Top' || matName === 'Wolf3D_Outfit_Top') {
              mat.color.set(palette.topColor);
              mat.roughness = palette.topRoughness;
              mat.metalness = palette.topMetalness;
            } else if (name === 'Wolf3D_Outfit_Bottom' || matName === 'Wolf3D_Outfit_Bottom') {
              mat.color.set(palette.bottomColor);
              mat.roughness = 0.52;
              mat.metalness = 0.08;
            } else if (
              name === 'Wolf3D_Outfit_Footwear' ||
              matName === 'Wolf3D_Outfit_Footwear'
            ) {
              mat.color.set(palette.footwearColor);
              mat.roughness = 0.36;
              mat.metalness = 0.15;
            } else if (
              name === 'Wolf3D_Head' ||
              name === 'Wolf3D_Body' ||
              matName === 'Wolf3D_Skin' ||
              matName === 'Wolf3D_Body'
            ) {
              mat.color.set(palette.skinTint);
            } else if (
              name === 'Wolf3D_Headwear' ||
              name === 'Mesh' ||
              matName === 'Wolf3D_Headwear'
            ) {
              if (!isMichelle) {
                mesh.visible = palette.headwearOn;
                mat.color.set(palette.headwearColor);
                mat.roughness = 0.42;
              }
            } else if (name === 'Wolf3D_Beard' || matName === 'Wolf3D_Beard') {
              mesh.visible = palette.beardOn;
              mat.color.set(palette.beardColor);
            } else if (isMichelle) {
              // Preserve Michelle's 4 PBR textures with subtle warm/cool couturier tinting
              mat.color.set('#ffffff').lerp(new THREE.Color(palette.topColor), 0.14);
              mat.roughness = 0.48;
            }

            mesh.material = mat;
          }
        }
      });

      // Capture rest-pose quaternions (relax Michelle's T-pose arms down to her sides first)
      const armRelaxRad = isMichelle ? 1.08 : 0;
      const strideRig: HumanoidStrideRig = {
        leftUpLeg: captureRestQuat(leftUpLeg),
        rightUpLeg: captureRestQuat(rightUpLeg),
        leftLeg: captureRestQuat(leftLeg),
        rightLeg: captureRestQuat(rightLeg),
        leftArm: captureRestQuat(leftArm, armRelaxRad),
        rightArm: captureRestQuat(rightArm, armRelaxRad),
        spine: captureRestQuat(spine),
      };

      return { clone, strideRig };
    };

    // 1. Populate 16 Smooth-Shaded High-Res PBR Citizens (~70% ReadyPlayerMe, ~30% Michelle)
    pedestrians.forEach((ped, idx) => {
      const isMichelle = ped.modelUrl.includes('michelle');
      loadCachedGLTF(ped.modelUrl)
        .then((gltf) => {
          if (disposed) return;
          const mount = citizenModelMountRefs.current[idx];
          if (!mount) return;
          while (mount.children.length > 0) {
            mount.remove(mount.children[0]);
          }
          const palette = getHumanPalette(ped.paletteIndex, false);
          const { clone, strideRig } = prepareSmoothPbrHumanClone(gltf, isMichelle, palette);
          mount.add(clone);
          citizenStrideRigs.current[idx] = strideRig;
        })
        .catch(() => {});
    });

    // 2. Populate 8 Armed Battle Royale Combat Bots with Smooth PBR Humans + 3D GLB Weapons
    simState.botTargets.forEach((bot, idx) => {
      // ~75% ReadyPlayerMe (6 bots) and ~25% Michelle (2 bots)
      const botHumanUrl = idx % 4 === 2 ? '/models/michelle.glb' : '/models/readyplayer_me.glb';
      const isMichelle = botHumanUrl.includes('michelle');

      loadCachedGLTF(botHumanUrl)
        .then((gltf) => {
          if (disposed) return;
          const mount = botModelMountRefs.current[idx];
          if (!mount) return;
          while (mount.children.length > 0) {
            mount.remove(mount.children[0]);
          }
          const palette = getHumanPalette(16 + idx, true);
          const { clone, strideRig } = prepareSmoothPbrHumanClone(gltf, isMichelle, palette);
          mount.add(clone);
          botStrideRigs.current[idx] = strideRig;

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

    // ------------------------------------------------------------------------
    // 1. Update 16 Smooth-Shaded PBR Human Citizens (Skeletal Stride + Sidewalks/Crosswalks/Dodge)
    // ------------------------------------------------------------------------
    for (let i = 0; i < PED_COUNT; i++) {
      const p = pedestrians[i];
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
        citizenGroup.rotation.set(0, p.yaw, 0);
      }

      // Smooth humanoid skeletal stride animation when within 85m of camera
      const rig = citizenStrideRigs.current[i];
      const dxCamCit = camPos.x - p.x;
      const dzCamCit = camPos.z - p.z;
      if (rig && dxCamCit * dxCamCit + dzCamCit * dzCamCit < 85 * 85) {
        updateHumanoidStride(rig, p.phase, 1.0 + p.dodgeAlert * 0.35);
      }
    }

    // ------------------------------------------------------------------------
    // 2. Update 8 Armed Battle Royale Combat Bots (Parachute Sky-Drop, Patrol, Muzzle Flash & HP/Shield Bars)
    // ------------------------------------------------------------------------
    for (let i = 0; i < simState.botTargets.length; i++) {
      const bot = simState.botTargets[i];
      const botGroup = botGroupRefs.current[i];
      const parachuteGroup = botParachuteRefs.current[i];
      const hudBillboard = botHudBillboardRefs.current[i];
      const hpBar = botHpBarRefs.current[i];
      const shieldBar = botShieldBarRefs.current[i];
      const hitFlashMesh = botHitFlashRefs.current[i];
      const muzzleFlashGroup = botMuzzleFlashRefs.current[i];
      const botRig = botStrideRigs.current[i];

      if (!bot.alive) {
        if (botGroup) botGroup.visible = false;
        bot.respawnTimer -= dt;
        if (bot.respawnTimer <= 0) {
          bot.alive = true;
          bot.hp = bot.maxHp;
          bot.shield = bot.maxShield;
          bot.parachuting = true;
          bot.parachuteY = 65;
          bot.x = bot.homeX;
          bot.z = bot.homeZ;
          bot.y = 65;
          bot.hitFlash = 0;
          bot.muzzleFlash = 0;
        }
        continue;
      }

      if (botGroup) botGroup.visible = true;

      const groundY = getTerrainHeight(bot.x, bot.z);

      if (bot.parachuting) {
        bot.parachuteY -= 9.5 * dt;
        bot.y = bot.parachuteY;
        bot.x = bot.homeX + Math.sin(elapsed * 1.4 + i) * 1.6;
        bot.z = bot.homeZ + Math.cos(elapsed * 1.2 + i) * 1.6;
        bot.yaw = Math.sin(elapsed * 0.9 + i) * 0.35;

        if (bot.y <= groundY + 0.1) {
          bot.parachuting = false;
          bot.y = groundY;
          bot.parachuteY = groundY;
        }
      } else {
        // Tactical 9m radius patrol around (bot.homeX, bot.homeZ)
        const patrolAngle = elapsed * 0.55 + i * 1.15;
        const targetX = bot.homeX + Math.cos(patrolAngle) * 9.0;
        const targetZ = bot.homeZ + Math.sin(patrolAngle * 0.85) * 9.0;

        const dxPatrol = targetX - bot.x;
        const dzPatrol = targetZ - bot.z;
        const patrolDist = Math.hypot(dxPatrol, dzPatrol);
        if (patrolDist > 0.05) {
          const moveStep = Math.min(patrolDist, 2.35 * dt);
          bot.x += (dxPatrol / patrolDist) * moveStep;
          bot.z += (dzPatrol / patrolDist) * moveStep;
        }
        bot.y = getTerrainHeight(bot.x, bot.z);

        // Check distance to player for combat engagement within 42m
        const dxPlayer = threatX - bot.x;
        const dzPlayer = threatZ - bot.z;
        const distToPlayer = Math.hypot(dxPlayer, dzPlayer);

        if (distToPlayer < 42.0) {
          bot.yaw = Math.atan2(dxPlayer, dzPlayer);
          const fireCycle = (elapsed * 2.4 + i * 0.73) % 1.0;
          if (fireCycle < 0.14 && bot.muzzleFlash <= 0) {
            bot.muzzleFlash = 0.12;
          }
        } else if (patrolDist > 0.05) {
          bot.yaw = Math.atan2(dxPatrol, dzPatrol);
        }
      }

      if (bot.hitFlash > 0) {
        bot.hitFlash = Math.max(0, bot.hitFlash - dt * 4.5);
      }
      if (bot.muzzleFlash > 0) {
        bot.muzzleFlash = Math.max(0, bot.muzzleFlash - dt);
      }

      if (botGroup) {
        botGroup.position.set(bot.x, bot.y, bot.z);
        botGroup.rotation.set(0, bot.yaw, 0);
      }

      if (parachuteGroup) {
        parachuteGroup.visible = bot.parachuting;
      }

      if (muzzleFlashGroup) {
        muzzleFlashGroup.visible = bot.muzzleFlash > 0 && !bot.parachuting;
      }

      if (hitFlashMesh) {
        hitFlashMesh.visible = bot.hitFlash > 0;
      }

      // Scale overhead HP (#22c55e) & Shield (#38bdf8) bars
      if (hpBar) {
        const hpRatio = THREE.MathUtils.clamp(bot.hp / Math.max(1, bot.maxHp), 0.001, 1);
        hpBar.scale.x = hpRatio;
        hpBar.position.x = -0.44 * (1 - hpRatio);
      }
      if (shieldBar) {
        const shieldRatio = THREE.MathUtils.clamp(
          bot.shield / Math.max(1, bot.maxShield),
          0.001,
          1
        );
        shieldBar.scale.x = shieldRatio;
        shieldBar.position.x = -0.44 * (1 - shieldRatio);
      }

      // Billboard the overhead HP/Shield bar toward the active camera
      if (hudBillboard) {
        const camYaw = Math.atan2(camPos.x - bot.x, camPos.z - bot.z);
        hudBillboard.rotation.y = camYaw - bot.yaw;
      }

      const dxCamBot = camPos.x - bot.x;
      const dzCamBot = camPos.z - bot.z;
      if (botRig && dxCamBot * dxCamBot + dzCamBot * dzCamBot < 85 * 85) {
        const botPhase = elapsed * (bot.parachuting ? 2.5 : 5.8) + i * 1.3;
        updateHumanoidStride(botRig, botPhase, bot.parachuting ? 0.35 : 0.95);
      }
    }

    // ------------------------------------------------------------------------
    // 3. Update 12 Real 3D GLB Traffic Vehicles (Proximity Braking + Wheel Rotation + Minimap Sync)
    // ------------------------------------------------------------------------
    for (let i = 0; i < vehicles.length; i++) {
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
        minGap < 20 ? Math.min(v.baseSpeed, Math.max(0, leadSpeed * 0.9)) : v.baseSpeed;
      if (minGap < 10.5) {
        targetSpeed = 0;
      }

      let blockedByObstacle = minGap < 12.5;
      const checkObstacle = (ox: number, oz: number, lateralHalfWidth: number) => {
        const dx = ox - _vecA.x;
        const dz = oz - _vecA.z;
        const forwardDist = dx * fwdX + dz * fwdZ;
        const lateralDist = Math.abs(dx * fwdZ - dz * fwdX);
        if (forwardDist > -1.0 && forwardDist < 12.0 && lateralDist < lateralHalfWidth) {
          blockedByObstacle = true;
          targetSpeed = 0;
        }
      };

      checkObstacle(simState.carPos.x, simState.carPos.z, 4.2);
      checkObstacle(simState.playerPos.x, simState.playerPos.z, 3.8);

      for (let pIdx = 0; pIdx < pedestrians.length; pIdx++) {
        const cwPed = pedestrians[pIdx];
        if (cwPed && cwPed.kind === 'CROSSWALK') {
          checkObstacle(cwPed.x, cwPed.z, 3.2);
        }
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

          {/* Red Hit Flash Ground Ring */}
          <mesh
            ref={(el) => {
              botHitFlashRefs.current[i] = el;
            }}
            geometry={botHitFlashRingGeo}
            material={botHitFlashMat}
            position={[0, 0.06, 0]}
            visible={false}
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
