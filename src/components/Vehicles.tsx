import React, { useEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import { useFrame } from '@react-three/fiber';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/examples/jsm/loaders/DRACOLoader.js';
import { simState, GameHudSnapshot, WEAPON_SPECS, freshAircraftDamage, COASTAL_CHARACTERS, type AircraftDamageStage, type CoastalCharacter, type CharacterCustomization } from '../game/store';
import { getTerrainHeight, getTravelHeight, getBridgeHeight, getWaveHeight, isConstructionClosed, islandTwoRadius, CONSTRUCTION_ISLAND, LANDMARKS, NORTH_BAY_BRIDGE, RouletteOutcome } from '../game/worldMath';
import { fixedWingStep } from '../game/flight';
import { sampleGrandPrix } from '../game/grandPrix';
import { soundEngine } from '../game/soundEngine';
import { createShadowTexture, createLimestonePBR, createSkyscraperPBR } from './Textures';
import { REPAIR_BAY_COORDS } from './World';
import { animateHumanoid, createHumanoidRig, strideDistance, type HumanoidRig } from '../game/humanoid';
import { damageWorld, traceGround, traceWorld, type WorldHit } from '../game/worldDamage';

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
  presetName: 'Azurea Founder',
  skinColor: '#f5d0b5',
  topColor: '#1e3a8a',
  topRoughness: 0.35,
  topMetalness: 0.25,
  bottomColor: '#0f172a',
  footwearColor: '#f8fafc',
  headwearOn: true,
  headwearColor: '#0f172a',
  beardOn: false,
  beardColor: '#27272a',
  eyewear: 'AVIATOR_GOLD',
  backpackOn: true,
};

const X_AXIS = new THREE.Vector3(1, 0, 0);
const Y_AXIS = new THREE.Vector3(0, 1, 0);
const Z_AXIS = new THREE.Vector3(0, 0, 1);

export function triggerRouletteSpin() {
  const next = OUTCOMES[Math.floor(Math.random() * OUTCOMES.length)];
  simState.roulette = next;
  simState.rouletteTimer = 45;
  simState.multiplier = next === 'GREEN_00' ? 3 : next === 'RED' ? 2 : 1.5;
  simState.tideOffset = next === 'BLACK' ? -0.35 : 0;
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
  simState.playerPos.set(0, 118, 52);
  simState.playerVel.set(0, -10, 0);
  simState.playerYaw = Math.PI;
  simState.playerHp = 100;
  simState.playerShield = 100;
  simState.stormRadius = 235;

  if (simState.brActive) {
    simState.eliminations = 0;
    simState.aliveCount = simState.botTargets.length + 1;
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
      bot.hitFlash = bot.muzzleFlash = bot.respawnTimer = 0;
    });
  }

  simState.stuntText = simState.brActive ? 'BATTLE ROYALE DROP · STEER INTO THE CITY' : 'SKYDROP · STEER YOUR PARACHUTE';
  simState.stuntTimer = 4.0;
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

export function VehicleDirector({ onHudUpdate }: Props) {
  const shadowTex = useMemo(() => createShadowTexture(), []);
  const canopyDetailTex = useMemo(() => createLimestonePBR(), []);

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
  const coastalMaterials = useRef(new Map<CoastalCharacter, { fabrics: THREE.MeshStandardMaterial[]; trousers: THREE.MeshStandardMaterial[] }>());
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

  // Speedboat bow spray & Jet contrails
  const boatSprayRef = useRef<THREE.Group>(null);
  const contrailLeftRef = useRef<THREE.Mesh>(null);
  const contrailRightRef = useRef<THREE.Mesh>(null);

  const previousPosition = useRef(new THREE.Vector3());
  const cameraOrbit = useRef({ yaw: 0, pitch: 0 });
  const footMotion = useRef({
    phase: 0, landing: 0, airborne: false, jumpHeld: false, speed: 0, directionX: 0, directionZ: 1,
  });
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
  };

  const selectWeaponSlot = (idx: number) => {
    const safeIdx = ((idx % WEAPON_SPECS.length) + WEAPON_SPECS.length) % WEAPON_SPECS.length;
    simState.activeWeaponIdx = safeIdx;
    const spec = WEAPON_SPECS[safeIdx];
    simState.ammo = spec.clipSize;
    simState.maxAmmo = spec.clipSize;
    simState.stuntText = 'WEAPON: ' + spec.name;
    simState.stuntTimer = 2.2;
    weaponMeshesRef.current.forEach((m, i) => {
      if (m) m.visible = i === safeIdx;
    });
    carWeaponMeshesRef.current.forEach((m, i) => {
      if (m) m.visible = i === safeIdx;
    });
  };

  const fireActiveWeapon = () => {
    if (simState.shotCooldown > 0 || simState.startMenuOpen || simState.customizerOpen || simState.controlsOpen) return;
    const spec = WEAPON_SPECS[simState.activeWeaponIdx] ?? WEAPON_SPECS[0];
    simState.shotCooldown = spec.fireRate;
    simState.firingTimer = 0.24;
    simState.ammo -= 1;
    if (simState.ammo <= 0) {
      simState.ammo = spec.clipSize;
    }
    soundEngine.playGunshot(spec.id);

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

    const azimuth = activeYaw + simState.orbitYaw;
    const elevation = THREE.MathUtils.clamp(-simState.orbitPitch + (simState.mode === 'PLANE' ? simState.planePitch : 0), -0.72, 0.65);
    const fwdX = Math.sin(azimuth);
    const fwdZ = Math.cos(azimuth);

    const from = new THREE.Vector3(
      activePos.x + fwdX * 1.2 + (simState.mode === 'FOOT' ? Math.cos(activeYaw) * 0.28 : 0),
      activePos.y + 1.35,
      activePos.z + fwdZ * 1.2 - (simState.mode === 'FOOT' ? Math.sin(activeYaw) * 0.28 : 0)
    );

    const direction = new THREE.Vector3(fwdX * Math.cos(elevation), Math.sin(elevation), fwdZ * Math.cos(elevation));

    // Find best alive BotTarget in simState.botTargets within spec.range and generous forward aim cone
    let bestBot = null as (typeof simState.botTargets)[0] | null;
    let bestScore = -Infinity;

    for (const bot of simState.botTargets) {
      if (!simState.brActive || !bot.alive) continue;
      const dx = bot.x - from.x;
      const dz = bot.z - from.z;
      const dist = Math.hypot(dx, dz);
      if (dist > spec.range || dist < 0.05) continue;
      const delta = new THREE.Vector3(dx, bot.y + 1.1 - from.y, dz);
      const distance = delta.length();
      const dot = delta.normalize().dot(direction);
      const inCone = dot > 0.96 || (distance < 14 && dot > 0.87);
      if (inCone) {
        const score = dot * 120 - dist * 0.45;
        if (score > bestScore) {
          bestScore = score;
          bestBot = bot;
        }
      }
    }

    const botPoint = bestBot ? new THREE.Vector3(bestBot.x, bestBot.y + 1.1, bestBot.z) : null;
    if (botPoint) direction.copy(botPoint).sub(from).normalize();
    const rayRange = botPoint ? from.distanceTo(botPoint) : spec.range;
    const sectionHit = traceWorld(from, direction, rayRange);
    const groundHit = traceGround(from, direction, rayRange);
    const worldHit = groundHit && (!sectionHit || groundHit.distance < sectionHit.distance) ? groundHit : sectionHit;
    let to: THREE.Vector3;
    if (worldHit) {
      to = worldHit.point;
      const result = damageWorld(worldHit, spec.damage);
      if (result?.destroyed && sectionHit?.section) {
        const { owner, label } = sectionHit.section;
        simState.stuntText = owner === label ? owner + ' · SECTION LOST' :
          (result.stage === 'critical' ? owner + ' · CRITICAL DAMAGE' : label.toUpperCase() + ' DESTROYED');
        simState.stuntTimer = 1.6;
      }
    } else if (bestBot && botPoint) {
      to = botPoint;
      let dmg = spec.damage;
      if (bestBot.shield > 0) {
        const shieldAbsorb = Math.min(bestBot.shield, dmg);
        bestBot.shield -= shieldAbsorb;
        dmg -= shieldAbsorb;
      }
      bestBot.hp = Math.max(0, bestBot.hp - dmg);
      bestBot.hitFlash = 0.22;

      if (bestBot.hp <= 0) {
        bestBot.alive = false;
        bestBot.parachuting = false;
        bestBot.respawnTimer = 9.0;
        simState.eliminations += 1;
        simState.aliveCount = Math.max(1, simState.aliveCount - 1);
        simState.chips += Math.round(500 * simState.multiplier);
        simState.playerShield = Math.min(100, simState.playerShield + 25);
        simState.killFeedText = 'ELIMINATED ' + bestBot.name + ' [' + spec.shortName + '] +$500';
        simState.killFeedTimer = 3.5;
        soundEngine.playHitMarker(true);
      } else {
        simState.killFeedText = 'HIT ' + bestBot.name + ' -' + spec.damage + ' HP [' + spec.shortName + ']';
        simState.killFeedTimer = 1.6;
        soundEngine.playHitMarker(false);
      }
    } else {
      to = from.clone().addScaledVector(direction, Math.min(160, spec.range));
    }

    simState.lastShotFrom = [from.x, from.y, from.z];
    simState.lastShotTo = [to.x, to.y, to.z];
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
    soundEngine.playRepair();
    simState.stuntText = 'VEHICLE REPAIRED · 100%';
    simState.stuntTimer = 2.5;
  };

  const registerVehicleImpact = (impactSpeedMps: number, hitPos: THREE.Vector3, sourceLabel: string, hit?: WorldHit) => {
    if (crashCooldownRef.current > 0 || impactSpeedMps <= 4.5) return;

    crashCooldownRef.current = 0.24;
    const severity = Math.min(1, (impactSpeedMps - 4.5) / 38);
    const aircraft = simState.aircraftDamage;
    const airborne = simState.mode === 'PLANE';
    const dmg = Math.round(5 + severity * (airborne ? 46 : 33));
    if (hit) damageWorld(hit, 14 + impactSpeedMps * (airborne ? 2.35 : 1.85));
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

    if (simState.vehicleHp <= 0) {
      simState.vehicleWrecked = true;
      simState.stuntText = airborne ? 'AIRCRAFT FAILURE · BRACE FOR IMPACT' : 'VEHICLE WRECKED · PRESS [H] TO REPAIR';
      simState.stuntTimer = 4.0;
    } else if (severity > 0.35) {
      simState.stuntText = `${sourceLabel} IMPACT -${dmg}% INTEGRITY`;
      simState.stuntTimer = 2.0;
    }
  };

  // Cycle between 5 Hero Cars, 6 Aircraft, 6 Boats/Ships, Character Customizer Studio, Parachute Sky-Drop & Weapons
  useEffect(() => {
    const s = simState as any;
    if (!s.activeCarName) s.activeCarName = CAR_NAMES[0];
    if (!s.activePlaneName) s.activePlaneName = PLANE_NAMES[0];
    if (!s.activeBoatName) s.activeBoatName = BOAT_NAMES[0];

    const cycleHeroCar = () => {
      const nextIdx = (activeCarIdxRef.current + 1) % CAR_NAMES.length;
      activeCarIdxRef.current = nextIdx;
      s.activeCarIdx = nextIdx;
      s.activeCarName = CAR_NAMES[nextIdx];
      Object.assign(simState.carDamage, { hp: 100, wrecked: false });
      simState.vehicleHp = 100;
      simState.vehicleWrecked = false;
      carRigsRef.current.forEach((rig, idx) => {
        if (rig) rig.wrapper.visible = idx === nextIdx;
      });
      simState.stuntText = 'VEHICLE: ' + CAR_NAMES[nextIdx];
      simState.stuntTimer = 2.5;
    };

    const cycleAircraft = () => {
      const nextIdx = (activePlaneIdxRef.current + 1) % PLANE_NAMES.length;
      activePlaneIdxRef.current = nextIdx;
      s.activePlaneIdx = nextIdx;
      s.activePlaneName = PLANE_NAMES[nextIdx];
      simState.aircraftDamage = freshAircraftDamage();
      simState.planeVel.set(0, 0, 0);
      simState.planeRoll = 0;
      simState.vehicleHp = 100;
      simState.vehicleWrecked = false;
      planeRigsRef.current.forEach((rig, idx) => {
        if (rig) rig.wrapper.visible = idx === nextIdx;
      });
      simState.stuntText = 'AIRCRAFT: ' + PLANE_NAMES[nextIdx];
      simState.stuntTimer = 2.5;
    };

    const cycleBoat = () => {
      const nextIdx = (activeBoatIdxRef.current + 1) % BOAT_NAMES.length;
      activeBoatIdxRef.current = nextIdx;
      s.activeBoatIdx = nextIdx;
      s.activeBoatName = BOAT_NAMES[nextIdx];
      Object.assign(simState.boatDamage, { hp: 100, wrecked: false });
      simState.vehicleHp = 100;
      simState.vehicleWrecked = false;
      boatRigsRef.current.forEach((rig, idx) => {
        if (rig) rig.wrapper.visible = idx === nextIdx;
      });
      simState.stuntText = 'VESSEL: ' + BOAT_NAMES[nextIdx];
      simState.stuntTimer = 2.5;
    };

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
        simState.stuntText = 'CHARACTER STUDIO // CUSTOMIZE HUMAN RIG & OUTFIT';
        simState.stuntTimer = 2.5;
      }
    };

    const onKeyDown = (e: KeyboardEvent) => {
      if (s.startMenuOpen || s.controlsOpen || (s.customizerOpen && e.code !== 'KeyC')) return;
      if (e.code === 'KeyV' && !e.repeat) {
        cycleHeroCar();
      } else if (e.code === 'KeyB' && !e.repeat) {
        cycleActiveFleetModel();
      } else if (e.code === 'KeyC' && !e.repeat) {
        toggleCharacterCustomizer();
      } else if (e.code === 'KeyP' && !e.repeat) {
        triggerBattleRoyaleDrop();
      } else if (e.code === 'KeyQ' && !e.repeat) {
        selectWeaponSlot(simState.activeWeaponIdx + 1);
      } else if (e.code === 'KeyH' && !e.repeat) {
        repairVehicle();
      } else if (e.code === 'KeyF') {
        fireActiveWeapon();
      }
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
    const onPointerDown = (e: PointerEvent) => {
      if (s.startMenuOpen || s.customizerOpen || s.controlsOpen || e.pointerType !== 'mouse' ||
          (e.target as HTMLElement | null)?.tagName !== 'CANVAS') return;
      if (e.button === 0) {
        mouseDownRef.current = true;
        fireActiveWeapon();
      } else if (e.button === 2) {
        mouseOrbitRef.current = { x: e.clientX, y: e.clientY };
      }
    };
    const onPointerMove = (e: PointerEvent) => {
      const drag = mouseOrbitRef.current;
      if (!drag) return;
      simState.orbitYaw -= (e.clientX - drag.x) * 0.006;
      simState.orbitPitch = THREE.MathUtils.clamp(simState.orbitPitch - (e.clientY - drag.y) * 0.006, -0.92, 0.96);
      drag.x = e.clientX;
      drag.y = e.clientY;
    };
    const onPointerUp = (e?: PointerEvent) => {
      if (!e || e.button === 0 || e.type === 'pointercancel') mouseDownRef.current = false;
      if (!e || e.button === 2 || e.type === 'pointercancel') mouseOrbitRef.current = null;
    };
    const onBlur = () => onPointerUp();
    const onContextMenu = (e: MouseEvent) => {
      if ((e.target as HTMLElement | null)?.tagName === 'CANVAS') e.preventDefault();
    };

    window.addEventListener('keydown', onKeyDown);
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
    window.addEventListener('pointerdown', onPointerDown);
    window.addEventListener('pointermove', onPointerMove);
    window.addEventListener('contextmenu', onContextMenu);
    window.addEventListener('pointerup', onPointerUp);
    window.addEventListener('pointercancel', onPointerUp);
    window.addEventListener('blur', onBlur);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
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

    for (const [archetype, spec] of Object.entries(COASTAL_CHARACTERS)) {
      gltfLoader.load(spec.url, (gltf) => {
        if (disposed || !soldierMountRef.current) return;
        const model = gltf.scene;
        const materials = { fabrics: [] as THREE.MeshStandardMaterial[], trousers: [] as THREE.MeshStandardMaterial[] };
        const collected = new Set<THREE.MeshStandardMaterial>();
        model.traverse((object) => {
          const mesh = object as THREE.Mesh;
          if (!mesh.isMesh) return;
          mesh.castShadow = true;
          mesh.receiveShadow = true;
          mesh.frustumCulled = false;
          if (Array.isArray(mesh.material) || !(mesh.material as THREE.MeshStandardMaterial).isMeshStandardMaterial) return;
          const finish = mesh.material as THREE.MeshStandardMaterial;
          if (collected.has(finish)) return;
          collected.add(finish);
          if (finish.name === 'Outfit Fabric') materials.fabrics.push(finish);
          if (finish.name === 'Utility Trousers') materials.trousers.push(finish);
        });
        const bounds = new THREE.Box3().setFromObject(model);
        const height = bounds.max.y - bounds.min.y;
        autoGroundAndCenter(model, spec.height / Math.max(0.2, height));
        const wrapper = new THREE.Group();
        wrapper.add(model);
        soldierMountRef.current.add(wrapper);
        coastalRigs.current.set(archetype as CoastalCharacter, createHumanoidRig(wrapper, model, gltf.animations));
        coastalMaterials.current.set(archetype as CoastalCharacter, materials);
        applyCharacterCustomization();
      });
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
      rpmRigRef.current = createHumanoidRig(wrapper, model);

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
      michelleRigRef.current = createHumanoidRig(wrapper, model);

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
      dracoLoader.dispose();
    };
  }, []);

  const walkingSurface = (pos: THREE.Vector3, step = 0.38) => {
    const deck = getTravelHeight(pos.x, pos.z, pos.y);
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
      if (isCar && Math.abs(hit.normal.y) < 0.8) simState.carSpeed *= normalSpeed > 12 ? -0.19 : 0.32;
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
      if (speed > 0) registerVehicleImpact(normalSpeed, hit.point, hit.section?.label.toUpperCase() ?? 'WORLD', hit);
    }

    const { approach, gate, halfWidth } = NORTH_BAY_BRIDGE;
    if (vehicle !== 'BOAT' && pos.z <= approach && pos.z > gate &&
        Math.abs(previous.x) < halfWidth + 0.5 && pos.y >= getBridgeHeight(pos.z) - 1.05 &&
        pos.y < getBridgeHeight(pos.z) + 1.2 && Math.abs(pos.x) > halfWidth - padding) {
      const normal = new THREE.Vector3(-Math.sign(pos.x), 0, 0);
      pos.x = -normal.x * (halfWidth - padding);
      if (isCar) simState.carSpeed *= 0.29;
      if (speed > 0) registerVehicleImpact(speed * Math.abs(direction.x), pos, 'GUARDRAIL',
        { point: pos.clone().setX(-normal.x * halfWidth).addScaledVector(UP, 0.65), normal, distance });
    }

    if ((pos.y < getTerrainHeight(pos.x, pos.z) + 11 || vehicle === 'BOAT') &&
        isConstructionClosed(pos.x, pos.z)) {
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
      if (vehicle === 'BOAT') simState.boatSpeed *= -0.25;
      if (isPlane) {
        simState.planeSpeed *= 0.45;
        simState.planeVel.y = Math.max(0, simState.planeVel.y);
        if (simState.aircraftDamage.state === 'wrecked') {
          pos.z = Math.max(pos.z, -347);
          pos.y = Math.max(getTravelHeight(pos.x, pos.z, pos.y) + 0.35, simState.tideOffset + 0.35);
          simState.aircraftDamage.settled = true;
        }
      }
      simState.stuntText = 'ISLAND II · UNDER CONSTRUCTION';
      simState.stuntTimer = 2.3;
    }

    // C. Rigid Car-to-Traffic Collisions (simState.trafficPositions)
    const traffic = simState.gameMode === 'GRAND_PRIX' ? simState.raceTraffic : simState.trafficPositions;
    if (isCar && traffic.length > 0) {
      const fwdX = Math.sin(simState.carYaw);
      const fwdZ = Math.cos(simState.carYaw);
      for (const [tx, , tz] of traffic) {
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
          registerVehicleImpact(Math.max(impactSpeed, 7.0), pos, 'TRAFFIC');
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

    // Sync active fleet indices if changed from HUD
    if (typeof s.activeCarIdx === 'number' && s.activeCarIdx !== activeCarIdxRef.current) {
      activeCarIdxRef.current = s.activeCarIdx;
      Object.assign(simState.carDamage, { hp: 100, wrecked: false });
      carRigsRef.current.forEach((rig, idx) => {
        if (rig) rig.wrapper.visible = idx === activeCarIdxRef.current;
      });
    }
    if (typeof s.activePlaneIdx === 'number' && s.activePlaneIdx !== activePlaneIdxRef.current) {
      activePlaneIdxRef.current = s.activePlaneIdx;
      simState.aircraftDamage = freshAircraftDamage();
      simState.planeVel.set(0, 0, 0);
      planeRigsRef.current.forEach((rig, idx) => {
        if (rig) rig.wrapper.visible = idx === activePlaneIdxRef.current;
      });
    }
    if (typeof s.activeBoatIdx === 'number' && s.activeBoatIdx !== activeBoatIdxRef.current) {
      activeBoatIdxRef.current = s.activeBoatIdx;
      Object.assign(simState.boatDamage, { hp: 100, wrecked: false });
      boatRigsRef.current.forEach((rig, idx) => {
        if (rig) rig.wrapper.visible = idx === activeBoatIdxRef.current;
      });
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
    simState.rouletteTimer -= dt;
    if (simState.rouletteTimer <= 0) {
      triggerRouletteSpin();
    }

    // Stunt banner countdown
    if (simState.stuntTimer > 0) {
      simState.stuntTimer = Math.max(0, simState.stuntTimer - dt);
      if (simState.stuntTimer === 0) {
        simState.stuntText = null;
      }
    }

    // Battle Royale timers, Damage/Shake decays & Storm ring shrink
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
    if (simState.killFeedTimer > 0) {
      simState.killFeedTimer = Math.max(0, simState.killFeedTimer - dt);
      if (simState.killFeedTimer === 0) {
        simState.killFeedText = null;
      }
    }
    if (simState.brActive && !simState.startMenuOpen) simState.stormRadius = Math.max(68, simState.stormRadius - dt * 0.85);

    const isCustomizerOpen = Boolean(s.customizerOpen);
    const isStartMenuOpen = Boolean(s.startMenuOpen);
    const isMenuOpen = Boolean(s.customizerOpen || s.startMenuOpen || simState.controlsOpen);
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

    if (!isMenuOpen && (keys.has('KeyF') || simState.touchKeys.has('KeyF') || mouseDownRef.current)) {
      fireActiveWeapon();
    }

    let speedKmh = 0;
    let activePos = simState.playerPos;
    let activeYaw = simState.playerYaw;
    let isDrifting = false;
    simState.carSweep.speed = 0;

    // 1. ON-FOOT + BATTLE ROYALE PARACHUTE SKY-DROP + FORTNITE GLIDER + CUSTOMIZER TURNTABLE
    if (simState.mode === 'FOOT') {
      const player = simState.playerPos;
      previous.copy(player);
      footStart.current.copy(player);
      const aim = !isCustomizerOpen && (mouseOrbitRef.current !== null || simState.firingTimer > 0 ||
        simState.gameMode === 'BATTLE_ROYALE' && !simState.gliding && !simState.parachuting);
      const verticalBefore = simState.playerVel.y;
      let groundY = Math.max(walkingSurface(player) + 0.08, simState.tideOffset);

      if (simState.parachuting) {
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
        groundY = Math.max(walkingSurface(player) + 0.08, simState.tideOffset);

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
          simState.stuntText = 'TOUCHDOWN! WEAPONS FREE [F TO FIRE / Q SWITCH GUN]';
          simState.stuntTimer = 3.0;
        }

        speedKmh = Math.round(Math.hypot(paraFwdSpeed, descentRate) * 3.2);
      } else {
        const moveSpeed = (boost ? 6.8 : 2.85) * throttleSens;
        const forward = fwd - back;
        const strafe = right - left;
        const travelYaw = simState.playerYaw + simState.orbitYaw;
        const directionX = Math.sin(travelYaw);
        const directionZ = Math.cos(travelYaw);
        const normalize = 1 / Math.max(1, Math.hypot(strafe, forward));
        const response = player.y > groundY + 0.2 ? 5 : 16;
        simState.playerVel.x = THREE.MathUtils.damp(simState.playerVel.x, (directionX * forward + directionZ * strafe) * moveSpeed * normalize, response, dt);
        simState.playerVel.z = THREE.MathUtils.damp(simState.playerVel.z, (directionZ * forward - directionX * strafe) * moveSpeed * normalize, response, dt);
        player.x += simState.playerVel.x * dt;
        player.z += simState.playerVel.z * dt;
        applyWorldCollisions(player, previous, 'FOOT');
        groundY = Math.max(walkingSurface(player) + 0.08, simState.tideOffset);
        const onGround = player.y <= groundY + 0.15 && simState.playerVel.y <= 0;
        if (!simState.gliding && !isMenuOpen) {
          const hasMotion = Math.hypot(simState.playerVel.x, simState.playerVel.z) > 0.28;
          const heading = aim ? travelYaw : hasMotion ? Math.atan2(simState.playerVel.x, simState.playerVel.z) : simState.playerYaw;
          const step = Math.atan2(Math.sin(heading - simState.playerYaw), Math.cos(heading - simState.playerYaw)) *
            (1 - Math.exp(-(aim ? 14 : 9) * dt));
          simState.playerYaw += step;
          simState.orbitYaw -= step;
        } else if (simState.gliding) simState.playerYaw += (left - right) * 1.65 * dt;

        // Stratosphere Sky-Jump Pad check
        const distStrat = Math.hypot(simState.playerPos.x - 10, simState.playerPos.z + 195);
        if (distStrat < 8 && simState.playerPos.y > 10) {
          simState.playerVel.y = 58;
          simState.gliding = true;
        }

        if (onGround) {
          simState.playerPos.y = groundY;
          simState.playerVel.y = 0;
          simState.gliding = false;
          if (space && !footMotion.current.jumpHeld) {
            simState.playerVel.y = 8.8;
            player.y += simState.playerVel.y * dt;
          }
        } else {
          if (space && simState.playerVel.y < -1.5) {
            simState.gliding = true;
          }
          const grav = simState.gliding ? -4.5 : -26;
          simState.playerVel.y = Math.max(
            simState.gliding ? -5.5 : -45,
            simState.playerVel.y + grav * dt
          );
          if (simState.gliding) {
            previous.copy(player);
            player.x += Math.sin(simState.playerYaw) * 19 * dt;
            player.z += Math.cos(simState.playerYaw) * 19 * dt;
            applyWorldCollisions(player, previous, 'FOOT');
          }
          previous.copy(player);
          player.y += simState.playerVel.y * dt;
          applyWorldCollisions(player, previous, 'FOOT');
        }

        speedKmh = Math.round(Math.hypot(simState.playerVel.x, simState.playerVel.z) * 3.6 + (simState.gliding ? 50 : 0));
      }

      activePos = simState.playerPos;
      activeYaw = simState.playerYaw;

      const groundedNow = player.y <= groundY + 0.18 && simState.playerVel.y <= 0.1;
      const motion = footMotion.current;
      if (groundedNow && motion.airborne) motion.landing = THREE.MathUtils.clamp(-verticalBefore / 13, 0.25, 1);
      motion.airborne = !groundedNow;
      motion.landing = Math.max(0, motion.landing - dt * 4.3);
      motion.jumpHeld = space;
      const movedX = player.x - footStart.current.x;
      const movedZ = player.z - footStart.current.z;
      const travel = Math.hypot(movedX, movedZ);
      const stepSpeed = !isCustomizerOpen && groundedNow ? Math.min(8, travel / Math.max(0.001, dt)) : 0;
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
      const pose = {
        dt, time: t, phase: motion.phase, speed: motion.speed,
        reverse: motion.directionZ < -0.24, lateral: motion.directionX,
        airborne: isCustomizerOpen ? undefined : simState.parachuting ? 'parachute' as const :
          simState.gliding ? 'glide' as const : motion.airborne ? 'jump' as const : undefined,
        fallSpeed: simState.playerVel.y, landing: motion.landing, aim: aim && groundedNow ? 1 : 0,
        recoil: Math.max(0, (simState.firingTimer - 0.15) / 0.09),
        lookPitch: simState.orbitPitch, lookYaw: THREE.MathUtils.clamp(simState.orbitYaw, -0.8, 0.8),
        ground: !isCustomizerOpen && groundedNow ? {
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
      if (accessoriesRootRef.current) accessoriesRootRef.current.position.y = playerRig?.wrapper.position.y ?? 0;
    }

    // 2. HERO SUPERCAR FLEET (FERRARI 458 / GT3 / WEDGE / MUSCLE / VIP LIMO + DRIFT + SNAPPY PHYSICS)
    if (simState.mode === 'CAR') {
      previous.copy(simState.carPos);
      const gridLocked = simState.gameMode === 'GRAND_PRIX' && simState.raceCountdown > 0;
      const throttleInput = gridLocked ? 0 : Math.max(fwd, touchThrottle) - back;
      const accelPower =
        (simState.vehicleWrecked
          ? 16
          : boost || simState.roulette === 'RED'
          ? 82
          : 52) * throttleSens;
      const accel = throttleInput * accelPower;
      simState.carSpeed += (brake ? 0 : accel) * dt;
      if (brake) simState.carSpeed = THREE.MathUtils.damp(simState.carSpeed, 0, 10.5, dt);

      // Snappy braking: when reversing/braking against current motion, stop on a dime
      if (!brake && throttleInput * simState.carSpeed < 0) {
        simState.carSpeed += throttleInput * 95 * dt;
      }

      simState.carSpeed *= Math.pow(
        simState.vehicleWrecked ? 0.14 : throttleInput === 0 ? 0.18 : 0.28,
        dt
      );
      simState.carSpeed = THREE.MathUtils.clamp(simState.carSpeed, -14, 74);
      if (simState.vehicleWrecked) {
        simState.carSpeed = THREE.MathUtils.clamp(simState.carSpeed, -7.5, 7.5);
      }

      isDrifting = !simState.vehicleWrecked && space && Math.abs(left - right) > 0.1 && Math.abs(simState.carSpeed) > 6;
      const driftTurnMult = isDrifting ? 1.55 : 1.0;
      // Easy Steering Assist gently dampens twitchy oversteer at high speed
      const highSpeedDamp = steerAssist
        ? Math.max(0.55, 1.0 - Math.abs(simState.carSpeed) / 95)
        : 1.0;
      const steer =
        (left - right) *
        2.85 *
        steerSens *
        highSpeedDamp *
        driftTurnMult *
        Math.min(1, Math.abs(simState.carSpeed) / 7 + 0.35) *
        (simState.carSpeed >= 0 ? 1 : -1);
      simState.carYaw += steer * dt;

      const impactSpeed = simState.carSpeed;
      // Powerslide lateral slip & drift score accumulation
      const slipAngle = isDrifting ? (left - right) * -0.28 : 0;
      simState.carPos.x += Math.sin(simState.carYaw + slipAngle) * simState.carSpeed * dt;
      simState.carPos.z += Math.cos(simState.carYaw + slipAngle) * simState.carSpeed * dt;

      if (isDrifting) {
        simState.driftScore += Math.round(Math.abs(simState.carSpeed) * dt * 15);
        simState.stuntText = 'DRIFTING // +' + simState.driftScore;
        simState.stuntTimer = 1.2;
      } else if (simState.stuntTimer === 0) {
        simState.driftScore = 0;
      }

      applyWorldCollisions(simState.carPos, previous, 'CAR');
      if (walkingSurface(simState.carPos) < simState.tideOffset + 0.08 &&
          getTravelHeight(previous.x, previous.z, previous.y) >= simState.tideOffset + 0.08) {
        const speed = Math.abs(simState.carSpeed);
        simState.carPos.copy(previous);
        simState.carSpeed *= -0.23;
        registerVehicleImpact(speed * 0.45, simState.carPos, 'SHORELINE');
      }

      // South Strip Stunt Ramp boost
      const rampDist = Math.hypot(simState.carPos.x - 6.5, simState.carPos.z - 86);
      const rampBoost = rampDist < 5.5 && Math.abs(simState.carSpeed) > 12 ? 5.2 : 0;

      const groundY = walkingSurface(simState.carPos);
      simState.carPos.y = THREE.MathUtils.lerp(
        simState.carPos.y,
        Math.max(groundY + 0.08 + rampBoost, simState.tideOffset + 0.1),
        1 - Math.exp(-22 * dt)
      );

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

    // 3. 6-VESSEL MARITIME & CRUISE LINER FLEET (GERSTNER WAVE BUOYANCY + RIGID SHORELINE)
    if (simState.mode === 'BOAT') {
      previous.copy(simState.boatPos);
      const marineThrottle = Math.max(fwd, touchThrottle) - back;
      const accel = marineThrottle * (simState.vehicleWrecked ? 14 : boost ? 68 : 44) * throttleSens;
      simState.boatSpeed += (brake || space ? 0 : accel) * dt;
      if (brake || space) simState.boatSpeed = THREE.MathUtils.damp(simState.boatSpeed, 0, 5.5, dt);
      else if (marineThrottle * simState.boatSpeed < 0) simState.boatSpeed += marineThrottle * 60 * dt;
      simState.boatSpeed *= Math.pow(simState.vehicleWrecked ? 0.2 : 0.32, dt);
      if (simState.vehicleWrecked) {
        simState.boatSpeed = THREE.MathUtils.clamp(simState.boatSpeed, -6, 6);
      }
      simState.boatYaw += (left - right) * 2.4 * steerSens * dt;

      const prevX = simState.boatPos.x;
      const prevZ = simState.boatPos.z;
      const nextX = prevX + Math.sin(simState.boatYaw) * simState.boatSpeed * dt;
      const nextZ = prevZ + Math.cos(simState.boatYaw) * simState.boatSpeed * dt;
      const nextGround = getTerrainHeight(nextX, nextZ);

      if (nextGround > 0.25) {
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
          registerVehicleImpact(impactSpeed, simState.boatPos, 'SHORELINE');
        }
      } else {
        simState.boatPos.x = nextX;
        simState.boatPos.z = nextZ;
      }

      applyWorldCollisions(simState.boatPos, previous, 'BOAT');
      const waveY = getWaveHeight(simState.boatPos.x, simState.boatPos.z, t) + simState.tideOffset;
      const terrainY = getTerrainHeight(simState.boatPos.x, simState.boatPos.z);
      simState.boatPos.y = Math.max(waveY + 0.15, terrainY + 0.15);

      // Soft open-ocean boundary turn-back so sailing far out curves smoothly back toward the island
      const boatRadius = Math.hypot(simState.boatPos.x, simState.boatPos.z);
      if (boatRadius > 660) {
        const toCenterYaw = Math.atan2(-simState.boatPos.x, -simState.boatPos.z);
        const yawDiff = Math.atan2(
          Math.sin(toCenterYaw - simState.boatYaw),
          Math.cos(toCenterYaw - simState.boatYaw)
        );
        const pull = THREE.MathUtils.clamp((boatRadius - 660) / 140, 0.15, 1.0);
        simState.boatYaw += yawDiff * Math.min(1, 2.4 * pull * dt);
        if (boatRadius > 820) {
          const clampScale = 820 / boatRadius;
          simState.boatPos.x *= clampScale;
          simState.boatPos.z *= clampScale;
        }
        if (simState.stuntTimer <= 0.2) {
          simState.stuntText = 'OPEN OCEAN HORIZON · TURNING BACK';
          simState.stuntTimer = 1.4;
        }
      }

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
      const onPad = plane.y <= Math.max(walkingSurface(plane), simState.tideOffset) + 0.55;
      const pitchInput = (fwd - back) * (invertFlightY ? -1 : 1);
      const turn = (left - right) * steerSens;
      const trimPull = failing ? trim * 0.45 + Math.sin(t * 8) * 0.075 : 0;
      const power = 0.35 + flyDamage.hull * 0.0065;
      const throttleDelta = Number(keys.has('KeyI')) - Number(keys.has('KeyK'));
      simState.planeThrottle = THREE.MathUtils.clamp(simState.planeThrottle + throttleDelta * dt * 0.63, 0, 1);

      if (!wrecked) {
        if (helicopter) {
          const thrust = brake ? 0 : Math.max(fwd, touchThrottle) * (boost ? 43 : 29) - back * 12;
          simState.planeSpeed = THREE.MathUtils.damp(simState.planeSpeed, thrust * power * throttleSens, 4.5, dt);
          simState.planePitch = THREE.MathUtils.damp(simState.planePitch, -(fwd - back) * 0.23, 5.5, dt);
          simState.planeVel.y = THREE.MathUtils.damp(simState.planeVel.y, (space ? 9.8 : brake ? -6 : 0) * power - (failing ? 2.5 : 0), 4.8, dt);
        } else {
          const step = fixedWingStep({
            dt, speed: simState.planeSpeed, pitch: simState.planePitch, verticalSpeed: simState.planeVel.y,
            throttle: Math.max(simState.planeThrottle, touchThrottle),
            pitchCommand: THREE.MathUtils.clamp(pitchInput + (space ? 0.54 : 0), -1, 1),
            takeoffPower: Math.max(fwd, touchThrottle, space ? 0.76 : 0, throttleDelta > 0 ? simState.planeThrottle : 0),
            grounded: onPad, brake, boost, autoLevel: steerAssist, integrity: flyDamage.hull,
            thrustSensitivity: throttleSens, steeringSensitivity: steerSens, failing,
          });
          simState.planeSpeed = step.speed;
          simState.planePitch = step.pitch;
          simState.planeVel.y = step.verticalSpeed;
        }
        simState.planeRoll = THREE.MathUtils.damp(simState.planeRoll, turn * (helicopter ? 0.31 : 0.58) + trimPull, 5.5, dt);
        simState.planeYaw += (turn * (helicopter ? 1.65 : 1.2) * power + trimPull * 0.42) * dt;
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

      plane.x += Math.sin(simState.planeYaw) * simState.planeSpeed * dt;
      plane.z += Math.cos(simState.planeYaw) * simState.planeSpeed * dt;
      plane.y += simState.planeVel.y * dt;
      applyWorldCollisions(plane, previous, 'PLANE');

      const terrain = Math.max(getTravelHeight(plane.x, plane.z, previous.y), simState.tideOffset + 0.18);
      const groundY = Math.max(terrain, walkingSurface(plane, 0.68)) + 0.25;
      if (plane.y <= groundY) {
        const descent = -simState.planeVel.y;
        const point = new THREE.Vector3(plane.x, groundY - 0.25, plane.z);
        if (descent > 5.3 && !flyDamage.settled) {
          if (wrecked) {
            damageWorld({ point, normal: UP, distance: 0 }, 115);
            simState.cameraShake = 1.2;
            simState.crashFlashTimer = 0.45;
            soundEngine.playCrash(1);
          } else {
            const groundHit = traceWorld(plane.clone().addScaledVector(UP, 1.3), DOWN, 2);
            registerVehicleImpact(descent + Math.abs(simState.planeSpeed) * 0.36, point, 'HARD LANDING',
              groundHit ?? { point, normal: UP, distance: 0 });
          }
          simState.planeSpeed *= 0.52;
        }
        if (flyDamage.state === 'wrecked' && !flyDamage.settled) {
          flyDamage.settled = true;
          simState.stuntText = 'CRASH LANDED · PRESS [H] TO REPAIR';
          simState.stuntTimer = 6;
        }
        plane.y = groundY;
        simState.planeVel.y = Math.max(0, simState.planeVel.y);
        if (!wrecked) simState.planePitch = Math.max(-0.025, simState.planePitch);
      }

      // Soft outer-airspace turn-back so flying far over the ocean smoothly banks back toward the city
      const planeRadius = Math.hypot(simState.planePos.x, simState.planePos.z);
      if (planeRadius > 700 && !wrecked) {
        const toCenterYaw = Math.atan2(-simState.planePos.x, -simState.planePos.z);
        const yawDiff = Math.atan2(
          Math.sin(toCenterYaw - simState.planeYaw),
          Math.cos(toCenterYaw - simState.planeYaw)
        );
        const pull = THREE.MathUtils.clamp((planeRadius - 700) / 180, 0.2, 1.0);
        simState.planeYaw += yawDiff * Math.min(1, 2.2 * pull * dt);
        simState.planeRoll = THREE.MathUtils.lerp(
          simState.planeRoll,
          THREE.MathUtils.clamp(yawDiff * 0.9, -0.75, 0.75),
          4.0 * dt
        );
        if (planeRadius > 920) {
          const clampScale = 920 / planeRadius;
          simState.planePos.x *= clampScale;
          simState.planePos.z *= clampScale;
        }
        if (simState.stuntTimer <= 0.2) {
          simState.stuntText = 'OPEN OCEAN AIRSPACE · RETURNING TO CITY';
          simState.stuntTimer = 1.4;
        }
      }
      if (simState.planePos.y > 260) {
        simState.planePos.y = THREE.MathUtils.lerp(simState.planePos.y, 260, 2.5 * dt);
        simState.planePitch = Math.min(simState.planePitch, -0.05);
      }

      simState.playerPos.copy(simState.planePos);
      speedKmh = Math.round(simState.planeSpeed * 3.6);
      activePos = simState.planePos;
      activeYaw = simState.planeYaw;
    }

    if (simState.vehicleHp < 100 && (simState.mode === 'CAR' || simState.mode === 'PLANE') &&
        REPAIR_BAY_COORDS.some(([x, z]) => Math.hypot(activePos.x - x, activePos.z - z) < 6.3 &&
          activePos.y < getTerrainHeight(x, z) + 4.2)) {
      repairVehicle();
    }

    // 5. GRAND PRIX TIME-TRIAL LOOP & CHECKPOINT TELEMETRY
    if (simState.gameMode === 'GRAND_PRIX' && !simState.startMenuOpen) {
      if (simState.raceCountdown > 0) {
        simState.raceCountdown = Math.max(0, simState.raceCountdown - dt);
        if (simState.raceCountdown === 0) {
          simState.stuntText = 'GO';
          simState.stuntTimer = 1;
        }
      } else {
        simState.lapTime += dt;
        simState.raceElapsed += dt;
      }
    }
    const currentGate = simState.checkpoints[simState.activeCheckpoint];
    if (currentGate && simState.mode === 'CAR' && simState.gameMode === 'GRAND_PRIX' && !simState.startMenuOpen && simState.raceCountdown === 0) {
      const distToGate = Math.hypot(activePos.x - currentGate.position[0], activePos.z - currentGate.position[2]);
      const heading = Math.cos(simState.carYaw - currentGate.yaw);
      if (distToGate < 6.1 && heading > 0.25 && simState.carSpeed > 2) {
        const passedGate = currentGate;
        simState.activeCheckpoint = (simState.activeCheckpoint + 1) % simState.checkpoints.length;
        simState.chips += Math.round(250 * simState.multiplier);
        simState.stuntText = 'CHECKPOINT // ' + passedGate.name;
        simState.stuntTimer = 2.0;
        soundEngine.playChipPickup(true);

        if (simState.activeCheckpoint === 0) {
          simState.lapCount += 1;
          if (simState.bestLapTime === null || simState.lapTime < simState.bestLapTime) {
            simState.bestLapTime = simState.lapTime;
          }
          simState.lapTime = 0;
        }
      }
    }

    // Sync Meshes & Vehicle Articulation
    if (playerRef.current) {
      playerRef.current.visible = simState.mode === 'FOOT';
      playerRef.current.position.copy(simState.playerPos);
      playerRef.current.rotation.y = simState.playerYaw;
    }
    if (gliderRef.current) {
      gliderRef.current.visible = simState.mode === 'FOOT' && simState.gliding && !simState.parachuting;
    }
    if (parachuteRef.current) {
      parachuteRef.current.visible = simState.mode === 'FOOT' && simState.parachuting;
    }

    // Sync Active 3D Weapon Visibility & Recoil Kickback (hide weapon in Character Studio closeup so outfit is clear)
    const recoilOffset = -Math.max(0, simState.firingTimer - 0.16) * 1.1;
    if (weaponMountRef.current) {
      weaponMountRef.current.visible = !isCustomizerOpen && !simState.gliding && !simState.parachuting && (mouseOrbitRef.current !== null || simState.firingTimer > 0 || simState.gameMode === 'BATTLE_ROYALE');
      weaponMountRef.current.position.set(-0.13, 1.23, 0.42 + recoilOffset);
      weaponMountRef.current.rotation.x = simState.orbitPitch * 0.45;
    }
    if (carWeaponMountRef.current) {
      carWeaponMountRef.current.visible = simState.mode === 'CAR' && (simState.firingTimer > 0 || simState.gameMode === 'BATTLE_ROYALE');
      carWeaponMountRef.current.position.set(0, 1.38, 0.15 + recoilOffset);
    }
    weaponMeshesRef.current.forEach((m, idx) => {
      if (m) m.visible = idx === simState.activeWeaponIdx;
    });
    carWeaponMeshesRef.current.forEach((m, idx) => {
      if (m) m.visible = idx === simState.activeWeaponIdx;
    });

    // Ballistic Laser/Tracer Bolt, Muzzle Flash Star & Impact Blast Sphere
    const isFiringNow = simState.firingTimer > 0;
    const activeWeaponSpec = WEAPON_SPECS[simState.activeWeaponIdx] ?? WEAPON_SPECS[0];
    if (tracerMeshRef.current && muzzleFlashRef.current && impactMeshRef.current) {
      tracerMeshRef.current.visible = isFiringNow;
      muzzleFlashRef.current.visible = isFiringNow;
      impactMeshRef.current.visible = isFiringNow;

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
        const flashScale = 0.8 + (simState.firingTimer / 0.11) * 0.7;
        muzzleFlashRef.current.scale.setScalar(flashScale);

        impactMeshRef.current.position.copy(toV);
        impactMeshRef.current.scale.setScalar(0.65 + (1 - simState.firingTimer / 0.11) * 1.35);

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

    if (carRef.current) {
      carRef.current.visible = !isCustomizerOpen;
      carRef.current.position.copy(simState.carPos);
      carRef.current.rotation.y = simState.carYaw + (isDrifting ? (left - right) * 0.18 : 0);
    }

    // Active GLB Hero Car Wheel Spin, Front Wheel Steering & Steering Wheel Articulation
    const targetWheelSteer = simState.mode === 'CAR' ? (left - right) * 0.38 : 0;
    const activeRig = carRigsRef.current[activeCarIdxRef.current];
    if (activeRig) {
      for (const sNode of activeRig.steerNodes) {
        sNode.rotation.y = THREE.MathUtils.lerp(sNode.rotation.y, targetWheelSteer, Math.min(1, 14 * dt));
      }
      for (const wNode of activeRig.wheels) {
        wNode.rotation.x += simState.carSpeed * dt * 2.6 * activeRig.spinSign;
      }
      if (activeRig.steeringWheel) {
        activeRig.steeringWheel.rotation.z = THREE.MathUtils.lerp(
          activeRig.steeringWheel.rotation.z,
          -targetWheelSteer * 2.2,
          Math.min(1, 14 * dt)
        );
      }
      if (activeRig.brakeMat) {
        activeRig.brakeMat.emissiveIntensity = simState.mode === 'CAR' && back > 0 ? 4.8 : 1.8;
      }
    }

    // Supercar Brake Lights & Dual Nitrous Boost Flames
    if (taillightMatRef.current) {
      taillightMatRef.current.emissiveIntensity = simState.mode === 'CAR' && back > 0 ? 4.8 : 1.8;
    }
    const showBoostFlames = simState.mode === 'CAR' && (boost || simState.roulette === 'RED');
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
    const showTireSmoke = simState.mode === 'CAR' && (isDrifting || (boost && Math.abs(simState.carSpeed) > 10));
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
    const showHoodSmoke = simState.carDamage.hp < 65;
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

    const showHoodFire = simState.carDamage.hp < 32;
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

    if (boatRef.current) {
      boatRef.current.position.copy(simState.boatPos);
      const pitchWaveAmp = activeBoatIdxRef.current === 1 ? 0.015 : 0.04;
      const rollWaveAmp = activeBoatIdxRef.current === 1 ? 0.018 : 0.05;
      boatRef.current.rotation.set(
        Math.sin(t * 2.5) * pitchWaveAmp,
        simState.boatYaw,
        Math.cos(t * 2.1) * rollWaveAmp
      );
    }
    // Spin propellers / submarine thrusters across all 6 Boat Fleet rigs
    const boatSpinRate = dt * (4.0 + Math.abs(simState.boatSpeed) * 1.6);
    boatRigsRef.current.forEach((rig) => {
      if (!rig) return;
      for (const node of rig.spinNodesZ) {
        node.rotation.z += boatSpinRate;
      }
    });

    if (boatSprayRef.current) {
      const boatSpdRatio = Math.min(1.4, Math.abs(simState.boatSpeed) / 22);
      boatSprayRef.current.visible = boatSpdRatio > 0.08;
      boatSprayRef.current.scale.set(
        0.8 + boatSpdRatio * 0.55,
        0.6 + boatSpdRatio * (0.75 + Math.sin(t * 18) * 0.18),
        0.8 + boatSpdRatio * 0.65
      );
    }

    if (planeRef.current) {
      planeRef.current.position.copy(simState.planePos);
      planeRef.current.rotation.order = 'YXZ';
      planeRef.current.rotation.set(-simState.planePitch, simState.planeYaw, simState.planeRoll);
    }
    // Spin helicopter main/tail rotors, fighter propellers, turboprops & airliner turbofans across all 6 Aircraft rigs
    const planeSpinRate = dt * (simState.aircraftDamage.settled ? 0.5 : simState.mode === 'PLANE' ? 8 + simState.aircraftDamage.hull * 0.2 : 8);
    planeRigsRef.current.forEach((rig) => {
      if (!rig) return;
      if (rig.rotorMain) rig.rotorMain.rotation.y += planeSpinRate;
      if (rig.rotorTail) rig.rotorTail.rotation.x += planeSpinRate * 1.35;
      for (const node of rig.spinNodesZ) {
        node.rotation.z += planeSpinRate;
      }
    });

    if (propRef.current) {
      propRef.current.rotation.z += dt * (simState.mode === 'PLANE' ? 35 : 4);
      const jetBoostScale = simState.mode === 'PLANE' ? 0.9 + Math.sin(t * 42) * 0.25 : 0.4;
      propRef.current.scale.set(1, jetBoostScale, 1);
    }
    const contrailScale = simState.mode === 'PLANE' ? Math.max(0.3, simState.planeSpeed / 36) : 0.15;
    if (contrailLeftRef.current) {
      contrailLeftRef.current.visible = simState.mode === 'PLANE' && simState.aircraftDamage.state === 'sound';
      contrailLeftRef.current.scale.set(1, 1, contrailScale * (1 + Math.sin(t * 24) * 0.08));
    }
    if (contrailRightRef.current) {
      contrailRightRef.current.visible = simState.mode === 'PLANE' && simState.aircraftDamage.state === 'sound';
      contrailRightRef.current.scale.set(1, 1, contrailScale * (1 + Math.cos(t * 24) * 0.08));
    }

    // Chip & Aerial Ring Collection
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
        simState.stuntText = 'LOOT CRATE OPENED: FULL SHIELD & AMMO!';
        simState.stuntTimer = 2.5;
      }
    }

    soundEngine.updateEngine(simState.mode, speedKmh);

    // Camera Choreography: Start Menu Panoramic Orbit, Character Studio Camera, OR Snappy Chase Camera
    if (isStartMenuOpen) {
      const raceCar = new THREE.Vector3();
      const yaw = sampleGrandPrix(t * 27.2 + Math.sin(t * 0.79) * 2 + 14, raceCar, -1.9);
      const shot = Math.floor(t / 8) % 3;
      const side = shot === 1 ? -1 : 1;
      const back = shot === 2 ? 8 : 12;
      const desiredOrbitCam = raceCar.clone().add(new THREE.Vector3(
        -Math.sin(yaw) * back + Math.cos(yaw) * side * (shot === 2 ? 6 : 10),
        shot === 2 ? 17 : 7,
        -Math.cos(yaw) * back - Math.sin(yaw) * side * (shot === 2 ? 6 : 10),
      ));
      const wideScreen = state.size.width >= 650;
      const eyeDir = raceCar.clone().sub(desiredOrbitCam).normalize();
      const focus = raceCar.clone().add(new THREE.Vector3(eyeDir.z, 0, -eyeDir.x).multiplyScalar(wideScreen ? 3.8 : 0));
      focus.y += 1.4;
      if (state.camera.position.distanceToSquared(desiredOrbitCam) > 680) {
        state.camera.position.copy(desiredOrbitCam);
        camTarget.current.copy(focus);
      } else {
        state.camera.position.lerp(desiredOrbitCam, 1 - Math.exp(-8.5 * dt));
        camTarget.current.lerp(focus, 1 - Math.exp(-10.5 * dt));
      }
      state.camera.lookAt(camTarget.current);

      if (state.camera instanceof THREE.PerspectiveCamera) {
        if (Math.abs(state.camera.fov - 56) > 0.05) {
          state.camera.fov = THREE.MathUtils.lerp(state.camera.fov, 56, Math.min(1, 5 * dt));
          state.camera.updateProjectionMatrix();
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
    } else {
      const isPara = simState.mode === 'FOOT' && simState.parachuting;
      const isCruiseShip = simState.mode === 'BOAT' && activeBoatIdxRef.current === 1;
      const camDist = isPara
        ? 11.5
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
        : simState.mode === 'PLANE'
        ? 6.5
        : simState.mode === 'CAR'
        ? 3.5
        : isCruiseShip
        ? 7.8
        : simState.mode === 'BOAT'
        ? 4.2
        : 1.95;
      const lookOffset = isPara ? 0.65 : isCruiseShip ? 2.6 : 1.25;
      const subject = new THREE.Vector3(activePos.x, activePos.y + lookOffset, activePos.z);
      const warped = camTarget.current.distanceToSquared(subject) > 70 * 70;
      const orbit = cameraOrbit.current;
      const yawDelta = Math.atan2(Math.sin(simState.orbitYaw - orbit.yaw), Math.cos(simState.orbitYaw - orbit.yaw));
      orbit.yaw += yawDelta * (warped ? 1 : 1 - Math.exp(-19 * dt));
      orbit.pitch = warped ? simState.orbitPitch : THREE.MathUtils.damp(orbit.pitch, simState.orbitPitch, 19, dt);
      const yaw = activeYaw + orbit.yaw;
      const range = camDist * [1, 0.62, 1.53][simState.cameraView];
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
      let clearance = constrainCamera(subject, ideal, cameraRay);
      if (simState.mode === 'FOOT' && clearance < 1.7) {
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

      // Speed-reactive dynamic FOV (60° -> 73° at high speed/boost)
      if (state.camera instanceof THREE.PerspectiveCamera) {
        const targetFov = 60 + Math.min(13, (speedKmh / 160) * 13);
        if (Math.abs(state.camera.fov - targetFov) > 0.05) {
          state.camera.fov = THREE.MathUtils.lerp(state.camera.fov, targetFov, Math.min(1, 8 * dt));
          state.camera.updateProjectionMatrix();
        }
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
        fps: currentFps.current,
        gliding: simState.gliding,
        activeCheckpoint: simState.activeCheckpoint,
        checkpointName: activeGate.name,
        checkpointDist,
        lapTime: simState.lapTime,
        raceCountdown: simState.raceCountdown,
        bestLapTime: simState.bestLapTime,
        lapCount: simState.lapCount,
        driftScore: simState.driftScore,
        stuntText: simState.stuntText,
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
        killFeedText: simState.killFeedText,
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
      {/* CUSTOMIZABLE HIGH-RES HUMAN PLAYER (READY PLAYER ME + MICHELLE VIP + VANGUARD SOLDIER) + 3D ACCESSORIES */}
      <group ref={playerRef}>
        <mesh position={[0, 0.03, 0]} rotation={[-Math.PI / 2, 0, 0]}>
          <planeGeometry args={[1.6, 1.6]} />
          <meshBasicMaterial map={shadowTex} transparent depthWrite={false} />
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
        <cylinderGeometry args={[0.055, 0.055, 1, 8]} />
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
          <octahedronGeometry args={[0.36, 0]} />
          <meshStandardMaterial
            ref={muzzleFlashMatRef}
            color="#fde047"
            emissive="#f59e0b"
            emissiveIntensity={5.0}
          />
        </mesh>
      </group>
      <mesh ref={impactMeshRef} visible={false}>
        <sphereGeometry args={[0.42, 10, 10]} />
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
