import { Euler, Quaternion, Vector3 } from 'three';
import { getTravelHeight, isConstructionClosed, registerTravelSurface } from './worldMath';
import { registerWorldSection, worldBoxOccupied, type WorldMaterial } from './worldDamage';

export const BUILD_TYPES = ['Wall', 'Ramp', 'Floor', 'Roof'] as const;
export const BUILD_MATERIALS = ['Wood', 'Stone', 'Metal'] as const;
export type BuildType = typeof BUILD_TYPES[number];
export type BuildMaterial = typeof BUILD_MATERIALS[number];
export const BUILD_COST = 10;
export const BUILD_CELL = 4;
export const BUILD_HEIGHT = 2.4;

export const BUILD_FINISH = {
  Wood: { color: '#9f704a', world: 'wood', hp: 95, roughness: 0.84, metalness: 0.02 },
  Stone: { color: '#c3b195', world: 'masonry', hp: 160, roughness: 0.9, metalness: 0 },
  Metal: { color: '#657b81', world: 'metal', hp: 210, roughness: 0.42, metalness: 0.63 },
} satisfies Record<BuildMaterial, { color: string; world: WorldMaterial; hp: number; roughness: number; metalness: number }>;

export const construction = {
  active: false, pickaxe: false, type: 'Wall' as BuildType, material: 'Wood' as BuildMaterial,
  turn: 0, resources: { Wood: 30, Stone: 20, Metal: 20 },
  preview: null as Blueprint | null,
};
type Slab = { center: Vector3; size: Vector3; rotation: Quaternion };
type Blueprint = { key: string; origin: Vector3; turn: number; type: BuildType; material: BuildMaterial; valid: boolean; slabs: Slab[] };
export type BuiltPiece = Blueprint & { sequence: number; integrity: number; slabs: Slab[] };
const pieces = new Map<string, BuiltPiece>();
const cells = new Map<string, Set<BuiltPiece>>();
const subscribers = new Set<() => void>();
let serial = 0;
let snapshot: BuiltPiece[] = [];
export const placedPieces = () => snapshot;
export function subscribeBuild(listener: () => void) {
  subscribers.add(listener);
  return () => { subscribers.delete(listener); };
}
function publish() {
  snapshot = [...pieces.values()];
  subscribers.forEach((notify) => notify());
}

export function buildSlabs(origin: Vector3, type: BuildType, turn: number): Slab[] {
  const yaw = turn * Math.PI / 2;
  const rotation = new Quaternion().setFromEuler(new Euler(0, yaw, 0, 'YXZ'));
  const rise = Math.atan2(BUILD_HEIGHT, BUILD_CELL);
  const slopeLength = Math.hypot(BUILD_HEIGHT, BUILD_CELL);
  const slab = (x: number, y: number, z: number, w: number, h: number, d: number, pitch = 0, heading = 0) => ({
    center: new Vector3(x, y, z).applyQuaternion(rotation).add(origin),
    size: new Vector3(w, h, d),
    rotation: new Quaternion().setFromEuler(new Euler(pitch, yaw + heading, 0, 'YXZ')),
  });
  if (type === 'Wall') return [slab(0, BUILD_HEIGHT / 2, 1.9, 4, BUILD_HEIGHT, 0.2)];
  if (type === 'Floor') return [slab(0, -0.025, 0, 4, 0.18, 4)];
  if (type === 'Ramp') return [slab(0, BUILD_HEIGHT / 2 - 0.1, 0, 4, 0.22, slopeLength, -rise)];
  // A low gable provides a walkable roof and a second ramp orientation.
  const roofRise = 1.15;
  const pitch = Math.atan2(roofRise, 2);
  return [slab(0, roofRise / 2 - 0.1, -1, 4, 0.18, Math.hypot(roofRise, 2), -pitch),
    slab(0, roofRise / 2 - 0.1, 1, 4, 0.18, Math.hypot(roofRise, 2), pitch)];
}

function cellKey(x: number, z: number) {
  return Math.round(x / BUILD_CELL) + '/' + Math.round(z / BUILD_CELL);
}
const down = new Vector3(0, -1, 0);
const normal = new Vector3();
registerTravelSurface((x, z, feet) => {
  const nearby = cells.get(cellKey(x, z));
  let height = -Infinity;
  if (!nearby) return height;
  for (const piece of nearby) {
    if (piece.type === 'Wall') continue;
    for (const slab of piece.slabs) {
      normal.copy(down).negate().applyQuaternion(slab.rotation);
      const dx = x - slab.center.x;
      const dz = z - slab.center.z;
      const dy = (slab.size.y / 2 - normal.x * dx - normal.z * dz) / normal.y;
      const y = slab.center.y + dy;
      if (y <= feet + (piece.type === 'Ramp' ? 1 : 0.48) && Math.hypot(dx, dy, dz) < slab.size.length() / 2 + 0.08) {
        const fwd = new Vector3(0, 0, 1).applyQuaternion(slab.rotation);
        const side = new Vector3(1, 0, 0).applyQuaternion(slab.rotation);
        if (Math.abs(side.x * dx + side.y * dy + side.z * dz) <= slab.size.x / 2 + 0.02 &&
            Math.abs(fwd.x * dx + fwd.y * dy + fwd.z * dz) <= slab.size.z / 2 + 0.02) height = Math.max(height, y);
      }
    }
  }
  return height;
});

export function planBuild(point: Vector3, player: Vector3): Blueprint {
  const { type, material, turn } = construction;
  const x = Math.round(point.x / BUILD_CELL) * BUILD_CELL;
  const z = Math.round(point.z / BUILD_CELL) * BUILD_CELL;
  const grade = getTravelHeight(x, z, point.y + 0.2);
  const base = grade > -0.3 && Math.abs(point.y - grade) < 0.75 ? grade : 3.2;
  const level = Math.max(0, Math.min(15, Math.round((point.y - base) / BUILD_HEIGHT)));
  const y = base + level * BUILD_HEIGHT;
  const origin = new Vector3(x, y, z);
  const key = [cellKey(x, z), Math.round(y * 2), type, type === 'Wall' ? turn : 0].join('/');
  const slabs = buildSlabs(origin, type, turn);
  const cornerFloor = [-1.8, 1.8].flatMap((sx) => [-1.8, 1.8].map((sz) =>
    getTravelHeight(x + sx, z + sz, y - 0.08)));
  const cutsTerrain = type !== 'Wall' && cornerFloor.some((height) => height - y > 0.48);

  const actor = player.clone().add(new Vector3(0, 0.86, 0));
  const obstructed = slabs.some((slab) => {
    const local = actor.clone().sub(slab.center).applyQuaternion(slab.rotation.clone().invert());
    const half = slab.size.clone().multiplyScalar(0.5);
    const intersectsPlayer = Math.abs(local.x) < half.x + 0.31 && Math.abs(local.y) < half.y + 0.58 &&
      Math.abs(local.z) < half.z + 0.31;
    return intersectsPlayer || worldBoxOccupied(slab.center, half, slab.rotation);
  });
  const supported = Math.abs(y - grade) < 1.15 || [...pieces.values()].some((built) =>
    Math.hypot(x - built.origin.x, z - built.origin.z) <= BUILD_CELL + 0.1 &&
    Math.abs(y - built.origin.y) <= BUILD_HEIGHT + 0.4);
  const valid = !cutsTerrain && !pieces.has(key) && pieces.size < 160 && y > 0.18 && supported && !obstructed &&
    !isConstructionClosed(x, z) && Math.hypot(x - player.x, z - player.z) < 14 &&
    construction.resources[material] >= BUILD_COST;
  return { key, origin, turn, type, material, valid, slabs };
}

export function placeBuild(point: Vector3, player: Vector3) {
  const plan = planBuild(point, player);
  if (!plan.valid) return false;
  const { key, material, type, origin } = plan;
  const piece = { ...plan, sequence: serial++, integrity: 1 };
  const bucket = cellKey(origin.x, origin.z);
  if (!cells.has(bucket)) cells.set(bucket, new Set());
  cells.get(bucket)!.add(piece);
  const health = BUILD_FINISH[material].hp;
  const unregister = piece.slabs.map(({ center, size, rotation }) => registerWorldSection({
    owner: 'Build ' + piece.sequence, label: material + ' ' + type, material: BUILD_FINISH[material].world,
    center, halfSize: size.clone().multiplyScalar(0.5), rotation, hp: health, maxHp: health,
    onDamage(integrity, destroyed) {
      piece.integrity = Math.min(piece.integrity, integrity);
      if (!destroyed) return;
      pieces.delete(key);
      cells.get(bucket)?.delete(piece);
      unregister.forEach((remove) => remove());
      publish();
    },
  }));
  construction.resources[material] -= BUILD_COST;
  pieces.set(key, piece);
  publish();
  return true;
}

export function harvestResource(material: WorldMaterial): BuildMaterial {
  return material === 'wood' ? 'Wood' : material === 'metal' || material === 'glass' ? 'Metal' : 'Stone';
}
