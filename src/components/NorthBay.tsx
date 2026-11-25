import React, { useEffect, useLayoutEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import { useFrame } from '@react-three/fiber';
import { getBridgeHeight, getIslandTwoHeight, getTerrainHeight, NORTH_BAY_BRIDGE } from '../game/worldMath';
import { registerWorldSection } from '../game/worldDamage';
import { createAsphaltRoadTexture } from './Textures';
import { WorldSectionBatch, type Vec3, type WorldPart, type WorldFinish } from './WorldSections';

const { approach, landing, gate, halfWidth, piers, railsBegin } = NORTH_BAY_BRIDGE;
const towerZ = [-278, -321];
const roadX = halfWidth + 0.05;

function canvasTexture(width: number, height: number, draw: (ctx: CanvasRenderingContext2D) => void) {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  draw(canvas.getContext('2d')!);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 8;
  return texture;
}

function createDeck(slab = false) {
  const segments = Math.abs(landing - approach);
  const positions: number[] = [];
  const uvs: number[] = [];
  const indices: number[] = [];
  const stride = slab ? 4 : 2;
  for (let i = 0; i <= segments; i++) {
    const z = approach - i;
    const y = getBridgeHeight(z);
    if (slab) {
      positions.push(-roadX, y - 0.04, z, roadX, y - 0.04, z,
        roadX, y - 1.23, z, -roadX, y - 1.23, z);
      uvs.push(0, i / 24, 1, i / 24, 0, i / 24, 1, i / 24);
    } else {
      positions.push(-roadX, y, z, roadX, y, z);
      uvs.push(0, i / 24, 1, i / 24);
    }
    if (i < segments) {
      const offset = i * stride;
      for (let face = 0; face < (slab ? 4 : 1); face++) {
        const a = offset + face;
        const b = offset + (face + 1) % stride;
        indices.push(a, b, a + stride, b, b + stride, a + stride);
      }
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geo.setIndex(indices);
  geo.computeVertexNormals();
  return geo;
}

function Beam({ from, to, width, depth = width, color, rail = false }: {
  from: Vec3; to: Vec3; width: number; depth?: number; color: string; rail?: boolean;
}) {
  const a = new THREE.Vector3(...from);
  const b = new THREE.Vector3(...to);
  const direction = b.clone().sub(a);
  const rotation = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), direction.clone().normalize());
  return (
    <object3D position={a.lerp(b, 0.5)} quaternion={rotation}
      scale={[width, direction.length() + 0.045, depth]} userData={{ bayBeamColor: color, bayRail: rail }} />
  );
}

export function NorthBay() {
  const beacons = useRef<THREE.Group>(null);
  const bay = useRef<THREE.Group>(null);
  const beams = useRef<THREE.InstancedMesh>(null);
  useLayoutEffect(() => {
    const root = bay.current!;
    const batch = beams.current!;
    const inverse = root.matrixWorld.clone();
    root.updateWorldMatrix(true, true);
    inverse.copy(root.matrixWorld).invert();
    let count = 0;
    const color = new THREE.Color();
    const matrix = new THREE.Matrix4();
    const unregister: (() => void)[] = [];
    root.traverse((object) => {
      if (!object.userData.bayBeamColor) return;
      const index = count++;
      const transform = matrix.multiplyMatrices(inverse, object.matrixWorld).clone();
      const paint = new THREE.Color(object.userData.bayBeamColor);
      batch.setMatrixAt(index, transform);
      batch.setColorAt(index, paint);
      const size = object.getWorldScale(new THREE.Vector3());
      const durability = Math.round(48 + Math.min(120, size.length() * 2));
      unregister.push(registerWorldSection({
        owner: 'North Bay works', label: object.userData.bayRail ? 'Bridge guardrail' : 'Steel beam', material: 'metal',
        center: object.getWorldPosition(new THREE.Vector3()), halfSize: size.multiplyScalar(0.5),
        rotation: object.getWorldQuaternion(new THREE.Quaternion()), solid: Boolean(object.userData.bayRail),
        hp: durability, maxHp: durability,
        onDamage: (integrity, destroyed) => {
          if (destroyed) {
            batch.setMatrixAt(index, transform.clone().scale(new THREE.Vector3(0, 0, 0)));
            batch.instanceMatrix.needsUpdate = true;
          } else {
            batch.setColorAt(index, color.copy(paint).multiplyScalar(0.45 + integrity * 0.55));
            if (batch.instanceColor) batch.instanceColor.needsUpdate = true;
          }
        },
      }));
    });
    batch.count = count;
    batch.instanceMatrix.needsUpdate = true;
    if (batch.instanceColor) batch.instanceColor.needsUpdate = true;
    batch.computeBoundingSphere();
    return () => unregister.forEach((remove) => remove());
  }, []);
  const deck = useMemo(() => createDeck(), []);
  const deckSlab = useMemo(() => createDeck(true), []);
  const parts = useMemo(() => {
    const structure: WorldPart[] = [];
    const add = (label: string, color: string, position: Vec3, size: Vec3, material = 'concrete', solid = false, yaw = 0) =>
      structure.push({ owner: 'North Bay works', label, color, position, size, finish: material, solid, yaw });

    for (const z of piers) {
      const bottom = getTerrainHeight(0, z) - 0.8;
      const top = Math.min(getBridgeHeight(z - 2.6), getBridgeHeight(z + 2.6)) - 1.42;
      for (const x of [-10.5, 10.5]) {
        add('Bridge pier', '#a99f8c', [x, (top + bottom) / 2, z], [4.7, top - bottom, 6], 'concrete', true);
        add('Pier fender', '#7d7f7a', [x, 0.1, z], [7, 2.4, 9], 'concrete', true);
      }
      add('Bridge crosshead', '#8d857e', [0, top, z], [28, 1.3, 5], 'concrete');
    }

    for (const z of towerZ) {
      for (const x of [-17, 17]) {
        const bottom = getTerrainHeight(x, z) - 0.5;
        const deckY = getBridgeHeight(z);
        add('Suspension footing', '#a39a8b', [x, (bottom + deckY) * 0.5, z], [6.5, deckY - bottom, 9.2], 'concrete', true);
        add('Suspension tower', '#bf4d35', [x, deckY + 17, z], [2.65, 35, 4.3], 'steel', true);
        add('Tower cap', '#e16d49', [x, deckY + 34.6, z], [3.6, 1.1, 5], 'steel');
      }
      for (const y of [22, 31]) add('Portal beam', '#ba482d', [0, getBridgeHeight(z) + y, z], [34, 1.7, 2.5], 'steel', true);
    }
    for (let z = railsBegin; z >= gate + 3; z -= 4) {
      for (const x of [-roadX, roadX]) add('Rail post', '#cdd2c5', [x, getBridgeHeight(z) + 0.52, z], [0.2, 1.05, 0.22], 'steel', true);
    }

    // Grand Amusement Park Gateway Arch pillars at North Bay Bridge Landing (z = gate)
    for (const x of [-14.2, 14.2]) {
      add('Gateway pillar', '#ec4899', [x, getBridgeHeight(gate) + 3.2, gate], [1.65, 6.4, 1.65], 'steel', true);
      add('Gateway plinth', '#f8fafc', [x, getBridgeHeight(gate) + 0.65, gate], [2.4, 1.3, 2.4], 'concrete', true);
    }
    return structure;
  }, []);
  const finishes = useMemo<Record<string, WorldFinish>>(() => ({
    concrete: { material: 'masonry', roughness: 0.88 },
    steel: { material: 'metal', roughness: 0.52, metalness: 0.31 },
  }), []);
  const batches = useMemo(() => Object.entries(finishes).map(([id, finish]) => ({
    id, finish, parts: parts.filter((part) => part.finish === id),
  })), [parts, finishes]);
  const [asphalt, sign, approachSign] = useMemo(() => {
    const road = createAsphaltRoadTexture();
    road.repeat.set(1, 1);
    road.anisotropy = 8;
    const siteSign = canvasTexture(1024, 288, (ctx) => {
      ctx.fillStyle = '#0f172a';
      ctx.fillRect(0, 0, 1024, 288);
      ctx.fillStyle = '#ec4899';
      ctx.fillRect(0, 0, 1024, 16);
      ctx.fillStyle = '#38bdf8';
      ctx.fillRect(0, 272, 1024, 16);
      ctx.textAlign = 'center';
      ctx.fillStyle = '#f8fafc';
      ctx.font = 'bold 74px system-ui';
      ctx.fillText('AZUREA WONDER ISLAND', 512, 105);
      ctx.fillStyle = '#fde047';
      ctx.font = 'bold 44px system-ui';
      ctx.fillText('AMUSEMENT PARK & RIDABLE ATTRACTIONS', 512, 176);
      ctx.fillStyle = '#38bdf8';
      ctx.font = 'bold 34px system-ui';
      ctx.fillText('SKY WHEEL • CYCLONE COASTER • CAROUSEL • DROP TOWER', 512, 236);
    });
    const approachBoard = canvasTexture(768, 224, (ctx) => {
      ctx.fillStyle = '#0f172a';
      ctx.fillRect(0, 0, 768, 224);
      ctx.strokeStyle = '#38bdf8';
      ctx.lineWidth = 6;
      ctx.strokeRect(10, 10, 748, 204);
      ctx.fillStyle = '#f8fafc';
      ctx.textAlign = 'center';
      ctx.font = 'bold 46px system-ui';
      ctx.fillText('NORTH BAY CROSSING', 384, 87);
      ctx.fillStyle = '#fde047';
      ctx.font = 'bold 34px system-ui';
      ctx.fillText('WONDER ISLAND THEME PARK • OPEN AHEAD', 384, 157);
    });
    return [road, siteSign, approachBoard];
  }, []);
  useEffect(() => () => [deck, deckSlab, asphalt, sign, approachSign].forEach((asset) => asset.dispose()), [deck, deckSlab, asphalt, sign, approachSign]);

  const cable = useMemo(() => [-17, 17].map((x) => {
    const anchors = [-392, towerZ[1], towerZ[0], -216];
    const points = Array.from({ length: 90 }, (_, i) => {
      const z = THREE.MathUtils.lerp(anchors[0], anchors[3], i / 89);
      const a = anchors.findIndex((value) => z < value) - 1;
      const index = a < 0 ? 2 : a;
      const u = (z - anchors[index]) / (anchors[index + 1] - anchors[index]);
      const y = index === 0 ? 2 + 33 * u ** 1.55 : index === 2 ? 2 + 33 * (1 - u) ** 1.55 : 15 + 20 * (2 * u - 1) ** 2;
      return new THREE.Vector3(x, getBridgeHeight(z) + y, z);
    });
    return { points, geometry: new THREE.TubeGeometry(new THREE.CatmullRomCurve3(points), 96, 0.22, 8, false) };
  }), []);
  useEffect(() => () => cable.forEach(({ geometry }) => geometry.dispose()), [cable]);
  useFrame(({ clock }) => {
    beacons.current?.children.forEach((beacon, i) => {
      const mesh = beacon as THREE.Mesh<THREE.BufferGeometry, THREE.MeshStandardMaterial>;
      mesh.material.emissiveIntensity = (clock.elapsedTime * 2.4 + i * 0.5) % 1 < 0.35 ? 4 : 0.15;
    });
  });
  const rails = useMemo(() => [-roadX, roadX].flatMap((x) => Array.from({ length: 28 }, (_, i) => {
    const z = THREE.MathUtils.lerp(railsBegin, gate, i / 28);
    const next = THREE.MathUtils.lerp(railsBegin, gate, (i + 1) / 28);
    return { x, z, next };
  })), []);

  return (
    <group ref={bay}>
      <instancedMesh ref={beams} args={[undefined, undefined, 600]}>
        <boxGeometry args={[1, 1, 1]} /><meshStandardMaterial color="#ffffff" roughness={0.65} metalness={0.26} />
      </instancedMesh>
      <mesh geometry={deckSlab}><meshStandardMaterial color="#686563" roughness={0.91} side={THREE.DoubleSide} /></mesh>
      <mesh geometry={deck} receiveShadow><meshStandardMaterial map={asphalt} roughness={0.89} /></mesh>
      {batches.map(({ id, parts, finish }) => <WorldSectionBatch key={id} parts={parts} finish={finish} />)}
      {rails.map(({ x, z, next }) => (
        <React.Fragment key={x + '/' + z}>
          <Beam from={[x, getBridgeHeight(z) + 0.92, z]} to={[x, getBridgeHeight(next) + 0.92, next]} width={0.19} depth={0.24} color="#d0d4c8" rail />
        </React.Fragment>
      ))}
      {cable.map(({ geometry, points }, side) => (
        <React.Fragment key={side}>
          <mesh geometry={geometry}><meshStandardMaterial color="#bd543b" roughness={0.47} metalness={0.4} /></mesh>
          {points.filter((_, i) => i > 7 && i < 83 && i % 4 === 0).map((point) => (
            <Beam key={point.z} from={[point.x, getBridgeHeight(point.z) + 0.5, point.z]}
              to={[point.x, point.y, point.z]} width={0.065} color="#9b7566" />
          ))}
        </React.Fragment>
      ))}
      {[[0, gate, 7.6, 22, 5.625, sign], [11, -221, 5.1, 9.6, 2.8, approachSign]].map((entry, i) => {
        const [x, z, offset, w, h, texture] = entry as [number, number, number, number, number, THREE.Texture];
        const y = getBridgeHeight(z);
        return (
          <group key={i} position={[x, y, z + 0.5]}>
            {[-w * 0.42, w * 0.42].map((px) => <Beam key={px} from={[px, 0, -0.23]} to={[px, offset + h * 0.44, -0.23]} width={0.24} color="#525551" />)}
            <mesh position={[0, offset, 0]}><planeGeometry args={[w, h]} /><meshBasicMaterial map={texture} /></mesh>
          </group>
        );
      })}
      <group ref={beacons}>
        {[-14.2, 14.2].map((x) => (
          <mesh key={x} position={[x, getBridgeHeight(gate) + 6.65, gate + 0.12]}>
            <cylinderGeometry args={[0.24, 0.28, 0.36, 10]} />
            <meshStandardMaterial color="#38bdf8" emissive="#0ea5e9" />
          </mesh>
        ))}
      </group>
      {[[-16, -412], [16, -412], [-28, -445], [28, -445], [-65, -475], [65, -475], [0, -520]].map(([x, z], idx) => (
        <group key={`${x}_${z}_${idx}`} position={[x, getIslandTwoHeight(x, z), z]}>
          <Beam from={[0, 0, 0]} to={[0, 8, 0]} width={0.22} color="#555854" />
          <mesh position={[0, 7.8, 0.24]} rotation={[-0.42, 0, 0]}>
            <boxGeometry args={[1.75, 0.52, 0.36]} />
            <meshStandardMaterial color="#fff0bf" emissive="#ffe2a1" emissiveIntensity={1.45} />
          </mesh>
        </group>
      ))}
    </group>
  );
}
