import * as THREE from 'three';

export interface VehicleSweep {
  start: THREE.Vector3;
  end: THREE.Vector3;
  speed: number;
  yaw: number;
  travel: number;
  tick: number;
}

export function pedestrianContact(sweep: VehicleSweep, x: number, y: number, z: number) {
  const speed = Math.abs(sweep.speed);
  if (speed < 2.7 || sweep.travel < 0.02 || Math.abs(y - sweep.end.y) > 1.15) return null;
  const sign = Math.sign(sweep.speed);
  const fx = Math.sin(sweep.yaw) * sign;
  const fz = Math.cos(sweep.yaw) * sign;
  const sx = sweep.start.x + fx * 0.76;
  const sz = sweep.start.z + fz * 0.76;
  const vx = sweep.end.x + fx * 2.15 - sx;
  const vz = sweep.end.z + fz * 2.15 - sz;
  const fraction = THREE.MathUtils.clamp(((x - sx) * vx + (z - sz) * vz) / Math.max(0.001, vx * vx + vz * vz), 0, 1);
  const sideX = x - (sx + vx * fraction);
  const sideZ = z - (sz + vz * fraction);
  if (Math.hypot(sideX, sideZ) > 1.38) return null;
  const severity = THREE.MathUtils.clamp((speed - 2.7) / 20, 0, 1);
  const side = Math.sign(sideX * fz - sideZ * fx) || 1;
  return {
    damage: Math.round(15 + severity * 92),
    severity,
    travelX: fx * (1 + severity * 5.5) + fz * side * (1.15 + severity * 2.1),
    travelZ: fz * (1 + severity * 5.5) - fx * side * (1.15 + severity * 2.1),
    side,
  };
}
