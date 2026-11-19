import React, { useEffect, useState } from 'react';
import {
  Car,
  Plane,
  Ship,
  Footprints,
  Compass,
  Volume2,
  VolumeX,
  Crosshair,
  Shield,
  Heart,
  Shirt,
  Glasses,
  Backpack,
  UserCheck,
  X,
  Gamepad2,
  MapPin,
  ChevronRight,
  RotateCcw,
  Flag,
  Skull,
  Radio,
  Globe,
  Navigation,
  Maximize2,
  Minimize2,
} from 'lucide-react';
import {
  CHARACTER_PRESETS,
  CharacterArchetype,
  CharacterCustomization,
  EyewearStyle,
  GameHudSnapshot,
  GamePlayMode,
  simState,
  WEAPON_SPECS,
} from '../game/store';
import { getTerrainHeight, VehicleMode } from '../game/worldMath';
import { soundEngine } from '../game/soundEngine';
import { MobileControls } from './MobileControls';

interface Props {
  hud: GameHudSnapshot;
  onSelectMode: (m: VehicleMode) => void;
}

export type MetropolisGameMode = GamePlayMode;

const RADAR_SIZE = 128;
const RADAR_CENTER = RADAR_SIZE / 2; // 64
const RADAR_SCALE = 52 / 260;

function worldToRadar(x: number, z: number): [number, number] {
  const rx = Math.max(7, Math.min(RADAR_SIZE - 7, RADAR_CENTER + x * RADAR_SCALE));
  const rz = Math.max(7, Math.min(RADAR_SIZE - 7, RADAR_CENTER + z * RADAR_SCALE));
  return [rx, rz];
}

function formatLapTime(seconds: number): string {
  const safe = Math.max(0, seconds);
  const mins = Math.floor(safe / 60);
  const secs = Math.floor(safe % 60);
  const tenths = Math.floor((safe * 10) % 10);
  return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}.${tenths}`;
}

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

const GAME_MODE_OPTIONS: Array<{
  id: GamePlayMode;
  title: string;
  description: string;
  badge: string;
}> = [
  {
    id: 'FREE_ROAM',
    title: 'Free Roam',
    description: 'Drive, fly, sail, or walk freely across the city.',
    badge: 'Sandbox',
  },
  {
    id: 'BATTLE_ROYALE',
    title: 'Battle Royale',
    description: 'Parachute from 120m, loot crates & outlast 8 bots inside the storm.',
    badge: 'Combat',
  },
  {
    id: 'GRAND_PRIX',
    title: 'Grand Prix',
    description: 'Race the 8-checkpoint street circuit for the fastest lap.',
    badge: 'Circuit',
  },
  {
    id: 'WORLD_TOUR',
    title: 'World Tour',
    description: 'Guided tour of all 12 global city landmarks.',
    badge: '12 Wonders',
  },
];

const CAR_FLEET_MENU = [
  { idx: 0, label: 'Ferrari 458', codeName: 'FERRARI 458 ITALIA' },
  { idx: 1, label: 'GT3 Supercar', codeName: 'GT3 GYMKHANA SUPERCAR' },
  { idx: 2, label: '80s Wedge', codeName: '80S WEDGE SUPERCAR' },
  { idx: 3, label: 'Classic Muscle', codeName: '60S CLASSIC MUSCLE' },
  { idx: 4, label: 'Stretch Limo', codeName: 'EXECUTIVE STRETCH LIMO' },
];

const BOAT_FLEET_MENU = [
  { idx: 0, label: 'Racing Powerboat', codeName: 'CIGARETTE RACING POWERBOAT' },
  { idx: 1, label: 'Oasis Cruise Ship', codeName: 'OASIS OF AZUREA CRUISE LINER' },
  { idx: 2, label: 'Royal Tall Ship', codeName: 'ROYAL SOVEREIGN TALL SHIP' },
  { idx: 3, label: 'Sloop Yacht', codeName: 'MEDITERRANEAN SLOOP YACHT' },
  { idx: 4, label: 'Motor Yacht', codeName: 'AEGEAN MOTOR YACHT' },
  { idx: 5, label: 'Submarine', codeName: 'DEEP-SEA EXPLORER SUBMARINE' },
];

const PLANE_FLEET_MENU = [
  { idx: 0, label: 'Gulfstream Jet', codeName: 'GULFSTREAM G700 JET' },
  { idx: 1, label: 'VIP Helicopter', codeName: 'BELL VIP HELICOPTER' },
  { idx: 2, label: 'Mustang Fighter', codeName: 'MUSTANG STRIKE FIGHTER' },
  { idx: 3, label: 'Regional Turboprop', codeName: 'TWIN REGIONAL TURBOPROP' },
  { idx: 4, label: 'Boeing 737 Airliner', codeName: 'BOEING 737 EXECUTIVE LINER' },
  { idx: 5, label: 'Heavy Cargo Jet', codeName: 'HEAVY STRATEGIC CARGO JET' },
];

const MENU_CHARACTER_PRESETS: Array<{
  label: string;
  presetIdx: number;
  patch?: Partial<CharacterCustomization>;
}> = [
  {
    label: 'City Executive',
    presetIdx: 0,
    patch: { presetName: 'City Executive', topColor: '#1e293b', bottomColor: '#0f172a' },
  },
  {
    label: 'Spec-Ops',
    presetIdx: 5,
    patch: { presetName: 'Spec-Ops' },
  },
  {
    label: 'Street Racer',
    presetIdx: 1,
    patch: { presetName: 'Street Racer' },
  },
  {
    label: 'Modern Casual',
    presetIdx: 3,
    patch: { presetName: 'Modern Casual' },
  },
];

export interface LandmarkDestination {
  id: string;
  shortLabel: string;
  menuLabel: string;
  fullTitle: string;
  cityBadge: string;
  note: string;
  isWorldWonder?: boolean;
  x: number;
  z: number;
  color: string;
  forceMode?: VehicleMode;
  spawnCarX: number;
  spawnCarZ: number;
  spawnFootX: number;
  spawnFootZ: number;
}

export const WORLD_LANDMARK_DESTINATIONS: LandmarkDestination[] = [
  {
    id: 'empire',
    shortLabel: 'NYC Empire',
    menuLabel: 'New York',
    fullTitle: 'Empire State Building',
    cityBadge: 'NEW YORK',
    note: 'Art Deco limestone skyscraper anchoring Midtown Avenue with its stepped spire.',
    isWorldWonder: true,
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
    menuLabel: 'Golden Gate',
    fullTitle: 'Golden Gate Bridge',
    cityBadge: 'SAN FRANCISCO',
    note: 'Twin International Orange suspension towers spanning the northern bay channel.',
    isWorldWonder: true,
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
    menuLabel: 'London',
    fullTitle: 'Big Ben Clock Tower',
    cityBadge: 'LONDON',
    note: 'Neo-Gothic Westminster spire crowned by four illuminated gilded clock faces.',
    isWorldWonder: true,
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
    menuLabel: 'Paris',
    fullTitle: 'Eiffel Tower',
    cityBadge: 'PARIS',
    note: 'Wrought-iron lattice tower rising above the eastern Champ de Mars promenade.',
    isWorldWonder: true,
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
    menuLabel: 'Dubai',
    fullTitle: 'Burj Khalifa',
    cityBadge: 'DUBAI',
    note: 'Tiered stainless-and-glass megatall tower soaring above the northern skyline.',
    isWorldWonder: true,
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
    menuLabel: 'Rome',
    fullTitle: 'The Colosseum',
    cityBadge: 'ROME',
    note: 'Elliptical travertine amphitheater ringed by three tiers of classical arcades.',
    isWorldWonder: true,
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
    menuLabel: 'Sydney',
    fullTitle: 'Sydney Opera House',
    cityBadge: 'SYDNEY',
    note: 'Sculptural precast concrete sail shells overlooking the southeastern harbor.',
    isWorldWonder: true,
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
    menuLabel: 'Tokyo',
    fullTitle: 'Tokyo Tower',
    cityBadge: 'TOKYO',
    note: 'Aviation-orange and white steel communications spire lighting up central boulevard.',
    isWorldWonder: true,
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
    menuLabel: 'Statue of Liberty',
    fullTitle: 'Statue of Liberty',
    cityBadge: 'NY HARBOR',
    note: 'Patina-green neoclassical copper monument holding its golden torch over the bay.',
    isWorldWonder: true,
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
    shortLabel: 'Rio',
    menuLabel: 'Rio',
    fullTitle: 'Christ the Redeemer',
    cityBadge: 'RIO DE JANEIRO',
    note: 'Art Deco soapstone monument standing watch from the southern coastal peak.',
    isWorldWonder: true,
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
    shortLabel: 'Venice',
    menuLabel: 'Venice',
    fullTitle: 'Rialto Bridge & Grand Canal',
    cityBadge: 'VENICE',
    note: 'Renaissance stone arch spanning the turquoise Venetian canalway.',
    isWorldWonder: true,
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
    shortLabel: 'Pyramids',
    menuLabel: 'Pyramids',
    fullTitle: 'Great Pyramid of Giza',
    cityBadge: 'CAIRO / GIZA',
    note: 'Monumental stepped limestone pyramid rising from the western golden plateau.',
    isWorldWonder: true,
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
    menuLabel: 'Cruise Harbor',
    fullTitle: 'Cruise Harbor',
    cityBadge: 'MARITIME PORT',
    note: 'Deep-water pier and marina berth for ocean liners, yachts, and speedboats.',
    isWorldWonder: false,
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
    menuLabel: 'Airport',
    fullTitle: 'International Airport',
    cityBadge: 'AVIATION HUB',
    note: 'Coastal runway and terminal apron ready for jet, turboprop, and heli departures.',
    isWorldWonder: false,
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

const WORLD_TOUR_STOPS = WORLD_LANDMARK_DESTINATIONS.filter((d) => d.isWorldWonder);

export function HUD({ hud, onSelectMode }: Props) {
  const [muted, setMuted] = useState(soundEngine.isMuted());
  const [, setUiTick] = useState(0);
  const [selectedLandmarkId, setSelectedLandmarkId] = useState<string>('empire');
  const [mobileTeleportOpen, setMobileTeleportOpen] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);

  useEffect(() => {
    const onFsChange = () => {
      setIsFullscreen(Boolean(document.fullscreenElement));
    };
    const onResize = () => {
      if (window.innerWidth < 900) {
        setTouchUi(true);
      }
    };
    document.addEventListener('fullscreenchange', onFsChange);
    window.addEventListener('resize', onResize);
    return () => {
      document.removeEventListener('fullscreenchange', onFsChange);
      window.removeEventListener('resize', onResize);
    };
  }, []);

  const handleToggleFullscreen = () => {
    try {
      const docEl = document.documentElement as HTMLElement & {
        webkitRequestFullscreen?: () => Promise<void> | void;
      };
      const doc = document as Document & {
        webkitExitFullscreen?: () => Promise<void> | void;
      };
      if (!document.fullscreenElement) {
        if (docEl.requestFullscreen) void docEl.requestFullscreen();
        else if (docEl.webkitRequestFullscreen) void docEl.webkitRequestFullscreen();
      } else {
        if (doc.exitFullscreen) void doc.exitFullscreen();
        else if (doc.webkitExitFullscreen) void doc.webkitExitFullscreen();
      }
    } catch {
      // Ignore if fullscreen API is blocked
    }
  };
  const [touchUi, setTouchUi] = useState<boolean>(() => {
    if (typeof window === 'undefined') return false;
    return (
      window.innerWidth < 900 ||
      'ontouchstart' in window ||
      (typeof navigator !== 'undefined' && navigator.maxTouchPoints > 0)
    );
  });

  useEffect(() => {
    simState.touchControlsEnabled = touchUi;
  }, [touchUi]);

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
  const activeGameMode: GamePlayMode = (s.gameMode as GamePlayMode) || 'FREE_ROAM';

  const handleToggleMute = () => {
    soundEngine.toggleMute();
    setMuted(soundEngine.isMuted());
  };

  const handleToggleStartMenu = (forceState?: boolean) => {
    const next = typeof forceState === 'boolean' ? forceState : !Boolean(s.startMenuOpen);
    s.startMenuOpen = next;
    if (next) {
      simState.customizerOpen = false;
      setMobileTeleportOpen(false);
    }
    window.dispatchEvent(new CustomEvent('toggle-start-menu'));
    setUiTick((t) => t + 1);
  };

  const handleToggleCustomizer = () => {
    const prev = Boolean(simState.customizerOpen);
    s.startMenuOpen = false;
    setMobileTeleportOpen(false);
    window.dispatchEvent(new CustomEvent('toggle-customizer'));
    if (Boolean(simState.customizerOpen) === prev) {
      simState.customizerOpen = !prev;
    }
    setUiTick((t) => t + 1);
  };

  const handleSelectGameMode = (mode: GamePlayMode) => {
    s.gameMode = mode;
    if (mode === 'GRAND_PRIX' && simState.mode !== 'CAR') {
      onSelectMode('CAR');
    } else if (mode === 'BATTLE_ROYALE' && simState.mode !== 'FOOT') {
      onSelectMode('FOOT');
    }
    setUiTick((t) => t + 1);
  };

  const updateCustomization = (patch: Partial<CharacterCustomization>) => {
    Object.assign(simState.customization, patch);
    simState.customizationVersion = (simState.customizationVersion || 0) + 1;
    window.dispatchEvent(new CustomEvent('customizer-updated'));
    setUiTick((t) => t + 1);
  };

  const applyOutfitPreset = (
    preset: CharacterCustomization,
    extraPatch?: Partial<CharacterCustomization>
  ) => {
    Object.assign(simState.customization, preset, extraPatch || {});
    simState.customizationVersion = (simState.customizationVersion || 0) + 1;
    window.dispatchEvent(new CustomEvent('customizer-updated'));
    setUiTick((t) => t + 1);
  };

  const selectSpecificCar = (idx: number) => {
    onSelectMode('CAR');
    s.activeCarIdx = idx;
    s.activeCarName = CAR_FLEET_MENU[idx]?.codeName ?? 'FERRARI 458 ITALIA';
    simState.stuntText = `${CAR_FLEET_MENU[idx]?.label ?? 'Car'} Selected`;
    simState.stuntTimer = 2.0;
    setUiTick((t) => t + 1);
  };

  const selectSpecificBoat = (idx: number) => {
    onSelectMode('BOAT');
    s.activeBoatIdx = idx;
    s.activeBoatName = BOAT_FLEET_MENU[idx]?.codeName ?? 'CIGARETTE RACING POWERBOAT';
    if (idx === 1) {
      simState.boatPos.set(234, 0.45, -95);
      simState.boatYaw = -1.15;
      simState.boatSpeed = 0;
    } else if (getTerrainHeight(simState.boatPos.x, simState.boatPos.z) > 0.1) {
      simState.boatPos.set(145, 0.5, -95);
      simState.boatYaw = -Math.PI / 2;
      simState.boatSpeed = 0;
    }
    simState.stuntText = `${BOAT_FLEET_MENU[idx]?.label ?? 'Boat'} Selected`;
    simState.stuntTimer = 2.0;
    setUiTick((t) => t + 1);
  };

  const selectSpecificPlane = (idx: number) => {
    onSelectMode('PLANE');
    s.activePlaneIdx = idx;
    s.activePlaneName = PLANE_FLEET_MENU[idx]?.codeName ?? 'GULFSTREAM G700 JET';
    simState.stuntText = `${PLANE_FLEET_MENU[idx]?.label ?? 'Aircraft'} Selected`;
    simState.stuntTimer = 2.0;
    setUiTick((t) => t + 1);
  };

  const markTourVisited = (id: string) => {
    if (!WORLD_TOUR_STOPS.some((d) => d.id === id)) return;
    if (!Array.isArray(simState.tourVisitedIds)) {
      simState.tourVisitedIds = [];
    }
    if (!simState.tourVisitedIds.includes(id)) {
      simState.tourVisitedIds = [...simState.tourVisitedIds, id];
    }
  };

  const warpToLocation = (x: number, z: number, forceMode?: VehicleMode, destId?: string) => {
    simState.parachuting = false;
    simState.gliding = false;
    setMobileTeleportOpen(false);

    if (forceMode) {
      onSelectMode(forceMode);
    }

    const matched =
      WORLD_LANDMARK_DESTINATIONS.find((d) => d.id === destId) ||
      WORLD_LANDMARK_DESTINATIONS.find((d) => Math.hypot(d.x - x, d.z - z) < 18);

    if (matched) {
      setSelectedLandmarkId(matched.id);
      if (activeGameMode === 'WORLD_TOUR') {
        markTourVisited(matched.id);
      }
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
      simState.stuntText = `${matched.cityBadge} · ${matched.fullTitle}`;
      simState.stuntTimer = 2.2;
    }
    setUiTick((t) => t + 1);
  };

  const resetGrandPrixRace = () => {
    onSelectMode('CAR');
    simState.activeCheckpoint = 0;
    simState.lapTime = 0;
    simState.driftScore = 0;
    const startY = Math.max(getTerrainHeight(0, 12), 0) + 0.1;
    simState.carPos.set(0, startY, 12);
    simState.carYaw = Math.PI;
    simState.carSpeed = 0;
    simState.carVel.set(0, 0, 0);
    simState.stuntText = 'Grand Prix — Gate 1 Ahead';
    simState.stuntTimer = 2.6;
    setUiTick((t) => t + 1);
  };

  const handleNextTourLandmark = () => {
    const currentIdx = WORLD_TOUR_STOPS.findIndex((d) => d.id === selectedLandmarkId);
    const nextIdx = (currentIdx + 1) % WORLD_TOUR_STOPS.length;
    const nextStop = WORLD_TOUR_STOPS[nextIdx] ?? WORLD_TOUR_STOPS[0];
    markTourVisited(nextStop.id);
    warpToLocation(nextStop.x, nextStop.z, undefined, nextStop.id);
  };

  const handleStartGame = () => {
    if (document.activeElement instanceof HTMLElement) {
      document.activeElement.blur();
    }
    simState.keys.clear();
    s.startMenuOpen = false;
    simState.customizerOpen = false;
    setMobileTeleportOpen(false);

    const chosenDest =
      WORLD_LANDMARK_DESTINATIONS.find((d) => d.id === selectedLandmarkId) ||
      WORLD_LANDMARK_DESTINATIONS[0];

    if (activeGameMode === 'BATTLE_ROYALE') {
      simState.brActive = true;
      simState.playerHp = 100;
      simState.playerShield = 100;
      window.dispatchEvent(new CustomEvent('br-drop'));
      simState.playerPos.set(chosenDest.spawnFootX, 120, chosenDest.spawnFootZ);
      simState.playerYaw = Math.atan2(
        chosenDest.x - chosenDest.spawnFootX,
        chosenDest.z - chosenDest.spawnFootZ
      );
      simState.stuntText = `Sky-Drop · ${chosenDest.menuLabel}`;
      simState.stuntTimer = 3.0;
    } else if (activeGameMode === 'GRAND_PRIX') {
      simState.lapCount = 0;
      resetGrandPrixRace();
    } else if (activeGameMode === 'WORLD_TOUR') {
      const startStop =
        WORLD_TOUR_STOPS.find((d) => d.id === selectedLandmarkId) || WORLD_TOUR_STOPS[0];
      simState.tourVisitedIds = [startStop.id];
      setSelectedLandmarkId(startStop.id);
      warpToLocation(startStop.x, startStop.z, undefined, startStop.id);
    } else {
      warpToLocation(chosenDest.x, chosenDest.z, chosenDest.forceMode, chosenDest.id);
    }

    window.dispatchEvent(new CustomEvent('toggle-start-menu'));
    setUiTick((t) => t + 1);
  };

  // Resolve active player / vehicle position & heading for radar
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

  const totalCheckpoints = simState.checkpoints.length;
  const activeCpIndex =
    (hud.activeCheckpoint ?? simState.activeCheckpoint) % Math.max(1, totalCheckpoints);
  const activeCp = simState.checkpoints[activeCpIndex] ?? simState.checkpoints[0];
  const cpDistMeters = Math.round(
    hud.checkpointDist ??
      Math.hypot(activePos.x - activeCp.position[0], activePos.z - activeCp.position[2])
  );
  const lapTime = hud.lapTime ?? simState.lapTime ?? 0;
  const bestLapTime = hud.bestLapTime ?? simState.bestLapTime ?? null;
  const lapCount = hud.lapCount ?? simState.lapCount ?? 0;
  const stuntCallout = hud.stuntText ?? simState.stuntText;
  const driftScore = Math.round(hud.driftScore ?? simState.driftScore);

  const [playerRx, playerRz] = worldToRadar(activePos.x, activePos.z);
  const [cpRx, cpRz] = worldToRadar(activeCp.position[0], activeCp.position[2]);

  const fwdX = Math.sin(activeYaw);
  const fwdZ = Math.cos(activeYaw);
  const rightX = fwdZ;
  const rightZ = -fwdX;

  const coneLen = 24;
  const coneHalfWidth = 11;
  const coneLeftX = playerRx + fwdX * coneLen - rightX * coneHalfWidth;
  const coneLeftZ = playerRz + fwdZ * coneLen - rightZ * coneHalfWidth;
  const coneRightX = playerRx + fwdX * coneLen + rightX * coneHalfWidth;
  const coneRightZ = playerRz + fwdZ * coneLen + rightZ * coneHalfWidth;

  const tipX = playerRx + fwdX * 6.5;
  const tipZ = playerRz + fwdZ * 6.5;
  const wingLX = playerRx - fwdX * 4.5 - rightX * 3.8;
  const wingLZ = playerRz - fwdZ * 4.5 - rightZ * 3.8;
  const tailX = playerRx - fwdX * 2.0;
  const tailZ = playerRz - fwdZ * 2.0;
  const wingRX = playerRx - fwdX * 4.5 + rightX * 3.8;
  const wingRZ = playerRz - fwdZ * 4.5 + rightZ * 3.8;

  const [aveTopX, aveTopZ] = worldToRadar(0, -210);
  const [aveBotX, aveBotZ] = worldToRadar(0, 175);
  const [midWestX, midWestZ] = worldToRadar(-150, 0);
  const [midEastX, midEastZ] = worldToRadar(150, 0);
  const [canalStartX, canalStartZ] = worldToRadar(82, -95);
  const [canalEndX, canalEndZ] = worldToRadar(238, -95);
  const [runwayStartX, runwayStartZ] = worldToRadar(-195, 155);
  const [runwayEndX, runwayEndZ] = worldToRadar(-45, 155);

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
  const aliveBotsCount = simState.botTargets.filter((b) => b.alive).length + 1;
  const aliveCount = hud.aliveCount ?? aliveBotsCount;
  const eliminations = hud.eliminations ?? simState.eliminations ?? 0;
  const stormRadius = Math.round(hud.stormRadius ?? simState.stormRadius ?? 235);

  const isCustomizerOpen = Boolean(simState.customizerOpen);
  const custom = simState.customization;
  const activeCarIdx = typeof s.activeCarIdx === 'number' ? s.activeCarIdx : 0;
  const activeBoatIdx = typeof s.activeBoatIdx === 'number' ? s.activeBoatIdx : 0;
  const activePlaneIdx = typeof s.activePlaneIdx === 'number' ? s.activePlaneIdx : 0;

  const activeTourStop =
    WORLD_TOUR_STOPS.find((d) => d.id === selectedLandmarkId) || WORLD_TOUR_STOPS[0];
  const tourVisitedCount = Math.max(
    1,
    Math.min(WORLD_TOUR_STOPS.length, (simState.tourVisitedIds || []).length || 1)
  );

  const notificationBanner =
    (activeGameMode === 'BATTLE_ROYALE' ? killFeedText : null) ||
    stuntCallout ||
    (activeGameMode === 'GRAND_PRIX' && driftScore > 0 ? `Drift +${driftScore}` : null) ||
    (hud.nearbyVehicle ? `Press E to enter ${hud.nearbyVehicle.toLowerCase()}` : null) ||
    hud.nearLandmark ||
    null;

  const currentFinish =
    custom.topRoughness >= 0.48
      ? 'MATTE'
      : custom.topMetalness >= 0.35 || custom.topRoughness <= 0.22
      ? 'LEATHER'
      : 'SATIN';

  // =========================================================================
  // FULL-SCREEN CLEAN START SCREEN (Renders ALONE over live 3D city skyline)
  // =========================================================================
  if (isStartMenuOpen) {
    return (
      <div className="pointer-events-auto fixed inset-0 z-50 flex select-none bg-gradient-to-r from-neutral-950/92 via-neutral-950/65 to-transparent font-sans text-white">
        <div className="flex h-full w-full max-w-md flex-col justify-between overflow-y-auto px-6 py-6 sm:max-w-lg sm:px-8 sm:py-8">
          <div className="space-y-6">
            {/* Brand Title */}
            <div>
              <h1 className="text-3xl font-semibold tracking-tight text-white sm:text-4xl">
                World Horizon
              </h1>
              <p className="mt-1 text-sm text-neutral-400">Open-World City Sandbox</p>
            </div>

            {/* Section 1 — Game Mode (4 Clearly Defined Game Modes) */}
            <div>
              <div className="mb-2.5 text-[11px] font-semibold uppercase tracking-wider text-neutral-400">
                Game Mode
              </div>
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                {GAME_MODE_OPTIONS.map((gm) => {
                  const selected = activeGameMode === gm.id;
                  return (
                    <button
                      key={gm.id}
                      onClick={() => handleSelectGameMode(gm.id)}
                      className={`group flex flex-col items-start rounded-xl border p-3 text-left transition ${
                        selected
                          ? 'border-white bg-white/15 text-white shadow-sm'
                          : 'border-white/10 bg-white/[0.04] text-neutral-300 hover:border-white/25 hover:bg-white/[0.08] hover:text-white'
                      }`}
                    >
                      <div className="flex w-full items-center justify-between gap-2">
                        <span className="text-sm font-semibold text-white">{gm.title}</span>
                        <span
                          className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${
                            selected
                              ? 'bg-white text-neutral-950'
                              : 'bg-white/10 text-neutral-300'
                          }`}
                        >
                          {gm.badge}
                        </span>
                      </div>
                      <p className="mt-1 text-[11px] leading-snug text-neutral-400 group-hover:text-neutral-300">
                        {gm.description}
                      </p>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Section 2 — Traversal & Vehicle / Character */}
            <div>
              <div className="mb-2.5 text-[11px] font-semibold uppercase tracking-wider text-neutral-400">
                Traversal &amp;{' '}
                {hud.mode === 'CAR'
                  ? 'Vehicle'
                  : hud.mode === 'BOAT'
                  ? 'Vessel'
                  : hud.mode === 'PLANE'
                  ? 'Aircraft'
                  : 'Character'}
              </div>

              <div className="mb-2.5 grid grid-cols-4 gap-1.5 rounded-xl border border-white/10 bg-white/[0.04] p-1">
                {(
                  [
                    { id: 'FOOT', label: 'Walk', Icon: Footprints },
                    { id: 'CAR', label: 'Drive', Icon: Car },
                    { id: 'BOAT', label: 'Boats', Icon: Ship },
                    { id: 'PLANE', label: 'Fly', Icon: Plane },
                  ] as const
                ).map(({ id, label, Icon }) => {
                  const active = hud.mode === id;
                  return (
                    <button
                      key={id}
                      onClick={() => onSelectMode(id)}
                      className={`flex items-center justify-center gap-1.5 rounded-lg py-2 text-xs font-medium transition ${
                        active
                          ? 'bg-white text-neutral-950 shadow-sm'
                          : 'text-neutral-300 hover:bg-white/10 hover:text-white'
                      }`}
                    >
                      <Icon className="h-3.5 w-3.5" />
                      <span>{label}</span>
                    </button>
                  );
                })}
              </div>

              {hud.mode === 'CAR' && (
                <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-3">
                  {CAR_FLEET_MENU.map((car) => {
                    const isSelected = activeCarIdx === car.idx;
                    return (
                      <button
                        key={car.idx}
                        onClick={() => selectSpecificCar(car.idx)}
                        className={`rounded-xl border px-3 py-2 text-left text-xs font-medium transition ${
                          isSelected
                            ? 'border-white bg-white/15 text-white'
                            : 'border-white/10 bg-white/[0.04] text-neutral-300 hover:bg-white/10 hover:text-white'
                        }`}
                      >
                        {car.label}
                      </button>
                    );
                  })}
                </div>
              )}

              {hud.mode === 'BOAT' && (
                <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-3">
                  {BOAT_FLEET_MENU.map((boat) => {
                    const isSelected = activeBoatIdx === boat.idx;
                    return (
                      <button
                        key={boat.idx}
                        onClick={() => selectSpecificBoat(boat.idx)}
                        className={`rounded-xl border px-3 py-2 text-left text-xs font-medium transition ${
                          isSelected
                            ? 'border-white bg-white/15 text-white'
                            : 'border-white/10 bg-white/[0.04] text-neutral-300 hover:bg-white/10 hover:text-white'
                        }`}
                      >
                        {boat.label}
                      </button>
                    );
                  })}
                </div>
              )}

              {hud.mode === 'PLANE' && (
                <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-3">
                  {PLANE_FLEET_MENU.map((plane) => {
                    const isSelected = activePlaneIdx === plane.idx;
                    return (
                      <button
                        key={plane.idx}
                        onClick={() => selectSpecificPlane(plane.idx)}
                        className={`rounded-xl border px-3 py-2 text-left text-xs font-medium transition ${
                          isSelected
                            ? 'border-white bg-white/15 text-white'
                            : 'border-white/10 bg-white/[0.04] text-neutral-300 hover:bg-white/10 hover:text-white'
                        }`}
                      >
                        {plane.label}
                      </button>
                    );
                  })}
                </div>
              )}

              {hud.mode === 'FOOT' && (
                <div className="space-y-2">
                  <div className="grid grid-cols-2 gap-1.5">
                    {MENU_CHARACTER_PRESETS.map((item) => {
                      const basePreset =
                        CHARACTER_PRESETS[item.presetIdx] ?? CHARACTER_PRESETS[0];
                      const isSelected = custom.presetName === item.label;
                      return (
                        <button
                          key={item.label}
                          onClick={() => {
                            onSelectMode('FOOT');
                            applyOutfitPreset(basePreset, item.patch);
                          }}
                          className={`rounded-xl border px-3 py-2 text-left text-xs font-medium transition ${
                            isSelected
                              ? 'border-white bg-white/15 text-white'
                              : 'border-white/10 bg-white/[0.04] text-neutral-300 hover:bg-white/10 hover:text-white'
                          }`}
                        >
                          {item.label}
                        </button>
                      );
                    })}
                  </div>
                  <button
                    onClick={() => {
                      onSelectMode('FOOT');
                      handleToggleCustomizer();
                    }}
                    className="flex w-full items-center justify-center gap-2 rounded-xl border border-white/10 bg-white/[0.05] py-2 text-xs font-medium text-neutral-200 transition hover:bg-white/10 hover:text-white"
                  >
                    <Shirt className="h-3.5 w-3.5" />
                    <span>Customize Outfit</span>
                  </button>
                </div>
              )}
            </div>

            {/* Section 3 — Starting Location */}
            <div>
              <div className="mb-2.5 text-[11px] font-semibold uppercase tracking-wider text-neutral-400">
                Starting Location
              </div>
              <div className="flex flex-wrap gap-1.5">
                {WORLD_LANDMARK_DESTINATIONS.map((lm) => {
                  const isSelected = selectedLandmarkId === lm.id;
                  return (
                    <button
                      key={lm.id}
                      onClick={() => warpToLocation(lm.x, lm.z, lm.forceMode, lm.id)}
                      className={`rounded-full border px-3 py-1 text-xs font-medium transition ${
                        isSelected
                          ? 'border-white bg-white text-neutral-950'
                          : 'border-white/10 bg-white/[0.04] text-neutral-300 hover:bg-white/10 hover:text-white'
                      }`}
                    >
                      {lm.menuLabel}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>

          {/* Bottom CTA */}
          <div className="mt-6 pt-4">
            <button
              onClick={handleStartGame}
              className="w-full rounded-xl bg-white py-3 text-sm font-semibold text-neutral-950 shadow-lg transition hover:bg-neutral-200 active:scale-[0.99]"
            >
              Start Game
            </button>
          </div>
        </div>
      </div>
    );
  }

  // =========================================================================
  // IN-GAME HUD (Mode-Specific & Mobile-Friendly)
  // =========================================================================
  return (
    <div className="pointer-events-none fixed inset-0 z-20 select-none overflow-hidden font-sans">
      {/* 1. CENTER CROSSHAIR (Battle Royale on foot / driving) */}
      {activeGameMode === 'BATTLE_ROYALE' && (hud.mode === 'FOOT' || hud.mode === 'CAR') && (
        <div className="pointer-events-none fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2">
          <div
            className={`relative h-5 w-5 transition-transform duration-150 ${
              killFeedText ? 'scale-125' : 'scale-100'
            }`}
          >
            <span className="absolute left-1/2 top-0 h-1.5 w-[1.5px] -translate-x-1/2 rounded-full bg-white/80" />
            <span className="absolute bottom-0 left-1/2 h-1.5 w-[1.5px] -translate-x-1/2 rounded-full bg-white/80" />
            <span className="absolute left-0 top-1/2 h-[1.5px] w-1.5 -translate-y-1/2 rounded-full bg-white/80" />
            <span className="absolute right-0 top-1/2 h-[1.5px] w-1.5 -translate-y-1/2 rounded-full bg-white/80" />
            <span className="absolute left-1/2 top-1/2 h-1 w-1 -translate-x-1/2 -translate-y-1/2 rounded-full bg-white" />
          </div>
        </div>
      )}

      {/* 2. TOP-LEFT BAR */}
      <div className="pointer-events-auto fixed left-3 top-3 z-30 flex items-center gap-1 rounded-full border border-white/10 bg-neutral-950/75 px-2 py-1.5 shadow-lg backdrop-blur-md">
        <button
          onClick={() => handleToggleStartMenu(true)}
          className="rounded-full bg-white/10 px-2.5 py-1 text-xs font-medium text-white transition hover:bg-white/20"
        >
          <span className="hidden sm:inline">Menu (M)</span>
          <span className="sm:hidden">Menu</span>
        </button>

        <button
          onClick={handleToggleCustomizer}
          className={`rounded-full px-2.5 py-1 text-xs font-medium transition ${
            isCustomizerOpen
              ? 'bg-white text-neutral-950'
              : 'text-neutral-200 hover:bg-white/10 hover:text-white'
          }`}
        >
          <span className="hidden sm:inline">Wardrobe (C)</span>
          <span className="sm:hidden">Outfit</span>
        </button>

        <button
          onClick={() => setTouchUi((v) => !v)}
          title={touchUi ? 'Hide Touch Controls' : 'Show Touch Controls'}
          className={`flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-medium transition ${
            touchUi
              ? 'bg-white text-neutral-950'
              : 'text-neutral-200 hover:bg-white/10 hover:text-white'
          }`}
        >
          <Gamepad2 className="h-3.5 w-3.5" />
          <span>Touch</span>
        </button>

        <button
          onClick={handleToggleFullscreen}
          title={isFullscreen ? 'Exit Fullscreen' : 'Enter Fullscreen'}
          className="rounded-full p-1.5 text-neutral-300 transition hover:bg-white/10 hover:text-white"
        >
          {isFullscreen ? <Minimize2 className="h-3.5 w-3.5" /> : <Maximize2 className="h-3.5 w-3.5" />}
        </button>

        <button
          onClick={handleToggleMute}
          title={muted ? 'Unmute Audio' : 'Mute Audio'}
          className="rounded-full p-1.5 text-neutral-300 transition hover:bg-white/10 hover:text-white"
        >
          {muted ? <VolumeX className="h-3.5 w-3.5" /> : <Volume2 className="h-3.5 w-3.5" />}
        </button>
      </div>

      {/* 3. TOP-RIGHT FAST-TRAVEL (Desktop Pills + Compact Mobile Teleport Dropdown) */}
      <div className="pointer-events-auto fixed right-3 top-3 z-30">
        {/* Desktop pills (lg+) */}
        <div className="hidden max-w-[540px] flex-wrap items-center justify-end gap-1 rounded-2xl border border-white/10 bg-neutral-950/75 px-2.5 py-1.5 shadow-lg backdrop-blur-md xl:flex">
          {WORLD_LANDMARK_DESTINATIONS.map((lm) => {
            const isCurrent = selectedLandmarkId === lm.id;
            return (
              <button
                key={lm.id}
                onClick={() => warpToLocation(lm.x, lm.z, lm.forceMode, lm.id)}
                title={`${lm.cityBadge} — ${lm.fullTitle}`}
                className={`rounded-full px-2.5 py-0.5 text-[11px] font-medium transition ${
                  isCurrent
                    ? 'bg-white text-neutral-950'
                    : 'text-neutral-300 hover:bg-white/10 hover:text-white'
                }`}
              >
                {lm.shortLabel}
              </button>
            );
          })}
        </div>

        {/* Compact Teleport Dropdown (< xl, including phones & tablets) */}
        <div className="relative xl:hidden">
          <button
            onClick={() => setMobileTeleportOpen((o) => !o)}
            className="flex items-center gap-1.5 rounded-full border border-white/10 bg-neutral-950/75 px-3 py-1.5 text-xs font-medium text-white shadow-lg backdrop-blur-md transition hover:bg-neutral-900"
          >
            <MapPin className="h-3.5 w-3.5 text-sky-400" />
            <span>Teleport</span>
          </button>

          {mobileTeleportOpen && (
            <div className="absolute right-0 mt-2 max-h-72 w-56 overflow-y-auto rounded-2xl border border-white/10 bg-neutral-950/92 p-2 shadow-2xl backdrop-blur-md">
              <div className="mb-1 px-2 text-[10px] font-semibold uppercase tracking-wider text-neutral-400">
                Fast Travel
              </div>
              <div className="flex flex-col gap-0.5">
                {WORLD_LANDMARK_DESTINATIONS.map((lm) => {
                  const isCurrent = selectedLandmarkId === lm.id;
                  return (
                    <button
                      key={lm.id}
                      onClick={() => warpToLocation(lm.x, lm.z, lm.forceMode, lm.id)}
                      className={`flex items-center justify-between rounded-xl px-2.5 py-1.5 text-left text-xs font-medium transition ${
                        isCurrent
                          ? 'bg-white text-neutral-950'
                          : 'text-neutral-200 hover:bg-white/10'
                      }`}
                    >
                      <span>{lm.menuLabel}</span>
                      <span
                        className="h-2 w-2 rounded-full"
                        style={{ backgroundColor: lm.color }}
                      />
                    </button>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* 4. MODE-SPECIFIC TOP-CENTER HUD STRIPS */}
      {activeGameMode === 'BATTLE_ROYALE' && (
        <div className="pointer-events-auto fixed left-1/2 top-14 z-30 -translate-x-1/2 sm:top-16">
          <div className="flex items-center gap-3 rounded-full border border-white/15 bg-neutral-950/80 px-4 py-1.5 text-xs text-white shadow-xl backdrop-blur-md">
            <div className="flex items-center gap-1.5">
              <span className="h-2 w-2 rounded-full bg-emerald-400" />
              <span className="text-neutral-400">Alive</span>
              <span className="font-semibold tabular-nums">{aliveCount}</span>
            </div>
            <span className="h-3.5 w-px bg-white/15" />
            <div className="flex items-center gap-1.5">
              <Skull className="h-3.5 w-3.5 text-rose-400" />
              <span className="text-neutral-400">Elims</span>
              <span className="font-semibold tabular-nums">{eliminations}</span>
            </div>
            <span className="h-3.5 w-px bg-white/15" />
            <div className="flex items-center gap-1.5">
              <Radio className="h-3.5 w-3.5 text-violet-400" />
              <span className="hidden text-neutral-400 sm:inline">Storm</span>
              <span className="font-semibold tabular-nums">{stormRadius}m</span>
            </div>
            <span className="h-3.5 w-px bg-white/15" />
            <button
              onClick={() => window.dispatchEvent(new CustomEvent('br-drop'))}
              className="rounded-full bg-white px-2.5 py-0.5 text-[11px] font-semibold text-neutral-950 transition hover:bg-neutral-200"
            >
              Drop Again (P)
            </button>
          </div>
        </div>
      )}

      {activeGameMode === 'GRAND_PRIX' && (
        <div className="pointer-events-auto fixed left-1/2 top-14 z-30 w-[92vw] max-w-xl -translate-x-1/2 sm:top-16 sm:w-auto">
          <div className="flex flex-wrap items-center justify-center gap-x-3 gap-y-1 rounded-2xl border border-white/15 bg-neutral-950/80 px-4 py-2 text-xs text-white shadow-xl backdrop-blur-md">
            <div className="flex items-center gap-1.5">
              <Flag className="h-3.5 w-3.5 text-amber-400" />
              <span className="text-neutral-400">Lap</span>
              <span className="font-semibold tabular-nums">{lapCount + 1}</span>
            </div>
            <span className="h-3.5 w-px bg-white/15" />
            <div className="flex items-center gap-1.5">
              <span className="text-neutral-400">Gate</span>
              <span className="font-semibold tabular-nums">
                {activeCpIndex + 1} / {totalCheckpoints}
              </span>
            </div>
            <span className="hidden h-3.5 w-px bg-white/15 sm:inline" />
            <div className="flex items-center gap-1.5">
              <Navigation className="h-3.5 w-3.5 text-sky-400" />
              <span className="max-w-[140px] truncate font-medium text-neutral-200">
                {activeCp.name}
              </span>
              <span className="font-semibold tabular-nums text-sky-300">{cpDistMeters}m</span>
            </div>
            <span className="h-3.5 w-px bg-white/15" />
            <div className="flex items-center gap-2 tabular-nums">
              <span>
                <span className="text-neutral-400">Time </span>
                <span className="font-semibold">{formatLapTime(lapTime)}</span>
              </span>
              {bestLapTime !== null && (
                <span>
                  <span className="text-neutral-400">Best </span>
                  <span className="font-semibold text-emerald-400">
                    {formatLapTime(bestLapTime)}
                  </span>
                </span>
              )}
              {driftScore > 0 && (
                <span className="font-semibold text-amber-300">Drift {driftScore}</span>
              )}
            </div>
            <button
              onClick={resetGrandPrixRace}
              className="flex items-center gap-1 rounded-full bg-white/10 px-2.5 py-0.5 text-[11px] font-medium text-white transition hover:bg-white/20"
            >
              <RotateCcw className="h-3 w-3" />
              <span>Restart Race</span>
            </button>
          </div>
        </div>
      )}

      {activeGameMode === 'WORLD_TOUR' && (
        <div className="pointer-events-auto fixed left-1/2 top-14 z-30 w-[92vw] max-w-md -translate-x-1/2 sm:top-16">
          <div className="flex items-center justify-between gap-3 rounded-2xl border border-white/15 bg-neutral-950/82 px-4 py-2.5 text-white shadow-xl backdrop-blur-md">
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <Globe className="h-3.5 w-3.5 shrink-0 text-sky-400" />
                <span className="text-[10px] font-semibold uppercase tracking-wider text-sky-300">
                  {activeTourStop.cityBadge}
                </span>
                <span className="rounded-full bg-white/10 px-2 py-0.5 text-[10px] font-semibold tabular-nums text-neutral-200">
                  {tourVisitedCount} / {WORLD_TOUR_STOPS.length}
                </span>
              </div>
              <div className="mt-0.5 truncate text-sm font-semibold text-white">
                {activeTourStop.fullTitle}
              </div>
              <p className="mt-0.5 line-clamp-1 text-[11px] text-neutral-400">
                {activeTourStop.note}
              </p>
            </div>
            <button
              onClick={handleNextTourLandmark}
              className="flex shrink-0 items-center gap-1 rounded-xl bg-white px-3 py-2 text-xs font-semibold text-neutral-950 transition hover:bg-neutral-200"
            >
              <span>Next Landmark</span>
              <ChevronRight className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>
      )}

      {/* FLOATING NOTIFICATION PILL */}
      {notificationBanner && (
        <div className="pointer-events-none fixed left-1/2 top-28 z-20 -translate-x-1/2 sm:top-32">
          <div className="flex items-center gap-2 rounded-full border border-white/15 bg-neutral-950/80 px-4 py-1.5 text-xs font-medium text-white shadow-lg backdrop-blur-md">
            {activeGameMode === 'BATTLE_ROYALE' && killFeedText && (
              <Crosshair className="h-3.5 w-3.5 text-rose-400" />
            )}
            <span>{notificationBanner}</span>
          </div>
        </div>
      )}

      {/* 5. CHARACTER WARDROBE DRAWER */}
      {isCustomizerOpen && (
        <div className="pointer-events-auto fixed bottom-24 left-3 top-16 z-40 flex w-72 flex-col overflow-hidden rounded-2xl border border-white/10 bg-neutral-950/90 font-sans text-white shadow-2xl backdrop-blur-md sm:w-76">
          <div className="flex items-center justify-between border-b border-white/10 px-4 py-3">
            <div className="flex items-center gap-2">
              <Shirt className="h-4 w-4 text-neutral-300" />
              <span className="text-xs font-semibold">Wardrobe</span>
            </div>
            <button
              onClick={handleToggleCustomizer}
              className="rounded-full p-1 text-neutral-400 transition hover:bg-white/10 hover:text-white"
              title="Close Wardrobe"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          <div className="flex-1 space-y-4 overflow-y-auto p-4 text-xs">
            {/* Outfit Presets */}
            <div>
              <div className="mb-1.5 text-[11px] font-medium text-neutral-400">Presets</div>
              <div className="grid grid-cols-2 gap-1.5">
                {CHARACTER_PRESETS.map((preset) => {
                  const displayTitle =
                    preset.presetName === 'Vegas High Roller'
                      ? 'City Executive'
                      : preset.presetName === 'Vanguard Armored Operator'
                      ? 'Spec-Ops'
                      : preset.presetName;
                  const active =
                    custom.presetName === preset.presetName ||
                    custom.presetName === displayTitle;
                  return (
                    <button
                      key={preset.presetName}
                      onClick={() => applyOutfitPreset(preset, { presetName: displayTitle })}
                      className={`flex items-center gap-2 rounded-lg border px-2.5 py-1.5 text-left text-[11px] font-medium transition ${
                        active
                          ? 'border-white bg-white/15 text-white'
                          : 'border-white/10 bg-white/5 text-neutral-300 hover:bg-white/10 hover:text-white'
                      }`}
                    >
                      <span
                        className="h-2.5 w-2.5 shrink-0 rounded-full border border-white/30"
                        style={{ backgroundColor: preset.topColor }}
                      />
                      <span className="truncate">{displayTitle}</span>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Character Model */}
            <div>
              <div className="mb-1.5 text-[11px] font-medium text-neutral-400">Character</div>
              <div className="grid grid-cols-3 gap-1.5">
                {(
                  [
                    { id: 'RPM_CUSTOM', label: 'Standard' },
                    { id: 'MICHELLE_VIP', label: 'VIP' },
                    { id: 'VANGUARD_SOLDIER', label: 'Tactical' },
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
                      className={`rounded-lg border py-1.5 text-center text-[11px] font-medium transition ${
                        active
                          ? 'border-white bg-white/15 text-white'
                          : 'border-white/10 bg-white/5 text-neutral-300 hover:bg-white/10'
                      }`}
                    >
                      {item.label}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Jacket / Top Color */}
            <div>
              <div className="mb-1.5 text-[11px] font-medium text-neutral-400">Top Color</div>
              <div className="mb-2 flex flex-wrap items-center gap-2">
                {STUDIO_TOP_COLORS.map((hex) => {
                  const active = custom.topColor.toLowerCase() === hex.toLowerCase();
                  return (
                    <button
                      key={hex}
                      onClick={() => updateCustomization({ topColor: hex })}
                      style={{ backgroundColor: hex }}
                      className={`h-6 w-6 rounded-full border transition-transform ${
                        active
                          ? 'scale-110 border-2 border-white'
                          : 'border-white/30 hover:scale-105'
                      }`}
                    />
                  );
                })}
              </div>
              <div className="grid grid-cols-3 gap-1.5">
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
                      className={`rounded-lg border py-1 text-[11px] font-medium transition ${
                        isSelected
                          ? 'border-white bg-white/15 text-white'
                          : 'border-white/10 bg-white/5 text-neutral-300 hover:bg-white/10'
                      }`}
                    >
                      {fin.label}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Bottoms */}
            <div>
              <div className="mb-1.5 text-[11px] font-medium text-neutral-400">Pants</div>
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
                          ? 'scale-110 border-2 border-white'
                          : 'border-white/30 hover:scale-105'
                      }`}
                    />
                  );
                })}
              </div>
            </div>

            {/* Footwear */}
            <div>
              <div className="mb-1.5 text-[11px] font-medium text-neutral-400">Shoes</div>
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
                          ? 'scale-110 border-2 border-white'
                          : 'border-white/30 hover:scale-105'
                      }`}
                    />
                  );
                })}
              </div>
            </div>

            {/* Skin Tone */}
            <div>
              <div className="mb-1.5 text-[11px] font-medium text-neutral-400">Skin Tone</div>
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
                          ? 'scale-110 border-2 border-white'
                          : 'border-white/30 hover:scale-105'
                      }`}
                    />
                  );
                })}
              </div>
            </div>

            {/* Accessories */}
            <div className="space-y-2 border-t border-white/10 pt-3">
              <div className="text-[11px] font-medium text-neutral-400">Accessories</div>
              <div className="grid grid-cols-3 gap-1.5">
                <button
                  onClick={() => updateCustomization({ headwearOn: !custom.headwearOn })}
                  className={`rounded-lg border py-1.5 text-[11px] font-medium transition ${
                    custom.headwearOn
                      ? 'border-white bg-white/15 text-white'
                      : 'border-white/10 bg-white/5 text-neutral-400 hover:text-white'
                  }`}
                >
                  Cap
                </button>
                <button
                  onClick={() => updateCustomization({ beardOn: !custom.beardOn })}
                  className={`flex items-center justify-center gap-1 rounded-lg border py-1.5 text-[11px] font-medium transition ${
                    custom.beardOn
                      ? 'border-white bg-white/15 text-white'
                      : 'border-white/10 bg-white/5 text-neutral-400 hover:text-white'
                  }`}
                >
                  <UserCheck className="h-3 w-3" />
                  <span>Beard</span>
                </button>
                <button
                  onClick={() => updateCustomization({ backpackOn: !custom.backpackOn })}
                  className={`flex items-center justify-center gap-1 rounded-lg border py-1.5 text-[11px] font-medium transition ${
                    custom.backpackOn
                      ? 'border-white bg-white/15 text-white'
                      : 'border-white/10 bg-white/5 text-neutral-400 hover:text-white'
                  }`}
                >
                  <Backpack className="h-3 w-3" />
                  <span>Pack</span>
                </button>
              </div>

              {custom.headwearOn && (
                <div className="flex items-center justify-between rounded-lg bg-white/5 px-2.5 py-1.5">
                  <span className="text-[11px] text-neutral-300">Cap Color</span>
                  <div className="flex items-center gap-1.5">
                    {STUDIO_CAP_COLORS.map((hex) => (
                      <button
                        key={hex}
                        onClick={() => updateCustomization({ headwearColor: hex })}
                        style={{ backgroundColor: hex }}
                        className={`h-4 w-4 rounded-full border ${
                          custom.headwearColor.toLowerCase() === hex.toLowerCase()
                            ? 'scale-110 border-white'
                            : 'border-white/30'
                        }`}
                      />
                    ))}
                  </div>
                </div>
              )}

              <div>
                <div className="mb-1 flex items-center gap-1 text-[11px] text-neutral-400">
                  <Glasses className="h-3 w-3" />
                  <span>Eyewear</span>
                </div>
                <div className="grid grid-cols-3 gap-1.5">
                  {(
                    [
                      { id: 'NONE', label: 'None' },
                      { id: 'AVIATOR_GOLD', label: 'Aviators' },
                      { id: 'CYBER_VISOR', label: 'Visor' },
                    ] as Array<{ id: EyewearStyle; label: string }>
                  ).map((ew) => {
                    const active = custom.eyewear === ew.id;
                    return (
                      <button
                        key={ew.id}
                        onClick={() => updateCustomization({ eyewear: ew.id })}
                        className={`rounded-lg border py-1 text-[11px] font-medium transition ${
                          active
                            ? 'border-white bg-white/15 text-white'
                            : 'border-white/10 bg-white/5 text-neutral-300 hover:bg-white/10'
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

      {/* 6. BOTTOM-LEFT: Minimap + Mode-Aware Status + Traversal Switcher
             Hidden on small screens when touch controls are active so thumbstick has full space */}
      <div
        className={`pointer-events-auto fixed bottom-3 left-3 z-30 items-end gap-2.5 ${
          touchUi ? 'hidden sm:flex' : 'flex'
        }`}
      >
        {/* Clean circular 128x128 Minimap */}
        <div
          style={{ width: `${RADAR_SIZE}px`, height: `${RADAR_SIZE}px` }}
          className="relative hidden shrink-0 overflow-hidden rounded-full border border-white/15 bg-neutral-950/75 shadow-xl backdrop-blur-md sm:block"
        >
          <svg
            width={RADAR_SIZE}
            height={RADAR_SIZE}
            viewBox={`0 0 ${RADAR_SIZE} ${RADAR_SIZE}`}
            className="absolute inset-0"
          >
            <defs>
              <radialGradient id="radarConeGrad" cx="50%" cy="50%" r="50%">
                <stop offset="0%" stopColor="#ffffff" stopOpacity="0.28" />
                <stop offset="100%" stopColor="#ffffff" stopOpacity="0.02" />
              </radialGradient>
            </defs>

            <circle
              cx={RADAR_CENTER}
              cy={RADAR_CENTER}
              r={48}
              fill="none"
              stroke="rgba(255, 255, 255, 0.08)"
              strokeWidth="1"
            />
            <circle
              cx={RADAR_CENTER}
              cy={RADAR_CENTER}
              r={26}
              fill="none"
              stroke="rgba(255, 255, 255, 0.08)"
              strokeDasharray="2 3"
              strokeWidth="1"
            />

            <line
              x1={canalStartX}
              y1={canalStartZ}
              x2={canalEndX}
              y2={canalEndZ}
              stroke="rgba(56, 189, 248, 0.4)"
              strokeWidth="4.5"
              strokeLinecap="round"
            />
            <line
              x1={runwayStartX}
              y1={runwayStartZ}
              x2={runwayEndX}
              y2={runwayEndZ}
              stroke="rgba(163, 163, 163, 0.4)"
              strokeWidth="4"
              strokeLinecap="round"
            />
            <line
              x1={aveTopX}
              y1={aveTopZ}
              x2={aveBotX}
              y2={aveBotZ}
              stroke="rgba(255, 255, 255, 0.25)"
              strokeWidth="2.5"
              strokeLinecap="round"
            />
            <line
              x1={midWestX}
              y1={midWestZ}
              x2={midEastX}
              y2={midEastZ}
              stroke="rgba(255, 255, 255, 0.2)"
              strokeWidth="2"
              strokeLinecap="round"
            />

            {activeGameMode === 'GRAND_PRIX' && (
              <circle cx={cpRx} cy={cpRz} r={3.5} fill="#fbbf24" />
            )}

            {activeGameMode === 'BATTLE_ROYALE' &&
              simState.botTargets.map((bot) => {
                if (!bot.alive) return null;
                const [bx, bz] = worldToRadar(bot.x, bot.z);
                return (
                  <circle
                    key={`radar-bot-${bot.id}`}
                    cx={bx}
                    cy={bz}
                    r={2.2}
                    fill="#ef4444"
                  />
                );
              })}

            <polygon
              points={`${playerRx},${playerRz} ${coneLeftX},${coneLeftZ} ${coneRightX},${coneRightZ}`}
              fill="url(#radarConeGrad)"
            />
            <polygon
              points={`${tipX},${tipZ} ${wingLX},${wingLZ} ${tailX},${tailZ} ${wingRX},${wingRZ}`}
              fill="#ffffff"
              stroke="#0a0a0a"
              strokeWidth="1"
              strokeLinejoin="round"
            />
          </svg>

          <div className="pointer-events-none absolute left-1/2 top-1 -translate-x-1/2 text-[9px] font-semibold text-neutral-400">
            N
          </div>
          <Compass className="pointer-events-none absolute right-2 top-2 h-3 w-3 text-neutral-400/70" />

          {WORLD_LANDMARK_DESTINATIONS.map((lm) => {
            const [mx, mz] = worldToRadar(lm.x, lm.z);
            return (
              <button
                key={lm.id}
                onClick={() => warpToLocation(lm.x, lm.z, lm.forceMode, lm.id)}
                title={`${lm.cityBadge} — ${lm.fullTitle}`}
                style={{ left: `${mx}px`, top: `${mz}px`, backgroundColor: lm.color }}
                className="absolute h-2 w-2 -translate-x-1/2 -translate-y-1/2 rounded-full border border-neutral-950 transition-transform hover:scale-150"
              />
            );
          })}
        </div>

        {/* Mode Switcher + Battle Royale Health/Shield */}
        <div className="flex flex-col gap-2 rounded-2xl border border-white/10 bg-neutral-950/75 p-2.5 shadow-xl backdrop-blur-md">
          {/* Health & Shield Bars — Battle Royale only */}
          {activeGameMode === 'BATTLE_ROYALE' && (
            <div className="grid grid-cols-2 gap-2.5">
              <div>
                <div className="mb-1 flex items-center justify-between text-[10px] font-medium text-neutral-300">
                  <span className="flex items-center gap-1">
                    <Heart className="h-3 w-3 text-emerald-400" /> Health
                  </span>
                  <span className="tabular-nums">{playerHp}</span>
                </div>
                <div className="h-1.5 w-full overflow-hidden rounded-full bg-white/10">
                  <div
                    style={{ width: `${playerHp}%` }}
                    className="h-full rounded-full bg-emerald-400 transition-all duration-150"
                  />
                </div>
              </div>

              <div>
                <div className="mb-1 flex items-center justify-between text-[10px] font-medium text-neutral-300">
                  <span className="flex items-center gap-1">
                    <Shield className="h-3 w-3 text-sky-400" /> Shield
                  </span>
                  <span className="tabular-nums">{playerShield}</span>
                </div>
                <div className="h-1.5 w-full overflow-hidden rounded-full bg-white/10">
                  <div
                    style={{ width: `${playerShield}%` }}
                    className="h-full rounded-full bg-sky-400 transition-all duration-150"
                  />
                </div>
              </div>
            </div>
          )}

          {/* 4 Traversal Mode Buttons */}
          <div className="flex items-center gap-1">
            {(
              [
                { id: 'FOOT', label: '1 Walk', Icon: Footprints },
                { id: 'CAR', label: '2 Drive', Icon: Car },
                { id: 'BOAT', label: '3 Boat', Icon: Ship },
                { id: 'PLANE', label: '4 Fly', Icon: Plane },
              ] as const
            ).map(({ id, label, Icon }) => {
              const active = hud.mode === id;
              return (
                <button
                  key={id}
                  onClick={() => onSelectMode(id)}
                  className={`flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-xs font-medium transition ${
                    active
                      ? 'bg-white text-neutral-950'
                      : 'bg-white/5 text-neutral-300 hover:bg-white/15 hover:text-white'
                  }`}
                >
                  <Icon className="h-3.5 w-3.5" />
                  <span>{label}</span>
                </button>
              );
            })}
          </div>

          {/* 1 Button to cycle current vehicle / outfit */}
          <div>
            {hud.mode === 'CAR' && (
              <button
                onClick={() => window.dispatchEvent(new CustomEvent('cycle-car'))}
                className="flex w-full items-center justify-between rounded-lg border border-white/10 bg-white/5 px-2.5 py-1 text-xs font-medium text-neutral-200 transition hover:bg-white/10 hover:text-white"
              >
                <span>{CAR_FLEET_MENU[activeCarIdx]?.label ?? 'Supercar'}</span>
                <span className="text-[11px] text-neutral-400">[V] Next</span>
              </button>
            )}

            {hud.mode === 'BOAT' && (
              <button
                onClick={() => window.dispatchEvent(new CustomEvent('cycle-boat'))}
                className="flex w-full items-center justify-between rounded-lg border border-white/10 bg-white/5 px-2.5 py-1 text-xs font-medium text-neutral-200 transition hover:bg-white/10 hover:text-white"
              >
                <span>{BOAT_FLEET_MENU[activeBoatIdx]?.label ?? 'Boat'}</span>
                <span className="text-[11px] text-neutral-400">[B] Next</span>
              </button>
            )}

            {hud.mode === 'PLANE' && (
              <button
                onClick={() => window.dispatchEvent(new CustomEvent('cycle-plane'))}
                className="flex w-full items-center justify-between rounded-lg border border-white/10 bg-white/5 px-2.5 py-1 text-xs font-medium text-neutral-200 transition hover:bg-white/10 hover:text-white"
              >
                <span>{PLANE_FLEET_MENU[activePlaneIdx]?.label ?? 'Aircraft'}</span>
                <span className="text-[11px] text-neutral-400">[B] Next</span>
              </button>
            )}

            {hud.mode === 'FOOT' && (
              <button
                onClick={handleToggleCustomizer}
                className="flex w-full items-center justify-between rounded-lg border border-white/10 bg-white/5 px-2.5 py-1 text-xs font-medium text-neutral-200 transition hover:bg-white/10 hover:text-white"
              >
                <span>{custom.presetName || 'City Executive'}</span>
                <span className="text-[11px] text-neutral-400">[C] Outfit</span>
              </button>
            )}
          </div>
        </div>
      </div>

      {/* 7. BOTTOM-RIGHT: Speedometer + Battle Royale Weapon Bar */}
      <div
        className={`pointer-events-auto fixed z-30 flex flex-col items-end gap-1.5 ${
          touchUi ? 'right-3 top-14 sm:bottom-3 sm:top-auto' : 'bottom-3 right-3'
        }`}
      >
        {/* Clean Digital Speedometer */}
        <div className="flex items-baseline gap-3 rounded-2xl border border-white/10 bg-neutral-950/75 px-3.5 py-1.5 shadow-xl backdrop-blur-md sm:px-4 sm:py-2">
          <div className="flex items-baseline gap-1">
            <span className="text-lg font-semibold tabular-nums text-white sm:text-xl">
              {hud.speedKmh}
            </span>
            <span className="text-[11px] text-neutral-400 sm:text-xs">km/h</span>
          </div>
          {hud.mode === 'PLANE' && (
            <>
              <span className="h-3.5 w-px bg-white/15" />
              <div className="flex items-baseline gap-1">
                <span className="text-sm font-medium tabular-nums text-neutral-200">
                  {hud.altitude}
                </span>
                <span className="text-xs text-neutral-400">m</span>
              </div>
            </>
          )}
        </div>

        {/* 5-Slot Weapon Loadout + Fire — Battle Royale only */}
        {activeGameMode === 'BATTLE_ROYALE' && (hud.mode === 'FOOT' || hud.mode === 'CAR') && (
          <div className="hidden items-center gap-1 rounded-2xl border border-white/10 bg-neutral-950/75 p-1.5 shadow-xl backdrop-blur-md sm:flex">
            {WEAPON_SPECS.map((spec, idx) => {
              const isSelected = activeWeaponIdx === idx;
              return (
                <button
                  key={spec.id}
                  onClick={() =>
                    window.dispatchEvent(new CustomEvent('select-weapon', { detail: idx }))
                  }
                  className={`rounded-xl px-2.5 py-1 text-xs font-medium transition ${
                    isSelected
                      ? 'bg-white text-neutral-950'
                      : 'text-neutral-300 hover:bg-white/10 hover:text-white'
                  }`}
                >
                  {spec.shortName}
                </button>
              );
            })}

            <button
              onClick={() => window.dispatchEvent(new CustomEvent('fire-weapon'))}
              className="rounded-xl bg-white/10 px-2.5 py-1 text-xs font-medium tabular-nums text-white transition hover:bg-white/20"
            >
              Fire ({currentAmmo}/{maxAmmo})
            </button>
          </div>
        )}
      </div>

      {/* 8. MOBILE TOUCH CONTROLS OVERLAY */}
      <MobileControls
        mode={hud.mode}
        gameMode={activeGameMode}
        visible={touchUi && !isStartMenuOpen && !isCustomizerOpen}
      />
    </div>
  );
}
