export const DUCK = { x: 136, z: 330, radius: 19, reward: 250 };
export const PRIZE_WHEEL = { x: 29, z: -558, radius: 5.6, duration: 3.2 };
export const PERFORMER = { x: 16, z: -575 };
export const TRAMPOLINE_RADIUS = 2.55;
export const TRAMPOLINES = [
  { name: 'South Beach', x: -37, z: 275 },
  { name: 'East Plaza', x: 301, z: 39 },
  { name: 'Surf Village', x: -57, z: -465 },
  { name: 'Wonder Pier', x: 33, z: -563 },
] as const;
export const POSTCARDS = [
  { id: 'skyline', name: 'Midtown Skyline Overlook', x: 15, z: 196, yaw: 0 },
  { id: 'wonder', name: 'Wonder Pier Arch', x: -11, z: -525, yaw: 0 },
  { id: 'solis', name: 'Solis Lighthouse Cove', x: 469, z: 333, yaw: 1.1 },
  { id: 'duck', name: 'Giant Duck Beach', x: 109, z: 272, yaw: -2.6 },
] as const;
export type PostcardId = typeof POSTCARDS[number]['id'];
export const BEACH_BALLS = [
  { x: -14, z: 263 }, { x: -27, z: 270 }, { x: -8, z: 280 },
  { x: 307, z: 45 }, { x: 317, z: 36 }, { x: 312, z: 58 },
];
export const VOLLEYBALL_NETS = [
  { x: -22, z: 278, halfWidth: 5.6 }, { x: 314, z: 52, halfWidth: 5.6 },
];
export const HYDRO_RINGS = [
  { x: 88, z: -583, yaw: 1.3, y: 1.8 }, { x: 145, z: 354, yaw: 1.45, y: 1.8 },
  { x: 371, z: 409, yaw: 0.95, y: 1.8 }, { x: -417, z: -374, yaw: -0.1, y: 1.8 },
  { x: -437, z: -335, yaw: 0, y: 12.8 }, { x: -459, z: -335, yaw: 0, y: 11.8 },
];

export type Prize = 'jackpot' | 'speed' | 'neon';
export const PRIZES = ['jackpot', 'speed', 'neon'] as const;
export const PRIZE_LABELS: Record<Prize, string> = {
  jackpot: 'Prize Wheel Jackpot', speed: 'Boardwalk Speed Boost', neon: 'Neon Carnival Shift',
};
export type Discovery = {
  id: number;
  kind: 'duck' | 'postcard' | 'wheel' | 'hydro';
  title: string;
  detail: string;
  chips?: number;
};

export function trampolineLaunchSpeed(height = 16, gravity = 21.5) {
  return Math.sqrt(2 * Math.max(0, height) * Math.max(0, gravity));
}

export function capturePostcard(collection: readonly PostcardId[], id: PostcardId) {
  const captured = !collection.includes(id);
  const collected = captured ? [...collection, id] : collection;
  return { captured, collected, count: collected.length, complete: collected.length === POSTCARDS.length, chips: captured ? 350 : 0 };
}

export function spinPrizeWheel(random: () => number = Math.random): Prize {
  const roll = random();
  return roll < 0.22 ? 'jackpot' : roll < 0.63 ? 'speed' : 'neon';
}

export type BallMotion = { x: number; y: number; z: number; vx: number; vy: number; vz: number; radius: number };

export function kickBeachBall(ball: BallMotion, x: number, z: number, strength: number): BallMotion {
  const range = Math.hypot(x, z) || 1;
  return { ...ball, vx: ball.vx * 0.36 + x / range * strength, vz: ball.vz * 0.36 + z / range * strength,
    vy: Math.max(ball.vy, Math.min(9, 2.4 + strength * 0.26)) };
}

export function stepBeachBall(ball: BallMotion, floor: number, dt: number): BallMotion {
  const grounded = ball.y <= floor + ball.radius + 0.04 && ball.vy <= 0;
  const drag = Math.exp(-dt * (grounded ? 1.9 : 0.35));
  const vy = ball.vy - 17 * dt;
  const y = ball.y + (ball.vy + vy) * dt * 0.5;
  return { ...ball, x: ball.x + ball.vx * dt, z: ball.z + ball.vz * dt, vx: ball.vx * drag, vz: ball.vz * drag,
    y: Math.max(floor + ball.radius, y), vy: y < floor + ball.radius ? (vy < -1.6 ? -vy * 0.61 : 0) : vy };
}

export function crossesHydroRing(ring: typeof HYDRO_RINGS[number], from: { x: number; y: number; z: number },
  to: { x: number; y: number; z: number }, radius = 5.5) {
  const dx = Math.sin(ring.yaw);
  const dz = Math.cos(ring.yaw);
  const a = (from.x - ring.x) * dx + (from.z - ring.z) * dz;
  const b = (to.x - ring.x) * dx + (to.z - ring.z) * dz;
  if (a * b > 0 || a === b) return false;
  const t = a / (a - b);
  const offset = (from.x + (to.x - from.x) * t - ring.x) * dz - (from.z + (to.z - from.z) * t - ring.z) * dx;
  const height = from.y + (to.y - from.y) * t - ring.y;
  return offset ** 2 + height ** 2 < radius ** 2;
}
