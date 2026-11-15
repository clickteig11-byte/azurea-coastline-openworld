import React, { useEffect, useState } from 'react';
import {
  Car,
  Plane,
  Ship,
  Footprints,
  Sparkles,
  Compass,
  Zap,
  Volume2,
  VolumeX,
  MapPin,
  Flag,
  Flame,
  Crosshair,
  Shield,
  Heart,
  Users,
  Radio,
  Shirt,
  Glasses,
  Backpack,
  UserCheck,
  X,
} from 'lucide-react';
import {
  CHARACTER_PRESETS,
  CharacterArchetype,
  CharacterCustomization,
  EyewearStyle,
  GameHudSnapshot,
  simState,
  WEAPON_SPECS,
} from '../game/store';
import { getTerrainHeight, LANDMARKS, VehicleMode } from '../game/worldMath';
import { triggerRouletteSpin } from './Vehicles';
import { soundEngine } from '../game/soundEngine';

interface Props {
  hud: GameHudSnapshot;
  onSelectMode: (m: VehicleMode) => void;
}

const RADAR_SIZE = 136;
const RADAR_CENTER = RADAR_SIZE / 2; // 68
const RADAR_SCALE = 55 / 260;

function worldToRadar(x: number, z: number): [number, number] {
  const rx = Math.max(7, Math.min(RADAR_SIZE - 7, RADAR_CENTER + x * RADAR_SCALE));
  const rz = Math.max(7, Math.min(RADAR_SIZE - 7, RADAR_CENTER + z * RADAR_SCALE));
  return [rx, rz];
}

// Swatch palettes specified for the Live 3D Character Customizer Studio
const STUDIO_TOP_COLORS = [
  '#991b1b',
  '#0284c7',
  '#1e293b',
  '#f8fafc',
  '#f59e0b',
  '#10b981',
  '#7c3aed',
  '#f43f5e',
];

const STUDIO_BOTTOM_COLORS = [
  '#0f172a',
  '#1e3a8a',
  '#334155',
  '#d6d3d1',
  '#78350f',
  '#991b1b',
];

const STUDIO_FOOTWEAR_COLORS = [
  '#f8fafc',
  '#ef4444',
  '#0f172a',
  '#f59e0b',
  '#38bdf8',
  '#a855f7',
];

const STUDIO_SKIN_COLORS = [
  '#f3cfb3',
  '#eab68c',
  '#d99b72',
  '#c6865c',
  '#8d5524',
  '#5c3818',
];

const STUDIO_CAP_COLORS = [
  '#0f172a',
  '#991b1b',
  '#0284c7',
  '#f59e0b',
  '#f8fafc',
  '#10b981',
];

const QUICK_WARP_TARGETS: Array<{
  id: string;
  label: string;
  x: number;
  z: number;
  color: string;
  forceMode?: VehicleMode;
}> = [
  { id: 'sphere', label: 'Strip/Sphere', x: 0, z: -45, color: '#38bdf8' },
  { id: 'luxor', label: 'Luxor', x: -115, z: 85, color: '#f59e0b' },
  { id: 'eiffel', label: 'Eiffel', x: 95, z: 35, color: '#f43f5e' },
  { id: 'liberty', label: 'Liberty', x: -155, z: -145, color: '#34d399' },
  { id: 'venice', label: 'Venice', x: 135, z: -95, color: '#22d3ee' },
  { id: 'harbor', label: 'Harbor/Cruise', x: 232, z: -95, color: '#a855f7', forceMode: 'BOAT' },
  { id: 'airport', label: 'Airport', x: -125, z: 155, color: '#fbbf24' },
];

export function HUD({ hud, onSelectMode }: Props) {
  const [muted, setMuted] = useState(soundEngine.isMuted());
  const [, setUiTick] = useState(0);

  useEffect(() => {
    const onSyncUi = () => setUiTick((t) => t + 1);
    window.addEventListener('toggle-customizer', onSyncUi);
    window.addEventListener('customizer-updated', onSyncUi);
    return () => {
      window.removeEventListener('toggle-customizer', onSyncUi);
      window.removeEventListener('customizer-updated', onSyncUi);
    };
  }, []);

  const handleToggleMute = () => {
    soundEngine.toggleMute();
    setMuted(soundEngine.isMuted());
  };

  const handleToggleCustomizer = () => {
    const prev = Boolean(simState.customizerOpen);
    window.dispatchEvent(new CustomEvent('toggle-customizer'));
    if (Boolean(simState.customizerOpen) === prev) {
      simState.customizerOpen = !prev;
    }
    setUiTick((t) => t + 1);
  };

  const updateCustomization = (patch: Partial<CharacterCustomization>) => {
    Object.assign(simState.customization, patch);
    simState.customizationVersion = (simState.customizationVersion || 0) + 1;
    window.dispatchEvent(new CustomEvent('customizer-updated'));
    setUiTick((t) => t + 1);
  };

  const applyOutfitPreset = (preset: CharacterCustomization) => {
    Object.assign(simState.customization, preset);
    simState.customizationVersion = (simState.customizationVersion || 0) + 1;
    window.dispatchEvent(new CustomEvent('customizer-updated'));
    setUiTick((t) => t + 1);
  };

  const warpToLocation = (x: number, z: number, forceMode?: VehicleMode) => {
    simState.parachuting = false;
    simState.gliding = false;

    if (forceMode) {
      onSelectMode(forceMode);
    }

    const isSphere = Math.abs(x) < 5 && Math.abs(z + 45) < 5;
    const isLuxor = x < -50 && z > 0 && z < 120;
    const isAirport = z > 130;
    const isHarbor = x > 195 && Math.abs(z + 95) < 25;

    if (isSphere) {
      const footY = Math.max(getTerrainHeight(-2.5, 25), 0) + 0.08;
      simState.playerPos.set(-2.5, footY, 25);
      simState.playerYaw = Math.PI;
      simState.playerVel.set(0, 0, 0);

      const carY = Math.max(getTerrainHeight(12.5, 32), 0) + 0.1;
      simState.carPos.set(12.5, carY, 32);
      simState.carYaw = Math.PI;
      simState.carSpeed = 0;
    } else if (isLuxor) {
      const footY = Math.max(getTerrainHeight(-92, 48), 0) + 0.08;
      simState.playerPos.set(-92, footY, 48);
      simState.playerYaw = -0.35;
      simState.playerVel.set(0, 0, 0);

      const carY = Math.max(getTerrainHeight(-104, 54), 0) + 0.1;
      simState.carPos.set(-104, carY, 54);
      simState.carYaw = -0.25;
      simState.carSpeed = 0;
    } else if (isAirport) {
      const footY = Math.max(getTerrainHeight(-125, 155), 0) + 0.08;
      simState.playerPos.set(-125, footY, 155);
      simState.playerYaw = Math.PI / 2;
      simState.playerVel.set(0, 0, 0);

      const carY = Math.max(getTerrainHeight(-138, 155), 0) + 0.1;
      simState.carPos.set(-138, carY, 155);
      simState.carYaw = Math.PI / 2;
      simState.carSpeed = 0;
    } else if (isHarbor) {
      simState.boatPos.set(234, 0.45, -95);
      simState.boatYaw = -1.15;
      simState.boatSpeed = 0;
      simState.playerPos.set(192, Math.max(getTerrainHeight(192, -74), 0.5) + 0.08, -74);
    } else {
      const destZ = z + 44;
      const footY = Math.max(getTerrainHeight(x - 4.0, destZ), 0) + 0.08;
      simState.playerPos.set(x - 4.0, footY, destZ);
      simState.playerYaw = Math.PI;
      simState.playerVel.set(0, 0, 0);

      const carY = Math.max(getTerrainHeight(x + 8.0, destZ + 4), 0) + 0.1;
      simState.carPos.set(x + 8.0, carY, destZ + 4);
      simState.carYaw = Math.PI;
      simState.carSpeed = 0;
    }

    if (isSphere) {
      simState.planePos.set(0, 48, 56);
    } else {
      simState.planePos.set(x, Math.max(getTerrainHeight(x, z), 0) + 36, z + 95);
    }
    simState.planeYaw = Math.PI;
    simState.planePitch = -0.05;
    simState.planeRoll = 0;
    simState.planeSpeed = 36;

    if (simState.mode === 'BOAT' && !isHarbor) {
      if (Math.abs(z + 95) < 5) {
        simState.boatPos.set(x + 48, 0.5, z);
        simState.boatYaw = -Math.PI / 2;
      } else {
        simState.boatPos.set(x, 0.5, z + 38);
        simState.boatYaw = Math.PI;
      }
      simState.boatSpeed = 0;
    }
  };

  // Resolve active player / vehicle position & heading for radar and checkpoint distance
  const activePos =
    simState.mode === 'CAR'
      ? simState.carPos
      : simState.mode === 'BOAT'
      ? simState.boatPos
      : simState.mode === 'PLANE'
      ? simState.planePos
      : simState.playerPos;

  const activeYaw =
    simState.mode === 'CAR'
      ? simState.carYaw
      : simState.mode === 'BOAT'
      ? simState.boatYaw
      : simState.mode === 'PLANE'
      ? simState.planeYaw
      : simState.playerYaw;

  // Grand Prix Checkpoint & Lap Telemetry
  const totalCheckpoints = simState.checkpoints.length;
  const activeCpIndex =
    (hud.activeCheckpoint ?? simState.activeCheckpoint) % Math.max(1, totalCheckpoints);
  const activeCp = simState.checkpoints[activeCpIndex] ?? simState.checkpoints[0];
  const checkpointName = hud.checkpointName ?? activeCp.name;
  const computedDist = Math.round(
    Math.hypot(activePos.x - activeCp.position[0], activePos.z - activeCp.position[2])
  );
  const checkpointDist = hud.checkpointDist ?? computedDist;
  const stuntCallout = hud.stuntText ?? simState.stuntText;
  const driftScore = Math.round(hud.driftScore ?? simState.driftScore);

  // Radar coordinates for player, checkpoint, and features
  const [playerRx, playerRz] = worldToRadar(activePos.x, activePos.z);
  const [cpRx, cpRz] = worldToRadar(activeCp.position[0], activeCp.position[2]);

  const fwdX = Math.sin(activeYaw);
  const fwdZ = Math.cos(activeYaw);
  const rightX = fwdZ;
  const rightZ = -fwdX;

  const coneLen = 26;
  const coneHalfWidth = 12;
  const coneLeftX = playerRx + fwdX * coneLen - rightX * coneHalfWidth;
  const coneLeftZ = playerRz + fwdZ * coneLen - rightZ * coneHalfWidth;
  const coneRightX = playerRx + fwdX * coneLen + rightX * coneHalfWidth;
  const coneRightZ = playerRz + fwdZ * coneLen + rightZ * coneHalfWidth;

  const tipX = playerRx + fwdX * 7.0;
  const tipZ = playerRz + fwdZ * 7.0;
  const wingLX = playerRx - fwdX * 4.8 - rightX * 4.2;
  const wingLZ = playerRz - fwdZ * 4.8 - rightZ * 4.2;
  const tailX = playerRx - fwdX * 2.2;
  const tailZ = playerRz - fwdZ * 2.2;
  const wingRX = playerRx - fwdX * 4.8 + rightX * 4.2;
  const wingRZ = playerRz - fwdZ * 4.8 + rightZ * 4.2;

  const [stripTopX, stripTopZ] = worldToRadar(0, -118);
  const [stripBotX, stripBotZ] = worldToRadar(0, 118);
  const [bellagioX, bellagioZ] = worldToRadar(0, -10);
  const [canalStartX, canalStartZ] = worldToRadar(82, -95);
  const [canalEndX, canalEndZ] = worldToRadar(218, -95);
  const [runwayStartX, runwayStartZ] = worldToRadar(-195, 155);
  const [runwayEndX, runwayEndZ] = worldToRadar(-15, 155);

  // Battle Royale Telemetry & Loadout State
  const aliveCount = hud.aliveCount ?? simState.aliveCount ?? 25;
  const eliminations = hud.eliminations ?? simState.eliminations ?? 0;
  const stormRadius = Math.round(hud.stormRadius ?? simState.stormRadius ?? 235);
  const killFeedText = hud.killFeedText ?? simState.killFeedText;
  const playerHp = Math.max(0, Math.min(100, Math.round(hud.playerHp ?? simState.playerHp ?? 100)));
  const playerShield = Math.max(
    0,
    Math.min(100, Math.round(hud.playerShield ?? simState.playerShield ?? 100))
  );
  const activeWeaponIdx = hud.activeWeaponIdx ?? simState.activeWeaponIdx ?? 0;
  const activeSpec = WEAPON_SPECS[activeWeaponIdx] ?? WEAPON_SPECS[0];
  const currentAmmo = hud.ammo ?? simState.ammo ?? activeSpec.clipSize;
  const maxAmmo = hud.maxAmmo ?? simState.maxAmmo ?? activeSpec.clipSize;
  const radarStormRadius = (simState.stormRadius ?? 235) * RADAR_SCALE;

  const isCustomizerOpen = Boolean(simState.customizerOpen);
  const custom = simState.customization;

  // Single compact top notification pill text (if any active event)
  const notificationBanner =
    killFeedText ||
    stuntCallout ||
    (driftScore > 0 ? `DRIFT COMBO +${driftScore} PTS` : null) ||
    (hud.nearbyVehicle ? `PRESS [E] TO BOARD ${hud.nearbyVehicle}` : null) ||
    hud.nearLandmark ||
    null;

  const rarityBorderStyles: Record<string, string> = {
    EPIC: 'border-sky-400/75 text-sky-300',
    LEGENDARY: 'border-amber-400/80 text-amber-300',
    MYTHIC: 'border-purple-400/85 text-purple-300',
    EXOTIC: 'border-rose-500/85 text-rose-300',
  };

  // Determine current top finish preset ('MATTE' | 'SATIN' | 'LEATHER')
  const currentFinish =
    custom.topRoughness >= 0.48
      ? 'MATTE'
      : custom.topMetalness >= 0.35 || custom.topRoughness <= 0.22
      ? 'LEATHER'
      : 'SATIN';

  return (
    <div className="pointer-events-none fixed inset-0 z-20 select-none overflow-hidden">
      {/* =====================================================================
          1. UNOBSTRUCTED CENTER-SCREEN 4-TICK CROSSHAIR (FOOT / CAR COMBAT)
         ===================================================================== */}
      {(hud.mode === 'FOOT' || hud.mode === 'CAR') && (
        <div className="pointer-events-none fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2">
          <div
            className={`relative h-6 w-6 transition-transform duration-150 ${
              killFeedText ? 'scale-125' : 'scale-100'
            }`}
          >
            <span
              className={`absolute left-1/2 top-0 h-1.5 w-[1.5px] -translate-x-1/2 rounded-full ${
                killFeedText ? 'bg-amber-400 shadow-[0_0_6px_#f59e0b]' : 'bg-cyan-300/85'
              }`}
            />
            <span
              className={`absolute bottom-0 left-1/2 h-1.5 w-[1.5px] -translate-x-1/2 rounded-full ${
                killFeedText ? 'bg-amber-400 shadow-[0_0_6px_#f59e0b]' : 'bg-cyan-300/85'
              }`}
            />
            <span
              className={`absolute left-0 top-1/2 h-[1.5px] w-1.5 -translate-y-1/2 rounded-full ${
                killFeedText ? 'bg-amber-400 shadow-[0_0_6px_#f59e0b]' : 'bg-cyan-300/85'
              }`}
            />
            <span
              className={`absolute right-0 top-1/2 h-[1.5px] w-1.5 -translate-y-1/2 rounded-full ${
                killFeedText ? 'bg-amber-400 shadow-[0_0_6px_#f59e0b]' : 'bg-cyan-300/85'
              }`}
            />
            <span
              className={`absolute left-1/2 top-1/2 h-1 w-1 -translate-x-1/2 -translate-y-1/2 rounded-full ${
                killFeedText ? 'bg-rose-500 animate-ping' : 'bg-white/90'
              }`}
            />
          </div>
        </div>
      )}

      {/* =====================================================================
          SINGLE COMPACT FLOATING EVENT PILL NEAR TOP (top-14)
         ===================================================================== */}
      {notificationBanner && (
        <div className="pointer-events-none fixed left-1/2 top-14 -translate-x-1/2 z-30">
          <div className="flex items-center gap-2 rounded-full border border-amber-400/75 bg-slate-950/85 px-3.5 py-1 text-[11px] font-mono font-black tracking-widest text-amber-200 shadow-lg shadow-slate-950/60 backdrop-blur-md">
            {killFeedText ? (
              <Crosshair className="h-3.5 w-3.5 text-rose-400" />
            ) : (
              <Flame className="h-3.5 w-3.5 text-amber-400" />
            )}
            <span>{notificationBanner}</span>
          </div>
        </div>
      )}

      {/* =====================================================================
          2. SLEEK TOP TELEMETRY & ACTION BAR (top-3 inset-x-3)
         ===================================================================== */}
      <div className="fixed inset-x-3 top-3 z-30 flex flex-wrap items-center justify-between gap-2">
        {/* LEFT: Brand Badge, FPS Badge, Chips Counter & Mute Button */}
        <div className="pointer-events-auto flex items-center gap-1.5 rounded-xl border border-white/15 bg-slate-950/80 px-2.5 py-1.5 font-mono shadow-lg backdrop-blur-md">
          <div className="flex items-center gap-1.5 pr-1 text-[11px] font-black tracking-wider text-amber-400">
            <Sparkles className="h-3.5 w-3.5 shrink-0" />
            <span>AZUREA // COASTLINE</span>
          </div>
          <span className="h-3.5 w-px bg-white/15" />
          <div className="rounded bg-emerald-500/15 px-1.5 py-0.5 text-[10px] font-bold text-emerald-300 border border-emerald-400/30">
            {hud.fps} FPS
          </div>
          <div className="rounded bg-amber-500/15 px-2 py-0.5 text-[10px] font-black tabular-nums text-amber-200 border border-amber-400/30">
            ${hud.chips.toLocaleString()}
          </div>
          <button
            onClick={handleToggleMute}
            title={muted ? 'Unmute Audio' : 'Mute Audio'}
            className="rounded-lg border border-white/10 bg-white/5 p-1 text-slate-200 hover:bg-white/15 transition"
          >
            {muted ? (
              <VolumeX className="h-3.5 w-3.5 text-rose-400" />
            ) : (
              <Volume2 className="h-3.5 w-3.5 text-sky-400" />
            )}
          </button>
        </div>

        {/* CENTER: Compact BR & Grand Prix Pill + [P] SKY-DROP + Glowing [C] CHARACTER STUDIO */}
        <div className="pointer-events-auto flex flex-wrap items-center gap-1.5 rounded-xl border border-white/15 bg-slate-950/80 px-2.5 py-1.5 font-mono shadow-lg backdrop-blur-md">
          <div className="flex items-center gap-1 rounded-md bg-sky-500/15 px-2 py-0.5 text-[10px] font-black text-sky-200 border border-sky-400/30">
            <Users className="h-3 w-3 text-sky-400" />
            <span>ALIVE {aliveCount}</span>
          </div>
          <div className="flex items-center gap-1 rounded-md bg-rose-500/15 px-2 py-0.5 text-[10px] font-black text-rose-200 border border-rose-400/30">
            <Crosshair className="h-3 w-3 text-rose-400" />
            <span>ELIMS {eliminations}</span>
          </div>
          <div className="flex items-center gap-1 rounded-md bg-purple-500/15 px-2 py-0.5 text-[10px] font-black text-purple-200 border border-purple-400/35">
            <Radio className="h-3 w-3 text-purple-400" />
            <span>STORM {stormRadius}m</span>
          </div>
          <div className="hidden items-center gap-1 rounded-md bg-cyan-500/15 px-2 py-0.5 text-[10px] font-bold text-cyan-200 border border-cyan-400/30 xl:flex">
            <Flag className="h-3 w-3 text-cyan-400" />
            <span>
              NEXT GATE: {checkpointName} ({checkpointDist}m)
            </span>
          </div>

          <button
            onClick={() => window.dispatchEvent(new CustomEvent('br-drop'))}
            className="rounded-lg border border-amber-400/75 bg-amber-500/20 px-2.5 py-0.5 text-[10px] font-black tracking-wider text-amber-200 hover:bg-amber-500/35 hover:text-white active:scale-95 transition"
          >
            [P] SKY-DROP
          </button>

          <button
            onClick={handleToggleCustomizer}
            className={`flex items-center gap-1 rounded-lg border px-2.5 py-0.5 text-[10px] font-black tracking-wider shadow-md transition active:scale-95 ${
              isCustomizerOpen
                ? 'border-cyan-300 bg-cyan-500 text-slate-950 shadow-cyan-400/40'
                : 'border-cyan-400/80 bg-gradient-to-r from-cyan-500/30 via-sky-500/30 to-purple-500/30 text-cyan-200 shadow-cyan-500/20 hover:border-cyan-300 hover:text-white'
            }`}
          >
            <Shirt className="h-3 w-3" />
            <span>[C] CHARACTER STUDIO</span>
          </button>
        </div>

        {/* RIGHT: Compact Landmark Quick-Warp Pills + Roulette Spin Button */}
        <div className="pointer-events-auto hidden flex-wrap items-center gap-1 rounded-xl border border-white/15 bg-slate-950/80 px-2 py-1 font-mono shadow-lg backdrop-blur-md lg:flex">
          {QUICK_WARP_TARGETS.map((lm) => (
            <button
              key={lm.id}
              onClick={() => warpToLocation(lm.x, lm.z, lm.forceMode)}
              className="flex items-center gap-1 rounded-md px-2 py-0.5 text-[10px] font-semibold text-slate-200 hover:bg-white/15 hover:text-white transition"
            >
              <MapPin className="h-2.5 w-2.5 shrink-0" style={{ color: lm.color }} />
              <span>{lm.label}</span>
            </button>
          ))}
          <span className="mx-0.5 h-3.5 w-px bg-white/15" />
          <button
            onClick={() => triggerRouletteSpin()}
            title={`Roulette Storm (${hud.rouletteTimer}s)`}
            className="flex items-center gap-1 rounded-md border border-emerald-400/50 bg-emerald-500/15 px-2 py-0.5 text-[10px] font-black text-emerald-200 hover:bg-emerald-500/30 hover:text-white active:scale-95 transition"
          >
            <Zap className="h-3 w-3 text-emerald-400" />
            <span>[R] SPIN ({hud.multiplier}x)</span>
          </button>
        </div>
      </div>

      {/* =====================================================================
          3. INTERACTIVE [C] 3D CHARACTER & WARDROBE STUDIO DRAWER
             (left-3 top-16 bottom-20 w-80)
         ===================================================================== */}
      {isCustomizerOpen && (
        <div className="pointer-events-auto fixed left-3 top-16 bottom-20 z-30 flex w-80 flex-col overflow-hidden rounded-2xl border border-cyan-400/45 bg-slate-950/90 font-mono text-slate-100 shadow-2xl shadow-slate-950/90 backdrop-blur-xl">
          {/* Studio Drawer Header */}
          <div className="flex items-center justify-between border-b border-white/10 bg-gradient-to-r from-cyan-500/20 via-slate-900 to-purple-500/20 px-3.5 py-2.5">
            <div className="flex items-center gap-2">
              <Shirt className="h-4 w-4 text-cyan-400" />
              <div>
                <div className="text-[11px] font-black tracking-wider text-cyan-200">
                  3D CHARACTER & WARDROBE STUDIO
                </div>
                <div className="text-[9px] text-slate-400">
                  LIVE PBR TEXTURE & SKELETAL OUTFIT RIG
                </div>
              </div>
            </div>
            <button
              onClick={handleToggleCustomizer}
              className="rounded-lg border border-white/15 bg-white/5 p-1 text-slate-300 hover:bg-white/15 hover:text-white transition"
              title="Close Studio [C]"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>

          {/* Scrollable Studio Controls */}
          <div className="flex-1 space-y-3 overflow-y-auto p-3 text-[10px]">
            {/* 6 One-Click Full Outfit Presets */}
            <div>
              <div className="mb-1.5 flex items-center justify-between text-[9px] font-bold uppercase tracking-widest text-slate-400">
                <span>6 One-Click Full Outfit Presets</span>
                <span className="text-cyan-300">{custom.presetName}</span>
              </div>
              <div className="grid grid-cols-2 gap-1.5">
                {CHARACTER_PRESETS.map((preset) => {
                  const active = custom.presetName === preset.presetName;
                  return (
                    <button
                      key={preset.presetName}
                      onClick={() => applyOutfitPreset(preset)}
                      className={`flex items-center gap-1.5 rounded-lg border px-2 py-1.5 text-left text-[10px] font-bold transition ${
                        active
                          ? 'border-cyan-300 bg-cyan-500/25 text-white shadow-sm shadow-cyan-500/30'
                          : 'border-white/10 bg-white/5 text-slate-300 hover:bg-white/10 hover:text-white'
                      }`}
                    >
                      <span
                        className="h-2.5 w-2.5 shrink-0 rounded-full border border-white/40"
                        style={{ backgroundColor: preset.topColor }}
                      />
                      <span className="truncate">
                        {preset.presetName === 'Vanguard Armored Operator'
                          ? 'Vanguard Operator'
                          : preset.presetName}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Base Human Model Selector */}
            <div>
              <div className="mb-1.5 text-[9px] font-bold uppercase tracking-widest text-slate-400">
                Base Human Model (PBR Rig)
              </div>
              <div className="grid grid-cols-3 gap-1">
                {(
                  [
                    { id: 'RPM_CUSTOM', label: 'ReadyPlayerMe Modular' },
                    { id: 'MICHELLE_VIP', label: 'Michelle VIP' },
                    { id: 'VANGUARD_SOLDIER', label: 'Vanguard Spec-Ops' },
                  ] as Array<{ id: CharacterArchetype; label: string }>
                ).map((item) => {
                  const active = custom.archetype === item.id;
                  return (
                    <button
                      key={item.id}
                      onClick={() =>
                        updateCustomization({
                          archetype: item.id,
                          presetName: item.label,
                        })
                      }
                      className={`rounded-lg border px-2 py-1.5 text-center text-[9px] font-black leading-tight transition ${
                        active
                          ? 'border-amber-300 bg-amber-500/25 text-amber-100'
                          : 'border-white/10 bg-white/5 text-slate-300 hover:bg-white/10'
                      }`}
                    >
                      {item.label}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Jacket / Top Color (8 Swatches) & Material Finish Toggle */}
            <div>
              <div className="mb-1.5 flex items-center justify-between text-[9px] font-bold uppercase tracking-widest text-slate-400">
                <span>Jacket / Top Color & Finish</span>
                <span className="text-amber-300">{currentFinish}</span>
              </div>
              <div className="mb-2 flex items-center gap-1.5">
                {STUDIO_TOP_COLORS.map((hex) => {
                  const active = custom.topColor.toLowerCase() === hex.toLowerCase();
                  return (
                    <button
                      key={hex}
                      onClick={() => updateCustomization({ topColor: hex })}
                      style={{ backgroundColor: hex }}
                      className={`h-6 w-6 rounded-full border transition-transform ${
                        active
                          ? 'scale-115 border-2 border-white ring-2 ring-cyan-400'
                          : 'border-white/30 hover:scale-110'
                      }`}
                      title={`Top Color ${hex}`}
                    />
                  );
                })}
              </div>
              <div className="grid grid-cols-3 gap-1">
                {(
                  [
                    { label: 'Matte', roughness: 0.62, metalness: 0.06 },
                    { label: 'Satin', roughness: 0.32, metalness: 0.22 },
                    { label: 'Leather', roughness: 0.16, metalness: 0.48 },
                  ] as const
                ).map((fin) => {
                  const isSelected = currentFinish === fin.label.toUpperCase();
                  return (
                    <button
                      key={fin.label}
                      onClick={() =>
                        updateCustomization({
                          topRoughness: fin.roughness,
                          topMetalness: fin.metalness,
                        })
                      }
                      className={`rounded-md border py-1 text-[9px] font-bold transition ${
                        isSelected
                          ? 'border-cyan-300 bg-cyan-500/25 text-cyan-100'
                          : 'border-white/10 bg-white/5 text-slate-300 hover:bg-white/10'
                      }`}
                    >
                      {fin.label}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Pants / Bottoms (6 Swatches) */}
            <div>
              <div className="mb-1.5 text-[9px] font-bold uppercase tracking-widest text-slate-400">
                Pants / Bottoms (Denim · Chino · Tactical)
              </div>
              <div className="flex items-center gap-2">
                {STUDIO_BOTTOM_COLORS.map((hex) => {
                  const active = custom.bottomColor.toLowerCase() === hex.toLowerCase();
                  return (
                    <button
                      key={hex}
                      onClick={() => updateCustomization({ bottomColor: hex })}
                      style={{ backgroundColor: hex }}
                      className={`h-6 w-6 rounded-full border transition-transform ${
                        active
                          ? 'scale-115 border-2 border-white ring-2 ring-cyan-400'
                          : 'border-white/30 hover:scale-110'
                      }`}
                      title={`Bottoms ${hex}`}
                    />
                  );
                })}
              </div>
            </div>

            {/* Sneakers / Footwear (6 Swatches) */}
            <div>
              <div className="mb-1.5 text-[9px] font-bold uppercase tracking-widest text-slate-400">
                Sneakers / Footwear
              </div>
              <div className="flex items-center gap-2">
                {STUDIO_FOOTWEAR_COLORS.map((hex) => {
                  const active = custom.footwearColor.toLowerCase() === hex.toLowerCase();
                  return (
                    <button
                      key={hex}
                      onClick={() => updateCustomization({ footwearColor: hex })}
                      style={{ backgroundColor: hex }}
                      className={`h-6 w-6 rounded-full border transition-transform ${
                        active
                          ? 'scale-115 border-2 border-white ring-2 ring-cyan-400'
                          : 'border-white/30 hover:scale-110'
                      }`}
                      title={`Footwear ${hex}`}
                    />
                  );
                })}
              </div>
            </div>

            {/* Skin Tone (6 Natural Swatches) */}
            <div>
              <div className="mb-1.5 text-[9px] font-bold uppercase tracking-widest text-slate-400">
                Natural Skin Tone
              </div>
              <div className="flex items-center gap-2">
                {STUDIO_SKIN_COLORS.map((hex) => {
                  const active = custom.skinColor.toLowerCase() === hex.toLowerCase();
                  return (
                    <button
                      key={hex}
                      onClick={() => updateCustomization({ skinColor: hex })}
                      style={{ backgroundColor: hex }}
                      className={`h-6 w-6 rounded-full border transition-transform ${
                        active
                          ? 'scale-115 border-2 border-white ring-2 ring-amber-400'
                          : 'border-white/30 hover:scale-110'
                      }`}
                      title={`Skin Tone ${hex}`}
                    />
                  );
                })}
              </div>
            </div>

            {/* Headgear, Beard & Accessories Toggles */}
            <div className="space-y-2 border-t border-white/10 pt-2.5">
              <div className="text-[9px] font-bold uppercase tracking-widest text-slate-400">
                Headgear, Beard & 3D Accessories
              </div>

              <div className="grid grid-cols-3 gap-1.5">
                <button
                  onClick={() => updateCustomization({ headwearOn: !custom.headwearOn })}
                  className={`flex items-center justify-center gap-1 rounded-lg border py-1.5 text-[9px] font-black transition ${
                    custom.headwearOn
                      ? 'border-emerald-400/80 bg-emerald-500/20 text-emerald-200'
                      : 'border-white/10 bg-white/5 text-slate-400 hover:text-white'
                  }`}
                >
                  <span>CAP: {custom.headwearOn ? 'ON' : 'OFF'}</span>
                </button>

                <button
                  onClick={() => updateCustomization({ beardOn: !custom.beardOn })}
                  className={`flex items-center justify-center gap-1 rounded-lg border py-1.5 text-[9px] font-black transition ${
                    custom.beardOn
                      ? 'border-emerald-400/80 bg-emerald-500/20 text-emerald-200'
                      : 'border-white/10 bg-white/5 text-slate-400 hover:text-white'
                  }`}
                >
                  <UserCheck className="h-3 w-3" />
                  <span>BEARD: {custom.beardOn ? 'ON' : 'OFF'}</span>
                </button>

                <button
                  onClick={() => updateCustomization({ backpackOn: !custom.backpackOn })}
                  className={`flex items-center justify-center gap-1 rounded-lg border py-1.5 text-[9px] font-black transition ${
                    custom.backpackOn
                      ? 'border-emerald-400/80 bg-emerald-500/20 text-emerald-200'
                      : 'border-white/10 bg-white/5 text-slate-400 hover:text-white'
                  }`}
                >
                  <Backpack className="h-3 w-3" />
                  <span>PACK: {custom.backpackOn ? 'ON' : 'OFF'}</span>
                </button>
              </div>

              {/* Cap Color Swatches */}
              {custom.headwearOn && (
                <div className="flex items-center justify-between rounded-lg bg-white/5 px-2.5 py-1.5">
                  <span className="text-[9px] text-slate-300">Cap Color:</span>
                  <div className="flex items-center gap-1.5">
                    {STUDIO_CAP_COLORS.map((hex) => (
                      <button
                        key={hex}
                        onClick={() => updateCustomization({ headwearColor: hex })}
                        style={{ backgroundColor: hex }}
                        className={`h-4 w-4 rounded-full border ${
                          custom.headwearColor.toLowerCase() === hex.toLowerCase()
                            ? 'border-white ring-1 ring-cyan-400 scale-110'
                            : 'border-white/30'
                        }`}
                      />
                    ))}
                  </div>
                </div>
              )}

              {/* Eyewear Selector: None / Gold Aviators / Cyber Visor */}
              <div>
                <div className="mb-1 flex items-center gap-1 text-[9px] text-slate-400">
                  <Glasses className="h-3 w-3 text-amber-400" />
                  <span>Eyewear Style:</span>
                </div>
                <div className="grid grid-cols-3 gap-1">
                  {(
                    [
                      { id: 'NONE', label: 'None' },
                      { id: 'AVIATOR_GOLD', label: 'Gold Aviators' },
                      { id: 'CYBER_VISOR', label: 'Cyber Visor' },
                    ] as Array<{ id: EyewearStyle; label: string }>
                  ).map((ew) => {
                    const active = custom.eyewear === ew.id;
                    return (
                      <button
                        key={ew.id}
                        onClick={() => updateCustomization({ eyewear: ew.id })}
                        className={`rounded-md border py-1 text-[9px] font-bold transition ${
                          active
                            ? 'border-amber-300 bg-amber-500/25 text-amber-100'
                            : 'border-white/10 bg-white/5 text-slate-300 hover:bg-white/10'
                        }`}
                      >
                        {ew.label}
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* =====================================================================
          4. COMPACT BOTTOM-LEFT CORNER (bottom-3 left-3):
             136x136 Radar Minimap + Compact Shield/HP + Mode & Fleet Switchers
         ===================================================================== */}
      <div className="pointer-events-auto fixed bottom-3 left-3 z-30 flex items-end gap-2.5">
        {/* Circular 136x136 Radar Minimap */}
        <div
          style={{ width: `${RADAR_SIZE}px`, height: `${RADAR_SIZE}px` }}
          className="relative hidden shrink-0 overflow-hidden rounded-full border-2 border-cyan-300/40 bg-slate-950/85 shadow-xl shadow-slate-950/80 backdrop-blur-md sm:block"
        >
          <svg
            width={RADAR_SIZE}
            height={RADAR_SIZE}
            viewBox={`0 0 ${RADAR_SIZE} ${RADAR_SIZE}`}
            className="absolute inset-0"
          >
            <defs>
              <radialGradient id="radarConeGrad" cx="50%" cy="50%" r="50%">
                <stop offset="0%" stopColor="#38bdf8" stopOpacity="0.42" />
                <stop offset="100%" stopColor="#38bdf8" stopOpacity="0.02" />
              </radialGradient>
            </defs>

            <circle
              cx={RADAR_CENTER}
              cy={RADAR_CENTER}
              r={52}
              fill="none"
              stroke="rgba(148, 163, 184, 0.14)"
              strokeWidth="1"
            />
            <circle
              cx={RADAR_CENTER}
              cy={RADAR_CENTER}
              r={28}
              fill="none"
              stroke="rgba(148, 163, 184, 0.12)"
              strokeDasharray="2 3"
              strokeWidth="1"
            />

            {/* Shrinking Violet Battle Royale Storm Circle */}
            <circle
              cx={RADAR_CENTER}
              cy={RADAR_CENTER}
              r={radarStormRadius}
              fill="rgba(168, 85, 247, 0.08)"
              stroke="#a855f7"
              strokeWidth="1.5"
              strokeDasharray="4 2"
            />

            {/* Venetian Canal Waterway */}
            <line
              x1={canalStartX}
              y1={canalStartZ}
              x2={canalEndX}
              y2={canalEndZ}
              stroke="rgba(14, 165, 233, 0.55)"
              strokeWidth="5"
              strokeLinecap="round"
            />

            {/* Airport Runway Strip */}
            <line
              x1={runwayStartX}
              y1={runwayStartZ}
              x2={runwayEndX}
              y2={runwayEndZ}
              stroke="rgba(148, 163, 184, 0.45)"
              strokeWidth="4.5"
              strokeLinecap="round"
            />

            {/* Las Vegas Strip Boulevard Lines & Bellagio Loop */}
            <line
              x1={stripTopX - 2}
              y1={stripTopZ}
              x2={stripBotX - 2}
              y2={stripBotZ}
              stroke="rgba(251, 191, 36, 0.55)"
              strokeWidth="2"
              strokeLinecap="round"
            />
            <line
              x1={stripTopX + 2}
              y1={stripTopZ}
              x2={stripBotX + 2}
              y2={stripBotZ}
              stroke="rgba(251, 191, 36, 0.55)"
              strokeWidth="2"
              strokeLinecap="round"
            />
            <circle
              cx={bellagioX}
              cy={bellagioZ}
              r={5}
              fill="rgba(14, 165, 233, 0.25)"
              stroke="rgba(251, 191, 36, 0.65)"
              strokeWidth="1.2"
            />

            {/* Active Grand Prix Checkpoint Target Ring */}
            <circle
              cx={cpRx}
              cy={cpRz}
              r={6.5}
              fill="rgba(34, 211, 238, 0.15)"
              stroke="#22d3ee"
              strokeWidth="1.4"
              strokeDasharray="3 2"
            />
            <circle cx={cpRx} cy={cpRz} r={2.8} fill="#22d3ee" />

            {/* Unopened Gold Loot Crate Dots */}
            {simState.lootCrates.map((crate) => {
              if (crate.opened) return null;
              const [lx, lz] = worldToRadar(crate.position[0], crate.position[2]);
              return (
                <circle
                  key={`radar-crate-${crate.id}`}
                  cx={lx}
                  cy={lz}
                  r={2.2}
                  fill="#fbbf24"
                  stroke="#0f172a"
                  strokeWidth="0.7"
                />
              );
            })}

            {/* Live Red Enemy Bot Dots */}
            {simState.botTargets.map((bot) => {
              if (!bot.alive) return null;
              const [bx, bz] = worldToRadar(bot.x, bot.z);
              return (
                <circle
                  key={`radar-bot-${bot.id}`}
                  cx={bx}
                  cy={bz}
                  r={2.6}
                  fill="#ef4444"
                  stroke="#ffffff"
                  strokeWidth="0.7"
                />
              );
            })}

            {/* Player View Cone & Heading Arrow */}
            <polygon
              points={`${playerRx},${playerRz} ${coneLeftX},${coneLeftZ} ${coneRightX},${coneRightZ}`}
              fill="url(#radarConeGrad)"
            />
            <polygon
              points={`${tipX},${tipZ} ${wingLX},${wingLZ} ${tailX},${tailZ} ${wingRX},${wingRZ}`}
              fill="#38bdf8"
              stroke="#ffffff"
              strokeWidth="1.1"
              strokeLinejoin="round"
            />
          </svg>

          <div className="pointer-events-none absolute left-1/2 top-1 -translate-x-1/2 text-[8px] font-mono font-bold text-cyan-300/80">
            N
          </div>
          <Compass className="pointer-events-none absolute right-2 top-2 h-3 w-3 text-slate-400/80" />

          {/* All Colored Landmark Pins (Click to Quick-Warp) */}
          {LANDMARKS.map((lm) => {
            const [mx, mz] = worldToRadar(lm.position[0], lm.position[2]);
            return (
              <button
                key={lm.id}
                onClick={() => warpToLocation(lm.position[0], lm.position[2])}
                title={`Warp to ${lm.name}`}
                style={{ left: `${mx}px`, top: `${mz}px`, backgroundColor: lm.color }}
                className="absolute h-2 w-2 -translate-x-1/2 -translate-y-1/2 rounded-full border border-slate-950 shadow transition-transform hover:scale-150"
              />
            );
          })}
        </div>

        {/* Compact Shield/Health + Mode Switcher + Context-Aware Fleet Switcher */}
        <div className="flex flex-col gap-1.5 rounded-2xl border border-white/15 bg-slate-950/85 p-2.5 font-mono shadow-xl backdrop-blur-md">
          {/* Compact Shield & Health Bars */}
          <div className="grid grid-cols-2 gap-2">
            <div>
              <div className="mb-0.5 flex items-center justify-between text-[9px] font-bold text-sky-300">
                <span className="flex items-center gap-1">
                  <Shield className="h-2.5 w-2.5 text-sky-400" /> SHIELD
                </span>
                <span>{playerShield}</span>
              </div>
              <div className="h-1.5 w-full overflow-hidden rounded-full bg-slate-800">
                <div
                  style={{ width: `${playerShield}%` }}
                  className="h-full rounded-full bg-gradient-to-r from-sky-500 to-cyan-300 transition-all duration-150"
                />
              </div>
            </div>

            <div>
              <div className="mb-0.5 flex items-center justify-between text-[9px] font-bold text-emerald-300">
                <span className="flex items-center gap-1">
                  <Heart className="h-2.5 w-2.5 text-emerald-400" /> HEALTH
                </span>
                <span>{playerHp}</span>
              </div>
              <div className="h-1.5 w-full overflow-hidden rounded-full bg-slate-800">
                <div
                  style={{ width: `${playerHp}%` }}
                  className="h-full rounded-full bg-gradient-to-r from-emerald-500 to-teal-300 transition-all duration-150"
                />
              </div>
            </div>
          </div>

          {/* Vehicle Mode Switcher (1 Foot · 2 Car · 3 Boat · 4 Plane) */}
          <div className="flex items-center gap-1">
            {(
              [
                { id: 'FOOT', label: '1 Foot', Icon: Footprints },
                { id: 'CAR', label: '2 Car', Icon: Car },
                { id: 'BOAT', label: '3 Boat', Icon: Ship },
                { id: 'PLANE', label: '4 Plane', Icon: Plane },
              ] as const
            ).map(({ id, label, Icon }) => {
              const active = hud.mode === id;
              return (
                <button
                  key={id}
                  onClick={() => onSelectMode(id)}
                  className={`flex items-center gap-1 rounded-lg px-2 py-1 text-[10px] font-bold transition ${
                    active
                      ? 'bg-sky-500 text-slate-950 shadow shadow-sky-500/30'
                      : 'bg-white/5 text-slate-300 hover:bg-white/15 hover:text-white'
                  }`}
                >
                  <Icon className="h-3 w-3" />
                  <span>{label}</span>
                </button>
              );
            })}
          </div>

          {/* Context-Aware Model Fleet Switcher + Always-Accessible Customize Button */}
          <div className="flex items-center gap-1.5">
            {hud.mode === 'CAR' && (
              <button
                onClick={() => window.dispatchEvent(new CustomEvent('cycle-car'))}
                className="flex flex-1 items-center justify-center gap-1.5 rounded-lg border border-amber-400/60 bg-amber-500/20 px-2.5 py-1 text-[10px] font-black tracking-wide text-amber-200 hover:bg-amber-500/30 hover:text-white active:scale-95 transition"
              >
                <Car className="h-3 w-3 text-amber-400" />
                <span>[V] SWITCH CAR (5 GLB SUPERCARS)</span>
              </button>
            )}

            {hud.mode === 'BOAT' && (
              <button
                onClick={() => window.dispatchEvent(new CustomEvent('cycle-boat'))}
                className="flex flex-1 items-center justify-center gap-1.5 rounded-lg border border-cyan-400/60 bg-cyan-500/20 px-2.5 py-1 text-[10px] font-black tracking-wide text-cyan-200 hover:bg-cyan-500/30 hover:text-white active:scale-95 transition"
              >
                <Ship className="h-3 w-3 text-cyan-400" />
                <span>[B] SWITCH VESSEL (6 BOATS & CRUISE SHIP)</span>
              </button>
            )}

            {hud.mode === 'PLANE' && (
              <button
                onClick={() => window.dispatchEvent(new CustomEvent('cycle-plane'))}
                className="flex flex-1 items-center justify-center gap-1.5 rounded-lg border border-sky-400/60 bg-sky-500/20 px-2.5 py-1 text-[10px] font-black tracking-wide text-sky-200 hover:bg-sky-500/30 hover:text-white active:scale-95 transition"
              >
                <Plane className="h-3 w-3 text-sky-400" />
                <span>[B] SWITCH AIRCRAFT (6 PLANES & HELI)</span>
              </button>
            )}

            {hud.mode === 'FOOT' && (
              <button
                onClick={handleToggleCustomizer}
                className="flex flex-1 items-center justify-center gap-1.5 rounded-lg border border-cyan-400/75 bg-cyan-500/20 px-2.5 py-1 text-[10px] font-black tracking-wide text-cyan-200 hover:bg-cyan-500/35 hover:text-white active:scale-95 transition"
              >
                <Shirt className="h-3 w-3 text-cyan-400" />
                <span>[C] CUSTOMIZE OUTFIT</span>
              </button>
            )}

            {hud.mode !== 'FOOT' && (
              <button
                onClick={handleToggleCustomizer}
                title="Open 3D Character & Wardrobe Studio [C]"
                className={`flex items-center gap-1 rounded-lg border px-2 py-1 text-[10px] font-black transition ${
                  isCustomizerOpen
                    ? 'border-cyan-300 bg-cyan-500 text-slate-950'
                    : 'border-cyan-400/50 bg-cyan-500/15 text-cyan-200 hover:bg-cyan-500/30 hover:text-white'
                }`}
              >
                <Shirt className="h-3 w-3" />
                <span>[C]</span>
              </button>
            )}
          </div>
        </div>
      </div>

      {/* =====================================================================
          5. COMPACT BOTTOM-RIGHT CORNER (bottom-3 right-3):
             5-Slot Weapon Hotbar + Digital Speedometer & Altitude Readout
         ===================================================================== */}
      <div className="pointer-events-auto fixed bottom-3 right-3 z-30 flex flex-col items-end gap-1.5 font-mono">
        {/* Digital Speedometer & Altitude Readout */}
        <div className="flex items-center gap-3 rounded-xl border border-white/15 bg-slate-950/85 px-3.5 py-1.5 shadow-xl backdrop-blur-md">
          <div className="flex items-baseline gap-1.5">
            <span className="text-[9px] text-slate-400">SPD</span>
            <span className="text-lg font-black tabular-nums text-white">{hud.speedKmh}</span>
            <span className="text-[9px] text-slate-400">KM/H</span>
          </div>
          <span className="h-4 w-px bg-white/15" />
          <div className="flex items-baseline gap-1.5">
            <span className="text-[9px] text-slate-400">ALT</span>
            <span className="text-lg font-black tabular-nums text-sky-300">{hud.altitude}</span>
            <span className="text-[9px] text-slate-400">M</span>
          </div>
        </div>

        {/* Sleek 5-Slot Weapon Hotbar + [F] FIRE + [Q] NEXT */}
        <div className="flex flex-wrap items-center justify-end gap-1 rounded-2xl border border-white/15 bg-slate-950/85 p-1.5 shadow-xl backdrop-blur-md">
          {WEAPON_SPECS.map((spec, idx) => {
            const isSelected = activeWeaponIdx === idx;
            const rarityClass = rarityBorderStyles[spec.rarity] ?? rarityBorderStyles.EPIC;
            return (
              <button
                key={spec.id}
                onClick={() =>
                  window.dispatchEvent(new CustomEvent('select-weapon', { detail: idx }))
                }
                className={`flex flex-col items-start rounded-lg border px-2 py-1 text-left transition ${rarityClass} ${
                  isSelected
                    ? 'bg-white/15 ring-1 ring-amber-400 scale-105'
                    : 'bg-slate-900/80 opacity-80 hover:opacity-100 hover:bg-white/10'
                }`}
              >
                <div className="text-[8px] font-bold tracking-wider">
                  {spec.slot} · {spec.shortName}
                </div>
                <div className="text-[9px] font-extrabold text-white">DMG {spec.damage}</div>
              </button>
            );
          })}

          <button
            onClick={() => window.dispatchEvent(new CustomEvent('fire-weapon'))}
            className="rounded-lg border border-rose-400/80 bg-rose-600/35 px-2.5 py-1.5 text-[10px] font-black tracking-wider text-white hover:bg-rose-500/55 active:scale-95 transition"
          >
            [F] FIRE ({currentAmmo}/{maxAmmo})
          </button>

          <button
            onClick={() => {
              const nextIdx = (activeWeaponIdx + 1) % WEAPON_SPECS.length;
              window.dispatchEvent(new CustomEvent('select-weapon', { detail: nextIdx }));
            }}
            className="rounded-lg border border-cyan-400/50 bg-cyan-500/15 px-2 py-1.5 text-[10px] font-bold text-cyan-200 hover:bg-cyan-500/30 hover:text-white active:scale-95 transition"
          >
            [Q] NEXT
          </button>
        </div>
      </div>
    </div>
  );
}
