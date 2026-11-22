import { useEffect, useLayoutEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import { useFrame } from '@react-three/fiber';
import {
  COAST_CONNECTORS, COAST_ROAD_HALF_WIDTH, STUNT_RAMPS, coastBeachWidth,
  coastConnectorEnd, coastConnectorHeight, coastJunction, coastRoadHeight,
  coastRoadRadius, getTerrainHeight, getTravelHeight,
} from '../game/worldMath';
import { createPavementRoughnessTexture, createPavementTexture } from './Textures';
import { DamageableProp, WorldSectionBatch, type Vec3, type WorldFinish, type WorldPart } from './WorldSections';
import { LOBBY_THEMES, resolveActiveThemeId } from '../game/lobbyThemes';
import { simState } from '../game/store';

const segments = 600;
const turn = Math.PI * 2;
const steel: WorldFinish = { material: 'metal', roughness: 0.5, metalness: 0.4 };
const lamps: WorldFinish = { material: 'glass', roughness: 0.26, emissive: '#fff0ca' };
const concrete: WorldFinish = { material: 'masonry', roughness: 0.81 };

function coastPoint(angle: number, line: number, lift: number): Vec3 {
  const radius = coastRoadRadius(angle) + line;
  const x = Math.sin(angle) * radius;
  const z = Math.cos(angle) * radius;
  return [x, coastRoadHeight(x, z) + lift, z];
}

function surface(rows: [Vec3, Vec3][], keep?: (index: number) => boolean) {
  const geo = new THREE.BufferGeometry();
  const positions = rows.flatMap(([left, right]) => [...left, ...right]);
  const indices: number[] = [];
  for (let index = 0; index < rows.length - 1; index++) {
    if (keep && !keep(index)) continue;
    const i = index * 2;
    indices.push(i, i + 1, i + 2, i + 1, i + 3, i + 2);
  }
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(
    rows.flatMap((row) => row.flatMap(([x, , z]) => [x / 7, z / 7])), 2,
  ));
  geo.setIndex(indices);
  geo.computeVertexNormals();
  return geo;
}

function coastStrip(inner: number, outer: number, lift: number, keep?: (index: number) => boolean) {
  return surface(Array.from({ length: segments + 1 }, (_, i) => {
    const angle = turn * i / segments;
    return [coastPoint(angle, inner, lift), coastPoint(angle, outer, lift)];
  }), keep);
}

function clearJunction(index: number, clearance: number) {
  const [x, , z] = coastPoint(turn * (index + 0.5) / segments, 0, 0);
  return !coastJunction(x, z, clearance);
}

function connectorMesh(road: typeof COAST_CONNECTORS[number], side: number, from: number, to: number, lift: number, endOffset = -7.7) {
  const innerZ = road.z + from;
  const outerZ = road.z + to;
  const endA = coastConnectorEnd(innerZ, side, endOffset);
  const endB = coastConnectorEnd(outerZ, side, endOffset);
  return surface(Array.from({ length: 22 }, (_, i) => {
    const fraction = i / 21;
    const x = THREE.MathUtils.lerp((road.cityEnd - 0.2) * side, endA, fraction);
    const other = THREE.MathUtils.lerp((road.cityEnd - 0.2) * side, endB, fraction);
    const row: [Vec3, Vec3] = [
      [x, coastConnectorHeight(x, innerZ) + lift, innerZ],
      [other, coastConnectorHeight(other, outerZ) + lift, outerZ],
    ];
    return side > 0 ? [row[1], row[0]] : row;
  }));
}

function roadsideParts() {
  const metal: WorldPart[] = [];
  const glass: WorldPart[] = [];
  const foundations: WorldPart[] = [];
  for (let i = 0; i < segments; i++) {
    const angle = turn * i / segments;
    const [x, y, z] = coastPoint(angle, 10.15, 0);
    if (!clearJunction(i, 5)) continue;
    const owner = 'Coastal road · ' + i;
    const [nx, ny, nz] = coastPoint(turn * (i + 1) / segments, 10.15, 0);
    const yaw = Math.atan2(nx - x, nz - z);
    const prom = Math.abs(z + 95) < 32 && x > 0;
    const guard = prom || (Math.cos(angle * 4 + 0.8) > 0.13 && i % 60 > 8);
    if (guard) {
      metal.push({ owner, label: 'Guardrail', finish: 'steel', position: [(x + nx) / 2, (y + ny) / 2 + 0.67, (z + nz) / 2],
        size: [0.18, 0.32, Math.hypot(nx - x, nz - z) + 0.06], yaw, durability: 92, color: '#879da0' });
      if (i % 2 === 0) metal.push({ owner, label: 'Guardrail post', finish: 'steel',
        position: [x, y + 0.37, z], size: [0.19, 0.79, 0.19], durability: 55, color: '#506065' });
    }
    if (i % 12 === 0) {
      const [lx, ly, lz] = coastPoint(angle, -10.2, 0);
      metal.push({ owner, label: 'Coastal lamp post', finish: 'steel', position: [lx, ly + 2.65, lz],
        size: [0.16, 5.3, 0.16], durability: 70, color: '#415456' });
      glass.push({ owner, label: 'Coastal lamp', finish: 'glass', position: [lx, ly + 5.28, lz],
        size: [0.68, 0.15, 0.37], yaw, solid: false, durability: 21, color: '#d8cba2' });
    }
    if (prom && i % 5 === 0) {
      const [px, py, pz] = coastPoint(angle, 0, -0.24);
      const floor = getTerrainHeight(px, pz) - 0.4;
      foundations.push({ owner, label: 'Canal viaduct pier', finish: 'concrete', position: [px, (py + floor) / 2, pz],
        size: [8, Math.max(0.2, py - floor), 1.45], yaw, permanent: true, color: '#878882' });
    }
  }
  for (let x = -203; x < -49; x += 13) for (const z of [134.5, 175.5]) {
    const y = getTerrainHeight(x, z);
    const owner = 'Runway edge lighting';
    metal.push({ owner, label: 'Runway marker base', finish: 'steel', position: [x, y + 0.085, z],
      size: [0.28, 0.17, 0.29], color: '#50585d', durability: 27 });
    glass.push({ owner, label: 'Runway edge lamp', finish: 'glass', position: [x, y + 0.19, z],
      size: [0.15, 0.09, 0.17], color: '#d8eaf4', durability: 18, solid: false });
  }
  return { metal, glass, foundations };
}

export function CoastRoad() {
  const lampBatchRef = useRef<THREE.Group>(null);
  const lampMatRef = useRef<THREE.MeshStandardMaterial | null>(null);
  const lampGlowRef = useRef(0.38);

  const road = useMemo(() => {
    const h = COAST_ROAD_HALF_WIDTH;
    const asphalt = coastStrip(-h, h, 0.043);
    const shoulder = coastStrip(-h - 1.45, h + 1.45, 0.019);
    const lines = [
      coastStrip(-h + 0.47, -h + 0.59, 0.066, (i) => clearJunction(i, 1)),
      coastStrip(h - 0.59, h - 0.47, 0.066, (i) => clearJunction(i, 1)),
      coastStrip(-0.08, 0.08, 0.066, (i) => i % 4 < 2 && clearJunction(i, 2)),
    ];
    const south = surface([
      [[16, 3.245, 193], [-16, 3.245, 193]],
      [[16, 3.289, 208], [-21.2, 3.289, 208]],
      [[20, 3.289, 220], [-33, 3.289, 220]],
      [[20, 3.289, 225], [-33, 3.289, 225]],
    ]);
    const connectors = COAST_CONNECTORS.flatMap((road) => [-1, 1].map((side) => ({
      surface: connectorMesh(road, side, -road.halfWidth, road.halfWidth, 0.039),
      line: connectorMesh(road, side, -0.072, 0.072, 0.061, -9.2),
    })));
    return { asphalt, shoulder, lines, connectors, south };
  }, []);
  const parts = useMemo(roadsideParts, []);
  const pavement = useMemo(createPavementTexture, []);
  const pavementRoughness = useMemo(createPavementRoughnessTexture, []);
  const bollardGlowMat = useMemo(
    () =>
      new THREE.MeshStandardMaterial({
        color: '#fff2cc',
        emissive: '#ffd485',
        emissiveIntensity: 0.38,
        roughness: 0.22,
      }),
    []
  );
  const beach = useMemo(() => [-2.23, -1.82, -0.43, 0.27, 1.14, 2.14].map((angle, index) => {
    const radius = coastRoadRadius(angle) + coastBeachWidth(angle) * 0.62;
    const x = Math.sin(angle) * radius;
    const z = Math.cos(angle) * radius;
    return { x, z, color: index % 2 ? '#edb354' : '#4ea8a7', index };
  }), []);
  const ramps = useMemo(() => STUNT_RAMPS.map((ramp) => {
    const sin = Math.sin(ramp.yaw);
    const cos = Math.cos(ramp.yaw);
    const y = getTerrainHeight(ramp.x, ramp.z);
    return surface(Array.from({ length: 17 }, (_, i) => {
      const f = i / 16;
      const x = ramp.x + sin * f * ramp.length;
      const z = ramp.z + cos * f * ramp.length;
      const h = y + f ** 1.6 * ramp.height + 0.035;
      const side = ramp.width * 0.5;
      return [[x + cos * side, h, z - sin * side], [x - cos * side, h, z + sin * side]];
    }));
  }), []);

  useLayoutEffect(() => {
    lampMatRef.current = null;
    lampBatchRef.current?.traverse((obj) => {
      if (obj instanceof THREE.Mesh && obj.material instanceof THREE.MeshStandardMaterial) {
        lampMatRef.current = obj.material;
      }
    });
  }, [parts]);

  useFrame((_, dt) => {
    const activeThemeId = resolveActiveThemeId(simState.startMenuOpen, simState.lobbyTheme, simState.worldTimeTheme);
    const targetGlow = 0.25 + LOBBY_THEMES[activeThemeId].windowGlow * 1.65;
    const damp = 1 - Math.exp(-2.8 * Math.min(dt, 0.1));
    lampGlowRef.current = THREE.MathUtils.lerp(lampGlowRef.current, targetGlow, damp);
    if (lampMatRef.current) {
      lampMatRef.current.emissiveIntensity = lampGlowRef.current;
    }
    bollardGlowMat.emissiveIntensity = lampGlowRef.current * 0.92;
  });

  useEffect(() => () => {
    pavement.dispose();
    pavementRoughness.dispose();
    bollardGlowMat.dispose();
    [road.asphalt, road.shoulder, road.south, ...road.lines,
      ...road.connectors.flatMap((connector) => [connector.surface, connector.line]), ...ramps].forEach((geo) => geo.dispose());
  }, [road, pavement, pavementRoughness, bollardGlowMat, ramps]);

  return (
    <group>
      <mesh geometry={road.shoulder} receiveShadow>
        <meshStandardMaterial color="#a7a69a" roughness={0.9} side={THREE.DoubleSide} polygonOffset polygonOffsetFactor={2} polygonOffsetUnits={2} />
      </mesh>
      <mesh geometry={road.asphalt} receiveShadow>
        <meshStandardMaterial map={pavement} roughnessMap={pavementRoughness} roughness={0.9} side={THREE.DoubleSide} />
      </mesh>
      <mesh geometry={road.south} receiveShadow>
        <meshStandardMaterial map={pavement} roughnessMap={pavementRoughness} roughness={0.9} side={THREE.DoubleSide} polygonOffset polygonOffsetFactor={2} polygonOffsetUnits={2} />
      </mesh>
      {road.lines.map((geometry, i) => (
        <mesh key={i} geometry={geometry} receiveShadow>
          <meshStandardMaterial color="#e9e2c9" roughness={0.82} side={THREE.DoubleSide} polygonOffset polygonOffsetFactor={-2} polygonOffsetUnits={-2} />
        </mesh>
      ))}
      {road.connectors.map(({ surface, line }, i) => (
        <group key={i}>
          <mesh geometry={surface} receiveShadow>
            <meshStandardMaterial map={pavement} roughnessMap={pavementRoughness} roughness={0.9} side={THREE.DoubleSide} polygonOffset polygonOffsetFactor={1} polygonOffsetUnits={1} />
          </mesh>
          <mesh geometry={line} receiveShadow>
            <meshStandardMaterial color="#c8af6f" roughness={0.8} side={THREE.DoubleSide} polygonOffset polygonOffsetFactor={-2} polygonOffsetUnits={-2} />
          </mesh>
        </group>
      ))}
      {ramps.map((geometry, i) => (
        <mesh key={i} geometry={geometry} receiveShadow>
          <meshStandardMaterial color="#746a57" roughness={0.88} side={THREE.DoubleSide} polygonOffset polygonOffsetFactor={-1} polygonOffsetUnits={-1} />
        </mesh>
      ))}
      <WorldSectionBatch parts={parts.foundations} finish={concrete} />
      <WorldSectionBatch parts={parts.metal} finish={steel} />
      <group ref={lampBatchRef}>
        <WorldSectionBatch parts={parts.glass} finish={lamps} />
      </group>
      {beach.map(({ x, z, color, index }) => (
        <group key={index}>
          {index % 2 === 0 && <LifeguardStand x={x - 4.1} z={z - 1.6} index={index} />}
          <DamageableProp id={'beach-umbrella-' + index} label="Beach umbrella" position={[x, getTerrainHeight(x, z), z]} center={[0, 1.25, 0]} size={[0.27, 2.5, 0.27]} material="wood" durability={36}>
            <mesh position={[0, 1.15, 0]} castShadow><cylinderGeometry args={[0.045, 0.06, 2.3, 7]} /><meshStandardMaterial color="#866b4c" /></mesh>
            <mesh position={[0, 2.32, 0]} castShadow><coneGeometry args={[1.76, 0.53, 10]} /><meshStandardMaterial color={color} roughness={0.79} side={THREE.DoubleSide} /></mesh>
          </DamageableProp>
          <DamageableProp id={'beach-lounger-' + index} label="Beach lounger" position={[x + 1.7, getTerrainHeight(x + 1.7, z + 2), z + 2]} center={[0, 0.3, 0]} size={[0.76, 0.6, 1.9]} material="wood" durability={32}>
            <mesh position={[0, 0.26, 0]} castShadow><boxGeometry args={[0.76, 0.16, 1.9]} /><meshStandardMaterial color="#e4d3b3" /></mesh>
            <mesh position={[0, 0.47, -0.63]} rotation={[0.49, 0, 0]} castShadow><boxGeometry args={[0.7, 0.10, 0.65]} /><meshStandardMaterial color={color} /></mesh>
          </DamageableProp>
        </group>
      ))}
      <SouthBoardwalk bollardGlowMat={bollardGlowMat} />
    </group>
  );
}

function LifeguardStand({ x, z, index }: { x: number; z: number; index: number }) {
  return (
    <DamageableProp id={'lifeguard-' + index} label="Lifeguard stand"
      position={[x, getTerrainHeight(x, z), z]} center={[0, 1.75, 0]} size={[2.15, 3.5, 2.1]} material="wood" durability={105}>
      {[-0.82, 0.82].flatMap((px) => [-0.69, 0.69].map((pz) => (
        <mesh key={px + ':' + pz} position={[px, 1.13, pz]} castShadow>
          <boxGeometry args={[0.15, 2.28, 0.15]} /><meshStandardMaterial color="#8a6143" roughness={0.84} />
        </mesh>
      )))}
      <mesh position={[0, 2.08, 0]} castShadow><boxGeometry args={[2.36, 0.16, 2.14]} /><meshStandardMaterial color="#b68c5b" roughness={0.83} /></mesh>
      <mesh position={[0, 2.64, -0.27]} castShadow><boxGeometry args={[1.93, 1.17, 1.31]} /><meshStandardMaterial color="#e4e9dc" roughness={0.66} /></mesh>
      <mesh position={[0, 3.28, -0.27]} rotation={[0, 0, -0.08]} castShadow><boxGeometry args={[2.28, 0.15, 1.72]} /><meshStandardMaterial color="#a34f42" roughness={0.64} /></mesh>
      <mesh position={[0, 2.77, 0.393]}><boxGeometry args={[1.55, 0.47, 0.024]} /><meshStandardMaterial color="#617d83" metalness={0.32} roughness={0.27} /></mesh>
    </DamageableProp>
  );
}

function SouthBoardwalk({ bollardGlowMat }: { bollardGlowMat: THREE.MeshStandardMaterial }) {
  const angle = 0.48;
  const radius = coastRoadRadius(angle) + 33;
  const x = Math.sin(angle) * radius;
  const z = Math.cos(angle) * radius;
  const y = getTravelHeight(x, z) + 0.12;
  const slats = useMemo(() => Array.from({ length: 19 }, (_, i) => {
    const distance = i * 0.69;
    return {
      owner: 'South boardwalk', label: 'Boardwalk plank', finish: 'wood', color: i % 3 ? '#8e7459' : '#9f8465',
      position: [x + Math.sin(angle) * distance, y, z + Math.cos(angle) * distance] as Vec3,
      size: [4, 0.19, 0.67] as Vec3, yaw: angle, durability: 64,
    };
  }), [x, y, z]);
  return (
    <group>
      <WorldSectionBatch parts={slats} finish={boardwalkWood} />
      {[0.7, 4.9, 9.1, 12.1].flatMap((distance, idx) => [-1.6, 1.6].map((side) => {
        const px = x + Math.sin(angle) * distance + Math.cos(angle) * side;
        const pz = z + Math.cos(angle) * distance - Math.sin(angle) * side;
        const base = getTerrainHeight(px, pz) - 0.29;
        const hasBollardGlobe = idx === 0 || idx === 3;
        return (
          <group key={distance + ':' + side}>
            <mesh position={[px, (base + y) / 2, pz]} castShadow>
              <boxGeometry args={[0.22, Math.max(0.25, y - base), 0.22]} />
              <meshStandardMaterial color="#6a5544" roughness={0.87} />
            </mesh>
            {hasBollardGlobe && (
              <group position={[px, y + 0.34, pz]}>
                <mesh castShadow>
                  <cylinderGeometry args={[0.1, 0.12, 0.56, 8]} />
                  <meshStandardMaterial color="#4b3f35" roughness={0.82} />
                </mesh>
                <mesh position={[0, 0.33, 0]} material={bollardGlowMat}>
                  <sphereGeometry args={[0.11, 10, 10]} />
                </mesh>
              </group>
            )}
          </group>
        );
      }))}
    </group>
  );
}
const boardwalkWood: WorldFinish = { material: 'wood', roughness: 0.86 };
