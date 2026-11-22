import * as THREE from 'three';

export function surfaceStep(y: number, velocity: number, support: number, lastSupport: number, dt: number) {
  const grounded = Math.abs(y - lastSupport) <= 0.055;
  const grade = (support - lastSupport) / Math.max(dt, 0.001);
  const fall = Math.max(-56, velocity - 18 * dt);
  const predicted = y + (velocity + fall) * dt * 0.5;
  // On a crest, preserve the velocity carried up the ramp once the ground falls away.
  if (predicted > support + 0.035 && (!grounded || grade < velocity - 18 * dt - 0.35)) {
    return { y: predicted, velocity: fall, grounded: false, impact: 0 };
  }
  return { y: support, velocity: grounded ? THREE.MathUtils.clamp(grade, -27, 23) : 0,
    grounded: true, impact: grounded ? 0 : Math.max(0, -fall + Math.max(0, grade)) };
}

export function suspensionStep(offset: number, velocity: number, dt: number) {
  const spring = 145;
  const damping = 10.7;
  velocity += (-offset * spring - velocity * damping) * dt;
  return { offset: THREE.MathUtils.clamp(offset + velocity * dt, -0.32, 0.25), velocity };
}

export function shoreReturn(x: number, z: number, yaw: number, start: number, end: number) {
  const radius = Math.hypot(x, z);
  const blend = THREE.MathUtils.smoothstep(radius, start, end);
  if (blend <= 0) return { turn: 0, x: 0, z: 0 };
  const inward = Math.atan2(-x, -z);
  const delta = Math.atan2(Math.sin(inward - yaw), Math.cos(inward - yaw));
  return { turn: delta * blend, x: -x / radius * blend, z: -z / radius * blend };
}

export interface Tumble {
  elapsed: number;
  vx: number;
  vy: number;
  vz: number;
  roll: number;
  pitch: number;
  side: number;
  strength: number;
  grounded: boolean;
  bounces: number;
}

export function launchTumble(vx: number, vz: number, strength: number, side: number): Tumble {
  return { elapsed: 0, vx, vy: 1.75 + strength * 5.2, vz, roll: 0, pitch: 0,
    side, strength, grounded: false, bounces: 0 };
}

export function stepTumble(fall: Tumble, y: number, ground: number, dt: number) {
  fall.elapsed += dt;
  fall.vy -= 22 * dt;
  let nextY = y + fall.vy * dt;
  let impulse = 0;
  if (nextY <= ground) {
    nextY = ground;
    if (!fall.grounded) {
      impulse = -fall.vy;
      fall.bounces++;
      fall.vy = fall.bounces < 3 && impulse > 2.2 ? impulse * 0.31 : 0;
    } else fall.vy = 0;
    fall.grounded = fall.vy < 0.01;
  } else fall.grounded = false;
  const traction = Math.exp(-(fall.grounded ? 7.5 : 0.48) * dt);
  fall.vx *= traction;
  fall.vz *= traction;
  if (fall.grounded) {
    fall.pitch = THREE.MathUtils.damp(fall.pitch, -Math.PI / 2, 7, dt);
    fall.roll = THREE.MathUtils.damp(fall.roll, fall.side * 0.19, 4, dt);
  } else {
    fall.pitch -= (3.6 + 4.25 * fall.strength) * dt;
    fall.roll += fall.side * (1.7 + fall.strength * 2.9) * dt / Math.max(1, fall.bounces * 1.65);
  }
  return { y: nextY, impulse };
}

export function rearSlip(speed: number, sideways: number, yawRate: number, handbrake: boolean, grip: number, grounded: boolean, dt: number) {
  const rotation = yawRate * dt;
  const inertia = sideways * Math.cos(rotation) - speed * Math.sin(rotation);
  const traction = grounded ? (handbrake ? 1.55 : 6.7) * grip : 0.12;
  const lateral = THREE.MathUtils.damp(inertia, 0, traction, dt);
  return { lateral, angle: Math.atan2(lateral, Math.max(1.5, Math.abs(speed))) };
}
