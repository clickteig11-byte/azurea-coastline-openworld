import * as THREE from 'three';
import { getTravelHeight } from './worldMath';

export type WorldMaterial = 'glass' | 'masonry' | 'metal' | 'wood' | 'road';

export interface WorldSection {
  owner: string;
  label: string;
  material: WorldMaterial;
  center: THREE.Vector3;
  halfSize: THREE.Vector3;
  rotation?: THREE.Quaternion;
  hp: number;
  maxHp: number;
  permanent?: boolean;
  solid?: boolean;
  mesh?: THREE.Mesh;
  onDamage?: (integrity: number, destroyed: boolean) => void;
}

export interface WorldHit {
  point: THREE.Vector3;
  normal: THREE.Vector3;
  distance: number;
  section?: WorldSection;
}

export interface WorldImpact extends WorldHit {
  energy: number;
  material: WorldMaterial;
  destroyed: boolean;
}

const cellSize = 20;
const cells = new Map<string, Set<WorldSection>>();
const sections = new Map<string, { current: number; total: number; count: number; breaches: number }>();
const inverse = new WeakMap<WorldSection, THREE.Quaternion>();
const offsets = [-1, 1];
export const worldImpacts: WorldImpact[] = [];

export function registerWorldSection(section: WorldSection) {
  const bounds = new THREE.Box3();
  const corner = new THREE.Vector3();
  for (const x of offsets) for (const y of offsets) for (const z of offsets) {
    corner.set(x, y, z).multiply(section.halfSize);
    if (section.rotation) corner.applyQuaternion(section.rotation);
    bounds.expandByPoint(corner.add(section.center));
  }
  if (section.rotation) inverse.set(section, section.rotation.clone().invert());
  const occupied: string[] = [];
  for (let x = Math.floor(bounds.min.x / cellSize); x <= Math.floor(bounds.max.x / cellSize); x++) {
    for (let z = Math.floor(bounds.min.z / cellSize); z <= Math.floor(bounds.max.z / cellSize); z++) {
      const key = x + ',' + z;
      if (!cells.has(key)) cells.set(key, new Set());
      cells.get(key)!.add(section);
      occupied.push(key);
    }
  }
  const structure = sections.get(section.owner) ?? { current: 0, total: 0, count: 0, breaches: 0 };
  structure.count++;
  if (section.hp === 0) structure.breaches++;
  structure.current += section.hp;
  structure.total += section.maxHp;
  sections.set(section.owner, structure);
  return () => {
    for (const key of occupied) {
      const cell = cells.get(key);
      cell?.delete(section);
      if (cell?.size === 0) cells.delete(key);
    }
    if (section.hp === 0) structure.breaches--;
    structure.count--;
    structure.current -= section.hp;
    structure.total -= section.maxHp;
    if (structure.total <= 0) sections.delete(section.owner);
  };
}

function findSections(minX: number, minZ: number, maxX: number, maxZ: number) {
  const candidates = new Set<WorldSection>();
  for (let x = Math.floor(minX / cellSize); x <= Math.floor(maxX / cellSize); x++) {
    for (let z = Math.floor(minZ / cellSize); z <= Math.floor(maxZ / cellSize); z++) {
      cells.get(x + ',' + z)?.forEach((section) => candidates.add(section));
    }
  }
  return candidates;
}

const localOrigin = new THREE.Vector3();
const localDirection = new THREE.Vector3();
const localPoint = new THREE.Vector3();
const localNormal = new THREE.Vector3();
const negativeHalf = new THREE.Vector3();
const meshRaycaster = new THREE.Raycaster();
const localBox = new THREE.Box3();
const ray = new THREE.Ray();
const axes = ['x', 'y', 'z'] as const;

function intersectSection(section: WorldSection, origin: THREE.Vector3, direction: THREE.Vector3, padding: number, limit: number) {
  localOrigin.copy(origin).sub(section.center);
  localDirection.copy(direction);
  const rotation = inverse.get(section);
  if (rotation) {
    localOrigin.applyQuaternion(rotation);
    localDirection.applyQuaternion(rotation);
  }
  localBox.max.copy(section.halfSize).addScalar(padding);
  localBox.min.copy(localBox.max).negate();
  ray.set(localOrigin, localDirection);
  // Resolve overlaps as well as swept hits so exiting a vehicle against a wall is safe.
  const inside = localBox.containsPoint(localOrigin);
  if (inside) localPoint.copy(localOrigin);
  else if (!ray.intersectBox(localBox, localPoint)) return;
  const distance = localOrigin.distanceTo(localPoint);
  if (distance > limit) return;
  let axis: typeof axes[number] = 'x';
  for (const candidate of axes) {
    if (localBox.max[candidate] - Math.abs(localPoint[candidate]) < localBox.max[axis] - Math.abs(localPoint[axis])) axis = candidate;
  }
  localNormal.set(0, 0, 0);
  localNormal[axis] = Math.sign(localPoint[axis]) || 1;
  const depth = inside ? localBox.max[axis] - Math.abs(localPoint[axis]) : 0;
  const normal = localNormal.clone();
  if (section.rotation) normal.applyQuaternion(section.rotation);
  negativeHalf.copy(section.halfSize).negate();
  localPoint.clamp(negativeHalf, section.halfSize);
  localPoint[axis] = localNormal[axis] * section.halfSize[axis];
  if (section.rotation) localPoint.applyQuaternion(section.rotation);
  return { point: localPoint.clone().add(section.center), normal, distance, section, depth };
}

export function traceWorld(origin: THREE.Vector3, direction: THREE.Vector3, range: number, padding = 0,
  accept?: (hit: WorldHit) => boolean) {
  const endX = origin.x + direction.x * range;
  const endZ = origin.z + direction.z * range;
  const candidates = findSections(Math.min(origin.x, endX) - padding, Math.min(origin.z, endZ) - padding,
    Math.max(origin.x, endX) + padding, Math.max(origin.z, endZ) + padding);
  let closest: ReturnType<typeof intersectSection>;
  for (const section of candidates) {
    if ((!section.permanent && section.hp <= 0) || (padding && section.solid === false)) continue;
    let hit = intersectSection(section, origin, direction, padding, closest?.distance ?? range);
    if (hit && section.mesh && padding === 0) {
      meshRaycaster.set(origin, direction);
      meshRaycaster.far = closest?.distance ?? range;
      const exact = meshRaycaster.intersectObject(section.mesh, false)[0];
      if (!exact?.face) hit = undefined;
      else {
        hit.point.copy(exact.point);
        hit.normal.copy(exact.face.normal).transformDirection(section.mesh.matrixWorld);
        hit.distance = exact.distance;
      }
    }
    if (hit && (!accept || accept(hit)) && (!closest || hit.distance < closest.distance)) closest = hit;
  }
  return closest;
}

export function traceGround(origin: THREE.Vector3, direction: THREE.Vector3, range: number) {
  let previousDistance = 0;
  let previous = Math.max(0, origin.y - getTravelHeight(origin.x, origin.z, origin.y));
  const contact = origin.clone();
  for (let step = 1; step <= Math.ceil(range / 2); step++) {
    const distance = Math.min(range, step * 2);
    contact.copy(origin).addScaledVector(direction, distance);
    const height = getTravelHeight(contact.x, contact.z, contact.y);
    const clearance = contact.y - height;
    if (clearance <= 0 && height > 0.03) {
      const fraction = previous / Math.max(0.001, previous - clearance);
      const hitDistance = THREE.MathUtils.lerp(previousDistance, distance, fraction);
      return { distance: hitDistance, point: contact.copy(origin).addScaledVector(direction, hitDistance), normal: new THREE.Vector3(0, 1, 0) };
    }
    previousDistance = distance;
    previous = clearance;
  }
}

export function damageWorld(hit: WorldHit, energy: number) {
  const { section } = hit;
  let destroyed = false;
  if (section && !section.permanent && section.hp > 0) {
    const before = section.hp;
    section.hp = Math.max(0, section.hp - energy);
    const building = sections.get(section.owner);
    if (building) building.current -= before - section.hp;
    destroyed = section.hp === 0;
    if (destroyed && building) building.breaches++;
    section.onDamage?.(section.hp / section.maxHp, destroyed);
  }
  worldImpacts.push({ ...hit, energy, material: section?.material ?? 'road', destroyed });
  if (worldImpacts.length > 64) worldImpacts.shift();
  return section ? { destroyed, ...getWorldIntegrity(section.owner) } : undefined;
}

export function getWorldIntegrity(owner: string) {
  const building = sections.get(owner);
  const integrity = building ? building.current / building.total : 1;
  const breaches = building?.breaches ?? 0;
  const stage = !building || integrity === 1 ? 'intact' :
    integrity < 0.48 || breaches > building.count * 0.35 ? 'critical' : breaches > 0 ? 'breached' : 'damaged';
  return { integrity, stage };
}
