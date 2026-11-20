import React, { useCallback, useEffect, useRef, useState } from 'react';
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
} from './components/World';
import { VehicleDirector, triggerRouletteSpin } from './components/Vehicles';
import { NorthBay } from './components/NorthBay';
import { GrandPrixCourse } from './components/GrandPrix';
import { CoastalCity } from './components/City';
import { WorldEffects } from './components/WorldEffects';
import { LivingWorldNPCs } from './components/NPCs';
import { HUD } from './components/HUD';
import { GameHudSnapshot, simState } from './game/store';
import { COAST_SUN, getTerrainHeight, getTravelHeight, VehicleMode } from './game/worldMath';

function PerformanceGovernor() {
  const { setDpr, viewport } = useThree();
  const times = useRef<number[]>([]);
  const lastCheck = useRef(Date.now());
  const dpr = useRef(viewport.dpr);

  useFrame((_, delta) => {
    times.current.push(delta);
    if (times.current.length > 30) times.current.shift();
    if (Date.now() - lastCheck.current > 2000) {
      const avg = times.current.reduce((a, b) => a + b, 0) / times.current.length;
      if (avg > 0.024 && dpr.current > 0.8) {
        dpr.current = Math.max(0.8, dpr.current - 0.1);
        setDpr(dpr.current);
      } else if (avg < 0.017 && dpr.current < 1.2) {
        dpr.current = Math.min(1.2, dpr.current + 0.1);
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
  const light = useRef<THREE.DirectionalLight>(null);
  const target = useRef<THREE.Object3D>(null);
  const quality = useRef({ elapsed: 0, interval: 0.065, average: 0.017 });
  const desktop = typeof window !== 'undefined' && !window.matchMedia('(pointer: coarse)').matches;
  useFrame(({ gl }, dt) => {
    if (!light.current || !target.current || !gl.shadowMap.enabled) return;
    const timing = quality.current;
    timing.average = THREE.MathUtils.lerp(timing.average, Math.min(0.12, dt), 0.024);
    timing.elapsed += dt;
    const interval = timing.average > 0.038 ? 0.22 : timing.interval;
    if (timing.elapsed < interval) return;
    timing.elapsed = 0;
    const focus = simState.mode === 'CAR' ? simState.carPos : simState.mode === 'PLANE' ? simState.planePos :
      simState.mode === 'BOAT' ? simState.boatPos : simState.playerPos;
    const size = desktop ? 150 : 108;
    const texel = size / (desktop ? 1536 : 768);
    target.current.position.set(Math.round(focus.x / texel) * texel, Math.min(focus.y, 28), Math.round(focus.z / texel) * texel);
    target.current.updateMatrixWorld();
    light.current.position.copy(target.current.position).addScaledVector(COAST_SUN, 142);
    light.current.target = target.current;
    gl.shadowMap.autoUpdate = false;
    gl.shadowMap.needsUpdate = true;
  });
  const halfSize = desktop ? 75 : 54;
  return (
    <>
      <object3D ref={target} />
      <hemisphereLight args={['#dbeaff', '#88796e', 0.75]} />
      <directionalLight ref={light} position={COAST_SUN.clone().multiplyScalar(142)} intensity={2.15}
        color="#fff0d9" castShadow shadow-mapSize-width={desktop ? 1536 : 768}
        shadow-mapSize-height={desktop ? 1536 : 768} shadow-camera-near={10} shadow-camera-far={260}
        shadow-camera-left={-halfSize} shadow-camera-right={halfSize} shadow-camera-top={halfSize}
        shadow-camera-bottom={-halfSize} shadow-normalBias={0.16} shadow-bias={-0.00022}
        shadow-radius={3.2} shadow-intensity={0.83} />
      <directionalLight position={[35, 24, 55]} intensity={0.21} color="#9fc8f1" />
    </>
  );
}

const GameWorld = React.memo(function GameWorld({ onHudUpdate }: { onHudUpdate: (hud: GameHudSnapshot) => void }) {
  return (
    <>
      <ProceduralEnvMap />
      <PerformanceGovernor />
      <CoastalLighting />
      <fog attach="fog" args={['#b5cbd1', 325, 1320]} />

      <SkyDome />
      <IslandTerrain />
      <NorthBay />
      <CoastalCity />
      <GrandPrixCourse />
      <WorldEffects />
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
        // Step out 5.2m perpendicular to the car's heading so the parked car sits to the side and never blocks the camera
        const exitX = prevPos.x + Math.cos(prevYaw) * 5.2;
        const exitZ = prevPos.z - Math.sin(prevYaw) * 5.2;
        const groundY = Math.max(getTravelHeight(exitX, exitZ, prevPos.y) + 0.08, simState.tideOffset);
        simState.playerPos.set(exitX, groundY, exitZ);
        simState.playerYaw = prevYaw;
        simState.playerVel.set(0, 0, 0);
      } else {
        simState.parachuting = false;
        simState.gliding = false;
        const groundY = Math.max(getTravelHeight(simState.playerPos.x, simState.playerPos.z, prevPos.y) + 0.08, simState.tideOffset);
        simState.playerPos.y = groundY;
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
      if (getTerrainHeight(simState.boatPos.x, simState.boatPos.z) > 0.2) {
        simState.boatPos.set(145, 0.5, -95);
        simState.boatYaw = -Math.PI / 2;
        simState.boatSpeed = 0;
      }
    } else if (next === 'PLANE') {
      simState.parachuting = false;
      simState.gliding = false;
      if (simState.planePos.distanceTo(prevPos) > 45 && simState.aircraftDamage.state !== 'wrecked') {
        const airY = Math.max(getTerrainHeight(prevPos.x, prevPos.z) + 28, 32);
        simState.planePos.set(prevPos.x, airY, prevPos.z);
        simState.planeYaw = prevYaw;
        simState.planePitch = -0.04;
        simState.planeRoll = 0;
        simState.planeSpeed = 36;
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

    const onKeyDown = (e: KeyboardEvent) => {
      const code = e.code;
      const lowerKey = e.key?.toLowerCase?.() ?? '';
      if (
        code === 'Space' ||
        code === 'ArrowUp' ||
        code === 'ArrowDown' ||
        code === 'ArrowLeft' ||
        code === 'ArrowRight' ||
        code === 'Tab'
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

      if (!e.repeat && (code === 'KeyM' || code === 'Escape' || code === 'Tab')) {
        const nextOpen = !Boolean(s.startMenuOpen);
        s.startMenuOpen = nextOpen;
        if (nextOpen) {
          simState.customizerOpen = false;
          simState.keys.clear();
        }
        window.dispatchEvent(new CustomEvent('toggle-start-menu'));
        return;
      }
      if ((code === 'Enter' || code === 'NumpadEnter') && Boolean(s.startMenuOpen)) {
        s.startMenuOpen = false;
        window.dispatchEvent(new CustomEvent('toggle-start-menu'));
        return;
      }
      if (code === 'Digit1') switchMode('FOOT');
      if (code === 'Digit2') switchMode('CAR');
      if (code === 'Digit3') switchMode('BOAT');
      if (code === 'Digit4') switchMode('PLANE');
      if (code === 'KeyX' && !e.repeat) {
        simState.cameraView = (simState.cameraView + 1) % 3;
        simState.orbitYaw = simState.orbitPitch = 0;
      }
      if (code === 'KeyR') triggerRouletteSpin();
      if (code === 'KeyE') {
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
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    window.addEventListener('blur', onWindowBlur);
    return () => {
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
          toneMappingExposure: 1.02,
        }}
      >
        <GameWorld onHudUpdate={setHud} />
      </Canvas>

      <HUD hud={hud} onSelectMode={switchMode} />
    </div>
  );
}

export default App;
