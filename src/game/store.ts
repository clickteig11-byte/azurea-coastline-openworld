import * as THREE from 'three';
import { RouletteOutcome, VehicleMode } from './worldMath';

export type GamePlayMode = 'FREE_ROAM' | 'BATTLE_ROYALE' | 'GRAND_PRIX' | 'WORLD_TOUR';

export type WeaponId = 'AR' | 'SHOTGUN' | 'SNIPER' | 'MINIGUN' | 'RPG';

export type CharacterArchetype = 'RPM_CUSTOM' | 'MICHELLE_VIP' | 'VANGUARD_SOLDIER';
export type EyewearStyle = 'NONE' | 'AVIATOR_GOLD' | 'CYBER_VISOR';

export interface CharacterCustomization {
  archetype: CharacterArchetype;
  presetName: string;
  skinColor: string;
  topColor: string;
  topRoughness: number;
  topMetalness: number;
  bottomColor: string;
  footwearColor: string;
  headwearOn: boolean;
  headwearColor: string;
  beardOn: boolean;
  beardColor: string;
  eyewear: EyewearStyle;
  backpackOn: boolean;
}

export const SKIN_TONE_SWATCHES: string[] = [
  '#f8d9c0',
  '#f3cfb3',
  '#ecc5a8',
  '#eab68c',
  '#d99b72',
  '#c6865c',
  '#9a5b38',
  '#6b3e26',
];

export const TOP_COLOR_SWATCHES: string[] = [
  '#991b1b',
  '#0284c7',
  '#1e293b',
  '#f8fafc',
  '#f43f5e',
  '#475569',
  '#047857',
  '#d97706',
  '#4f46e5',
  '#111827',
];

export const BOTTOM_COLOR_SWATCHES: string[] = [
  '#0f172a',
  '#1e293b',
  '#334155',
  '#38bdf8',
  '#d6d3d1',
  '#44403c',
  '#1e3a8a',
  '#3f3f46',
];

export const FOOTWEAR_COLOR_SWATCHES: string[] = [
  '#f8fafc',
  '#ef4444',
  '#0f172a',
  '#ffffff',
  '#f59e0b',
  '#38bdf8',
  '#18181b',
  '#78350f',
];

export const CHARACTER_PRESETS: CharacterCustomization[] = [
  {
    archetype: 'RPM_CUSTOM',
    presetName: 'Vegas High Roller',
    skinColor: '#eab68c',
    topColor: '#991b1b',
    topRoughness: 0.28,
    topMetalness: 0.25,
    bottomColor: '#0f172a',
    footwearColor: '#f8fafc',
    headwearOn: false,
    headwearColor: '#1e293b',
    beardOn: true,
    beardColor: '#27272a',
    eyewear: 'AVIATOR_GOLD',
    backpackOn: false,
  },
  {
    archetype: 'RPM_CUSTOM',
    presetName: 'Streetwear Hypebeast',
    skinColor: '#d99b72',
    topColor: '#0284c7',
    topRoughness: 0.42,
    topMetalness: 0.1,
    bottomColor: '#1e293b',
    footwearColor: '#ef4444',
    headwearOn: true,
    headwearColor: '#f59e0b',
    beardOn: false,
    beardColor: '#18181b',
    eyewear: 'AVIATOR_GOLD',
    backpackOn: true,
  },
  {
    archetype: 'RPM_CUSTOM',
    presetName: 'Spec-Ops Commando',
    skinColor: '#c6865c',
    topColor: '#1e293b',
    topRoughness: 0.55,
    topMetalness: 0.35,
    bottomColor: '#334155',
    footwearColor: '#0f172a',
    headwearOn: true,
    headwearColor: '#0f172a',
    beardOn: true,
    beardColor: '#18181b',
    eyewear: 'CYBER_VISOR',
    backpackOn: true,
  },
  {
    archetype: 'RPM_CUSTOM',
    presetName: 'Miami Riviera VIP',
    skinColor: '#f3cfb3',
    topColor: '#f8fafc',
    topRoughness: 0.35,
    topMetalness: 0.08,
    bottomColor: '#38bdf8',
    footwearColor: '#ffffff',
    headwearOn: true,
    headwearColor: '#f8fafc',
    beardOn: false,
    beardColor: '#451a03',
    eyewear: 'AVIATOR_GOLD',
    backpackOn: false,
  },
  {
    archetype: 'MICHELLE_VIP',
    presetName: 'Michelle Couture VIP',
    skinColor: '#ecc5a8',
    topColor: '#f43f5e',
    topRoughness: 0.32,
    topMetalness: 0.18,
    bottomColor: '#1e293b',
    footwearColor: '#f8fafc',
    headwearOn: false,
    headwearColor: '#f43f5e',
    beardOn: false,
    beardColor: '#18181b',
    eyewear: 'AVIATOR_GOLD',
    backpackOn: false,
  },
  {
    archetype: 'VANGUARD_SOLDIER',
    presetName: 'Vanguard Armored Operator',
    skinColor: '#d69e72',
    topColor: '#475569',
    topRoughness: 0.25,
    topMetalness: 0.65,
    bottomColor: '#1e293b',
    footwearColor: '#0f172a',
    headwearOn: true,
    headwearColor: '#0ea5e9',
    beardOn: false,
    beardColor: '#18181b',
    eyewear: 'CYBER_VISOR',
    backpackOn: true,
  },
];

export const NPC_OUTFIT_PALETTES: CharacterCustomization[] = Array.from({ length: 24 }, (_, i) => {
  const skinColor = SKIN_TONE_SWATCHES[i % SKIN_TONE_SWATCHES.length];
  const topColor = TOP_COLOR_SWATCHES[(i * 3) % TOP_COLOR_SWATCHES.length];
  const bottomColor = BOTTOM_COLOR_SWATCHES[(i * 5) % BOTTOM_COLOR_SWATCHES.length];
  const footwearColor = FOOTWEAR_COLOR_SWATCHES[(i * 2) % FOOTWEAR_COLOR_SWATCHES.length];
  const headwearColors = ['#0f172a', '#dc2626', '#f59e0b', '#0284c7', '#f8fafc', '#334155'];
  const beardColors = ['#18181b', '#27272a', '#451a03', '#52525b'];
  const eyewearList: EyewearStyle[] = ['AVIATOR_GOLD', 'NONE', 'CYBER_VISOR', 'AVIATOR_GOLD'];
  return {
    archetype: i % 5 === 0 ? 'MICHELLE_VIP' : i % 7 === 0 ? 'VANGUARD_SOLDIER' : 'RPM_CUSTOM',
    presetName: `Citizen Look #${i + 1}`,
    skinColor,
    topColor,
    topRoughness: 0.28 + (i % 4) * 0.08,
    topMetalness: 0.1 + (i % 3) * 0.12,
    bottomColor,
    footwearColor,
    headwearOn: i % 3 === 0,
    headwearColor: headwearColors[i % headwearColors.length],
    beardOn: i % 2 === 1,
    beardColor: beardColors[i % beardColors.length],
    eyewear: eyewearList[i % eyewearList.length],
    backpackOn: i % 4 === 0,
  };
});

export interface FleetVehicleSpec {
  id: string;
  name: string;
  url: string;
  scale: number;
}

export const PLANE_FLEET_SPECS: FleetVehicleSpec[] = [
  { id: 'business_jet', name: 'GULFSTREAM G700 JET', url: '/models/business_jet.glb', scale: 0.56 },
  { id: 'helicopter', name: 'BELL VIP HELICOPTER', url: '/models/helicopter.glb', scale: 0.95 },
  { id: 'fighter_jet', name: 'MUSTANG STRIKE FIGHTER', url: '/models/fighter_jet.glb', scale: 1.15 },
  { id: 'turboprop', name: 'TWIN REGIONAL TURBOPROP', url: '/models/turboprop.glb', scale: 0.42 },
  { id: 'narrow_airliner', name: 'BOEING 737 EXECUTIVE LINER', url: '/models/narrow_airliner.glb', scale: 0.34 },
  { id: 'cargo_jet', name: 'HEAVY STRATEGIC CARGO JET', url: '/models/cargo_ship.glb', scale: 0.32 },
];

export const BOAT_FLEET_SPECS: FleetVehicleSpec[] = [
  { id: 'motorboat', name: 'CIGARETTE RACING POWERBOAT', url: '/models/motorboat.glb', scale: 1.55 },
  { id: 'cruise_liner', name: 'OASIS OF AZUREA CRUISE LINER', url: 'PROCEDURAL_CRUISE_SHIP', scale: 1.0 },
  { id: 'galleon_ship', name: 'ROYAL SOVEREIGN TALL SHIP', url: '/models/galleon_ship.glb', scale: 0.68 },
  { id: 'sloop_yacht', name: 'MEDITERRANEAN SLOOP YACHT', url: '/models/sloop_yacht.glb', scale: 1.15 },
  { id: 'caique_boat', name: 'AEGEAN MOTOR YACHT', url: '/models/caique_boat.glb', scale: 1.32 },
  { id: 'submarine', name: 'DEEP-SEA EXPLORER SUBMARINE', url: '/models/submarine.glb', scale: 2.35 },
];

export interface WeaponSpec {
  id: WeaponId;
  slot: number;
  name: string;
  shortName: string;
  url: string;
  rarity: 'EPIC' | 'LEGENDARY' | 'MYTHIC' | 'EXOTIC';
  color: string;
  damage: number;
  fireRate: number;
  range: number;
  clipSize: number;
}

export const WEAPON_SPECS: WeaponSpec[] = [
  {
    id: 'AR',
    slot: 1,
    name: 'M4 Tactical Carbine',
    shortName: 'M4 CARBINE',
    url: '/models/gun_ar.glb',
    rarity: 'EPIC',
    color: '#38bdf8',
    damage: 34,
    fireRate: 0.11,
    range: 145,
    clipSize: 30,
  },
  {
    id: 'SHOTGUN',
    slot: 2,
    name: 'Breacher Scattergun',
    shortName: 'SCATTERGUN',
    url: '/models/gun_shotgun.glb',
    rarity: 'LEGENDARY',
    color: '#f59e0b',
    damage: 78,
    fireRate: 0.48,
    range: 65,
    clipSize: 8,
  },
  {
    id: 'SNIPER',
    slot: 3,
    name: 'AWM Bolt-Action Sniper',
    shortName: 'AWM SNIPER',
    url: '/models/gun_sniper.glb',
    rarity: 'MYTHIC',
    color: '#a855f7',
    damage: 115,
    fireRate: 0.75,
    range: 260,
    clipSize: 5,
  },
  {
    id: 'MINIGUN',
    slot: 4,
    name: 'Vulcan Rotary Minigun',
    shortName: 'MINIGUN',
    url: '/models/gun_minigun.glb',
    rarity: 'EXOTIC',
    color: '#ef4444',
    damage: 24,
    fireRate: 0.065,
    range: 135,
    clipSize: 100,
  },
  {
    id: 'RPG',
    slot: 5,
    name: 'Hydra Rocket Launcher',
    shortName: 'ROCKET RPG',
    url: '/models/gun_rpg.glb',
    rarity: 'LEGENDARY',
    color: '#10b981',
    damage: 150,
    fireRate: 0.95,
    range: 190,
    clipSize: 4,
  },
];

export interface BotTarget {
  id: string;
  name: string;
  modelUrl: string;
  gunUrl: string;
  homeX: number;
  homeZ: number;
  x: number;
  y: number;
  z: number;
  yaw: number;
  hp: number;
  maxHp: number;
  shield: number;
  maxShield: number;
  alive: boolean;
  respawnTimer: number;
  parachuting: boolean;
  parachuteY: number;
  hitFlash: number;
  muzzleFlash: number;
}

export const INITIAL_BOT_TARGETS: BotTarget[] = [
  {
    id: 'bot-1',
    name: 'Midtown_Viper',
    modelUrl: '/models/human_rifleman.glb',
    gunUrl: '/models/gun_ar.glb',
    homeX: -20,
    homeZ: 18,
    x: -20,
    y: 3.2,
    z: 18,
    yaw: 0.4,
    hp: 100,
    maxHp: 100,
    shield: 50,
    maxShield: 50,
    alive: true,
    respawnTimer: 0,
    parachuting: false,
    parachuteY: 0,
    hitFlash: 0,
    muzzleFlash: 0,
  },
  {
    id: 'bot-2',
    name: 'Apex_Commander',
    modelUrl: '/models/human_commander.glb',
    gunUrl: '/models/gun_shotgun.glb',
    homeX: 20,
    homeZ: 16,
    x: 20,
    y: 3.2,
    z: 16,
    yaw: -0.5,
    hp: 100,
    maxHp: 100,
    shield: 75,
    maxShield: 75,
    alive: true,
    respawnTimer: 0,
    parachuting: false,
    parachuteY: 0,
    hitFlash: 0,
    muzzleFlash: 0,
  },
  {
    id: 'bot-3',
    name: 'Empire_Ghost',
    modelUrl: '/models/human_medic.glb',
    gunUrl: '/models/gun_sniper.glb',
    homeX: -21,
    homeZ: -26,
    x: -21,
    y: 3.2,
    z: -26,
    yaw: 0.8,
    hp: 100,
    maxHp: 100,
    shield: 50,
    maxShield: 50,
    alive: true,
    respawnTimer: 0,
    parachuting: false,
    parachuteY: 0,
    hitFlash: 0,
    muzzleFlash: 0,
  },
  {
    id: 'bot-4',
    name: 'Shibuya_Phantom',
    modelUrl: '/models/human_security.glb',
    gunUrl: '/models/gun_minigun.glb',
    homeX: 21,
    homeZ: -32,
    x: 21,
    y: 3.2,
    z: -32,
    yaw: -0.9,
    hp: 100,
    maxHp: 100,
    shield: 100,
    maxShield: 100,
    alive: true,
    respawnTimer: 0,
    parachuting: false,
    parachuteY: 0,
    hitFlash: 0,
    muzzleFlash: 0,
  },
  {
    id: 'bot-5',
    name: 'Westminster_99',
    modelUrl: '/models/human_high_roller.glb',
    gunUrl: '/models/gun_ar.glb',
    homeX: -21,
    homeZ: -68,
    x: -21,
    y: 3.2,
    z: -68,
    yaw: 0.2,
    hp: 100,
    maxHp: 100,
    shield: 50,
    maxShield: 50,
    alive: true,
    respawnTimer: 0,
    parachuting: false,
    parachuteY: 0,
    hitFlash: 0,
    muzzleFlash: 0,
  },
  {
    id: 'bot-6',
    name: 'Colosseum_Wraith',
    modelUrl: '/models/human_rifleman.glb',
    gunUrl: '/models/gun_rpg.glb',
    homeX: -72,
    homeZ: 64,
    x: -72,
    y: 3.2,
    z: 64,
    yaw: 0,
    hp: 100,
    maxHp: 100,
    shield: 75,
    maxShield: 75,
    alive: true,
    respawnTimer: 0,
    parachuting: false,
    parachuteY: 0,
    hitFlash: 0,
    muzzleFlash: 0,
  },
  {
    id: 'bot-7',
    name: 'Rialto_Stalker',
    modelUrl: '/models/human_commander.glb',
    gunUrl: '/models/gun_ar.glb',
    homeX: 112,
    homeZ: -68,
    x: 112,
    y: 3.2,
    z: -68,
    yaw: -1.2,
    hp: 100,
    maxHp: 100,
    shield: 50,
    maxShield: 50,
    alive: true,
    respawnTimer: 0,
    parachuting: false,
    parachuteY: 0,
    hitFlash: 0,
    muzzleFlash: 0,
  },
  {
    id: 'bot-8',
    name: 'Eiffel_Hawk',
    modelUrl: '/models/human_medic.glb',
    gunUrl: '/models/gun_sniper.glb',
    homeX: 74,
    homeZ: 52,
    x: 74,
    y: 3.2,
    z: 52,
    yaw: -0.7,
    hp: 100,
    maxHp: 100,
    shield: 50,
    maxShield: 50,
    alive: true,
    respawnTimer: 0,
    parachuting: false,
    parachuteY: 0,
    hitFlash: 0,
    muzzleFlash: 0,
  },
];

export interface LootCrateNode {
  id: string;
  kind: 'LOOT' | 'AMMO';
  position: [number, number, number];
  opened: boolean;
}

export const INITIAL_LOOT_CRATES: LootCrateNode[] = [
  { id: 'lc-1', kind: 'LOOT', position: [-20.5, 0, 22], opened: false },
  { id: 'lc-2', kind: 'AMMO', position: [20.5, 0, 22], opened: false },
  { id: 'lc-3', kind: 'LOOT', position: [-20.5, 0, -28], opened: false },
  { id: 'lc-4', kind: 'AMMO', position: [20.5, 0, -28], opened: false },
  { id: 'lc-5', kind: 'LOOT', position: [-20.5, 0, 62], opened: false },
  { id: 'lc-6', kind: 'LOOT', position: [-76, 0, 64], opened: false },
  { id: 'lc-7', kind: 'AMMO', position: [108, 0, -68], opened: false },
  { id: 'lc-8', kind: 'LOOT', position: [76, 0, 56], opened: false },
];

export interface ChipNode {
  id: string;
  position: [number, number, number];
  value: number;
  collected: boolean;
  isAerial: boolean;
}

export interface CheckpointGate {
  id: string;
  name: string;
  position: [number, number, number];
  yaw: number;
}

export const GRAND_PRIX_CHECKPOINTS: CheckpointGate[] = [
  { id: 'gp-1', name: 'MIDTOWN GRAND AVE', position: [0, 0, 25], yaw: Math.PI },
  { id: 'gp-2', name: 'EMPIRE & TOKYO CROSSING', position: [0, 0, -55], yaw: Math.PI },
  { id: 'gp-3', name: 'BURJ KHALIFA NORTH AVE', position: [0, 0, -135], yaw: Math.PI },
  { id: 'gp-4', name: 'GOLDEN GATE BRIDGE APPROACH', position: [0, 0, -185], yaw: 1.2 },
  { id: 'gp-5', name: 'VENICE RIALTO CANALWAY', position: [110, 0, -95], yaw: 0 },
  { id: 'gp-6', name: 'PARIS EIFFEL BOULEVARD', position: [72, 0, 35], yaw: -0.6 },
  { id: 'gp-7', name: 'SYDNEY HARBOR & RIO DRIVE', position: [25, 0, 125], yaw: -1.57 },
  { id: 'gp-8', name: 'ROME COLOSSEUM & AIRPORT STRAIGHT', position: [-75, 0, 80], yaw: 0.8 },
];

export interface GameHudSnapshot {
  mode: VehicleMode;
  gameMode?: GamePlayMode;
  startMenuOpen?: boolean;
  speedKmh: number;
  altitude: number;
  chips: number;
  multiplier: number;
  roulette: RouletteOutcome;
  rouletteTimer: number;
  nearbyVehicle: VehicleMode | null;
  nearLandmark: string | null;
  fps: number;
  gliding: boolean;
  activeCheckpoint?: number;
  checkpointName?: string;
  checkpointDist?: number;
  lapTime?: number;
  bestLapTime?: number | null;
  lapCount?: number;
  driftScore?: number;
  stuntText?: string | null;
  // Battle Royale & Tactical Weapon Loadout
  brActive?: boolean;
  parachuting?: boolean;
  activeWeaponIdx?: number;
  weaponName?: string;
  weaponRarity?: string;
  ammo?: number;
  maxAmmo?: number;
  playerHp?: number;
  playerShield?: number;
  eliminations?: number;
  aliveCount?: number;
  stormRadius?: number;
  killFeedText?: string | null;
  // Character Customizer & Fleet Selection
  customizerOpen?: boolean;
  activeCarName?: string;
  activePlaneName?: string;
  activeBoatName?: string;
  presetName?: string;
  // Vehicle Integrity & World Rigidity Damage System
  vehicleHp?: number;
  vehicleMaxHp?: number;
  vehicleWrecked?: boolean;
}

export const INITIAL_CHIPS: ChipNode[] = [
  // Metropolis Avenues & Global Landmarks
  { id: 'c1', position: [0, 4.4, 8], value: 100, collected: false, isAerial: false },
  { id: 'c2', position: [0, 4.4, -35], value: 100, collected: false, isAerial: false },
  { id: 'c3', position: [-78, 4.4, 52], value: 250, collected: false, isAerial: false },
  { id: 'c4', position: [72, 4.4, 35], value: 250, collected: false, isAerial: false },
  { id: 'c5', position: [-140, 3.8, -135], value: 250, collected: false, isAerial: false },
  { id: 'c6', position: [135, 3.2, -95], value: 300, collected: false, isAerial: false },
  { id: 'c7', position: [0, 4.4, -185], value: 350, collected: false, isAerial: false },
  // Aerial Stunt Rings for Plane / Glider
  { id: 'a1', position: [-52, 62, -18], value: 500, collected: false, isAerial: true },
  { id: 'a2', position: [54, 78, -135], value: 500, collected: false, isAerial: true },
  { id: 'a3', position: [0, 58, -205], value: 750, collected: false, isAerial: true },
  { id: 'a4', position: [-105, 52, 52], value: 750, collected: false, isAerial: true },
  { id: 'a5', position: [95, 68, 35], value: 500, collected: false, isAerial: true },
];

export interface ControlSettings {
  steeringSensitivity: number; // 0.4 .. 2.0 (default 1.0)
  throttleSensitivity: number; // 0.5 .. 1.8 (default 1.0)
  cameraSmoothness: number; // 0.4 .. 2.0 (default 1.0)
  steeringAssist: boolean; // smooth high-speed stability (default true)
  invertFlightY: boolean; // invert plane pitch (default false)
  joystickSize: 'SM' | 'MD' | 'LG'; // mobile joystick diameter
}

export const DEFAULT_CONTROL_SETTINGS: ControlSettings = {
  steeringSensitivity: 1.0,
  throttleSensitivity: 1.0,
  cameraSmoothness: 1.0,
  steeringAssist: true,
  invertFlightY: false,
  joystickSize: 'MD',
};

function loadControlSettings(): ControlSettings {
  if (typeof window === 'undefined') return { ...DEFAULT_CONTROL_SETTINGS };
  try {
    const raw = window.localStorage.getItem('world-horizon-controls-v1');
    if (!raw) return { ...DEFAULT_CONTROL_SETTINGS };
    const parsed = JSON.parse(raw) as Partial<ControlSettings>;
    return {
      steeringSensitivity:
        typeof parsed.steeringSensitivity === 'number'
          ? Math.max(0.4, Math.min(2.0, parsed.steeringSensitivity))
          : DEFAULT_CONTROL_SETTINGS.steeringSensitivity,
      throttleSensitivity:
        typeof parsed.throttleSensitivity === 'number'
          ? Math.max(0.5, Math.min(1.8, parsed.throttleSensitivity))
          : DEFAULT_CONTROL_SETTINGS.throttleSensitivity,
      cameraSmoothness:
        typeof parsed.cameraSmoothness === 'number'
          ? Math.max(0.4, Math.min(2.0, parsed.cameraSmoothness))
          : DEFAULT_CONTROL_SETTINGS.cameraSmoothness,
      steeringAssist:
        typeof parsed.steeringAssist === 'boolean'
          ? parsed.steeringAssist
          : DEFAULT_CONTROL_SETTINGS.steeringAssist,
      invertFlightY:
        typeof parsed.invertFlightY === 'boolean'
          ? parsed.invertFlightY
          : DEFAULT_CONTROL_SETTINGS.invertFlightY,
      joystickSize:
        parsed.joystickSize === 'SM' || parsed.joystickSize === 'MD' || parsed.joystickSize === 'LG'
          ? parsed.joystickSize
          : DEFAULT_CONTROL_SETTINGS.joystickSize,
    };
  } catch {
    return { ...DEFAULT_CONTROL_SETTINGS };
  }
}

export function saveControlSettings(next: Partial<ControlSettings>): ControlSettings {
  Object.assign(simState.controlSettings, next);
  if (typeof window !== 'undefined') {
    try {
      window.localStorage.setItem(
        'world-horizon-controls-v1',
        JSON.stringify(simState.controlSettings)
      );
    } catch {
      // ignore storage quota errors
    }
    window.dispatchEvent(new CustomEvent('controls-updated'));
  }
  return simState.controlSettings;
}

// Mutable high-frequency simulation state (0 React re-renders per frame)
export const simState = {
  mode: 'CAR' as VehicleMode,
  gameMode: 'FREE_ROAM' as GamePlayMode,
  startMenuOpen: true,
  controlsOpen: false,
  controlSettings: loadControlSettings(),
  analogMoveX: 0, // -1 (left) .. +1 (right) smooth analog joystick
  analogMoveY: 0, // -1 (back) .. +1 (forward) smooth analog joystick
  touchControlsEnabled: false,
  tourVisitedIds: [] as string[],
  gliding: false,
  chips: 0,
  multiplier: 1,
  roulette: 'IDLE' as RouletteOutcome,
  rouletteTimer: 45,
  tideOffset: 0,

  // Character Customization & Active Fleet Selection
  customization: { ...CHARACTER_PRESETS[0] } as CharacterCustomization,
  customizerOpen: false,
  customizationVersion: 1,
  activeCarIdx: 0,
  activeCarName: 'FERRARI 458 ITALIA',
  activePlaneIdx: 0,
  activePlaneName: 'GULFSTREAM G700 JET',
  activeBoatIdx: 0,
  activeBoatName: 'CIGARETTE RACING POWERBOAT',

  // Grand Prix Circuit & Stunt Telemetry
  checkpoints: GRAND_PRIX_CHECKPOINTS,
  activeCheckpoint: 0,
  lapTime: 0,
  bestLapTime: null as number | null,
  lapCount: 0,
  driftScore: 0,
  stuntText: null as string | null,
  stuntTimer: 0,
  trafficPositions: [] as [number, number, number][],

  // Battle Royale, Parachute Sky-Drop & Weapon Loadout State
  brActive: true,
  parachuting: false,
  activeWeaponIdx: 0,
  ammo: 30,
  maxAmmo: 30,
  playerHp: 100,
  playerShield: 100,
  vehicleHp: 100,
  vehicleMaxHp: 100,
  vehicleWrecked: false,
  cameraShake: 0,
  crashFlashTimer: 0,
  lastCrashPos: [0, 0, 0] as [number, number, number],
  eliminations: 0,
  aliveCount: 25,
  stormRadius: 235,
  killFeedText: null as string | null,
  killFeedTimer: 0,
  firingTimer: 0,
  shotCooldown: 0,
  lastShotFrom: [0, 0, 0] as [number, number, number],
  lastShotTo: [0, 0, 0] as [number, number, number],
  botTargets: INITIAL_BOT_TARGETS.map((b) => ({ ...b })),
  lootCrates: INITIAL_LOOT_CRATES.map((l) => ({ ...l })),

  playerPos: new THREE.Vector3(-8.0, 3.3, 28),
  playerVel: new THREE.Vector3(0, 0, 0),
  playerYaw: Math.PI,

  carPos: new THREE.Vector3(6.0, 3.3, 28),
  carVel: new THREE.Vector3(0, 0, 0),
  carYaw: Math.PI,
  carSpeed: 0,

  boatPos: new THREE.Vector3(145, 0.5, -95),
  boatVel: new THREE.Vector3(0, 0, 0),
  boatYaw: -Math.PI / 2,
  boatSpeed: 0,

  planePos: new THREE.Vector3(-125, 2.2, 155),
  planeVel: new THREE.Vector3(0, 0, 0),
  planeYaw: Math.PI / 2,
  planePitch: 0,
  planeRoll: 0,
  planeSpeed: 0,

  chipNodes: INITIAL_CHIPS.map((c) => ({ ...c })),
  keys: new Set<string>(),
};
