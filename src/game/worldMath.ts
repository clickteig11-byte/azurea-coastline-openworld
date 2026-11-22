import * as THREE from 'three';

export const COAST_SUN = new THREE.Vector3(-0.61, 0.54, -0.58).normalize();

export type VehicleMode = 'FOOT' | 'CAR' | 'BOAT' | 'PLANE';
export type RouletteOutcome = 'IDLE' | 'RED' | 'BLACK' | 'GREEN_00';

export interface LandmarkDef {
  id: string;
  name: string;
  subtitle: string;
  position: [number, number, number];
  color: string;
}

export const LANDMARKS: LandmarkDef[] = [
  {
    id: 'empire',
    name: 'EMPIRE STATE BUILDING',
    subtitle: 'New York Midtown Spire',
    position: [-52, 0, -28],
    color: '#38bdf8',
  },
  {
    id: 'goldengate',
    name: 'GOLDEN GATE BRIDGE',
    subtitle: 'San Francisco North Bay Span',
    position: [0, 0, -286],
    color: '#f97316',
  },
  {
    id: 'bigben',
    name: 'BIG BEN CLOCK TOWER',
    subtitle: 'London Westminster Belfry',
    position: [-52, 0, -88],
    color: '#fbbf24',
  },
  {
    id: 'eiffel',
    name: 'EIFFEL TOWER',
    subtitle: 'Paris Champ de Mars Spire',
    position: [95, 0, 35],
    color: '#f43f5e',
  },
  {
    id: 'burj',
    name: 'BURJ KHALIFA',
    subtitle: 'Dubai Megatall Needle Spire',
    position: [54, 0, -148],
    color: '#22d3ee',
  },
  {
    id: 'colosseum',
    name: 'THE COLOSSEUM',
    subtitle: 'Rome Flavian Amphitheatre',
    position: [-105, 0, 45],
    color: '#f59e0b',
  },
  {
    id: 'sydney',
    name: 'SYDNEY OPERA HOUSE',
    subtitle: 'Harbor Ceramic Sail Shells',
    position: [148, 0, 108],
    color: '#e2e8f0',
  },
  {
    id: 'tokyo',
    name: 'TOKYO TOWER',
    subtitle: 'Shibuya Neon Lattice Spire',
    position: [52, 0, -28],
    color: '#ef4344',
  },
  {
    id: 'liberty',
    name: 'STATUE OF LIBERTY',
    subtitle: 'New York Harbor Star-Fort',
    position: [-158, 0, -145],
    color: '#34d399',
  },
  {
    id: 'redeemer',
    name: 'CHRIST THE REDEEMER',
    subtitle: 'Rio Corcovado Overlook',
    position: [58, 0, 148],
    color: '#a855f7',
  },
  {
    id: 'venice',
    name: 'RIALTO BRIDGE & CANAL',
    subtitle: 'Venice Grand Waterway',
    position: [135, 0, -95],
    color: '#06b6d4',
  },
  {
    id: 'giza',
    name: 'GREAT PYRAMID OF GIZA',
    subtitle: 'Cairo Ancient Monument',
    position: [-118, 0, -28],
    color: '#eab308',
  },
];

export function getWaveHeight(x: number, z: number, t: number): number {
  let y = 0;
  y += 0.42 * Math.sin(0.11 * x + 1.25 * t);
  y += 0.24 * Math.sin(0.22 * (0.7 * x + 0.7 * z) + 1.8 * t);
  y += 0.14 * Math.sin(0.41 * (-0.4 * x + 0.9 * z) + 2.3 * t);
  return y;
}

function smoothstep(edge0: number, edge1: number, x: number): number {
  const t = Math.max(0, Math.min(1, (x - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
}

export const COAST_ROAD_HALF_WIDTH = 8.8;
const NORTH_BAY_APPROACH = -205;
const AIRPORT_CENTERLINE_ANGLE = -0.82;
const AIRPORT_BYPASS_WIDTH = 0.49;

export function coastRoadRadius(angle: number): number {
  const bearing = Math.abs(angle) <= Math.PI ? angle : Math.atan2(Math.sin(angle), Math.cos(angle));
  const airport = (bearing - AIRPORT_CENTERLINE_ANGLE) / AIRPORT_BYPASS_WIDTH;
  const north = Math.cos(angle);
  return 228 + 62 * Math.exp(-airport * airport) -
    (228 + NORTH_BAY_APPROACH) * Math.pow(Math.max(0, -north), 16);
}

export function coastBeachWidth(angle: number): number {
  return 41 + 6 * Math.cos(angle * 3) - 4 * Math.sin(angle * 5);
}

export function coastRoadOffset(x: number, z: number): number {
  return Math.hypot(x, z) - coastRoadRadius(Math.atan2(x, z));
}

export function coastRoadHeight(x: number, z: number): number {
  const bridge = x > 70 ? 3.5 * (1 - smoothstep(5, 43, Math.abs(z + 95))) : 0;
  return 3.25 + bridge;
}

export const COAST_CONNECTORS = [
  { z: 0, halfWidth: 11, cityEnd: 150 },
  { z: 80, halfWidth: 10, cityEnd: 145 },
  { z: -120, halfWidth: 10, cityEnd: 140 },
];

export function coastJunction(x: number, z: number, clearance = 0): boolean {
  return (Math.abs(x) <= 16 + clearance && Math.abs(z) > 175) ||
    COAST_CONNECTORS.some((road) => Math.abs(z - road.z) < road.halfWidth + clearance);
}

export function coastConnectorEnd(z: number, side: number, offset = 0): number {
  let inner = 0;
  let outer = 310;
  for (let i = 0; i < 20; i++) {
    const middle = (inner + outer) / 2;
    if (coastRoadOffset(middle * side, z) > offset) outer = middle;
    else inner = middle;
  }
  return (inner + outer) / 2 * side;
}

export function coastConnectorHeight(x: number, z: number): number {
  return 3.25 + (coastRoadHeight(x, z) - 3.25) * smoothstep(-36, -5, coastRoadOffset(x, z));
}

export const STUNT_RAMPS = [
  { x: 29, z: 202, yaw: 0.14, length: 14, width: 7, height: 2.7 },
  { x: -238, z: -64, yaw: -Math.PI / 2, length: 13, width: 6, height: 2.4 },
];

export function stuntRampHeight(x: number, z: number, feetY: number): number {
  for (const ramp of STUNT_RAMPS) {
    const sx = x - ramp.x;
    const sz = z - ramp.z;
    const sin = Math.sin(ramp.yaw);
    const cos = Math.cos(ramp.yaw);
    const forward = sx * sin + sz * cos;
    const across = sx * cos - sz * sin;
    if (Math.abs(across) > ramp.width * 0.5 || forward < 0 || forward > ramp.length) continue;
    const start = getTerrainHeight(ramp.x, ramp.z);
    const y = start + ramp.height * (forward / ramp.length) ** 1.6;
    if (feetY >= y - 1) return y;
  }
  return -Infinity;
}

function getMainIslandHeight(x: number, z: number): number {
  const radius = Math.hypot(x, z);
  if (radius > 389) return -6.5;
  let ground = 3.2;
  if (radius > 210) {
    const angle = Math.atan2(x, z);
    const offset = radius - coastRoadRadius(angle);
    const beach = coastBeachWidth(angle);
    ground *= 1 - smoothstep(12, beach + 3, offset);
    ground -= 6.5 * smoothstep(beach - 5, beach + 50, offset);
  }
  const canal = x > 69 && Math.abs(z + 95) < 38 ?
    Math.exp(-(((z + 95) / 15.25) ** 4)) * smoothstep(69, 84, x) : 0;
  const runway = smoothstep(-223, -210, x) * (1 - smoothstep(-45, -34, x)) *
    smoothstep(126, 135, z) * (1 - smoothstep(175, 184, z));
  return THREE.MathUtils.lerp(THREE.MathUtils.lerp(ground, Math.min(-3.2, ground), canal), 1.8, runway);
}

export const NORTH_BAY_BRIDGE = {
  approach: NORTH_BAY_APPROACH,
  landing: -402,
  gate: -397,
  halfWidth: 16,
  railsBegin: NORTH_BAY_APPROACH - 12,
  piers: [-244, -266, -315, -348, -374],
};

export const CONSTRUCTION_ISLAND = { z: -469, radiusX: 105, radiusZ: 116 };

export function islandTwoRadius(x: number, z: number): number {
  const nx = x / CONSTRUCTION_ISLAND.radiusX;
  const nz = (z - CONSTRUCTION_ISLAND.z) / CONSTRUCTION_ISLAND.radiusZ;
  const angle = Math.atan2(nx, nz);
  const coast = 1 + Math.sin(angle * 3) * 0.067 + Math.sin(angle * 5 + 0.6) * 0.035;
  return Math.hypot(nx, nz) / coast;
}

export function getIslandTwoHeight(x: number, z: number): number {
  const radius = islandTwoRadius(x, z);
  const coast = smoothstep(0.62, 1.02, radius);
  const shelf = smoothstep(0.88, 1.24, radius);
  const detail = (Math.sin(x * 0.08 + z * 0.038) * 0.6 + Math.cos(z * 0.085) * 0.35) *
    smoothstep(0.45, 0.7, radius) * (1 - coast);
  const spoilPiles = 2.2 * Math.exp(-(((x - 53) / 15) ** 2 + ((z + 524) / 11) ** 2)) +
    2.65 * Math.exp(-(((x + 49) / 15) ** 2 + ((z + 546) / 13) ** 2));
  return 4.6 * (1 - coast) - 6.5 * shelf + detail + spoilPiles;
}

export function getTerrainHeight(x: number, z: number): number {
  const main = getMainIslandHeight(x, z);
  return z < -325 ? Math.max(main, getIslandTwoHeight(x, z)) : main;
}

export function getBridgeHeight(z: number): number {
  const distance = NORTH_BAY_BRIDGE.approach - z;
  if (distance <= 0) return 3.25;
  if (z > -352) return 3.25 + 6.15 * smoothstep(12, 68, distance);
  const grade = getIslandTwoHeight(0, z) + 0.06;
  return THREE.MathUtils.lerp(9.4, grade, smoothstep(352, -NORTH_BAY_BRIDGE.landing, -z));
}

const travelSurfaces = new Set<(x: number, z: number, feetY: number) => number>();
export function registerTravelSurface(sample: (x: number, z: number, feetY: number) => number) {
  travelSurfaces.add(sample);
  return () => travelSurfaces.delete(sample);
}

export function getTravelHeight(x: number, z: number, feetY = Infinity): number {
  let surface = getTerrainHeight(x, z);
  const ramp = stuntRampHeight(x, z, feetY);
  if (ramp > surface) surface = ramp;
  if (z <= NORTH_BAY_BRIDGE.approach && z >= NORTH_BAY_BRIDGE.landing &&
      Math.abs(x) <= NORTH_BAY_BRIDGE.halfWidth) {
    const deck = getBridgeHeight(z);
    if (feetY >= deck - 1.35) surface = Math.max(surface, deck);
  }
  const offset = coastRoadOffset(x, z);
  if (Math.abs(offset) <= COAST_ROAD_HALF_WIDTH + 0.85) {
    const deck = coastRoadHeight(x, z);
    if (feetY >= deck - 1.1) surface = Math.max(surface, deck);
  }
  for (const road of COAST_CONNECTORS) {
    if (Math.abs(z - road.z) <= road.halfWidth && Math.abs(x) >= road.cityEnd - 0.5 && offset < 0) {
      const deck = coastConnectorHeight(x, z);
      if (feetY >= deck - 1.1) surface = Math.max(surface, deck);
    }
  }
  for (const sample of travelSurfaces) surface = Math.max(surface, sample(x, z, feetY));
  return surface;
}

export function isConstructionClosed(x: number, z: number): boolean {
  if (z >= -350) return false;
  if (Math.abs(x) < NORTH_BAY_BRIDGE.halfWidth + 2 && z >= NORTH_BAY_BRIDGE.gate) return false;
  return islandTwoRadius(x, z) < 1.025;
}

export function isWaterAt(x: number, z: number, tideOffset = 0): boolean {
  return getTerrainHeight(x, z) < tideOffset;
}
