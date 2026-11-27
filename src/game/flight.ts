import * as THREE from 'three';

interface FixedWingInput {
  dt: number;
  speed: number;
  pitch: number;
  bank: number;
  verticalSpeed: number;
  throttle: number;
  pitchCommand: number;
  bankCommand: number;
  takeoffPower: number;
  grounded: boolean;
  brake: boolean;
  boost: boolean;
  autoLevel: boolean;
  integrity: number;
  wingHealth: number;
  thrustSensitivity: number;
  steeringSensitivity: number;
  failing: boolean;
}

const gravity = 12.5;
const trim = THREE.MathUtils.clamp;

export function fixedWingStep(input: FixedWingInput) {
  const { dt, grounded, brake } = input;
  const wing = Math.max(0.44, input.wingHealth);
  const throttle = trim(grounded ? input.takeoffPower : input.throttle, 0, 1);
  const power = 0.31 + input.integrity * 0.0069;
  const path = grounded ? 0 : Math.atan2(input.verticalSpeed, Math.max(10, input.speed));
  const thrust = brake ? 0 : (input.boost ? 35 : 25) * throttle * power * input.thrustSensitivity;
  const inducedDrag = 0.5 + Math.abs(input.bank) * 1.3 + Math.abs(input.pitch - path) * 2;
  const speed = trim(input.speed + (thrust - inducedDrag - input.speed ** 2 * 0.0048 -
    gravity * Math.sin(path) - (grounded ? brake ? 22 : 1.7 : brake ? 4.4 : 0)) * dt, 0, 88);

  const authority = THREE.MathUtils.smoothstep(speed, 9, 32);
  const bank = THREE.MathUtils.damp(input.bank, input.bankCommand * (grounded ? 0.095 : 0.73) *
    (0.57 + 0.43 * authority), 4 * input.steeringSensitivity, dt);
  const pressure = (speed / 24) ** 2 * wing;
  const cruiseAngle = trim((1 / Math.max(0.65, pressure * Math.cos(bank)) - 0.12) / 3.4, -0.04, 0.126);
  const nose = trim(input.pitchCommand * (0.25 + 0.36 * authority) - (input.failing ? 0.105 : 0), -0.58, 0.64);
  const target = grounded ? Math.max(0, nose) * authority : cruiseAngle + nose;
  const pitch = input.autoLevel || Math.abs(input.pitchCommand) > 0.015 || grounded || input.failing || speed < 20
    ? THREE.MathUtils.damp(input.pitch, target - (grounded ? 0 : (1 - authority) * 0.19), 4.2 * input.steeringSensitivity, dt)
    : input.pitch;

  const angleOfAttack = pitch - path;
  const separation = 1 - 0.76 * THREE.MathUtils.smoothstep(Math.abs(angleOfAttack), 0.38, 0.87);
  const coefficient = trim(0.12 + angleOfAttack * 3.4, -0.26, 1.05) * separation;
  const lift = gravity * trim(pressure * coefficient * Math.cos(bank), -0.4, 3.6);
  const acceleration = lift - gravity - (input.failing ? 1.9 : 0);
  const verticalSpeed = grounded
    ? (speed > 18 && pitch > 0.09 ? Math.max(0, acceleration) * 0.22 : 0)
    : trim(input.verticalSpeed + (acceleration - input.verticalSpeed * 0.115) * dt, -46, 32);

  const yawRate = grounded
    ? input.bankCommand * (0.35 + 0.65 * authority) * Math.min(1, speed / 4)
    : gravity * Math.tan(bank) / Math.max(speed, 17) + input.bankCommand * (0.15 + 0.29 * authority);
  return { speed, pitch, bank, verticalSpeed, yawRate };
}

export function aircraftPowerInput(powerUp: boolean, powerDown: boolean) {
  return Number(powerUp) - Number(powerDown);
}

export function hoverStrafe(left: boolean, right: boolean, integrity: number) {
  return (Number(right) - Number(left)) * 13 * integrity;
}
