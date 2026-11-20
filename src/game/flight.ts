import * as THREE from 'three';

interface FixedWingInput {
  dt: number;
  speed: number;
  pitch: number;
  verticalSpeed: number;
  throttle: number;
  pitchCommand: number;
  takeoffPower: number;
  grounded: boolean;
  brake: boolean;
  boost: boolean;
  autoLevel: boolean;
  integrity: number;
  thrustSensitivity: number;
  steeringSensitivity: number;
  failing: boolean;
}

export function fixedWingStep(input: FixedWingInput) {
  const power = 0.37 + input.integrity * 0.0063;
  const effectiveThrottle = input.grounded ? input.takeoffPower : input.throttle;
  const targetSpeed = input.brake ? input.grounded ? 0 : 16 :
    input.boost ? 86 : (input.grounded ? 0 : 12) + effectiveThrottle * (input.grounded ? 57 : 63);
  const speed = THREE.MathUtils.damp(input.speed, targetSpeed * power * input.thrustSensitivity, input.brake ? 4.4 : 2.8, input.dt);
  const lift = THREE.MathUtils.smoothstep(speed, 11, 23);
  const nose = THREE.MathUtils.clamp(input.pitchCommand * 0.52 - (input.failing ? 0.12 : 0), -0.58, 0.62);
  const pitch = input.autoLevel || Math.abs(input.pitchCommand) > 0.02 || input.failing
    ? THREE.MathUtils.damp(input.pitch, input.grounded ? nose * lift : nose, 5.3 * input.steeringSensitivity, input.dt)
    : input.pitch;
  const sink = input.grounded ? 0 : (1 - lift) * 4.2;
  const climb = Math.sin(pitch) * speed * (input.grounded ? lift : 1) - sink - (input.failing ? 2.3 : 0);
  const verticalSpeed = THREE.MathUtils.damp(input.verticalSpeed, climb, 7.1, input.dt);
  return { speed, pitch, verticalSpeed };
}
