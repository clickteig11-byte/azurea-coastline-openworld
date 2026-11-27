import { SkidMarks } from './components/SkidMarks';
import { construction } from './game/building';
import { LobbyStage } from './components/LobbyStage';
import { Construction } from './components/Construction';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import * as THREE from 'three';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { createProceduralEnvMap } from './components/Textures';
import {
  SkyDome,
  StylizedOcean,
  IslandTerrain,
  VegasStripDetails,
  InstancedFoliage,
  VegasLandmarks,
  ChipCollectibles,
  LandmarkBeacons,
  createAtmosphereTarget,
  resolveAtmosphereTarget,
} from './components/World';
import { VehicleDirector, triggerRouletteSpin } from './components/Vehicles';
import { CoastalDestinations } from './components/CoastalDestinations';
import { QuirkyWorld } from './components/QuirkyWorld';
import { coastalReaction, interactCoast, quack } from './game/coastalPlay';
import { DUCK } from './game/quirky';
import { soundEngine } from './game/soundEngine';
import { traceWorld } from './game/worldDamage';
import { NorthBay } from './components/NorthBay';
import { AmusementPark } from './components/AmusementPark';
import { CoastRoad } from './components/CoastRoad';
import { GrandPrixCourse } from './components/GrandPrix';
import { CoastalCity } from './components/City';
import { WorldEffects } from './components/WorldEffects';
import { LivingWorldNPCs } from './components/NPCs';
import { HUD } from './components/HUD';
import { GameHudSnapshot, boardAmusementRide, exitAmusementRide, requestGamePointerLock, simState } from './game/store';
import { LOBBY_THEMES } from './game/lobbyThemes';
import { getTerrainHeight, getTravelHeight, VehicleMode } from './game/worldMath';

function PerformanceGovernor() {
  const { setDpr, viewport } = useThree();
  const times = useRef<number[]>([]);
  const lastCheck = useRef(Date.now());
  const dpr = useRef(viewport.dpr);

  useFrame((_, delta) => {
    const quality = simState.controlSettings.graphics;
    const maximum = quality === 'Performance' ? 0.85 : quality === 'High' ? 1.35 : 1.12;
    if (dpr.current > maximum) {
      dpr.current = maximum;
      setDpr(maximum);
    }
    times.current.push(delta);
    if (times.current.length > 30) times.current.shift();
    if (Date.now() - lastCheck.current > 2000) {
      const avg = times.current.reduce((a, b) => a + b, 0) / times.current.length;
      if (avg > 0.024 && dpr.current > 0.8) {
        dpr.current = Math.max(0.8, dpr.current - 0.1);
        setDpr(dpr.current);
      } else if (avg < 0.017 && dpr.current < maximum) {
        dpr.current = Math.min(maximum, dpr.current + 0.1);
        setDpr(dpr.current);
      }
      lastCheck.current = Date.now();
    }
  });
  return null;
}

function ProceduralEnvMap() {
  const { gl, scene } = useThree();
  useEffect(() => {
    const env = createProceduralEnvMap(gl);
    scene.environment = env;
    return () => {
      scene.environment = null;
      env.dispose();
    };
  }, [gl, scene]);
  return null;
}

function CoastalLighting() {
  const initialTheme = LOBBY_THEMES.SUNLIT_RIVIERA;
  const hemiRef = useRef<THREE.HemisphereLight>(null);
  const light = useRef<THREE.DirectionalLight>(null);
  const fillRef = useRef<THREE.DirectionalLight>(null);
  const fogRef = useRef<THREE.Fog>(null);
  const target = useRef<THREE.Object3D>(null);
  const atm = useMemo(createAtmosphereTarget, []);
  const sunDirRef = useRef(new THREE.Vector3(...initialTheme.sunDir).normalize());
  const initialSunPos = useMemo<[number, number, number]>(
    () => [initialTheme.sunDir[0] * 142, initialTheme.sunDir[1] * 142, initialTheme.sunDir[2] * 142],
    []
  );
  const quality = useRef({ elapsed: 0, interval: 0.065, average: 0.017 });
  const desktop = typeof window !== 'undefined' && !window.matchMedia('(pointer: coarse)').matches;

  const halfSize = desktop ? 68 : 54;
  const initialShadowSize = desktop ? 2048 : 512;

  useFrame(({ gl, camera, scene }, dt) => {
    const damp = 1 - Math.exp(-6.0 * Math.min(dt, 0.1));
    resolveAtmosphereTarget(atm);
    const { theme } = atm;

    if (hemiRef.current) {
      hemiRef.current.color.lerp(atm.hemiSky, damp);
      hemiRef.current.groundColor.lerp(atm.hemiGround, damp);
      hemiRef.current.intensity = THREE.MathUtils.lerp(hemiRef.current.intensity, theme.hemiIntensity, damp);
    }

    sunDirRef.current.lerp(atm.sunDir, damp).normalize();

    if (light.current) {
      light.current.color.lerp(atm.dirColor, damp);
      light.current.intensity = THREE.MathUtils.lerp(light.current.intensity, theme.dirIntensity, damp);
    }

    if (fillRef.current) {
      fillRef.current.color.lerp(atm.fillColor, damp);
      fillRef.current.intensity = THREE.MathUtils.lerp(fillRef.current.intensity, theme.fillIntensity, damp);
    }

    if (fogRef.current) {
      fogRef.current.color.lerp(atm.fogColor, damp);
      fogRef.current.near = THREE.MathUtils.lerp(fogRef.current.near, theme.fogNear, damp);
      fogRef.current.far = THREE.MathUtils.lerp(fogRef.current.far, theme.fogFar, damp);
    }

    gl.toneMappingExposure = THREE.MathUtils.lerp(gl.toneMappingExposure, theme.exposure, damp);
    scene.environmentIntensity = THREE.MathUtils.lerp(scene.environmentIntensity, atm.envIntensity, damp);

    if (!light.current || !target.current) return;
    if (gl.shadowMap.enabled) {
      const timing = quality.current;
      timing.average = THREE.MathUtils.lerp(timing.average, Math.min(0.12, dt), 0.024);
      timing.elapsed += dt;
      const interval = timing.average > 0.038 ? 0.22 : timing.interval;
      if (timing.elapsed < interval) {
        light.current.position.copy(target.current.position).addScaledVector(sunDirRef.current, 142);
        return;
      }
      timing.elapsed = 0;
      const focus = simState.startMenuOpen ? camera.position : simState.mode === 'CAR' ? simState.carPos : simState.mode === 'PLANE' ? simState.planePos :
        simState.mode === 'BOAT' ? simState.boatPos : simState.playerPos;
      const shadow = light.current.shadow;
      const resolution = desktop ? (simState.controlSettings.graphics === 'Performance' ? 1024 : 2048) : 512;
      if (shadow.mapSize.x !== resolution) {
        shadow.mapSize.setScalar(resolution);
        shadow.map?.dispose();
        shadow.map = null;
      }
      const texel = 2 * halfSize / resolution;
      target.current.position.set(Math.round(focus.x / texel) * texel, Math.min(focus.y, 28), Math.round(focus.z / texel) * texel);
      target.current.updateMatrixWorld();
      light.current.position.copy(target.current.position).addScaledVector(sunDirRef.current, 142);
      light.current.target = target.current;
      gl.shadowMap.autoUpdate = false;
      gl.shadowMap.needsUpdate = true;
    } else {
      light.current.position.copy(target.current.position).addScaledVector(sunDirRef.current, 142);
    }
  });

  return (
    <>
      <object3D ref={target} />
      <fog ref={fogRef} attach="fog" args={[initialTheme.fogColor, initialTheme.fogNear, initialTheme.fogFar]} />
      <hemisphereLight ref={hemiRef} args={[initialTheme.hemiSky, initialTheme.hemiGround, initialTheme.hemiIntensity]} />
      <directionalLight ref={light} position={initialSunPos} intensity={initialTheme.dirIntensity}
        color={initialTheme.dirColor} castShadow shadow-mapSize-width={initialShadowSize}
        shadow-mapSize-height={initialShadowSize} shadow-camera-near={10} shadow-camera-far={260}
        shadow-camera-left={-halfSize} shadow-camera-right={halfSize} shadow-camera-top={halfSize}
        shadow-camera-bottom={-halfSize} shadow-normalBias={0.08} shadow-bias={-0.00022}
        shadow-radius={2.2} shadow-intensity={0.83} />
      <directionalLight ref={fillRef} position={[35, 24, 55]} intensity={initialTheme.fillIntensity} color={initialTheme.fillColor} />
    </>
  );
}

const GameWorld = React.memo(function GameWorld({ onHudUpdate }: { onHudUpdate: (hud: GameHudSnapshot) => void }) {
  return (
    <>
      <ProceduralEnvMap />
      <PerformanceGovernor />
      <CoastalLighting />

      <SkyDome />
      <IslandTerrain />
      <CoastRoad />
      <NorthBay />
      <CoastalDestinations />
      <QuirkyWorld />
      <AmusementPark />
      <CoastalCity />
      <GrandPrixCourse />
      <WorldEffects />
      <SkidMarks />
      <Construction />
      <LobbyStage />
      <VegasStripDetails />
      <InstancedFoliage />
      <VegasLandmarks />
      <StylizedOcean />
      <ChipCollectibles />
      <LandmarkBeacons />
      <LivingWorldNPCs />
      <VehicleDirector onHudUpdate={onHudUpdate} />
    </>
  );
});

export function App() {
  const [softwareRenderer, setSoftwareRenderer] = useState(false);
  const [hud, setHud] = useState<GameHudSnapshot>({
    mode: 'FOOT',
    speedKmh: 0,
    altitude: 8,
    chips: 0,
    multiplier: 1,
    roulette: 'IDLE',
    rouletteTimer: 45,
    nearbyVehicle: null,
    nearLandmark: null,
    fps: 60,
    gliding: false,
  });

  const switchMode = useCallback((next: VehicleMode) => {
    if (simState.activeRide) exitAmusementRide();
    if (next === simState.mode) return;
    const prevPos =
      simState.mode === 'CAR'
        ? simState.carPos
        : simState.mode === 'BOAT'
        ? simState.boatPos
        : simState.mode === 'PLANE'
        ? simState.planePos
        : simState.playerPos;
    const prevYaw =
      simState.mode === 'CAR'
        ? simState.carYaw
        : simState.mode === 'BOAT'
        ? simState.boatYaw
        : simState.mode === 'PLANE'
        ? simState.planeYaw
        : simState.playerYaw;

    if (next === 'FOOT') {
      if (simState.mode === 'PLANE' && simState.planePos.y > 18) {
        simState.gliding = true;
        simState.parachuting = false;
        simState.playerPos.copy(simState.planePos);
        simState.playerYaw = simState.planeYaw;
        simState.playerVel.set(0, Math.min(simState.planeVel.y, -1.5), 0);
      } else if (simState.mode === 'CAR') {
        simState.parachuting = false;
        simState.gliding = false;
        const right = new THREE.Vector3(Math.cos(prevYaw), 0, -Math.sin(prevYaw));
        const behind = new THREE.Vector3(-Math.sin(prevYaw), 0, -Math.cos(prevYaw));
        const origin = prevPos.clone().add(new THREE.Vector3(0, 1.05, 0));
        const supports = [right, right.clone().negate(), behind];
        const exit = supports.map((direction) => {
          const point = prevPos.clone().addScaledVector(direction, 5.2);
          point.y = getTravelHeight(point.x, point.z, prevPos.y + 0.65) + 0.08;
          return { point, direction };
        }).find(({ point, direction }) => point.y > simState.tideOffset + 0.12 &&
          Math.abs(point.y - prevPos.y) < 1.65 && !traceWorld(origin, direction, 5.55, 0.35,
            (hit) => Math.abs(hit.normal.y) < 0.65));
        if (!exit) return;
        simState.playerPos.copy(exit.point);
        simState.playerYaw = prevYaw;
        simState.playerVel.set(0, 0, 0);
      } else {
        simState.parachuting = false;
        simState.gliding = false;
        const groundY = getTravelHeight(prevPos.x, prevPos.z, prevPos.y) + 0.08;
        simState.playerPos.set(prevPos.x, Math.max(groundY, simState.tideOffset), prevPos.z);
        simState.playerYaw = prevYaw;
        simState.playerVel.set(0, 0, 0);
      }
    } else if (next === 'CAR') {
      simState.parachuting = false;
      simState.gliding = false;
      const surface = getTravelHeight(prevPos.x, prevPos.z, prevPos.y);
      if (simState.carPos.distanceTo(prevPos) > 18 && surface > simState.tideOffset + 0.08) {
        const groundY = surface + 0.08;
        simState.carPos.set(prevPos.x, groundY, prevPos.z);
        simState.carYaw = prevYaw;
      }
    } else if (next === 'BOAT') {
      simState.parachuting = false;
      simState.gliding = false;
      if (simState.boatPos.distanceTo(prevPos) > 14 ||
          getTerrainHeight(simState.boatPos.x, simState.boatPos.z) > simState.tideOffset - 0.6) {
        let spawn: { x: number; z: number; yaw: number } | undefined;
        for (let distance = 8; distance <= 620 && !spawn; distance += 6) {
          for (const offset of [0, 0.26, -0.26, 0.52, -0.52, 0.79, -0.79, 1.05, -1.05, 1.57, -1.57, 2.1, -2.1, Math.PI]) {
            const yaw = prevYaw + offset;
            const x = prevPos.x + Math.sin(yaw) * distance;
            const z = prevPos.z + Math.cos(yaw) * distance;
            if (getTerrainHeight(x, z) > simState.tideOffset - 2.1 ||
                getTravelHeight(x, z) > simState.tideOffset + 0.6) continue;
            const origin = new THREE.Vector3(x, simState.tideOffset + 0.55, z);
            if (traceWorld(origin, new THREE.Vector3(Math.sin(yaw), 0, Math.cos(yaw)), 8, 1.1)) continue;
            spawn = { x, z, yaw };
            break;
          }
        }
        if (!spawn) return;
        simState.boatPos.set(spawn.x, simState.tideOffset + 0.35, spawn.z);
        simState.boatYaw = spawn.yaw;
        simState.boatSpeed = simState.boatAirVelocity = 0;
        simState.boatOnRamp = false;
      }
    } else if (next === 'PLANE') {
      simState.parachuting = false;
      simState.gliding = false;
      if (simState.planePos.distanceTo(prevPos) > 45 && simState.aircraftDamage.state !== 'wrecked') {
        const inMidtown = Math.hypot(prevPos.x, prevPos.z) < 175;
        let airY = Math.max(getTerrainHeight(prevPos.x, prevPos.z) + 68, inMidtown ? 152 : 76);
        for (const distance of [0, 24, 48, 72]) {
          const probe = new THREE.Vector3(prevPos.x + Math.sin(prevYaw) * distance, 300, prevPos.z + Math.cos(prevYaw) * distance);
          const roof = traceWorld(probe, new THREE.Vector3(0, -1, 0), 300, 7,
            (hit) => hit.normal.y > 0.45);
          if (roof) airY = Math.max(airY, roof.point.y + 18);
        }
        simState.planePos.set(prevPos.x, airY, prevPos.z);
        simState.planeYaw = prevYaw;
        simState.planePitch = 0.05;
        simState.planeRoll = 0;
        simState.planeVel.set(0, 0, 0);
        simState.planeSpeed = 48;
      }
    }
    simState.mode = next;
    simState.orbitYaw = simState.orbitPitch = 0;
    simState.cameraView = 0;
    window.dispatchEvent(new CustomEvent('mode-switched', { detail: next }));
  }, []);

  useEffect(() => {
    const s = simState as any;
    if (typeof window !== 'undefined' && window.location.search.includes('nomenu')) {
      s.startMenuOpen = false;
      window.dispatchEvent(new CustomEvent('toggle-start-menu'));
    } else if (typeof window !== 'undefined' && window.location.search.includes('menu')) {
      s.startMenuOpen = true;
      window.dispatchEvent(new CustomEvent('toggle-start-menu'));
    }
    if (!s.gameMode) {
      s.gameMode = 'FREE_ROAM';
    }

    let wasPointerLocked = Boolean(document.pointerLockElement);
    let lastPointerUnlockAt = 0;
    const onPointerLockChange = () => {
      const nowLocked = Boolean(document.pointerLockElement);
      if (wasPointerLocked && !nowLocked) lastPointerUnlockAt = Date.now();
      wasPointerLocked = nowLocked;
    };

    const onKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (target && (['INPUT', 'SELECT', 'TEXTAREA'].includes(target.tagName) || target.isContentEditable)) return;
      const code = e.code;
      const lowerKey = e.key?.toLowerCase?.() ?? '';
      if (
        code === 'Space' ||
        code === 'ArrowUp' ||
        code === 'ArrowDown' ||
        code === 'ArrowLeft' ||
        code === 'ArrowRight'
      ) {
        e.preventDefault();
      }
      if (
        document.activeElement instanceof HTMLButtonElement &&
        (code === 'Space' ||
          code === 'KeyW' ||
          code === 'KeyA' ||
          code === 'KeyS' ||
          code === 'KeyD' ||
          code.startsWith('Arrow'))
      ) {
        document.activeElement.blur();
      }

      simState.keys.add(code);
      if (lowerKey === 'w') simState.keys.add('KeyW');
      if (lowerKey === 's') simState.keys.add('KeyS');
      if (lowerKey === 'a') simState.keys.add('KeyA');
      if (lowerKey === 'd') simState.keys.add('KeyD');
      if (lowerKey === 'f') simState.keys.add('KeyF');

      if (!e.repeat && code === 'KeyM') {
        const nextOpen = !Boolean(s.startMenuOpen);
        s.startMenuOpen = nextOpen;
        if (nextOpen) {
          simState.customizerOpen = false;
          simState.controlsOpen = false;
          simState.keys.clear();
          if (document.pointerLockElement) document.exitPointerLock?.();
        }
        window.dispatchEvent(new CustomEvent('toggle-start-menu'));
        return;
      }
      if (!e.repeat && code === 'Escape') {
        if (document.pointerLockElement || Date.now() - lastPointerUnlockAt < 300) {
          document.exitPointerLock?.();
          return;
        }
        if (simState.customizerOpen || simState.controlsOpen) {
          simState.customizerOpen = false;
          simState.controlsOpen = false;
          window.dispatchEvent(new CustomEvent('hud-sync'));
          return;
        }
        const nextOpen = !Boolean(s.startMenuOpen);
        s.startMenuOpen = nextOpen;
        if (nextOpen) simState.keys.clear();
        window.dispatchEvent(new CustomEvent('toggle-start-menu'));
        return;
      }
      if (!e.repeat && (code === 'Enter' || code === 'NumpadEnter') && Boolean(s.startMenuOpen) &&
          !(document.activeElement instanceof HTMLButtonElement)) {
        e.preventDefault();
        document.getElementById('world-start-game')?.click();
        return;
      }
      if (code === 'Digit1') switchMode('FOOT');
      if (code === 'Digit2') switchMode('CAR');
      if (code === 'Digit3') switchMode('BOAT');
      if (code === 'Digit4') switchMode('PLANE');
      if (code === 'KeyX' && !e.repeat) {
        simState.cameraView = (simState.cameraView + 1) % 2;
        simState.orbitYaw = simState.orbitPitch = 0;
        if (simState.cameraView === 1) {
          requestGamePointerLock();
        } else if (document.pointerLockElement && simState.mode !== 'FOOT') {
          document.exitPointerLock?.();
        }
        window.dispatchEvent(new CustomEvent('hud-sync'));
      }
      if (code === 'KeyR' && !e.repeat && !s.startMenuOpen && !(simState.mode === 'FOOT' && construction.active)) triggerRouletteSpin();
      const playing = !s.startMenuOpen && !simState.customizerOpen && !simState.controlsOpen;
      if (code === 'KeyZ' && !e.repeat && playing && simState.mode === 'FOOT' && !simState.activeRide) {
        simState.lobbyEmoteTimer = 2.6;
        if (!interactCoast(true)) coastalReaction('emote', simState.playerPos.x, simState.playerPos.z);
        window.dispatchEvent(new CustomEvent('hud-sync'));
      }
      if (code === 'KeyJ' && !e.repeat && playing && (simState.mode === 'BOAT' || simState.mode === 'CAR')) {
        const position = simState.mode === 'BOAT' ? simState.boatPos : simState.carPos;
        soundEngine.playCoastal('honk');
        coastalReaction('honk', position.x, position.z);
        if (Math.hypot(position.x - DUCK.x, position.z - DUCK.z) < 55) quack();
      }
      if (code === 'KeyE' && !e.repeat && playing) {
        if (simState.activeRide) {
          exitAmusementRide();
          return;
        }
        if (simState.mode === 'PLANE' && simState.activePlaneIdx === 1) return;
        if (interactCoast()) {
          window.dispatchEvent(new CustomEvent('hud-sync'));
          return;
        }
        if (simState.nearbyRide && simState.mode === 'FOOT') {
          boardAmusementRide(simState.nearbyRide);
          return;
        }
        if (simState.mode !== 'FOOT') {
          switchMode('FOOT');
        } else {
          if (simState.playerPos.distanceTo(simState.carPos) < 9) switchMode('CAR');
          else if (simState.playerPos.distanceTo(simState.boatPos) < 11) switchMode('BOAT');
          else if (simState.playerPos.distanceTo(simState.planePos) < 12) switchMode('PLANE');
        }
      }
    };
    const onKeyUp = (e: KeyboardEvent) => {
      simState.keys.delete(e.code);
      const lowerKey = e.key?.toLowerCase?.() ?? '';
      if (lowerKey === 'w') simState.keys.delete('KeyW');
      if (lowerKey === 's') simState.keys.delete('KeyS');
      if (lowerKey === 'a') simState.keys.delete('KeyA');
      if (lowerKey === 'd') simState.keys.delete('KeyD');
      if (lowerKey === 'f') simState.keys.delete('KeyF');
    };
    const onWindowBlur = () => {
      simState.keys.clear();
    };
    document.addEventListener('pointerlockchange', onPointerLockChange);
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    window.addEventListener('blur', onWindowBlur);
    return () => {
      document.removeEventListener('pointerlockchange', onPointerLockChange);
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
      window.removeEventListener('blur', onWindowBlur);
    };
  }, [switchMode]);

  return (
    <div className="fixed inset-0 h-[100dvh] w-[100dvw] overflow-hidden bg-slate-950">
      <Canvas
        shadows={softwareRenderer ? false : 'percentage'}
        onCreated={({ gl }) => {
          const context = gl.getContext();
          const gpu = context.getExtension('WEBGL_debug_renderer_info');
          const device = gpu ? context.getParameter(gpu.UNMASKED_RENDERER_WEBGL) : '';
          if (/SwiftShader|llvmpipe|software rasteriz/i.test(String(device))) {
            gl.shadowMap.enabled = false;
            setSoftwareRenderer(true);
          }
        }}
        dpr={[0.85, 1.15]}
        camera={{ fov: 60, near: 0.22, far: 3400, position: [0, 12, 38] }}
        gl={{
          antialias: !window.matchMedia('(pointer: coarse)').matches,
          powerPreference: 'high-performance',
          toneMapping: THREE.ACESFilmicToneMapping,
          toneMappingExposure: LOBBY_THEMES.SUNLIT_RIVIERA.exposure,
        }}
      >
        <GameWorld onHudUpdate={setHud} />
      </Canvas>

      <HUD hud={hud} onSelectMode={switchMode} />
    </div>
  );
}

export default App;
