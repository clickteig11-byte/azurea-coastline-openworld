import { Lobby, persistChips, restoreChips } from './Lobby';
import { PlaySettings } from './PlaySettings';
import { Reticle, shouldShowReticle } from './Reticle';
import { BUILD_COST, BUILD_MATERIALS, BUILD_TYPES, construction } from '../game/building';
import { coastalNow, coastalReaction, interactCoast } from '../game/coastalPlay';
import { POSTCARDS } from '../game/quirky';
import React, { useEffect, useRef, useState } from 'react';
import {
  Car,
  Plane,
  Ship,
  Footprints,
  Camera,
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
  Wrench,
  SlidersHorizontal,
  Pickaxe,
  Boxes,
  Zap,
  Sparkles,
} from 'lucide-react';
import {
  boardAmusementRide,
  exitAmusementRide,
  CHARACTER_PRESETS,
  CharacterArchetype,
  CharacterCustomization,
  ControlSettings,
  DEFAULT_CONTROL_SETTINGS,
  EMOTE_STYLES,
  EyewearStyle,
  GameHudSnapshot,
  GamePlayMode,
  HERO_ROSTER,
  KIT_COLORWAYS,
  requestGamePointerLock,
  saveControlSettings,
  simState,
  WEAPON_SPECS,
} from '../game/store';
import { GRAND_PRIX_START, nearestRaceProgress } from '../game/grandPrix';
import {
  AMUSEMENT_PARK_RIDES, atollDistance, COASTAL_ATOLLS, CONSTRUCTION_ISLAND, LANDMARKS,
  MAIN_ISLAND_BOUNDS, NORTH_BAY_BRIDGE, OCEAN_AMUSEMENT_PIER, coastBeachWidth, coastRoadRadius,
  getTerrainHeight, getTravelHeight, islandTwoRadius, type VehicleMode,
} from '../game/worldMath';
import { soundEngine } from '../game/soundEngine';
import { MobileControls } from './MobileControls';

interface Props {
  hud: GameHudSnapshot;
  onSelectMode: (m: VehicleMode) => void;
}

export type MetropolisGameMode = GamePlayMode;

const RADAR_SIZE = 128;
const RADAR_CENTER = RADAR_SIZE / 2;
const RADAR_WORLD_Z = MAIN_ISLAND_BOUNDS.recommendedTerrainCenterZ;
const RADAR_SCALE = 49 / Math.max(
  RADAR_WORLD_Z - OCEAN_AMUSEMENT_PIER.zEnd,
  ...Object.values(COASTAL_ATOLLS).map(({ x, z, radius }) => Math.hypot(x, z - RADAR_WORLD_Z) + radius * 1.12),
);

function worldToRadar(x: number, z: number, markerLimit = Infinity): [number, number] {
  const dx = x * RADAR_SCALE;
  const dz = (z - RADAR_WORLD_Z) * RADAR_SCALE;
  const distance = Math.hypot(dx, dz);
  const scale = distance > markerLimit ? markerLimit / distance : 1;
  return [RADAR_CENTER + dx * scale, RADAR_CENTER + dz * scale];
}

function radarOutline(pointAt: (angle: number) => [number, number]) {
  return Array.from({ length: 84 }, (_, index) => {
    const point = pointAt(index / 84 * Math.PI * 2);
    return worldToRadar(...point).join(',');
  }).join(' ');
}

function radarCoast(beach: boolean) {
  return radarOutline((angle) => {
    const distance = coastRoadRadius(angle) + (beach ? coastBeachWidth(angle) : 0);
    return [Math.sin(angle) * distance, Math.cos(angle) * distance];
  });
}

const radarShoreline = radarCoast(true);
const radarCoastalRoad = radarCoast(false);
const radarIslandTwo = radarOutline((angle) => {
  const x = Math.sin(angle) * CONSTRUCTION_ISLAND.radiusX;
  const z = Math.cos(angle) * CONSTRUCTION_ISLAND.radiusZ;
  const radius = islandTwoRadius(x, z + CONSTRUCTION_ISLAND.z);
  return [x / radius, CONSTRUCTION_ISLAND.z + z / radius];
});
const radarAtolls = Object.entries(COASTAL_ATOLLS).map(([id, atoll]) => ({
  id,
  outline: radarOutline((angle) => {
    const dx = Math.sin(angle) * atoll.radius;
    const dz = Math.cos(angle) * atoll.radius;
    const radius = atollDistance(atoll.x + dx, atoll.z + dz, atoll);
    return [atoll.x + dx / radius, atoll.z + dz / radius];
  }),
}));
const [pierLeft, pierTop] = worldToRadar(-OCEAN_AMUSEMENT_PIER.halfWidth, OCEAN_AMUSEMENT_PIER.zEnd);
const [pierRight, pierBottom] = worldToRadar(OCEAN_AMUSEMENT_PIER.halfWidth, OCEAN_AMUSEMENT_PIER.zStart);

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
    description: 'Race the coastal circuit against three rivals.',
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

interface LandmarkDestination {
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
  warpLookAt?: readonly [number, number];
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
    note: 'Follow Grand Central Avenue across North Bay to the Island II construction gate.',
    isWorldWonder: true,
    x: 0,
    z: -286,
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
    id: 'wonderisland',
    shortLabel: 'Wonder Pier Park',
    menuLabel: 'Wonder Pier Park',
    fullTitle: 'Azurea Wonder Ocean Pier Amusement Park',
    cityBadge: 'OCEAN PIER PARK',
    note: '170m Over-Ocean Amusement Pier with Ridable 46m Ferris Wheel, Over-Water Cyclone Roller Coaster, Carousel & 64m Drop Tower.',
    isWorldWonder: true,
    x: 0,
    z: -600,
    color: '#ec4899',
    spawnCarX: -6.0,
    spawnCarZ: -504,
    spawnFootX: 0,
    spawnFootZ: -504,
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

for (const [id, label, spawn] of [
  ['solis', 'Solis Lighthouse Atoll', { spawnFootX: 469, spawnFootZ: 344, spawnCarX: 469, spawnCarZ: 357 }],
  ['azureaatoll', 'Azurea Stunt Atoll', {
    spawnFootX: -436, spawnFootZ: -329, spawnCarX: -423, spawnCarZ: -331,
    warpLookAt: [-447, -356],
  }],
] as const) {
  const landmark = LANDMARKS.find((item) => item.id === id);
  if (!landmark) continue;
  const [x, , z] = landmark.position;
  WORLD_LANDMARK_DESTINATIONS.push({
    id, shortLabel: label, menuLabel: label, fullTitle: label,
    cityBadge: 'COASTAL ATOLL', note: landmark.subtitle, color: landmark.color, forceMode: 'FOOT',
    x, z, ...spawn,
  });
}

const WORLD_TOUR_STOPS = WORLD_LANDMARK_DESTINATIONS.filter((d) => d.isWorldWonder);

export function HUD({ hud, onSelectMode }: Props) {
  const [muted, setMuted] = useState(simState.controlSettings.audioMuted);
  const [, setUiTick] = useState(0);
  const [selectedLandmarkId, setSelectedLandmarkId] = useState<string>('empire');
  const [mobileTeleportOpen, setMobileTeleportOpen] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [controlsOpen, setControlsOpen] = useState(simState.controlsOpen);
  const updateControlsOpen = (open: boolean) => {
    simState.controlsOpen = open;
    setControlsOpen(open);
  };
  const [worldIntro, setWorldIntro] = useState(false);
  const chipsRestoredRef = useRef(false);
  const controlSettings = simState.controlSettings;

  useEffect(() => {
    restoreChips();
    chipsRestoredRef.current = true;
    soundEngine.setMuted(simState.controlSettings.audioMuted);
    setUiTick((t) => t + 1);
  }, []);
  useEffect(() => {
    if (chipsRestoredRef.current) persistChips();
  }, [hud.chips]);

  const updateControls = (patch: Partial<ControlSettings>) => {
    saveControlSettings(patch);
    if (patch.audioMuted !== undefined) {
      soundEngine.setMuted(patch.audioMuted);
      setMuted(patch.audioMuted);
    }
    setUiTick((t) => t + 1);
  };

  useEffect(() => {
    const onFsChange = () => {
      setIsFullscreen(Boolean(document.fullscreenElement));
    };
    document.addEventListener('fullscreenchange', onFsChange);
    return () => {
      document.removeEventListener('fullscreenchange', onFsChange);
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
      window.matchMedia('(pointer: coarse)').matches ||
      (typeof navigator !== 'undefined' && navigator.maxTouchPoints > 0)
    );
  });

  const [pointerLocked, setPointerLocked] = useState(() => typeof document !== 'undefined' && Boolean(document.pointerLockElement));
  const [showPointerHint, setShowPointerHint] = useState(false);
  const cameraView = simState.cameraView;
  const toggleCamera = () => {
    simState.cameraView = 1 - simState.cameraView;
    simState.orbitYaw = simState.orbitPitch = 0;
    if (simState.cameraView === 1) requestGamePointerLock();
    else if (document.pointerLockElement && simState.mode !== 'FOOT') document.exitPointerLock?.();
    setUiTick((n) => n + 1);
  };

  useEffect(() => {
    simState.touchControlsEnabled = touchUi;
  }, [touchUi]);

  useEffect(() => {
    const onPlChange = () => setPointerLocked(Boolean(document.pointerLockElement));
    document.addEventListener('pointerlockchange', onPlChange);
    return () => document.removeEventListener('pointerlockchange', onPlChange);
  }, []);

  useEffect(() => {
    const onSyncUi = () => {
      setControlsOpen(simState.controlsOpen);
      setUiTick((t) => t + 1);
    };
    window.addEventListener('toggle-customizer', onSyncUi);
    window.addEventListener('customizer-updated', onSyncUi);
    window.addEventListener('toggle-start-menu', onSyncUi);
    window.addEventListener('mode-switched', onSyncUi);
    window.addEventListener('hud-sync', onSyncUi);
    window.addEventListener('lobby-vehicle-change', onSyncUi);
    return () => {
      window.removeEventListener('toggle-customizer', onSyncUi);
      window.removeEventListener('customizer-updated', onSyncUi);
      window.removeEventListener('toggle-start-menu', onSyncUi);
      window.removeEventListener('mode-switched', onSyncUi);
      window.removeEventListener('hud-sync', onSyncUi);
      window.removeEventListener('lobby-vehicle-change', onSyncUi);
    };
  }, []);

  useEffect(() => {
    if (!controlsOpen) return;
    const onEscape = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      event.preventDefault();
      event.stopImmediatePropagation();
      updateControlsOpen(false);
      if (document.pointerLockElement) document.exitPointerLock?.();
    };
    window.addEventListener('keydown', onEscape, true);
    return () => window.removeEventListener('keydown', onEscape, true);
  }, [controlsOpen]);

  const s = simState as any;
  const isStartMenuOpen = Boolean(s.startMenuOpen);
  const activeGameMode = hud.gameMode ?? simState.gameMode;

  const handleToggleMute = () => {
    updateControls({ audioMuted: !muted });
  };

  const handleToggleStartMenu = (forceState?: boolean) => {
    const next = typeof forceState === 'boolean' ? forceState : !Boolean(s.startMenuOpen);
    s.startMenuOpen = next;
    if (next) {
      simState.customizerOpen = false;
      setMobileTeleportOpen(false);
      updateControlsOpen(false);
    }
    window.dispatchEvent(new CustomEvent('toggle-start-menu'));
    setUiTick((t) => t + 1);
  };

  const handleToggleCustomizer = () => {
    const prev = Boolean(simState.customizerOpen);
    s.startMenuOpen = false;
    setMobileTeleportOpen(false);
    updateControlsOpen(false);
    window.dispatchEvent(new CustomEvent('toggle-customizer'));
    if (Boolean(simState.customizerOpen) === prev) {
      simState.customizerOpen = !prev;
    }
    setUiTick((t) => t + 1);
  };

  const handleSelectGameMode = (mode: GamePlayMode) => {
    s.gameMode = mode;
    if (mode !== 'BATTLE_ROYALE') {
      simState.brActive = false;
      simState.brResult = null;
    }
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
    setUiTick((t) => t + 1);
  };

  const selectSpecificPlane = (idx: number) => {
    onSelectMode('PLANE');
    s.activePlaneIdx = idx;
    s.activePlaneName = PLANE_FLEET_MENU[idx]?.codeName ?? 'GULFSTREAM G700 JET';
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
    simState.activeRide = null;
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
      if ((s.gameMode as GamePlayMode) === 'WORLD_TOUR') {
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

      const [lookX, lookZ] = matched.warpLookAt ?? [matched.x, matched.z];
      const carYaw = Math.atan2(lookX - carX, lookZ - carZ);
      const footYaw = Math.atan2(lookX - footX, lookZ - footZ);

      const footY = Math.max(getTravelHeight(footX, footZ), 0) + 0.08;
      simState.playerPos.set(footX, footY, footZ);
      simState.playerYaw = footYaw;
      simState.playerVel.set(0, 0, 0);

      const carY = Math.max(getTravelHeight(carX, carZ), 0) + 0.1;
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
        const angle = Math.atan2(x, z);
        const waterR = coastRoadRadius(angle) + coastBeachWidth(angle) + 24;
        const bx = Math.sin(angle) * waterR;
        const bz = Math.cos(angle) * waterR;
        simState.boatPos.set(bx, 0.5, bz);
        simState.boatYaw = Math.atan2(x - bx, z - bz);
      }
      simState.boatSpeed = 0;
    }

    if (matched) {
    }
    setUiTick((t) => t + 1);
  };

  const resetGrandPrixRace = () => {
    onSelectMode('CAR');
    simState.activeCheckpoint = 0;
    simState.lapCount = 0;
    simState.sectorTimes.length = 0;
    simState.lapTime = 0;
    simState.driftScore = 0;
    const [startX, startZ] = GRAND_PRIX_START;
    const startY = getTerrainHeight(startX, startZ) + 0.1;
    simState.carPos.set(startX, startY, startZ);
    simState.raceCountdown = 3;
    simState.raceElapsed = 0;
    simState.raceRivalDistances.fill(0);
    simState.carDamage.hp = 100;
    simState.carDamage.wrecked = false;
    simState.carYaw = Math.PI;
    simState.carSpeed = 0;
    simState.carVel.set(0, 0, 0);
    setUiTick((t) => t + 1);
  };

  const handleNextTourLandmark = () => {
    const currentIdx = WORLD_TOUR_STOPS.findIndex((d) => d.id === selectedLandmarkId);
    const nextIdx = (currentIdx + 1) % WORLD_TOUR_STOPS.length;
    const nextStop = WORLD_TOUR_STOPS[nextIdx] ?? WORLD_TOUR_STOPS[0];
    markTourVisited(nextStop.id);
    warpToLocation(nextStop.x, nextStop.z, undefined, nextStop.id);
  };

  const handleStartGame = (overrideMode?: GamePlayMode) => {
    const validModes: readonly GamePlayMode[] = ['FREE_ROAM', 'BATTLE_ROYALE', 'GRAND_PRIX', 'WORLD_TOUR'];
    const modeToLaunch: GamePlayMode =
      typeof overrideMode === 'string' && validModes.includes(overrideMode as GamePlayMode)
        ? (overrideMode as GamePlayMode)
        : activeGameMode;
    s.gameMode = modeToLaunch;
    setWorldIntro( false );
    if (document.activeElement instanceof HTMLElement) {
      document.activeElement.blur();
    }
    simState.keys.clear();
    s.startMenuOpen = false;
    simState.customizerOpen = false;
    simState.brActive = modeToLaunch === 'BATTLE_ROYALE';
    if (modeToLaunch !== 'BATTLE_ROYALE') {
      simState.brResult = null;
    }
    setMobileTeleportOpen(false);

    const chosenDest =
      WORLD_LANDMARK_DESTINATIONS.find((d) => d.id === selectedLandmarkId) ||
      WORLD_LANDMARK_DESTINATIONS[0];

    if (modeToLaunch === 'BATTLE_ROYALE') {
      simState.brActive = true;
      simState.playerHp = 100;
      simState.playerShield = 100;
      window.dispatchEvent(new CustomEvent('br-drop'));
      if (chosenDest.id === 'empire') {
        simState.playerPos.set(12, 128, 76);
        simState.playerYaw = Math.PI;
      } else {
        simState.playerPos.set(chosenDest.spawnFootX, 120, chosenDest.spawnFootZ);
        simState.playerYaw = Math.atan2(
          chosenDest.x - chosenDest.spawnFootX,
          chosenDest.z - chosenDest.spawnFootZ
        );
      }
    } else if (modeToLaunch === 'GRAND_PRIX') {
      simState.lapCount = 0;
      resetGrandPrixRace();
    } else if (modeToLaunch === 'WORLD_TOUR') {
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
  const driftScore = Math.round(hud.driftScore ?? simState.driftScore);
  const lastSector = (simState.activeCheckpoint + simState.checkpoints.length - 1) % simState.checkpoints.length;
  const split = simState.sectorTimes[lastSector] === undefined || simState.bestSectors[lastSector] === undefined ?
    null : simState.sectorTimes[lastSector] - simState.bestSectors[lastSector];

  const [playerRx, playerRz] = worldToRadar(activePos.x, activePos.z, 48);
  const [cpRx, cpRz] = worldToRadar(activeCp.position[0], activeCp.position[2]);

  const fwdX = Math.sin(activeYaw);
  const fwdZ = Math.cos(activeYaw);
  const rightX = fwdZ;
  const rightZ = -fwdX;

  const coneLen = 13;
  const coneHalfWidth = 6;
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

  const [aveTopX, aveTopZ] = worldToRadar(0, NORTH_BAY_BRIDGE.approach);
  const [aveBotX, aveBotZ] = worldToRadar(0, coastRoadRadius(0));
  const [bridgeX, bridgeZ] = worldToRadar(0, NORTH_BAY_BRIDGE.gate);
  const [midWestX, midWestZ] = worldToRadar(-150, 0);
  const [midEastX, midEastZ] = worldToRadar(150, 0);
  const [canalStartX, canalStartZ] = worldToRadar(82, -95);
  const [canalEndX, canalEndZ] = worldToRadar(238, -95);
  const [runwayStartX, runwayStartZ] = worldToRadar(-195, 155);
  const [runwayEndX, runwayEndZ] = worldToRadar(-45, 155);

  const health = hud.playerHp ?? simState.playerHp;
  const shield = hud.playerShield ?? simState.playerShield;
  const playerHp = Math.max(0, Math.min(100, Math.round(health)));
  const playerShield = Math.max(0, Math.min(100, Math.round(shield)));
  const activeWeaponIdx = hud.activeWeaponIdx ?? simState.activeWeaponIdx ?? 0;
  const activeSpec = WEAPON_SPECS[activeWeaponIdx] ?? WEAPON_SPECS[0];
  const currentAmmo = hud.ammo ?? simState.ammo ?? activeSpec.clipSize;
  const maxAmmo = hud.maxAmmo ?? simState.maxAmmo ?? activeSpec.clipSize;
  const aliveBotsCount = simState.botTargets.filter((b) => b.alive).length + 1;
  const aliveCount = hud.aliveCount ?? aliveBotsCount;
  const eliminations = hud.eliminations ?? simState.eliminations ?? 0;
  const stormRadius = Math.round(hud.stormRadius ?? simState.stormRadius ?? 235);
  const vehicleHp = Math.max(
    0,
    Math.min(100, Math.round(hud.vehicleHp ?? simState.vehicleHp ?? 100))
  );
  const vehicleWrecked = Boolean(hud.vehicleWrecked ?? simState.vehicleWrecked);
  const crashFlashTimer = Math.max(0, simState.crashFlashTimer ?? 0);
  const vehicleBarColor =
    vehicleHp >= 60 ? 'bg-emerald-400' : vehicleHp >= 30 ? 'bg-amber-400' : 'bg-rose-500';
  const carGear =
    simState.carSpeed < -0.5
      ? 'R'
      : hud.speedKmh < 3
      ? 'N'
      : hud.speedKmh < 28
      ? '1'
      : hud.speedKmh < 54
      ? '2'
      : hud.speedKmh < 82
      ? '3'
      : hud.speedKmh < 112
      ? '4'
      : hud.speedKmh < 144
      ? '5'
      : '6';
  const driftPct = Math.max(0, Math.min(100, driftScore));
  const throttlePct = Math.round(
    Math.max(0, Math.min(1, hud.aircraftThrottle ?? simState.planeThrottle ?? 0.56)) * 100
  );
  const isCustomizerOpen = Boolean(simState.customizerOpen);
  const custom = simState.customization;
  const activeCarIdx = typeof s.activeCarIdx === 'number' ? s.activeCarIdx : 0;
  const activeBoatIdx = typeof s.activeBoatIdx === 'number' ? s.activeBoatIdx : 0;
  const activePlaneIdx = typeof s.activePlaneIdx === 'number' ? s.activePlaneIdx : 0;

  const activeRideId = simState.activeRide ?? hud.activeRide;
  const activeRide = AMUSEMENT_PARK_RIDES.find((ride) => ride.id === activeRideId);
  const showModeBanner = activeGameMode !== 'FREE_ROAM';
  const showRidePicker = !activeRide && !showModeBanner &&
    (Boolean(hud.nearbyRide) || (activePos.z < -495 && Math.abs(activePos.x) < 60));
  const showOverlays = !controlsOpen && !isCustomizerOpen && !mobileTeleportOpen;
  const coastalPrompt = !activeRide && showOverlays ? hud.coastalPrompt : undefined;
  const discovery = showOverlays ? hud.discovery : undefined;
  const showFootVitals = activeGameMode === 'BATTLE_ROYALE' ||
    (activeGameMode === 'FREE_ROAM' ? health < 100 || shield < 100 : hud.mode === 'FOOT');
  const showQuickBar =
    !controlsOpen &&
    !isCustomizerOpen &&
    !simState.parachuting &&
    !activeRideId &&
    !hud.swimming &&
    (hud.mode === 'FOOT' || (activeGameMode === 'BATTLE_ROYALE' && hud.mode === 'CAR'));
  const showBuildControls = showQuickBar && hud.mode === 'FOOT' && (construction.active || construction.pickaxe);
  const pointerHintEnabled = showOverlays && !isStartMenuOpen && !touchUi &&
    (hud.mode === 'FOOT' || cameraView === 1 || Boolean(activeRide));

  useEffect(() => {
    if (!pointerHintEnabled) return;
    setShowPointerHint(true);
    const timeout = window.setTimeout(() => setShowPointerHint(false), 2200);
    return () => window.clearTimeout(timeout);
  }, [pointerHintEnabled, pointerLocked, hud.mode, cameraView, activeGameMode, activeRideId]);

  const togglePickaxeTool = () => {
    construction.pickaxe = !construction.pickaxe;
    construction.active = false;
    setUiTick((n) => n + 1);
  };
  const toggleBuildTool = () => {
    construction.active = !construction.active;
    if (construction.active) construction.pickaxe = false;
    setUiTick((n) => n + 1);
  };
  const equipWeaponSlot = (idx: number) => {
    construction.active = false;
    construction.pickaxe = false;
    window.dispatchEvent(new CustomEvent('select-weapon', { detail: idx }));
    setUiTick((n) => n + 1);
  };
  const renderQuickBar = (compact: boolean) => (
    <>
      {hud.mode === 'FOOT' && (
        <>
          <button
            type="button"
            onClick={togglePickaxeTool}
            title="Pickaxe (T)"
            aria-label="Pickaxe"
            aria-pressed={construction.pickaxe && !construction.active}
            className={`flex shrink-0 items-center gap-1 rounded-xl px-2 py-1 font-semibold transition ${
              compact ? 'text-[11px]' : 'text-xs font-medium'
            } ${
              construction.pickaxe && !construction.active
                ? 'bg-sky-400 text-neutral-950'
                : 'text-neutral-300 hover:bg-white/10 hover:text-white'
            }`}
          >
            <Pickaxe className={compact ? 'h-3 w-3' : 'h-3.5 w-3.5'} />
            {!compact && <span>Axe</span>}
          </button>
          <button
            type="button"
            onClick={toggleBuildTool}
            title="Build Mode (G)"
            aria-label="Build mode"
            aria-pressed={construction.active}
            className={`flex shrink-0 items-center gap-1 rounded-xl px-2 py-1 font-semibold transition ${
              compact ? 'text-[11px]' : 'text-xs font-medium'
            } ${
              construction.active
                ? 'bg-amber-400 text-neutral-950'
                : 'text-neutral-300 hover:bg-white/10 hover:text-white'
            }`}
          >
            <Boxes className={compact ? 'h-3 w-3' : 'h-3.5 w-3.5'} />
            {!compact && <span>Build</span>}
          </button>
          <span className="h-3.5 w-px shrink-0 bg-white/15" />
        </>
      )}

      {WEAPON_SPECS.map((spec, idx) => {
        const isSelected = !construction.active && !construction.pickaxe && activeWeaponIdx === idx;
        return (
          <button
            key={spec.id}
            type="button"
            onClick={() => equipWeaponSlot(idx)}
            aria-pressed={isSelected}
            className={`shrink-0 rounded-xl px-2 py-1 transition ${
              compact ? 'text-[10px] font-semibold' : 'text-xs font-medium'
            } ${
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
        type="button"
        aria-label={`Fire weapon • ${currentAmmo} of ${maxAmmo} rounds`}
        onClick={() => window.dispatchEvent(new CustomEvent('fire-weapon'))}
        className={`shrink-0 rounded-xl bg-white/10 px-2 py-1 font-medium tabular-nums text-white transition hover:bg-white/20 ${
          compact ? 'text-[10px]' : 'px-2.5 text-xs'
        }`}
      >
        {currentAmmo}/{maxAmmo}
      </button>
    </>
  );

  const activeTourStop =
    WORLD_TOUR_STOPS.find((d) => d.id === selectedLandmarkId) || WORLD_TOUR_STOPS[0];
  const tourVisitedCount = Math.max(
    1,
    Math.min(WORLD_TOUR_STOPS.length, (simState.tourVisitedIds || []).length || 1)
  );

  const activeRace = activeGameMode === 'GRAND_PRIX' && !isStartMenuOpen;
  const progress = activeRace ? nearestRaceProgress(activePos, simState.lapCount, simState.activeCheckpoint) : 0;
  const raceRank = 1 + simState.raceRivalDistances.filter((distance) => distance > progress + 1).length;

  const currentFinish =
    custom.topRoughness >= 0.48
      ? 'MATTE'
      : custom.topMetalness >= 0.35 || custom.topRoughness <= 0.22
      ? 'LEATHER'
      : 'SATIN';

  // =========================================================================
  // FULL-SCREEN CLEAN START SCREEN (Renders ALONE over live 3D city skyline)
  // =========================================================================
  const forcedTravel = WORLD_LANDMARK_DESTINATIONS.find(({ id }) => id === selectedLandmarkId)?.forceMode;
  const launchMode = activeGameMode === 'GRAND_PRIX' ? 'CAR' : forcedTravel ?? simState.mode;
  const launchFleet = launchMode === 'CAR' ? CAR_FLEET_MENU : launchMode === 'BOAT' ? BOAT_FLEET_MENU :
    launchMode === 'PLANE' ? PLANE_FLEET_MENU : [];
  const launchModel = launchMode === 'CAR' ? activeCarIdx : launchMode === 'BOAT' ? activeBoatIdx : activePlaneIdx;
  const pickLaunchModel = launchMode === 'CAR' ? selectSpecificCar : launchMode === 'BOAT' ? selectSpecificBoat : selectSpecificPlane;
  if (isStartMenuOpen) return (
    <Lobby mode={activeGameMode} modes={GAME_MODE_OPTIONS} onMode={handleSelectGameMode}
      start={handleStartGame} destinations={WORLD_LANDMARK_DESTINATIONS} setDestination={setSelectedLandmarkId}
      selected={selectedLandmarkId} update={updateCustomization} onStyle={updateControls} settings={controlSettings}
      fleet={(activeGameMode === 'FREE_ROAM' || activeGameMode === 'GRAND_PRIX') && <>
        {activeGameMode === 'FREE_ROAM' && !forcedTravel && <label className="wh-launch">Travel
          <select value={simState.mode} onChange={(e) => { onSelectMode(e.target.value as VehicleMode); setUiTick((n) => n + 1); }}>
            <option value="FOOT">On foot</option><option value="CAR">Drive</option>
            <option value="BOAT">Sail</option><option value="PLANE">Fly</option>
          </select>
        </label>}
        {launchFleet.length > 0 && <label className="wh-launch">Vehicle
          <select value={launchModel} onChange={(e) => pickLaunchModel(Number(e.target.value))}>
            {launchFleet.map(({ idx, label }) => <option key={idx} value={idx}>{label}</option>)}
          </select>
        </label>}
      </>} />
  );

  // =========================================================================
  // IN-GAME HUD (Mode-Specific & Mobile-Friendly)
  // =========================================================================
  return (
    <div className="wh-game-hud pointer-events-none fixed inset-0 z-20 select-none overflow-hidden font-sans" data-touch={touchUi && !activeRide} data-riding={Boolean(activeRide)}>
      {worldIntro && <div className="wh-world-fade" onAnimationEnd={() => setWorldIntro(false)} />}
      {/* 0. IMPACT VIGNETTE FLASH */}
      {crashFlashTimer > 0 && (
        <div
          style={{ opacity: Math.min(1, crashFlashTimer * 2.4) }}
          className="pointer-events-none fixed inset-0 z-10 border-4 border-rose-500/45 shadow-[inset_0_0_80px_rgba(244,63,94,0.38)] transition-opacity duration-150"
        />
      )}

      {!controlsOpen && !isCustomizerOpen && shouldShowReticle(hud, showBuildControls) && <Reticle />}
      {showBuildControls && (
        <div className={`wh-build-hud ${touchUi ? 'wh-build-touch' : ''}`}>
          <div className="wh-materials">{BUILD_MATERIALS.map((material) => (
            <button key={material} type="button" aria-pressed={construction.material === material} onClick={() => {
              construction.material = material; setUiTick((n) => n + 1);
            }}><span>{material}</span><strong>{construction.resources[material]}</strong></button>
          ))}</div>
          {construction.active && <div className="wh-build-options">
            {BUILD_TYPES.map((type, index) => <button type="button" key={type} aria-pressed={construction.type === type}
              onClick={() => { construction.type = type; setUiTick((n) => n + 1); }}>
              {!touchUi && <kbd>{5 + index}</kbd>} {type}
            </button>)}
            <button type="button" onClick={() => { construction.turn = (construction.turn + 1) % 4; setUiTick((n) => n + 1); }}>Rotate</button>
            <span>{BUILD_COST}</span>
          </div>}
        </div>
      )}

      {/* 2. TOP-LEFT BAR */}
      <div className="wh-hud-glass pointer-events-auto fixed left-2.5 top-2.5 z-40 flex max-w-[calc(100vw-7rem)] items-center gap-0.5 overflow-x-auto rounded-full px-1.5 py-1 sm:left-3 sm:top-3 sm:gap-1 sm:px-2 sm:py-1.5 lg:max-w-none">
        <button
          onClick={() => handleToggleStartMenu(true)}
          className="shrink-0 rounded-full bg-white/10 px-2 py-1 text-xs font-medium text-white transition hover:bg-white/20 sm:px-2.5"
        >
          <span className="hidden sm:inline">Menu (M)</span>
          <span className="sm:hidden">Menu</span>
        </button>

        <button
          onClick={() => {
            updateControlsOpen(!simState.controlsOpen);
            if (simState.controlsOpen) simState.customizerOpen = false;
          }}
          title="Customize Controls & Sensitivity"
          className={`flex shrink-0 items-center gap-1 rounded-full px-2 py-1 text-xs font-medium transition sm:px-2.5 ${
            controlsOpen
              ? 'bg-white text-neutral-950'
              : 'text-neutral-200 hover:bg-white/10 hover:text-white'
          }`}
        >
          <SlidersHorizontal className="h-3.5 w-3.5" />
          <span className="hidden sm:inline">Controls</span>
        </button>

        <button type="button" className="shrink-0 rounded-full px-2 py-1 text-xs text-neutral-200 hover:bg-white/10 sm:px-2.5"
          onClick={toggleCamera}
          aria-label="Toggle first-person camera">{cameraView === 1 ? '1st' : '3rd'}</button>

        <button
          onClick={handleToggleCustomizer}
          className={`shrink-0 rounded-full px-2 py-1 text-xs font-medium transition sm:px-2.5 ${
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
          className={`flex shrink-0 items-center gap-1 rounded-full px-2 py-1 text-xs font-medium transition sm:px-2.5 ${
            touchUi
              ? 'bg-white text-neutral-950'
              : 'text-neutral-200 hover:bg-white/10 hover:text-white'
          }`}
        >
          <Gamepad2 className="h-3.5 w-3.5" />
          <span className="hidden sm:inline">Touch</span>
        </button>

        <button
          onClick={handleToggleFullscreen}
          title={isFullscreen ? 'Exit Fullscreen' : 'Enter Fullscreen'}
          className="hidden rounded-full p-1.5 text-neutral-300 transition hover:bg-white/10 hover:text-white sm:inline-flex"
        >
          {isFullscreen ? <Minimize2 className="h-3.5 w-3.5" /> : <Maximize2 className="h-3.5 w-3.5" />}
        </button>

        <button
          onClick={handleToggleMute}
          title={muted ? 'Unmute Audio' : 'Mute Audio'}
          className="shrink-0 rounded-full p-1.5 text-neutral-300 transition hover:bg-white/10 hover:text-white"
        >
          {muted ? <VolumeX className="h-3.5 w-3.5" /> : <Volume2 className="h-3.5 w-3.5" />}
        </button>
      </div>

      {/* 3. TOP-RIGHT FAST-TRAVEL DROPDOWN (Clean single-row capsule across all viewports) */}
      <div className="pointer-events-auto fixed right-2.5 top-2.5 z-40 sm:right-3 sm:top-3">
        <div className="relative">
          <button
            onClick={() => setMobileTeleportOpen((o) => !o)}
            aria-expanded={mobileTeleportOpen}
            className="wh-hud-glass flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium text-white transition hover:bg-slate-900"
          >
            <MapPin className="h-3.5 w-3.5 text-sky-400" />
            <span>Warp</span>
            <span className="hidden max-w-28 truncate text-sky-300 lg:inline">
              · {WORLD_LANDMARK_DESTINATIONS.find((d) => d.id === selectedLandmarkId)?.shortLabel || 'Vegas'}
            </span>
            <ChevronRight
              className={`h-3.5 w-3.5 text-neutral-400 transition-transform ${
                mobileTeleportOpen ? 'rotate-90 text-white' : ''
              }`}
            />
          </button>

          {mobileTeleportOpen && (
            <div className="absolute right-0 mt-2 max-h-80 w-60 overflow-y-auto rounded-2xl border border-white/10 bg-neutral-950/92 p-2 shadow-2xl backdrop-blur-md">
              <div className="mb-1 px-2 text-[10px] font-semibold uppercase tracking-wider text-neutral-400">
                Fast Travel · {WORLD_LANDMARK_DESTINATIONS.length} Landmarks
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

      <div className="wh-hud-upper">
        {!activeRide && activeGameMode === 'BATTLE_ROYALE' && (
          <div className="wh-hud-banner">
            <div className="wh-hud-glass flex flex-wrap items-center justify-center gap-x-3 gap-y-1 rounded-2xl px-3 py-1.5 text-xs text-white">
              <div className="flex items-center gap-1.5">
                <span className="h-2 w-2 rounded-full bg-emerald-400" />
                <span className="text-neutral-400">Alive</span>
                <span className="font-semibold tabular-nums">{simState.brResult === 'OUT' ? Math.max(0, aliveCount - 1) : aliveCount}</span>
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
              {simState.brResult && (
                <>
                  <span
                    className={`rounded-full px-2 py-0.5 text-[10px] font-bold tracking-wide ${
                      simState.brResult === 'WON'
                        ? 'bg-emerald-500/25 text-emerald-300'
                        : 'bg-rose-500/25 text-rose-300'
                    }`}
                  >
                    {simState.brResult === 'WON' ? 'VICTORY' : 'ELIMINATED'}
                  </span>
                  <span className="h-3.5 w-px bg-white/15" />
                </>
              )}
              <button
                onClick={() => window.dispatchEvent(new CustomEvent('br-drop'))}
                className="rounded-full bg-white px-2.5 py-0.5 text-[11px] font-semibold text-neutral-950 transition hover:bg-neutral-200"
              >
                {simState.brResult ? 'Play again' : 'Drop Again (P)'}
              </button>
            </div>
          </div>
        )}

        {!activeRide && activeGameMode === 'GRAND_PRIX' && (
          <div className="wh-hud-banner">
            <div className="wh-hud-glass flex flex-wrap items-center justify-center gap-x-3 gap-y-1 rounded-2xl px-3 py-2 text-xs text-white">
              <span className="font-semibold tabular-nums text-amber-200" aria-label="Race position">P{raceRank}</span>
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
                {split !== null && (
                  <span className={split <= 0 ? 'text-emerald-300' : 'text-amber-300'}>
                    {split > 0 ? '+' : '−'}{Math.abs(split).toFixed(2)}
                  </span>
                )}
                <meter className="hidden h-2 w-12 accent-amber-400 sm:inline" aria-label="Drift boost" min={0} max={100} value={driftScore} />
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

        {!activeRide && activeGameMode === 'WORLD_TOUR' && (
          <div className="wh-hud-banner">
            <div className="wh-hud-glass flex items-center justify-between gap-3 rounded-2xl px-3 py-2 text-white">
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

        {showRidePicker && (
          <div className="wh-hud-banner wh-hud-glass flex flex-wrap items-center justify-center gap-1.5 rounded-2xl px-2.5 py-2 text-white">
            <span className="px-1 text-[10px] font-semibold uppercase tracking-wider text-fuchsia-200">
              Wonder Ocean Pier Rides
            </span>
            {AMUSEMENT_PARK_RIDES.map((ride) => {
              const isNear = !coastalPrompt && hud.nearbyRide === ride.id;
              return (
                <button
                  key={ride.id}
                  type="button"
                  onClick={() => boardAmusementRide(ride.id)}
                  title={ride.name}
                  className={`wh-hud-chip ${isNear ? 'wh-hud-chip-selected' : ''}`}
                >
                  {ride.name.split(' ')[0]}{isNear && !touchUi ? ' [E]' : ''}
                </button>
              );
            })}
          </div>
        )}

        {activeRide && (
          <div className="wh-hud-banner wh-hud-glass flex flex-wrap items-center justify-center gap-x-3 gap-y-1.5 rounded-2xl px-3 py-2 text-xs text-white">
            <span className="font-semibold tracking-wide text-amber-200">{activeRide.name}</span>
            {activeRide.id === 'COASTER' && (
              <>
                <span className="font-semibold text-sky-200">{hud.speedKmh} km/h</span>
                <button type="button" onClick={toggleCamera} className="wh-hud-chip">
                  {!touchUi && '[X] '}{cameraView === 1 ? '3rd Person' : 'Front-Row FPV'}
                </button>
              </>
            )}
            <button type="button" onClick={exitAmusementRide} className="wh-hud-chip">
              {!touchUi && '[E] '}Exit
            </button>
          </div>
        )}

        {pointerHintEnabled && !activeRide && !showModeBanner && !showRidePicker && !coastalPrompt && !discovery && (
          <div className="wh-hud-glass wh-pointer-hint rounded-full px-3 py-1 text-[11px] font-medium text-slate-200"
            data-visible={showPointerHint} aria-hidden={!showPointerHint}>
            {pointerLocked ? 'Mouse Locked' : 'Click view to lock mouse'}
            {' · [X] '}{cameraView === 1 ? '3rd Person' : '1st Person'}{pointerLocked ? ' · [Esc] Unlock' : ''}
          </div>
        )}

        {coastalPrompt && (
          <button type="button" className="wh-hud-glass wh-coastal-prompt"
            disabled={coastalPrompt === 'Wheel spinning'}
            onClick={() => {
              if (interactCoast()) setUiTick((n) => n + 1);
            }}>
            {!touchUi && coastalPrompt !== 'Wheel spinning' && <kbd>E</kbd>}
            {coastalPrompt}
          </button>
        )}

        {discovery && (
          <div key={discovery.id} className="wh-hud-glass wh-discovery" role="status">
            <div className="wh-discovery-stamp" data-kind={discovery.kind} aria-hidden="true">
              {discovery.kind === 'postcard' ? <Camera size={20} /> : <Sparkles size={20} />}
            </div>
            <div className="min-w-0">
              <div className="wh-discovery-progress">Postcards {hud.postcardCount ?? 0}/{POSTCARDS.length}</div>
              <strong className="block text-sm leading-tight">{discovery.title}</strong>
              <p className="mt-0.5 text-xs leading-snug text-slate-300">{discovery.detail}</p>
            </div>
            {Boolean(discovery.chips) && (
              <span className="wh-discovery-chips">+{discovery.chips?.toLocaleString()} chips</span>
            )}
          </div>
        )}
      </div>

      {simState.coastal.flashUntil > coastalNow() && (
        <div key={simState.coastal.flashUntil} className="wh-camera-flash" aria-hidden="true" />
      )}

      {/* CONTROLS & SENSITIVITY PANEL */}
      {controlsOpen && !isCustomizerOpen && (
        <div className="wh-hud-glass wh-controls-drawer pointer-events-auto fixed left-3 top-16 z-40 max-h-[calc(100dvh-7rem)] w-72 overflow-y-auto rounded-2xl p-4 text-white sm:w-80">
          <div className="mb-3 flex items-center justify-between border-b border-white/10 pb-2.5">
            <div className="flex items-center gap-2">
              <SlidersHorizontal className="h-4 w-4 text-sky-400" />
              <span className="text-xs font-semibold tracking-wide">Controls &amp; Sensitivity</span>
            </div>
            <button
              onClick={() => updateControlsOpen(false)}
              className="rounded-full p-1 text-neutral-400 transition hover:bg-white/10 hover:text-white"
              title="Close Controls"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>

          <PlaySettings settings={controlSettings} update={updateControls} full touch={touchUi} />
          {/* One-Tap Handling Presets */}
          <div className="mb-4">
            <div className="mb-1.5 text-[10px] font-medium uppercase tracking-wider text-neutral-400">
              Quick Presets
            </div>
            <div className="grid grid-cols-3 gap-1.5">
              {(
                [
                  {
                    label: 'Easy',
                    desc: 'Smooth',
                    patch: {
                      steeringSensitivity: 0.75,
                      throttleSensitivity: 0.85,
                      cameraSmoothness: 0.85,
                      steeringAssist: true,
                    },
                  },
                  {
                    label: 'Balanced',
                    desc: 'Default',
                    patch: {
                      steeringSensitivity: 1.0,
                      throttleSensitivity: 1.0,
                      cameraSmoothness: 1.0,
                      steeringAssist: true,
                    },
                  },
                  {
                    label: 'Pro',
                    desc: 'Sharp',
                    patch: {
                      steeringSensitivity: 1.45,
                      throttleSensitivity: 1.25,
                      cameraSmoothness: 1.35,
                      steeringAssist: false,
                    },
                  },
                ] as const
              ).map((preset) => {
                const isActive =
                  Math.abs(controlSettings.steeringSensitivity - preset.patch.steeringSensitivity) < 0.04 &&
                  Math.abs(controlSettings.throttleSensitivity - preset.patch.throttleSensitivity) < 0.04 &&
                  controlSettings.steeringAssist === preset.patch.steeringAssist;
                return (
                  <button
                    key={preset.label}
                    onClick={() => updateControls(preset.patch)}
                    className={`rounded-xl border px-2 py-2 text-center transition ${
                      isActive
                        ? 'border-sky-400/60 bg-sky-500/20 text-white'
                        : 'border-white/10 bg-white/5 text-neutral-300 hover:bg-white/10 hover:text-white'
                    }`}
                  >
                    <div className="text-xs font-semibold">{preset.label}</div>
                    <div className="text-[10px] text-neutral-400">{preset.desc}</div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Mobile Touch Joystick Size */}
          <div className="mt-3.5 border-t border-white/10 pt-3">
            <div className="mb-1.5 text-[10px] font-medium uppercase tracking-wider text-neutral-400">
              Touch Joystick Size
            </div>
            <div className="grid grid-cols-3 gap-1.5">
              {(
                [
                  { id: 'SM', label: 'Small' },
                  { id: 'MD', label: 'Medium' },
                  { id: 'LG', label: 'Large' },
                ] as const
              ).map((sz) => (
                <button
                  key={sz.id}
                  onClick={() => updateControls({ joystickSize: sz.id })}
                  className={`rounded-lg border py-1.5 text-xs font-medium transition ${
                    controlSettings.joystickSize === sz.id
                      ? 'border-sky-400/60 bg-sky-500/20 text-white'
                      : 'border-white/10 bg-white/5 text-neutral-300 hover:bg-white/10'
                  }`}
                >
                  {sz.label}
                </button>
              ))}
            </div>
          </div>

          {/* Reset */}
          <button
            onClick={() => updateControls({ ...DEFAULT_CONTROL_SETTINGS })}
            className="mt-3.5 w-full rounded-xl border border-white/10 bg-white/5 py-1.5 text-xs font-medium text-neutral-300 transition hover:bg-white/10 hover:text-white"
          >
            Reset to Defaults
          </button>
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

            {/* Hero & Costume Selector */}
            <div>
              <div className="mb-1.5 text-[11px] font-medium text-neutral-400">Hero</div>
              <div className="grid grid-cols-2 gap-1.5">
                {HERO_ROSTER.slice(0, 14).map((hero) => {
                  const active = hero.costumes.some((c) => c.archetype === custom.archetype);
                  return (
                    <button
                      key={hero.heroId}
                      onClick={() => {
                        const first = hero.costumes[0];
                        const preset = CHARACTER_PRESETS.find(({ archetype }) => archetype === first.archetype);
                        updateCustomization(preset ?? { archetype: first.archetype, presetName: `${hero.name} · ${first.label}` });
                      }}
                      className={`rounded-lg border px-2 py-1.5 text-left text-[11px] font-medium transition ${
                        active
                          ? 'border-white bg-white/15 text-white'
                          : 'border-white/10 bg-white/5 text-neutral-300 hover:bg-white/10'
                      }`}
                    >
                      <span className="block truncate">{hero.name}</span>
                    </button>
                  );
                })}
              </div>
              {(() => {
                const curHero = HERO_ROSTER.find((h) => h.costumes.some((c) => c.archetype === custom.archetype));
                const curCostume = curHero?.costumes.find((c) => c.archetype === custom.archetype);
                return (
                  <>
                    {curHero && curHero.costumes.length > 1 && (
                      <div className="mt-2.5">
                        <div className="mb-1.5 text-[11px] font-medium text-neutral-400">Costumes ({curHero.name})</div>
                        <div className="grid grid-cols-2 gap-1.5">
                          {curHero.costumes.map((costume) => (
                            <button
                              key={costume.archetype}
                              onClick={() => updateCustomization({ archetype: costume.archetype, presetName: `${curHero.name} · ${costume.label}` })}
                              className={`rounded-lg border px-2 py-1 text-left text-[11px] font-medium transition ${
                                custom.archetype === costume.archetype
                                  ? 'border-white bg-white/15 text-white'
                                  : 'border-white/10 bg-white/5 text-neutral-300 hover:bg-white/10'
                              }`}
                            >
                              {costume.label}
                            </button>
                          ))}
                        </div>
                      </div>
                    )}
                    {curCostume?.supportsKitTint && (
                      <div className="mt-2.5">
                        <div className="mb-1.5 text-[11px] font-medium text-neutral-400">Athletic Kit Colorway</div>
                        <div className="flex flex-wrap items-center gap-2">
                          {KIT_COLORWAYS.map((kw) => {
                            const active = (custom.kitColorHex ?? '#ffffff').toLowerCase() === kw.hex.toLowerCase();
                            return (
                              <button
                                key={kw.hex}
                                title={kw.name}
                                onClick={() => updateCustomization({ kitColorHex: kw.hex })}
                                style={{ backgroundColor: kw.hex }}
                                className={`h-6 w-6 rounded-full border transition-transform ${
                                  active ? 'scale-110 border-2 border-white' : 'border-white/30 hover:scale-105'
                                }`}
                              />
                            );
                          })}
                        </div>
                      </div>
                    )}
                  </>
                );
              })()}
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

      <div className="wh-hud-lower-left">
        <div
          className="wh-hud-glass wh-radar"
          role="group"
          aria-label="World minimap"
        >
          <svg viewBox={`0 0 ${RADAR_SIZE} ${RADAR_SIZE}`} aria-hidden="true">
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

            <polygon points={radarShoreline} fill="#6e8b7a38" stroke="#9fb6a365" strokeWidth="0.75" />
            <polygon points={radarCoastalRoad} fill="none" stroke="#d3e5dd82" strokeWidth="0.9" />
            <polygon points={radarIslandTwo} fill="#507b754f" stroke="#a1c4b5ad" strokeWidth="0.75" />
            {radarAtolls.map(({ id, outline }) => (
              <polygon key={id} points={outline} fill="#507b7577" stroke="#a1c4b5c0" strokeWidth="0.75" />
            ))}
            <rect x={pierLeft} y={pierTop} width={pierRight - pierLeft} height={pierBottom - pierTop}
              rx="1.2" fill="#d297bd73" stroke="#f5bde3bb" strokeWidth="0.7" />
            <line x1={aveTopX} y1={aveTopZ} x2={bridgeX} y2={bridgeZ} stroke="#ddac79af" strokeWidth="1.5" />
            <line
              x1={canalStartX}
              y1={canalStartZ}
              x2={canalEndX}
              y2={canalEndZ}
              stroke="rgba(56, 189, 248, 0.4)"
              strokeWidth="2"
              strokeLinecap="round"
            />
            <line
              x1={runwayStartX}
              y1={runwayStartZ}
              x2={runwayEndX}
              y2={runwayEndZ}
              stroke="rgba(163, 163, 163, 0.4)"
              strokeWidth="1.6"
              strokeLinecap="round"
            />
            <line
              x1={aveTopX}
              y1={aveTopZ}
              x2={aveBotX}
              y2={aveBotZ}
              stroke="rgba(255, 255, 255, 0.25)"
              strokeWidth="1"
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
                const [bx, bz] = worldToRadar(bot.x, bot.z, 54);
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

          <span className="wh-radar-north" aria-hidden="true">N</span>

          {WORLD_LANDMARK_DESTINATIONS.map((lm) => {
            const [mx, mz] = worldToRadar(lm.x, lm.z);
            return (
              <button
                key={lm.id}
                onClick={() => warpToLocation(lm.x, lm.z, lm.forceMode, lm.id)}
                type="button"
                aria-label={`Fast travel to ${lm.fullTitle}`}
                title={lm.fullTitle}
                style={{ left: `${mx / RADAR_SIZE * 100}%`, top: `${mz / RADAR_SIZE * 100}%`, backgroundColor: lm.color }}
                className="wh-radar-dot"
              />
            );
          })}
        </div>

        {((!touchUi && !activeRide) || showFootVitals) && (
          <div className="wh-hud-glass wh-traversal-card rounded-2xl p-1.5">
            {showFootVitals && (
              <div className="grid grid-cols-2 gap-2 px-1 py-0.5">
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

            {!touchUi && !activeRide && (
              <div className="flex items-center gap-0.5">
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
                      type="button"
                      title={label}
                      aria-label={label}
                      aria-pressed={active}
                      className={`flex items-center gap-1 rounded-full px-1.5 py-1.5 text-xs font-medium transition lg:px-2 ${
                        active
                          ? 'bg-white text-neutral-950'
                          : 'bg-white/5 text-neutral-300 hover:bg-white/15 hover:text-white'
                      }`}
                    >
                      <Icon className="h-3.5 w-3.5" />
                      <span className="hidden lg:inline">{label}</span>
                    </button>
                  );
                })}
                {hud.mode === 'FOOT' && !hud.swimming && (
                  <>
                    <button type="button" className="wh-hud-chip px-1.5" aria-label="Play emote"
                      title={`${EMOTE_STYLES.find((item) => item.id === simState.activeEmote)?.label} (Z)`}
                      onClick={() => {
                        simState.lobbyEmoteTimer = 2.6;
                        if (!interactCoast(true)) coastalReaction('emote', activePos.x, activePos.z);
                        setUiTick((n) => n + 1);
                      }}>
                      <Sparkles className="h-3.5 w-3.5 text-amber-200" />
                    </button>
                    <button type="button" className="wh-hud-chip px-1.5" title="Next emote" aria-label="Next emote"
                      onClick={() => {
                        const idx = EMOTE_STYLES.findIndex((item) => item.id === simState.activeEmote);
                        simState.activeEmote = EMOTE_STYLES[(idx + 1) % EMOTE_STYLES.length].id;
                        simState.lobbyEmoteTimer = 2.6;
                        setUiTick((n) => n + 1);
                      }}>
                      <ChevronRight className="h-3 w-3" />
                    </button>
                  </>
                )}
              </div>
            )}

            {!touchUi && !activeRide && hud.mode !== 'FOOT' && (
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

              </div>
            )}
          </div>
        )}
      </div>

      {/* 7. BOTTOM-RIGHT: Vehicle Integrity + Speedometer + Battle Royale Weapon Bar */}
      {!activeRide && !controlsOpen && !isCustomizerOpen && (
        <div className="wh-hud-lower-right">
          {/* Vehicle Integrity Readout & Quick Repair Pill (whenever driving/sailing/flying) */}
          {hud.mode !== 'FOOT' && (
            <div className="wh-hud-glass flex max-w-full flex-wrap items-center justify-end gap-1.5 rounded-2xl px-2 py-1.5">
              <div className="h-1.5 w-12 overflow-hidden rounded-full bg-white/15 sm:w-20">
                <div
                  style={{ width: `${vehicleHp}%` }}
                  className={`h-full rounded-full transition-all duration-150 ${vehicleBarColor}`}
                />
              </div>
              <span
                className={`text-xs font-semibold tabular-nums ${
                  vehicleWrecked || vehicleHp < 30
                    ? 'text-rose-400'
                    : vehicleHp < 60
                    ? 'text-amber-300'
                    : 'text-emerald-300'
                }`}
              >
                {vehicleHp}%
              </span>
              {(vehicleHp < 95 || vehicleWrecked) && (
                <button
                  type="button"
                  onClick={() => window.dispatchEvent(new CustomEvent('repair-vehicle'))}
                  className="flex items-center gap-1 rounded-full border border-emerald-400/40 bg-emerald-500/20 px-2 py-0.5 text-[11px] font-semibold text-emerald-200 transition hover:bg-emerald-500/35 hover:text-white"
                >
                  <Wrench className="h-3 w-3" />
                  <span>Repair (H)</span>
                </button>
              )}
            </div>
          )}

          {hud.mode === 'PLANE' && hud.aircraftDamage && hud.aircraftDamage.state !== 'sound' && (
            <div role="status" className="pointer-events-none rounded-lg border border-amber-300/35 bg-slate-950/85 px-2.5 py-1 text-[10px] font-semibold text-amber-200">
              {hud.aircraftDamage.state === 'wrecked'
                ? hud.aircraftDamage.settled ? 'WRECKED' : 'ENGINE FAILURE'
                : hud.aircraftDamage.state === 'burning' ? 'ENGINE FIRE'
                : hud.aircraftDamage.state === 'failing' ? 'CONTROL DEGRADED' : 'ENGINE SMOKE'}
              <span className="ml-2 text-slate-300">L {Math.round(hud.aircraftDamage.left)}% · R {Math.round(hud.aircraftDamage.right)}%</span>
            </div>
          )}
          {(hud.mode !== 'FOOT' || (!touchUi && activeGameMode !== 'FREE_ROAM')) && (
            <div className="wh-hud-glass wh-speedometer flex flex-col items-stretch gap-1.5 rounded-2xl px-2.5 py-2 sm:px-3.5">
              <div className="flex flex-wrap items-baseline justify-between gap-1.5 sm:gap-3">
                <div className="flex items-baseline gap-1">
                  <span className="text-lg font-semibold tabular-nums text-white sm:text-xl">
                    {hud.speedKmh}
                  </span>
                  <span className="text-[11px] text-neutral-400 sm:text-xs">km/h</span>
                </div>

                {hud.mode === 'CAR' && (
                  <>
                    <span className="h-3.5 w-px bg-white/15" />
                    <div className="flex items-center gap-1.5">
                      <span className="text-[10px] font-medium uppercase tracking-wider text-neutral-400">
                        Gear
                      </span>
                      <span className="rounded-md bg-white/10 px-1.5 py-0.5 font-mono text-xs font-bold tabular-nums text-sky-300">
                        {carGear}
                      </span>
                    </div>
                  </>
                )}

                {hud.mode === 'PLANE' && (
                  <>
                    <span className="h-3.5 w-px bg-white/15" />
                    <div className="flex items-baseline gap-1">
                      <span className="text-sm font-medium tabular-nums text-neutral-200">
                        {hud.altitude}
                      </span>
                      <span className="text-xs text-neutral-400">m</span>
                    </div>
                    <span className="h-3.5 w-px bg-white/15" />
                    <div className="flex items-baseline gap-1">
                      <span className="text-[10px] font-medium uppercase text-neutral-400">THR</span>
                      <span className="text-xs font-semibold tabular-nums text-sky-300">
                        {throttlePct}%
                      </span>
                    </div>
                  </>
                )}
              </div>

              {hud.mode === 'CAR' && (
                <div className="flex items-center gap-2">
                  <span className="flex items-center gap-1 text-[10px] font-medium text-neutral-400">
                    <Zap className={`h-3 w-3 ${driftPct >= 26 ? 'text-amber-400' : 'text-sky-400'}`} />
                    <span>Drift</span>
                  </span>
                  <div className="h-1.5 flex-1 min-w-[74px] overflow-hidden rounded-full bg-white/10">
                    <div
                      style={{ width: `${driftPct}%` }}
                      className={`h-full rounded-full transition-all duration-100 ${
                        driftPct >= 26 ? 'bg-amber-400 shadow-[0_0_8px_rgba(251,191,36,0.65)]' : 'bg-sky-400'
                      }`}
                    />
                  </div>
                  <span className="w-7 text-right font-mono text-[10px] tabular-nums text-neutral-300">
                    {driftPct}%
                  </span>
                </div>
              )}

              {hud.mode === 'PLANE' && (
                <div className="flex items-center gap-2">
                  <span className="text-[10px] font-medium text-neutral-400">Throttle</span>
                  <div className="h-1.5 flex-1 min-w-[88px] overflow-hidden rounded-full bg-white/10">
                    <div
                      style={{ width: `${throttlePct}%` }}
                      className={`h-full rounded-full transition-all duration-100 ${
                        throttlePct >= 82 ? 'bg-amber-400' : 'bg-sky-400'
                      }`}
                    />
                  </div>
                </div>
              )}
            </div>

          )}
          {showQuickBar && !(touchUi && activeGameMode === 'BATTLE_ROYALE' && simState.brResult === 'OUT') && (
            <div className={`wh-hud-glass wh-quickbar ${activeGameMode === 'FREE_ROAM' ? 'wh-quickbar-compact' : ''}`}>
              {renderQuickBar(touchUi || activeGameMode === 'FREE_ROAM')}
            </div>
          )}
        </div>
      )}

      {/* 8. MOBILE TOUCH CONTROLS OVERLAY */}
      <MobileControls
        mode={hud.mode}
        vehicleHp={vehicleHp}
        onSelectMode={onSelectMode}
        visible={touchUi && !isStartMenuOpen && !isCustomizerOpen && !controlsOpen &&
          !(activeGameMode === 'BATTLE_ROYALE' && simState.brResult === 'OUT')}
      />
    </div>
  );
}
