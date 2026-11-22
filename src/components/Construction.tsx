import { useRef, useSyncExternalStore } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { BUILD_FINISH, construction, placedPieces, subscribeBuild, type BuiltPiece } from '../game/building';
import { simState } from '../game/store';

const unit = new THREE.BoxGeometry();
const preview = new THREE.MeshBasicMaterial({ transparent: true, opacity: 0.33, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 });
const guide = new THREE.LineBasicMaterial({ transparent: true, opacity: 0.83 });
const edges = new THREE.EdgesGeometry(unit);
const baseColor = new THREE.Color();
const scuff = new THREE.Color('#332c28');

function BuiltStructure({ piece }: { piece: BuiltPiece }) {
  const root = useRef<THREE.Group>(null);
  const age = useRef(0);
  const finish = BUILD_FINISH[piece.material];
  useFrame((_, dt) => {
    if (!root.current) return;
    age.current += dt;
    for (const child of root.current.children) {
      const slab = child as THREE.Group;
      slab.scale.y = THREE.MathUtils.smoothstep(age.current, -0.035, 0.19);
      const body = slab.children[0] as THREE.Mesh<THREE.BoxGeometry, THREE.MeshStandardMaterial>;
      body.material.color.copy(baseColor.set(finish.color)).lerp(scuff, (1 - piece.integrity) * 0.75);
    }
  });
  return (
    <group ref={root}>
      {piece.slabs.map(({ center, size, rotation }, index) => {
        const wall = piece.type === 'Wall';
        const material = piece.material;
        const strips = material === 'Wood' ? 10 : material === 'Stone' ? 6 : 4;
        return (
          <group key={index} position={center} quaternion={rotation}>
            <mesh geometry={unit} scale={size} receiveShadow castShadow>
              <meshStandardMaterial roughness={finish.roughness} metalness={finish.metalness} color={finish.color} />
            </mesh>
            {Array.from({ length: strips }, (_, row) => {
              const width = size.x / strips;
              const color = new THREE.Color(finish.color).multiplyScalar(0.78 + 0.078 * (row % 5));
              const x = -size.x / 2 + width * (row + 0.5);
              return <mesh key={row} geometry={unit} position={[x, wall ? 0 : size.y / 2 + 0.007, wall ? size.z / 2 + 0.006 : 0]}
                scale={[width - 0.022, wall ? size.y - 0.018 : 0.019, wall ? 0.021 : size.z - 0.018]} receiveShadow>
                <meshStandardMaterial roughness={finish.roughness} metalness={finish.metalness} color={color} />
              </mesh>;
            })}
            {material !== 'Stone' && [-1, 1].map((side) => <mesh key={side} geometry={unit}
              position={[side * (size.x / 2 - 0.12), wall ? 0 : -size.y / 2, wall ? -size.z / 2 : 0]}
              scale={[0.13, wall ? size.y : 0.16, wall ? 0.16 : size.z]} receiveShadow>
              <meshStandardMaterial color={material === 'Wood' ? '#735139' : '#45565d'} roughness={finish.roughness} metalness={finish.metalness} />
            </mesh>)}
          </group>
        );
      })}
    </group>
  );
}

export function Construction() {
  const pieces = useSyncExternalStore(subscribeBuild, placedPieces, placedPieces);
  const blueprint = useRef<THREE.Group>(null);
  useFrame(() => {
    const root = blueprint.current;
    if (!root) return;
    const plan = construction.preview;
    root.visible = Boolean(plan && construction.active && !simState.startMenuOpen && !simState.controlsOpen && simState.mode === 'FOOT');
    if (!root.visible || !plan) return;
    preview.color.set(plan.valid ? '#39a8ff' : '#ff574a');
    guide.color.set(plan.valid ? '#a6ddff' : '#ffc1a0');
    root.children.forEach((object, index) => {
      const slab = plan.slabs[index];
      object.visible = Boolean(slab);
      if (!slab) return;
      object.position.copy(slab.center);
      object.quaternion.copy(slab.rotation);
      object.scale.copy(slab.size);
    });
  });
  return <group>
    {pieces.map((piece) => <BuiltStructure key={piece.sequence} piece={piece} />)}
    <group ref={blueprint} visible={false}>
      {[0, 1].map((i) => <group key={i}>
        <mesh geometry={unit} material={preview} renderOrder={6} />
        <lineSegments geometry={edges} material={guide} renderOrder={7} />
      </group>)}
    </group>
  </group>;
}
