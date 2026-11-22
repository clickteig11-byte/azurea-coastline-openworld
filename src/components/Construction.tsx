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

const buildTextureCache = new Map<'Wood' | 'Stone' | 'Metal', THREE.CanvasTexture>();

function getBuildTexture(material: 'Wood' | 'Stone' | 'Metal'): THREE.CanvasTexture | null {
  if (typeof document === 'undefined') return null;
  const cached = buildTextureCache.get(material);
  if (cached) return cached;

  const canvas = document.createElement('canvas');
  canvas.width = 128;
  canvas.height = 128;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;

  if (material === 'Wood') {
    ctx.fillStyle = '#fff9f0';
    ctx.fillRect(0, 0, 128, 128);
    for (let i = 0; i < 4; i++) {
      const x = i * 32;
      ctx.fillStyle = i % 2 === 0 ? 'rgba(218, 196, 170, 0.42)' : 'rgba(255, 248, 236, 0.35)';
      ctx.fillRect(x, 0, 30, 128);
      ctx.fillStyle = 'rgba(68, 42, 22, 0.65)';
      ctx.fillRect(x + 30, 0, 2, 128);
      for (let g = 0; g < 22; g++) {
        const y = (g * 17 + i * 11) % 128;
        ctx.fillStyle = g % 3 === 0 ? 'rgba(88, 52, 26, 0.35)' : 'rgba(255, 250, 240, 0.3)';
        ctx.fillRect(x + ((g * 7) % 22), y, 6 + ((g * 3) % 16), 1.8);
      }
      ctx.fillStyle = 'rgba(38, 26, 18, 0.72)';
      ctx.fillRect(x + 5, 10, 2.5, 2.5);
      ctx.fillRect(x + 23, 10, 2.5, 2.5);
      ctx.fillRect(x + 5, 114, 2.5, 2.5);
      ctx.fillRect(x + 23, 114, 2.5, 2.5);
    }
  } else if (material === 'Stone') {
    ctx.fillStyle = '#f4f6fa';
    ctx.fillRect(0, 0, 128, 128);
    const rows = 4;
    const rowH = 128 / rows;
    for (let r = 0; r < rows; r++) {
      const y = r * rowH;
      const offset = (r % 2) * 32;
      for (let c = -1; c < 3; c++) {
        const bx = c * 64 + offset;
        ctx.fillStyle = (r + c) % 2 === 0 ? 'rgba(202, 208, 218, 0.48)' : 'rgba(250, 252, 255, 0.38)';
        ctx.fillRect(bx + 2, y + 2, 60, rowH - 4);
      }
      ctx.fillStyle = 'rgba(52, 58, 68, 0.62)';
      ctx.fillRect(0, y, 128, 2.5);
      for (let c = 0; c < 2; c++) {
        ctx.fillRect((c * 64 + offset) % 128, y, 2.5, rowH);
      }
    }
    for (let s = 0; s < 140; s++) {
      const sx = (s * 37) % 128;
      const sy = (s * 53) % 128;
      ctx.fillStyle = s % 2 === 0 ? 'rgba(55, 62, 72, 0.22)' : 'rgba(255, 255, 255, 0.3)';
      ctx.fillRect(sx, sy, 2, 2);
    }
  } else {
    ctx.fillStyle = '#eef3f8';
    ctx.fillRect(0, 0, 128, 128);
    for (let i = 0; i < 8; i++) {
      const x = i * 16;
      const grad = ctx.createLinearGradient(x, 0, x + 16, 0);
      grad.addColorStop(0, 'rgba(110, 126, 146, 0.44)');
      grad.addColorStop(0.45, 'rgba(255, 255, 255, 0.35)');
      grad.addColorStop(1, 'rgba(85, 100, 118, 0.48)');
      ctx.fillStyle = grad;
      ctx.fillRect(x, 0, 16, 128);
    }
    ctx.fillStyle = 'rgba(42, 52, 66, 0.62)';
    ctx.fillRect(0, 63, 128, 2.5);
    ctx.fillRect(63, 0, 2.5, 128);
    for (const rx of [6, 56, 70, 120]) {
      for (const ry of [6, 56, 70, 120]) {
        ctx.fillStyle = 'rgba(32, 40, 50, 0.72)';
        ctx.fillRect(rx, ry, 3, 3);
      }
    }
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(2, 2);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.needsUpdate = true;
  buildTextureCache.set(material, tex);
  return tex;
}

function BuiltStructure({ piece }: { piece: BuiltPiece }) {
  const root = useRef<THREE.Group>(null);
  const age = useRef(0);
  const finish = BUILD_FINISH[piece.material];
  const surfaceMap = getBuildTexture(piece.material);
  useFrame((_, dt) => {
    if (!root.current) return;
    age.current += dt;
    for (const child of root.current.children) {
      const slab = child as THREE.Group;
      slab.scale.y = THREE.MathUtils.smoothstep(age.current, -0.035, 0.19);
      const body = slab.children[0] as THREE.Mesh<THREE.BoxGeometry, THREE.MeshStandardMaterial>;
      body.material.color.copy(baseColor.set(finish.color).multiplyScalar(1.22)).lerp(scuff, (1 - piece.integrity) * 0.75);
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
              <meshStandardMaterial
                roughness={finish.roughness}
                metalness={finish.metalness}
                color={finish.color}
                map={surfaceMap ?? undefined}
                bumpMap={surfaceMap ?? undefined}
                bumpScale={material === 'Wood' ? 0.045 : 0.035}
              />
            </mesh>
            {Array.from({ length: strips }, (_, row) => {
              const width = size.x / strips;
              const color = new THREE.Color(finish.color).multiplyScalar(1.04 + 0.06 * (row % 5));
              const x = -size.x / 2 + width * (row + 0.5);
              return <mesh key={row} geometry={unit} position={[x, wall ? 0 : size.y / 2 + 0.007, wall ? size.z / 2 + 0.006 : 0]}
                scale={[width - 0.022, wall ? size.y - 0.018 : 0.019, wall ? 0.021 : size.z - 0.018]} receiveShadow>
                <meshStandardMaterial
                  roughness={finish.roughness}
                  metalness={finish.metalness}
                  color={color}
                  map={surfaceMap ?? undefined}
                  bumpMap={surfaceMap ?? undefined}
                  bumpScale={0.03}
                />
              </mesh>;
            })}
            {material !== 'Stone' && [-1, 1].map((side) => <mesh key={side} geometry={unit}
              position={[side * (size.x / 2 - 0.12), 0, 0]}
              scale={[0.16, wall ? size.y : size.y + 0.03, wall ? size.z + 0.03 : size.z]} receiveShadow>
              <meshStandardMaterial
                color={material === 'Wood' ? '#9c6f46' : '#5a6d76'}
                map={surfaceMap ?? undefined}
                bumpMap={surfaceMap ?? undefined}
                bumpScale={0.03}
                roughness={finish.roughness}
                metalness={finish.metalness}
              />
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
    root.visible = Boolean(
      plan && construction.active && !simState.startMenuOpen && !simState.controlsOpen &&
      !simState.customizerOpen && !simState.parachuting && !simState.gliding && simState.mode === 'FOOT'
    );
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
