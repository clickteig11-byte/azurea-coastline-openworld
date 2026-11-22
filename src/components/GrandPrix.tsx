import React, { useEffect, useMemo, useRef, useState } from 'react';
import * as THREE from 'three';
import { useFrame } from '@react-three/fiber';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { GRAND_PRIX_LENGTH, previewRaceDistance, raceRivals, sampleGrandPrix } from '../game/grandPrix';
import { simState } from '../game/store';
import { getTravelHeight } from '../game/worldMath';
import { WorldSectionBatch, type WorldFinish, type Vec3, type WorldPart } from './WorldSections';

const racers = raceRivals;
const concrete: WorldFinish = { material: 'masonry', roughness: 0.75 };
const steel: WorldFinish = { material: 'metal', roughness: 0.43, metalness: 0.23 };

function makeBarriers() {
  const parts: WorldPart[] = [];
  let number = 0;
  function block(x: number, z: number, yaw: number, length: number) {
    const y = getTravelHeight(x, z);
    const owner = 'Grand Prix barrier ' + number;
    const color = number++ % 2 === 0 ? '#ba402e' : '#dedad0';
    parts.push({ owner, label: 'Race barrier', finish: 'concrete', color,
      position: [x, y + 0.43, z], size: [length, 0.86, 0.78], yaw, durability: 165 });
    for (const lateral of [-0.406, 0.406]) {
      const position: Vec3 = [x + Math.sin(yaw) * lateral, y + 0.64, z + Math.cos(yaw) * lateral];
      parts.push({ owner, label: 'Race barrier reflector', finish: 'steel', color: '#e8c479',
        position, size: [length * 0.73, 0.09, 0.04], yaw, solid: false, durability: 28 });
    }
  }
  // Close the side streets at the first corner, leaving the racing line and runoff clear.
  for (let x = -13; x <= 13; x += 3.7) block(x, 66, 0, 3.48);
  for (let z = 72; z <= 89; z += 3.5) block(-24, z, Math.PI / 2, 3.29);
  for (let x = -12; x <= 13; x += 3.7) block(x, -186, 0, 3.48);
  return {
    bodies: parts.filter((part) => part.finish === 'concrete'),
    reflectors: parts.filter((part) => part.finish === 'steel'),
  };
}

export function GrandPrixCourse() {
  const [visible, setVisible] = useState(() => simState.startMenuOpen || simState.gameMode === 'GRAND_PRIX');
  const models = useRef<(THREE.Group | null)[]>([]);
  const barriers = useMemo(makeBarriers, []);
  const point = useMemo(() => new THREE.Vector3(), []);
  const lookAhead = useMemo(() => new THREE.Vector3(), []);
  const startLights = useRef<THREE.MeshStandardMaterial[]>([]);
  const activity = useRef({ elapsed: 0, rival: racers.map(({ grid }) => ({ distance: grid, speed: 0, lane: 0 })) });
  const [cars, setCars] = useState<(THREE.Object3D | null)[]>([]);
  useEffect(() => {
    let disposed = false;
    const loader = new GLTFLoader();
    racers.forEach((spec, index) => {
      loader.load('/models/' + spec.file + '.glb', ({ scene }) => {
        if (disposed) return;
        const box = new THREE.Box3().setFromObject(scene);
        const size = box.getSize(new THREE.Vector3());
        const scale = Math.min(1.65, 4.6 / Math.max(size.x, size.z));
        const center = box.getCenter(new THREE.Vector3());
        scene.scale.multiplyScalar(scale);
        scene.position.set(-center.x * scale, -box.min.y * scale, -center.z * scale);
        scene.traverse((object) => {
          const mesh = object as THREE.Mesh;
          if (!mesh.isMesh) return;
          mesh.castShadow = true;
          mesh.receiveShadow = true;
        });
        setCars((current) => {
          const incoming = [...current];
          incoming[index] = scene;
          return incoming;
        });
      });
    });
    return () => { disposed = true; };
  }, []);

  useFrame(({ clock }, delta) => {
    const preview = simState.startMenuOpen;
    const active = preview || simState.gameMode === 'GRAND_PRIX';
    if (visible !== active) setVisible(active);
    simState.raceTraffic.length = 0;
    if (!active) return;
    const seconds = preview ? clock.elapsedTime : simState.raceElapsed;
    const countdown = simState.raceCountdown;
    const stats = activity.current;
    const reset = !preview && (countdown > 0 || seconds < stats.elapsed);
    if (!preview) stats.elapsed = seconds;
    startLights.current.forEach((light, index) => {
      const red = countdown > 0 && (3 - Math.floor(countdown)) >= index;
      const green = countdown === 0 && seconds < 2.5;
      light.emissive.set(green ? '#54ff99' : red ? '#ff3219' : '#321d29');
      light.emissiveIntensity = red || green ? 3.6 : 0.18;
    });
    racers.forEach((spec, index) => {
      const root = models.current[index];
      if (!root) return;
      const rival = stats.rival[index];
      if (reset) {
        rival.distance = spec.grid;
        rival.speed = 0;
        rival.lane = spec.lane;
      } else if (!preview) {
        const heading = sampleGrandPrix(rival.distance, point, spec.lane);
        const approaching = sampleGrandPrix(rival.distance + 26, lookAhead, spec.lane);
        const curve = Math.acos(THREE.MathUtils.clamp(Math.cos(approaching - heading), -1, 1));
        const target = spec.pace / (1 + curve * 1.85) + Math.sin(seconds * 0.67 + index) * 1.3;
        const nearby = stats.rival.some((other, j) => j !== index && Math.abs(other.lane - rival.lane) < 2.6 &&
          THREE.MathUtils.euclideanModulo(other.distance - rival.distance, GRAND_PRIX_LENGTH) < 12);
        const step = Math.min(0.045, delta);
        rival.lane = THREE.MathUtils.damp(rival.lane, nearby ? (spec.lane > 0 ? -0.9 : 1.1) : spec.lane, 1.6, step);
        rival.speed += THREE.MathUtils.clamp(target - rival.speed, -24 * step, 9.5 * step);
        rival.distance += rival.speed * step;
      }
      const distance = preview ? previewRaceDistance(seconds, index) : rival.distance;
      const yaw = sampleGrandPrix(distance, point, preview ? spec.lane : rival.lane);
      if (!preview) simState.raceRivalDistances[index] = distance;
      root.position.copy(point);
      root.rotation.set(0, yaw, 0);
      if (!preview) simState.raceTraffic.push([point.x, point.y, point.z]);
    });
  });

  const curb = useMemo(() => {
    const parts: WorldPart[] = [];
    const sample = new THREE.Vector3();
    for (let distance = 10; distance < GRAND_PRIX_LENGTH; distance += 3.4) {
      if (!(distance < 54 || distance > GRAND_PRIX_LENGTH - 99 || (distance > 239 && distance < 294))) continue;
      const yaw = sampleGrandPrix(distance, sample, distance < 54 ? -4.2 : 4.5);
      parts.push({ owner: 'Grand Prix curbing', label: 'Apex curb', finish: 'masonry',
        position: [sample.x, sample.y - 0.025, sample.z], size: [0.44, 0.13, 3.38], yaw,
        color: parts.length % 2 === 0 ? '#f0dfc2' : '#ac372d', solid: false, durability: 38 });
    }
    return parts;
  }, []);

  if (!visible) return null;
  return (
    <group>
      <WorldSectionBatch parts={curb} finish={concrete} />
      <group position={[0, getTravelHeight(0, 137), 137]}>
        <mesh position={[0, 5.5, 0]}><boxGeometry args={[31, 0.7, 0.54]} /><meshStandardMaterial color="#353d42" metalness={0.55} /></mesh>
        {[-15.4, 15.4].map((x) => (
          <mesh key={x} position={[x, 2.6, 0]} castShadow><boxGeometry args={[0.31, 5.2, 0.38]} /><meshStandardMaterial color="#535e61" metalness={0.65} /></mesh>
        ))}
        {[0, 1, 2].map((index) => (
          <mesh key={index} position={[-8.4 + index * 1.4, 5.38, 0.32]}>
            <boxGeometry args={[0.7, 0.43, 0.16]} />
            <meshStandardMaterial color="#301f22" ref={(light) => { if (light) startLights.current[index] = light; }} />
          </mesh>
        ))}
      </group>
      <WorldSectionBatch parts={barriers.bodies} finish={concrete} />
      <WorldSectionBatch parts={barriers.reflectors} finish={steel} />
      {racers.map((spec, i) => (
        <group key={spec.file} ref={(group) => { models.current[i] = group; }}>
          {cars[i] ? <primitive object={cars[i]!} /> : (
            <mesh position={[0, 0.55, 0]} castShadow>
              <boxGeometry args={[1.78, 0.76, 4.35]} />
              <meshPhysicalMaterial color={spec.color} metalness={0.55} roughness={0.28} clearcoat={0.75} />
            </mesh>
          )}
        </group>
      ))}
    </group>
  );
}
