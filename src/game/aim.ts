import { Ray, Sphere, Vector3 } from 'three';

export const AIM_MODES = ['Off', 'Light Assist', 'Lock-On'] as const;
export const RETICLES = ['Classic Cross', 'Precision Dot', 'Tactical Circle', 'Dynamic Spread', 'Chevron'] as const;
export type AimMode = typeof AIM_MODES[number];
export type Reticle = typeof RETICLES[number];

export const aiming = {
  origin: new Vector3(), direction: new Vector3(0, 0, 1), ready: false,
  ads: false, thirdPerson: true, feedback: 0, spread: 0,
  pickSwing: 0, harvestPause: 0, impact: false,
};

const ray = new Ray();
const sphere = new Sphere();
const contact = new Vector3();
export function targetDistance(origin: Vector3, direction: Vector3, x: number, y: number, z: number) {
  ray.set(origin, direction);
  let closest = Infinity;
  for (const [height, radius] of [[0.43, 0.29], [0.87, 0.36], [1.25, 0.34], [1.62, 0.24]]) {
    sphere.center.set(x, y + height, z);
    sphere.radius = radius;
    if (ray.intersectSphere(sphere, contact)) closest = Math.min(closest, contact.distanceTo(origin));
  }
  return closest;
}

export const civilianTargets: {
  x: number; y: number; z: number;
  impact: (damage: number, direction: Vector3, point: Vector3) => void;
}[] = [];
