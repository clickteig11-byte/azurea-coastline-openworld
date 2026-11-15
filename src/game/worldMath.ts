import * as THREE from 'three';

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
    id: 'sphere',
    name: 'THE SPHERE',
    subtitle: 'Roulette Storm Core',
    position: [0, 0, -45],
    color: '#38bdf8',
  },
  {
    id: 'luxor',
    name: 'LUXOR PYRAMID',
    subtitle: 'Obsidian Vault & Skybeam',
    position: [-115, 0, 85],
    color: '#f59e0b',
  },
  {
    id: 'eiffel',
    name: 'PARIS EIFFEL',
    subtitle: 'Iron Lattice Spire',
    position: [95, 0, 35],
    color: '#f43f5e',
  },
  {
    id: 'liberty',
    name: 'LADY LIBERTY',
    subtitle: 'Harbor Torch Beacon',
    position: [-155, 0, -145],
    color: '#34d399',
  },
  {
    id: 'venice',
    name: 'VENETIAN CANALS',
    subtitle: 'Rialto Jump & Boatway',
    position: [135, 0, -95],
    color: '#22d3ee',
  },
  {
    id: 'stratosphere',
    name: 'STRATOSPHERE',
    subtitle: '350m Sky-Jump Tower',
    position: [10, 0, -195],
    color: '#a855f7',
  },
];

export function getWaveHeight(x: number, z: number, t: number): number {
  let y = 0;
  y += 0.42 * Math.sin(0.11 * x + 1.25 * t);
  y += 0.24 * Math.sin(0.22 * (0.7 * x + 0.7 * z) + 1.8 * t);
  y += 0.14 * Math.sin(0.41 * (-0.4 * x + 0.9 * z) + 2.3 * t);
  return y;
}

/**
 * Analytical island heightmap:
 * - Central Vegas Strip plateau around (0, 0)
 * - Venetian canal cut on East side (x > 95, z around -95)
 * - Airport runway strip on West-South (x around -180.. -60, z around 155)
 * - Smooth sandy beaches & deep ocean beyond R ~ 270
 */
export function getTerrainHeight(x: number, z: number): number {
  const dist = Math.hypot(x, z);

  // Venetian Canal carve-out (east waterway connecting to ocean)
  const canalMask =
    Math.exp(-Math.pow((z + 95) / 22, 2)) *
    (x > 65 && x < 290 ? 1 : 0);
  if (canalMask > 0.48) {
    return -3.2 * canalMask;
  }

  // Airport runway flat pad
  if (x > -210 && x < -45 && z > 135 && z < 175) {
    return 1.8;
  }

  // Main island radial falloff
  const islandRadius = 265;
  const normalized = dist / islandRadius;
  if (normalized > 1.15) return -6.5;

  let base = Math.max(0, 1 - Math.pow(normalized, 2.4)) * 9.5;

  // Rolling desert/atoll dunes outside the central strip
  const stripMask = Math.exp(-Math.pow(x / 85, 2) - Math.pow(z / 130, 2));
  const hills =
    (Math.sin(x * 0.022) * Math.cos(z * 0.024) * 5.2 +
      Math.sin((x + z) * 0.045) * 2.1) *
    (1 - stripMask) *
    Math.max(0, 1 - normalized);

  // North Stratosphere plateau
  const northMesa = Math.exp(-Math.pow((x - 10) / 55, 2) - Math.pow((z + 195) / 48, 2)) * 12;

  const h = base + hills + northMesa - 1.2;
  return h;
}

export function isWaterAt(x: number, z: number, tideOffset = 0): boolean {
  return getTerrainHeight(x, z) < tideOffset;
}
