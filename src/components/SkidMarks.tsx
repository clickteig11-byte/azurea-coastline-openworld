import { useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { getTravelHeight } from '../game/worldMath';

const marks: { from: THREE.Vector3; to: THREE.Vector3 }[] = [];
export function queueSkid(from: THREE.Vector3, to: THREE.Vector3) {
  if (marks.length >= 32) return;
  const length = from.distanceTo(to);
  if (length < 0.06 || length > 2.5) return;
  marks.push({ from: from.clone(), to: to.clone() });
}
const capacity = 1100;
const markGeometry = new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2);
const matrix = new THREE.Object3D();
const movement = new THREE.Vector3();
const axis = new THREE.Vector3(0, 1, 0);
const normal = new THREE.Vector3();

export function SkidMarks() {
  const mesh = useRef<THREE.InstancedMesh>(null);
  const next = useRef(0);
  useFrame(() => {
    if (!mesh.current || !marks.length) return;
    for (const { from, to } of marks.splice(0)) {
      matrix.position.copy(from).lerp(to, 0.5);
      movement.copy(to).sub(from);
      const { x, y, z } = matrix.position;
      const floor = getTravelHeight(x, z, y + 1.1);
      const dx = getTravelHeight(x + 0.26, z, y + 1.1) - getTravelHeight(x - 0.26, z, y + 1.1);
      const dz = getTravelHeight(x, z + 0.26, y + 1.1) - getTravelHeight(x, z - 0.26, y + 1.1);
      normal.set(-dx, 0.52, -dz).normalize();
      matrix.quaternion.setFromUnitVectors(axis, normal);
      matrix.rotateY(Math.atan2(movement.x, movement.z));
      matrix.position.y = floor + 0.067;
      matrix.scale.set(0.18, 1, movement.length() + 0.09);
      matrix.updateMatrix();
      mesh.current.setMatrixAt(next.current++ % capacity, matrix.matrix);
    }
    mesh.current.count = Math.min(capacity, next.current);
    mesh.current.instanceMatrix.needsUpdate = true;
  });
  return <instancedMesh ref={mesh} args={[markGeometry, undefined, capacity]} frustumCulled={false} count={0} renderOrder={2}>
    <meshBasicMaterial color="#181a19" opacity={0.38} transparent depthWrite={false} polygonOffset polygonOffsetFactor={-2} />
  </instancedMesh>;
}
