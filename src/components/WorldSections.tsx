import React, { useLayoutEffect, useRef } from 'react';
import * as THREE from 'three';
import { useFrame } from '@react-three/fiber';
import { getTravelHeight } from '../game/worldMath';
import { registerWorldSection, type WorldMaterial } from '../game/worldDamage';

export type Vec3 = [number, number, number];

export interface WorldPart {
  owner: string;
  label: string;
  finish: string;
  color: string;
  position: Vec3;
  size: Vec3;
  yaw?: number;
  durability?: number;
  solid?: boolean;
  permanent?: boolean;
}

export interface WorldFinish {
  material: WorldMaterial;
  roughness: number;
  metalness?: number;
  map?: THREE.Texture;
  normalMap?: THREE.Texture;
  roughnessMap?: THREE.Texture;
  geometry?: THREE.BufferGeometry;
  emissive?: string;
}

interface LoosePart {
  index: number;
  position: THREE.Vector3;
  size: THREE.Vector3;
  motion: THREE.Vector3;
  spin: THREE.Vector3;
  rotation: THREE.Euler;
  floor: number;
  age: number;
}

const canBreakLoose = /Guardrail|lamp post|Street sign|Race barrier|bollard|Bench|barrier/i;

export function WorldSectionBatch({ parts, finish }: { parts: WorldPart[]; finish: WorldFinish }) {
  const meshRef = useRef<THREE.InstancedMesh>(null);
  const loose = useRef<LoosePart[]>([]);
  const transform = useRef(new THREE.Object3D());
  const hidden = useRef(new THREE.Matrix4().makeScale(0, 0, 0));
  useLayoutEffect(() => {
    const mesh = meshRef.current!;
    const dummy = new THREE.Object3D();
    const color = new THREE.Color();
    const soot = new THREE.Color(finish.material === 'glass' ? '#172630' : '#332824');
    const unregister = parts.map((part, index) => {
      const { position, size, yaw = 0, durability = 95, permanent = false, solid } = part;
      dummy.position.fromArray(position);
      dummy.scale.fromArray(size);
      dummy.rotation.set(0, yaw, 0);
      dummy.updateMatrix();
      mesh.setMatrixAt(index, dummy.matrix);
      mesh.setColorAt(index, color.set(part.color));
      if (permanent && solid === false) return undefined;
      return registerWorldSection({
        owner: part.owner, label: part.label, material: finish.material, center: dummy.position.clone(),
        halfSize: dummy.scale.clone().multiplyScalar(0.5), rotation: yaw ? dummy.quaternion.clone() : undefined,
        hp: durability, maxHp: durability, solid, permanent,
        onDamage: (integrity, destroyed, hit, energy) => {
          if (destroyed) {
            if (loose.current.length < 28 && solid !== false && canBreakLoose.test(part.label)) {
              const strength = Math.min(11, 1.9 + energy * 0.048);
              const point = new THREE.Vector3(...position);
              loose.current.push({
                index, position: point, size: new THREE.Vector3(...size),
                motion: new THREE.Vector3(-hit.normal.x * strength, 1.1 + strength * 0.34, -hit.normal.z * strength),
                spin: new THREE.Vector3(hit.normal.z * 4.7, (index % 2 ? 1 : -1) * 1.4, -hit.normal.x * 4.7),
                rotation: new THREE.Euler(0, yaw, 0),
                floor: getTravelHeight(point.x, point.z, point.y), age: 0,
              });
            } else mesh.setMatrixAt(index, hidden.current);
            mesh.instanceMatrix.needsUpdate = true;
          } else {
            mesh.setColorAt(index, color.set(part.color).lerp(soot, (1 - integrity) * 0.8));
            if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
          }
        },
      });
    });
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    mesh.computeBoundingSphere();
    return () => {
      unregister.forEach((remove) => remove?.());
      loose.current.length = 0;
    };
  }, [parts, finish]);

  useFrame((_, rawDelta) => {
    const mesh = meshRef.current;
    if (!mesh || loose.current.length === 0) return;
    const dt = Math.min(rawDelta, 0.042);
    const dummy = transform.current;
    for (let i = loose.current.length - 1; i >= 0; i--) {
      const debris = loose.current[i];
      debris.age += dt;
      debris.motion.y -= 17 * dt;
      debris.position.addScaledVector(debris.motion, dt);
      const halfWidth = Math.min(debris.size.x, debris.size.y, debris.size.z) * 0.48;
      const floor = Math.max(getTravelHeight(debris.position.x, debris.position.z, debris.position.y), debris.floor - 0.35) + halfWidth;
      if (debris.position.y <= floor) {
        debris.position.y = floor;
        debris.motion.y = Math.max(0, -debris.motion.y * 0.24 - 0.8);
        debris.motion.x *= Math.exp(-dt * 8);
        debris.motion.z *= Math.exp(-dt * 8);
        debris.spin.multiplyScalar(Math.exp(-dt * 4));
      }
      debris.rotation.x += debris.spin.x * dt;
      debris.rotation.y += debris.spin.y * dt;
      debris.rotation.z += debris.spin.z * dt;
      dummy.rotation.copy(debris.rotation);
      dummy.position.copy(debris.position);
      dummy.scale.copy(debris.size).multiplyScalar(1 - THREE.MathUtils.smoothstep(debris.age, 6.2, 8));
      dummy.updateMatrix();
      mesh.setMatrixAt(debris.index, dummy.matrix);
      if (debris.age >= 8) loose.current.splice(i, 1);
    }
    mesh.instanceMatrix.needsUpdate = true;
  });

  return (
    <instancedMesh ref={meshRef} args={[finish.geometry, undefined, parts.length]} castShadow receiveShadow>
      {!finish.geometry && <boxGeometry args={[1, 1, 1]} />}
      <meshStandardMaterial color="#ffffff" roughness={finish.roughness} metalness={finish.metalness}
        map={finish.map} normalMap={finish.normalMap} roughnessMap={finish.roughnessMap} emissive={finish.emissive} emissiveIntensity={0.32} />
    </instancedMesh>
  );
}

export function DamageableProp({ id, label, position, center, size, material, durability, children }: {
  id: string;
  label: string;
  position: Vec3;
  center: Vec3;
  size: Vec3;
  material: WorldMaterial;
  durability?: number;
  children: React.ReactNode;
}) {
  const group = useRef<THREE.Group>(null);
  const impulse = useRef({ tiltX: 0, tiltZ: 0, falling: false, grounded: false, vx: 0, vy: 0, vz: 0 });
  useLayoutEffect(() => {
    const health = durability ?? (material === 'wood' ? 110 : 70);
    const object = group.current!;
    object.updateWorldMatrix(true, false);
    return registerWorldSection({
      owner: id, label, material, center: new THREE.Vector3(...center).applyMatrix4(object.matrixWorld),
      rotation: object.getWorldQuaternion(new THREE.Quaternion()),
      halfSize: new THREE.Vector3(...size).multiplyScalar(0.5), hp: health, maxHp: health,
      onDamage: (integrity, destroyed, hit, energy) => {
        const local = hit.normal.clone().applyQuaternion(object.getWorldQuaternion(new THREE.Quaternion()).invert());
        const motion = impulse.current;
        const bend = destroyed ? 1.48 : (1 - integrity) * 0.32;
        motion.tiltX = Math.abs(local.x) + Math.abs(local.z) > 0.1 ? -local.z * bend : bend * 0.4;
        motion.tiltZ = Math.abs(local.x) + Math.abs(local.z) > 0.1 ? local.x * bend : bend * 0.8;
        motion.falling = destroyed;
        if (destroyed) {
          const launch = Math.min(7.8, energy / Math.max(37, health * 0.84));
          motion.vx = -local.x * launch;
          motion.vy = Math.min(2.4, launch * 0.63);
          motion.vz = -local.z * launch;
        }
      },
    });
  }, [id, label, position[0], position[1], position[2], center[0], center[1], center[2], size[0], size[1], size[2], material, durability]);

  useFrame((_, rawDelta) => {
    const object = group.current;
    const f = impulse.current;
    if (!object || (!f.tiltX && !f.tiltZ)) return;
    const dt = Math.min(rawDelta, 0.043);
    object.rotation.x = THREE.MathUtils.damp(object.rotation.x, f.tiltX, f.falling ? 6 : 9, dt);
    object.rotation.z = THREE.MathUtils.damp(object.rotation.z, f.tiltZ, f.falling ? 6 : 9, dt);
    if (!f.falling || f.grounded) return;
    object.position.x += f.vx * dt;
    object.position.z += f.vz * dt;
    f.vy -= 17 * dt;
    object.position.y += f.vy * dt;
    object.updateWorldMatrix(true, false);
    const world = object.getWorldPosition(new THREE.Vector3());
    const height = getTravelHeight(world.x, world.z, world.y + 0.6);
    if (f.vy < 0 && world.y < height) {
      object.position.y += height - world.y;
      if (-f.vy < 3.8) f.grounded = true;
      else {
        f.vy *= -0.25;
        f.vx *= 0.42;
        f.vz *= 0.42;
      }
    }
  });

  return <group ref={group} position={position}>{children}</group>;
}
