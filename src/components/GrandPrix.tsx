import React, { useEffect, useMemo, useRef, useState } from 'react';
import * as THREE from 'three';
import { useFrame } from '@react-three/fiber';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { GRAND_PRIX_CLOSURES, sampleGrandPrix } from '../game/grandPrix';
import { simState } from '../game/store';
import { getTravelHeight } from '../game/worldMath';
import { WorldSectionBatch, type WorldFinish, type Vec3, type WorldPart } from './WorldSections';

const racers = [
  { file: 'gt3_car', color: '#e8682c', pace: 27.2, offset: 14, lane: -1.9 },
  { file: 'wedge_coupe', color: '#4a9be0', pace: 26.5, offset: 27, lane: 1.85 },
  { file: 'muscle_car', color: '#dfc467', pace: 25.7, offset: 40, lane: -0.5 },
];
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
  const { north, south, curb, medianNorth, medianSouth } = GRAND_PRIX_CLOSURES;
  for (const z of [north, south]) for (let x = -14; x <= 14; x += 4) block(x, z, 0, 3.9);
  for (const x of [-curb, curb]) {
    for (let z = north + 2; z < south - 1; z += 5.2) block(x, z, Math.PI / 2, 5.1);
  }
  for (let z = medianNorth; z <= medianSouth; z += 4.8) block(0, z, Math.PI / 2, 4.7);
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

  useFrame(({ clock }) => {
    const preview = simState.startMenuOpen;
    const active = preview || simState.gameMode === 'GRAND_PRIX';
    if (visible !== active) setVisible(active);
    simState.raceTraffic.length = 0;
    if (!active) return;
    const seconds = preview ? clock.elapsedTime : Math.max(0, simState.raceElapsed);
    racers.forEach((spec, index) => {
      const root = models.current[index];
      if (!root) return;
      const speed = spec.pace + Math.sin(seconds * 0.79 + index) * 1.1;
      const distance = seconds * spec.pace + Math.sin(seconds * 0.79 + index) * 2 + spec.offset * (preview ? 1 : -1);
      const yaw = sampleGrandPrix(distance, point, spec.lane);
      root.position.copy(point);
      root.rotation.set(0, yaw, Math.sin(seconds * speed * 0.081) * 0.045);
      if (!preview) simState.raceTraffic.push([point.x, point.y, point.z]);
    });
  });

  if (!visible) return null;
  return (
    <group>
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
