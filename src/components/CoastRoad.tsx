import { useEffect, useLayoutEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import { useFrame } from '@react-three/fiber';
import {
  COAST_CONNECTORS, COAST_ROAD_HALF_WIDTH, COASTAL_OVERLOOKS, STUNT_RAMPS, coastBeachWidth,
  coastConnectorEnd, coastConnectorHeight, coastJunction, coastRoadHeight,
  coastRoadRadius, getTerrainHeight, getTravelHeight,
} from '../game/worldMath';
import { createLimestonePBR, createPavementRoughnessTexture, createPavementTexture } from './Textures';
import { DamageableProp, WorldSectionBatch, type Vec3, type WorldFinish, type WorldPart } from './WorldSections';
import { LOBBY_THEMES, resolveActiveThemeId } from '../game/lobbyThemes';
import { simState } from '../game/store';

const segments = 760;
const turn = Math.PI * 2;
const steel: WorldFinish = { material: 'metal', roughness: 0.5, metalness: 0.4 };
const lamps: WorldFinish = { material: 'glass', roughness: 0.26, emissive: '#fff0ca' };
const concrete: WorldFinish = { material: 'masonry', roughness: 0.81 };
const timber: WorldFinish = { material: 'wood', roughness: 0.82 };
const travertine: WorldFinish = { material: 'masonry', roughness: 0.72 };

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

function isCanalSpan(index: number) {
  const [x, , z] = coastPoint(turn * (index + 0.5) / segments, 0, 0);
  return x > 70 && Math.abs(z + 95) < 48;
}

function promenadeStrip(inner: number, maxWidth: number, lift: number, dropOuter = false) {
  const allowed = Array.from({ length: segments }, (_, i) => clearJunction(i, 4) && !isCanalSpan(i));
  const taper = (idx: number) => {
    const wrapped = ((idx % segments) + segments) % segments;
    if (!allowed[wrapped]) return 0;
    const ramp = 8;
    let nearestCut = ramp;
    for (let step = 1; step < ramp; step++) {
      if (!allowed[(wrapped + step) % segments] || !allowed[(wrapped - step + segments) % segments]) {
        nearestCut = step;
        break;
      }
    }
    const u = nearestCut / ramp;
    return u * u * (3 - 2 * u);
  };
  const rows: [Vec3, Vec3][] = Array.from({ length: segments + 1 }, (_, i) => {
    const angle = turn * i / segments;
    const width = maxWidth * taper(i);
    const pInner = coastPoint(angle, inner, lift);
    const outerLine = inner + width;
    if (!dropOuter) {
      return [pInner, coastPoint(angle, outerLine, lift)];
    }
    const [ox, oy, oz] = coastPoint(angle, outerLine + 0.55, 0);
    const groundY = getTerrainHeight(ox, oz);
    const skirtY = Math.min(oy - 0.16, groundY - 0.12);
    return [coastPoint(angle, outerLine, lift), [ox, skirtY, oz]];
  });
  return surface(rows, (i) => allowed[i] && (taper(i) > 0.01 || taper(i + 1) > 0.01));
}

function connectorMesh(road: typeof COAST_CONNECTORS[number], side: number, from: number, to: number, lift: number, endOffset = -7.7) {
  const innerZ = road.z + from;
  const outerZ = road.z + to;
  const endA = coastConnectorEnd(innerZ, side, endOffset);
  const endB = coastConnectorEnd(outerZ, side, endOffset);
  return surface(Array.from({ length: 28 }, (_, i) => {
    const fraction = i / 27;
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
  const woodParts: WorldPart[] = [];
  const stoneParts: WorldPart[] = [];
  for (let i = 0; i < segments; i++) {
    const angle = turn * i / segments;
    const [x, y, z] = coastPoint(angle, 10.15, 0);
    if (!clearJunction(i, 5)) continue;
    const owner = 'Coastal road · ' + i;
    const [nx, ny, nz] = coastPoint(turn * (i + 1) / segments, 10.15, 0);
    const yaw = Math.atan2(nx - x, nz - z);
    const prom = Math.abs(z + 95) < 36 && x > 0;
    const guard = prom || (Math.cos(angle * 4 + 0.8) > 0.13 && i % 60 > 8);
    if (guard) {
      metal.push({ owner, label: 'Guardrail', finish: 'steel', position: [(x + nx) / 2, (y + ny) / 2 + 0.67, (z + nz) / 2],
        size: [0.18, 0.32, Math.hypot(nx - x, nz - z) + 0.06], yaw, durability: 92, color: '#879da0' });
      if (i % 2 === 0) metal.push({ owner, label: 'Guardrail post', finish: 'steel',
        position: [x, y + 0.37, z], size: [0.19, 0.79, 0.19], durability: 55, color: '#506065' });
    }
    if (i % 14 === 0) {
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

  // 4 Scenic Coastal Headland Overlook Terraces with Teak Decks, Pergolas & Stone Balustrades
  for (const ov of COASTAL_OVERLOOKS) {
    const r = coastRoadRadius(ov.angle) + ov.offset;
    const cx = Math.sin(ov.angle) * r;
    const cz = Math.cos(ov.angle) * r;
    const sinA = Math.sin(ov.angle);
    const cosA = Math.cos(ov.angle);
    const atLocal = (across: number, outward: number): [number, number] => [
      cx + sinA * outward + cosA * across,
      cz + cosA * outward - sinA * across,
    ];
    const samplePts: [number, number][] = [
      [cx, cz],
      atLocal(-ov.width * 0.45, -ov.depth * 0.4),
      atLocal(ov.width * 0.45, -ov.depth * 0.4),
      atLocal(-ov.width * 0.45, ov.depth * 0.4),
      atLocal(ov.width * 0.45, ov.depth * 0.4),
    ];
    const deckY = Math.max(...samplePts.map(([px, pz]) => getTerrainHeight(px, pz))) + 0.42;
    const owner = ov.name;

    // Main teak overlook deck & perimeter stone plinth
    woodParts.push({
      owner, label: 'Overlook deck', finish: 'wood', color: '#9c7d5c',
      position: [cx, deckY, cz], size: [ov.width, 0.34, ov.depth], yaw: ov.angle, durability: 220,
    });
    const [rearX, rearZ] = atLocal(0, -ov.depth * 0.5 - 0.8);
    stoneParts.push({
      owner, label: 'Overlook entry step', finish: 'stone', color: '#d8cbb4',
      position: [rearX, deckY - 0.16, rearZ], size: [ov.width * 0.65, 0.34, 1.8], yaw: ov.angle, durability: 240,
    });

    // Anchored concrete piers from deck underside down into headland bluff terrain
    for (const across of [-ov.width * 0.42, 0, ov.width * 0.42]) {
      for (const outward of [-ov.depth * 0.38, ov.depth * 0.38]) {
        const [px, pz] = atLocal(across, outward);
        const groundY = getTerrainHeight(px, pz) - 0.55;
        const pierH = Math.max(0.45, deckY - 0.15 - groundY);
        foundations.push({
          owner, label: 'Overlook pier', finish: 'concrete', color: '#9a968b',
          position: [px, groundY + pierH * 0.5, pz], size: [0.65, pierH, 0.65], yaw: ov.angle, permanent: true,
        });
      }
    }

    // Seaward stone balustrade & timber bench
    const [frontX, frontZ] = atLocal(0, ov.depth * 0.46);
    stoneParts.push({
      owner, label: 'Overlook balustrade', finish: 'stone', color: '#ddd2be',
      position: [frontX, deckY + 0.58, frontZ], size: [ov.width - 0.6, 0.86, 0.34], yaw: ov.angle, durability: 180,
    });
    for (const benchOff of [-ov.width * 0.24, ov.width * 0.24]) {
      const [bx, bz] = atLocal(benchOff, ov.depth * 0.22);
      woodParts.push({
        owner, label: 'Overlook bench', finish: 'wood', color: '#a8845c',
        position: [bx, deckY + 0.44, bz], size: [3.2, 0.18, 0.72], yaw: ov.angle, durability: 75,
      });
    }

    // Shaded timber pergola over rear half of the overlook terrace
    const pergW = ov.width * 0.72;
    const pergD = ov.depth * 0.52;
    for (const ax of [-pergW * 0.5, 0, pergW * 0.5]) {
      for (const az of [-pergD * 0.5, pergD * 0.5]) {
        const [px, pz] = atLocal(ax, az - ov.depth * 0.14);
        woodParts.push({
          owner, label: 'Pergola column', finish: 'wood', color: '#785a3e',
          position: [px, deckY + 1.95, pz], size: [0.28, 3.6, 0.28], yaw: ov.angle, durability: 115,
        });
      }
    }
    for (const az of [-pergD * 0.5, pergD * 0.5]) {
      const [bx, bz] = atLocal(0, az - ov.depth * 0.14);
      woodParts.push({
        owner, label: 'Pergola beam', finish: 'wood', color: '#8a6949',
        position: [bx, deckY + 3.82, bz], size: [pergW + 0.9, 0.24, 0.26], yaw: ov.angle, durability: 90,
      });
    }
    for (let rIdx = -4; rIdx <= 4; rIdx++) {
      const [rx, rz] = atLocal((rIdx / 4) * (pergW * 0.48), -ov.depth * 0.14);
      woodParts.push({
        owner, label: 'Pergola rafter', finish: 'wood', color: '#9c7856',
        position: [rx, deckY + 4.04, rz], size: [0.15, 0.14, pergD + 1.1], yaw: ov.angle, durability: 65,
      });
    }
    // Corner glowing lantern caps
    for (const ax of [-ov.width * 0.44, ov.width * 0.44]) {
      const [lx, lz] = atLocal(ax, ov.depth * 0.45);
      metal.push({
        owner, label: 'Overlook bollard', finish: 'steel', color: '#455154',
        position: [lx, deckY + 1.18, lz], size: [0.22, 0.52, 0.22], yaw: ov.angle, durability: 60,
      });
      glass.push({
        owner, label: 'Overlook lantern', finish: 'glass', color: '#fff0c4',
        position: [lx, deckY + 1.54, lz], size: [0.28, 0.28, 0.28], yaw: ov.angle, solid: false, durability: 25,
      });
    }
  }

  return { metal, glass, foundations, woodParts, stoneParts };
}

export function CoastRoad() {
  const lampBatchRef = useRef<THREE.Group>(null);
  const lampMatRef = useRef<THREE.MeshStandardMaterial | null>(null);
  const lampGlowRef = useRef(0.38);

  const road = useMemo(() => {
    const h = COAST_ROAD_HALF_WIDTH;
    const asphalt = coastStrip(-h, h, 0.043);
    const shoulder = coastStrip(-h - 1.45, h + 1.45, 0.019);
    const promenade = promenadeStrip(h + 1.45, 4.15, 0.038, false);
    const promenadeCurb = promenadeStrip(h + 1.45, 4.15, 0.038, true);
    const lines = [
      coastStrip(-h + 0.47, -h + 0.59, 0.066, (i) => clearJunction(i, 1)),
      coastStrip(h - 0.59, h - 0.47, 0.066, (i) => clearJunction(i, 1)),
      coastStrip(-0.08, 0.08, 0.066, (i) => i % 4 < 2 && clearJunction(i, 2)),
    ];
    const south = surface([
      [[16, 3.245, 193], [-16, 3.245, 193]],
      [[16, 3.289, 208], [-21.2, 3.289, 208]],
      [[20, 3.289, 222], [-33, 3.289, 222]],
      [[20, 3.289, 229], [-33, 3.289, 229]],
    ]);
    const connectors = COAST_CONNECTORS.flatMap((road) => [-1, 1].map((side) => ({
      surface: connectorMesh(road, side, -road.halfWidth, road.halfWidth, 0.039),
      line: connectorMesh(road, side, -0.072, 0.072, 0.061, -9.2),
    })));
    return { asphalt, shoulder, promenade, promenadeCurb, lines, connectors, south };
  }, []);
  const parts = useMemo(roadsideParts, []);
  const pavement = useMemo(createPavementTexture, []);
  const pavementRoughness = useMemo(createPavementRoughnessTexture, []);
  const promenadeTex = useMemo(() => {
    const tex = createLimestonePBR();
    tex.repeat.set(2, 2);
    return tex;
  }, []);
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
  const beach = useMemo(() => [-2.55, -2.05, -1.55, -0.95, -0.38, 0.18, 0.62, 1.08, 1.44, 2.28, 2.66, -0.14].map((angle, index) => {
    const radius = coastRoadRadius(angle) + coastBeachWidth(angle) * (index % 3 === 0 ? 0.54 : 0.64);
    const x = Math.sin(angle) * radius;
    const z = Math.cos(angle) * radius;
    const palette = ['#edb354', '#4ea8a7', '#e06c55', '#3b8ea5'];
    return { x, z, angle, color: palette[index % palette.length], index };
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
    promenadeTex.dispose();
    bollardGlowMat.dispose();
    [road.asphalt, road.shoulder, road.promenade, road.promenadeCurb, road.south, ...road.lines,
      ...road.connectors.flatMap((connector) => [connector.surface, connector.line]), ...ramps].forEach((geo) => geo.dispose());
  }, [road, pavement, pavementRoughness, promenadeTex, bollardGlowMat, ramps]);

  return (
    <group>
      <mesh geometry={road.shoulder} receiveShadow>
        <meshStandardMaterial color="#a7a69a" roughness={0.9} side={THREE.DoubleSide} polygonOffset polygonOffsetFactor={2} polygonOffsetUnits={2} />
      </mesh>
      <mesh geometry={road.promenade} receiveShadow>
        <meshStandardMaterial map={promenadeTex} color="#d4cab6" roughness={0.84} side={THREE.DoubleSide} polygonOffset polygonOffsetFactor={1} polygonOffsetUnits={1} />
      </mesh>
      <mesh geometry={road.promenadeCurb} receiveShadow>
        <meshStandardMaterial color="#bfb5a0" roughness={0.86} side={THREE.DoubleSide} />
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
      <WorldSectionBatch parts={parts.woodParts} finish={timber} />
      <WorldSectionBatch parts={parts.stoneParts} finish={travertine} />
      <WorldSectionBatch parts={parts.metal} finish={steel} />
      <group ref={lampBatchRef}>
        <WorldSectionBatch parts={parts.glass} finish={lamps} />
      </group>
      {beach.map(({ x, z, angle, color, index }) => (
        <group key={index}>
          {index % 3 === 0 && <LifeguardStand x={x - 4.4} z={z - 1.8} index={index} />}
          {index % 3 === 1 && <BeachCabana x={x - 3.6} z={z + 2.4} angle={angle} color={color} index={index} />}
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

function BeachCabana({ x, z, angle, color, index }: { x: number; z: number; angle: number; color: string; index: number }) {
  const y = getTerrainHeight(x, z);
  return (
    <DamageableProp id={'beach-cabana-' + index} label="Beach cabana"
      position={[x, y, z]} center={[0, 1.35, 0]} size={[3.2, 2.7, 2.8]} material="wood" durability={78}>
      <group rotation={[0, angle, 0]}>
        <mesh position={[0, 0.12, 0]} castShadow receiveShadow>
          <boxGeometry args={[3.2, 0.22, 2.8]} /><meshStandardMaterial color="#b9976d" roughness={0.82} />
        </mesh>
        {[-1.4, 1.4].flatMap((px) => [-1.2, 1.2].map((pz) => (
          <mesh key={px + ':' + pz} position={[px, 1.25, pz]} castShadow>
            <boxGeometry args={[0.14, 2.3, 0.14]} /><meshStandardMaterial color="#7d5f42" roughness={0.85} />
          </mesh>
        )))}
        <mesh position={[0, 2.48, 0]} castShadow>
          <boxGeometry args={[3.45, 0.18, 3.05]} /><meshStandardMaterial color="#f5efe2" roughness={0.86} />
        </mesh>
        <mesh position={[0, 2.34, 1.48]}>
          <boxGeometry args={[3.35, 0.34, 0.08]} /><meshStandardMaterial color={color} roughness={0.82} />
        </mesh>
      </group>
    </DamageableProp>
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
  const angle = 0.34;
  const radius = coastRoadRadius(angle) + 34;
  const x = Math.sin(angle) * radius;
  const z = Math.cos(angle) * radius;
  const y = Math.max(getTravelHeight(x, z), getTerrainHeight(x, z)) + 0.24;
  const slats = useMemo(() => {
    const list: WorldPart[] = Array.from({ length: 32 }, (_, i) => {
      const distance = i * 0.69;
      return {
        owner: 'South boardwalk', label: 'Boardwalk plank', finish: 'wood', color: i % 3 ? '#8e7459' : '#9f8465',
        position: [x + Math.sin(angle) * distance, y, z + Math.cos(angle) * distance] as Vec3,
        size: [4.6, 0.19, 0.67] as Vec3, yaw: angle, durability: 64,
      };
    });
    // Wide ocean-viewing pier head deck at the end of the extended Southern Riviera Boardwalk
    const endDist = 32 * 0.69 + 2.4;
    list.push({
      owner: 'South boardwalk', label: 'Riviera viewing deck', finish: 'wood', color: '#9c7f61',
      position: [x + Math.sin(angle) * endDist, y, z + Math.cos(angle) * endDist] as Vec3,
      size: [8.4, 0.24, 5.2] as Vec3, yaw: angle, durability: 110,
    });
    return list;
  }, [x, y, z]);
  return (
    <group>
      <WorldSectionBatch parts={slats} finish={boardwalkWood} />
      {[0.7, 5.5, 10.3, 15.1, 19.9, 25.2].flatMap((distance, idx) => [-1.9, 1.9].map((side) => {
        const px = x + Math.sin(angle) * distance + Math.cos(angle) * side;
        const pz = z + Math.cos(angle) * distance - Math.sin(angle) * side;
        const base = getTerrainHeight(px, pz) - 0.35;
        const hasBollardGlobe = idx === 0 || idx === 2 || idx === 4 || idx === 5;
        return (
          <group key={distance + ':' + side}>
            <mesh position={[px, (base + y) / 2, pz]} castShadow>
              <boxGeometry args={[0.24, Math.max(0.28, y - base), 0.24]} />
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
