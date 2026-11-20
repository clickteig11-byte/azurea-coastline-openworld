import * as THREE from 'three';
import { getTravelHeight } from './worldMath';

const racingLine = [
  [-8, 65], [-8, 20], [-8, -47], [-8, -102], [-5.6, -117], [2.3, -122],
  [8, -113], [8, -66], [8, -12], [8, 47], [8, 75], [4.2, 85], [-4.9, 85], [-8, 76],
];
const circuit = new THREE.CatmullRomCurve3(racingLine.map(([x, z]) => new THREE.Vector3(x, 0, z)), true, 'centripetal');
circuit.arcLengthDivisions = 520;
export const GRAND_PRIX_LENGTH = circuit.getLength();
export const GRAND_PRIX_START = [-8, 65] as const;

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

const checkpointNames = [
  'Grand Central Straight', 'Midtown Split', 'North Bay Hairpin', 'Marina Straight',
  'Midtown Return', 'Harbor Boulevard', 'South Hairpin', 'Start / Finish',
];
const checkpointFractions = [0.09, 0.23, 0.45, 0.57, 0.69, 0.83, 0.94, 0.995];
export const grandPrixGates = checkpointFractions.map((fraction, index) => {
  const point = new THREE.Vector3();
  const yaw = sampleGrandPrix(GRAND_PRIX_LENGTH * fraction, point);
  return { id: 'gp-' + (index + 1), name: checkpointNames[index], position: point.toArray(), yaw };
});

export const GRAND_PRIX_CLOSURES = {
  north: -129,
  south: 92,
  curb: 15.65,
  medianNorth: -106,
  medianSouth: 70,
};
