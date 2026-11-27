import * as THREE from 'three';
import { simState } from './store';
import { soundEngine } from './soundEngine';
import { emitEnvironment } from './worldDamage';
import { getTravelHeight } from './worldMath';
import { capturePostcard, DUCK, PERFORMER, POSTCARDS, PRIZES, PRIZE_LABELS, PRIZE_WHEEL, spinPrizeWheel, type Discovery } from './quirky';

export const coastalNow = () => performance.now() / 1000;
const coastal = simState.coastal;

export function discover(kind: Discovery['kind'], title: string, detail: string, chips?: number) {
  coastal.discovery = { id: ++coastal.discoveryId, kind, title, detail, chips };
  coastal.discoveryUntil = coastalNow() + 4.6;
  simState.chips += chips ?? 0;
}

export function coastalBurst(kind: typeof coastal.burst.kind, x: number, y: number, z: number) {
  Object.assign(coastal.burst, { kind, x, y, z, until: coastalNow() + 1.45, id: coastal.burst.id + 1 });
}

export function coastalReaction(kind: typeof coastal.reaction.kind, x: number, z: number) {
  Object.assign(coastal.reaction, { kind, x, z, until: coastalNow() + 2.8, id: coastal.reaction.id + 1 });
  if (kind === 'emote' && Math.hypot(x - PERFORMER.x, z - PERFORMER.z) < 24) {
    coastalBurst('performer', PERFORMER.x, getTravelHeight(PERFORMER.x, PERFORMER.z) + 1.2, PERFORMER.z);
  }
}

export function quack() {
  const now = coastalNow();
  if (coastal.duckUntil > now) return false;
  coastal.duckUntil = now + 4.5;
  soundEngine.playCoastal('duck');
  discover('duck', 'Sir Quacks-a-Lot', 'A salute from the Lighthouse Channel', DUCK.reward);
  return true;
}

function localPostcard() {
  if (simState.mode !== 'FOOT' || simState.activeRide || simState.gliding || simState.parachuting) return;
  const p = simState.playerPos;
  return POSTCARDS.find(({ x, z, yaw }) => {
    const dx = p.x - x;
    const dz = p.z - z;
    return Math.abs(dx * Math.cos(yaw) - dz * Math.sin(yaw)) < 3.1 &&
      Math.abs(dx * Math.sin(yaw) + dz * Math.cos(yaw)) < 2.9 &&
      Math.abs(p.y - getTravelHeight(x, z)) < 1.75;
  });
}

function atPrizeWheel() {
  const p = simState.playerPos;
  return simState.mode === 'FOOT' && !simState.activeRide && Math.hypot(p.x - PRIZE_WHEEL.x, p.z - PRIZE_WHEEL.z) < PRIZE_WHEEL.radius &&
    Math.abs(p.y - getTravelHeight(PRIZE_WHEEL.x, PRIZE_WHEEL.z)) < 2.3;
}

function nearDuck() {
  if (simState.mode === 'PLANE' || simState.activeRide) return false;
  const p = simState.mode === 'BOAT' ? simState.boatPos : simState.mode === 'CAR' ? simState.carPos : simState.playerPos;
  return p.y < 9 && Math.hypot(p.x - DUCK.x, p.z - DUCK.z) < DUCK.radius + 5;
}

export function coastalPrompt() {
  const postcard = localPostcard();
  if (postcard && !coastal.postcards.includes(postcard.id)) return 'Capture postcard';
  if (atPrizeWheel()) return coastal.prize ? 'Wheel spinning' : 'Spin prize wheel';
  if (nearDuck()) return 'Greet Sir Quacks-a-Lot';
}

export function interactCoast(emote = false) {
  if (simState.startMenuOpen || simState.controlsOpen || simState.customizerOpen ||
      simState.gameMode !== 'FREE_ROAM' && simState.gameMode !== 'WORLD_TOUR') return false;
  const now = coastalNow();
  const postcard = localPostcard();
  if (postcard) {
    const next = capturePostcard(coastal.postcards, postcard.id);
    if (next.captured) {
      coastal.postcards = next.collected;
      coastal.flashUntil = now + 0.35;
      coastalReaction('photo', postcard.x, postcard.z);
      soundEngine.playCoastal('photo');
      discover('postcard', 'Postcard Captured', `${next.count}/${POSTCARDS.length} · ${postcard.name}`, next.chips);
      return true;
    }
  }
  if (emote) return false;
  if (atPrizeWheel()) {
    if (!coastal.prize) {
      const prize = spinPrizeWheel();
      coastal.prize = prize;
      coastal.wheelStart = now;
      coastal.wheelFrom = coastal.wheelTo % (2 * Math.PI);
      const slot = PRIZES.indexOf(prize) + 3 * Math.floor(Math.random() * 4);
      coastal.wheelTo = 8 * Math.PI + slot * Math.PI / 6;
      soundEngine.playCoastal('wheel');
    }
    return true;
  }
  if (nearDuck()) {
    quack();
    return true;
  }
  return false;
}

export function completeCoastalPrize() {
  const { prize } = coastal;
  const now = coastalNow();
  if (!prize || now < coastal.wheelStart + PRIZE_WHEEL.duration) return;
  coastal.prize = null;
  const chips = prize === 'jackpot' ? 500 : undefined;
  if (prize === 'speed') coastal.speedUntil = now + 18;
  if (prize === 'neon') coastal.neonUntil = now + 45;
  if (prize === 'jackpot') coastalBurst('jackpot', PRIZE_WHEEL.x, 8.5, PRIZE_WHEEL.z - 8);
  discover('wheel', PRIZE_LABELS[prize],
    prize === 'speed' ? '18 seconds of extra speed' : prize === 'neon' ? '45 seconds of midnight carnival lights' : 'Harbor fireworks', chips);
  soundEngine.playRouletteFanfare();
}

export function strikeDuck(origin: THREE.Vector3, direction: THREE.Vector3, range: number) {
  const center = new THREE.Vector3(DUCK.x, simState.tideOffset + 3.2, DUCK.z);
  const distance = center.clone().sub(origin).dot(direction);
  if (distance < 0 || distance > range || origin.clone().addScaledVector(direction, distance).distanceToSquared(center) > 6.8 ** 2) return;
  quack();
  return Math.max(0, distance - 3.4);
}

export function hydroBoost(index: number, point: THREE.Vector3, yaw = simState.boatYaw) {
  coastal.hydroUntil = coastalNow() + 2.7;
  coastal.hydroRing = index;
  discover('hydro', 'Hydro-Boost Ring', 'Azurea stunt current');
  soundEngine.playCoastal('hydro');
  emitEnvironment('water', point, 1.4, Math.sin(yaw) * 12, Math.cos(yaw) * 12);
}
