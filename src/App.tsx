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
import { LivingWorldNPCs } from './components/NPCs';
import { HUD } from './components/HUD';
import { GameHudSnapshot, simState } from './game/store';
import { getTerrainHeight, VehicleMode } from './game/worldMath';

function PerformanceGovernor() {
  const { gl } = useThree();
  const times = useRef<number[]>([]);
  const lastCheck = useRef(Date.now());
  const dpr = useRef(1.0);

  useFrame((_, delta) => {
    times.current.push(delta);
    if (times.current.length > 30) times.current.shift();
    if (Date.now() - lastCheck.current > 2000) {
      const avg = times.current.reduce((a, b) => a + b, 0) / times.current.length;
      if (avg > 0.024 && dpr.current > 0.8) {
        dpr.current = Math.max(0.8, dpr.current - 0.1);
        gl.setPixelRatio(dpr.current);
      } else if (avg < 0.017 && dpr.current < 1.2) {
        dpr.current = Math.min(1.2, dpr.current + 0.1);
        gl.setPixelRatio(dpr.current);
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

export function App() {
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
      } else if (simState.mode === 'CAR') {
        simState.parachuting = false;
        simState.gliding = false;
        // Step out 5.2m perpendicular to the car's heading so the parked car sits to the side and never blocks the camera
        const exitX = prevPos.x + Math.cos(prevYaw) * 5.2;
        const exitZ = prevPos.z - Math.sin(prevYaw) * 5.2;
        const groundY = Math.max(getTerrainHeight(exitX, exitZ) + 0.08, simState.tideOffset);
        simState.playerPos.set(exitX, groundY, exitZ);
        simState.playerYaw = prevYaw;
        simState.playerVel.set(0, 0, 0);
      } else {
        simState.parachuting = false;
        simState.gliding = false;
        const groundY = Math.max(getTerrainHeight(simState.playerPos.x, simState.playerPos.z) + 0.08, simState.tideOffset);
        simState.playerPos.y = groundY;
        simState.playerVel.set(0, 0, 0);
      }
    } else if (next === 'CAR') {
      simState.parachuting = false;
      simState.gliding = false;
      if (simState.carPos.distanceTo(prevPos) > 18) {
        const groundY = Math.max(getTerrainHeight(prevPos.x, prevPos.z) + 0.08, simState.tideOffset + 0.1);
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
      if (simState.planePos.distanceTo(prevPos) > 45) {
        const airY = Math.max(getTerrainHeight(prevPos.x, prevPos.z) + 28, 32);
        simState.planePos.set(prevPos.x, airY, prevPos.z);
        simState.planeYaw = prevYaw;
        simState.planePitch = -0.04;
        simState.planeRoll = 0;
        simState.planeSpeed = 36;
      }
    }
    simState.mode = next;
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

      if (code === 'KeyM' || code === 'Escape' || code === 'Tab') {
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
        dpr={[0.85, 1.15]}
        camera={{ fov: 60, near: 0.5, far: 2200, position: [0, 12, 38] }}
        gl={{
          antialias: false,
          powerPreference: 'high-performance',
          toneMapping: THREE.ACESFilmicToneMapping,
          toneMappingExposure: 1.06,
        }}
      >
        <ProceduralEnvMap />
        <PerformanceGovernor />
        <hemisphereLight args={['#dbeafe', '#d6c8b4', 0.92]} />
        <directionalLight
          position={[140, 180, -140]}
          intensity={2.5}
          color="#fff8e7"
          castShadow
          shadow-mapSize-width={1024}
          shadow-mapSize-height={1024}
          shadow-camera-near={20}
          shadow-camera-far={520}
          shadow-camera-left={-110}
          shadow-camera-right={110}
          shadow-camera-top={110}
          shadow-camera-bottom={-110}
          shadow-bias={-0.0005}
        />
        <directionalLight position={[-120, 80, 120]} intensity={0.75} color="#7dd3fc" />
        <fog attach="fog" args={['#cde4f5', 380, 1300]} />

        <SkyDome />
        <IslandTerrain />
        <VegasStripDetails />
        <InstancedFoliage />
        <VegasLandmarks />
        <StylizedOcean />
        <ChipCollectibles />
        <LandmarkBeacons />
        <LivingWorldNPCs />
        <VehicleDirector onHudUpdate={setHud} />
      </Canvas>

      <HUD hud={hud} onSelectMode={switchMode} />
    </div>
  );
}

export default App;
