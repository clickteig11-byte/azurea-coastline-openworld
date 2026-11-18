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
import { getTerrainHeight, VehicleMode } from '../game/worldMath';
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

const RADAR_SIZE = 128;
const RADAR_CENTER = RADAR_SIZE / 2; // 64
const RADAR_SCALE = 52 / 260;

function worldToRadar(x: number, z: number): [number, number] {
  const rx = Math.max(7, Math.min(RADAR_SIZE - 7, RADAR_CENTER + x * RADAR_SCALE));
  const rz = Math.max(7, Math.min(RADAR_SIZE - 7, RADAR_CENTER + z * RADAR_SCALE));
  return [rx, rz];
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
    fullTitle: 'New York — Empire State Building',
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
    menuLabel: 'Golden Gate',
    fullTitle: 'San Francisco — Golden Gate Bridge',
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
    menuLabel: 'London',
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
    menuLabel: 'Paris',
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
    menuLabel: 'Dubai',
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
    menuLabel: 'Rome',
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
    menuLabel: 'Sydney',
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
    menuLabel: 'Tokyo',
    fullTitle: 'Tokyo — Tokyo Tower',
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
    menuLabel: 'Statue of Liberty',
    fullTitle: 'New York — Statue of Liberty',
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
    shortLabel: 'Rio',
    menuLabel: 'Rio',
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
    shortLabel: 'Venice',
    menuLabel: 'Venice',
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
    shortLabel: 'Pyramids',
    menuLabel: 'Pyramids',
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
    menuLabel: 'Cruise Harbor',
    fullTitle: 'Cruise Harbor',
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
    menuLabel: 'Airport',
    fullTitle: 'International Airport',
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

  const warpToLocation = (x: number, z: number, forceMode?: VehicleMode, destId?: string) => {
    simState.parachuting = false;
    simState.gliding = false;

    if (forceMode) {
      onSelectMode(forceMode);
    }

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
      simState.stuntText = matched.fullTitle;
      simState.stuntTimer = 2.2;
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
      simState.stuntText = `Sky-Drop: ${chosenDest.menuLabel}`;
      simState.stuntTimer = 3.0;
    } else if (activeGameMode === 'GRAND_PRIX') {
      onSelectMode('CAR');
      simState.activeCheckpoint = 0;
      simState.lapTime = 0;
      const startY = Math.max(getTerrainHeight(0, 12), 0) + 0.1;
      simState.carPos.set(0, startY, 12);
      simState.carYaw = Math.PI;
      simState.stuntText = 'Grand Prix Started';
      simState.stuntTimer = 3.0;
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

  const isCustomizerOpen = Boolean(simState.customizerOpen);
  const custom = simState.customization;
  const activeCarIdx = typeof s.activeCarIdx === 'number' ? s.activeCarIdx : 0;
  const activeBoatIdx = typeof s.activeBoatIdx === 'number' ? s.activeBoatIdx : 0;
  const activePlaneIdx = typeof s.activePlaneIdx === 'number' ? s.activePlaneIdx : 0;

  const notificationBanner =
    killFeedText ||
    stuntCallout ||
    (driftScore > 0 ? `Drift +${driftScore}` : null) ||
    (hud.nearbyVehicle ? `Press E to enter ${hud.nearbyVehicle.toLowerCase()}` : null) ||
    hud.nearLandmark ||
    null;

  const currentFinish =
    custom.topRoughness >= 0.48
      ? 'MATTE'
      : custom.topMetalness >= 0.35 || custom.topRoughness <= 0.22
      ? 'LEATHER'
      : 'SATIN';

  return (
    <div className="pointer-events-none fixed inset-0 z-20 select-none overflow-hidden font-sans">
      {/* =====================================================================
          1. CENTER CROSSHAIR (FOOT / CAR)
         ===================================================================== */}
      {!isStartMenuOpen && (hud.mode === 'FOOT' || hud.mode === 'CAR') && (
        <div className="pointer-events-none fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2">
          <div
            className={`relative h-5 w-5 transition-transform duration-150 ${
              killFeedText ? 'scale-125' : 'scale-100'
            }`}
          >
            <span className="absolute left-1/2 top-0 h-1.5 w-[1.5px] -translate-x-1/2 rounded-full bg-white/75" />
            <span className="absolute bottom-0 left-1/2 h-1.5 w-[1.5px] -translate-x-1/2 rounded-full bg-white/75" />
            <span className="absolute left-0 top-1/2 h-[1.5px] w-1.5 -translate-y-1/2 rounded-full bg-white/75" />
            <span className="absolute right-0 top-1/2 h-[1.5px] w-1.5 -translate-y-1/2 rounded-full bg-white/75" />
            <span className="absolute left-1/2 top-1/2 h-1 w-1 -translate-x-1/2 -translate-y-1/2 rounded-full bg-white" />
          </div>
        </div>
      )}

      {/* =====================================================================
          FLOATING NOTIFICATION PILL
         ===================================================================== */}
      {notificationBanner && !isStartMenuOpen && (
        <div className="pointer-events-none fixed left-1/2 top-16 -translate-x-1/2 z-30">
          <div className="flex items-center gap-2 rounded-full border border-white/15 bg-neutral-950/80 px-4 py-1.5 text-xs font-medium text-white shadow-lg backdrop-blur-md">
            {killFeedText && <Crosshair className="h-3.5 w-3.5 text-rose-400" />}
            <span>{notificationBanner}</span>
          </div>
        </div>
      )}

      {/* =====================================================================
          2. TOP-LEFT BAR (top-3 left-3)
         ===================================================================== */}
      <div className="pointer-events-auto fixed left-3 top-3 z-30 flex items-center gap-1.5 rounded-full border border-white/10 bg-neutral-950/75 px-2.5 py-1.5 shadow-lg backdrop-blur-md">
        <button
          onClick={() => handleToggleStartMenu()}
          className={`rounded-full px-3 py-1 text-xs font-medium transition ${
            isStartMenuOpen
              ? 'bg-white text-neutral-950'
              : 'bg-white/10 text-white hover:bg-white/20'
          }`}
        >
          Menu (M)
        </button>

        <button
          onClick={handleToggleCustomizer}
          className={`rounded-full px-3 py-1 text-xs font-medium transition ${
            isCustomizerOpen
              ? 'bg-white text-neutral-950'
              : 'text-neutral-200 hover:bg-white/10 hover:text-white'
          }`}
        >
          Wardrobe (C)
        </button>

        <button
          onClick={() => window.dispatchEvent(new CustomEvent('br-drop'))}
          className="rounded-full px-3 py-1 text-xs font-medium text-neutral-200 transition hover:bg-white/10 hover:text-white"
        >
          Sky-Drop (P)
        </button>

        <button
          onClick={handleToggleMute}
          title={muted ? 'Unmute Audio' : 'Mute Audio'}
          className="rounded-full p-1.5 text-neutral-300 transition hover:bg-white/10 hover:text-white"
        >
          {muted ? <VolumeX className="h-3.5 w-3.5" /> : <Volume2 className="h-3.5 w-3.5" />}
        </button>
      </div>

      {/* =====================================================================
          3. TOP-RIGHT FAST-TRAVEL PILLS (top-3 right-3)
         ===================================================================== */}
      <div className="pointer-events-auto fixed right-3 top-3 z-30 hidden max-w-[680px] flex-wrap items-center justify-end gap-1 rounded-2xl border border-white/10 bg-neutral-950/75 px-2.5 py-1.5 shadow-lg backdrop-blur-md lg:flex">
        {WORLD_LANDMARK_DESTINATIONS.map((lm) => {
          const isCurrent = selectedLandmarkId === lm.id;
          return (
            <button
              key={lm.id}
              onClick={() => warpToLocation(lm.x, lm.z, lm.forceMode, lm.id)}
              title={lm.fullTitle}
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

      {/* =====================================================================
          4. MINIMAL START & MODE MENU (isStartMenuOpen)
         ===================================================================== */}
      {isStartMenuOpen && (
        <div className="pointer-events-auto fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4 font-sans">
          <div className="w-full max-w-xl rounded-2xl border border-white/10 bg-neutral-950/85 p-6 text-white shadow-2xl backdrop-blur-md">
            {/* Header */}
            <div className="mb-5 flex items-center justify-between">
              <div>
                <h1 className="text-xl font-semibold tracking-tight text-white">World Horizon</h1>
                <p className="text-xs text-neutral-400">Open-World City</p>
              </div>
              <button
                onClick={() => handleToggleStartMenu(false)}
                title="Close"
                className="flex h-8 w-8 items-center justify-center rounded-full border border-white/10 bg-white/5 text-sm text-neutral-300 transition hover:bg-white/15 hover:text-white"
              >
                ✕
              </button>
            </div>

            {/* Section 1 — Mode (4 clean pill buttons in a 4-column grid) */}
            <div className="mb-5">
              <div className="mb-2 text-xs font-medium text-neutral-400">Mode</div>
              <div className="grid grid-cols-4 gap-2">
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
                      className={`flex items-center justify-center gap-2 rounded-xl border py-2.5 text-sm font-medium transition ${
                        active
                          ? 'border-white bg-white text-neutral-950 shadow-sm'
                          : 'border-white/10 bg-white/5 text-neutral-200 hover:bg-white/10 hover:text-white'
                      }`}
                    >
                      <Icon className="h-4 w-4" />
                      <span>{label}</span>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Section 2 — Select Vehicle / Character (contextual to active mode only) */}
            <div className="mb-5">
              <div className="mb-2 text-xs font-medium text-neutral-400">
                {hud.mode === 'CAR'
                  ? 'Select Vehicle'
                  : hud.mode === 'BOAT'
                  ? 'Select Vessel'
                  : hud.mode === 'PLANE'
                  ? 'Select Aircraft'
                  : 'Select Character'}
              </div>

              {hud.mode === 'CAR' && (
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                  {CAR_FLEET_MENU.map((car) => {
                    const isSelected = activeCarIdx === car.idx;
                    return (
                      <button
                        key={car.idx}
                        onClick={() => selectSpecificCar(car.idx)}
                        className={`rounded-xl border px-3 py-2 text-left text-xs font-medium transition ${
                          isSelected
                            ? 'border-white bg-white/15 text-white'
                            : 'border-white/10 bg-white/5 text-neutral-300 hover:bg-white/10 hover:text-white'
                        }`}
                      >
                        {car.label}
                      </button>
                    );
                  })}
                </div>
              )}

              {hud.mode === 'BOAT' && (
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                  {BOAT_FLEET_MENU.map((boat) => {
                    const isSelected = activeBoatIdx === boat.idx;
                    return (
                      <button
                        key={boat.idx}
                        onClick={() => selectSpecificBoat(boat.idx)}
                        className={`rounded-xl border px-3 py-2 text-left text-xs font-medium transition ${
                          isSelected
                            ? 'border-white bg-white/15 text-white'
                            : 'border-white/10 bg-white/5 text-neutral-300 hover:bg-white/10 hover:text-white'
                        }`}
                      >
                        {boat.label}
                      </button>
                    );
                  })}
                </div>
              )}

              {hud.mode === 'PLANE' && (
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                  {PLANE_FLEET_MENU.map((plane) => {
                    const isSelected = activePlaneIdx === plane.idx;
                    return (
                      <button
                        key={plane.idx}
                        onClick={() => selectSpecificPlane(plane.idx)}
                        className={`rounded-xl border px-3 py-2 text-left text-xs font-medium transition ${
                          isSelected
                            ? 'border-white bg-white/15 text-white'
                            : 'border-white/10 bg-white/5 text-neutral-300 hover:bg-white/10 hover:text-white'
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
                  <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
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
                              : 'border-white/10 bg-white/5 text-neutral-300 hover:bg-white/10 hover:text-white'
                          }`}
                        >
                          {item.label}
                        </button>
                      );
                    })}
                  </div>

                  <div className="grid grid-cols-2 gap-2 pt-1">
                    <button
                      onClick={() => {
                        onSelectMode('FOOT');
                        handleToggleCustomizer();
                      }}
                      className="rounded-xl border border-white/10 bg-white/5 py-2 text-xs font-medium text-neutral-200 transition hover:bg-white/10 hover:text-white"
                    >
                      Customize Outfit
                    </button>
                    <button
                      onClick={() => {
                        s.startMenuOpen = false;
                        window.dispatchEvent(new CustomEvent('br-drop'));
                        window.dispatchEvent(new CustomEvent('toggle-start-menu'));
                      }}
                      className="rounded-xl border border-white/10 bg-white/5 py-2 text-xs font-medium text-neutral-200 transition hover:bg-white/10 hover:text-white"
                    >
                      Parachute Drop
                    </button>
                  </div>
                </div>
              )}
            </div>

            {/* Section 3 — Starting Location */}
            <div className="mb-6">
              <div className="mb-2 text-xs font-medium text-neutral-400">Starting Location</div>
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
                          : 'border-white/10 bg-white/5 text-neutral-300 hover:bg-white/10 hover:text-white'
                      }`}
                    >
                      {lm.menuLabel}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Bottom Action Bar */}
            <button
              onClick={handleDeployToMetropolis}
              className="w-full rounded-xl bg-white py-3 text-sm font-semibold text-neutral-950 shadow-md transition hover:bg-neutral-200 active:scale-[0.99]"
            >
              Play
            </button>
          </div>
        </div>
      )}

      {/* =====================================================================
          5. CHARACTER WARDROBE DRAWER (isCustomizerOpen)
         ===================================================================== */}
      {isCustomizerOpen && !isStartMenuOpen && (
        <div className="pointer-events-auto fixed left-3 top-16 bottom-24 z-30 flex w-76 flex-col overflow-hidden rounded-2xl border border-white/10 bg-neutral-950/85 font-sans text-white shadow-2xl backdrop-blur-md">
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

      {/* =====================================================================
          6. BOTTOM-LEFT (bottom-3 left-3):
             128x128 Minimap + Compact Health/Shield + 4 Mode Buttons + Vehicle/Outfit Cycle
         ===================================================================== */}
      <div className="pointer-events-auto fixed bottom-3 left-3 z-30 flex items-end gap-2.5">
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

            {/* Venetian Canal Waterway */}
            <line
              x1={canalStartX}
              y1={canalStartZ}
              x2={canalEndX}
              y2={canalEndZ}
              stroke="rgba(56, 189, 248, 0.4)"
              strokeWidth="4.5"
              strokeLinecap="round"
            />

            {/* Airport Runway Strip */}
            <line
              x1={runwayStartX}
              y1={runwayStartZ}
              x2={runwayEndX}
              y2={runwayEndZ}
              stroke="rgba(163, 163, 163, 0.4)"
              strokeWidth="4"
              strokeLinecap="round"
            />

            {/* Main Avenues */}
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

            {/* Active Checkpoint Dot */}
            <circle cx={cpRx} cy={cpRz} r={3} fill="#38bdf8" />

            {/* Enemy Bot Dots */}
            {simState.botTargets.map((bot) => {
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

            {/* Player View Cone & Heading Arrow */}
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
                title={lm.fullTitle}
                style={{ left: `${mx}px`, top: `${mz}px`, backgroundColor: lm.color }}
                className="absolute h-2 w-2 -translate-x-1/2 -translate-y-1/2 rounded-full border border-neutral-950 transition-transform hover:scale-150"
              />
            );
          })}
        </div>

        {/* Compact Health/Shield + Mode Buttons + Next Vehicle/Outfit */}
        <div className="flex flex-col gap-2 rounded-2xl border border-white/10 bg-neutral-950/75 p-2.5 shadow-xl backdrop-blur-md">
          {/* Health & Shield Bars */}
          <div className="grid grid-cols-2 gap-2.5">
            <div>
              <div className="mb-1 flex items-center justify-between text-[10px] font-medium text-neutral-300">
                <span className="flex items-center gap-1">
                  <Heart className="h-3 w-3 text-emerald-400" /> Health
                </span>
                <span>{playerHp}</span>
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
                <span>{playerShield}</span>
              </div>
              <div className="h-1.5 w-full overflow-hidden rounded-full bg-white/10">
                <div
                  style={{ width: `${playerShield}%` }}
                  className="h-full rounded-full bg-sky-400 transition-all duration-150"
                />
              </div>
            </div>
          </div>

          {/* 4 Clean Mode Buttons (clicking opens the Mode Menu) */}
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
                  onClick={() => {
                    onSelectMode(id);
                    handleToggleStartMenu(true);
                  }}
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
                <span className="text-[11px] text-neutral-400">[V] Next Vehicle</span>
              </button>
            )}

            {hud.mode === 'BOAT' && (
              <button
                onClick={() => window.dispatchEvent(new CustomEvent('cycle-boat'))}
                className="flex w-full items-center justify-between rounded-lg border border-white/10 bg-white/5 px-2.5 py-1 text-xs font-medium text-neutral-200 transition hover:bg-white/10 hover:text-white"
              >
                <span>{BOAT_FLEET_MENU[activeBoatIdx]?.label ?? 'Boat'}</span>
                <span className="text-[11px] text-neutral-400">[B] Next Vehicle</span>
              </button>
            )}

            {hud.mode === 'PLANE' && (
              <button
                onClick={() => window.dispatchEvent(new CustomEvent('cycle-plane'))}
                className="flex w-full items-center justify-between rounded-lg border border-white/10 bg-white/5 px-2.5 py-1 text-xs font-medium text-neutral-200 transition hover:bg-white/10 hover:text-white"
              >
                <span>{PLANE_FLEET_MENU[activePlaneIdx]?.label ?? 'Aircraft'}</span>
                <span className="text-[11px] text-neutral-400">[B] Next Vehicle</span>
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

      {/* =====================================================================
          7. BOTTOM-RIGHT (bottom-3 right-3):
             Digital Speedometer + Compact Weapon Bar (when on foot or driving)
         ===================================================================== */}
      <div className="pointer-events-auto fixed bottom-3 right-3 z-30 flex flex-col items-end gap-1.5">
        {/* Clean Digital Speedometer */}
        <div className="flex items-baseline gap-3 rounded-2xl border border-white/10 bg-neutral-950/75 px-4 py-2 shadow-xl backdrop-blur-md">
          <div className="flex items-baseline gap-1">
            <span className="text-xl font-semibold tabular-nums text-white">{hud.speedKmh}</span>
            <span className="text-xs text-neutral-400">km/h</span>
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

        {/* Compact Weapon Bar when on foot or driving */}
        {(hud.mode === 'FOOT' || hud.mode === 'CAR') && (
          <div className="flex items-center gap-1 rounded-2xl border border-white/10 bg-neutral-950/75 p-1.5 shadow-xl backdrop-blur-md">
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
    </div>
  );
}
