import React, { useEffect, useState } from 'react';
import {
  Car,
  Plane,
  Ship,
  Footprints,
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
  LayoutGrid,
  Globe,
  Trophy,
  Play,
  CheckCircle2,
  ChevronRight,
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

export type MetropolisGameMode =
  | 'FREE_ROAM'
  | 'BATTLE_ROYALE'
  | 'GRAND_PRIX'
  | 'LANDMARK_TOUR';

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

// Step 1: 4 Metropolis Gameplay Experiences
const GAMEPLAY_EXPERIENCES: Array<{
  id: MetropolisGameMode;
  title: string;
  badge: string;
  desc: string;
  accent: string;
}> = [
  {
    id: 'FREE_ROAM',
    title: 'FREE ROAM METROPOLIS',
    badge: 'OPEN WORLD SANDBOX',
    desc: 'Unobstructed open-world city driving, flying, sailing & exploration across 12 world landmarks.',
    accent: 'from-sky-500/25 to-cyan-500/15 border-sky-400/60 text-sky-200',
  },
  {
    id: 'BATTLE_ROYALE',
    title: 'BATTLE ROYALE SKY-DROP',
    badge: '120M PARACHUTE COMBAT',
    desc: 'Parachute from 120m into the city, open supply crates, and battle 8 armed AI bots inside the shrinking storm.',
    accent: 'from-rose-500/25 to-amber-500/15 border-rose-400/60 text-rose-200',
  },
  {
    id: 'GRAND_PRIX',
    title: 'WORLD GRAND PRIX CIRCUIT',
    badge: '8-GATE TIME TRIAL',
    desc: 'High-speed checkpointed time-trial race across Grand Central Avenue, Golden Gate Bridge & Harbor Blvd.',
    accent: 'from-amber-500/25 to-yellow-500/15 border-amber-400/60 text-amber-200',
  },
  {
    id: 'LANDMARK_TOUR',
    title: 'GLOBAL LANDMARK TOUR',
    badge: '12 WORLD MONUMENTS',
    desc: 'Guided sightseeing mode with instant teleportation to all 12 world monuments.',
    accent: 'from-emerald-500/25 to-teal-500/15 border-emerald-400/60 text-emerald-200',
  },
];

// Step 2: Fleet Model Specs for Direct Selection
const CAR_FLEET_MENU = [
  { idx: 0, label: 'Ferrari 458 Italia', codeName: 'FERRARI 458 ITALIA', spec: 'V8 Mid-Engine · 340 km/h' },
  { idx: 1, label: 'GT3 Gymkhana Supercar', codeName: 'GT3 GYMKHANA SUPERCAR', spec: 'Track Aero · AWD Drift' },
  { idx: 2, label: '80s Wedge Supercar', codeName: '80S WEDGE SUPERCAR', spec: 'Retro V12 · Pop-Up Styling' },
  { idx: 3, label: '60s Classic Muscle', codeName: '60S CLASSIC MUSCLE', spec: 'Big-Block V8 · Street Torque' },
  { idx: 4, label: 'Executive Stretch Limo', codeName: 'EXECUTIVE STRETCH LIMO', spec: 'Metropolis Presidential VIP' },
];

const BOAT_FLEET_MENU = [
  { idx: 0, label: 'Cigarette Racing Powerboat', codeName: 'CIGARETTE RACING POWERBOAT', spec: 'Twin V8 Offshore Interceptor' },
  { idx: 1, label: 'Oasis of Azurea Cruise Liner', codeName: 'OASIS OF AZUREA CRUISE LINER', spec: '7-Deck Mega-Cruise Ship' },
  { idx: 2, label: 'Royal Sovereign Tall Ship', codeName: 'ROYAL SOVEREIGN TALL SHIP', spec: 'Full-Rigged 3-Mast Frigate' },
  { idx: 3, label: 'Mediterranean Sloop Yacht', codeName: 'MEDITERRANEAN SLOOP YACHT', spec: 'Racing Keel Regatta Cruiser' },
  { idx: 4, label: 'Aegean Motor Yacht', codeName: 'AEGEAN MOTOR YACHT', spec: 'Coastal Wooden Day-Cruiser' },
  { idx: 5, label: 'Deep-Sea Explorer Submarine', codeName: 'DEEP-SEA EXPLORER SUBMARINE', spec: 'Stealth Hydro-Submersible' },
];

const PLANE_FLEET_MENU = [
  { idx: 0, label: 'Gulfstream G700 Jet', codeName: 'GULFSTREAM G700 JET', spec: 'Mach 0.92 Executive Twin-Jet' },
  { idx: 1, label: 'Bell VIP Helicopter', codeName: 'BELL VIP HELICOPTER', spec: 'VTOL Rooftop Helipad Rotorcraft' },
  { idx: 2, label: 'Mustang Strike Fighter', codeName: 'MUSTANG STRIKE FIGHTER', spec: 'Aerobatic Tactical Fighter' },
  { idx: 3, label: 'Twin Regional Turboprop', codeName: 'TWIN REGIONAL TURBOPROP', spec: 'STOL Commuter Airliner' },
  { idx: 4, label: 'Boeing 737 Executive Liner', codeName: 'BOEING 737 EXECUTIVE LINER', spec: 'Transcontinental Commercial Jet' },
  { idx: 5, label: 'Heavy Strategic Cargo Jet', codeName: 'HEAVY STRATEGIC CARGO JET', spec: '4-Engine Heavy Airlifter' },
];

const MENU_CHARACTER_PRESETS: Array<{
  label: string;
  role: string;
  presetIdx: number;
  patch?: Partial<CharacterCustomization>;
}> = [
  {
    label: 'Metropolis Executive',
    role: 'Savile Row Suit · Aviators',
    presetIdx: 0,
    patch: { presetName: 'Metropolis Executive', topColor: '#1e293b', bottomColor: '#0f172a' },
  },
  {
    label: 'Spec-Ops Operator',
    role: 'Tactical Armor · Cyber Visor',
    presetIdx: 5,
    patch: { presetName: 'Spec-Ops Operator' },
  },
  {
    label: 'Street Drift Champion',
    role: 'Track Jacket · Pro Pack',
    presetIdx: 1,
    patch: { presetName: 'Street Drift Champion' },
  },
  {
    label: 'Cyber Neon VIP',
    role: 'Couture Streetwear · Visor',
    presetIdx: 4,
    patch: { presetName: 'Cyber Neon VIP', eyewear: 'CYBER_VISOR' },
  },
];

// Step 3 & Top-Right Quick-Warp: All 12 Global Landmarks + Cruise Harbor + Airport (14 total)
export interface LandmarkDestination {
  id: string;
  shortLabel: string;
  fullTitle: string;
  cityBadge: string;
  x: number;
  z: number;
  color: string;
  forceMode?: VehicleMode;
  // Unobstructed avenue spawn coordinates so the camera has a crystal-clear view of the landmark
  spawnCarX: number;
  spawnCarZ: number;
  spawnFootX: number;
  spawnFootZ: number;
}

export const WORLD_LANDMARK_DESTINATIONS: LandmarkDestination[] = [
  {
    id: 'empire',
    shortLabel: 'NYC Empire',
    fullTitle: 'NYC — Empire State Building',
    cityBadge: 'NEW YORK',
    x: -52,
    z: -28,
    color: '#38bdf8',
    spawnCarX: -12,
    spawnCarZ: -28,
    spawnFootX: -16,
    spawnFootZ: -24,
  },
  {
    id: 'goldengate',
    shortLabel: 'Golden Gate',
    fullTitle: 'SF — Golden Gate Bridge',
    cityBadge: 'SAN FRANCISCO',
    x: 0,
    z: -205,
    color: '#f97316',
    spawnCarX: 4,
    spawnCarZ: -148,
    spawnFootX: -4,
    spawnFootZ: -144,
  },
  {
    id: 'bigben',
    shortLabel: 'Big Ben',
    fullTitle: 'London — Big Ben Clock Tower',
    cityBadge: 'LONDON',
    x: -52,
    z: -88,
    color: '#fbbf24',
    spawnCarX: -12,
    spawnCarZ: -88,
    spawnFootX: -16,
    spawnFootZ: -84,
  },
  {
    id: 'eiffel',
    shortLabel: 'Eiffel Tower',
    fullTitle: 'Paris — Eiffel Tower',
    cityBadge: 'PARIS',
    x: 95,
    z: 35,
    color: '#f43f5e',
    spawnCarX: 54,
    spawnCarZ: 35,
    spawnFootX: 50,
    spawnFootZ: 39,
  },
  {
    id: 'burj',
    shortLabel: 'Burj Khalifa',
    fullTitle: 'Dubai — Burj Khalifa',
    cityBadge: 'DUBAI',
    x: 54,
    z: -148,
    color: '#22d3ee',
    spawnCarX: 14,
    spawnCarZ: -120,
    spawnFootX: 10,
    spawnFootZ: -116,
  },
  {
    id: 'colosseum',
    shortLabel: 'Colosseum',
    fullTitle: 'Rome — The Colosseum',
    cityBadge: 'ROME',
    x: -105,
    z: 45,
    color: '#f59e0b',
    spawnCarX: -82,
    spawnCarZ: 80,
    spawnFootX: -86,
    spawnFootZ: 76,
  },
  {
    id: 'sydney',
    shortLabel: 'Sydney Opera',
    fullTitle: 'Sydney — Opera House',
    cityBadge: 'SYDNEY',
    x: 148,
    z: 108,
    color: '#e2e8f0',
    spawnCarX: 112,
    spawnCarZ: 80,
    spawnFootX: 116,
    spawnFootZ: 84,
  },
  {
    id: 'tokyo',
    shortLabel: 'Tokyo Tower',
    fullTitle: 'Tokyo — Tokyo Tower & Shibuya',
    cityBadge: 'TOKYO',
    x: 52,
    z: -28,
    color: '#ef4444',
    spawnCarX: 12,
    spawnCarZ: -28,
    spawnFootX: 16,
    spawnFootZ: -24,
  },
  {
    id: 'liberty',
    shortLabel: 'Lady Liberty',
    fullTitle: 'NYC — Statue of Liberty',
    cityBadge: 'NY HARBOR',
    x: -158,
    z: -145,
    color: '#34d399',
    spawnCarX: -116,
    spawnCarZ: -120,
    spawnFootX: -112,
    spawnFootZ: -116,
  },
  {
    id: 'redeemer',
    shortLabel: 'Redeemer',
    fullTitle: 'Rio — Christ the Redeemer',
    cityBadge: 'RIO DE JANEIRO',
    x: 58,
    z: 148,
    color: '#a855f7',
    spawnCarX: 18,
    spawnCarZ: 108,
    spawnFootX: 14,
    spawnFootZ: 104,
  },
  {
    id: 'venice',
    shortLabel: 'Venice Rialto',
    fullTitle: 'Venice — Rialto Bridge & Canal',
    cityBadge: 'VENICE',
    x: 135,
    z: -95,
    color: '#06b6d4',
    spawnCarX: 88,
    spawnCarZ: -70,
    spawnFootX: 94,
    spawnFootZ: -72,
  },
  {
    id: 'giza',
    shortLabel: 'Giza Pyramid',
    fullTitle: 'Cairo — Great Pyramid of Giza',
    cityBadge: 'CAIRO / GIZA',
    x: -118,
    z: -28,
    color: '#eab308',
    spawnCarX: -76,
    spawnCarZ: -4,
    spawnFootX: -72,
    spawnFootZ: 0,
  },
  {
    id: 'harbor',
    shortLabel: 'Cruise Harbor',
    fullTitle: 'East Ocean — Mega-Cruise Harbor',
    cityBadge: 'MARITIME PORT',
    x: 234,
    z: -95,
    color: '#38bdf8',
    forceMode: 'BOAT',
    spawnCarX: 186,
    spawnCarZ: -72,
    spawnFootX: 192,
    spawnFootZ: -74,
  },
  {
    id: 'airport',
    shortLabel: 'Intl Airport',
    fullTitle: 'West Runway — International Airport',
    cityBadge: 'AVIATION HUB',
    x: -125,
    z: 155,
    color: '#fbbf24',
    forceMode: 'PLANE',
    spawnCarX: -138,
    spawnCarZ: 145,
    spawnFootX: -132,
    spawnFootZ: 145,
  },
];

export function HUD({ hud, onSelectMode }: Props) {
  const [muted, setMuted] = useState(soundEngine.isMuted());
  const [, setUiTick] = useState(0);
  const [selectedLandmarkId, setSelectedLandmarkId] = useState<string>('empire');

  useEffect(() => {
    const onSyncUi = () => setUiTick((t) => t + 1);
    window.addEventListener('toggle-customizer', onSyncUi);
    window.addEventListener('customizer-updated', onSyncUi);
    window.addEventListener('toggle-start-menu', onSyncUi);
    window.addEventListener('mode-switched', onSyncUi);
    return () => {
      window.removeEventListener('toggle-customizer', onSyncUi);
      window.removeEventListener('customizer-updated', onSyncUi);
      window.removeEventListener('toggle-start-menu', onSyncUi);
      window.removeEventListener('mode-switched', onSyncUi);
    };
  }, []);

  const s = simState as any;
  const isStartMenuOpen = Boolean(s.startMenuOpen);
  const activeGameMode: MetropolisGameMode = (s.gameMode as MetropolisGameMode) || 'FREE_ROAM';

  const handleToggleMute = () => {
    soundEngine.toggleMute();
    setMuted(soundEngine.isMuted());
  };

  const handleToggleStartMenu = (forceState?: boolean) => {
    const next = typeof forceState === 'boolean' ? forceState : !Boolean(s.startMenuOpen);
    s.startMenuOpen = next;
    if (next) {
      simState.customizerOpen = false;
    }
    window.dispatchEvent(new CustomEvent('toggle-start-menu'));
    setUiTick((t) => t + 1);
  };

  const handleToggleCustomizer = () => {
    const prev = Boolean(simState.customizerOpen);
    s.startMenuOpen = false;
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

  const applyOutfitPreset = (preset: CharacterCustomization, extraPatch?: Partial<CharacterCustomization>) => {
    Object.assign(simState.customization, preset, extraPatch || {});
    simState.customizationVersion = (simState.customizationVersion || 0) + 1;
    window.dispatchEvent(new CustomEvent('customizer-updated'));
    setUiTick((t) => t + 1);
  };

  const selectSpecificCar = (idx: number) => {
    onSelectMode('CAR');
    s.activeCarIdx = idx;
    s.activeCarName = CAR_FLEET_MENU[idx]?.codeName ?? 'FERRARI 458 ITALIA';
    simState.stuntText = `SUPERCAR READY: ${s.activeCarName}`;
    simState.stuntTimer = 2.5;
    setUiTick((t) => t + 1);
  };

  const selectSpecificBoat = (idx: number) => {
    onSelectMode('BOAT');
    s.activeBoatIdx = idx;
    s.activeBoatName = BOAT_FLEET_MENU[idx]?.codeName ?? 'CIGARETTE RACING POWERBOAT';
    // Ensure boat is moored in deep water (Cruise Harbor for Cruise Ship, or Venetian Canal/Harbor)
    if (idx === 1) {
      simState.boatPos.set(234, 0.45, -95);
      simState.boatYaw = -1.15;
      simState.boatSpeed = 0;
    } else if (getTerrainHeight(simState.boatPos.x, simState.boatPos.z) > 0.1) {
      simState.boatPos.set(145, 0.5, -95);
      simState.boatYaw = -Math.PI / 2;
      simState.boatSpeed = 0;
    }
    simState.stuntText = `MARITIME VESSEL READY: ${s.activeBoatName}`;
    simState.stuntTimer = 2.5;
    setUiTick((t) => t + 1);
  };

  const selectSpecificPlane = (idx: number) => {
    onSelectMode('PLANE');
    s.activePlaneIdx = idx;
    s.activePlaneName = PLANE_FLEET_MENU[idx]?.codeName ?? 'GULFSTREAM G700 JET';
    simState.stuntText = `AIRCRAFT READY: ${s.activePlaneName}`;
    simState.stuntTimer = 2.5;
    setUiTick((t) => t + 1);
  };

  const warpToLocation = (x: number, z: number, forceMode?: VehicleMode, destId?: string) => {
    simState.parachuting = false;
    simState.gliding = false;

    if (forceMode) {
      onSelectMode(forceMode);
    }

    // Match against our 14 curated global landmark avenue viewpoints
    const matched =
      WORLD_LANDMARK_DESTINATIONS.find((d) => d.id === destId) ||
      WORLD_LANDMARK_DESTINATIONS.find((d) => Math.hypot(d.x - x, d.z - z) < 18);

    if (matched) {
      setSelectedLandmarkId(matched.id);
    }

    if (matched?.id === 'harbor' || (x > 195 && Math.abs(z + 95) < 25)) {
      simState.boatPos.set(234, 0.45, -95);
      simState.boatYaw = -1.15;
      simState.boatSpeed = 0;

      const footY = Math.max(getTerrainHeight(192, -74), 0.5) + 0.08;
      simState.playerPos.set(192, footY, -74);
      simState.playerYaw = Math.atan2(234 - 192, -95 - -74);
      simState.playerVel.set(0, 0, 0);

      const carY = Math.max(getTerrainHeight(186, -72), 0.5) + 0.1;
      simState.carPos.set(186, carY, -72);
      simState.carYaw = Math.atan2(234 - 186, -95 - -72);
      simState.carSpeed = 0;
    } else if (matched?.id === 'airport' || (z > 130 && x < -45)) {
      const footY = Math.max(getTerrainHeight(-132, 145), 0) + 0.08;
      simState.playerPos.set(-132, footY, 145);
      simState.playerYaw = Math.PI / 2;
      simState.playerVel.set(0, 0, 0);

      const carY = Math.max(getTerrainHeight(-138, 145), 0) + 0.1;
      simState.carPos.set(-138, carY, 145);
      simState.carYaw = Math.PI / 2;
      simState.carSpeed = 0;

      simState.planePos.set(-125, 22, 155);
      simState.planeYaw = Math.PI / 2;
      simState.planePitch = -0.02;
      simState.planeRoll = 0;
      simState.planeSpeed = 38;
      setUiTick((t) => t + 1);
      return;
    } else if (matched) {
      const carX = matched.spawnCarX;
      const carZ = matched.spawnCarZ;
      const footX = matched.spawnFootX;
      const footZ = matched.spawnFootZ;

      const carYaw = Math.atan2(matched.x - carX, matched.z - carZ);
      const footYaw = Math.atan2(matched.x - footX, matched.z - footZ);

      const footY = Math.max(getTerrainHeight(footX, footZ), 0) + 0.08;
      simState.playerPos.set(footX, footY, footZ);
      simState.playerYaw = footYaw;
      simState.playerVel.set(0, 0, 0);

      const carY = Math.max(getTerrainHeight(carX, carZ), 0) + 0.1;
      simState.carPos.set(carX, carY, carZ);
      simState.carYaw = carYaw;
      simState.carSpeed = 0;

      if (matched.id === 'venice') {
        simState.boatPos.set(104, 0.5, -95);
        simState.boatYaw = Math.PI / 2;
        simState.boatSpeed = 0;
      }
    } else {
      // Fallback for arbitrary radar click: place on open avenue side facing target
      const destZ = z + 38;
      const yawToTarget = Math.atan2(x - (x - 4.0), z - destZ);
      const footY = Math.max(getTerrainHeight(x - 4.0, destZ), 0) + 0.08;
      simState.playerPos.set(x - 4.0, footY, destZ);
      simState.playerYaw = yawToTarget;
      simState.playerVel.set(0, 0, 0);

      const carY = Math.max(getTerrainHeight(x + 6.0, destZ + 4), 0) + 0.1;
      simState.carPos.set(x + 6.0, carY, destZ + 4);
      simState.carYaw = Math.atan2(x - (x + 6.0), z - (destZ + 4));
      simState.carSpeed = 0;
    }

    // Position aircraft in scenic approach facing the landmark
    const planeDist = 85;
    const approachX = x * 0.65;
    const approachZ = z + planeDist;
    simState.planePos.set(
      approachX,
      Math.max(getTerrainHeight(x, z), 0) + 42,
      approachZ
    );
    simState.planeYaw = Math.atan2(x - approachX, z - approachZ);
    simState.planePitch = -0.04;
    simState.planeRoll = 0;
    simState.planeSpeed = 38;

    if (simState.mode === 'BOAT' && matched?.id !== 'harbor' && matched?.id !== 'venice') {
      // Keep boat in nearest navigable water channel
      if (Math.abs(z + 95) < 25 && x > 75) {
        simState.boatPos.set(Math.max(95, x - 28), 0.5, -95);
        simState.boatYaw = Math.PI / 2;
      } else {
        const angle = Math.atan2(z, x);
        const waterR = 238;
        const bx = Math.cos(angle) * waterR;
        const bz = Math.sin(angle) * waterR;
        simState.boatPos.set(bx, 0.5, bz);
        simState.boatYaw = Math.atan2(x - bx, z - bz);
      }
      simState.boatSpeed = 0;
    }

    if (matched) {
      simState.stuntText = `WARPED TO ${matched.fullTitle.toUpperCase()}`;
      simState.stuntTimer = 2.8;
    }
    setUiTick((t) => t + 1);
  };

  const handleSelectGameMode = (modeId: MetropolisGameMode) => {
    s.gameMode = modeId;
    if (modeId === 'GRAND_PRIX') {
      onSelectMode('CAR');
      simState.activeCheckpoint = 0;
      simState.lapTime = 0;
      const startY = Math.max(getTerrainHeight(0, 12), 0) + 0.1;
      simState.carPos.set(0, startY, 12);
      simState.carYaw = Math.PI;
      simState.carSpeed = 0;
      simState.stuntText = 'WORLD GRAND PRIX CIRCUIT — RACE THROUGH ALL 8 CHECKPOINTS!';
      simState.stuntTimer = 3.5;
    } else if (modeId === 'BATTLE_ROYALE') {
      simState.brActive = true;
      simState.stuntText = 'BATTLE ROYALE READY — CLICK DEPLOY FOR 120M SKY-DROP!';
      simState.stuntTimer = 3.2;
    } else if (modeId === 'LANDMARK_TOUR') {
      const target =
        WORLD_LANDMARK_DESTINATIONS.find((d) => d.id === selectedLandmarkId) ||
        WORLD_LANDMARK_DESTINATIONS[0];
      warpToLocation(target.x, target.z, undefined, target.id);
      simState.stuntText = `GLOBAL LANDMARK TOUR — ${target.fullTitle.toUpperCase()}`;
      simState.stuntTimer = 3.2;
    } else {
      simState.stuntText = 'FREE ROAM METROPOLIS — UNOBSTRUCTED CITY EXPLORATION';
      simState.stuntTimer = 3.0;
    }
    setUiTick((t) => t + 1);
  };

  const handleDeployToMetropolis = () => {
    s.startMenuOpen = false;
    simState.customizerOpen = false;

    const chosenDest =
      WORLD_LANDMARK_DESTINATIONS.find((d) => d.id === selectedLandmarkId) ||
      WORLD_LANDMARK_DESTINATIONS[0];

    if (activeGameMode === 'BATTLE_ROYALE') {
      window.dispatchEvent(new CustomEvent('br-drop'));
      simState.playerPos.set(chosenDest.spawnFootX, 118, chosenDest.spawnFootZ);
      simState.playerYaw = Math.atan2(
        chosenDest.x - chosenDest.spawnFootX,
        chosenDest.z - chosenDest.spawnFootZ
      );
      simState.stuntText = `SKY-DROP OVER ${chosenDest.fullTitle.toUpperCase()}!`;
      simState.stuntTimer = 4.0;
    } else if (activeGameMode === 'GRAND_PRIX') {
      onSelectMode('CAR');
      simState.activeCheckpoint = 0;
      simState.lapTime = 0;
      const startY = Math.max(getTerrainHeight(0, 12), 0) + 0.1;
      simState.carPos.set(0, startY, 12);
      simState.carYaw = Math.PI;
      simState.stuntText = 'WORLD GRAND PRIX CIRCUIT — GO! HIT ALL 8 CHECKPOINTS!';
      simState.stuntTimer = 3.8;
    }

    window.dispatchEvent(new CustomEvent('toggle-start-menu'));
    setUiTick((t) => t + 1);
  };

  const cycleNextLandmarkTour = () => {
    const idx = WORLD_LANDMARK_DESTINATIONS.findIndex((d) => d.id === selectedLandmarkId);
    const nextDest =
      WORLD_LANDMARK_DESTINATIONS[(idx + 1) % WORLD_LANDMARK_DESTINATIONS.length];
    warpToLocation(nextDest.x, nextDest.z, nextDest.forceMode, nextDest.id);
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

  const [aveTopX, aveTopZ] = worldToRadar(0, -210);
  const [aveBotX, aveBotZ] = worldToRadar(0, 175);
  const [midWestX, midWestZ] = worldToRadar(-150, 0);
  const [midEastX, midEastZ] = worldToRadar(150, 0);
  const [plazaX, plazaZ] = worldToRadar(0, -10);
  const [canalStartX, canalStartZ] = worldToRadar(82, -95);
  const [canalEndX, canalEndZ] = worldToRadar(238, -95);
  const [runwayStartX, runwayStartZ] = worldToRadar(-195, 155);
  const [runwayEndX, runwayEndZ] = worldToRadar(-45, 155);

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
  const activeCarIdx = typeof s.activeCarIdx === 'number' ? s.activeCarIdx : 0;
  const activeBoatIdx = typeof s.activeBoatIdx === 'number' ? s.activeBoatIdx : 0;
  const activePlaneIdx = typeof s.activePlaneIdx === 'number' ? s.activePlaneIdx : 0;

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

  const currentDestObj =
    WORLD_LANDMARK_DESTINATIONS.find((d) => d.id === selectedLandmarkId) ||
    WORLD_LANDMARK_DESTINATIONS[0];

  return (
    <div className="pointer-events-none fixed inset-0 z-20 select-none overflow-hidden">
      {/* =====================================================================
          1. UNOBSTRUCTED CENTER-SCREEN 4-TICK CROSSHAIR (FOOT / CAR COMBAT)
         ===================================================================== */}
      {!isStartMenuOpen && (hud.mode === 'FOOT' || hud.mode === 'CAR') && (
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
          SINGLE COMPACT FLOATING EVENT PILL NEAR TOP (top-24)
         ===================================================================== */}
      {notificationBanner && !isStartMenuOpen && (
        <div className="pointer-events-none fixed left-1/2 top-24 -translate-x-1/2 z-30">
          <div className="flex items-center gap-2 rounded-full border border-sky-400/75 bg-slate-950/90 px-3.5 py-1 text-[11px] font-mono font-black tracking-widest text-sky-200 shadow-lg shadow-slate-950/60 backdrop-blur-md">
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
      <div className="fixed inset-x-3 top-3 z-30 flex flex-wrap items-start justify-between gap-2">
        {/* LEFT: METROPOLIS Brand Badge, Prominent [M] START / MODE MENU Button, FPS, $CREDITS & Mute */}
        <div className="pointer-events-auto flex flex-wrap items-center gap-1.5 rounded-xl border border-white/15 bg-slate-950/85 px-2.5 py-1.5 font-mono shadow-lg backdrop-blur-md">
          <div className="flex items-center gap-1.5 pr-1 text-[11px] font-black tracking-wider text-sky-300">
            <Globe className="h-3.5 w-3.5 shrink-0 text-sky-400" />
            <span>METROPOLIS // WORLD HORIZON</span>
          </div>

          <button
            onClick={() => handleToggleStartMenu()}
            className={`flex items-center gap-1.5 rounded-lg border px-2.5 py-1 text-[10px] font-black tracking-wider shadow-md transition active:scale-95 ${
              isStartMenuOpen
                ? 'border-amber-300 bg-amber-400 text-slate-950 shadow-amber-400/40'
                : 'border-amber-400/85 bg-gradient-to-r from-amber-500/30 via-sky-500/25 to-cyan-500/30 text-amber-200 shadow-amber-500/20 hover:border-amber-300 hover:text-white'
            }`}
          >
            <LayoutGrid className="h-3 w-3" />
            <span>[M] SWITCH MODE / START MENU</span>
          </button>

          <span className="h-3.5 w-px bg-white/15" />

          <div className="rounded bg-emerald-500/15 px-1.5 py-0.5 text-[10px] font-bold text-emerald-300 border border-emerald-400/30">
            {hud.fps} FPS
          </div>
          <div className="rounded bg-sky-500/15 px-2 py-0.5 text-[10px] font-black tabular-nums text-sky-200 border border-sky-400/30">
            ${hud.chips.toLocaleString()} CREDITS
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

        {/* CENTER: Active Mode Telemetry + [P] SKY-DROP + [C] CHARACTER STUDIO */}
        <div className="pointer-events-auto flex flex-wrap items-center gap-1.5 rounded-xl border border-white/15 bg-slate-950/85 px-2.5 py-1.5 font-mono shadow-lg backdrop-blur-md">
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
          <div className="hidden items-center gap-1 rounded-md bg-cyan-500/15 px-2 py-0.5 text-[10px] font-bold text-cyan-200 border border-cyan-400/30 2xl:flex">
            <Flag className="h-3 w-3 text-cyan-400" />
            <span>
              NEXT GATE: {checkpointName} ({checkpointDist}m)
            </span>
          </div>

          {activeGameMode === 'LANDMARK_TOUR' && (
            <button
              onClick={cycleNextLandmarkTour}
              className="flex items-center gap-1 rounded-lg border border-emerald-400/75 bg-emerald-500/20 px-2 py-0.5 text-[10px] font-black tracking-wider text-emerald-200 hover:bg-emerald-500/35 hover:text-white active:scale-95 transition"
            >
              <Globe className="h-3 w-3 text-emerald-300" />
              <span>NEXT MONUMENT</span>
            </button>
          )}

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

        {/* RIGHT: All 12 Global Landmarks + Cruise Harbor + Airport Quick-Warp Pills & City Event Boost */}
        <div className="pointer-events-auto hidden max-w-[660px] flex-wrap items-center justify-end gap-1 rounded-xl border border-white/15 bg-slate-950/85 px-2 py-1 font-mono shadow-lg backdrop-blur-md lg:flex">
          {WORLD_LANDMARK_DESTINATIONS.map((lm) => {
            const isCurrent = selectedLandmarkId === lm.id;
            return (
              <button
                key={lm.id}
                onClick={() => warpToLocation(lm.x, lm.z, lm.forceMode, lm.id)}
                title={`Teleport to ${lm.fullTitle}`}
                className={`flex items-center gap-1 rounded-md border px-1.5 py-0.5 text-[9px] font-bold transition ${
                  isCurrent
                    ? 'border-sky-400/70 bg-sky-500/25 text-white'
                    : 'border-transparent bg-white/5 text-slate-200 hover:border-white/20 hover:bg-white/15 hover:text-white'
                }`}
              >
                <MapPin className="h-2.5 w-2.5 shrink-0" style={{ color: lm.color }} />
                <span>{lm.shortLabel}</span>
              </button>
            );
          })}
          <button
            onClick={() => triggerRouletteSpin()}
            title={`City Event & Credit Multiplier Boost (${hud.rouletteTimer}s)`}
            className="flex items-center gap-1 rounded-md border border-emerald-400/60 bg-emerald-500/15 px-2 py-0.5 text-[9px] font-black text-emerald-200 hover:bg-emerald-500/30 hover:text-white active:scale-95 transition"
          >
            <Zap className="h-3 w-3 text-emerald-400" />
            <span>[R] CITY BOOST ({hud.multiplier}x)</span>
          </button>
        </div>
      </div>

      {/* =====================================================================
          3. FULL-SCREEN GLASSMORPHIC START & MODE SELECTOR MENU
             (Opened via [M] / Escape / Tab / "SWITCH MODE / START MENU" button)
         ===================================================================== */}
      {isStartMenuOpen && (
        <div className="pointer-events-auto fixed inset-0 z-50 flex items-center justify-center bg-slate-950/75 p-3 sm:p-5 font-mono backdrop-blur-xl">
          <div className="flex max-h-[94vh] w-full max-w-7xl flex-col overflow-hidden rounded-3xl border border-sky-400/40 bg-slate-950/95 text-slate-100 shadow-2xl shadow-sky-950/80">
            {/* TOP COMMAND HEADER */}
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/10 bg-gradient-to-r from-sky-500/20 via-slate-900 to-amber-500/20 px-5 py-3.5">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-2xl border border-sky-400/50 bg-sky-500/20 text-sky-300 shadow-inner">
                  <Globe className="h-5 w-5" />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-sm sm:text-base font-black tracking-wider text-white">
                      METROPOLIS // START & MODE SELECTOR
                    </span>
                    <span className="rounded-full border border-sky-400/50 bg-sky-500/20 px-2 py-0.5 text-[9px] font-black text-sky-200">
                      12 WORLD LANDMARKS
                    </span>
                  </div>
                  <div className="text-[10px] text-slate-300">
                    Select your Gameplay Experience, Vehicle / Character Loadout, and Starting City Landmark District
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <button
                  onClick={handleDeployToMetropolis}
                  className="flex items-center gap-1.5 rounded-xl border border-emerald-300 bg-gradient-to-r from-emerald-500 to-cyan-500 px-4 py-2 text-xs font-black tracking-wider text-slate-950 shadow-lg shadow-emerald-500/25 hover:brightness-110 active:scale-95 transition"
                >
                  <Play className="h-3.5 w-3.5 fill-current" />
                  <span>DEPLOY TO METROPOLIS [ENTER]</span>
                </button>
                <button
                  onClick={() => handleToggleStartMenu(false)}
                  title="Close Start Menu [M / Esc]"
                  className="rounded-xl border border-white/15 bg-white/5 p-2 text-slate-300 hover:bg-white/15 hover:text-white transition"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            </div>

            {/* SCROLLABLE 3-STEP COMMAND BODY */}
            <div className="flex-1 space-y-4 overflow-y-auto p-4 sm:p-5">
              {/* STEP 1: SELECT GAMEPLAY EXPERIENCE */}
              <div>
                <div className="mb-2 flex items-center justify-between">
                  <div className="flex items-center gap-2 text-xs font-black uppercase tracking-widest text-sky-300">
                    <span className="flex h-5 w-5 items-center justify-center rounded-full bg-sky-500 text-[10px] text-slate-950">
                      1
                    </span>
                    <span>STEP 1 — SELECT GAMEPLAY EXPERIENCE</span>
                  </div>
                  <span className="text-[10px] text-slate-400">
                    Active Mode: <strong className="text-amber-300">{activeGameMode.replace('_', ' ')}</strong>
                  </span>
                </div>

                <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2 lg:grid-cols-4">
                  {GAMEPLAY_EXPERIENCES.map((exp) => {
                    const isSelected = activeGameMode === exp.id;
                    return (
                      <button
                        key={exp.id}
                        onClick={() => handleSelectGameMode(exp.id)}
                        className={`group flex flex-col justify-between rounded-2xl border p-3 text-left transition ${
                          isSelected
                            ? `bg-gradient-to-br ${exp.accent} ring-2 ring-amber-400 shadow-lg`
                            : 'border-white/10 bg-white/5 text-slate-300 hover:border-white/25 hover:bg-white/10'
                        }`}
                      >
                        <div>
                          <div className="mb-1 flex items-center justify-between gap-1">
                            <span className="rounded bg-slate-950/70 px-1.5 py-0.5 text-[9px] font-bold tracking-wider text-sky-300 border border-white/10">
                              {exp.badge}
                            </span>
                            {isSelected && <CheckCircle2 className="h-4 w-4 text-amber-300 shrink-0" />}
                          </div>
                          <div className="text-xs font-black text-white">{exp.title}</div>
                          <p className="mt-1 text-[10px] leading-relaxed text-slate-300/90">
                            {exp.desc}
                          </p>
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* STEP 2: SELECT TRAVERSAL MODE & EXACT VEHICLE MODEL */}
              <div>
                <div className="mb-2 flex items-center justify-between">
                  <div className="flex items-center gap-2 text-xs font-black uppercase tracking-widest text-amber-300">
                    <span className="flex h-5 w-5 items-center justify-center rounded-full bg-amber-400 text-[10px] text-slate-950">
                      2
                    </span>
                    <span>STEP 2 — SELECT TRAVERSAL MODE & EXACT VEHICLE / CHARACTER MODEL</span>
                  </div>
                  <span className="text-[10px] text-slate-400">
                    Current Traversal: <strong className="text-sky-300">{hud.mode}</strong>
                  </span>
                </div>

                <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-4">
                  {/* COLUMN 1: ON-FOOT / PARACHUTE / WARDROBE */}
                  <div
                    className={`flex flex-col justify-between rounded-2xl border p-3 transition ${
                      hud.mode === 'FOOT'
                        ? 'border-cyan-400/80 bg-cyan-500/15 ring-1 ring-cyan-400/60'
                        : 'border-white/10 bg-slate-900/75'
                    }`}
                  >
                    <div>
                      <button
                        onClick={() => onSelectMode('FOOT')}
                        className="mb-2 flex w-full items-center justify-between rounded-xl border border-cyan-400/40 bg-cyan-500/20 px-3 py-2 text-left transition hover:bg-cyan-500/30"
                      >
                        <div className="flex items-center gap-2">
                          <Footprints className="h-4 w-4 text-cyan-300" />
                          <div>
                            <div className="text-[11px] font-black text-white">
                              1. ON-FOOT / WARDROBE
                            </div>
                            <div className="text-[9px] text-cyan-200">
                              {custom.presetName || 'Metropolis Citizen'}
                            </div>
                          </div>
                        </div>
                        {hud.mode === 'FOOT' && (
                          <span className="rounded bg-cyan-400 px-1.5 py-0.5 text-[8px] font-black text-slate-950">
                            ACTIVE
                          </span>
                        )}
                      </button>

                      <div className="mb-1.5 text-[9px] font-bold uppercase tracking-wider text-slate-400">
                        Character Presets:
                      </div>
                      <div className="space-y-1">
                        {MENU_CHARACTER_PRESETS.map((item) => {
                          const basePreset =
                            CHARACTER_PRESETS[item.presetIdx] ?? CHARACTER_PRESETS[0];
                          const isSelected =
                            hud.mode === 'FOOT' && custom.presetName === item.label;
                          return (
                            <button
                              key={item.label}
                              onClick={() => {
                                onSelectMode('FOOT');
                                applyOutfitPreset(basePreset, item.patch);
                              }}
                              className={`flex w-full items-center justify-between rounded-lg border px-2.5 py-1.5 text-left text-[10px] transition ${
                                isSelected
                                  ? 'border-cyan-300 bg-cyan-500/30 text-white font-black'
                                  : 'border-white/10 bg-white/5 text-slate-200 hover:bg-white/10'
                              }`}
                            >
                              <div>
                                <div className="font-bold">{item.label}</div>
                                <div className="text-[8px] text-slate-400">{item.role}</div>
                              </div>
                              <ChevronRight className="h-3 w-3 text-cyan-300" />
                            </button>
                          );
                        })}
                      </div>
                    </div>

                    <div className="mt-2.5 grid grid-cols-2 gap-1.5 border-t border-white/10 pt-2">
                      <button
                        onClick={() => {
                          onSelectMode('FOOT');
                          handleToggleCustomizer();
                        }}
                        className="flex items-center justify-center gap-1 rounded-lg border border-cyan-400/60 bg-cyan-500/20 py-1.5 text-[9px] font-black text-cyan-200 hover:bg-cyan-500/35 hover:text-white transition"
                      >
                        <Shirt className="h-3 w-3" />
                        <span>3D WARDROBE</span>
                      </button>
                      <button
                        onClick={() => {
                          s.startMenuOpen = false;
                          window.dispatchEvent(new CustomEvent('br-drop'));
                          window.dispatchEvent(new CustomEvent('toggle-start-menu'));
                        }}
                        className="flex items-center justify-center gap-1 rounded-lg border border-amber-400/60 bg-amber-500/20 py-1.5 text-[9px] font-black text-amber-200 hover:bg-amber-500/35 hover:text-white transition"
                      >
                        <span>120M SKY-DROP</span>
                      </button>
                    </div>
                  </div>

                  {/* COLUMN 2: STREET SUPERCAR FLEET (5 CARS) */}
                  <div
                    className={`flex flex-col justify-between rounded-2xl border p-3 transition ${
                      hud.mode === 'CAR'
                        ? 'border-amber-400/80 bg-amber-500/15 ring-1 ring-amber-400/60'
                        : 'border-white/10 bg-slate-900/75'
                    }`}
                  >
                    <div>
                      <button
                        onClick={() => onSelectMode('CAR')}
                        className="mb-2 flex w-full items-center justify-between rounded-xl border border-amber-400/40 bg-amber-500/20 px-3 py-2 text-left transition hover:bg-amber-500/30"
                      >
                        <div className="flex items-center gap-2">
                          <Car className="h-4 w-4 text-amber-300" />
                          <div>
                            <div className="text-[11px] font-black text-white">
                              2. STREET SUPERCAR FLEET
                            </div>
                            <div className="text-[9px] text-amber-200">
                              {CAR_FLEET_MENU[activeCarIdx]?.label}
                            </div>
                          </div>
                        </div>
                        {hud.mode === 'CAR' && (
                          <span className="rounded bg-amber-400 px-1.5 py-0.5 text-[8px] font-black text-slate-950">
                            ACTIVE
                          </span>
                        )}
                      </button>

                      <div className="space-y-1">
                        {CAR_FLEET_MENU.map((car) => {
                          const isSelected = hud.mode === 'CAR' && activeCarIdx === car.idx;
                          return (
                            <button
                              key={car.idx}
                              onClick={() => selectSpecificCar(car.idx)}
                              className={`flex w-full items-center justify-between rounded-lg border px-2.5 py-1.5 text-left text-[10px] transition ${
                                isSelected
                                  ? 'border-amber-300 bg-amber-500/30 text-white font-black'
                                  : 'border-white/10 bg-white/5 text-slate-200 hover:bg-white/10'
                              }`}
                            >
                              <div>
                                <div className="font-bold">{car.label}</div>
                                <div className="text-[8px] text-slate-400">{car.spec}</div>
                              </div>
                              <ChevronRight className="h-3 w-3 text-amber-300" />
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  </div>

                  {/* COLUMN 3: MARITIME & CRUISE SHIP FLEET (6 VESSELS) */}
                  <div
                    className={`flex flex-col justify-between rounded-2xl border p-3 transition ${
                      hud.mode === 'BOAT'
                        ? 'border-teal-400/80 bg-teal-500/15 ring-1 ring-teal-400/60'
                        : 'border-white/10 bg-slate-900/75'
                    }`}
                  >
                    <div>
                      <button
                        onClick={() => selectSpecificBoat(activeBoatIdx)}
                        className="mb-2 flex w-full items-center justify-between rounded-xl border border-teal-400/40 bg-teal-500/20 px-3 py-2 text-left transition hover:bg-teal-500/30"
                      >
                        <div className="flex items-center gap-2">
                          <Ship className="h-4 w-4 text-teal-300" />
                          <div>
                            <div className="text-[11px] font-black text-white">
                              3. MARITIME & CRUISE FLEET
                            </div>
                            <div className="text-[9px] text-teal-200">
                              {BOAT_FLEET_MENU[activeBoatIdx]?.label}
                            </div>
                          </div>
                        </div>
                        {hud.mode === 'BOAT' && (
                          <span className="rounded bg-teal-400 px-1.5 py-0.5 text-[8px] font-black text-slate-950">
                            ACTIVE
                          </span>
                        )}
                      </button>

                      <div className="space-y-1">
                        {BOAT_FLEET_MENU.map((boat) => {
                          const isSelected = hud.mode === 'BOAT' && activeBoatIdx === boat.idx;
                          return (
                            <button
                              key={boat.idx}
                              onClick={() => selectSpecificBoat(boat.idx)}
                              className={`flex w-full items-center justify-between rounded-lg border px-2.5 py-1 text-left text-[10px] transition ${
                                isSelected
                                  ? 'border-teal-300 bg-teal-500/30 text-white font-black'
                                  : 'border-white/10 bg-white/5 text-slate-200 hover:bg-white/10'
                              }`}
                            >
                              <div>
                                <div className="font-bold">{boat.label}</div>
                                <div className="text-[8px] text-slate-400">{boat.spec}</div>
                              </div>
                              <ChevronRight className="h-3 w-3 text-teal-300" />
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  </div>

                  {/* COLUMN 4: AVIATION & HELICOPTER FLEET (6 AIRCRAFT) */}
                  <div
                    className={`flex flex-col justify-between rounded-2xl border p-3 transition ${
                      hud.mode === 'PLANE'
                        ? 'border-sky-400/80 bg-sky-500/15 ring-1 ring-sky-400/60'
                        : 'border-white/10 bg-slate-900/75'
                    }`}
                  >
                    <div>
                      <button
                        onClick={() => selectSpecificPlane(activePlaneIdx)}
                        className="mb-2 flex w-full items-center justify-between rounded-xl border border-sky-400/40 bg-sky-500/20 px-3 py-2 text-left transition hover:bg-sky-500/30"
                      >
                        <div className="flex items-center gap-2">
                          <Plane className="h-4 w-4 text-sky-300" />
                          <div>
                            <div className="text-[11px] font-black text-white">
                              4. AVIATION & HELICOPTERS
                            </div>
                            <div className="text-[9px] text-sky-200">
                              {PLANE_FLEET_MENU[activePlaneIdx]?.label}
                            </div>
                          </div>
                        </div>
                        {hud.mode === 'PLANE' && (
                          <span className="rounded bg-sky-400 px-1.5 py-0.5 text-[8px] font-black text-slate-950">
                            ACTIVE
                          </span>
                        )}
                      </button>

                      <div className="space-y-1">
                        {PLANE_FLEET_MENU.map((plane) => {
                          const isSelected = hud.mode === 'PLANE' && activePlaneIdx === plane.idx;
                          return (
                            <button
                              key={plane.idx}
                              onClick={() => selectSpecificPlane(plane.idx)}
                              className={`flex w-full items-center justify-between rounded-lg border px-2.5 py-1 text-left text-[10px] transition ${
                                isSelected
                                  ? 'border-sky-300 bg-sky-500/30 text-white font-black'
                                  : 'border-white/10 bg-white/5 text-slate-200 hover:bg-white/10'
                              }`}
                            >
                              <div>
                                <div className="font-bold">{plane.label}</div>
                                <div className="text-[8px] text-slate-400">{plane.spec}</div>
                              </div>
                              <ChevronRight className="h-3 w-3 text-sky-300" />
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {/* STEP 3: SELECT STARTING CITY LANDMARK / SPAWN DISTRICT (12 Global Landmarks + Harbor + Airport) */}
              <div>
                <div className="mb-2 flex items-center justify-between">
                  <div className="flex items-center gap-2 text-xs font-black uppercase tracking-widest text-emerald-300">
                    <span className="flex h-5 w-5 items-center justify-center rounded-full bg-emerald-400 text-[10px] text-slate-950">
                      3
                    </span>
                    <span>
                      STEP 3 — SELECT STARTING CITY LANDMARK / SPAWN DISTRICT (12 WORLD WONDERS + HARBOR & AIRPORT)
                    </span>
                  </div>
                  <span className="text-[10px] text-slate-400">
                    Selected District: <strong className="text-emerald-300">{currentDestObj.fullTitle}</strong>
                  </span>
                </div>

                <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-7">
                  {WORLD_LANDMARK_DESTINATIONS.map((lm) => {
                    const isSelected = selectedLandmarkId === lm.id;
                    return (
                      <button
                        key={lm.id}
                        onClick={() => warpToLocation(lm.x, lm.z, lm.forceMode, lm.id)}
                        onDoubleClick={() => {
                          warpToLocation(lm.x, lm.z, lm.forceMode, lm.id);
                          handleDeployToMetropolis();
                        }}
                        className={`flex flex-col justify-between rounded-xl border p-2.5 text-left transition ${
                          isSelected
                            ? 'border-emerald-300 bg-emerald-500/25 text-white ring-1 ring-emerald-300 shadow-md'
                            : 'border-white/10 bg-white/5 text-slate-300 hover:border-white/25 hover:bg-white/10 hover:text-white'
                        }`}
                      >
                        <div>
                          <div className="mb-1 flex items-center justify-between gap-1">
                            <span
                              className="inline-block h-2 w-2 rounded-full"
                              style={{ backgroundColor: lm.color }}
                            />
                            <span className="text-[8px] font-black tracking-wider text-slate-400">
                              {lm.cityBadge}
                            </span>
                          </div>
                          <div className="text-[10px] font-black leading-snug text-white">
                            {lm.fullTitle}
                          </div>
                        </div>
                        <div className="mt-1.5 flex items-center justify-between text-[8px] text-slate-400">
                          <span>
                            ({lm.x}, {lm.z})
                          </span>
                          <span className="font-bold text-emerald-300">
                            {isSelected ? 'READY' : 'WARP'}
                          </span>
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>

            {/* BOTTOM LAUNCH CTA BAR */}
            <div className="flex flex-wrap items-center justify-between gap-3 border-t border-white/10 bg-slate-900/95 px-5 py-3">
              <div className="flex flex-wrap items-center gap-3 text-[11px]">
                <span className="flex items-center gap-1.5 text-slate-300">
                  <Trophy className="h-3.5 w-3.5 text-amber-400" />
                  <span>Experience:</span>
                  <strong className="text-white">{activeGameMode.replace('_', ' ')}</strong>
                </span>
                <span className="text-slate-600">•</span>
                <span className="text-slate-300">
                  Mode:{' '}
                  <strong className="text-sky-300">
                    {hud.mode === 'CAR'
                      ? CAR_FLEET_MENU[activeCarIdx]?.label
                      : hud.mode === 'BOAT'
                      ? BOAT_FLEET_MENU[activeBoatIdx]?.label
                      : hud.mode === 'PLANE'
                      ? PLANE_FLEET_MENU[activePlaneIdx]?.label
                      : `ON-FOOT (${custom.presetName})`}
                  </strong>
                </span>
                <span className="text-slate-600">•</span>
                <span className="text-slate-300">
                  Spawn: <strong className="text-emerald-300">{currentDestObj.fullTitle}</strong>
                </span>
              </div>

              <button
                onClick={handleDeployToMetropolis}
                className="flex items-center gap-2 rounded-xl border border-emerald-300 bg-gradient-to-r from-emerald-400 via-teal-400 to-cyan-400 px-6 py-2.5 text-xs font-black tracking-widest text-slate-950 shadow-xl shadow-emerald-500/30 hover:brightness-110 active:scale-95 transition"
              >
                <Play className="h-4 w-4 fill-current" />
                <span>DEPLOY TO METROPOLIS [ENTER]</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* =====================================================================
          4. INTERACTIVE [C] 3D CHARACTER & WARDROBE STUDIO DRAWER
             (left-3 top-16 bottom-20 w-80)
         ===================================================================== */}
      {isCustomizerOpen && !isStartMenuOpen && (
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
                  const displayTitle =
                    preset.presetName === 'Vegas High Roller'
                      ? 'Metropolis Executive'
                      : preset.presetName === 'Vanguard Armored Operator'
                      ? 'Vanguard Operator'
                      : preset.presetName;
                  const active =
                    custom.presetName === preset.presetName ||
                    custom.presetName === displayTitle;
                  return (
                    <button
                      key={preset.presetName}
                      onClick={() =>
                        applyOutfitPreset(preset, { presetName: displayTitle })
                      }
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
                      <span className="truncate">{displayTitle}</span>
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
          5. COMPACT BOTTOM-LEFT CORNER (bottom-3 left-3):
             136x136 GPS Radar Minimap + Shield/HP + Mode & Start Menu Dock
         ===================================================================== */}
      <div className="pointer-events-auto fixed bottom-3 left-3 z-30 flex items-end gap-2.5">
        {/* Circular 136x136 GPS Radar Minimap */}
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

            {/* Metropolis Grand Central Avenue & Midtown Crosstown Grid Lines */}
            <line
              x1={aveTopX}
              y1={aveTopZ}
              x2={aveBotX}
              y2={aveBotZ}
              stroke="rgba(56, 189, 248, 0.45)"
              strokeWidth="3"
              strokeLinecap="round"
            />
            <line
              x1={midWestX}
              y1={midWestZ}
              x2={midEastX}
              y2={midEastZ}
              stroke="rgba(148, 163, 184, 0.35)"
              strokeWidth="2.2"
              strokeLinecap="round"
            />
            <circle
              cx={plazaX}
              cy={plazaZ}
              r={4.5}
              fill="rgba(14, 165, 233, 0.25)"
              stroke="rgba(56, 189, 248, 0.65)"
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

          {/* All 12 Global Landmarks + Harbor + Airport Pins (Click to Quick-Warp) */}
          {WORLD_LANDMARK_DESTINATIONS.map((lm) => {
            const [mx, mz] = worldToRadar(lm.x, lm.z);
            return (
              <button
                key={lm.id}
                onClick={() => warpToLocation(lm.x, lm.z, lm.forceMode, lm.id)}
                title={`Warp to ${lm.fullTitle}`}
                style={{ left: `${mx}px`, top: `${mz}px`, backgroundColor: lm.color }}
                className="absolute h-2.5 w-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full border border-slate-950 shadow transition-transform hover:scale-150"
              />
            );
          })}
        </div>

        {/* Compact Shield/Health + Mode Switcher + Start Menu Selector + Fleet Switcher */}
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

          {/* Vehicle Mode Switcher (1 Foot · 2 Car · 3 Boat · 4 Plane) + [M] START / MODE MENU */}
          <div className="flex flex-wrap items-center gap-1">
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
                  onClick={() => {
                    onSelectMode(id);
                    handleToggleStartMenu(true);
                  }}
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

            <button
              onClick={() => handleToggleStartMenu()}
              title="Open Full-Screen Start & Mode Selector Menu [M]"
              className="flex items-center gap-1 rounded-lg border border-amber-400/75 bg-amber-500/20 px-2 py-1 text-[10px] font-black text-amber-200 hover:bg-amber-500/35 hover:text-white active:scale-95 transition"
            >
              <LayoutGrid className="h-3 w-3 text-amber-300" />
              <span>[M] MODE MENU</span>
            </button>
          </div>

          {/* Context-Aware Model Fleet Switcher + Always-Accessible Customize Button */}
          <div className="flex items-center gap-1.5">
            {hud.mode === 'CAR' && (
              <button
                onClick={() => window.dispatchEvent(new CustomEvent('cycle-car'))}
                className="flex flex-1 items-center justify-center gap-1.5 rounded-lg border border-amber-400/60 bg-amber-500/20 px-2.5 py-1 text-[10px] font-black tracking-wide text-amber-200 hover:bg-amber-500/30 hover:text-white active:scale-95 transition"
              >
                <Car className="h-3 w-3 text-amber-400" />
                <span>
                  [V] {hud.activeCarName || CAR_FLEET_MENU[activeCarIdx]?.codeName} (5 CARS)
                </span>
              </button>
            )}

            {hud.mode === 'BOAT' && (
              <button
                onClick={() => window.dispatchEvent(new CustomEvent('cycle-boat'))}
                className="flex flex-1 items-center justify-center gap-1.5 rounded-lg border border-cyan-400/60 bg-cyan-500/20 px-2.5 py-1 text-[10px] font-black tracking-wide text-cyan-200 hover:bg-cyan-500/30 hover:text-white active:scale-95 transition"
              >
                <Ship className="h-3 w-3 text-cyan-400" />
                <span>
                  [B] {hud.activeBoatName || BOAT_FLEET_MENU[activeBoatIdx]?.codeName} (6 VESSELS)
                </span>
              </button>
            )}

            {hud.mode === 'PLANE' && (
              <button
                onClick={() => window.dispatchEvent(new CustomEvent('cycle-plane'))}
                className="flex flex-1 items-center justify-center gap-1.5 rounded-lg border border-sky-400/60 bg-sky-500/20 px-2.5 py-1 text-[10px] font-black tracking-wide text-sky-200 hover:bg-sky-500/30 hover:text-white active:scale-95 transition"
              >
                <Plane className="h-3 w-3 text-sky-400" />
                <span>
                  [B] {hud.activePlaneName || PLANE_FLEET_MENU[activePlaneIdx]?.codeName} (6 AIRCRAFT)
                </span>
              </button>
            )}

            {hud.mode === 'FOOT' && (
              <button
                onClick={handleToggleCustomizer}
                className="flex flex-1 items-center justify-center gap-1.5 rounded-lg border border-cyan-400/75 bg-cyan-500/20 px-2.5 py-1 text-[10px] font-black tracking-wide text-cyan-200 hover:bg-cyan-500/35 hover:text-white active:scale-95 transition"
              >
                <Shirt className="h-3 w-3 text-cyan-400" />
                <span>[C] CUSTOMIZE OUTFIT ({custom.presetName})</span>
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
          6. COMPACT BOTTOM-RIGHT CORNER (bottom-3 right-3):
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
