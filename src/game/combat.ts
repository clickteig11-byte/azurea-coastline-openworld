import * as THREE from 'three';
import { type BotTarget, simState } from './store';
import { launchTumble } from './motion';
import { emitEnvironment } from './worldDamage';

export function injureBot(bot: BotTarget, amount: number, vx: number, vz: number, severity = 0, side = 1) {
  if (!bot.alive || simState.brResult !== null) return false;
  const absorbed = Math.min(bot.shield, amount);
  bot.shield -= absorbed;
  bot.hp = Math.max(0, bot.hp - amount + absorbed);
  bot.hitFlash = 0.26;
  emitEnvironment('impact', new THREE.Vector3(bot.x, bot.y + 1.06, bot.z), 0.28 + severity * 0.75, vx, vz);
  if (bot.hp === 0 || severity > 0.21) {
    bot.parachuting = false;
    bot.fall = launchTumble(vx, vz, Math.max(0.19, severity), side);
    bot.downUntil = 1.55 + severity * 1.6;
    bot.muzzleFlash = 0;
    const direction = Math.atan2(vx, vz);
    if (Number.isFinite(direction)) bot.yaw = direction;
  }
  if (bot.hp > 0) return false;
  bot.alive = false;
  simState.eliminations++;
  simState.aliveCount = Math.max(1, simState.aliveCount - 1);
  simState.chips += Math.round(500 * simState.multiplier);
  simState.playerShield = Math.min(100, simState.playerShield + 16);
  if (simState.aliveCount === 1) simState.brResult = 'WON';
  return true;
}

export function injurePlayer(amount: number, shot = true) {
  if (simState.brResult !== null || (shot && simState.botImpactCooldown > 0)) return false;
  if (shot) simState.botImpactCooldown = 0.29;
  const absorbed = Math.min(simState.playerShield, amount);
  simState.playerShield -= absorbed;
  simState.playerHp = Math.max(0, simState.playerHp - amount + absorbed);
  simState.cameraShake = Math.max(simState.cameraShake, 0.125);
  simState.crashFlashTimer = Math.max(simState.crashFlashTimer, 0.095);
  if (simState.playerHp === 0) simState.brResult = 'OUT';
  return true;
}
