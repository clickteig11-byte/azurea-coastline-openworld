import { queueSkid } from './SkidMarks';
import { aiming, civilianTargets, targetDistance } from '../game/aim';
import { BUILD_MATERIALS, BUILD_TYPES, construction, harvestResource, placeBuild, planBuild } from '../game/building';
import { Pickaxe } from './Pickaxe';
import { Cockpit } from './Cockpit';
import { lobbyStage } from './LobbyStage';
import React, { useEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import { useFrame, useThree } from '@react-three/fiber';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/examples/jsm/loaders/DRACOLoader.js';
import { simState, GameHudSnapshot, WEAPON_SPECS, freshAircraftDamage, COASTAL_CHARACTERS, requestGamePointerLock, type AircraftDamageStage, type CoastalCharacter, type CharacterCustomization } from '../game/store';
import { getTerrainHeight, getTravelHeight, getWaveHeight, marineRampHeight, sampleHullBuoyancy, isConstructionClosed, islandTwoRadius, CONSTRUCTION_ISLAND, LANDMARKS, RouletteOutcome, AMUSEMENT_PARK_RIDES, sampleAmusementRidePose, type AmusementRideId } from '../game/worldMath';
import { coastalBurst, coastalNow, coastalPrompt, hydroBoost, strikeDuck } from '../game/coastalPlay';
import { crossesHydroRing, HYDRO_RINGS, TRAMPOLINES, trampolineLaunchSpeed, TRAMPOLINE_RADIUS } from '../game/quirky';
import { aircraftPowerInput, fixedWingStep, hoverStrafe } from '../game/flight';
import { crossesRaceGate } from '../game/grandPrix';
import { soundEngine } from '../game/soundEngine';
import { createShadowTexture, createLimestonePBR, createSkyscraperPBR } from './Textures';
import { REPAIR_BAY_COORDS } from './World';
import { animateHumanoid, createHumanoidRig, retargetMixamoClips, strideDistance, type HumanoidRig, type RigPosture } from '../game/humanoid';
import { computeChassisWeightTransfer, computeFootWishVelocity, rearSlip, shoreReturn, steeringPolarity, surfaceStep, suspensionStep } from '../game/motion';
import { injureBot, injurePlayer } from '../game/combat';
import { blastWorld, damageWorld, emitEnvironment, traceGround, traceWorld, type WorldHit } from '../game/worldDamage';

const UP = new THREE.Vector3(0, 1, 0);
const DOWN = new THREE.Vector3(0, -1, 0);

const blocksCamera = (contact: WorldHit) => contact.distance > 0.012 && contact.section?.solid !== false;

function constrainCamera(subject: THREE.Vector3, eye: THREE.Vector3, direction: THREE.Vector3) {
  direction.copy(eye).sub(subject);
  const range = direction.length();
  if (range < 0.01) return range;
  direction.multiplyScalar(1 / range);
  const wall = traceWorld(subject, direction, range, 0.24, blocksCamera);
  if (!wall) return range;
  const distance = Math.max(0.025, wall.distance - 0.21);
  eye.copy(subject).addScaledVector(direction, distance);
  return distance;
}

interface Props {
  onHudUpdate: (snap: GameHudSnapshot) => void;
}

const OUTCOMES: RouletteOutcome[] = ['RED', 'BLACK', 'GREEN_00'];

export const CAR_NAMES = [
  'FERRARI 458 ITALIA',
  'GT3 GYMKHANA SUPERCAR',
  '80S WEDGE SUPERCAR',
  '60S CLASSIC MUSCLE',
  'VEGAS VIP STRETCH LIMO',
] as const;

export const PLANE_NAMES = [
  'GULFSTREAM G700 JET',
  'BELL VIP HELICOPTER',
  'MUSTANG STRIKE FIGHTER',
  'TWIN REGIONAL TURBOPROP',
  'BOEING 737 EXECUTIVE LINER',
  'HEAVY STRATEGIC CARGO JET',
] as const;

export const BOAT_NAMES = [
  'CIGARETTE RACING POWERBOAT',
  'OASIS OF AZUREA CRUISE LINER',
  'ROYAL SOVEREIGN TALL SHIP',
  'MEDITERRANEAN SLOOP YACHT',
  'AEGEAN MOTOR YACHT',
  'DEEP-SEA EXPLORER SUBMARINE',
] as const;

interface HeroCarRig {
  wrapper: THREE.Group;
  wheels: THREE.Object3D[];
  steerNodes: THREE.Object3D[];
  steeringWheel: THREE.Object3D | null;
  spinSign: number;
  brakeMat: THREE.MeshStandardMaterial | null;
}

interface PlaneFleetRig {
  wrapper: THREE.Group;
  rotorMain: THREE.Object3D | null;
  rotorTail: THREE.Object3D | null;
  spinNodesZ: THREE.Object3D[];
}

interface BoatFleetRig {
  wrapper: THREE.Group;
  spinNodesZ: THREE.Object3D[];
}

interface RpmMaterialRefs {
  skinMats: THREE.MeshStandardMaterial[];
  topMats: THREE.MeshStandardMaterial[];
  bottomMats: THREE.MeshStandardMaterial[];
  footwearMats: THREE.MeshStandardMaterial[];
  headwearMeshes: THREE.Mesh[];
  headwearMats: THREE.MeshStandardMaterial[];
  beardMeshes: THREE.Mesh[];
  beardMats: THREE.MeshStandardMaterial[];
}

const DEFAULT_CUSTOMIZATION: CharacterCustomization = {
  archetype: 'RPM_CUSTOM',
  presetName: 'Riviera Runner',
  skinColor: '#f1c7a8',
  topColor: '#0284c7',
  topRoughness: 0.34,
  topMetalness: 0.14,
  bottomColor: '#1e293b',
  footwearColor: '#f8fafc',
  headwearOn: false,
  headwearColor: '#0f172a',
  beardOn: false,
  beardColor: '#27272a',
  eyewear: 'NONE',
  backpackOn: false,
};

const AIM_CENTER = new THREE.Vector2();
const X_AXIS = new THREE.Vector3(1, 0, 0);
const Y_AXIS = new THREE.Vector3(0, 1, 0);
const Z_AXIS = new THREE.Vector3(0, 0, 1);

export function triggerRouletteSpin() {
  const next = OUTCOMES[Math.floor(Math.random() * OUTCOMES.length)];
  simState.roulette = next;
  simState.rouletteTimer = 45;
  simState.multiplier = next === 'GREEN_00' ? 3 : next === 'RED' ? 2 : 1.5;
  soundEngine.playRouletteFanfare(next);

  // Respawn aerial rings on GREEN_00 jackpot!
  if (next === 'GREEN_00') {
    simState.chipNodes.forEach((c) => {
      if (c.isAerial) c.collected = false;
    });
  }
}

export function triggerBattleRoyaleDrop() {
  const s = simState as any;
  s.customizerOpen = false;
  simState.mode = 'FOOT';
  simState.brActive = simState.gameMode === 'BATTLE_ROYALE';
  simState.parachuting = true;
  simState.gliding = false;
  simState.playerPos.set(12, 126, 76);
  simState.playerVel.set(0, -10, 0);
  simState.playerYaw = Math.PI;
  simState.playerHp = 100;
  simState.playerShield = 100;
  simState.stormRadius = 235;

  if (simState.brActive) {
    simState.eliminations = 0;
    simState.aliveCount = simState.botTargets.length + 1;
    simState.brRound++;
    simState.brResult = null;
    simState.botImpactCooldown = 0;
    simState.lootCrates.forEach((crate) => { crate.opened = false; });
    simState.botTargets.forEach((bot, idx) => {
      bot.alive = true;
      bot.hp = bot.maxHp;
      bot.shield = bot.maxShield;
      bot.parachuting = idx < 4;
      bot.parachuteY = 85 + idx * 14;
      bot.x = bot.homeX;
      bot.z = bot.homeZ;
      bot.y = bot.parachuting ? bot.parachuteY : getTerrainHeight(bot.x, bot.z);
      bot.hitFlash = bot.muzzleFlash = 0;
      bot.fall = undefined;
      bot.drop = undefined;
      bot.dropSpawned = false;
    });
  }

  soundEngine.playParachuteDeploy();
}

/**
 * Centers a loaded GLB on X/Z and offsets Y by -box.min.y so the lowest point
 * (bottom of tires / boots / landing gear) sits flush at y = 0.0.
 */
function autoGroundAndCenter(model: THREE.Object3D, scale = 1, rotY = 0, yOffset = 0) {
  model.scale.setScalar(scale);
  model.rotation.set(0, rotY, 0);
  model.position.set(0, 0, 0);
  model.updateMatrixWorld(true);

  const box = new THREE.Box3().setFromObject(model);
  if (!box.isEmpty()) {
    const center = box.getCenter(new THREE.Vector3());
    model.position.x = -center.x;
    model.position.z = -center.z;
    model.position.y = -box.min.y + yOffset;
    model.updateMatrixWorld(true);
  }
}

/**
 * Builds the procedural 18m Luxury Multi-Deck Cruise Liner ("OASIS OF AZUREA CRUISE LINER")
 * for boat fleet slot 1.
 */
function createOasisOfAzureaCruiseLiner(): THREE.Group {
  const ship = new THREE.Group();
  const limestoneTex = createLimestonePBR();
  const skyscraperPBR = createSkyscraperPBR();

  const navyHullMat = new THREE.MeshStandardMaterial({
    color: '#0f172a',
    map: skyscraperPBR.map,
    roughnessMap: skyscraperPBR.roughnessMap,
    roughness: 0.25,
    metalness: 0.55,
  });
  const whiteDeckMat = new THREE.MeshStandardMaterial({
    color: '#f8fafc',
    map: limestoneTex,
    roughness: 0.22,
    metalness: 0.25,
  });
  const goldTrimMat = new THREE.MeshStandardMaterial({
    color: '#f59e0b',
    emissive: '#d97706',
    emissiveIntensity: 0.45,
    roughness: 0.2,
    metalness: 0.85,
  });
  const glassBalconyMat = new THREE.MeshStandardMaterial({
    color: '#38bdf8',
    map: skyscraperPBR.map,
    roughnessMap: skyscraperPBR.roughnessMap,
    emissive: '#0284c7',
    emissiveIntensity: 1.35,
    roughness: 0.1,
    metalness: 0.8,
  });
  const poolWaterMat = new THREE.MeshStandardMaterial({
    color: '#06b6d4',
    emissive: '#0891b2',
    emissiveIntensity: 1.6,
    roughness: 0.08,
    metalness: 0.2,
  });
  const teakDeckMat = new THREE.MeshStandardMaterial({
    color: '#b45309',
    map: limestoneTex,
    roughness: 0.65,
    metalness: 0.1,
  });

  // Main Deep-V Lower Hull (14m core + 4m swept bow = 18m total length along Z)
  const hullCore = new THREE.Mesh(new THREE.BoxGeometry(3.8, 1.45, 13.5), navyHullMat);
  hullCore.position.set(0, 0.55, -1.2);
  hullCore.castShadow = true;
  hullCore.receiveShadow = true;
  ship.add(hullCore);

  // Swept Aerodynamic Bow Cone pointing toward +Z
  const bowCone = new THREE.Mesh(new THREE.ConeGeometry(2.68, 4.8, 4), navyHullMat);
  bowCone.rotation.x = Math.PI / 2;
  bowCone.rotation.y = Math.PI / 4;
  bowCone.scale.set(1.0, 1.0, 0.54);
  bowCone.position.set(0, 0.58, 7.9);
  bowCone.castShadow = true;
  ship.add(bowCone);

  // Gold Waterline & Hull Accent Stripes
  const stripeL = new THREE.Mesh(new THREE.BoxGeometry(3.88, 0.12, 13.6), goldTrimMat);
  stripeL.position.set(0, 1.12, -1.15);
  ship.add(stripeL);

  // Teak Promenade Main Deck
  const mainDeck = new THREE.Mesh(new THREE.BoxGeometry(3.75, 0.18, 14.6), teakDeckMat);
  mainDeck.position.set(0, 1.35, -0.6);
  ship.add(mainDeck);

  // 3 Tiered White Superstructure Passenger Decks with Illuminated Blue Balcony Windows
  const deckConfigs = [
    { w: 3.4, h: 0.82, len: 11.6, y: 1.85, z: -1.1 },
    { w: 3.1, h: 0.78, len: 9.8, y: 2.65, z: -1.4 },
    { w: 2.75, h: 0.74, len: 7.8, y: 3.41, z: -1.7 },
  ];

  deckConfigs.forEach((d) => {
    const deckBox = new THREE.Mesh(new THREE.BoxGeometry(d.w, d.h, d.len), whiteDeckMat);
    deckBox.position.set(0, d.y, d.z);
    deckBox.castShadow = true;
    deckBox.receiveShadow = true;
    ship.add(deckBox);

    // Illuminated Blue Glass Balcony Ribbon around each deck tier
    const glassBand = new THREE.Mesh(
      new THREE.BoxGeometry(d.w + 0.06, d.h * 0.48, d.len - 0.5),
      glassBalconyMat
    );
    glassBand.position.set(0, d.y + 0.04, d.z + 0.15);
    ship.add(glassBand);

    // Gold Handrail Trim
    const rail = new THREE.Mesh(
      new THREE.BoxGeometry(d.w + 0.1, 0.06, d.len + 0.1),
      goldTrimMat
    );
    rail.position.set(0, d.y + d.h * 0.5, d.z);
    ship.add(rail);
  });

  // Forward Panoramic Captain's Bridge Wing
  const bridgeWing = new THREE.Mesh(new THREE.BoxGeometry(3.55, 0.52, 1.45), whiteDeckMat);
  bridgeWing.position.set(0, 3.45, 2.45);
  ship.add(bridgeWing);
  const bridgeVisor = new THREE.Mesh(new THREE.BoxGeometry(3.6, 0.28, 1.5), glassBalconyMat);
  bridgeVisor.position.set(0, 3.48, 2.48);
  ship.add(bridgeVisor);

  // Rooftop Sun Deck & Glowing Turquoise Plunge Pool
  const poolRim = new THREE.Mesh(new THREE.BoxGeometry(1.75, 0.16, 2.85), whiteDeckMat);
  poolRim.position.set(0, 3.84, -0.35);
  ship.add(poolRim);

  const poolWater = new THREE.Mesh(new THREE.BoxGeometry(1.42, 0.19, 2.48), poolWaterMat);
  poolWater.position.set(0, 3.85, -0.35);
  ship.add(poolWater);

  // Sculpted Radar Arch
  const radarArch = new THREE.Mesh(new THREE.BoxGeometry(2.4, 0.75, 0.35), whiteDeckMat);
  radarArch.position.set(0, 4.15, 1.35);
  ship.add(radarArch);
  const radarDome = new THREE.Mesh(new THREE.SphereGeometry(0.28, 12, 12), whiteDeckMat);
  radarDome.position.set(0, 4.7, 1.35);
  ship.add(radarDome);

  // Twin Blue/Gold Cruise Liner Funnels (Stacks) tilted slightly aft
  [-2.2, -4.1].forEach((zPos) => {
    const funnelGroup = new THREE.Group();
    funnelGroup.position.set(0, 4.35, zPos);
    funnelGroup.rotation.x = -0.22;

    const funnelBody = new THREE.Mesh(
      new THREE.CylinderGeometry(0.36, 0.48, 1.35, 14),
      navyHullMat
    );
    funnelGroup.add(funnelBody);

    const funnelGoldRing = new THREE.Mesh(
      new THREE.CylinderGeometry(0.38, 0.41, 0.22, 14),
      goldTrimMat
    );
    funnelGoldRing.position.y = 0.32;
    funnelGroup.add(funnelGoldRing);

    const funnelWing = new THREE.Mesh(new THREE.BoxGeometry(1.35, 0.1, 0.65), goldTrimMat);
    funnelWing.position.y = 0.56;
    funnelGroup.add(funnelWing);

    ship.add(funnelGroup);
  });

  return ship;
}

function createSwimWaterTextures() {
  const makeCanvas = () => {
    const c = document.createElement('canvas');
    c.width = 128;
    c.height = 128;
    return c;
  };

  // 1. Delicate feathered concentric water ripple ring (soft alpha falloff, organic wispy breakup)
  const rippleCanvas = makeCanvas();
  const rCtx = rippleCanvas.getContext('2d');
  if (rCtx) {
    const img = rCtx.createImageData(128, 128);
    const data = img.data;
    for (let y = 0; y < 128; y++) {
      for (let x = 0; x < 128; x++) {
        const dx = (x - 63.5) / 63.5;
        const dy = (y - 63.5) / 63.5;
        const r = Math.hypot(dx, dy);
        const a = Math.atan2(dy, dx);
        const rMod = r + 0.022 * Math.sin(a * 5 + 0.4) + 0.014 * Math.cos(a * 9 - 0.6);
        const outerCrest = Math.exp(-Math.pow((rMod - 0.78) / 0.062, 2));
        const innerHarmonic = 0.34 * Math.exp(-Math.pow((rMod - 0.56) / 0.048, 2));
        const wisp = 0.68 + 0.32 * Math.sin(a * 6 + 0.9) * Math.cos(a * 3 - 0.5);
        const edgeFade = Math.max(0, 1 - THREE.MathUtils.smoothstep(r, 0.88, 1.0));
        const alpha = THREE.MathUtils.clamp((outerCrest + innerHarmonic) * wisp * edgeFade, 0, 1);
        const idx = (y * 128 + x) * 4;
        data[idx] = 228;
        data[idx + 1] = 248;
        data[idx + 2] = 255;
        data[idx + 3] = Math.round(alpha * 255);
      }
    }
    rCtx.putImageData(img, 0, 0);
  }
  const rippleMap = new THREE.CanvasTexture(rippleCanvas);
  rippleMap.needsUpdate = true;

  // 2. Soft frothy trailing foam wake wisp (feathered turbulent sea-foam patch, zero hard ring edge)
  const wakeCanvas = makeCanvas();
  const wCtx = wakeCanvas.getContext('2d');
  if (wCtx) {
    const img = wCtx.createImageData(128, 128);
    const data = img.data;
    for (let y = 0; y < 128; y++) {
      for (let x = 0; x < 128; x++) {
        const dx = (x - 63.5) / 63.5;
        const dy = (y - 63.5) / 63.5;
        const r = Math.hypot(dx, dy);
        const radial = Math.pow(Math.max(0, 1 - r * r), 1.9);
        const ringSoft = 0.45 + 0.55 * Math.exp(-Math.pow((r - 0.46) / 0.24, 2));
        const foam = 0.52 + 0.48 * Math.sin(dx * 13 + Math.sin(dy * 9)) * Math.cos(dy * 11 - dx * 6);
        const fine = 0.72 + 0.28 * Math.sin(dx * 25 - dy * 21);
        const alpha = THREE.MathUtils.clamp(radial * ringSoft * foam * fine, 0, 1);
        const idx = (y * 128 + x) * 4;
        data[idx] = 236;
        data[idx + 1] = 251;
        data[idx + 2] = 255;
        data[idx + 3] = Math.round(alpha * 255);
      }
    }
    wCtx.putImageData(img, 0, 0);
  }
  const wakeMap = new THREE.CanvasTexture(wakeCanvas);
  wakeMap.needsUpdate = true;

  return { rippleMap, wakeMap };
}

export function VehicleDirector({ onHudUpdate }: Props) {
  const { gl } = useThree();
  const shadowTex = useMemo(() => createShadowTexture(), []);
  const canopyDetailTex = useMemo(() => createLimestonePBR(), []);
  const swimWaterTex = useMemo(() => createSwimWaterTextures(), []);
  const coasterFpvCockpitRef = useRef<THREE.Group>(null);
  const prevActiveRideRef = useRef<AmusementRideId | null>(null);

  const playerRef = useRef<THREE.Group>(null);
  const soldierMountRef = useRef<THREE.Group>(null);
  const carRef = useRef<THREE.Group>(null);
  const carModelsMountRef = useRef<THREE.Group>(null);
  const boatRef = useRef<THREE.Group>(null);
  const boatModelMountRef = useRef<THREE.Group>(null);
  const planeRef = useRef<THREE.Group>(null);
  const planeModelMountRef = useRef<THREE.Group>(null);
  const propRef = useRef<THREE.Mesh>(null);
  const gliderRef = useRef<THREE.Group>(null);
  const parachuteRef = useRef<THREE.Group>(null);
  const weaponMountRef = useRef<THREE.Group>(null);
  const carWeaponMountRef = useRef<THREE.Group>(null);
  const weaponMeshesRef = useRef<(THREE.Object3D | null)[]>([null, null, null, null, null]);
  const carWeaponMeshesRef = useRef<(THREE.Object3D | null)[]>([null, null, null, null, null]);

  // Customizable 3D Accessories Refs (Aviator Gold Sunglasses, Cyber Visor, Tactical Backpack)
  const accessoriesRootRef = useRef<THREE.Group>(null);
  const aviatorGroupRef = useRef<THREE.Group>(null);
  const cyberVisorGroupRef = useRef<THREE.Group>(null);
  const backpackGroupRef = useRef<THREE.Group>(null);

  // Customizable Human Archetype Rigs & PBR Material Refs
  const rpmRigRef = useRef<HumanoidRig | null>(null);
  const michelleRigRef = useRef<HumanoidRig | null>(null);
  const soldierRigRef = useRef<HumanoidRig | null>(null);
  const coastalRigs = useRef(new Map<CoastalCharacter, HumanoidRig>());
  type AvatarFinish = { fabrics: THREE.MeshStandardMaterial[]; trousers: THREE.MeshStandardMaterial[];
    hair: THREE.MeshStandardMaterial[]; skin: THREE.MeshStandardMaterial[]; shoes: THREE.MeshStandardMaterial[];
    hat: THREE.Mesh[]; pack: THREE.Mesh[]; accents: THREE.MeshStandardMaterial[];
    kitUniforms: { value: THREE.Color }[] };
  const coastalMaterials = useRef(new Map<CoastalCharacter, AvatarFinish>());
  const loadingCoastalRef = useRef(new Set<CoastalCharacter>());
  const ensureCoastalCharacterRef = useRef<((arch: CoastalCharacter) => void) | null>(null);
  const soldierWrapperRef = useRef<THREE.Group | null>(null);
  const rpmMatRefs = useRef<RpmMaterialRefs>({
    skinMats: [],
    topMats: [],
    bottomMats: [],
    footwearMats: [],
    headwearMeshes: [],
    headwearMats: [],
    beardMeshes: [],
    beardMats: [],
  });
  const michelleBodyMatsRef = useRef<THREE.MeshStandardMaterial[]>([]);
  const lastAppliedCustVersionRef = useRef<number>(-1);
  const lastAppliedCustHashRef = useRef<string>('');

  // Ballistic Tracer, Muzzle Flash & Impact Blast refs
  const tracerMeshRef = useRef<THREE.Mesh>(null);
  const tracerMatRef = useRef<THREE.MeshStandardMaterial>(null);
  const muzzleFlashRef = useRef<THREE.Group>(null);
  const muzzleFlashMatRef = useRef<THREE.MeshStandardMaterial>(null);
  const impactMeshRef = useRef<THREE.Mesh>(null);
  const impactMatRef = useRef<THREE.MeshStandardMaterial>(null);
  const mouseDownRef = useRef(false);
  const cockpit = useRef<THREE.Group>(null);
  const viewModel = useRef<THREE.Group>(null);
  const viewWeapon = useRef<THREE.Group>(null);
  const viewPick = useRef<THREE.Group>(null);
  const sleeveLeftMatRef = useRef<THREE.MeshStandardMaterial>(null);
  const sleeveRightMatRef = useRef<THREE.MeshStandardMaterial>(null);
  const worldPick = useRef<THREE.Group>(null);
  const clonedWeapon = useRef<THREE.Object3D | null>(null);
  const cameraBlend = useRef(0);
  const adsBlend = useRef(0);
  const reticleRay = useRef(new THREE.Raycaster());
  const mouseOrbitRef = useRef<{ x: number; y: number } | null>(null);

  // Switchable 5-Car Hero Fleet, 6-Plane Fleet & 6-Boat Fleet state & rigs
  const activeCarIdxRef = useRef<number>(0);
  const carRigsRef = useRef<(HeroCarRig | null)[]>([null, null, null, null, null]);

  const activePlaneIdxRef = useRef<number>(0);
  const planeRigsRef = useRef<(PlaneFleetRig | null)[]>([null, null, null, null, null, null]);

  const activeBoatIdxRef = useRef<number>(0);
  const boatRigsRef = useRef<(BoatFleetRig | null)[]>([null, null, null, null, null, null]);

  // Brake light, exhaust boost flames & tire smoke pool
  const taillightMatRef = useRef<THREE.MeshStandardMaterial>(null);
  const boostFlameLeftRef = useRef<THREE.Group>(null);
  const boostFlameRightRef = useRef<THREE.Group>(null);
  const smokeMeshRefs = useRef<(THREE.Mesh | null)[]>([]);
  const smokeAngles = useRef<number[]>([0, 1, 2, 3, 4, 5]);

  // Vehicle damage VFX & impact cooldown refs
  const crashCooldownRef = useRef<number>(0);
  const sparkTimerRef = useRef<number>(0);
  const crashSparksGroupRef = useRef<THREE.Group>(null);
  const crashSparkMeshRefs = useRef<(THREE.Mesh | null)[]>([]);
  const damageSmokeRefs = useRef<(THREE.Mesh | null)[]>([]);
  const damageFireRefs = useRef<(THREE.Mesh | null)[]>([]);

  // Speedboat bow spray, Jet contrails & 3D Swimming Water FX (ripples, foam wake rings, sparkling droplets)
  const boatSprayRef = useRef<THREE.Group>(null);
  const contrailLeftRef = useRef<THREE.Mesh>(null);
  const contrailRightRef = useRef<THREE.Mesh>(null);
  const hydroSwimHeading = useRef(new THREE.Vector3());
  const playerShadowRef = useRef<THREE.Mesh>(null);
  const swimFxGroupRef = useRef<THREE.Group>(null);
  const swimRippleRefs = useRef<(THREE.Mesh | null)[]>([]);
  const swimWakeRefs = useRef<(THREE.Mesh | null)[]>([]);
  const swimDropletRefs = useRef<(THREE.Mesh | null)[]>([]);
  const swimWakes = useRef(
    Array.from({ length: 8 }, () => ({ x: 0, z: 0, yaw: 0, age: 10, maxAge: 1.35, baseScale: 0.42, active: false }))
  );
  const swimDroplets = useRef(
    Array.from({ length: 14 }, () => ({
      x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, age: 10, maxAge: 0.55, size: 0.055, active: false,
    }))
  );
  const swimFxState = useRef({ wakeTimer: 0, wakeCursor: 0, dropTimer: 0, dropCursor: 0, handSide: 1 });

  const previousPosition = useRef(new THREE.Vector3());
  const cameraOrbit = useRef({ yaw: 0, pitch: 0 });
  const footMotion = useRef({
    phase: 0, landing: 0, airborne: false, jumpHeld: false, speed: 0, directionX: 0, directionZ: 1,
    swim: false, swimEntry: 0, swimFreestyle: 0, splash: 0, stepTime: 0, coyote: 0, jumpBuffer: 0, airtime: 0,
  });
  const rearTracks = useRef([new THREE.Vector3(), new THREE.Vector3()]);
  const suspension = useRef({ lateral: 0, driftHeld: false, driftCharge: 0, tireEffectAt: 0,
    support: NaN, offset: 0, velocity: 0, yawRate: 0, pitch: 0, roll: 0,
    grounded: true, wet: false, splash: 0, slip: 0, boost: 0, x: NaN, z: NaN });
  const footStart = useRef(new THREE.Vector3());
  const camTarget = useRef(new THREE.Vector3());
  const hudAccum = useRef(0);
  const fpsFrames = useRef(0);
  const fpsAccum = useRef(0);
  const currentFps = useRef(60);

  // Apply Character Studio customization to the 3D Human Rigs & Accessories while preserving all original PBR maps
  const applyCharacterCustomization = () => {
    const s = simState as any;
    const cust: CharacterCustomization = {
      ...DEFAULT_CUSTOMIZATION,
      ...(s.customization || {}),
    };

    if (rpmRigRef.current) {
      rpmRigRef.current.wrapper.visible = cust.archetype === 'RPM_CUSTOM';
    }
    if (michelleRigRef.current) {
      michelleRigRef.current.wrapper.visible = cust.archetype === 'MICHELLE_VIP';
    }
    if (soldierWrapperRef.current) {
      soldierWrapperRef.current.visible = cust.archetype === 'VANGUARD_SOLDIER';
    }

    if (cust.archetype in COASTAL_CHARACTERS && !coastalRigs.current.has(cust.archetype as CoastalCharacter)) {
      ensureCoastalCharacterRef.current?.(cust.archetype as CoastalCharacter);
    }

    for (const [archetype, rig] of coastalRigs.current) {
      rig.wrapper.visible = cust.archetype === archetype;
      const finishes = coastalMaterials.current.get(archetype);
      if (rig.wrapper.visible && finishes) {
        for (const material of finishes.fabrics) {
          material.color.set(cust.topColor);
          material.roughness = cust.topRoughness;
          material.metalness = cust.topMetalness;
        }
        for (const material of finishes.trousers) material.color.set(cust.bottomColor);
        for (const material of finishes.skin) material.color.set(cust.skinColor);
        for (const material of finishes.shoes) material.color.set(cust.footwearColor);
        for (const material of finishes.hair) material.color.set(cust.hairColor ?? '#372a23');
        for (const material of finishes.accents) material.color.set(cust.headwearColor);
        for (const u of finishes.kitUniforms) u.value.set(cust.kitColorHex ?? '#ffffff');
        for (const mesh of finishes.hat) mesh.visible = cust.headwearOn;
        for (const mesh of finishes.pack) mesh.visible = cust.backpackOn;
      }
    }

    // Update Ready Player Me modular PBR materials (keeping original normalMap / roughnessMap / map intact!)
    const mats = rpmMatRefs.current;
    mats.skinMats.forEach((m) => {
      m.color.set(cust.skinColor);
    });
    mats.topMats.forEach((m) => {
      m.color.set(cust.topColor);
      m.roughness = cust.topRoughness;
      m.metalness = cust.topMetalness;
    });
    mats.bottomMats.forEach((m) => {
      m.color.set(cust.bottomColor);
    });
    mats.footwearMats.forEach((m) => {
      m.color.set(cust.footwearColor);
    });
    mats.headwearMeshes.forEach((mesh) => {
      mesh.visible = Boolean(cust.headwearOn);
    });
    mats.headwearMats.forEach((m) => {
      m.color.set(cust.headwearColor);
    });
    mats.beardMeshes.forEach((mesh) => {
      mesh.visible = Boolean(cust.beardOn);
    });
    mats.beardMats.forEach((m) => {
      m.color.set(cust.beardColor);
    });

    // Update 3D Eyewear & Tactical Backpack accessories
    if (aviatorGroupRef.current) {
      aviatorGroupRef.current.visible = !coastalRigs.current.has(cust.archetype as CoastalCharacter) && cust.eyewear === 'AVIATOR_GOLD';
    }
    if (cyberVisorGroupRef.current) {
      cyberVisorGroupRef.current.visible = !coastalRigs.current.has(cust.archetype as CoastalCharacter) && cust.eyewear === 'CYBER_VISOR';
    }
    if (backpackGroupRef.current) {
      backpackGroupRef.current.visible = !coastalRigs.current.has(cust.archetype as CoastalCharacter) && Boolean(cust.backpackOn);
    }
    if (sleeveLeftMatRef.current) {
      sleeveLeftMatRef.current.color.set(cust.topColor);
    }
    if (sleeveRightMatRef.current) {
      sleeveRightMatRef.current.color.set(cust.topColor);
    }
  };

  const selectWeaponSlot = (idx: number) => {
    const safeIdx = ((idx % WEAPON_SPECS.length) + WEAPON_SPECS.length) % WEAPON_SPECS.length;
    simState.activeWeaponIdx = safeIdx;
    const spec = WEAPON_SPECS[safeIdx];
    simState.ammo = spec.clipSize;
    simState.maxAmmo = spec.clipSize;
    weaponMeshesRef.current.forEach((m, i) => {
      if (m) m.visible = i === safeIdx;
    });
    carWeaponMeshesRef.current.forEach((m, i) => {
      if (m) m.visible = i === safeIdx;
    });
  };

  const aimAt = (limit: number) => {
    const from = aiming.origin;
    const direction = aiming.direction;
    const structure = traceWorld(from, direction, limit);
    const ground = traceGround(from, direction, limit);
    return ground && (!structure || ground.distance < structure.distance) ? ground : structure;
  };

  const buildPoint = () => {
    const foot = simState.playerPos;
    const target = aimAt(18)?.point ?? aiming.origin.clone().addScaledVector(aiming.direction, 10);
    const distance = Math.hypot(target.x - foot.x, target.z - foot.z);
    if (distance > 12) {
      target.x = foot.x + (target.x - foot.x) * 11.9 / distance;
      target.z = foot.z + (target.z - foot.z) * 11.9 / distance;
      target.y = getTravelHeight(target.x, target.z, foot.y + 1.2);
    }
    return target;
  };

  const fireActiveWeapon = () => {
    const foot = simState.mode === 'FOOT';
    if (!aiming.ready || simState.activeRide || simState.shotCooldown > 0 || simState.startMenuOpen || simState.customizerOpen || simState.controlsOpen ||
        foot && (footMotion.current.swim || simState.parachuting || simState.gliding) ||
        simState.gameMode === 'BATTLE_ROYALE' && simState.brResult !== null) return;
    if (foot && construction.active && !simState.parachuting && !simState.gliding) {
      if (placeBuild(buildPoint(), simState.playerPos)) {
        const point = construction.preview?.origin ?? simState.playerPos;
        emitEnvironment('dust', point, 0.5);
        soundEngine.playConstruction(construction.material);
      }
      simState.shotCooldown = 0.26;
      return;
    }
    if (foot && construction.pickaxe) {
      simState.shotCooldown = 0.53;
      aiming.pickSwing = 0.5;
      soundEngine.playSwing();
      return;
    }
    const spec = WEAPON_SPECS[simState.activeWeaponIdx] ?? WEAPON_SPECS[0];
    simState.shotCooldown = spec.fireRate;
    simState.firingTimer = 0.13;
    simState.ammo = simState.ammo > 1 ? simState.ammo - 1 : spec.clipSize;
    soundEngine.playGunshot(spec.id);
    const muzzle = new THREE.Vector3();
    const gunObj =
      !foot && simState.mode === 'CAR'
        ? carWeaponMountRef.current
        : simState.cameraView === 1
        ? viewWeapon.current
        : weaponMountRef.current;
    if (gunObj && gunObj.visible) {
      gunObj.updateWorldMatrix(true, false);
      gunObj.getWorldPosition(muzzle);
      const barrelFwd = new THREE.Vector3(0, 0, simState.cameraView === 1 ? -0.35 : 0.35).applyQuaternion(
        gunObj.getWorldQuaternion(new THREE.Quaternion())
      );
      muzzle.add(barrelFwd);
    } else {
      muzzle.copy(foot ? simState.playerPos : simState.mode === 'CAR' ? simState.carPos :
        simState.mode === 'BOAT' ? simState.boatPos : simState.planePos).addScaledVector(UP, foot ? 1.32 : 1.4);
    }
    const recoilKick = spec.id === 'SNIPER' ? 0.032 : spec.id === 'SHOTGUN' ? 0.026 : spec.id === 'RPG' ? 0.038 : 0.011;
    simState.orbitPitch = THREE.MathUtils.clamp(simState.orbitPitch - recoilKick, -1.1, 1.02);
    const origin = aiming.origin;
    const direction = aiming.direction.clone();
    let bestBot: (typeof simState.botTargets)[number] | undefined;
    let civilian: (typeof civilianTargets)[number] | undefined;
    const assist = simState.controlSettings.aimAssist;
    if (simState.brActive && assist !== 'Off') {
      let score = assist === 'Light Assist' ? 0.997 : 0.977;
      for (const bot of simState.botTargets) {
        if (!bot.alive || bot.fall) continue;
        const toward = new THREE.Vector3(bot.x, bot.y + 1.22, bot.z).sub(origin);
        const range = toward.length();
        if (range > spec.range || range < 0.2) continue;
        const dot = toward.divideScalar(range).dot(aiming.direction);
        if (dot > score && !traceWorld(origin, toward, range)) {
          score = dot;
          direction.copy(toward);
        }
      }
    }

    const structure = traceWorld(origin, direction, spec.range);
    const ground = traceGround(origin, direction, spec.range);
    let hit: WorldHit | undefined = ground && (!structure || ground.distance < structure.distance) ? ground : structure;
    let range = hit?.distance ?? spec.range;
    if (simState.brActive) for (const bot of simState.botTargets) {
      if (!bot.alive || bot.fall) continue;
      const distance = targetDistance(origin, direction, bot.x, bot.y, bot.z);
      if (distance < range) {
        range = distance;
        bestBot = bot;
        hit = undefined;
      }
    }
    for (const actor of civilianTargets) {
      const distance = targetDistance(origin, direction, actor.x, actor.y, actor.z);
      if (distance < range) {
        range = distance;
        civilian = actor;
        bestBot = undefined;
        hit = undefined;
      }
    }
    let to = origin.clone().addScaledVector(direction, range);
    const muzzleDirection = to.clone().sub(muzzle);
    const length = muzzleDirection.length();
    if (length > 0.3) {
      const obstruction = traceWorld(muzzle, muzzleDirection.divideScalar(length), Math.max(0, length - 0.14));
      if (obstruction?.section && obstruction.section !== hit?.section && obstruction.distance < length - 0.15) {
        hit = obstruction;
        bestBot = undefined;
        civilian = undefined;
        to = obstruction.point;
      }
    }
    if (simState.gameMode === 'FREE_ROAM' || simState.gameMode === 'WORLD_TOUR') {
      const shot = to.clone().sub(muzzle);
      const distance = shot.length();
      if (distance > 0.001) {
        const duck = strikeDuck(muzzle, shot.divideScalar(distance), distance);
        if (duck !== undefined) {
          to = muzzle.clone().addScaledVector(shot, duck);
          hit = bestBot = civilian = undefined;
        }
      }
    }
    let splashHit = false;
    if (hit) {
      damageWorld(hit, spec.damage);
      emitEnvironment('impact', to, 0.55);
      if (spec.id === 'RPG') {
        blastWorld(to, 6.2, spec.damage * 0.8, hit.section);
      }
    } else if (bestBot) {
      const eliminated = injureBot(bestBot, spec.damage, direction.x * 3.9, direction.z * 3.9);
      aiming.feedback = 0.24;
      soundEngine.playHitMarker(eliminated);
      if (spec.id === 'RPG') blastWorld(to, 6.2, spec.damage * 0.75);
    } else if (civilian) {
      civilian.impact(spec.damage, direction, to);
      aiming.feedback = 0.19;
      soundEngine.playHitMarker(false);
    }
    if (spec.id === 'RPG' && simState.brActive) {
      for (const bot of simState.botTargets) {
        if (!bot.alive || bot === bestBot) continue;
        const bx = bot.x - to.x;
        const by = bot.y + 0.9 - to.y;
        const bz = bot.z - to.z;
        const dist = Math.hypot(bx, by, bz);
        if (dist < 5.5) {
          const falloff = 1 - dist / 5.5;
          const splashDmg = Math.round(spec.damage * 0.75 * falloff);
          const push = 4.2 * falloff / Math.max(0.5, Math.hypot(bx, bz));
          const eliminated = injureBot(bot, splashDmg, bx * push, bz * push, falloff * 0.45);
          aiming.feedback = 0.24;
          splashHit = true;
          soundEngine.playHitMarker(eliminated);
        }
      }
    }
    aiming.impact = Boolean(bestBot || civilian || hit || splashHit);
    simState.lastShotFrom = muzzle.toArray();
    simState.lastShotTo = to.toArray();
  };

  const connectPickaxe = () => {
    if (!construction.pickaxe || construction.active || simState.mode !== 'FOOT' ||
        simState.startMenuOpen || simState.controlsOpen || footMotion.current.swim) return;
    const hit = aimAt(10);
    if (!hit?.section || hit.point.distanceTo(simState.playerPos.clone().addScaledVector(UP, 1.2)) > 3.7) return;
    const section = hit.section;
    if (section.permanent || section.hp <= 0) return;
    const resource = harvestResource(section.material);
    const result = damageWorld(hit, 32);
    if (!section.owner.startsWith('Build ')) construction.resources[resource] += result?.destroyed ? 12 : 5;
    aiming.feedback = 0.15;
    aiming.harvestPause = 0.065;
    simState.cameraShake = Math.max(simState.cameraShake, 0.12);
    soundEngine.playConstruction(resource);
  };

  const repairVehicle = () => {
    crashCooldownRef.current = 0;
    sparkTimerRef.current = 0;
    if (simState.mode === 'PLANE') {
      simState.aircraftDamage = freshAircraftDamage();
      simState.planePitch = 0;
      simState.planeRoll = 0;
      simState.planeVel.set(0, 0, 0);
      simState.planeSpeed = Math.max(0, simState.planeSpeed);
    }
    if (simState.mode === 'CAR') Object.assign(simState.carDamage, { hp: 100, wrecked: false });
    if (simState.mode === 'BOAT') Object.assign(simState.boatDamage, { hp: 100, wrecked: false });
    simState.vehicleHp = 100;
    simState.vehicleWrecked = false;
    simState.playerHp = 100;
    simState.playerShield = 100;
    simState.cameraShake = 0;
    simState.crashFlashTimer = 0;
    const position = simState.mode === 'PLANE' ? simState.planePos :
      simState.mode === 'BOAT' ? simState.boatPos : simState.carPos;
    emitEnvironment('repair', position.clone().addScaledVector(UP, 0.65), 0.8);
    soundEngine.playRepair();
  };

  const registerVehicleImpact = (impactSpeedMps: number, hitPos: THREE.Vector3, hit?: WorldHit) => {
    if (crashCooldownRef.current > 0 || impactSpeedMps <= 4.5) return;

    crashCooldownRef.current = 0.24;
    const severity = Math.min(1, (impactSpeedMps - 4.5) / 38);
    const aircraft = simState.aircraftDamage;
    const airborne = simState.mode === 'PLANE';
    const dmg = Math.round(5 + severity * (airborne ? 46 : 33));
    if (hit) damageWorld(hit, 14 + impactSpeedMps * (airborne ? 2.35 : 1.85));
    else emitEnvironment('impact', hitPos, severity);
    if (airborne) {
      const side = (hitPos.x - simState.planePos.x) * Math.cos(simState.planeYaw) -
        (hitPos.z - simState.planePos.z) * Math.sin(simState.planeYaw);
      aircraft.hull = Math.max(0, aircraft.hull - dmg);
      aircraft.left = Math.max(0, aircraft.left - dmg * (side < -0.4 ? 1.38 : 0.57));
      aircraft.right = Math.max(0, aircraft.right - dmg * (side > 0.4 ? 1.38 : 0.57));
      const stage: AircraftDamageStage = aircraft.hull <= 0 ? 'wrecked' : aircraft.hull < 29 ? 'burning' :
        aircraft.hull < 52 ? 'failing' : aircraft.hull < 76 ? 'smoking' : 'sound';
      if (stage === 'wrecked' && aircraft.state !== 'wrecked') {
        aircraft.settled = false;
        simState.planeVel.y = Math.min(-5, simState.planeVel.y);
      }
      aircraft.state = stage;
      simState.vehicleHp = aircraft.hull;
      simState.vehicleWrecked = stage === 'wrecked';
    } else {
      const damage = simState.mode === 'BOAT' ? simState.boatDamage : simState.carDamage;
      damage.hp = Math.max(0, damage.hp - dmg);
      damage.wrecked = damage.hp <= 0;
      simState.vehicleHp = damage.hp;
      simState.vehicleWrecked = damage.wrecked;
    }
    simState.cameraShake = Math.min(1.2, simState.cameraShake + 0.22 + severity * 0.75);
    simState.crashFlashTimer = 0.22 + severity * 0.2;
    simState.lastCrashPos = [hitPos.x, hitPos.y + 0.8, hitPos.z];
    sparkTimerRef.current = 0.35;
    soundEngine.playCrash(severity);

    if (severity > 0.45) {
      let jolt = Math.round(severity * 12);
      if (simState.playerShield > 0) {
        const absorb = Math.min(simState.playerShield, jolt);
        simState.playerShield = Math.max(0, simState.playerShield - absorb);
        jolt -= absorb;
      }
      if (jolt > 0) {
        simState.playerHp = Math.max(10, simState.playerHp - jolt);
      }
    }


  };

  const syncCarFleet = (nextIdx: number) => {
    const safeIdx = ((nextIdx % CAR_NAMES.length) + CAR_NAMES.length) % CAR_NAMES.length;
    activeCarIdxRef.current = safeIdx;
    simState.activeCarIdx = safeIdx;
    simState.activeCarName = CAR_NAMES[safeIdx];
    Object.assign(simState.carDamage, { hp: 100, wrecked: false });
    if (simState.mode === 'CAR') {
      simState.vehicleHp = 100;
      simState.vehicleWrecked = false;
    }
    carRigsRef.current.forEach((rig, idx) => {
      if (rig) rig.wrapper.visible = idx === safeIdx;
    });
  };

  const syncPlaneFleet = (nextIdx: number) => {
    const safeIdx = ((nextIdx % PLANE_NAMES.length) + PLANE_NAMES.length) % PLANE_NAMES.length;
    activePlaneIdxRef.current = safeIdx;
    simState.activePlaneIdx = safeIdx;
    simState.activePlaneName = PLANE_NAMES[safeIdx];
    simState.aircraftDamage = freshAircraftDamage();
    simState.planeVel.set(0, 0, 0);
    simState.planeRoll = 0;
    if (simState.mode === 'PLANE') {
      simState.vehicleHp = 100;
      simState.vehicleWrecked = false;
    }
    planeRigsRef.current.forEach((rig, idx) => {
      if (rig) rig.wrapper.visible = idx === safeIdx;
    });
  };

  const syncBoatFleet = (nextIdx: number) => {
    const safeIdx = ((nextIdx % BOAT_NAMES.length) + BOAT_NAMES.length) % BOAT_NAMES.length;
    activeBoatIdxRef.current = safeIdx;
    simState.activeBoatIdx = safeIdx;
    simState.activeBoatName = BOAT_NAMES[safeIdx];
    Object.assign(simState.boatDamage, { hp: 100, wrecked: false });
    if (simState.mode === 'BOAT') {
      simState.vehicleHp = 100;
      simState.vehicleWrecked = false;
    }
    boatRigsRef.current.forEach((rig, idx) => {
      if (rig) rig.wrapper.visible = idx === safeIdx;
    });
  };

  // Cycle between 5 Hero Cars, 6 Aircraft, 6 Boats/Ships, Character Customizer Studio, Parachute Sky-Drop & Weapons
  useEffect(() => {
    const s = simState as any;
    if (!s.activeCarName) s.activeCarName = CAR_NAMES[0];
    if (!s.activePlaneName) s.activePlaneName = PLANE_NAMES[0];
    if (!s.activeBoatName) s.activeBoatName = BOAT_NAMES[0];

    const cycleHeroCar = () => syncCarFleet(activeCarIdxRef.current + 1);
    const cycleAircraft = () => syncPlaneFleet(activePlaneIdxRef.current + 1);
    const cycleBoat = () => syncBoatFleet(activeBoatIdxRef.current + 1);

    const cycleActiveFleetModel = () => {
      if (simState.mode === 'PLANE') {
        cycleAircraft();
      } else if (simState.mode === 'BOAT') {
        cycleBoat();
      } else {
        cycleHeroCar();
      }
    };

    const toggleCharacterCustomizer = () => {
      s.customizerOpen = !s.customizerOpen;
      if (s.customizerOpen) {
        simState.mode = 'FOOT';
        simState.parachuting = false;
        simState.gliding = false;
      }
    };

    const onKeyDown = (e: KeyboardEvent) => {
      if (s.startMenuOpen || s.controlsOpen || (s.customizerOpen && e.code !== 'KeyC')) return;
      if (e.code === 'KeyV' && !e.repeat) {
        cycleHeroCar();
        window.dispatchEvent(new CustomEvent('hud-sync'));
      } else if (e.code === 'KeyB' && !e.repeat) {
        cycleActiveFleetModel();
        window.dispatchEvent(new CustomEvent('hud-sync'));
      } else if (e.code === 'KeyC' && !e.repeat) {
        toggleCharacterCustomizer();
      } else if (e.code === 'KeyP' && !e.repeat) {
        triggerBattleRoyaleDrop();
      } else if (e.code === 'KeyQ' && !e.repeat && simState.mode !== 'PLANE') {
        construction.active = false;
        construction.pickaxe = false;
        selectWeaponSlot(simState.activeWeaponIdx + 1);
        window.dispatchEvent(new CustomEvent('hud-sync'));
      } else if (e.code === 'KeyH' && !e.repeat) {
        repairVehicle();
      } else if (e.code === 'KeyT' && !e.repeat && simState.mode === 'FOOT') {
        construction.pickaxe = !construction.pickaxe;
        construction.active = false;
        window.dispatchEvent(new CustomEvent('hud-sync'));
      } else if (e.code === 'KeyG' && !e.repeat && simState.mode === 'FOOT') {
        construction.active = !construction.active;
        if (construction.active) construction.pickaxe = false;
        window.dispatchEvent(new CustomEvent('hud-sync'));
      } else if (construction.active && simState.mode === 'FOOT' && !e.repeat) {
        const piece = ['Digit5', 'Digit6', 'Digit7', 'Digit8'].indexOf(e.code);
        if (piece >= 0) {
          construction.type = BUILD_TYPES[piece];
          window.dispatchEvent(new CustomEvent('hud-sync'));
        } else if (e.code === 'KeyR') {
          construction.turn = (construction.turn + 1) % 4;
          window.dispatchEvent(new CustomEvent('hud-sync'));
        } else if (e.code === 'KeyY') {
          construction.material = BUILD_MATERIALS[(BUILD_MATERIALS.indexOf(construction.material) + 1) % 3];
          window.dispatchEvent(new CustomEvent('hud-sync'));
        } else if (e.code === 'KeyF') fireActiveWeapon();
      } else if (e.code === 'KeyF') {
        fireActiveWeapon();
      }
    };

    const onLobbyVehicleChange = (e: Event) => {
      const detail = (e as CustomEvent<{
        kind?: 'CAR' | 'BOAT' | 'PLANE';
        idx?: number;
        carIdx?: number;
        planeIdx?: number;
        boatIdx?: number;
      } | undefined>).detail;
      const carIdx =
        detail?.kind === 'CAR' && typeof detail.idx === 'number'
          ? detail.idx
          : typeof detail?.carIdx === 'number'
          ? detail.carIdx
          : s.activeCarIdx;
      const planeIdx =
        detail?.kind === 'PLANE' && typeof detail.idx === 'number'
          ? detail.idx
          : typeof detail?.planeIdx === 'number'
          ? detail.planeIdx
          : s.activePlaneIdx;
      const boatIdx =
        detail?.kind === 'BOAT' && typeof detail.idx === 'number'
          ? detail.idx
          : typeof detail?.boatIdx === 'number'
          ? detail.boatIdx
          : s.activeBoatIdx;
      if (typeof carIdx === 'number') syncCarFleet(carIdx);
      if (typeof planeIdx === 'number') syncPlaneFleet(planeIdx);
      if (typeof boatIdx === 'number') syncBoatFleet(boatIdx);
    };

    const onCycleCarEvent = () => cycleHeroCar();
    const onCyclePlaneEvent = () => cycleAircraft();
    const onCycleBoatEvent = () => cycleBoat();
    const onCycleVehicleModelEvent = () => cycleActiveFleetModel();
    const onToggleCustomizerEvent = () => toggleCharacterCustomizer();
    const onCustomizerUpdatedEvent = () => applyCharacterCustomization();
    const onBrDropEvent = () => triggerBattleRoyaleDrop();
    const onRepairVehicleEvent = () => repairVehicle();
    const onSelectWeaponEvent = (e: Event) => {
      const custom = e as CustomEvent<number>;
      if (typeof custom.detail === 'number') {
        selectWeaponSlot(custom.detail);
      } else {
        selectWeaponSlot(simState.activeWeaponIdx + 1);
      }
    };
    const onFireWeaponEvent = () => fireActiveWeapon();
    const canvasEl = gl.domElement;
    const onCanvasLockClick = (e: MouseEvent) => {
      if (s.startMenuOpen || s.customizerOpen || s.controlsOpen || simState.touchControlsEnabled) return;
      if (e.button !== 0 && e.button !== 2) return;
      const wantsLock = simState.cameraView === 1 || simState.mode === 'FOOT' || Boolean(simState.activeRide);
      if (wantsLock && document.pointerLockElement !== canvasEl) {
        requestGamePointerLock();
      }
    };
    const onPointerDown = (e: PointerEvent) => {
      if (s.startMenuOpen || s.customizerOpen || s.controlsOpen || e.pointerType !== 'mouse' ||
          (e.target as HTMLElement | null)?.tagName !== 'CANVAS') return;
      const canvas = e.target as HTMLCanvasElement;
      const wantsLock = simState.cameraView === 1 || simState.mode === 'FOOT' || Boolean(simState.activeRide);
      const wasLocked = document.pointerLockElement === canvas;
      if (wantsLock && !wasLocked) requestGamePointerLock();
      if (e.button === 0) {
        if (simState.activeRide) return;
        if (wantsLock && !wasLocked) return;
        mouseDownRef.current = true;
        fireActiveWeapon();
      } else if (e.button === 2) {
        aiming.ads = true;
        mouseOrbitRef.current = { x: e.clientX, y: e.clientY };
      }
    };
    const applyLookDelta = (dx: number, dy: number, locked: boolean) => {
      const sensitivity = 0.0042 * simState.controlSettings.mouseSensitivity * (aiming.ads ? 0.49 : 1);
      if (simState.activeRide) {
        simState.orbitYaw = simState.activeRide === 'COASTER'
          ? THREE.MathUtils.clamp(simState.orbitYaw - dx * sensitivity, -1.05, 1.05)
          : simState.orbitYaw - dx * sensitivity;
        simState.orbitPitch = THREE.MathUtils.clamp(simState.orbitPitch + dy * sensitivity, -0.55, 0.65);
        return;
      }
      if (simState.mode === 'FOOT' && (simState.cameraView === 1 || locked || aiming.ads)) {
        simState.playerYaw -= dx * sensitivity;
        simState.orbitYaw = 0;
      } else {
        simState.orbitYaw -= dx * sensitivity;
      }
      simState.orbitPitch = THREE.MathUtils.clamp(simState.orbitPitch + dy * sensitivity, -1.12, 1.02);
    };
    const onLockedMouseMove = (e: MouseEvent) => {
      if (s.startMenuOpen || s.customizerOpen || s.controlsOpen) return;
      if (document.pointerLockElement !== canvasEl) return;
      applyLookDelta(e.movementX, e.movementY, true);
    };
    const onPointerMove = (e: PointerEvent) => {
      const drag = mouseOrbitRef.current;
      if (document.pointerLockElement === canvasEl) return;
      if (s.startMenuOpen || s.customizerOpen || s.controlsOpen || e.pointerType !== 'mouse') return;
      if (!drag && (simState.cameraView !== 1 || (e.target as HTMLElement | null)?.tagName !== 'CANVAS')) return;
      const dx = drag ? e.clientX - drag.x : e.movementX;
      const dy = drag ? e.clientY - drag.y : e.movementY;
      applyLookDelta(dx, dy, false);
      if (drag) { drag.x = e.clientX; drag.y = e.clientY; }
    };
    const onPointerUp = (e?: PointerEvent) => {
      if (!e || e.button === 0 || e.type === 'pointercancel') mouseDownRef.current = false;
      if (!e || e.button === 2 || e.type === 'pointercancel') {
        aiming.ads = false;
        mouseOrbitRef.current = null;
      }
    };
    const onBlur = () => onPointerUp();
    const onContextMenu = (e: MouseEvent) => {
      if ((e.target as HTMLElement | null)?.tagName === 'CANVAS') e.preventDefault();
    };

    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('lobby-vehicle-change', onLobbyVehicleChange);
    window.addEventListener('cycle-car', onCycleCarEvent);
    window.addEventListener('cycle-plane', onCyclePlaneEvent);
    window.addEventListener('cycle-boat', onCycleBoatEvent);
    window.addEventListener('cycle-vehicle-model', onCycleVehicleModelEvent);
    window.addEventListener('toggle-customizer', onToggleCustomizerEvent);
    window.addEventListener('customizer-updated', onCustomizerUpdatedEvent);
    window.addEventListener('br-drop', onBrDropEvent);
    window.addEventListener('repair-vehicle', onRepairVehicleEvent);
    window.addEventListener('select-weapon', onSelectWeaponEvent);
    window.addEventListener('fire-weapon', onFireWeaponEvent);
    canvasEl.addEventListener('mousedown', onCanvasLockClick);
    canvasEl.addEventListener('click', onCanvasLockClick);
    window.addEventListener('mousemove', onLockedMouseMove);
    window.addEventListener('pointerdown', onPointerDown);
    window.addEventListener('pointermove', onPointerMove);
    window.addEventListener('contextmenu', onContextMenu);
    window.addEventListener('pointerup', onPointerUp);
    window.addEventListener('pointercancel', onPointerUp);
    window.addEventListener('blur', onBlur);
    return () => {
      canvasEl.removeEventListener('mousedown', onCanvasLockClick);
      canvasEl.removeEventListener('click', onCanvasLockClick);
      window.removeEventListener('mousemove', onLockedMouseMove);
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('lobby-vehicle-change', onLobbyVehicleChange);
      window.removeEventListener('cycle-car', onCycleCarEvent);
      window.removeEventListener('cycle-plane', onCyclePlaneEvent);
      window.removeEventListener('cycle-boat', onCycleBoatEvent);
      window.removeEventListener('cycle-vehicle-model', onCycleVehicleModelEvent);
      window.removeEventListener('toggle-customizer', onToggleCustomizerEvent);
      window.removeEventListener('customizer-updated', onCustomizerUpdatedEvent);
      window.removeEventListener('br-drop', onBrDropEvent);
      window.removeEventListener('repair-vehicle', onRepairVehicleEvent);
      window.removeEventListener('select-weapon', onSelectWeaponEvent);
      window.removeEventListener('fire-weapon', onFireWeaponEvent);
      window.removeEventListener('pointerdown', onPointerDown);
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('contextmenu', onContextMenu);
      window.removeEventListener('pointerup', onPointerUp);
      window.removeEventListener('pointercancel', onPointerUp);
      window.removeEventListener('blur', onBlur);
    };
  }, []);

  // Load all real 3D GLB models (5 Hero Cars, 6 Aircraft, 6 Boats/Ships, 3 Customizable Humans, 5 Weapons)
  useEffect(() => {
    let disposed = false;

    const dracoLoader = new DRACOLoader();
    dracoLoader.setDecoderPath('/draco/');
    const gltfLoader = new GLTFLoader();
    gltfLoader.setDRACOLoader(dracoLoader);

    // 1. Official Three.js Ferrari 458 Italia (/models/ferrari.glb)
    gltfLoader.load('/models/ferrari.glb', (gltf) => {
      if (disposed || !carModelsMountRef.current) return;
      const model = gltf.scene;

      const bodyMat = new THREE.MeshStandardMaterial({
        color: 0xd90429,
        metalness: 0.82,
        roughness: 0.14,
        envMapIntensity: 1.6,
      });
      const detailsMat = new THREE.MeshStandardMaterial({
        color: 0xffffff,
        metalness: 0.95,
        roughness: 0.15,
      });
      const glassMat = new THREE.MeshStandardMaterial({
        color: 0x0f172a,
        metalness: 0.92,
        roughness: 0.05,
        transparent: true,
        opacity: 0.72,
      });
      const brakeMat = new THREE.MeshStandardMaterial({
        color: 0xef4444,
        emissive: 0xef4444,
        emissiveIntensity: 1.8,
        roughness: 0.2,
      });

      model.traverse((child) => {
        if ((child as THREE.Mesh).isMesh) {
          const mesh = child as THREE.Mesh;
          mesh.castShadow = true;
          mesh.receiveShadow = true;
          const n = mesh.name.toLowerCase();
          if (n === 'body') {
            mesh.material = bodyMat;
          } else if (
            n === 'details' ||
            n === 'metal' ||
            n === 'chrome' ||
            n.startsWith('rim_')
          ) {
            mesh.material = detailsMat;
          } else if (n === 'glass') {
            mesh.material = glassMat;
          } else if (n === 'lights_red') {
            mesh.material = brakeMat;
          }
        }
      });

      // Rotate Math.PI around Y so nose points toward +Z, scale 1.12, and ground with Box3
      autoGroundAndCenter(model, 1.12, Math.PI);

      const wrapper = new THREE.Group();
      wrapper.add(model);
      wrapper.visible = activeCarIdxRef.current === 0;
      carModelsMountRef.current.add(wrapper);

      const wFl = model.getObjectByName('wheel_fl');
      const wFr = model.getObjectByName('wheel_fr');
      const wRl = model.getObjectByName('wheel_rl');
      const wRr = model.getObjectByName('wheel_rr');
      const wheels = [wFl, wFr, wRl, wRr].filter((w): w is THREE.Object3D => Boolean(w));
      wheels.forEach((w) => {
        w.rotation.order = 'YXZ';
      });
      const steerNodes = [wFl, wFr].filter((w): w is THREE.Object3D => Boolean(w));
      const steeringWheel = model.getObjectByName('steering_wheel') ?? null;

      carRigsRef.current[0] = {
        wrapper,
        wheels,
        steerNodes,
        steeringWheel,
        spinSign: -1,
        brakeMat,
      };
    });

    // 2. 4 Additional Real 3D GLB Hero Cars (GT3, 80s Wedge, 60s Muscle, Stretch Limo)
    const polyforkHeroConfigs: { url: string; index: number; scale: number }[] = [
      { url: '/models/gt3_car.glb', index: 1, scale: 1.08 },
      { url: '/models/wedge_coupe.glb', index: 2, scale: 1.12 },
      { url: '/models/muscle_car.glb', index: 3, scale: 1.1 },
      { url: '/models/stretch_limo.glb', index: 4, scale: 0.96 },
    ];

    const sharedFleetMat = new THREE.MeshStandardMaterial({
      vertexColors: true,
      roughness: 0.18,
      metalness: 0.38,
      envMapIntensity: 1.5,
    });

    polyforkHeroConfigs.forEach(({ url, index, scale }) => {
      gltfLoader.load(url, (gltf) => {
        if (disposed || !carModelsMountRef.current) return;
        const model = gltf.scene;

        model.traverse((child) => {
          if ((child as THREE.Mesh).isMesh) {
            const mesh = child as THREE.Mesh;
            mesh.castShadow = true;
            mesh.receiveShadow = true;
            mesh.material = sharedFleetMat;
          }
        });

        autoGroundAndCenter(model, scale, 0);

        const wrapper = new THREE.Group();
        wrapper.add(model);
        wrapper.visible = activeCarIdxRef.current === index;
        carModelsMountRef.current.add(wrapper);

        const steerFl = model.getObjectByName('steer-fl');
        const steerFr = model.getObjectByName('steer-fr');
        const wheelFl = model.getObjectByName('wheel-fl');
        const wheelFr = model.getObjectByName('wheel-fr');
        const wheelRl = model.getObjectByName('wheel-rl');
        const wheelRr = model.getObjectByName('wheel-rr');

        const wheels = [wheelFl, wheelFr, wheelRl, wheelRr].filter(
          (w): w is THREE.Object3D => Boolean(w)
        );
        wheels.forEach((w) => {
          w.rotation.order = 'YXZ';
        });
        const steerNodes = [steerFl, steerFr].filter(
          (s): s is THREE.Object3D => Boolean(s)
        );

        carRigsRef.current[index] = {
          wrapper,
          wheels,
          steerNodes,
          steeringWheel: null,
          spinSign: 1,
          brakeMat: null,
        };
      });
    });

    // 3. 6-Aircraft Switchable Fleet (Gulfstream G700, Bell Helicopter, Mustang Fighter, Twin Turboprop, Boeing 737, Heavy Cargo Jet)
    const planeFleetConfigs: {
      url: string;
      index: number;
      scale: number;
      spinNodeNames: string[];
    }[] = [
      { url: '/models/business_jet.glb', index: 0, scale: 0.56, spinNodeNames: [] },
      { url: '/models/helicopter.glb', index: 1, scale: 0.95, spinNodeNames: [] },
      { url: '/models/fighter_jet.glb', index: 2, scale: 1.15, spinNodeNames: ['propeller'] },
      { url: '/models/turboprop.glb', index: 3, scale: 0.42, spinNodeNames: ['prop-l', 'prop-r'] },
      { url: '/models/narrow_airliner.glb', index: 4, scale: 0.34, spinNodeNames: ['fan-l', 'fan-r'] },
      { url: '/models/cargo_ship.glb', index: 5, scale: 0.32, spinNodeNames: ['fan-l', 'fan-r'] },
    ];

    planeFleetConfigs.forEach(({ url, index, scale, spinNodeNames }) => {
      gltfLoader.load(url, (gltf) => {
        if (disposed || !planeModelMountRef.current) return;
        const model = gltf.scene;

        model.traverse((child) => {
          if ((child as THREE.Mesh).isMesh) {
            const mesh = child as THREE.Mesh;
            mesh.castShadow = true;
            mesh.receiveShadow = true;
            mesh.material = sharedFleetMat;
          }
        });

        autoGroundAndCenter(model, scale, 0);

        const wrapper = new THREE.Group();
        wrapper.add(model);
        wrapper.visible = activePlaneIdxRef.current === index;
        planeModelMountRef.current.add(wrapper);

        const rotorMain = model.getObjectByName('rotor-main') ?? null;
        const rotorTail = model.getObjectByName('rotor-tail') ?? null;
        const spinNodesZ = spinNodeNames
          .map((n) => model.getObjectByName(n))
          .filter((node): node is THREE.Object3D => Boolean(node));

        planeRigsRef.current[index] = {
          wrapper,
          rotorMain,
          rotorTail,
          spinNodesZ,
        };
      });
    });

    // 4. 6-Boat / Yacht / Cruise Liner / Submarine Switchable Fleet
    if (boatModelMountRef.current) {
      // Index 1: Procedural 18m Luxury Multi-Deck Cruise Liner ("OASIS OF AZUREA CRUISE LINER")
      const cruiseWrapper = new THREE.Group();
      const cruiseModel = createOasisOfAzureaCruiseLiner();
      cruiseWrapper.add(cruiseModel);
      cruiseWrapper.visible = activeBoatIdxRef.current === 1;
      boatModelMountRef.current.add(cruiseWrapper);
      boatRigsRef.current[1] = {
        wrapper: cruiseWrapper,
        spinNodesZ: [],
      };
    }

    const boatFleetConfigs: {
      url: string;
      index: number;
      scale: number;
      draft: number;
      spinNodeNames: string[];
    }[] = [
      { url: '/models/motorboat.glb', index: 0, scale: 1.55, draft: -0.35, spinNodeNames: ['propeller'] },
      { url: '/models/galleon_ship.glb', index: 2, scale: 0.55, draft: -0.45, spinNodeNames: [] },
      { url: '/models/sloop_yacht.glb', index: 3, scale: 1.15, draft: -0.38, spinNodeNames: [] },
      { url: '/models/caique_boat.glb', index: 4, scale: 1.35, draft: -0.32, spinNodeNames: ['propeller'] },
      {
        url: '/models/submarine.glb',
        index: 5,
        scale: 2.4,
        draft: -0.45,
        spinNodeNames: ['stern-rotor', 'rotor-l', 'rotor-r'],
      },
    ];

    boatFleetConfigs.forEach(({ url, index, scale, draft, spinNodeNames }) => {
      gltfLoader.load(url, (gltf) => {
        if (disposed || !boatModelMountRef.current) return;
        const model = gltf.scene;

        model.traverse((child) => {
          if ((child as THREE.Mesh).isMesh) {
            const mesh = child as THREE.Mesh;
            mesh.castShadow = true;
            mesh.receiveShadow = true;
            mesh.material = sharedFleetMat;
          }
        });

        autoGroundAndCenter(model, scale, 0, draft);

        const wrapper = new THREE.Group();
        wrapper.add(model);
        wrapper.visible = activeBoatIdxRef.current === index;
        boatModelMountRef.current.add(wrapper);

        const spinNodesZ = spinNodeNames
          .map((n) => model.getObjectByName(n))
          .filter((node): node is THREE.Object3D => Boolean(node));

        boatRigsRef.current[index] = {
          wrapper,
          spinNodesZ,
        };
      });
    });

    let xbotSource: { rig: HumanoidRig; clips: THREE.AnimationClip[] } | null = null;
    let michelleSource: { rig: HumanoidRig; clips: THREE.AnimationClip[] } | null = null;

    const applyMixamoRetarget = (targetRig: HumanoidRig) => {
      if (xbotSource && (!targetRig.clips.idle || !targetRig.clips.walk || !targetRig.clips.run)) {
        retargetMixamoClips(targetRig, xbotSource.rig, xbotSource.clips, ['idle', 'walk', 'run']);
      }
      if (michelleSource && !targetRig.clips.emote) {
        retargetMixamoClips(targetRig, michelleSource.rig, michelleSource.clips, ['SambaDance']);
      }
    };

    const loadCoastalCharacter = (archetype: CoastalCharacter) => {
      if (disposed || coastalRigs.current.has(archetype) || loadingCoastalRef.current.has(archetype)) return;
      const spec = COASTAL_CHARACTERS[archetype];
      if (!spec) return;
      loadingCoastalRef.current.add(archetype);
      gltfLoader.load(
        spec.url,
        (gltf) => {
          loadingCoastalRef.current.delete(archetype);
          if (disposed || !soldierMountRef.current) return;
          const model = gltf.scene;
          const materials: AvatarFinish = {
            fabrics: [], trousers: [], hair: [], skin: [], shoes: [], hat: [], pack: [], accents: [], kitUniforms: [],
          };
          const collected = new Set<THREE.MeshStandardMaterial>();
          const isRobotChar = /ROBOT|XBOT/i.test(archetype);
          const supportsKitTint = /^(?:CHLOE_REED_BASE|LOLA_QUINN_BASE|TRIPO_NIKE_BLONDE|TRIPO_NIKE_BRUNETTE)$/.test(archetype);
          const isTripoModel = /^(?:CHLOE_|LOLA_|MARCUS_|LIAM_|KAI_|TRIPO_)/.test(archetype);
          model.traverse((object) => {
            const mesh = object as THREE.Mesh;
            if (!mesh.isMesh) return;
            mesh.castShadow = true;
            mesh.receiveShadow = true;
            mesh.frustumCulled = false;
            if (/hat|(?:shell|trim|accent|hardware|visor)[_ ]?Head$/i.test(mesh.name)) materials.hat.push(mesh);
            if (/attach-back-mesh|shellSpine2|hardwareSpine2/i.test(mesh.name)) materials.pack.push(mesh);
            const meshMats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
            for (const rawMat of meshMats) {
              if (!(rawMat as THREE.MeshStandardMaterial)?.isMeshStandardMaterial) continue;
              const finish = rawMat as THREE.MeshStandardMaterial;
              if (collected.has(finish)) continue;
              collected.add(finish);
              finish.flatShading = false;
              if (finish.map) {
                finish.map.colorSpace = THREE.SRGBColorSpace;
                finish.map.needsUpdate = true;
              }
              const isCyberArmor = isRobotChar || /HighLimbsGeo|Joints_MAT/i.test(finish.name);
              if (isCyberArmor) {
                finish.roughness = 0.28;
                finish.metalness = 0.78;
                finish.envMapIntensity = 1.35;
              } else if (isTripoModel) {
                // Strip overly glossy metallicRoughness from Tripo skins/clothing so skin & cotton look natural matte-satin
                finish.roughnessMap = null;
                finish.metalnessMap = null;
                finish.roughness = 0.84;
                finish.metalness = 0.02;
                finish.envMapIntensity = 0.42;
                if (supportsKitTint) {
                  const kitUniform = { value: new THREE.Color('#ffffff') };
                  materials.kitUniforms.push(kitUniform);
                  finish.customProgramCacheKey = () => `kit-tint-${archetype}`;
                  finish.onBeforeCompile = (shader) => {
                    shader.uniforms.uKitTint = kitUniform;
                    shader.fragmentShader =
                      `uniform vec3 uKitTint;\n` +
                      shader.fragmentShader.replace(
                        '#include <map_fragment>',
                        `#include <map_fragment>
                        float kMax = max(diffuseColor.r, max(diffuseColor.g, diffuseColor.b));
                        float kMin = min(diffuseColor.r, min(diffuseColor.g, diffuseColor.b));
                        float kSat = (kMax - kMin) / max(kMax, 0.001);
                        float kMask = smoothstep(0.58, 0.76, kMax) * (1.0 - smoothstep(0.08, 0.19, kSat));
                        diffuseColor.rgb = mix(diffuseColor.rgb, diffuseColor.rgb * uKitTint, kMask);`
                      );
                  };
                }
              } else {
                finish.roughness = Math.max(finish.roughness, 0.72);
                finish.metalness = Math.min(finish.metalness, 0.05);
                finish.envMapIntensity = 0.58;
              }
              finish.needsUpdate = true;
              if (finish.name === 'Outfit Fabric' || finish.name === 'Shirt' || /HighLimbsGeo/i.test(finish.name)) {
                materials.fabrics.push(finish);
              }
              if (finish.name === 'Utility Trousers' || finish.name === 'Pants' || /Joints_MAT/i.test(finish.name)) {
                materials.trousers.push(finish);
              }
              if (/^Hair(?:Base)?$/.test(finish.name)) materials.hair.push(finish);
              if (finish.name === 'Skin') materials.skin.push(finish);
              if (finish.name === 'Shoes') materials.shoes.push(finish);
              if (finish.name === 'Reflective Safety Trim') materials.accents.push(finish);
            }
          });
          const lArm = model.getObjectByName('mixamorig:LeftArm') ?? model.getObjectByName('mixamorigLeftArm') ?? model.getObjectByName('LeftArm');
          const rArm = model.getObjectByName('mixamorig:RightArm') ?? model.getObjectByName('mixamorigRightArm') ?? model.getObjectByName('RightArm');
          let rotY = 0;
          if (lArm && rArm) {
            model.updateMatrixWorld(true);
            const lr = lArm.getWorldPosition(new THREE.Vector3()).sub(rArm.getWorldPosition(new THREE.Vector3()));
            if (Math.hypot(lr.x, lr.z) > 0.05) {
              rotY = Math.atan2(lr.z, lr.x);
            }
          }
          const bounds = new THREE.Box3().setFromObject(model);
          const height = bounds.max.y - bounds.min.y;
          autoGroundAndCenter(model, spec.height / Math.max(0.2, height), rotY);
          const wrapper = new THREE.Group();
          wrapper.add(model);
          wrapper.visible = (simState.customization?.archetype ?? 'CHLOE_REED_BASE') === archetype;
          soldierMountRef.current.add(wrapper);
          const posture: RigPosture = isRobotChar
            ? 'robotic'
            : /^(?:CHLOE_|LOLA_|TRIPO_SPIDER|TRIPO_SANTA|TRIPO_CYBER|TRIPO_RIVIERA|TRIPO_TACTICAL|TRIPO_NIKE|CIVILIAN_WOMAN)/.test(archetype)
            ? 'feminine'
            : 'athletic';
          const rig = createHumanoidRig(wrapper, model, gltf.animations, posture);
          coastalRigs.current.set(archetype, rig);
          coastalMaterials.current.set(archetype, materials);
          if (archetype === 'XBOT_CYBER') {
            xbotSource = { rig, clips: gltf.animations };
            for (const existingRig of coastalRigs.current.values()) applyMixamoRetarget(existingRig);
          } else {
            applyMixamoRetarget(rig);
          }
          applyCharacterCustomization();
        },
        undefined,
        () => {
          loadingCoastalRef.current.delete(archetype);
        }
      );
    };

    ensureCoastalCharacterRef.current = loadCoastalCharacter;
    loadCoastalCharacter('XBOT_CYBER');
    const initialArch = (simState.customization?.archetype ?? 'CHLOE_REED_BASE') as CoastalCharacter;
    if (initialArch in COASTAL_CHARACTERS && initialArch !== 'XBOT_CYBER') {
      loadCoastalCharacter(initialArch);
    }

    // 5A. High-Resolution Ready Player Me Customizable Human (/models/readyplayer_me.glb)
    gltfLoader.load('/models/readyplayer_me.glb', (gltf) => {
      if (disposed || !soldierMountRef.current) return;
      const model = gltf.scene;

      const skinMats: THREE.MeshStandardMaterial[] = [];
      const topMats: THREE.MeshStandardMaterial[] = [];
      const bottomMats: THREE.MeshStandardMaterial[] = [];
      const footwearMats: THREE.MeshStandardMaterial[] = [];
      const headwearMeshes: THREE.Mesh[] = [];
      const headwearMats: THREE.MeshStandardMaterial[] = [];
      const beardMeshes: THREE.Mesh[] = [];
      const beardMats: THREE.MeshStandardMaterial[] = [];

      model.traverse((child) => {
        if ((child as THREE.Mesh).isMesh) {
          const mesh = child as THREE.Mesh;
          mesh.castShadow = true;
          mesh.receiveShadow = true;
          mesh.frustumCulled = false;

          // Clone original MeshStandardMaterial so all 19 PBR normal/roughness/albedo maps remain intact!
          const origMat = Array.isArray(mesh.material) ? mesh.material[0] : mesh.material;
          if (origMat && (origMat as THREE.MeshStandardMaterial).isMeshStandardMaterial) {
            const mat = (origMat as THREE.MeshStandardMaterial).clone();
            mesh.material = mat;
            const mName = (mat.name || '').toLowerCase();
            const meshName = (mesh.name || '').toLowerCase();

            if (
              meshName.includes('wolf3d_head') ||
              meshName.includes('wolf3d_body') ||
              mName.includes('wolf3d_skin') ||
              mName.includes('wolf3d_body')
            ) {
              skinMats.push(mat);
            } else if (meshName.includes('outfit_top') || mName.includes('outfit_top')) {
              topMats.push(mat);
            } else if (meshName.includes('outfit_bottom') || mName.includes('outfit_bottom')) {
              bottomMats.push(mat);
            } else if (meshName.includes('outfit_footwear') || mName.includes('outfit_footwear')) {
              footwearMats.push(mat);
            } else if (
              meshName.includes('headwear') ||
              mName.includes('headwear') ||
              mesh.name === 'Mesh'
            ) {
              headwearMeshes.push(mesh);
              headwearMats.push(mat);
            } else if (meshName.includes('beard') || mName.includes('beard')) {
              beardMeshes.push(mesh);
              beardMats.push(mat);
            }
          }
        }
      });

      autoGroundAndCenter(model, 1.0, 0);

      const wrapper = new THREE.Group();
      wrapper.add(model);
      soldierMountRef.current.add(wrapper);

      rpmMatRefs.current = {
        skinMats,
        topMats,
        bottomMats,
        footwearMats,
        headwearMeshes,
        headwearMats,
        beardMeshes,
        beardMats,
      };
      rpmRigRef.current = createHumanoidRig(wrapper, model, gltf.animations);

      applyCharacterCustomization();
    });

    // 5B. High-Resolution Mixamo Female VIP Human (/models/michelle.glb)
    gltfLoader.load('/models/michelle.glb', (gltf) => {
      if (disposed || !soldierMountRef.current) return;
      const model = gltf.scene;
      const bodyMats: THREE.MeshStandardMaterial[] = [];

      model.traverse((child) => {
        if ((child as THREE.Mesh).isMesh) {
          const mesh = child as THREE.Mesh;
          mesh.castShadow = true;
          mesh.receiveShadow = true;
          mesh.frustumCulled = false;
          const origMat = Array.isArray(mesh.material) ? mesh.material[0] : mesh.material;
          if (origMat && (origMat as THREE.MeshStandardMaterial).isMeshStandardMaterial) {
            const mat = (origMat as THREE.MeshStandardMaterial).clone();
            mesh.material = mat;
            bodyMats.push(mat);
          }
        }
      });

      model.updateMatrixWorld(true);
      const rawBox = new THREE.Box3().setFromObject(model);
      const rawHeight = rawBox.max.y - rawBox.min.y;
      const targetScale = rawHeight > 10 ? 0.0108 : 1.87 / Math.max(0.1, rawHeight);

      autoGroundAndCenter(model, targetScale, 0);

      const wrapper = new THREE.Group();
      wrapper.add(model);
      soldierMountRef.current.add(wrapper);

      michelleBodyMatsRef.current = bodyMats;
      michelleRigRef.current = createHumanoidRig(wrapper, model, gltf.animations);
      michelleSource = { rig: michelleRigRef.current, clips: gltf.animations };
      for (const existingRig of coastalRigs.current.values()) applyMixamoRetarget(existingRig);

      applyCharacterCustomization();
    });

    // 5C. High-Resolution Mixamo Vanguard Operator (/models/soldier.glb — rotated Math.PI on Y so it faces +Z!)
    gltfLoader.load('/models/soldier.glb', (gltf) => {
      if (disposed || !soldierMountRef.current) return;
      const model = gltf.scene;

      model.traverse((child) => {
        if ((child as THREE.Mesh).isMesh) {
          const mesh = child as THREE.Mesh;
          mesh.castShadow = true;
          mesh.receiveShadow = true;
          mesh.frustumCulled = false;
        }
      });

      model.updateMatrixWorld(true);
      const rawBox = new THREE.Box3().setFromObject(model);
      const rawHeight = rawBox.max.y - rawBox.min.y;
      const targetScale = rawHeight > 10 ? 0.011 : 1.1;

      // Rotate Math.PI around Y so Soldier faces +Z (forward travel direction) and auto-ground with Box3
      autoGroundAndCenter(model, targetScale, Math.PI);

      const wrapper = new THREE.Group();
      wrapper.add(model);
      soldierMountRef.current.add(wrapper);
      soldierWrapperRef.current = wrapper;

      soldierRigRef.current = createHumanoidRig(wrapper, model, gltf.animations);
      applyCharacterCustomization();
    });

    // 6. 5-Slot Real 3D GLB Tactical Weapon Loadout (WEAPON_SPECS)
    const weaponMat = new THREE.MeshStandardMaterial({
      vertexColors: true,
      roughness: 0.25,
      metalness: 0.65,
      envMapIntensity: 1.6,
    });

    WEAPON_SPECS.forEach((spec, idx) => {
      gltfLoader.load(spec.url, (gltf) => {
        if (disposed) return;
        const model = gltf.scene;
        model.traverse((child) => {
          if ((child as THREE.Mesh).isMesh) {
            const mesh = child as THREE.Mesh;
            mesh.castShadow = true;
            mesh.receiveShadow = true;
            mesh.material = weaponMat;
          }
        });

        // gun_sniper.glb has its barrel along X so rotate -Math.PI / 2 on Y so all 5 weapons point along +Z
        const rotY = spec.id === 'SNIPER' ? -Math.PI / 2 : 0;
        autoGroundAndCenter(model, 0.85, rotY);

        const wrapper = new THREE.Group();
        wrapper.add(model);
        wrapper.visible = simState.activeWeaponIdx === idx;
        weaponMeshesRef.current[idx] = wrapper;
        if (weaponMountRef.current) {
          weaponMountRef.current.add(wrapper);
        }

        const carClone = wrapper.clone(true);
        carClone.scale.setScalar(1.1);
        carClone.visible = simState.activeWeaponIdx === idx;
        carWeaponMeshesRef.current[idx] = carClone;
        if (carWeaponMountRef.current) {
          carWeaponMountRef.current.add(carClone);
        }
      });
    });

    return () => {
      disposed = true;
      ensureCoastalCharacterRef.current = null;
      loadingCoastalRef.current.clear();
      dracoLoader.dispose();
    };
  }, []);

  const walkingSurface = (pos: THREE.Vector3, step = 0.38, probeY = pos.y) => {
    const deck = getTravelHeight(pos.x, pos.z, probeY);
    const start = new THREE.Vector3(pos.x, pos.y + step, pos.z);
    const hit = traceWorld(start, DOWN, step + 2, 0, (surface) => surface.normal.y > 0.7 && surface.section?.solid !== false);
    return hit && hit.section?.solid !== false && hit.normal.y > 0.7 && hit.point.y >= deck ? hit.point.y : deck;
  };

  const applyWorldCollisions = (pos: THREE.Vector3, previous: THREE.Vector3, vehicle: 'FOOT' | 'CAR' | 'BOAT' | 'PLANE') => {
    const isCar = vehicle === 'CAR';
    const isPlane = vehicle === 'PLANE';
    const padding = isPlane ? 0.74 : isCar ? 0.89 : vehicle === 'BOAT' ? 0.85 : 0.36;
    const offset = isPlane ? 0.86 : isCar ? 1.03 : vehicle === 'BOAT' ? 0.14 : 0.88;
    const moving = pos.clone().sub(previous);
    const distance = moving.length();
    const speed = isCar ? Math.abs(simState.carSpeed) : isPlane ? Math.hypot(simState.planeSpeed, simState.planeVel.y) :
      vehicle === 'BOAT' ? Math.abs(simState.boatSpeed) : 0;
    const direction = distance > 0.0001 ? moving.clone().divideScalar(distance) : UP;
    const start = previous.clone().addScaledVector(UP, offset);
    const blocksMovement = (contact: WorldHit) => Math.abs(contact.normal.y) < 0.62 || Math.abs(direction.y) > 0.07;
    let hit = traceWorld(start, direction, distance, padding, blocksMovement);
    let hitProbe = 0;
    if (isPlane && speed > 4 && simState.activePlaneIdx !== 1) {
      const wingReach = [3.0, 0, 2.5, 4.0, 5.4, 6.0][simState.activePlaneIdx];
      const sideVector = new THREE.Vector3(Math.cos(simState.planeYaw), Math.sin(simState.planeRoll), -Math.sin(simState.planeYaw));
      for (const side of [-1, 1]) {
        const wing = traceWorld(start.clone().addScaledVector(sideVector, side * wingReach), direction, distance, 0.36, blocksMovement);
        if (wing && (!hit || wing.distance < hit.distance)) {
          hit = wing;
          hitProbe = side;
        }
      }
    }

    if (hit && (hit.depth > 0.006 || moving.dot(hit.normal) < -0.0001)) {
      const along = moving.dot(hit.normal);
      const first = Math.max(0, hit.distance - 0.034);
      pos.copy(previous).addScaledVector(direction, first).addScaledVector(hit.normal, hit.depth + 0.038);
      if (vehicle === 'FOOT' && along < 0) {
        const slide = moving.clone().addScaledVector(direction, -first);
        slide.addScaledVector(hit.normal, -slide.dot(hit.normal));
        // Keep the remaining tangent motion along walls, while floors are handled by grounding.
        if (Math.abs(hit.normal.y) < 0.7) pos.addScaledVector(slide, 0.72);
      }
      const lightProp = hit.section?.label === 'Traffic cone';
      const normalSpeed = speed * Math.max(hit.depth > 0.05 ? 0.22 : 0, -direction.dot(hit.normal));
      if (lightProp && normalSpeed > 2) {
        damageWorld(hit, 18 + normalSpeed);
        if (isCar) simState.carSpeed *= 0.94;
        return;
      }
      if (isCar && Math.abs(hit.normal.y) < 0.8) {
        const headOn = Math.max(0, -direction.dot(hit.normal));
        if (headOn > 0.55) {
          simState.carSpeed *= normalSpeed > 12 ? -0.22 : 0.28;
        } else {
          simState.carSpeed *= 1 - headOn * 0.65;
        }
      }
      if (vehicle === 'BOAT') simState.boatSpeed *= normalSpeed > 8 ? -0.23 : 0.35;
      if (isPlane) {
        simState.planeSpeed *= hit.normal.y > 0.65 ? 0.67 : 0.42;
        if (Math.abs(hit.normal.y) < 0.6) {
          simState.planeYaw += hitProbe ? hitProbe * 0.19 : hit.normal.x * 0.22;
          simState.planeRoll += (hitProbe || Math.sign(hit.normal.x)) * 0.22;
        } else if (hit.normal.y > 0) {
          simState.planeVel.y = Math.max(0, simState.planeVel.y * -0.15);
        }
      }
      if (normalSpeed > 4.5) registerVehicleImpact(normalSpeed, hit.point, hit);
      else if (speed > 11 && Math.abs(direction.dot(hit.normal)) < 0.27 && sparkTimerRef.current <= 0) {
        emitEnvironment('impact', hit.point, Math.min(0.38, speed / 75), moving.x * 4, moving.z * 4);
        sparkTimerRef.current = 0.11;
        if (hit.section) damageWorld(hit, 3 + speed * 0.17);
      }
    }

    if (vehicle !== 'BOAT' && getTerrainHeight(pos.x, pos.z) > simState.tideOffset + 0.5 &&
        pos.y < getTerrainHeight(pos.x, pos.z) + 11 && isConstructionClosed(pos.x, pos.z)) {
      if (!isConstructionClosed(previous.x, previous.z)) pos.copy(previous);
      else {
        const radius = islandTwoRadius(pos.x, pos.z);
        if (radius < 0.001) pos.z = CONSTRUCTION_ISLAND.z + CONSTRUCTION_ISLAND.radiusZ * 1.028;
        else {
          pos.x *= 1.028 / radius;
          pos.z = CONSTRUCTION_ISLAND.z + (pos.z - CONSTRUCTION_ISLAND.z) * 1.028 / radius;
        }
      }
      if (isCar) simState.carSpeed *= -0.15;
      if (isPlane) {
        simState.planeSpeed *= 0.45;
        simState.planeVel.y = Math.max(0, simState.planeVel.y);
        if (simState.aircraftDamage.state === 'wrecked') {
          pos.z = Math.max(pos.z, -347);
          pos.y = Math.max(getTravelHeight(pos.x, pos.z, pos.y) + 0.35, simState.tideOffset + 0.35);
          simState.aircraftDamage.settled = true;
        }
      }
    }

    // C. Rigid Car-to-Traffic Collisions (simState.trafficPositions)
    const traffic = simState.gameMode === 'GRAND_PRIX' ? simState.raceTraffic : simState.trafficPositions;
    if (isCar && traffic.length > 0) {
      const fwdX = Math.sin(simState.carYaw);
      const fwdZ = Math.cos(simState.carYaw);
      for (const [tx, ty, tz] of traffic) {
        if (Math.abs(pos.y - ty) > 1.18) continue;
        const dx = pos.x - tx;
        const dz = pos.z - tz;
        const dist = Math.hypot(dx, dz);
        if (dist < 3.4 && dist > 0.001) {
          const nx = dx / dist;
          const nz = dz / dist;
          const pushDist = 3.4 - dist;
          pos.x += nx * pushDist;
          pos.z += nz * pushDist;

          const impactSpeed = Math.abs(simState.carSpeed);
          const headOnAlignment = Math.abs(fwdX * -nx + fwdZ * -nz);
          if (impactSpeed > 10 && headOnAlignment > 0.55) {
            simState.carSpeed *= -0.25;
          } else {
            simState.carSpeed *= 0.45;
          }
          registerVehicleImpact(Math.max(impactSpeed, 7.0), pos);
        }
      }
    }
  };

  useFrame((state, rawDelta) => {
    const dt = Math.min(rawDelta, 0.05);
    const t = state.clock.elapsedTime;
    const keys = simState.keys;
    const s = simState as any;

    // Live check for Character Studio customization updates
    const curCustVer = typeof s.customizationVersion === 'number' ? s.customizationVersion : 0;
    const curCustHash = s.customization ? JSON.stringify(s.customization) : '';
    if (
      curCustVer !== lastAppliedCustVersionRef.current ||
      curCustHash !== lastAppliedCustHashRef.current
    ) {
      lastAppliedCustVersionRef.current = curCustVer;
      lastAppliedCustHashRef.current = curCustHash;
      applyCharacterCustomization();
    }

    // Sync active fleet indices if changed from HUD or Lobby
    if (typeof s.activeCarIdx === 'number' && s.activeCarIdx !== activeCarIdxRef.current) {
      syncCarFleet(s.activeCarIdx);
    }
    if (typeof s.activePlaneIdx === 'number' && s.activePlaneIdx !== activePlaneIdxRef.current) {
      syncPlaneFleet(s.activePlaneIdx);
    }
    if (typeof s.activeBoatIdx === 'number' && s.activeBoatIdx !== activeBoatIdxRef.current) {
      syncBoatFleet(s.activeBoatIdx);
    }

    // FPS tracker
    fpsFrames.current += 1;
    fpsAccum.current += rawDelta;
    if (fpsAccum.current >= 0.5) {
      currentFps.current = Math.round(fpsFrames.current / fpsAccum.current);
      fpsFrames.current = 0;
      fpsAccum.current = 0;
    }

    // Roulette Storm countdown
    if (!simState.startMenuOpen) {
      simState.rouletteTimer -= dt;
      if (simState.rouletteTimer <= 0) triggerRouletteSpin();
    }
    simState.tideOffset = THREE.MathUtils.damp(simState.tideOffset, simState.roulette === 'BLACK' ? -0.35 : 0, 0.76, dt);

    // Battle Royale timers, Damage/Shake decays & Storm ring shrink
    aiming.feedback = Math.max(0, aiming.feedback - dt);
    aiming.harvestPause = Math.max(0, aiming.harvestPause - dt);
    if (aiming.pickSwing > 0) {
      const before = aiming.pickSwing;
      if (aiming.harvestPause <= 0) aiming.pickSwing = Math.max(0, before - dt);
      if (before > 0.28 && aiming.pickSwing <= 0.28) connectPickaxe();
    }
    if (simState.shotCooldown > 0) {
      simState.shotCooldown = Math.max(0, simState.shotCooldown - dt);
    }
    if (simState.firingTimer > 0) {
      simState.firingTimer = Math.max(0, simState.firingTimer - dt);
    }
    if (crashCooldownRef.current > 0) {
      crashCooldownRef.current = Math.max(0, crashCooldownRef.current - dt);
    }
    if (sparkTimerRef.current > 0) {
      sparkTimerRef.current = Math.max(0, sparkTimerRef.current - dt);
    }
    simState.cameraShake = Math.max(0, simState.cameraShake - dt * 2.6);
    simState.crashFlashTimer = Math.max(0, simState.crashFlashTimer - dt);
    if (simState.brActive && !simState.startMenuOpen && simState.brResult === null) {
      simState.stormRadius = Math.max(58, simState.stormRadius - dt * 0.82);
      simState.botImpactCooldown = Math.max(0, simState.botImpactCooldown - dt);
      if (!simState.parachuting && Math.hypot(simState.playerPos.x, simState.playerPos.z) > simState.stormRadius) {
        injurePlayer(4.8 * dt, false);
      }
    }

    const isCustomizerOpen = Boolean(s.customizerOpen);
    const isStartMenuOpen = Boolean(s.startMenuOpen);
    const isMenuOpen = Boolean(s.customizerOpen || s.startMenuOpen || simState.controlsOpen ||
      simState.gameMode === 'BATTLE_ROYALE' && simState.brResult === 'OUT');
    const ctrl = simState.controlSettings;
    const steerSens = ctrl?.steeringSensitivity ?? 1.0;
    const throttleSens = ctrl?.throttleSensitivity ?? 1.0;
    const camSmooth = ctrl?.cameraSmoothness ?? 1.0;
    const steerAssist = ctrl?.steeringAssist ?? true;
    const invertFlightY = ctrl?.invertFlightY ?? false;

    // Blend digital keyboard keys with smooth proportional analog mobile joystick
    const analogX = !isMenuOpen ? simState.analogMoveX || 0 : 0; // -1 left .. +1 right
    const analogY = !isMenuOpen ? simState.analogMoveY || 0 : 0; // -1 back .. +1 fwd

    const kbFwd = !isMenuOpen && (keys.has('KeyW') || keys.has('ArrowUp')) ? 1 : 0;
    const kbBack = !isMenuOpen && (keys.has('KeyS') || keys.has('ArrowDown')) ? 1 : 0;
    const kbLeft = !isMenuOpen && (keys.has('KeyA') || keys.has('ArrowLeft')) ? 1 : 0;
    const kbRight = !isMenuOpen && (keys.has('KeyD') || keys.has('ArrowRight')) ? 1 : 0;

    const fwd = Math.max(kbFwd, Math.max(0, analogY));
    const back = Math.max(kbBack, Math.max(0, -analogY));
    const left = Math.max(kbLeft, Math.max(0, -analogX));
    const right = Math.max(kbRight, Math.max(0, analogX));
    const boost = !isMenuOpen && (keys.has('ShiftLeft') || keys.has('ShiftRight') || simState.touchKeys.has('ShiftLeft'));
    const space = !isMenuOpen && (keys.has('Space') || simState.touchKeys.has('Space'));
    const touchThrottle = isMenuOpen ? 0 : simState.touchThrottle;
    const brake = !isMenuOpen && (keys.has('ControlLeft') || keys.has('ControlRight') || simState.touchBrake);
    const flyDamage = simState.aircraftDamage;
    const currentVehicle = simState.mode === 'CAR' ? simState.carDamage : simState.mode === 'BOAT' ? simState.boatDamage : null;
    simState.vehicleHp = simState.mode === 'PLANE' ? flyDamage.hull : currentVehicle?.hp ?? 100;
    simState.vehicleWrecked = simState.mode === 'PLANE' ? flyDamage.state === 'wrecked' : currentVehicle?.wrecked ?? false;
    const previous = previousPosition.current;

    if (!isMenuOpen && !(simState.mode === 'FOOT' && footMotion.current.swim) && (keys.has('KeyF') || simState.touchKeys.has('KeyF') || mouseDownRef.current)) {
      fireActiveWeapon();
    }

    const now = coastalNow();
    const coastalPlay = !isMenuOpen && (simState.gameMode === 'FREE_ROAM' || simState.gameMode === 'WORLD_TOUR');
    const prizeBoost = coastalPlay && now < simState.coastal.speedUntil;
    let speedKmh = 0;
    let activePos = simState.playerPos;
    let activeYaw = simState.playerYaw;
    let isDrifting = false;
    let tirePressure = 0;
    let activeRidePose: ReturnType<typeof sampleAmusementRidePose> | null = null;
    simState.carSweep.speed = 0;

    // Restore 3rd-person camera cleanly when exiting the Roller Coaster FPV ride
    if (prevActiveRideRef.current === 'COASTER' && simState.activeRide !== 'COASTER') {
      if (simState.cameraView === 1) {
        simState.cameraView = 0;
        cameraBlend.current = 0;
        simState.orbitPitch = 0.08;
        window.dispatchEvent(new CustomEvent('hud-sync'));
      }
    }
    prevActiveRideRef.current = simState.activeRide ?? null;

    // 1. ON-FOOT + AMUSEMENT PARK RIDES + BATTLE ROYALE PARACHUTE SKY-DROP + FORTNITE GLIDER + CUSTOMIZER TURNTABLE
    if (simState.mode === 'FOOT' && !isStartMenuOpen) {
      const player = simState.playerPos;
      previous.copy(player);
      footStart.current.copy(player);
      const aim = !isCustomizerOpen && !simState.activeRide && (simState.cameraView === 1 || aiming.ads || construction.pickaxe || construction.active || simState.firingTimer > 0 ||
        simState.gameMode === 'BATTLE_ROYALE' && !simState.gliding && !simState.parachuting);
      const motion = footMotion.current;
      const velocity = simState.playerVel;
      const verticalBefore = velocity.y;
      let groundY = walkingSurface(player) + 0.08;
      if (simState.parachuting || simState.activeRide) motion.swim = false;

      if (simState.activeRide) {
        const ridePose = sampleAmusementRidePose(simState.activeRide, t);
        activeRidePose = ridePose;
        const rideMoved = player.distanceTo(ridePose.pos);
        player.copy(ridePose.pos);
        velocity.set(0, 0, 0);
        simState.playerYaw = ridePose.yaw;
        speedKmh = ridePose.speedKmh ?? Math.round(Math.min(138, (rideMoved / Math.max(dt, 0.001)) * 3.6));
      } else if (simState.parachuting) {
        const turn = (left - right) * 2.5 * dt;
        simState.playerYaw += turn;
        const dirX = Math.sin(simState.playerYaw);
        const dirZ = Math.cos(simState.playerYaw);
        const paraFwdSpeed = fwd > 0 ? 28 : 20;
        const descentRate = boost ? -24 : space ? -5.5 : -11.5;

        simState.playerPos.x += dirX * paraFwdSpeed * dt;
        simState.playerPos.z += dirZ * paraFwdSpeed * dt;
        simState.playerVel.y = descentRate;
        simState.playerPos.y += simState.playerVel.y * dt;

        applyWorldCollisions(player, previous, 'FOOT');
        groundY = Math.max(walkingSurface(player) + 0.08, simState.tideOffset - 0.25);

        if (parachuteRef.current) {
          const targetBank = (right - left) * 0.32 + Math.sin(t * 2.4) * 0.06;
          parachuteRef.current.rotation.z = THREE.MathUtils.lerp(
            parachuteRef.current.rotation.z,
            targetBank,
            Math.min(1, 10 * dt)
          );
          parachuteRef.current.rotation.x = THREE.MathUtils.lerp(
            parachuteRef.current.rotation.x,
            boost ? 0.22 : space ? -0.15 : 0.05,
            Math.min(1, 10 * dt)
          );
        }

        if (simState.playerPos.y <= groundY + 0.25) {
          simState.playerPos.y = groundY;
          simState.playerVel.y = 0;
          simState.parachuting = false;
        }

        speedKmh = Math.round(Math.hypot(paraFwdSpeed, descentRate) * 3.2);
      } else {
        const wave = getWaveHeight(player.x, player.z, t) + simState.tideOffset;
        const entering = simState.tideOffset - groundY > 0.64 && wave - groundY > 0.70 && player.y < wave - 0.25;
        const leaving = simState.tideOffset - groundY < 0.44 || player.y > wave + 1.9;
        if (!motion.swim && entering) {
          const entryHorizSpeed = Math.hypot(velocity.x, velocity.z);
          const energy = Math.min(2.0, 0.62 + Math.abs(velocity.y) * 0.075 + entryHorizSpeed * 0.065);
          emitEnvironment('water', player.clone().setY(wave), energy, velocity.x, velocity.z);
          soundEngine.playSurface('water', energy);
          motion.swim = true;
          motion.swimEntry = entryHorizSpeed > 2.2 || verticalBefore < -2.0 ? 0.52 : 0.28;
          motion.splash = 0.22;
          // Preserve sleek forward glide momentum on beach dive-in
          if (entryHorizSpeed > 2.4) {
            velocity.x *= 0.72;
            velocity.z *= 0.72;
          }
          simState.gliding = false;
          motion.jumpBuffer = 0;
          motion.coyote = 0;
        } else if (motion.swim && leaving) {
          motion.swim = false;
          motion.swimEntry = 0;
          player.y = Math.max(player.y, groundY);
          velocity.y = 0;
        }

        const jumpPressed = space && !motion.jumpHeld;
        motion.jumpBuffer = jumpPressed ? 0.16 : Math.max(0, motion.jumpBuffer - dt);
        const forward = fwd - back;
        const strafe = right - left;
        const travelYaw = simState.playerYaw + simState.orbitYaw;
        const waterDrag = THREE.MathUtils.smoothstep(wave - groundY, 0.15, 0.95);
        const moveSpeed = (motion.swim ? boost ? 5.65 : 3.3 : (boost ? 9.6 : 5.0) * (1 - waterDrag * 0.36)) *
          throttleSens * (prizeBoost ? 1.26 : 1);
        const onGround = !motion.swim && player.y <= groundY + 0.16 && velocity.y <= 0;
        const hasInput = Math.abs(forward) + Math.abs(strafe) > 0.015;
        const response = motion.swim ? 6.8 : onGround ? (hasInput ? 24 : 28) : hasInput ? 3.4 : 0.65;
        const wish = computeFootWishVelocity(travelYaw, forward, strafe, moveSpeed);
        velocity.x = THREE.MathUtils.damp(velocity.x, wish.vx, response, dt);
        velocity.z = THREE.MathUtils.damp(velocity.z, wish.vz, response, dt);
        if (coastalPlay && motion.swim && now < simState.coastal.hydroUntil) {
          const carry = 1 - Math.exp(-dt * 6);
          velocity.addScaledVector(hydroSwimHeading.current, carry * (simState.coastal.hydroUntil - now) * 1.65);
        }

        const current = motion.swim ? shoreReturn(player.x, player.z, simState.playerYaw, 980, 1320) : null;
        player.x += (velocity.x + (current?.x ?? 0) * 8) * dt;
        player.z += (velocity.z + (current?.z ?? 0) * 8) * dt;
        applyWorldCollisions(player, previous, 'FOOT');
        groundY = walkingSurface(player) + 0.08;
        if (!simState.gliding && !isMenuOpen) {
          const moving = Math.hypot(velocity.x, velocity.z) > 0.28;
          const heading = aim && !motion.swim ? travelYaw : moving ? Math.atan2(velocity.x, velocity.z) : simState.playerYaw;
          const step = Math.atan2(Math.sin(heading - simState.playerYaw), Math.cos(heading - simState.playerYaw)) *
            (1 - Math.exp(-(aim && !motion.swim ? 18 : motion.swim ? 6.5 : 14) * dt));
          simState.playerYaw += step;
          if (!document.pointerLockElement) simState.orbitYaw -= step;
        } else if (simState.gliding) simState.playerYaw += (left - right) * 1.65 * dt;

        if (motion.swim) {
          const surface = simState.tideOffset + getWaveHeight(player.x, player.z, t);
          if (coastalPlay && now >= simState.coastal.hydroUntil) {
            const ring = HYDRO_RINGS.findIndex((gate) => crossesHydroRing(gate, footStart.current, player));
            if (ring >= 0) {
              hydroSwimHeading.current.set(velocity.x, 0, velocity.z).normalize();
              velocity.addScaledVector(hydroSwimHeading.current, 6);
              hydroBoost(ring, player.clone().setY(surface), simState.playerYaw);
            }
          }
          const swimSpd = Math.hypot(velocity.x, velocity.z);
          const freestyleRatio = THREE.MathUtils.smoothstep(swimSpd, 0.35, 1.75);
          motion.swimFreestyle = THREE.MathUtils.damp(motion.swimFreestyle, freestyleRatio, 6.5, dt);
          motion.swimEntry = Math.max(0, motion.swimEntry - dt);
          const entryDip = motion.swimEntry > 0 ? Math.sin((motion.swimEntry / 0.52) * Math.PI) * 0.22 : 0;
          const depth = THREE.MathUtils.clamp(swimSpd / 4.2, 0, 1);
          if (jumpPressed && simState.tideOffset - groundY < 0.98) {
            motion.swim = false;
            motion.swimEntry = 0;
            velocity.y = 5.6;
            soundEngine.playSurface('water', 0.42);
          } else {
            // Chin/shoulders right at waterline when treading; torso & legs half-submerged in water during active freestyle
            const baseSubmerge = THREE.MathUtils.lerp(1.18, 1.05, motion.swimFreestyle);
            const buoyBob = THREE.MathUtils.lerp(Math.sin(t * 2.35) * 0.034, Math.sin(t * 4.4) * 0.018, motion.swimFreestyle);
            const target = Math.max(groundY, surface - baseSubmerge - entryDip + buoyBob);
            velocity.y = THREE.MathUtils.damp(velocity.y, (target - player.y) * 12, 9.5, dt);
            player.y = Math.max(groundY, player.y + velocity.y * dt);
            motion.splash -= dt;
            if (hasInput && motion.splash <= 0) {
              motion.splash = boost ? 0.26 : 0.46;
              const stroke = 0.36 + depth * 0.5;
              emitEnvironment('water', player.clone().setY(surface + 0.07), stroke, velocity.x, velocity.z);
              soundEngine.playSurface('water', stroke * 0.52);
            }
          }
        } else {
          motion.swimFreestyle = THREE.MathUtils.damp(motion.swimFreestyle, 0, 9, dt);
          motion.swimEntry = 0;
          const contact = onGround && player.y <= groundY + 0.18;
          motion.coyote = contact ? 0.13 : Math.max(0, motion.coyote - dt);
          if (contact) {
            player.y = groundY;
            velocity.y = 0;
            simState.gliding = false;
            motion.airtime = 0;
          } else motion.airtime += dt;
          const spring = coastalPlay && now >= simState.coastal.trampolineUntil && contact && TRAMPOLINES.find(({ x, z }) =>
            (player.x - x) ** 2 + (player.z - z) ** 2 < TRAMPOLINE_RADIUS ** 2 &&
            Math.abs(player.y - getTravelHeight(x, z)) < 1.15);
          if (spring) {
            velocity.y = trampolineLaunchSpeed();
            motion.coyote = motion.jumpBuffer = 0;
            simState.coastal.trampolineUntil = now + 1.45;
            coastalBurst('spring', spring.x, player.y + 0.25, spring.z);
            soundEngine.playCoastal('spring');
          } else if (motion.jumpBuffer > 0 && motion.coyote > 0) {
            velocity.y = boost && hasInput ? 8.2 : 7.55;
            motion.coyote = motion.jumpBuffer = 0;
            soundEngine.playSurface('step', 0.65);
          } else if (jumpPressed && motion.airtime > 0.68 && velocity.y < -2.5 && player.y - groundY > 3) {
            simState.gliding = true;
          }
          if (Math.hypot(player.x - 10, player.z + 195) < 8 && player.y > 10 && player.y < 21 && velocity.y < 9) {
            velocity.y = 26;
          }
          if (!contact || velocity.y > 0) {
            const gravity = simState.gliding ? 4.5 : 21.5;
            const fall = Math.max(simState.gliding ? -5.5 : -45, velocity.y - gravity * dt);
            previous.copy(player);
            if (simState.gliding) {
              player.x += Math.sin(simState.playerYaw) * 19 * dt;
              player.z += Math.cos(simState.playerYaw) * 19 * dt;
            }
            player.y += (velocity.y + fall) * 0.5 * dt;
            velocity.y = fall;
            applyWorldCollisions(player, previous, 'FOOT');
            groundY = walkingSurface(player, 0.38, Math.max(previous.y, player.y)) + 0.08;
            if (player.y <= groundY && velocity.y < 0) {
              player.y = groundY;
              velocity.y = 0;
              simState.gliding = false;
              if (fall < -3.6) {
                const force = Math.min(1.5, -fall / 12);
                motion.landing = Math.max(motion.landing, 0.28 + force * 0.49);
                if (getTravelHeight(player.x, player.z) < 3.14) emitEnvironment('dust', player, force, velocity.x, velocity.z);
                soundEngine.playSurface('landing', force * 0.52);
              }
            }
          }
          motion.stepTime -= dt;
          if (hasInput && contact && motion.stepTime <= 0) {
            motion.stepTime = boost ? 0.28 : 0.42;
            if (waterDrag > 0.17) {
              emitEnvironment('water', player.clone().setY(wave), 0.22, velocity.x, velocity.z);
              soundEngine.playSurface('water', 0.28);
            } else soundEngine.playSurface('step', boost ? 0.52 : 0.30);
          }
        }

        speedKmh = Math.round(Math.hypot(velocity.x, velocity.z) * 3.6 + (simState.gliding ? 50 : 0));
      }

      activePos = simState.playerPos;
      activeYaw = simState.playerYaw;
      if (simState.lobbyEmoteTimer > 0) {
        simState.lobbyEmoteTimer = Math.max(0, simState.lobbyEmoteTimer - dt);
      }

      const groundedNow = Boolean(simState.activeRide) || (!motion.swim && player.y <= groundY + 0.18 && velocity.y <= 0.1);
      if (groundedNow && motion.airborne && verticalBefore < -2) {
        motion.landing = Math.max(motion.landing, THREE.MathUtils.clamp(-verticalBefore / 13, 0.16, 1));
      }
      motion.airborne = !groundedNow;
      motion.landing = Math.max(0, motion.landing - dt * 4.3);
      motion.jumpHeld = space;
      const movedX = player.x - footStart.current.x;
      const movedZ = player.z - footStart.current.z;
      const travel = Math.hypot(movedX, movedZ);
      const stepSpeed = !isCustomizerOpen && !simState.activeRide && groundedNow ? Math.min(8, travel / Math.max(0.001, dt)) : 0;
      motion.speed = THREE.MathUtils.damp(motion.speed, stepSpeed, stepSpeed > motion.speed ? 13 : 19, dt);
      if (travel > 0.004 && stepSpeed > 0) {
        const sampleX = (movedX * Math.cos(activeYaw) - movedZ * Math.sin(activeYaw)) / travel;
        const sampleZ = (movedX * Math.sin(activeYaw) + movedZ * Math.cos(activeYaw)) / travel;
        motion.directionX = THREE.MathUtils.damp(motion.directionX, sampleX, 18, dt);
        motion.directionZ = THREE.MathUtils.damp(motion.directionZ, sampleZ, 18, dt);
        motion.phase = (motion.phase + travel / strideDistance(motion.speed) * Math.PI * 2) % (Math.PI * 2);
      }
      if (playerRef.current) {
        playerRef.current.position.copy(player);
        playerRef.current.rotation.y = activeYaw;
        playerRef.current.updateWorldMatrix(true, false);
      }
      const swimWaveNow = motion.swim ? getWaveHeight(player.x, player.z, t) : 0;
      const swimSpdNow = Math.hypot(velocity.x, velocity.z);
      const pose = {
        dt, time: t, phase: motion.phase, speed: motion.speed,
        reverse: motion.directionZ < -0.24, lateral: motion.directionX,
        swimming: motion.swim, swimSpeed: swimSpdNow,
        sprinting: boost, swimWave: swimWaveNow,
        airborne: isCustomizerOpen || motion.swim ? undefined : simState.parachuting ? 'parachute' as const :
          simState.gliding ? 'glide' as const : motion.airborne ? 'jump' as const : undefined,
        ridePose: simState.activeRide ?? undefined,
        fallSpeed: simState.playerVel.y, landing: motion.landing, aim: aim && groundedNow ? 1 : 0,
        recoil: simState.firingTimer / 0.13,
        emote: simState.lobbyEmoteTimer,
        emoteStyle: simState.activeEmote,
        harvest: aiming.pickSwing > 0 ? (1 - aiming.pickSwing / 0.5) : undefined,
        lookPitch: simState.orbitPitch, lookYaw: THREE.MathUtils.clamp(simState.orbitYaw, -0.8, 0.8),
        ground: !isCustomizerOpen && !simState.activeRide && groundedNow ? {
          x: motion.directionX, z: motion.directionZ,
          heightAt: (x: number, z: number) => {
            const cover = getTravelHeight(x, z, player.y);
            return Math.abs(cover + 0.08 - groundY) > 0.24 ? groundY - 0.035 :
              THREE.MathUtils.clamp(cover + 0.022, groundY - 0.27, groundY + 0.15);
          },
        } : undefined,
      };
      const playerRig = [rpmRigRef.current, michelleRigRef.current, soldierRigRef.current, ...coastalRigs.current.values()]
        .find((rig) => rig?.wrapper.visible);
      if (playerRig) animateHumanoid(playerRig, pose);
      if (accessoriesRootRef.current) {
        accessoriesRootRef.current.position.y = playerRig?.wrapper.position.y ?? 0;
        accessoriesRootRef.current.position.z = playerRig?.wrapper.position.z ?? 0;
        accessoriesRootRef.current.rotation.x = playerRig?.wrapper.rotation.x ?? 0;
      }
      if (playerShadowRef.current) {
        playerShadowRef.current.visible = groundedNow && !state.gl.shadowMap.enabled && !motion.swim && !simState.activeRide;
      }
    }

    // Animated 3D Swimming Water Ripples, Trailing Foam Wake Rings & Sparkling Splash Droplets
    if (swimFxGroupRef.current) {
      const activeSwim = !isStartMenuOpen && simState.mode === 'FOOT' && footMotion.current.swim;
      const fx = swimFxState.current;
      const player = simState.playerPos;
      const swimSpd = Math.hypot(simState.playerVel.x, simState.playerVel.z);
      const freestyleAmt = footMotion.current.swimFreestyle;
      const waterY = simState.tideOffset + getWaveHeight(player.x, player.z, t);
      const fwdX = Math.sin(simState.playerYaw);
      const fwdZ = Math.cos(simState.playerYaw);
      const rightX = Math.cos(simState.playerYaw);
      const rightZ = -Math.sin(simState.playerYaw);

      let anyActive = activeSwim;

      // 1. Delicate feathered concentric surface ripple rings around swimmer's shoulders/torso
      for (let i = 0; i < 4; i++) {
        const ring = swimRippleRefs.current[i];
        if (!ring) continue;
        ring.visible = activeSwim;
        if (!activeSwim) continue;
        const speedMult = 0.58 + freestyleAmt * 0.48 + (boost ? 0.25 : 0);
        const phase = (t * speedMult + i * 0.25) % 1;
        const forwardBias = freestyleAmt * 0.14;
        ring.position.set(
          player.x + fwdX * forwardBias,
          waterY + 0.032 + i * 0.002,
          player.z + fwdZ * forwardBias
        );
        const radiusScale = 0.45 + phase * (0.72 + freestyleAmt * 0.25);
        ring.scale.set(radiusScale, radiusScale * (1 + freestyleAmt * 0.22), 1);
        ring.rotation.set(-Math.PI / 2, 0, -simState.playerYaw + i * 0.9);
        const mat = ring.material as THREE.MeshBasicMaterial;
        mat.opacity = Math.sin(phase * Math.PI) * (0.065 + freestyleAmt * 0.055);
      }

      // 2. Trailing world-space soft foam wake wisps behind kicking heels & stroking arms
      if (activeSwim && swimSpd > 0.35) {
        fx.wakeTimer -= dt;
        const wakeInterval = boost ? 0.14 : 0.22;
        if (fx.wakeTimer <= 0) {
          fx.wakeTimer = wakeInterval;
          const slot = swimWakes.current[fx.wakeCursor];
          fx.wakeCursor = (fx.wakeCursor + 1) % swimWakes.current.length;
          const tailOffset = 0.68 + freestyleAmt * 0.24;
          const lateralJitter = ((fx.wakeCursor % 2 === 0 ? 1 : -1) * 0.2) * freestyleAmt;
          slot.x = player.x - fwdX * tailOffset + rightX * lateralJitter;
          slot.z = player.z - fwdZ * tailOffset + rightZ * lateralJitter;
          slot.yaw = simState.playerYaw;
          slot.age = 0;
          slot.maxAge = boost ? 1.35 : 1.15;
          slot.baseScale = 0.36 + freestyleAmt * 0.18;
          slot.active = true;
        }
      }
      for (let i = 0; i < swimWakes.current.length; i++) {
        const w = swimWakes.current[i];
        const mesh = swimWakeRefs.current[i];
        if (!mesh) continue;
        if (!w.active) {
          mesh.visible = false;
          continue;
        }
        w.age += dt;
        if (w.age >= w.maxAge) {
          w.active = false;
          mesh.visible = false;
          continue;
        }
        anyActive = true;
        const life = w.age / w.maxAge;
        const wy = simState.tideOffset + getWaveHeight(w.x, w.z, t) + 0.028;
        mesh.visible = true;
        mesh.position.set(w.x, wy, w.z);
        mesh.rotation.set(-Math.PI / 2, 0, -w.yaw);
        const expand = w.baseScale + life * 0.82;
        mesh.scale.set(expand, expand * 1.25, 1);
        const mat = mesh.material as THREE.MeshBasicMaterial;
        mat.opacity = (1 - life) * (1 - life) * 0.105;
      }

      // 3. Fine sparkling sea-spray droplets from alternating hand entries & flutter kicks
      if (activeSwim) {
        fx.dropTimer -= dt;
        const isFast = swimSpd > 0.35;
        const dropInterval = isFast ? (boost ? 0.036 : 0.056) : 0.16;
        if (fx.dropTimer <= 0) {
          fx.dropTimer = dropInterval;
          const spawnCount = isFast ? (boost ? 3 : 2) : 1;
          for (let n = 0; n < spawnCount; n++) {
            const d = swimDroplets.current[fx.dropCursor];
            fx.dropCursor = (fx.dropCursor + 1) % swimDroplets.current.length;
            fx.handSide *= -1;
            const fromFeet = isFast && n === 1;
            const fwdOff = fromFeet ? -0.78 : isFast ? 0.52 : 0.22;
            const sideOff = fx.handSide * (fromFeet ? 0.16 : isFast ? 0.38 : 0.44);
            const spread = ((fx.dropCursor * 37) % 100) / 100 - 0.5;
            d.x = player.x + fwdX * fwdOff + rightX * (sideOff + spread * 0.14);
            d.z = player.z + fwdZ * fwdOff + rightZ * (sideOff + spread * 0.14);
            d.y = waterY + 0.05;
            const kickSpeed = isFast ? (boost ? 1.25 : 0.92) : 0.38;
            d.vx = rightX * fx.handSide * (0.55 + Math.abs(spread) * 0.75) * kickSpeed - fwdX * (fromFeet ? 1.15 : 0.38) * kickSpeed;
            d.vz = rightZ * fx.handSide * (0.55 + Math.abs(spread) * 0.75) * kickSpeed - fwdZ * (fromFeet ? 1.15 : 0.38) * kickSpeed;
            d.vy = (fromFeet ? 1.75 : isFast ? 2.05 : 1.05) * (0.72 + Math.abs(spread) * 0.55) * (boost ? 1.2 : 1);
            d.age = 0;
            d.maxAge = isFast ? 0.42 + Math.abs(spread) * 0.18 : 0.32;
            d.size = isFast ? (boost ? 0.026 : 0.021) : 0.015;
            d.active = true;
          }
        }
      }
      for (let i = 0; i < swimDroplets.current.length; i++) {
        const d = swimDroplets.current[i];
        const mesh = swimDropletRefs.current[i];
        if (!mesh) continue;
        if (!d.active) {
          mesh.visible = false;
          continue;
        }
        d.age += dt;
        if (d.age >= d.maxAge) {
          d.active = false;
          mesh.visible = false;
          continue;
        }
        anyActive = true;
        d.vy -= 9.8 * dt;
        d.x += d.vx * dt;
        d.y += d.vy * dt;
        d.z += d.vz * dt;
        const life = d.age / d.maxAge;
        mesh.visible = true;
        mesh.position.set(d.x, d.y, d.z);
        const s = d.size * (1.05 - life * 0.65);
        mesh.scale.set(s, s * (1.05 + Math.min(0.45, Math.abs(d.vy) * 0.14)), s);
        const mat = mesh.material as THREE.MeshStandardMaterial;
        mat.opacity = (1 - life) * 0.62;
      }

      swimFxGroupRef.current.visible = anyActive;
    }

    // 2. HERO SUPERCAR FLEET (FERRARI 458 / GT3 / WEDGE / MUSCLE / VIP LIMO + DRIFT + SNAPPY PHYSICS)
    if (simState.mode === 'CAR' && !isStartMenuOpen) {
      previous.copy(simState.carPos);
      const car = simState.carPos;
      const ride = suspension.current;
      const gridLocked = simState.gameMode === 'GRAND_PRIX' && simState.raceCountdown > 0;
      const supportBefore = walkingSurface(car, 0.48) + 0.085;
      const warped = Math.hypot(car.x - ride.x, car.z - ride.z) > 12 || !Number.isFinite(ride.support);
      if (gridLocked || warped) {
        Object.assign(ride, { support: supportBefore, offset: 0, velocity: 0, yawRate: 0,
          grounded: true, wet: false, slip: 0, boost: 0, lateral: 0, driftHeld: false, driftCharge: 0 });
        simState.carVel.y = 0;
      }
      const oldSpeed = simState.carSpeed;
      const depth = simState.tideOffset - supportBefore;
      const grip = THREE.MathUtils.lerp(1, 0.22, THREE.MathUtils.smoothstep(depth, 0.13, 1.42));
      const integrity = 0.49 + simState.carDamage.hp * 0.0051;
      const throttleInput = gridLocked ? 0 : Math.max(fwd, touchThrottle) - back;
      const inputSteer = left - right;
      const launchDrift = !gridLocked && !isMenuOpen && !simState.vehicleWrecked && ride.grounded &&
        grip > 0.78 && oldSpeed > 8.5 && (space && (Math.abs(inputSteer) > 0.1 || Math.abs(ride.slip) > 0.08) ||
        oldSpeed > 20 && Math.abs(inputSteer) > 0.9 && (brake || Math.abs(ride.slip) > 0.14));
      const steerScale = steeringPolarity(oldSpeed, throttleInput) *
        THREE.MathUtils.lerp(1, steerAssist ? 0.68 : 0.80, Math.min(1, Math.abs(oldSpeed) / 60));
      // Forza-style drift controller: kick tail cleanly into the turn, hold angle on counter-steer, never fight turn-in!
      const isCounterSteering = launchDrift && Math.abs(ride.slip) > 0.08 && Math.sign(inputSteer) === Math.sign(ride.slip);
      const driftTurnMult = launchDrift ? (isCounterSteering ? 0.62 : 1.52) : 1.0;
      const slipStabilize = !launchDrift ? THREE.MathUtils.clamp(-ride.slip * 0.32, -0.18, 0.18) : 0;
      const steer = gridLocked ? 0 : (inputSteer * driftTurnMult + slipStabilize) *
        2.75 * steerSens * steerScale * grip * (ride.grounded ? 1 : 0.21);
      ride.yawRate = THREE.MathUtils.damp(ride.yawRate, steer, launchDrift ? 12.5 : 17.5, dt);
      simState.carYaw += ride.yawRate * dt;
      const slip = rearSlip(oldSpeed, ride.lateral, ride.yawRate, launchDrift, grip, ride.grounded, dt);
      const maxLat = Math.max(4, Math.abs(oldSpeed) * Math.tan(0.66));
      ride.lateral = THREE.MathUtils.clamp(slip.lateral, -maxLat, maxLat);
      ride.slip = Math.atan2(ride.lateral, Math.max(1.5, Math.abs(oldSpeed)));
      const drifting = ride.grounded && oldSpeed > 8.5 && (launchDrift || Math.abs(ride.slip) > 0.14);
      isDrifting = drifting;
      tirePressure = drifting ? THREE.MathUtils.clamp((Math.abs(ride.slip) - 0.05) * 3.4, 0, 1) : 0;
      if (launchDrift) ride.driftCharge = Math.min(100, ride.driftCharge + tirePressure * oldSpeed * dt * 2.1);
      if (ride.driftHeld && !launchDrift) {
        if (ride.driftCharge >= 15 && throttleInput > 0.1 && !brake) {
          ride.boost = Math.max(ride.boost, 0.55 + ride.driftCharge * 0.013);
          soundEngine.playCoastal('chirp');
          simState.driftScore = Math.max(0, simState.driftScore - ride.driftCharge * 0.2);
        } else {
          simState.driftScore = Math.min(100, simState.driftScore + ride.driftCharge);
        }
        ride.driftCharge = 0;
      }
      ride.driftHeld = launchDrift;
      if (boost && !drifting && simState.driftScore >= 24 && ride.boost <= 0) {
        ride.boost = 0.55 + simState.driftScore * 0.013;
        soundEngine.playCoastal('chirp');
        simState.driftScore = 0;
      }
      ride.boost = Math.max(0, ride.boost - dt);
      const launchTorque = 1 + 0.42 * (1 - Math.min(1, Math.abs(oldSpeed) / 18));
      const driftDriveBonus = drifting && throttleInput > 0.1 ? 6.5 : 0;
      const power = ((simState.vehicleWrecked ? 15 : ride.boost > 0 ? 58 : boost ? 44 : 32) * launchTorque + driftDriveBonus) * integrity * throttleSens;
      const engine = power * throttleInput * (ride.grounded ? grip : 0.075);
      const handbrake = space && !launchDrift && ride.grounded;
      const braking = brake ? 44 : handbrake ? 37 : throttleInput * oldSpeed < 0 ? 50 : 0;
      let speed = oldSpeed + engine * dt;
      if (braking > 0) speed -= Math.sign(speed) * Math.min(Math.abs(speed), braking * dt);
      const loss = (throttleInput === 0 ? 0.24 : 0.15) + (drifting ? 0.055 : 0) + (1 - grip) * 2.1;
      speed *= Math.exp(-loss * dt);
      simState.carSpeed = gridLocked ? 0 : THREE.MathUtils.clamp(speed, -15,
        simState.vehicleWrecked ? 7.5 : (ride.boost > 0 ? 78 : boost ? 65 : 55) * (0.68 + integrity * 0.32));
      const impactSpeed = simState.carSpeed;
      const yaw = simState.carYaw;
      const flow = shoreReturn(car.x, car.z, yaw, 590, 870);
      car.x += (Math.sin(yaw) * impactSpeed + Math.cos(yaw) * ride.lateral + flow.x * (1 - grip) * 6.5) * dt;
      car.z += (Math.cos(yaw) * impactSpeed - Math.sin(yaw) * ride.lateral + flow.z * (1 - grip) * 6.5) * dt;
      applyWorldCollisions(car, previous, 'CAR');

      const ground = walkingSurface(car, 0.49) + 0.085;
      const wave = getWaveHeight(car.x, car.z, t) + simState.tideOffset;
      const afloat = wave - ground > 1.1 && simState.tideOffset - ground > 0.72;
      const support = afloat ? Math.max(ground, wave - 0.92) : ground;
      const step = surfaceStep(car.y, simState.carVel.y, support, ride.support, dt);
      car.y = step.y;
      simState.carVel.y = step.velocity;
      ride.support = support;
      ride.grounded = step.grounded;
      ride.x = car.x;
      ride.z = car.z;
      const wet = wave - ground > 0.23 && car.y < wave + 0.23;
      ride.splash -= dt;
      if (wet && (!ride.wet || ride.splash < 0 && Math.abs(speed) > 3.8)) {
        const intensity = THREE.MathUtils.clamp(Math.abs(speed) * 0.054 + step.impact * 0.04, 0.22, 1.7);
        emitEnvironment('water', car.clone().setY(wave), intensity, Math.sin(yaw) * speed, Math.cos(yaw) * speed);
        if (!ride.wet || step.impact > 3) soundEngine.playSurface('water', intensity);
        ride.splash = 0.16;
      }
      ride.wet = wet;
      if (step.impact > 3.1 && !gridLocked) {
        const energy = Math.min(1.9, step.impact * 0.1);
        ride.velocity -= Math.min(step.impact * 0.46, 3.5);
        simState.cameraShake = Math.max(simState.cameraShake, Math.min(0.6, energy * 0.52));
        soundEngine.playSurface('landing', energy);
        if (!wet) emitEnvironment('gravel', car, energy, Math.sin(yaw) * speed, Math.cos(yaw) * speed);
        if (step.impact > 16 && !wet) {
          registerVehicleImpact(step.impact - 4, car, { point: car.clone(), normal: UP, distance: 0 });
        }
      }
      const spring = suspensionStep(ride.offset, ride.velocity, dt);
      const accelLong = (speed - oldSpeed) / Math.max(dt, 0.001);
      const chassis = computeChassisWeightTransfer(accelLong, ride.yawRate, speed, ride.slip, step.grounded);
      ride.offset = spring.offset + chassis.aeroDrop;
      ride.velocity = spring.velocity;
      const gradePitch = Math.atan2(step.velocity, Math.max(8, Math.abs(speed))) * (speed >= 0 ? -1 : 1);
      ride.pitch = THREE.MathUtils.damp(
        ride.pitch,
        THREE.MathUtils.clamp(gradePitch + chassis.squatPitch, -0.48, 0.35),
        11,
        dt
      );
      ride.roll = THREE.MathUtils.damp(ride.roll, chassis.cornerRoll, 11.5, dt);

      if (!isMenuOpen && ride.grounded && !wet && tirePressure > 0.22) {
        const smoke = t >= ride.tireEffectAt;
        if (smoke) ride.tireEffectAt = t + 0.051;
        for (const [index, side] of [-1, 1].entries()) {
          const x = car.x - Math.sin(yaw) * 1.42 + Math.cos(yaw) * side * 0.88;
          const z = car.z - Math.cos(yaw) * 1.42 - Math.sin(yaw) * side * 0.88;
          const patch = new THREE.Vector3(x, getTravelHeight(x, z, car.y + 0.3), z);
          const previousMark = rearTracks.current[index];
          if (previousMark.y > 0.1) queueSkid(previousMark, patch);
          previousMark.copy(patch);
          if (smoke) {
            patch.y += 0.18;
            emitEnvironment('tire', patch, 0.46 + tirePressure, -Math.sin(yaw) * 10, -Math.cos(yaw) * 10);
            if (tirePressure > 0.82 && brake && index === 1) emitEnvironment('impact', patch, 0.18);
          }
        }
      } else rearTracks.current.forEach((track) => { track.y = -20; });

      const sweep = simState.carSweep;
      sweep.start.copy(previous);
      sweep.end.copy(simState.carPos);
      sweep.speed = !isMenuOpen && !gridLocked ? impactSpeed : 0;
      sweep.yaw = simState.carYaw;
      sweep.travel = Math.hypot(sweep.end.x - sweep.start.x, sweep.end.z - sweep.start.z);
      sweep.tick++;

      simState.playerPos.set(
        simState.carPos.x + Math.cos(simState.carYaw) * 5.2,
        simState.carPos.y,
        simState.carPos.z - Math.sin(simState.carYaw) * 5.2
      );
      speedKmh = Math.round(Math.abs(simState.carSpeed) * 3.2);
      activePos = simState.carPos;
      activeYaw = simState.carYaw;
    }

    // 3. 6-VESSEL MARITIME & CRUISE LINER FLEET (4-POINT ARCHIMEDES GERSTNER WAVE BUOYANCY + PLANING HYDRODYNAMICS)
    if (simState.mode === 'BOAT' && !isStartMenuOpen) {
      previous.copy(simState.boatPos);
      const marineThrottle = Math.max(fwd, touchThrottle) - back;
      const accel = marineThrottle * (simState.vehicleWrecked ? 14 : boost ? 68 : 44) * throttleSens;
      simState.boatSpeed += (brake || space ? 0 : accel) * dt;
      if (brake || space) simState.boatSpeed = THREE.MathUtils.damp(simState.boatSpeed, 0, 5.5, dt);
      else if (marineThrottle * simState.boatSpeed < 0) simState.boatSpeed += marineThrottle * 60 * dt;
      simState.boatSpeed *= Math.pow(simState.vehicleWrecked ? 0.2 : 0.32, dt);
      const hydroActive = coastalPlay && now < simState.coastal.hydroUntil;
      const maxSpeed = simState.vehicleWrecked ? 6 : hydroActive ? 74 : boost ? 57 : 40;
      simState.boatSpeed = THREE.MathUtils.clamp(simState.boatSpeed, simState.vehicleWrecked ? -6 : -15, maxSpeed);
      const boatTurnAuthority = 0.42 + 0.58 * Math.min(1, Math.abs(simState.boatSpeed) / 10);
      const steerDirection = simState.boatSpeed < -0.2 ? -1 : 1;
      simState.boatYaw += (left - right) * 2.4 * boatTurnAuthority * steerSens * dt * steerDirection;

      const prevX = simState.boatPos.x;
      const prevZ = simState.boatPos.z;
      const nextX = prevX + Math.sin(simState.boatYaw) * simState.boatSpeed * dt;
      const nextZ = prevZ + Math.cos(simState.boatYaw) * simState.boatSpeed * dt;
      const nextGround = getTerrainHeight(nextX, nextZ);

      const rampBefore = marineRampHeight(prevX, prevZ);
      const rampAhead = marineRampHeight(nextX, nextZ);
      const aboveGround = simState.boatPos.y > nextGround + 0.8;
      if (nextGround > simState.tideOffset + 0.25 && rampAhead === undefined && !aboveGround) {
        const impactSpeed = Math.abs(simState.boatSpeed);
        const slideXGround = getTerrainHeight(nextX, prevZ);
        const slideZGround = getTerrainHeight(prevX, nextZ);
        if (slideXGround <= 0.25) {
          simState.boatPos.x = nextX;
          simState.boatSpeed *= 0.72;
        } else if (slideZGround <= 0.25) {
          simState.boatPos.z = nextZ;
          simState.boatSpeed *= 0.72;
        } else {
          simState.boatSpeed *= -0.35;
        }
        if (impactSpeed > 8) {
          registerVehicleImpact(impactSpeed, simState.boatPos);
        }
      } else {
        simState.boatPos.x = nextX;
        simState.boatPos.z = nextZ;
      }

      applyWorldCollisions(simState.boatPos, previous, 'BOAT');
      const isCruise = activeBoatIdxRef.current === 1;
      const hullWave = sampleHullBuoyancy(
        simState.boatPos.x,
        simState.boatPos.z,
        simState.boatYaw,
        isCruise ? 9.5 : 3.2,
        isCruise ? 2.6 : 1.15,
        t
      );
      const planingLift = isCruise ? 0 : Math.min(0.18, Math.max(0, simState.boatSpeed) * 0.006);
      const waveY = hullWave.heave + simState.tideOffset + planingLift;
      const terrainY = getTerrainHeight(simState.boatPos.x, simState.boatPos.z);
      const afloatY = Math.max(waveY + 0.15, terrainY + 0.15);
      const ramp = marineRampHeight(simState.boatPos.x, simState.boatPos.z);
      if (ramp !== undefined && previous.y <= Math.max(afloatY, ramp + 0.85)) {
        simState.boatOnRamp = true;
        simState.boatAirVelocity = Math.max(0, (ramp - (rampBefore ?? ramp)) / dt);
        simState.boatPos.y = Math.max(afloatY, ramp + 0.35);
      } else {
        simState.boatOnRamp = false;
        if (previous.y > afloatY + 0.15 || simState.boatAirVelocity > 0) {
          simState.boatAirVelocity -= 18 * dt;
          simState.boatPos.y = Math.max(afloatY, previous.y + simState.boatAirVelocity * dt);
          if (simState.boatPos.y === afloatY && simState.boatAirVelocity < -2) {
            emitEnvironment('water', simState.boatPos, 0.85);
            soundEngine.playSurface('water', 0.75);
          }
        } else simState.boatPos.y = afloatY;
        if (simState.boatPos.y <= afloatY) simState.boatAirVelocity = 0;
      }
      if (coastalPlay && !hydroActive && !simState.vehicleWrecked) {
        const ring = HYDRO_RINGS.findIndex((gate) => crossesHydroRing(gate, previous, simState.boatPos));
        if (ring >= 0) {
          simState.boatSpeed = Math.min(74, Math.max(28, Math.abs(simState.boatSpeed) + 19)) *
            (simState.boatSpeed < 0 ? -1 : 1);
          hydroBoost(ring, simState.boatPos, simState.boatYaw + (simState.boatSpeed < 0 ? Math.PI : 0));
        }
      }

      const current = shoreReturn(simState.boatPos.x, simState.boatPos.z, simState.boatYaw, 980, 1320);
      const af = simState.boatSpeed >= 0 ? 1 : -1;
      simState.boatYaw += current.turn * (0.57 + Math.min(1.2, Math.abs(simState.boatSpeed) / 23)) * dt * af;
      simState.boatPos.x += current.x * 10.5 * dt;
      simState.boatPos.z += current.z * 10.5 * dt;
      simState.playerPos.copy(simState.boatPos);
      speedKmh = Math.round(Math.abs(simState.boatSpeed) * 3.0);
      activePos = simState.boatPos;
      activeYaw = simState.boatYaw;
    }

    // 4. 6-AIRCRAFT AVIATION FLEET (6-DOF FLIGHT + RIGID TOWER & TERRAIN IMPACT)
    if (simState.mode === 'PLANE' && !isMenuOpen) {
      const plane = simState.planePos;
      previous.copy(plane);
      const helicopter = simState.activePlaneIdx === 1;
      const trim = THREE.MathUtils.clamp((flyDamage.right - flyDamage.left) / 65, -1, 1);
      const failing = flyDamage.state === 'failing' || flyDamage.state === 'burning';
      const wrecked = flyDamage.state === 'wrecked';
      const pad = Math.max(walkingSurface(plane, 0.67), simState.tideOffset + 0.18) + 0.25;
      const onPad = plane.y <= pad + 0.10 && simState.planeVel.y <= 0.45;
      const pitchInput = (fwd - back) * (invertFlightY ? -1 : 1);
      const turn = (left - right) * steerSens;
      const trimPull = failing ? trim * 0.38 + Math.sin(t * 8) * 0.065 : 0;
      const power = 0.32 + flyDamage.hull * 0.0068;
      const throttleDelta = isMenuOpen ? 0 : aircraftPowerInput(boost || keys.has('KeyI'), brake || keys.has('KeyK'));
      simState.planeThrottle = THREE.MathUtils.clamp(simState.planeThrottle + throttleDelta * dt * 0.54, 0, 1);
      const wind = shoreReturn(plane.x, plane.z, simState.planeYaw, 1150, 1650);
      const bankCommand = THREE.MathUtils.clamp(turn + wind.turn * 2.4 + trimPull, -1, 1);

      if (!wrecked) {
        if (helicopter) {
          const cyclic = (Math.max(fwd, touchThrottle) - back) * throttleSens;
          const collective = space ? 1 : throttleDelta;
          const forward = cyclic * power * (boost ? 39 : 28);
          simState.planePitch = THREE.MathUtils.damp(simState.planePitch, -cyclic * 0.29, 4.5, dt);
          simState.planeRoll = THREE.MathUtils.damp(simState.planeRoll, bankCommand * 0.26, 4.8, dt);
          simState.planeYaw += (bankCommand * (onPad ? 0.84 : 1.39) + trimPull * 0.15) * dt;
          const yaw = simState.planeYaw;
          const sideways = Math.sin(simState.planeRoll) * 6 +
            hoverStrafe(!isMenuOpen && keys.has('KeyQ'), !isMenuOpen && keys.has('KeyE'), power);
          simState.planeVel.x = THREE.MathUtils.damp(simState.planeVel.x, Math.sin(yaw) * forward + Math.cos(yaw) * sideways, 2.35, dt);
          simState.planeVel.z = THREE.MathUtils.damp(simState.planeVel.z, Math.cos(yaw) * forward - Math.sin(yaw) * sideways, 2.35, dt);
          simState.planeSpeed = Math.hypot(simState.planeVel.x, simState.planeVel.z);
          const tiltLoss = (Math.abs(simState.planePitch) * 1.7 + Math.abs(simState.planeRoll) * 0.65) * (steerAssist ? 0.16 : 0.65);
          simState.planeVel.y = THREE.MathUtils.damp(simState.planeVel.y,
            collective * (collective > 0 ? 10.5 : 6.2) * power - tiltLoss - (failing ? 2.75 : 0), 3.5, dt);
        } else {
          const step = fixedWingStep({
            dt, speed: simState.planeSpeed, pitch: simState.planePitch, bank: simState.planeRoll,
            verticalSpeed: simState.planeVel.y, throttle: Math.max(simState.planeThrottle, touchThrottle, boost ? 0.88 : 0),
            pitchCommand: THREE.MathUtils.clamp(pitchInput + (space ? 0.58 : 0), -1, 1), bankCommand,
            takeoffPower: Math.max(fwd, touchThrottle, space ? 0.83 : 0, (simState.planeThrottle - 0.56) * 2.28),
            grounded: onPad, brake, boost, autoLevel: steerAssist, integrity: flyDamage.hull,
            wingHealth: (flyDamage.left + flyDamage.right) / 200,
            thrustSensitivity: throttleSens, steeringSensitivity: steerSens, failing,
          });
          simState.planeSpeed = step.speed;
          simState.planePitch = step.pitch;
          simState.planeRoll = step.bank;
          simState.planeVel.y = step.verticalSpeed;
          simState.planeYaw += step.yawRate * dt;
        }
      } else if (!flyDamage.settled) {
        simState.planePitch = THREE.MathUtils.damp(simState.planePitch, -0.52, 1.85, dt);
        simState.planeRoll = THREE.MathUtils.damp(simState.planeRoll, Math.sign(trim || 1) * 0.73 + Math.sin(t * 6) * 0.13, 2.1, dt);
        simState.planeYaw += (trim * 0.5 + 0.12) * dt;
        simState.planeVel.y = Math.max(-56, simState.planeVel.y - dt * 15);
        simState.planeSpeed = THREE.MathUtils.damp(simState.planeSpeed, 27, 0.75, dt);
      } else {
        simState.planeVel.y = 0;
        simState.planeSpeed = THREE.MathUtils.damp(simState.planeSpeed, 0, 2.8, dt);
        if (simState.planeSpeed < 0.25) simState.planeSpeed = 0;
        simState.planePitch = THREE.MathUtils.damp(simState.planePitch, -0.13, 5.5, dt);
        simState.planeRoll = THREE.MathUtils.damp(simState.planeRoll, Math.sign(trim || 1) * 0.22, 5.5, dt);
      }

      if (!helicopter || wrecked) {
        simState.planeVel.x = Math.sin(simState.planeYaw) * simState.planeSpeed;
        simState.planeVel.z = Math.cos(simState.planeYaw) * simState.planeSpeed;
      }
      plane.x += (simState.planeVel.x + wind.x * 17) * dt;
      plane.z += (simState.planeVel.z + wind.z * 17) * dt;
      plane.y += simState.planeVel.y * dt;
      applyWorldCollisions(plane, previous, 'PLANE');

      const terrain = Math.max(getTravelHeight(plane.x, plane.z, previous.y), simState.tideOffset + 0.18);
      const groundY = Math.max(terrain, walkingSurface(plane, 0.68)) + 0.25;
      if (plane.y <= groundY) {
        const descent = -simState.planeVel.y;
        if (!onPad && descent > 0.9 && !flyDamage.settled) {
          const intensity = Math.min(1.7, 0.21 + descent / 9);
          emitEnvironment(terrain <= simState.tideOffset + 0.24 ? 'water' : 'dust', plane.clone().setY(groundY), intensity);
          soundEngine.playSurface('landing', intensity * 0.64);
          simState.cameraShake = Math.max(simState.cameraShake, Math.min(0.62, intensity * 0.31));
        }
        const point = new THREE.Vector3(plane.x, groundY - 0.25, plane.z);
        if (descent > 5.3 && !flyDamage.settled) {
          if (wrecked) {
            damageWorld({ point, normal: UP, distance: 0 }, 115);
            blastWorld(point, 6, 62);
            simState.cameraShake = 1.2;
            simState.crashFlashTimer = 0.45;
            soundEngine.playCrash(1);
          } else {
            const groundHit = traceWorld(plane.clone().addScaledVector(UP, 1.3), DOWN, 2);
            registerVehicleImpact(descent + Math.abs(simState.planeSpeed) * 0.36, point,
              groundHit ?? { point, normal: UP, distance: 0 });
          }
          simState.planeSpeed *= 0.52;
        }
        if (flyDamage.state === 'wrecked' && !flyDamage.settled) {
          flyDamage.settled = true;
        }
        plane.y = groundY;
        simState.planeVel.y = Math.max(0, simState.planeVel.y);
        if (!wrecked && !helicopter) simState.planePitch = Math.max(-0.025, simState.planePitch);
      }

      if (plane.y > 250 && !wrecked) {
        const thinningAir = THREE.MathUtils.smoothstep(plane.y, 250, 355);
        simState.planeVel.y -= 16 * thinningAir * dt;
        simState.planePitch = THREE.MathUtils.damp(simState.planePitch, -0.16, thinningAir * 1.45, dt);
      }

      simState.playerPos.copy(simState.planePos);
      speedKmh = Math.round(simState.planeSpeed * 3.6);
      activePos = simState.planePos;
      activeYaw = simState.planeYaw;
    }

    if (simState.vehicleHp < 100 && (simState.mode === 'CAR' || simState.mode === 'PLANE') && speedKmh < 36 &&
        REPAIR_BAY_COORDS.some(([x, z]) => Math.hypot(activePos.x - x, activePos.z - z) < 6.3 &&
          activePos.y < getTerrainHeight(x, z) + 4.2)) {
      repairVehicle();
    }

    // 5. GRAND PRIX TIME-TRIAL LOOP & CHECKPOINT TELEMETRY
    if (simState.gameMode === 'GRAND_PRIX' && !simState.startMenuOpen) {
      if (simState.raceCountdown > 0) {
        simState.raceCountdown = Math.max(0, simState.raceCountdown - dt);
      } else {
        simState.lapTime += dt;
        simState.raceElapsed += dt;
      }
    }
    const currentGate = simState.checkpoints[simState.activeCheckpoint];
    if (currentGate && simState.mode === 'CAR' && simState.gameMode === 'GRAND_PRIX' && !simState.startMenuOpen && simState.raceCountdown === 0) {
      if (simState.carSpeed > 2 && crossesRaceGate(currentGate, simState.carSweep.start, activePos)) {
        const sector = simState.activeCheckpoint;
        simState.sectorTimes[sector] = simState.lapTime;
        simState.activeCheckpoint = (simState.activeCheckpoint + 1) % simState.checkpoints.length;
        simState.chips += Math.round(250 * simState.multiplier);
        soundEngine.playChipPickup(true);

        if (simState.activeCheckpoint === 0) {
          simState.lapCount += 1;
          if (simState.bestLapTime === null || simState.lapTime < simState.bestLapTime) {
            simState.bestLapTime = simState.lapTime;
            simState.bestSectors = simState.sectorTimes.slice();
          }
          simState.lapTime = 0;
        }
      }
    }

    // Sync Meshes & Vehicle Articulation
    if (playerRef.current) {
      playerRef.current.visible = isStartMenuOpen || simState.mode === 'FOOT' && simState.cameraView !== 1;
      if (!isStartMenuOpen) {
        playerRef.current.position.copy(simState.playerPos);
        playerRef.current.rotation.y = simState.playerYaw;
      }
    }
    if (gliderRef.current) {
      gliderRef.current.visible = simState.mode === 'FOOT' && simState.gliding && !simState.parachuting;
    }
    if (parachuteRef.current) {
      parachuteRef.current.visible = simState.mode === 'FOOT' && simState.parachuting;
    }

    // Sync Active 3D Weapon Visibility & Recoil Kickback (also show in Lobby when inspecting Arsenal or Battle Royale)
    const recoilOffset = -Math.max(0, simState.firingTimer - 0.16) * 1.1;
    const showLobbyWeapon =
      isStartMenuOpen &&
      (simState.gameMode === 'BATTLE_ROYALE' ||
        simState.lobbyFocus === 'ARSENAL' ||
        simState.lobbyTab === 'ARSENAL');
    if (weaponMountRef.current) {
      weaponMountRef.current.visible =
        showLobbyWeapon ||
        (!isStartMenuOpen &&
          !construction.pickaxe &&
          !construction.active &&
          !isCustomizerOpen &&
          !footMotion.current.swim &&
          !simState.gliding &&
          !simState.parachuting &&
          (aiming.ads ||
            mouseOrbitRef.current !== null ||
            simState.firingTimer > 0 ||
            simState.gameMode === 'BATTLE_ROYALE'));
      weaponMountRef.current.position.set(-0.13, 1.23, 0.42 + (isStartMenuOpen ? 0 : recoilOffset));
      weaponMountRef.current.rotation.x = isStartMenuOpen ? 0 : simState.orbitPitch * 0.45;
    }
    if (carWeaponMountRef.current) {
      carWeaponMountRef.current.visible =
        !isStartMenuOpen &&
        simState.mode === 'CAR' &&
        (simState.firingTimer > 0 || simState.gameMode === 'BATTLE_ROYALE');
      carWeaponMountRef.current.position.set(0, 1.38, 0.15 + recoilOffset);
    }
    weaponMeshesRef.current.forEach((m, idx) => {
      if (m) m.visible = idx === simState.activeWeaponIdx;
    });
    carWeaponMeshesRef.current.forEach((m, idx) => {
      if (m) m.visible = idx === simState.activeWeaponIdx;
    });

    // Ballistic Laser/Tracer Bolt, Muzzle Flash Star & Impact Blast Sphere
    const isFiringNow = simState.firingTimer > 0 && !isStartMenuOpen;
    const activeWeaponSpec = WEAPON_SPECS[simState.activeWeaponIdx] ?? WEAPON_SPECS[0];
    if (tracerMeshRef.current && muzzleFlashRef.current && impactMeshRef.current) {
      tracerMeshRef.current.visible = isFiringNow;
      muzzleFlashRef.current.visible = isFiringNow;
      impactMeshRef.current.visible = isFiringNow && aiming.impact;

      if (isFiringNow) {
        const fromV = new THREE.Vector3(...simState.lastShotFrom);
        const toV = new THREE.Vector3(...simState.lastShotTo);
        const diff = new THREE.Vector3().subVectors(toV, fromV);
        const len = Math.max(0.1, diff.length());
        const mid = new THREE.Vector3().addVectors(fromV, toV).multiplyScalar(0.5);

        tracerMeshRef.current.position.copy(mid);
        tracerMeshRef.current.scale.set(1, len, 1);
        const dirNorm = diff.clone().normalize();
        tracerMeshRef.current.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dirNorm);

        muzzleFlashRef.current.position.copy(fromV);
        muzzleFlashRef.current.rotation.z = t * 42;
        const flashScale = (simState.cameraView === 1 ? 0.45 : 0.8) + (simState.firingTimer / 0.13) * 0.45;
        muzzleFlashRef.current.scale.setScalar(flashScale);

        impactMeshRef.current.position.copy(toV);
        const impactBase = activeWeaponSpec.id === 'RPG' ? 1.8 : 0.45;
        impactMeshRef.current.scale.setScalar(impactBase + (1 - simState.firingTimer / 0.13) * impactBase);

        if (tracerMatRef.current) {
          tracerMatRef.current.color.set(activeWeaponSpec.color);
          tracerMatRef.current.emissive.set(activeWeaponSpec.color);
        }
        if (muzzleFlashMatRef.current) {
          muzzleFlashMatRef.current.emissive.set(activeWeaponSpec.color);
        }
        if (impactMatRef.current) {
          impactMatRef.current.color.set(activeWeaponSpec.color);
          impactMatRef.current.emissive.set(activeWeaponSpec.color);
        }
      }
    }

    if (carRef.current && !isStartMenuOpen) {
      carRef.current.visible = !isCustomizerOpen && (simState.mode !== 'CAR' || simState.cameraView !== 1);
      carRef.current.position.copy(simState.carPos);
      const ride = suspension.current;
      carRef.current.position.y += ride.offset;
      carRef.current.rotation.set(ride.pitch, simState.carYaw, ride.roll, 'YXZ');
    }

    // Active GLB Hero Car Wheel Spin, Front Wheel Steering & Steering Wheel Articulation
    const targetWheelSteer = !isStartMenuOpen && simState.mode === 'CAR' ? (left - right) * 0.38 + (isDrifting ? suspension.current.slip * 0.57 : 0) : 0;
    const activeRig = carRigsRef.current[activeCarIdxRef.current];
    if (activeRig) {
      for (const sNode of activeRig.steerNodes) {
        sNode.rotation.y = THREE.MathUtils.lerp(sNode.rotation.y, targetWheelSteer, Math.min(1, 14 * dt));
      }
      if (!isStartMenuOpen) {
        for (const wNode of activeRig.wheels) {
          wNode.rotation.x += simState.carSpeed * dt * 2.6 * activeRig.spinSign;
        }
      }
      if (activeRig.steeringWheel) {
        activeRig.steeringWheel.rotation.z = THREE.MathUtils.lerp(
          activeRig.steeringWheel.rotation.z,
          -targetWheelSteer * 2.2,
          Math.min(1, 14 * dt)
        );
      }
      if (activeRig.brakeMat) {
        activeRig.brakeMat.emissiveIntensity = !isStartMenuOpen && simState.mode === 'CAR' && back > 0 ? 4.8 : 1.8;
      }
    }

    // Supercar Brake Lights & Dual Nitrous Boost Flames
    if (taillightMatRef.current) {
      taillightMatRef.current.emissiveIntensity = !isStartMenuOpen && simState.mode === 'CAR' && back > 0 ? 4.8 : 1.8;
    }
    const showBoostFlames = !isStartMenuOpen && simState.mode === 'CAR' && (boost || suspension.current.boost > 0 || simState.roulette === 'RED');
    const flamePulse = 0.85 + Math.sin(t * 48) * 0.35;
    if (boostFlameLeftRef.current) {
      boostFlameLeftRef.current.visible = showBoostFlames;
      boostFlameLeftRef.current.scale.set(1, flamePulse, 1);
    }
    if (boostFlameRightRef.current) {
      boostFlameRightRef.current.visible = showBoostFlames;
      boostFlameRightRef.current.scale.set(1, 0.85 + Math.cos(t * 48) * 0.35, 1);
    }

    // Pooled Tire Smoke Puffs (6 meshes behind rear wheels when drifting or boosting)
    const showTireSmoke = !isStartMenuOpen && simState.mode === 'CAR' && (isDrifting || (boost && Math.abs(simState.carSpeed) > 10));
    for (let i = 0; i < 6; i++) {
      const puff = smokeMeshRefs.current[i];
      if (!puff) continue;
      if (!showTireSmoke) {
        puff.visible = false;
        continue;
      }
      puff.visible = true;
      smokeAngles.current[i] = (smokeAngles.current[i] + dt * 3.4) % 1;
      const life = smokeAngles.current[i];
      const sideSign = i % 2 === 0 ? -0.95 : 0.95;
      puff.position.set(
        sideSign + Math.sin(t * 8 + i) * 0.22 * life,
        0.22 + life * 0.65,
        -1.65 - life * 2.4
      );
      const sScale = 0.28 + life * 0.85;
      puff.scale.setScalar(sScale);
      const mat = puff.material as THREE.MeshStandardMaterial;
      mat.opacity = (1 - life) * (isDrifting ? 0.55 : 0.32);
    }

    // 3D Engine Hood Damage Smoke & Fire Plume on carRef
    const showHoodSmoke = !isStartMenuOpen && simState.carDamage.hp < 65;
    const damageRatio = Math.max(0, Math.min(1, (65 - simState.carDamage.hp) / 65));
    for (let i = 0; i < 4; i++) {
      const puff = damageSmokeRefs.current[i];
      if (!puff) continue;
      if (!showHoodSmoke) {
        puff.visible = false;
        continue;
      }
      puff.visible = true;
      const phase = (t * (1.2 + damageRatio * 1.1) + i * 0.25) % 1;
      const maxHeight = 0.85 + damageRatio * 1.45;
      puff.position.set(
        Math.sin(t * 4.5 + i * 1.7) * 0.18 * (0.4 + phase),
        phase * maxHeight,
        -phase * (0.35 + Math.min(0.9, Math.abs(simState.carSpeed) * 0.04))
      );
      puff.scale.setScalar(0.35 + phase * (0.75 + damageRatio * 0.65));
      const mat = puff.material as THREE.MeshStandardMaterial;
      const shade = Math.round(140 - damageRatio * 115);
      mat.color.setRGB(shade / 255, shade / 255, shade / 255);
      mat.opacity = (1 - phase) * (0.38 + damageRatio * 0.42);
    }

    const showHoodFire = !isStartMenuOpen && simState.carDamage.hp < 32;
    for (let i = 0; i < 2; i++) {
      const flame = damageFireRefs.current[i];
      if (!flame) continue;
      flame.visible = showHoodFire;
      if (showHoodFire) {
        const flicker = 0.78 + Math.sin(t * (38 + i * 13) + i * 2.1) * 0.32;
        flame.scale.set(0.85 + Math.cos(t * 29 + i) * 0.18, flicker, 0.85 + Math.sin(t * 31 + i) * 0.18);
        flame.rotation.y = t * (i === 0 ? 7 : -9);
      }
    }

    // 3D Impact Spark Burst at simState.lastCrashPos
    if (crashSparksGroupRef.current) {
      const sparksActive = sparkTimerRef.current > 0;
      crashSparksGroupRef.current.visible = sparksActive;
      if (sparksActive) {
        crashSparksGroupRef.current.position.set(
          simState.lastCrashPos[0],
          simState.lastCrashPos[1],
          simState.lastCrashPos[2]
        );
        const progress = 1 - sparkTimerRef.current / 0.35;
        for (let i = 0; i < 8; i++) {
          const sp = crashSparkMeshRefs.current[i];
          if (!sp) continue;
          const angle = (i / 8) * Math.PI * 2 + 0.35;
          const elev = 0.25 + (i % 3) * 0.32;
          const radius = 0.4 + progress * 3.8;
          sp.position.set(
            Math.cos(angle) * radius,
            Math.sin(elev) * radius - progress * progress * 1.4,
            Math.sin(angle) * radius
          );
          sp.rotation.set(elev, -angle, 0);
          const s = Math.max(0.05, 1.1 - progress * 0.95);
          sp.scale.set(s, s, s * (1.2 + progress * 0.8));
        }
      }
    }

    if (boatRef.current && !isStartMenuOpen) {
      boatRef.current.scale.setScalar(1);
      boatRef.current.position.copy(simState.boatPos);
      const isCruise = activeBoatIdxRef.current === 1;
      const hullWave = sampleHullBuoyancy(
        simState.boatPos.x,
        simState.boatPos.z,
        simState.boatYaw,
        isCruise ? 9.5 : 3.2,
        isCruise ? 2.6 : 1.15,
        t
      );
      const turnHeel = simState.mode === 'BOAT' && !isCruise
        ? (left - right) * THREE.MathUtils.clamp(simState.boatSpeed / 14, -1, 1) * 0.14
        : 0;
      const bowLift = simState.mode === 'BOAT' && !isCruise
        ? -Math.min(0.11, Math.max(-0.04, simState.boatSpeed * 0.0028))
        : 0;
      boatRef.current.rotation.set(
        hullWave.pitch * (isCruise ? 0.55 : 0.92) + bowLift -
          (simState.mode === 'BOAT' ? THREE.MathUtils.clamp(simState.boatAirVelocity * 0.029, -0.28, 0.46) : 0),
        simState.boatYaw,
        THREE.MathUtils.damp(boatRef.current.rotation.z, hullWave.roll * (isCruise ? 0.55 : 0.92) + turnHeel, 7.5, dt)
      );
    }
    // Spin propellers / submarine thrusters across all 6 Boat Fleet rigs
    const boatSpinRate = dt * (isStartMenuOpen ? 1.8 : 4.0 + Math.abs(simState.boatSpeed) * 1.6);
    boatRigsRef.current.forEach((rig) => {
      if (!rig) return;
      for (const node of rig.spinNodesZ) {
        node.rotation.z += boatSpinRate;
      }
    });

    if (boatSprayRef.current) {
      const boatSpdRatio = isStartMenuOpen ? 0 : Math.min(1.4, Math.abs(simState.boatSpeed) / 22);
      boatSprayRef.current.visible = boatSpdRatio > 0.08;
      boatSprayRef.current.scale.set(
        0.8 + boatSpdRatio * 0.55,
        0.6 + boatSpdRatio * (0.75 + Math.sin(t * 18) * 0.18),
        0.8 + boatSpdRatio * 0.65
      );
    }

    if (planeRef.current && !isStartMenuOpen) {
      planeRef.current.scale.setScalar(1);
      planeRef.current.position.copy(simState.planePos);
      planeRef.current.rotation.order = 'YXZ';
      planeRef.current.rotation.set(-simState.planePitch, simState.planeYaw, -simState.planeRoll);
    }
    // Spin helicopter main/tail rotors, fighter propellers, turboprops & airliner turbofans across all 6 Aircraft rigs
    const planeSpinRate = dt * (isStartMenuOpen ? 4.2 : simState.aircraftDamage.settled ? 0.5 : simState.mode === 'PLANE' ? 8 + simState.aircraftDamage.hull * 0.2 : 8);
    planeRigsRef.current.forEach((rig) => {
      if (!rig) return;
      if (rig.rotorMain) rig.rotorMain.rotation.y += planeSpinRate;
      if (rig.rotorTail) rig.rotorTail.rotation.x += planeSpinRate * 1.35;
      for (const node of rig.spinNodesZ) {
        node.rotation.z += planeSpinRate;
      }
    });

    if (propRef.current) {
      propRef.current.rotation.z += dt * (!isStartMenuOpen && simState.mode === 'PLANE' ? 35 : 4);
      const jetBoostScale = !isStartMenuOpen && simState.mode === 'PLANE' ? 0.9 + Math.sin(t * 42) * 0.25 : 0.4;
      propRef.current.scale.set(1, jetBoostScale, 1);
    }
    const contrailScale = simState.mode === 'PLANE' ? Math.max(0.3, simState.planeSpeed / 36) : 0.15;
    if (contrailLeftRef.current) {
      contrailLeftRef.current.visible = !isStartMenuOpen && simState.mode === 'PLANE' && simState.aircraftDamage.state === 'sound';
      contrailLeftRef.current.scale.set(1, 1, contrailScale * (1 + Math.sin(t * 24) * 0.08));
    }
    if (contrailRightRef.current) {
      contrailRightRef.current.visible = !isStartMenuOpen && simState.mode === 'PLANE' && simState.aircraftDamage.state === 'sound';
      contrailRightRef.current.scale.set(1, 1, contrailScale * (1 + Math.cos(t * 24) * 0.08));
    }

    // Chip & Aerial Ring Collection (skip while on Lobby start menu)
    if (!isStartMenuOpen) {
      for (const c of simState.chipNodes) {
        if (c.collected) continue;
        const d = activePos.distanceTo(new THREE.Vector3(...c.position));
        if (d < (c.isAerial ? 9.5 : 5.0)) {
          c.collected = true;
          simState.chips += Math.round(c.value * simState.multiplier);
          soundEngine.playChipPickup(c.isAerial);
        }
      }

      // Battle Royale Loot Crate & Ammo Box Pickup
      for (const crate of simState.lootCrates) {
        if (crate.opened) continue;
        const distCrate = Math.hypot(activePos.x - crate.position[0], activePos.z - crate.position[2]);
        if (distCrate < 4.2 && activePos.y < 14) {
          crate.opened = true;
          simState.playerShield = 100;
          simState.playerHp = 100;
          simState.ammo = simState.maxAmmo;
          simState.chips += Math.round(250 * simState.multiplier);
          soundEngine.playChipPickup(true);
        }
      }
    }

    soundEngine.updateTires(isMenuOpen ? 0 : tirePressure, Math.abs(simState.carSpeed));
    soundEngine.updateEngine(isStartMenuOpen ? 'FOOT' : simState.mode, speedKmh);

    // Camera Choreography: Azurea Marina, Helipad & Concours Pavilion Showcase OR Snappy Chase Camera
    if (isStartMenuOpen) {
      if (simState.lobbyEmoteTimer > 0) {
        simState.lobbyEmoteTimer = Math.max(0, simState.lobbyEmoteTimer - dt);
      }
      const stage = new THREE.Vector3(lobbyStage.x, lobbyStage.y + 0.06, lobbyStage.z);
      const heading = lobbyStage.yaw;
      const forward = new THREE.Vector3(Math.sin(heading), 0, Math.cos(heading));
      const side = new THREE.Vector3(Math.cos(heading), 0, -Math.sin(heading));
      const wide = state.size.width >= 720;
      const tabIsPlay = simState.lobbyTab === 'PLAY';
      const drawerOffset = !tabIsPlay && wide ? -0.95 : 0;
      const breathX = Math.sin(t * 0.42) * 0.045;
      const breathY = Math.cos(t * 0.34) * 0.02;

      // Position our live 3D Supercar on the Obsidian & Brass Concours Turntable
      if (carRef.current) {
        carRef.current.visible = true;
        carRef.current.position
          .copy(stage)
          .addScaledVector(side, 2.95)
          .addScaledVector(forward, -3.15);
        carRef.current.position.y = lobbyStage.y + 0.055;
        carRef.current.rotation.set(0, heading - 2.26 + Math.sin(t * 0.32) * 0.05, 0, 'YXZ');
      }

      // Position our live 3D Aircraft / Helicopter on the Cantilevered Helipad Apron ('H')
      if (planeRef.current) {
        planeRef.current.visible = true;
        const planeLobbyScale = [0.56, 0.76, 0.68, 0.52, 0.4, 0.4][activePlaneIdxRef.current] ?? 0.56;
        planeRef.current.scale.setScalar(planeLobbyScale);
        planeRef.current.position
          .copy(stage)
          .addScaledVector(side, -3.85)
          .addScaledVector(forward, -5.65);
        planeRef.current.position.y = lobbyStage.y + 0.24;
        planeRef.current.rotation.order = 'YXZ';
        planeRef.current.rotation.set(0, heading + 2.38, 0);
      }

      // Position our live 3D Boat / Yacht / Submarine floating in the Marina Slip
      if (boatRef.current) {
        boatRef.current.visible = true;
        const boatLobbyScale = [0.74, 0.32, 0.48, 0.66, 0.7, 0.56][activeBoatIdxRef.current] ?? 0.6;
        boatRef.current.scale.setScalar(boatLobbyScale);
        boatRef.current.position
          .copy(stage)
          .addScaledVector(side, 5.15)
          .addScaledVector(forward, -7.85);
        boatRef.current.position.y = 0.28 + Math.sin(t * 1.6) * 0.055;
        boatRef.current.rotation.set(
          Math.sin(t * 1.4) * 0.018,
          heading - 2.22,
          Math.cos(t * 1.2) * 0.022
        );
      }

      // Multi-Station 3D Camera Focus Choreography
      const focusMode = simState.lobbyFocus || 'OVERVIEW';
      const eye = stage.clone();
      const focus = stage.clone();
      let targetFov = wide ? 44 : 52;

      if (focusMode === 'CAR') {
        eye.addScaledVector(forward, wide ? 1.85 : 2.65).addScaledVector(side, 1.55 + drawerOffset * 0.65 + breathX);
        eye.y += 1.48 + breathY;
        focus.addScaledVector(forward, -3.15).addScaledVector(side, 2.75 + drawerOffset * 0.55);
        focus.y += 0.68;
        targetFov = wide ? 41 : 49;
      } else if (focusMode === 'AIRCRAFT') {
        eye.addScaledVector(forward, wide ? -0.45 : 0.45).addScaledVector(side, -2.15 + drawerOffset * 0.65 + breathX);
        eye.y += 1.88 + breathY;
        focus.addScaledVector(forward, -5.65).addScaledVector(side, -3.85 + drawerOffset * 0.55);
        focus.y += 0.72;
        targetFov = wide ? 43 : 50;
      } else if (focusMode === 'BOAT') {
        eye.addScaledVector(forward, wide ? -1.45 : -0.65).addScaledVector(side, 2.85 + drawerOffset * 0.65 + breathX);
        eye.y += 1.65 + breathY;
        focus.addScaledVector(forward, -7.85).addScaledVector(side, 5.05 + drawerOffset * 0.55);
        focus.y -= 1.35;
        targetFov = wide ? 42 : 50;
      } else if (focusMode === 'ARSENAL') {
        eye.addScaledVector(forward, wide ? 3.55 : 4.25).addScaledVector(side, -0.75 + drawerOffset * 0.6 + breathX);
        eye.y += 1.42 + breathY;
        focus.addScaledVector(forward, -0.85).addScaledVector(side, -1.05 + drawerOffset * 0.65);
        focus.y += 0.96;
        targetFov = wide ? 40 : 48;
      } else if (focusMode === 'CHARACTER') {
        eye.addScaledVector(forward, wide ? 3.95 : 4.65).addScaledVector(side, drawerOffset * 0.35 + breathX);
        eye.y += 1.38 + breathY;
        focus.addScaledVector(side, drawerOffset * 0.85);
        focus.y += 0.98;
        targetFov = wide ? 39 : 48;
      } else {
        // OVERVIEW: Full Promenade with Hero, Supercar Turntable, Helipad Aircraft, Marina Boat & Skyline
        eye.addScaledVector(forward, wide ? 5.35 : 5.55).addScaledVector(side, (!tabIsPlay && wide ? -0.32 : 0) + breathX);
        eye.y += (wide ? 1.56 : 1.74) + breathY;
        focus.addScaledVector(side, !tabIsPlay && wide ? -1.05 : 0).addScaledVector(forward, -0.35);
        focus.y += wide ? 0.96 : (tabIsPlay ? 0.72 : 0.58);
        targetFov = wide ? 44 : 51;
      }

      const camFollowAlpha = 1 - Math.exp(-7 * dt);
      if (state.camera.position.distanceToSquared(eye) > 100) state.camera.position.copy(eye);
      else state.camera.position.lerp(eye, camFollowAlpha);
      if (camTarget.current.distanceToSquared(focus) > 100) camTarget.current.copy(focus);
      else camTarget.current.lerp(focus, camFollowAlpha);
      state.camera.lookAt(camTarget.current);

      if (state.camera instanceof THREE.PerspectiveCamera) {
        state.camera.near = 0.12;
        state.camera.fov = THREE.MathUtils.damp(state.camera.fov, targetFov, 9, dt);
        state.camera.updateProjectionMatrix();
      }
      if (playerRef.current) {
        playerRef.current.visible = true;
        playerRef.current.position.copy(stage);
        const yaw = heading + simState.lobbyYaw;
        playerRef.current.rotation.y += Math.atan2(Math.sin(yaw - playerRef.current.rotation.y),
          Math.cos(yaw - playerRef.current.rotation.y)) * (1 - Math.exp(-16 * dt));
        const rig = [rpmRigRef.current, michelleRigRef.current, soldierRigRef.current, ...coastalRigs.current.values()]
          .find((candidate) => candidate?.wrapper.visible);
        if (rig) {
          animateHumanoid(rig, {
            dt, time: t, phase: t * 0.5, speed: 0, emote: simState.lobbyEmoteTimer, emoteStyle: simState.activeEmote,
          });
        }
        if (accessoriesRootRef.current) {
          accessoriesRootRef.current.position.y = rig?.wrapper.position.y ?? 0;
          accessoriesRootRef.current.position.z = 0;
          accessoriesRootRef.current.rotation.x = 0;
        }
        if (playerShadowRef.current) {
          playerShadowRef.current.visible = !state.gl.shadowMap.enabled;
        }
      }
    } else if (isCustomizerOpen) {
      const studioDist = 2.55;
      const studioYaw = activeYaw + 0.28;
      const desiredStudioCam = new THREE.Vector3(
        activePos.x + Math.sin(studioYaw) * studioDist,
        activePos.y + 1.25,
        activePos.z + Math.cos(studioYaw) * studioDist
      );
      state.camera.position.lerp(desiredStudioCam, Math.min(1, 10.5 * dt));

      // Offset look target slightly to character's right (screen left) so character stands on the right half while UI drawer is on the left
      const rightOffset = -0.35;
      const lookTarget = new THREE.Vector3(
        activePos.x + Math.cos(activeYaw) * rightOffset,
        activePos.y + 1.02,
        activePos.z - Math.sin(activeYaw) * rightOffset
      );
      camTarget.current.lerp(lookTarget, Math.min(1, 12 * dt));
      state.camera.lookAt(camTarget.current);

      if (state.camera instanceof THREE.PerspectiveCamera) {
        if (Math.abs(state.camera.fov - 50) > 0.05) {
          state.camera.fov = THREE.MathUtils.lerp(state.camera.fov, 50, Math.min(1, 6 * dt));
          state.camera.updateProjectionMatrix();
        }
      }
    } else if (
      simState.mode === 'FOOT' &&
      simState.activeRide === 'COASTER' &&
      simState.cameraView === 1 &&
      activeRidePose?.tangent &&
      activeRidePose?.bankedRight &&
      activeRidePose?.bankedUp
    ) {
      // TRUE FRONT-ROW FIRST-PERSON ROLLER COASTER POV (Frenet-banked seat + mouse free-look + dynamic speed FOV)
      const orbit = cameraOrbit.current;
      const yawDelta = Math.atan2(Math.sin(simState.orbitYaw - orbit.yaw), Math.cos(simState.orbitYaw - orbit.yaw));
      orbit.yaw += yawDelta * (1 - Math.exp(-18 * dt));
      orbit.pitch = THREE.MathUtils.damp(orbit.pitch, simState.orbitPitch, 18, dt);

      const { pos: seatBase, tangent, bankedRight, bankedUp } = activeRidePose;
      const backAxis = tangent.clone().negate();
      const basisMat = new THREE.Matrix4().makeBasis(bankedRight, bankedUp, backAxis);
      const carQuat = new THREE.Quaternion().setFromRotationMatrix(basisMat);

      const rattleMag = Math.min(0.022, (speedKmh / 125) * 0.018);
      const rattleX = Math.sin(t * 42) * rattleMag;
      const rattleY = Math.cos(t * 53) * rattleMag * 0.7;

      const eyePos = seatBase
        .clone()
        .addScaledVector(bankedUp, 1.44 + rattleY)
        .addScaledVector(tangent, 0.18)
        .addScaledVector(bankedRight, rattleX);

      state.camera.position.copy(eyePos);
      const lookQuat = new THREE.Quaternion().setFromEuler(
        new THREE.Euler(-orbit.pitch, orbit.yaw, 0, 'YXZ')
      );
      state.camera.quaternion.copy(carQuat).multiply(lookQuat);
      state.camera.near = 0.04;

      if (coasterFpvCockpitRef.current) {
        coasterFpvCockpitRef.current.visible = true;
        coasterFpvCockpitRef.current.position
          .copy(seatBase)
          .addScaledVector(bankedUp, 0.58)
          .addScaledVector(tangent, 0.42);
        coasterFpvCockpitRef.current.quaternion.copy(carQuat);
      }

      if (state.camera instanceof THREE.PerspectiveCamera) {
        const targetFov = 64 + Math.min(22, (speedKmh / 128) * 22);
        if (Math.abs(state.camera.fov - targetFov) > 0.05) {
          state.camera.fov = THREE.MathUtils.lerp(state.camera.fov, targetFov, Math.min(1, 7 * dt));
          state.camera.updateProjectionMatrix();
        }
      }
    } else {
      if (coasterFpvCockpitRef.current) coasterFpvCockpitRef.current.visible = false;
      const isPara = simState.mode === 'FOOT' && simState.parachuting;
      const isRiding = simState.mode === 'FOOT' && Boolean(simState.activeRide);
      const ferris = isRiding && simState.activeRide === 'FERRIS';
      const first = simState.cameraView === 1;
      const isCruiseShip = simState.mode === 'BOAT' && activeBoatIdxRef.current === 1;
      const camDist = isPara
        ? 11.5
        : isRiding
        ? 8.5
        : simState.mode === 'PLANE'
        ? 18
        : simState.mode === 'CAR'
        ? 10.5
        : isCruiseShip
        ? 22
        : simState.mode === 'BOAT'
        ? 13
        : 4.4;
      const camHeight = isPara
        ? 4.4
        : isRiding
        ? 3.2
        : simState.mode === 'PLANE'
        ? 6.5
        : simState.mode === 'CAR'
        ? 3.5
        : isCruiseShip
        ? 7.8
        : simState.mode === 'BOAT'
        ? 4.2
        : 1.95;
      const lookOffset = ferris ? 1.34 : isPara ? 0.65 : isCruiseShip ? 2.6 :
        simState.mode === 'FOOT' && footMotion.current.swim ? 1.54 : 1.25;
      const subject = new THREE.Vector3(activePos.x, activePos.y + lookOffset, activePos.z);
      const warped = camTarget.current.distanceToSquared(subject) > 70 * 70;
      const orbit = cameraOrbit.current;
      const yawDelta = Math.atan2(Math.sin(simState.orbitYaw - orbit.yaw), Math.cos(simState.orbitYaw - orbit.yaw));
      orbit.yaw += yawDelta * (warped ? 1 : 1 - Math.exp(-19 * dt));
      orbit.pitch = warped ? simState.orbitPitch : THREE.MathUtils.damp(orbit.pitch, simState.orbitPitch, 19, dt);
      const carSlipCam = simState.mode === 'CAR' ? suspension.current.slip * 0.55 : 0;
      const yaw = (ferris ? (first ? -1 : 1) * Math.PI / 2 : activeYaw) - carSlipCam + orbit.yaw - (simState.mode === 'PLANE' ? simState.planeRoll * 0.27 : 0);
      const inFlight = simState.mode === 'PLANE';
      const aim = aiming.ads && !construction.active && !construction.pickaxe;
      cameraBlend.current = THREE.MathUtils.damp(cameraBlend.current, first ? 1 : 0, 15, dt);
      adsBlend.current = THREE.MathUtils.damp(adsBlend.current, aim ? 1 : 0, 14, dt);
      state.camera.near = first ? 0.035 : 0.22;
      const range = (camDist + (inFlight ? simState.planeSpeed * 0.077 : 0)) * (1 - adsBlend.current * 0.31);
      const elevation = THREE.MathUtils.clamp(Math.atan2(camHeight, camDist) + orbit.pitch + (simState.cameraView === 2 ? 0.16 : 0), -0.48, 1.32);
      const cameraRay = new THREE.Vector3();
      const projectEye = (heading: number, tilt = elevation) => {
        const planeDistance = Math.cos(tilt) * range;
        const eye = subject.clone().add(new THREE.Vector3(-Math.sin(heading) * planeDistance,
          Math.sin(tilt) * range, -Math.cos(heading) * planeDistance));
        eye.y = Math.max(eye.y, getTravelHeight(eye.x, eye.z, eye.y) + 0.56, simState.tideOffset + 0.45);
        return eye;
      };

      let ideal = projectEye(yaw);
      if (ferris) {
        // Stay west of both wheel rims. Cross the outer rim plane between spokes,
        // through the open cabin windows as the gondola travels around the wheel.
        const angle = t * 0.32;
        const radialY = Math.sin(angle);
        const radialZ = Math.cos(angle);
        const axial = 8.5;
        const inward = 4.6 + Math.sin(orbit.pitch) * 0.55;
        const tangent = 3.6 + Math.sin(orbit.yaw) * 0.55;
        ideal.set(
          subject.x - axial,
          subject.y - radialY * inward + radialZ * tangent,
          subject.z - radialZ * inward - radialY * tangent
        );
      }
      let clearance = constrainCamera(subject, ideal, cameraRay);
      if (!ferris && simState.mode === 'FOOT' && clearance < 1.7) {
        // A flank view keeps the character visible in alleys and beside large props.
        for (const offset of [-0.76, 0.76, -1.32, 1.32]) {
          const alternate = projectEye(yaw + offset, Math.min(1.24, elevation + 0.1));
          const alternateClearance = constrainCamera(subject, alternate, cameraRay);
          if (alternateClearance > clearance + 0.24) {
            ideal = alternate;
            clearance = alternateClearance;
          }
          if (clearance >= 2.65) break;
        }
      }

      const eye = ideal.clone();
      if (!warped) eye.lerp(state.camera.position, Math.exp(-11.5 * camSmooth * dt));
      if (simState.cameraShake > 0.01) {
        const shake = simState.cameraShake;
        eye.x += Math.sin(t * 55) * shake * 0.32;
        eye.y += Math.cos(t * 63) * shake * 0.24;
      }

      const smoothedClearance = constrainCamera(subject, eye, cameraRay);
      state.camera.position.copy(smoothedClearance < 0.95 && clearance > smoothedClearance + 0.48 ? ideal : eye);
      if (warped || smoothedClearance < 2) camTarget.current.copy(subject);

      camTarget.current.lerp(
        subject,
        Math.min(1, 15 * camSmooth * dt)
      );
      state.camera.lookAt(camTarget.current);
      const forward = new THREE.Vector3(Math.sin(yaw), 0, Math.cos(yaw));
      const right = new THREE.Vector3(forward.z, 0, -forward.x);
      const close = cameraBlend.current;
      const shoulder = adsBlend.current * (1 - close) * (simState.mode === 'FOOT' ? 0.57 : 0);
      if (shoulder > 0.01) {
        const shifted = state.camera.position.clone().addScaledVector(right, shoulder);
        constrainCamera(subject, shifted, cameraRay);
        state.camera.position.copy(shifted);
        state.camera.lookAt(camTarget.current.clone().addScaledVector(right, shoulder));
      }
      if (close > 0.005) {
        const travelForward = ferris ? new THREE.Vector3(-1, 0, 0) :
          new THREE.Vector3(Math.sin(activeYaw), 0, Math.cos(activeYaw));
        const eyeHeight = simState.mode === 'FOOT' ? (isRiding ? (ferris ? 1.34 : 1.16) : footMotion.current.swim ? 1.52 : 1.64) :
          inFlight ? (simState.activePlaneIdx === 1 ? 1.78 : 1.69) : isCruiseShip ? 7 : simState.mode === 'BOAT' ? 1.75 : 1.21;
        const cameraLead = simState.mode === 'FOOT' ? 0.07 : inFlight ? 1.15 : simState.mode === 'BOAT' ? 0.68 : 0.62;
        const verticalBob = simState.mode === 'FOOT' ? Math.sin(footMotion.current.phase * 2) * Math.min(0.033, speedKmh * 0.002) : 0;
        const pilot = activePos.clone().addScaledVector(travelForward, cameraLead);
        pilot.y += eyeHeight + verticalBob;
        const carPitch = simState.mode === 'CAR' ? -suspension.current.pitch * 0.65 : 0;
        const pitch = THREE.MathUtils.clamp(-orbit.pitch + (inFlight ? simState.planePitch : carPitch), -1.22, 1.22);
        const look = forward.clone().multiplyScalar(Math.cos(pitch)).setY(Math.sin(pitch));
        const farLook = pilot.clone().addScaledVector(look, 85);
        const chaseLook = state.camera.getWorldDirection(new THREE.Vector3()).multiplyScalar(85).add(state.camera.position);
        state.camera.position.lerp(pilot, close);
        state.camera.lookAt(chaseLook.lerp(farLook, close));
      }
      if (inFlight) state.camera.rotateZ(simState.planeRoll * THREE.MathUtils.lerp(0.135, 0.69, close));

      // Speed-reactive dynamic FOV (60° -> 73° at high speed/boost)
      if (state.camera instanceof THREE.PerspectiveCamera) {
        const driftPunch = simState.mode === 'CAR' ? Math.min(1, suspension.current.boost * 2.2) * 3.5 : 0;
        const targetFov = 60 + close * 3 + Math.min(13, (speedKmh / 160) * 13) + driftPunch - adsBlend.current * 20;
        if (Math.abs(state.camera.fov - targetFov) > 0.05) {
          state.camera.fov = THREE.MathUtils.lerp(state.camera.fov, targetFov, Math.min(1, 8 * dt));
        }
        state.camera.updateProjectionMatrix();
      }
    }

    const firstVehicle = !isMenuOpen && simState.cameraView === 1 && simState.mode !== 'FOOT';
    if (boatRef.current) boatRef.current.visible = !firstVehicle || simState.mode !== 'BOAT';
    if (planeRef.current) planeRef.current.visible = !firstVehicle || simState.mode !== 'PLANE';
    if (document.pointerLockElement && (isMenuOpen || (simState.mode !== 'FOOT' && simState.cameraView !== 1 && !simState.activeRide))) {
      document.exitPointerLock();
    }
    if (cockpit.current) {
      cockpit.current.visible = firstVehicle;
      cockpit.current.position.copy(state.camera.position);
      cockpit.current.quaternion.copy(state.camera.quaternion);
      cockpit.current.children.forEach((item) => { item.visible = item.name === simState.mode; });
    }
    state.camera.updateMatrixWorld();
    reticleRay.current.setFromCamera(AIM_CENTER, state.camera);
    aiming.origin.copy(reticleRay.current.ray.origin);
    aiming.direction.copy(reticleRay.current.ray.direction);
    aiming.ready = !isMenuOpen;
    aiming.thirdPerson = simState.cameraView !== 1;
    aiming.spread = THREE.MathUtils.damp(aiming.spread, Math.min(13, speedKmh * 0.19 + simState.firingTimer * 30) *
      (aiming.ads ? 0.36 : 1), 14, dt);
    construction.preview = !isMenuOpen && simState.mode === 'FOOT' && !simState.parachuting && !simState.gliding && construction.active
      ? planBuild(buildPoint(), simState.playerPos)
      : null;
    const swing = aiming.pickSwing > 0 ? Math.sin((1 - aiming.pickSwing / 0.5) * Math.PI) : 0;
    if (worldPick.current) {
      worldPick.current.visible = !isMenuOpen && simState.cameraView !== 1 && construction.pickaxe && !construction.active &&
        !footMotion.current.swim && !simState.parachuting && !simState.gliding;
      worldPick.current.rotation.set(-0.93 + 1.85 * swing, 0.08, -0.54 + 0.43 * swing);
    }
    const viewRoot = viewModel.current;
    if (viewRoot) {
      viewRoot.visible = !isMenuOpen && simState.cameraView === 1 && simState.mode === 'FOOT' && !simState.activeRide &&
        !footMotion.current.swim && !simState.parachuting && !simState.gliding && !construction.active;
      if (viewRoot.visible) {
        const weapon = weaponMeshesRef.current[simState.activeWeaponIdx];
        if (viewWeapon.current && weapon !== clonedWeapon.current) {
          clonedWeapon.current = weapon ?? null;
          viewWeapon.current.clear();
          if (weapon) {
            const clone = weapon.clone(true);
            clone.visible = true;
            viewWeapon.current.add(clone);
          }
        }
        const aim = adsBlend.current;
        const stride = footMotion.current.phase;
        const bob = Math.min(1, speedKmh / 19) * (1 - aim * 0.75);
        const recoil = simState.firingTimer / 0.13;
        viewRoot.position.set(0.25 * (1 - aim) + Math.sin(stride * 0.5) * 0.014 * bob,
          -0.21 + aim * 0.132 - Math.abs(Math.cos(stride)) * 0.018 * bob, -0.54 + recoil * 0.045);
        viewRoot.position.applyQuaternion(state.camera.quaternion).add(state.camera.position);
        viewRoot.quaternion.copy(state.camera.quaternion);
        viewRoot.rotateX(recoil * 0.058 - swing * 0.63);
        viewRoot.rotateZ(Math.sin(stride * 0.5) * bob * 0.021 + swing * 0.14);
        if (viewWeapon.current) viewWeapon.current.visible = !construction.pickaxe;
        if (viewPick.current) viewPick.current.visible = construction.pickaxe;
      }
    }

    // Throttled HUD update (12Hz)
    hudAccum.current += dt;
    if (hudAccum.current >= 0.08) {
      hudAccum.current = 0;
      let nearbyVehicle: 'CAR' | 'BOAT' | 'PLANE' | null = null;
      if (simState.mode === 'FOOT') {
        if (simState.playerPos.distanceTo(simState.carPos) < 9) nearbyVehicle = 'CAR';
        else if (simState.playerPos.distanceTo(simState.boatPos) < 14) nearbyVehicle = 'BOAT';
        else if (simState.playerPos.distanceTo(simState.planePos) < 14) nearbyVehicle = 'PLANE';
      }

      let nearbyRide: AmusementRideId | null = null;
      if (simState.mode === 'FOOT' && !simState.activeRide) for (const ride of AMUSEMENT_PARK_RIDES) {
        if (Math.hypot(activePos.x - ride.x, activePos.z - ride.z) < ride.boardRadius) {
          nearbyRide = ride.id;
          break;
        }
      }
      simState.nearbyRide = nearbyRide;

      let nearLandmark: string | null = null;
      for (const lm of LANDMARKS) {
        const d = Math.hypot(activePos.x - lm.position[0], activePos.z - lm.position[2]);
        if (d < 45) {
          nearLandmark = `${lm.name} — ${lm.subtitle}`;
          break;
        }
      }

      const activeGate = simState.checkpoints[simState.activeCheckpoint] ?? simState.checkpoints[0];
      const checkpointDist = Math.round(
        Math.hypot(activePos.x - activeGate.position[0], activePos.z - activeGate.position[2])
      );
      const spec = WEAPON_SPECS[simState.activeWeaponIdx] ?? WEAPON_SPECS[0];

      const hudPayload: any = {
        mode: simState.mode,
        speedKmh,
        altitude: Math.max(0, Math.round(activePos.y)),
        chips: simState.chips,
        multiplier: simState.multiplier,
        roulette: simState.roulette,
        rouletteTimer: Math.max(0, Math.ceil(simState.rouletteTimer)),
        nearbyVehicle,
        nearLandmark,
        activeRide: simState.activeRide,
        nearbyRide: simState.nearbyRide,
        swimming: simState.mode === 'FOOT' && footMotion.current.swim,
        firingTimer: simState.firingTimer,
        discovery: now < simState.coastal.discoveryUntil ? simState.coastal.discovery : undefined,
        postcardCount: simState.coastal.postcards.length,
        coastalPrompt: coastalPlay ? coastalPrompt() : undefined,
        fps: currentFps.current,
        gliding: simState.gliding,
        activeCheckpoint: simState.activeCheckpoint,
        checkpointName: activeGate.name,
        checkpointDist,
        lapTime: simState.lapTime,
        raceCountdown: simState.raceCountdown,
        bestLapTime: simState.bestLapTime,
        lapCount: simState.lapCount,
        driftScore: Math.min(100, Math.round(simState.driftScore + suspension.current.driftCharge)),
        brActive: simState.brActive,
        parachuting: simState.parachuting,
        activeWeaponIdx: simState.activeWeaponIdx,
        weaponName: spec.name,
        weaponRarity: spec.rarity,
        ammo: simState.ammo,
        maxAmmo: simState.maxAmmo,
        playerHp: simState.playerHp,
        playerShield: simState.playerShield,
        eliminations: simState.eliminations,
        aliveCount: simState.aliveCount,
        stormRadius: Math.round(simState.stormRadius),
        customizerOpen: Boolean(s.customizerOpen),
        activeCarName: CAR_NAMES[activeCarIdxRef.current],
        activePlaneName: PLANE_NAMES[activePlaneIdxRef.current],
        activeBoatName: BOAT_NAMES[activeBoatIdxRef.current],
        vehicleHp: Math.round(simState.vehicleHp),
        vehicleMaxHp: simState.vehicleMaxHp,
        vehicleWrecked: simState.vehicleWrecked,
        aircraftDamage: { ...simState.aircraftDamage },
        aircraftThrottle: simState.planeThrottle,
      };

      onHudUpdate(hudPayload);
    }
  });

  return (
    <group>
      <group ref={cockpit} visible={false}>
        <group name="CAR"><Cockpit mode="CAR" style={simState.activeCarIdx} /></group>
        <group name="BOAT"><Cockpit mode="BOAT" style={simState.activeBoatIdx} /></group>
        <group name="PLANE"><Cockpit mode="PLANE" style={simState.activePlaneIdx} /></group>
      </group>

      {/* AAA FRONT-ROW ROLLER COASTER FIRST-PERSON COCKPIT (Glossy Crimson/Carbon Nose + LED Strips + Padded Gold Lap Bar) */}
      <group ref={coasterFpvCockpitRef} visible={false}>
        {/* Main Sculpted Glossy Crimson Lower Nose Hull (extends forward along -Z) */}
        <mesh position={[0, -0.05, -0.78]}>
          <boxGeometry args={[1.38, 0.36, 1.35]} />
          <meshStandardMaterial color="#b91c1c" metalness={0.62} roughness={0.18} />
        </mesh>
        {/* Aerodynamic Tapered Carbon-Fiber Center Hood Dome */}
        <mesh position={[0, 0.09, -0.88]} rotation={[0.14, 0, 0]}>
          <boxGeometry args={[0.74, 0.22, 1.24]} />
          <meshStandardMaterial color="#18181b" metalness={0.45} roughness={0.32} />
        </mesh>
        {/* Glossy Crimson Left & Right Side Cowls */}
        {[-0.56, 0.56].map((sx) => (
          <mesh key={sx} position={[sx, 0.08, -0.68]} rotation={[0.12, sx > 0 ? -0.1 : 0.1, 0]}>
            <boxGeometry args={[0.32, 0.28, 1.38]} />
            <meshStandardMaterial color="#dc2626" metalness={0.68} roughness={0.16} />
          </mesh>
        ))}
        {/* Twin Glowing Orange-Red Aerodynamic LED Accent Strips */}
        {[-0.41, 0.41].map((lx) => (
          <mesh key={lx} position={[lx, 0.19, -0.82]} rotation={[0.14, lx > 0 ? -0.08 : 0.08, 0]}>
            <boxGeometry args={[0.045, 0.035, 1.05]} />
            <meshStandardMaterial color="#fb923c" emissive="#f97316" emissiveIntensity={2.8} />
          </mesh>
        ))}
        {/* Brushed Gold Nose Crest Rib */}
        <mesh position={[0, 0.21, -0.95]} rotation={[0.14, 0, 0]}>
          <boxGeometry args={[0.07, 0.025, 0.92]} />
          <meshStandardMaterial color="#fbbf24" metalness={0.9} roughness={0.15} />
        </mesh>
        {/* Padded Black-and-Gold U-Shaped Lap Restraint Bar in Lower Foreground */}
        <group position={[0, 0.28, -0.34]}>
          {/* Center Padded Crossbar */}
          <mesh rotation={[0, 0, Math.PI / 2]}>
            <cylinderGeometry args={[0.052, 0.052, 0.96, 12]} />
            <meshStandardMaterial color="#0f172a" roughness={0.55} metalness={0.18} />
          </mesh>
          {/* Twin Gold Hydraulic Grip Collars */}
          {[-0.36, 0.36].map((gx) => (
            <mesh key={gx} position={[gx, 0, 0]} rotation={[0, 0, Math.PI / 2]}>
              <cylinderGeometry args={[0.058, 0.058, 0.12, 12]} />
              <meshStandardMaterial color="#f59e0b" metalness={0.88} roughness={0.18} />
            </mesh>
          ))}
          {/* Side Restraint Arms Anchoring Down into Seat */}
          {[-0.48, 0.48].map((ax) => (
            <mesh key={ax} position={[ax, -0.18, 0.08]} rotation={[0.45, 0, 0]}>
              <cylinderGeometry args={[0.038, 0.042, 0.44, 10]} />
              <meshStandardMaterial color="#1e293b" metalness={0.7} roughness={0.25} />
            </mesh>
          ))}
        </group>
      </group>
      <group ref={viewModel} visible={false} scale={0.72}>
        <group ref={viewWeapon} rotation={[0, Math.PI, 0]} />
        <group ref={viewPick} rotation={[0.46, 0.2, -0.54]} scale={0.62}><Pickaxe /></group>
        <mesh position={[0.085, -0.14, 0.18]} rotation={[1.15, 0, -0.22]}>
          <capsuleGeometry args={[0.036, 0.18, 4, 8]} /><meshStandardMaterial ref={sleeveRightMatRef} color="#254140" roughness={0.83} />
        </mesh>
        <mesh position={[-0.095, -0.13, -0.07]} rotation={[1.3, 0, 0.43]}>
          <capsuleGeometry args={[0.033, 0.16, 4, 8]} /><meshStandardMaterial ref={sleeveLeftMatRef} color="#294649" roughness={0.82} />
        </mesh>
      </group>
      {/* CUSTOMIZABLE HIGH-RES HUMAN PLAYER (READY PLAYER ME + MICHELLE VIP + VANGUARD SOLDIER) + 3D ACCESSORIES */}
      <group ref={playerRef}>
        <group ref={worldPick} position={[0.29, 1.19, 0.36]} scale={0.89} visible={false}><Pickaxe /></group>
        <mesh ref={playerShadowRef} position={[0, 0.03, 0]} rotation={[-Math.PI / 2, 0, 0]}>
          <planeGeometry args={[0.65, 0.65]} />
          <meshBasicMaterial map={shadowTex} transparent opacity={0.21} depthWrite={false} />
        </mesh>

        {/* Mounted 3 Customizable Human Archetypes */}
        <group ref={soldierMountRef} />

        {/* 3D Customizable Accessories (Aviator Gold Sunglasses, Cyber Visor, Sculpted Tactical Backpack) */}
        <group ref={accessoriesRootRef}>
          {/* 1. AVIATOR_GOLD: Sleek Gold-Rimmed Aviator Sunglasses at Head Eye Level */}
          <group ref={aviatorGroupRef} position={[0, 1.71, 0.11]}>
            {/* Gold Top Brow Bar */}
            <mesh position={[0, 0.018, 0]}>
              <boxGeometry args={[0.145, 0.006, 0.01]} />
              <meshStandardMaterial color="#fbbf24" metalness={0.95} roughness={0.12} />
            </mesh>
            {/* Left Dark Reflective Aviator Lens + Gold Rim */}
            <mesh position={[0.036, -0.002, 0]}>
              <boxGeometry args={[0.056, 0.036, 0.012]} />
              <meshStandardMaterial color="#0f172a" metalness={0.95} roughness={0.05} />
            </mesh>
            <mesh position={[0.036, -0.002, -0.002]}>
              <boxGeometry args={[0.062, 0.042, 0.008]} />
              <meshStandardMaterial color="#fbbf24" metalness={0.92} roughness={0.15} />
            </mesh>
            {/* Right Dark Reflective Aviator Lens + Gold Rim */}
            <mesh position={[-0.036, -0.002, 0]}>
              <boxGeometry args={[0.056, 0.036, 0.012]} />
              <meshStandardMaterial color="#0f172a" metalness={0.95} roughness={0.05} />
            </mesh>
            <mesh position={[-0.036, -0.002, -0.002]}>
              <boxGeometry args={[0.062, 0.042, 0.008]} />
              <meshStandardMaterial color="#fbbf24" metalness={0.92} roughness={0.15} />
            </mesh>
          </group>

          {/* 2. CYBER_VISOR: Glowing Cyan-Magenta Wrap-Around Tactical Visor */}
          <group ref={cyberVisorGroupRef} position={[0, 1.71, 0.115]} visible={false}>
            <mesh>
              <boxGeometry args={[0.165, 0.042, 0.028]} />
              <meshStandardMaterial
                color="#38bdf8"
                emissive="#0ea5e9"
                emissiveIntensity={2.2}
                roughness={0.1}
                metalness={0.85}
              />
            </mesh>
            <mesh position={[0, 0.022, -0.004]}>
              <boxGeometry args={[0.172, 0.009, 0.035]} />
              <meshStandardMaterial color="#ec4899" emissive="#db2777" emissiveIntensity={1.8} />
            </mesh>
          </group>

          {/* 3. TACTICAL BACKPACK: Sculpted Carbon-and-Gold Backpack with Status LED Strip */}
          <group ref={backpackGroupRef} position={[0, 1.25, -0.16]}>
            <mesh castShadow receiveShadow>
              <boxGeometry args={[0.31, 0.42, 0.16]} />
              <meshStandardMaterial color="#18181b" roughness={0.35} metalness={0.65} />
            </mesh>
            {/* Upper Molded Shell */}
            <mesh position={[0, 0.11, -0.04]} castShadow>
              <boxGeometry args={[0.27, 0.16, 0.1]} />
              <meshStandardMaterial color="#27272a" roughness={0.28} metalness={0.75} />
            </mesh>
            {/* Gold Accent Trim Bar */}
            <mesh position={[0, -0.06, -0.085]}>
              <boxGeometry args={[0.24, 0.024, 0.015]} />
              <meshStandardMaterial color="#fbbf24" metalness={0.9} roughness={0.18} />
            </mesh>
            {/* Glowing Cyan Telemetry LED Strip */}
            <mesh position={[0, 0.11, -0.092]}>
              <boxGeometry args={[0.18, 0.016, 0.01]} />
              <meshStandardMaterial color="#38bdf8" emissive="#0ea5e9" emissiveIntensity={2.5} />
            </mesh>
          </group>
        </group>

        {/* Mounted 5-Slot Real 3D GLB Tactical Weapons */}
        <group ref={weaponMountRef} position={[0.22, 1.18, 0.34]} />

        {/* 3D Tactical Ram-Air Parachute Canopy, Suspension Lines & Sky-Drop Smoke Trails */}
        <group ref={parachuteRef} position={[0, 1.15, 0]} visible={false}>
          <group position={[0, 1.95, 0]}>
            <mesh position={[0, 0.18, 0]}>
              <boxGeometry args={[1.05, 0.28, 1.85]} />
              <meshStandardMaterial color="#0f172a" map={canopyDetailTex} roughness={0.35} metalness={0.5} />
            </mesh>
            <mesh position={[-0.95, 0.1, 0]} rotation={[0, 0, 0.14]}>
              <boxGeometry args={[0.98, 0.24, 1.8]} />
              <meshStandardMaterial color="#0ea5e9" map={canopyDetailTex} emissive="#0284c7" emissiveIntensity={0.35} roughness={0.3} />
            </mesh>
            <mesh position={[0.95, 0.1, 0]} rotation={[0, 0, -0.14]}>
              <boxGeometry args={[0.98, 0.24, 1.8]} />
              <meshStandardMaterial color="#0ea5e9" map={canopyDetailTex} emissive="#0284c7" emissiveIntensity={0.35} roughness={0.3} />
            </mesh>
            <mesh position={[-1.82, -0.06, 0]} rotation={[0, 0, 0.3]}>
              <boxGeometry args={[0.88, 0.2, 1.72]} />
              <meshStandardMaterial color="#f59e0b" map={canopyDetailTex} emissive="#d97706" emissiveIntensity={0.45} roughness={0.3} />
            </mesh>
            <mesh position={[1.82, -0.06, 0]} rotation={[0, 0, -0.3]}>
              <boxGeometry args={[0.88, 0.2, 1.72]} />
              <meshStandardMaterial color="#f59e0b" map={canopyDetailTex} emissive="#d97706" emissiveIntensity={0.45} roughness={0.3} />
            </mesh>
            <mesh position={[-2.2, -0.22, 0]} rotation={[0, 0, 0.28]}>
              <boxGeometry args={[0.08, 0.46, 1.68]} />
              <meshStandardMaterial color="#0f172a" roughness={0.4} />
            </mesh>
            <mesh position={[2.2, -0.22, 0]} rotation={[0, 0, -0.28]}>
              <boxGeometry args={[0.08, 0.46, 1.68]} />
              <meshStandardMaterial color="#0f172a" roughness={0.4} />
            </mesh>
          </group>

          <mesh position={[-0.95, 0.98, 0.18]} rotation={[0.08, 0, 0.56]}>
            <cylinderGeometry args={[0.016, 0.016, 2.25, 6]} />
            <meshBasicMaterial color="#cbd5e1" />
          </mesh>
          <mesh position={[-0.95, 0.98, -0.18]} rotation={[-0.08, 0, 0.56]}>
            <cylinderGeometry args={[0.016, 0.016, 2.25, 6]} />
            <meshBasicMaterial color="#cbd5e1" />
          </mesh>
          <mesh position={[0.95, 0.98, 0.18]} rotation={[0.08, 0, -0.56]}>
            <cylinderGeometry args={[0.016, 0.016, 2.25, 6]} />
            <meshBasicMaterial color="#cbd5e1" />
          </mesh>
          <mesh position={[0.95, 0.98, -0.18]} rotation={[-0.08, 0, -0.56]}>
            <cylinderGeometry args={[0.016, 0.016, 2.25, 6]} />
            <meshBasicMaterial color="#cbd5e1" />
          </mesh>

          <mesh position={[-0.22, -1.8, -0.35]} rotation={[-0.25, 0, 0]}>
            <coneGeometry args={[0.24, 2.8, 8]} />
            <meshBasicMaterial color="#f97316" transparent opacity={0.55} depthWrite={false} />
          </mesh>
          <mesh position={[0.22, -1.8, -0.35]} rotation={[-0.25, 0, 0]}>
            <coneGeometry args={[0.24, 2.8, 8]} />
            <meshBasicMaterial color="#38bdf8" transparent opacity={0.55} depthWrite={false} />
          </mesh>
        </group>

        <group ref={gliderRef} position={[0, 2.35, 0]} visible={false}>
          <mesh rotation={[0, 0.25, 0]} position={[-1.4, 0, -0.2]}>
            <boxGeometry args={[2.8, 0.12, 1.4]} />
            <meshStandardMaterial color="#f43f5e" emissive="#e11d48" emissiveIntensity={0.85} />
          </mesh>
          <mesh rotation={[0, -0.25, 0]} position={[1.4, 0, -0.2]}>
            <boxGeometry args={[2.8, 0.12, 1.4]} />
            <meshStandardMaterial color="#f43f5e" emissive="#e11d48" emissiveIntensity={0.85} />
          </mesh>
        </group>
      </group>

      {/* 3D SWIMMING WATER FX: SOFT-FEATHERED RIPPLES, FOAM WAKE WISPS & FINE SEA-SPRAY DROPLETS */}
      <group ref={swimFxGroupRef} visible={false}>
        {[0, 1, 2, 3].map((i) => (
          <mesh
            key={`swim-ripple-${i}`}
            ref={(el) => {
              swimRippleRefs.current[i] = el;
            }}
            visible={false}
          >
            <planeGeometry args={[2.1, 2.1]} />
            <meshBasicMaterial
              map={swimWaterTex.rippleMap}
              color="#e6f7ff"
              transparent
              opacity={0.22}
              depthWrite={false}
              side={THREE.DoubleSide}
            />
          </mesh>
        ))}
        {[0, 1, 2, 3, 4, 5, 6, 7].map((i) => (
          <mesh
            key={`swim-wake-${i}`}
            ref={(el) => {
              swimWakeRefs.current[i] = el;
            }}
            visible={false}
          >
            <planeGeometry args={[1.55, 2.05]} />
            <meshBasicMaterial
              map={swimWaterTex.wakeMap}
              color="#eef9ff"
              transparent
              opacity={0.22}
              depthWrite={false}
              side={THREE.DoubleSide}
            />
          </mesh>
        ))}
        {[0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13].map((i) => (
          <mesh
            key={`swim-drop-${i}`}
            ref={(el) => {
              swimDropletRefs.current[i] = el;
            }}
            visible={false}
          >
            <sphereGeometry args={[1, 6, 6]} />
            <meshStandardMaterial
              color="#eef9ff"
              emissive="#bae6fd"
              emissiveIntensity={0.45}
              roughness={0.14}
              metalness={0.05}
              transparent
              opacity={0.6}
              depthWrite={false}
            />
          </mesh>
        ))}
      </group>

      {/* REAL 3D GLB SWITCHABLE 5-CAR HERO FLEET */}
      <group ref={carRef}>
        <mesh position={[0, 0.02, 0]} rotation={[-Math.PI / 2, 0, 0]}>
          <planeGeometry args={[2.9, 5.4]} />
          <meshBasicMaterial map={shadowTex} transparent opacity={0.65} depthWrite={false} />
        </mesh>

        <group ref={carModelsMountRef} />
        <group ref={carWeaponMountRef} position={[0, 1.38, 0.15]} />

        <mesh position={[0, 0.68, -2.32]} visible={false}>
          <boxGeometry args={[1.6, 0.06, 0.05]} />
          <meshStandardMaterial ref={taillightMatRef} color="#ef4444" emissive="#ef4444" emissiveIntensity={1.8} />
        </mesh>

        <group ref={boostFlameLeftRef} position={[-0.48, 0.32, -2.45]} rotation={[-Math.PI / 2, 0, 0]} visible={false}>
          <mesh position={[0, 0.45, 0]}>
            <coneGeometry args={[0.16, 0.95, 10]} />
            <meshStandardMaterial color="#38bdf8" emissive="#0ea5e9" emissiveIntensity={3.5} transparent opacity={0.85} />
          </mesh>
          <mesh position={[0, 0.25, 0]}>
            <coneGeometry args={[0.09, 0.55, 8]} />
            <meshStandardMaterial color="#fde047" emissive="#f59e0b" emissiveIntensity={4.2} />
          </mesh>
        </group>
        <group ref={boostFlameRightRef} position={[0.48, 0.32, -2.45]} rotation={[-Math.PI / 2, 0, 0]} visible={false}>
          <mesh position={[0, 0.45, 0]}>
            <coneGeometry args={[0.16, 0.95, 10]} />
            <meshStandardMaterial color="#38bdf8" emissive="#0ea5e9" emissiveIntensity={3.5} transparent opacity={0.85} />
          </mesh>
          <mesh position={[0, 0.25, 0]}>
            <coneGeometry args={[0.09, 0.55, 8]} />
            <meshStandardMaterial color="#fde047" emissive="#f59e0b" emissiveIntensity={4.2} />
          </mesh>
        </group>

        {[0, 1, 2, 3, 4, 5].map((i) => (
          <mesh
            key={`smoke-${i}`}
            ref={(el) => {
              smokeMeshRefs.current[i] = el;
            }}
            visible={false}
          >
            <sphereGeometry args={[0.38, 8, 8]} />
            <meshStandardMaterial color="#f1f5f9" roughness={0.95} transparent opacity={0.45} depthWrite={false} />
          </mesh>
        ))}

        {/* 3D Engine Hood Damage Smoke & Fire Plume */}
        <group position={[0, 0.85, 1.35]}>
          {[0, 1, 2, 3].map((i) => (
            <mesh
              key={`damage-smoke-${i}`}
              ref={(el) => {
                damageSmokeRefs.current[i] = el;
              }}
              visible={false}
            >
              <sphereGeometry args={[0.32, 8, 8]} />
              <meshStandardMaterial
                color="#334155"
                roughness={0.98}
                transparent
                opacity={0.55}
                depthWrite={false}
              />
            </mesh>
          ))}
          <mesh
            ref={(el) => {
              damageFireRefs.current[0] = el;
            }}
            position={[0, 0.28, 0]}
            visible={false}
          >
            <coneGeometry args={[0.24, 0.78, 8]} />
            <meshStandardMaterial
              color="#f97316"
              emissive="#ea580c"
              emissiveIntensity={3.6}
              transparent
              opacity={0.88}
              depthWrite={false}
            />
          </mesh>
          <mesh
            ref={(el) => {
              damageFireRefs.current[1] = el;
            }}
            position={[0.04, 0.22, -0.04]}
            visible={false}
          >
            <coneGeometry args={[0.15, 0.54, 8]} />
            <meshStandardMaterial
              color="#fde047"
              emissive="#f59e0b"
              emissiveIntensity={4.5}
              transparent
              opacity={0.92}
              depthWrite={false}
            />
          </mesh>
        </group>
      </group>

      {/* REAL 3D SWITCHABLE 6-VESSEL MARITIME & CRUISE LINER FLEET */}
      <group ref={boatRef}>
        <group ref={boatModelMountRef} />
        <group ref={boatSprayRef} position={[0, 0.25, 1.4]}>
          <mesh position={[-1.25, 0.18, -0.4]} rotation={[0.2, 0.45, -0.5]}>
            <coneGeometry args={[0.5, 2.6, 8]} />
            <meshBasicMaterial color="#e0f2fe" transparent opacity={0.52} depthWrite={false} />
          </mesh>
          <mesh position={[1.25, 0.18, -0.4]} rotation={[0.2, -0.45, 0.5]}>
            <coneGeometry args={[0.5, 2.6, 8]} />
            <meshBasicMaterial color="#e0f2fe" transparent opacity={0.52} depthWrite={false} />
          </mesh>
        </group>
        <mesh position={[0, 0.08, -4.4]} rotation={[-Math.PI / 2, 0, 0]}>
          <planeGeometry args={[2.4, 4.2]} />
          <meshBasicMaterial color="#e0f2fe" transparent opacity={0.48} />
        </mesh>
      </group>

      {/* REAL 3D SWITCHABLE 6-AIRCRAFT AVIATION FLEET */}
      <group ref={planeRef}>
        <group ref={planeModelMountRef} />
        <mesh ref={contrailLeftRef} position={[-5.1, 0.95, -3.6]} rotation={[Math.PI / 2, 0, 0]}>
          <cylinderGeometry args={[0.04, 0.18, 4.2, 8]} />
          <meshBasicMaterial color="#f8fafc" transparent opacity={0.55} depthWrite={false} />
        </mesh>
        <mesh ref={contrailRightRef} position={[5.1, 0.95, -3.6]} rotation={[Math.PI / 2, 0, 0]}>
          <cylinderGeometry args={[0.04, 0.18, 4.2, 8]} />
          <meshBasicMaterial color="#f8fafc" transparent opacity={0.55} depthWrite={false} />
        </mesh>
        <mesh ref={propRef} position={[0, 1.45, -4.65]} rotation={[Math.PI / 2, 0, 0]}>
          <coneGeometry args={[0.34, 1.35, 12]} />
          <meshStandardMaterial color="#38bdf8" emissive="#0ea5e9" emissiveIntensity={2.8} transparent opacity={0.88} />
        </mesh>
      </group>

      {/* 3D BALLISTIC LASER TRACER BOLT, MUZZLE FLASH STAR & IMPACT BLAST SPHERE */}
      <mesh ref={tracerMeshRef} visible={false}>
        <cylinderGeometry args={[0.012, 0.012, 1, 6]} />
        <meshStandardMaterial
          ref={tracerMatRef}
          color="#38bdf8"
          emissive="#38bdf8"
          emissiveIntensity={4.5}
          transparent
          opacity={0.92}
        />
      </mesh>
      <group ref={muzzleFlashRef} visible={false}>
        <mesh>
          <octahedronGeometry args={[0.11, 0]} />
          <meshStandardMaterial
            ref={muzzleFlashMatRef}
            color="#fde047"
            emissive="#f59e0b"
            emissiveIntensity={5.0}
          />
        </mesh>
      </group>
      <mesh ref={impactMeshRef} visible={false}>
        <sphereGeometry args={[0.15, 10, 10]} />
        <meshStandardMaterial
          ref={impactMatRef}
          color="#f97316"
          emissive="#ef4444"
          emissiveIntensity={4.2}
          transparent
          opacity={0.85}
        />
      </mesh>

      {/* 3D RIGID-BODY IMPACT SPARK BURST */}
      <group ref={crashSparksGroupRef} visible={false}>
        {[0, 1, 2, 3, 4, 5, 6, 7].map((i) => (
          <mesh
            key={`crash-spark-${i}`}
            ref={(el) => {
              crashSparkMeshRefs.current[i] = el;
            }}
          >
            <boxGeometry args={[0.12, 0.12, 0.45]} />
            <meshStandardMaterial
              color={i % 2 === 0 ? '#fde047' : '#f59e0b'}
              emissive={i % 2 === 0 ? '#fbbf24' : '#ea580c'}
              emissiveIntensity={4.8}
              roughness={0.15}
            />
          </mesh>
        ))}
      </group>
    </group>
  );
}
