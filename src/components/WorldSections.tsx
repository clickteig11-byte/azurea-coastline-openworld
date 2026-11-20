import React, { useLayoutEffect, useRef } from 'react';
import * as THREE from 'three';
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

export function WorldSectionBatch({ parts, finish }: { parts: WorldPart[]; finish: WorldFinish }) {
  const meshRef = useRef<THREE.InstancedMesh>(null);
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
      const matrix = dummy.matrix.clone();
      mesh.setMatrixAt(index, matrix);
      mesh.setColorAt(index, color.set(part.color));
      if (permanent && solid === false) return undefined;
      return registerWorldSection({
        owner: part.owner, label: part.label, material: finish.material, center: dummy.position.clone(),
        halfSize: dummy.scale.clone().multiplyScalar(0.5), rotation: yaw ? dummy.quaternion.clone() : undefined,
        hp: durability, maxHp: durability, solid, permanent,
        onDamage: (integrity, destroyed) => {
          if (destroyed) {
            mesh.setMatrixAt(index, matrix.clone().scale(new THREE.Vector3(0, 0, 0)));
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
    return () => unregister.forEach((remove) => remove?.());
  }, [parts, finish]);

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
  useLayoutEffect(() => {
    const health = durability ?? (material === 'wood' ? 110 : 70);
    const object = group.current!;
    object.updateWorldMatrix(true, false);
    return registerWorldSection({
      owner: id, label, material, center: new THREE.Vector3(...center).applyMatrix4(object.matrixWorld),
      rotation: object.getWorldQuaternion(new THREE.Quaternion()),
      halfSize: new THREE.Vector3(...size).multiplyScalar(0.5), hp: health, maxHp: health,
      onDamage: (integrity, destroyed) => {
        object.rotation.z = (1 - integrity) * (destroyed ? 1.32 : 0.32);
        if (destroyed) object.position.y = position[1] - 0.42;
      },
    });
  }, [id, label, position[0], position[1], position[2], center[0], center[1], center[2], size[0], size[1], size[2], material, durability]);

  return <group ref={group} position={position}>{children}</group>;
}
