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

/**
 * Analytical Metropolis Island Heightmap:
 * - Smooth, flat Central Metropolis Urban Grid plateau (y ≈ 3.2m) with ZERO bumps on any avenue
 * - Venetian Grand Canal carve-out on East side (x > 72 && x < 290 around z = -95)
 * - Airport runway flat pad on West-South (x > -210 && x < -45, z > 135 && z < 175)
 * - Gentle coastal beaches beyond r > 195m sloping into deep ocean beyond r > 265m
 */
function getMainIslandHeight(x: number, z: number): number {
  const dist = Math.hypot(x, z);

  // Venetian Canal carve-out (east waterway connecting to ocean, clear of Grand Central Ave)
  const canalMask =
    Math.exp(-Math.pow((z + 95) / 20, 2)) *
    (x > 72 && x < 290 ? smoothstep(72, 82, x) : 0);
  if (canalMask > 0.42) {
    return -3.2 * canalMask;
  }

  // Airport runway flat pad
  if (x > -210 && x < -45 && z > 135 && z < 175) {
    return 1.8;
  }

  // Deep ocean beyond island perimeter
  const islandRadius = 265;
  const normalized = dist / islandRadius;
  if (normalized > 1.15) return -6.5;

  // Road & Avenue mask (strictly 0 hills on any road or avenue)
  const onRoadCorridor =
    (Math.abs(x) < 28 && z > -228 && z < 198) ||
    (Math.abs(z) < 18 && Math.abs(x) < 160) ||
    (Math.abs(z + 120) < 16 && Math.abs(x) < 150) ||
    (Math.abs(z - 80) < 16 && Math.abs(x) < 160);

  // Central Metropolis Urban Grid mask (|x| < 135 && |z| < 165)
  const inUrbanGrid = Math.abs(x) < 135 && Math.abs(z) < 165;

  // Smooth flat city plateau at y = 3.2m inside r <= 195m, sloping to coastal beach & ocean
  let base = 3.2;
  if (dist > 195) {
    const coastT = smoothstep(195, 244, dist);
    const oceanT = smoothstep(244, 295, dist);
    base = 3.2 * (1 - coastT) - 6.5 * oceanT;
  }

  // Keep Golden Gate north approach avenue level at 3.2m up to z = -222
  if (Math.abs(x) < 26 && z >= -224 && z <= 195) {
    return Math.max(base, 3.2 * (1 - smoothstep(218, 242, Math.abs(z))));
  }

  if (inUrbanGrid || onRoadCorridor) {
    return base;
  }

  // Subtle outer coastal terrain relief outside the urban grid & off all roads
  const outerFactor =
    smoothstep(135, 165, Math.max(Math.abs(x), Math.abs(z) - 25)) *
    (1 - smoothstep(205, 240, dist));
  const gentleDunes =
    (Math.sin(x * 0.02) * Math.cos(z * 0.022) * 1.4 +
      Math.sin((x + z) * 0.035) * 0.6) *
    outerFactor;

  return base + gentleDunes;
}

export const NORTH_BAY_BRIDGE = {
  approach: -205,
  landing: -402,
  gate: -397,
  halfWidth: 16,
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
  if (z > -352) return 3.25 + 6.15 * smoothstep(0, 64, distance);
  const grade = getIslandTwoHeight(0, z) + 0.06;
  return THREE.MathUtils.lerp(9.4, grade, smoothstep(352, -NORTH_BAY_BRIDGE.landing, -z));
}

export function getTravelHeight(x: number, z: number, feetY = Infinity): number {
  const terrain = getTerrainHeight(x, z);
  if (z > NORTH_BAY_BRIDGE.approach || z < NORTH_BAY_BRIDGE.landing || Math.abs(x) > NORTH_BAY_BRIDGE.halfWidth + 2) {
    return terrain;
  }
  const deck = getBridgeHeight(z);
  return feetY >= deck - 1.4 ? Math.max(terrain, deck) : terrain;
}

export function isConstructionClosed(x: number, z: number): boolean {
  if (z >= -350) return false;
  if (Math.abs(x) < NORTH_BAY_BRIDGE.halfWidth + 2 && z >= NORTH_BAY_BRIDGE.gate) return false;
  return islandTwoRadius(x, z) < 1.025;
}

export function isWaterAt(x: number, z: number, tideOffset = 0): boolean {
  return getTerrainHeight(x, z) < tideOffset;
}
