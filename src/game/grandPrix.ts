import * as THREE from 'three';
import { coastRoadRadius, getTravelHeight } from './worldMath';

export const GRAND_PRIX_START = [-7, 143] as const;

const racingLine: [number, number][] = [
  [...GRAND_PRIX_START], [-7, 117], [-7, 98], [-3, 88], [10, 81],
  [33, 80], [105, 80], [164, 80], [192, 80], [206, 80], [215, 75],
];
for (let angle = 1.27; angle < 6.17; angle += 0.065) {
  const radius = coastRoadRadius(angle) - 2.15;
  racingLine.push([Math.sin(angle) * radius, Math.cos(angle) * radius]);
}
racingLine.push([-24, 226], [-14, 222], [-8, 212], [-7, 192], [-7, 168]);

const circuit = new THREE.CatmullRomCurve3(
  racingLine.map(([x, z]) => new THREE.Vector3(x, 0, z)), true, 'centripetal',
);
circuit.arcLengthDivisions = 1800;
export const GRAND_PRIX_LENGTH = circuit.getLength();

const tangent = new THREE.Vector3();
export function sampleGrandPrix(distance: number, target: THREE.Vector3, lateral = 0) {
  const phase = THREE.MathUtils.euclideanModulo(distance, GRAND_PRIX_LENGTH) / GRAND_PRIX_LENGTH;
  circuit.getPointAt(phase, target);
  circuit.getTangentAt(phase, tangent);
  target.x += tangent.z * lateral;
  target.z -= tangent.x * lateral;
  target.y = getTravelHeight(target.x, target.z) + 0.085;
  return Math.atan2(tangent.x, tangent.z);
}

export const grandPrixGates = [
  ['Harbor Boulevard', 0.09], ['East Coast', 0.198], ['Canal Viaduct', 0.294],
  ['North Bay', 0.385], ['Northwest Bluffs', 0.465], ['West Coast', 0.577],
  ['Airfield Sweep', 0.71], ['South Promenade', 0.84], ['Start / Finish', 0],
].map(([name, fraction], index) => {
  const point = new THREE.Vector3();
  const yaw = sampleGrandPrix(GRAND_PRIX_LENGTH * Number(fraction), point);
  return { id: 'gp-' + (index + 1), name: String(name), position: point.toArray(), yaw, distance: GRAND_PRIX_LENGTH * Number(fraction) };
});

export function crossesRaceGate(
  gate: Pick<(typeof grandPrixGates)[number], 'position' | 'yaw'>, from: THREE.Vector3, to: THREE.Vector3,
) {
  const [x, y, z] = gate.position;
  const dx = Math.sin(gate.yaw);
  const dz = Math.cos(gate.yaw);
  const before = (from.x - x) * dx + (from.z - z) * dz;
  const after = (to.x - x) * dx + (to.z - z) * dz;
  if (before >= 0 || after < 0 || Math.abs(to.y - y) > 3.2) return false;
  const along = -before / (after - before);
  const crossX = THREE.MathUtils.lerp(from.x, to.x, along);
  const crossZ = THREE.MathUtils.lerp(from.z, to.z, along);
  return Math.abs((crossX - x) * dz - (crossZ - z) * dx) <= 11;
}

export const raceRivals = [
  { file: 'gt3_car', color: '#e8682c', pace: 38, grid: -9, lane: -2.5 },
  { file: 'wedge_coupe', color: '#4a9be0', pace: 37, grid: 0, lane: 4.25 },
  { file: 'muscle_car', color: '#dfc467', pace: 35, grid: -9, lane: 4.1 },
];

export function previewRaceDistance(seconds: number, index: number) {
  return seconds * 29 - 13 * index + Math.sin(seconds * 0.68 + index) * 2.4;
}

const raceSamples = circuit.getSpacedPoints(512);

export function nearestRaceProgress(position: THREE.Vector3, lap: number, checkpoint: number) {
  const previous = grandPrixGates[checkpoint - 1]?.distance ?? 0;
  const next = grandPrixGates[checkpoint]?.distance || GRAND_PRIX_LENGTH;
  const step = GRAND_PRIX_LENGTH / 512;
  let closest = Infinity;
  let along = previous;
  const maxIndex = Math.min(raceSamples.length - 1, Math.ceil(next / step));
  for (let i = Math.floor(previous / step); i <= maxIndex; i++) {
    const point = raceSamples[i];
    const distance = (point.x - position.x) ** 2 + (point.z - position.z) ** 2;
    if (distance < closest) {
      closest = distance;
      along = i * step;
    }
  }
  return GRAND_PRIX_LENGTH * lap + along;
}
