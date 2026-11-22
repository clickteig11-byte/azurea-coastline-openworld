import * as THREE from 'three';
import { OBB } from 'three/addons/math/OBB.js';
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
  meshSweep?: boolean;
  onDamage?: (integrity: number, destroyed: boolean, hit: WorldHit, energy: number) => void;
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

export function worldBoxOccupied(center: THREE.Vector3, half: THREE.Vector3, rotation: THREE.Quaternion) {
  const extent = half.length();
  const matrix = new THREE.Matrix4();
  const basis = new THREE.Matrix3();
  const candidate = new OBB(center, half.clone().addScalar(-0.046),
    new THREE.Matrix3().setFromMatrix4(matrix.makeRotationFromQuaternion(rotation)));
  const other = new OBB();
  for (const section of findSections(center.x - extent, center.z - extent, center.x + extent, center.z + extent)) {
    if (section.solid === false || section.hp <= 0 && !section.permanent) continue;
    if (section.rotation) basis.setFromMatrix4(matrix.makeRotationFromQuaternion(section.rotation));
    else basis.identity();
    other.set(section.center, section.halfSize, basis);
    if (candidate.intersectsOBB(other)) return true;
  }
  return false;
}

const localOrigin = new THREE.Vector3();
const localDirection = new THREE.Vector3();
const localPoint = new THREE.Vector3();
const localNormal = new THREE.Vector3();
const negativeHalf = new THREE.Vector3();
const meshRaycaster = new THREE.Raycaster();
const meshNormalMatrix = new THREE.Matrix3();
const meshSide = new THREE.Vector3();
const meshUp = new THREE.Vector3();
const meshOrigin = new THREE.Vector3();
const meshWorldY = new THREE.Vector3(0, 1, 0);
const meshWorldX = new THREE.Vector3(1, 0, 0);
const probeOffsets = [[0, 0], [0.8, 0], [-0.8, 0], [0, 0.8], [0, -0.8], [0.56, 0.56], [0.56, -0.56], [-0.56, 0.56], [-0.56, -0.56]];
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
    if (hit && section.mesh && (padding === 0 || section.meshSweep)) {
      const mesh = section.mesh;
      let exact: THREE.Intersection<THREE.Object3D> | undefined;
      const limit = (closest?.distance ?? range) + Math.max(0, padding);
      const sweepOffsets = padding === 0 ? probeOffsets.slice(0, 1) : probeOffsets;
      meshSide.crossVectors(direction, Math.abs(direction.y) > 0.91 ? meshWorldX : meshWorldY).normalize();
      meshUp.crossVectors(meshSide, direction).normalize();
      for (const [x, y] of sweepOffsets) {
        meshOrigin.copy(origin).addScaledVector(meshSide, x * padding).addScaledVector(meshUp, y * padding);
        meshRaycaster.set(meshOrigin, direction);
        meshRaycaster.far = exact?.distance ?? limit;
        const candidate = meshRaycaster.intersectObject(mesh, false)[0];
        if (candidate?.face && (!exact || candidate.distance < exact.distance)) exact = candidate;
      }
      if (!exact?.face) hit = undefined;
      else {
        hit.point.copy(exact.point);
        hit.normal.copy(exact.face.normal).applyNormalMatrix(meshNormalMatrix.getNormalMatrix(mesh.matrixWorld));
        if (hit.normal.dot(direction) > 0) hit.normal.negate();
        hit.distance = Math.max(0, exact.distance - padding * 0.38);
        hit.depth = 0;
        if (hit.distance > (closest?.distance ?? range)) hit = undefined;
      }
    }
    if (hit && (!accept || accept(hit)) && (!closest || hit.distance < closest.distance)) closest = hit;
  }
  return closest;
}

export function traceGround(origin: THREE.Vector3, direction: THREE.Vector3, range: number): WorldHit | undefined {
  if (direction.y >= 0 && origin.y > 14) return undefined;
  let last = 0;
  const contact = origin.clone();
  const heightAt = (distance: number, tolerance = 0) => {
    contact.copy(origin).addScaledVector(direction, distance);
    return getTravelHeight(contact.x, contact.z, contact.y + tolerance);
  };
  for (let i = 1; i <= Math.ceil(range / 1.7); i++) {
    const distance = Math.min(range, i * 1.7);
    const height = heightAt(distance, 1.4);
    if (contact.y <= height) {
      let lower = last;
      let upper = distance;
      for (let pass = 0; pass < 6; pass++) {
        const sample = (lower + upper) / 2;
        const surface = heightAt(sample, 0.8);
        if (contact.y > surface) lower = sample;
        else upper = sample;
      }
      contact.copy(origin).addScaledVector(direction, upper);
      const { x, y, z } = contact;
      const feet = y + 0.4;
      const normal = new THREE.Vector3(
        getTravelHeight(x - 0.34, z, feet) - getTravelHeight(x + 0.34, z, feet),
        0.68,
        getTravelHeight(x, z - 0.34, feet) - getTravelHeight(x, z + 0.34, feet),
      ).normalize();
      return { distance: upper, point: contact, normal };
    }
    last = distance;
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
    section.onDamage?.(section.hp / section.maxHp, destroyed, hit, energy);
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

export function blastWorld(point: THREE.Vector3, radius: number, energy: number, excluded?: WorldSection) {
  const candidates = findSections(point.x - radius, point.z - radius, point.x + radius, point.z + radius);
  const position = new THREE.Vector3();
  const nearby: { section: WorldSection; point: THREE.Vector3; distance: number }[] = [];
  for (const section of candidates) {
    if (section === excluded || section.permanent || section.hp <= 0) continue;
    position.copy(point).sub(section.center);
    const rotation = inverse.get(section);
    if (rotation) position.applyQuaternion(rotation);
    position.clamp(section.halfSize.clone().negate(), section.halfSize);
    if (section.rotation) position.applyQuaternion(section.rotation);
    position.add(section.center);
    const distance = position.distanceTo(point);
    if (distance < radius) nearby.push({ section, point: position.clone(), distance });
  }
  nearby.sort((a, b) => a.distance - b.distance);
  for (const impact of nearby.slice(0, 22)) {
    const normal = impact.point.clone().sub(point);
    if (normal.lengthSq() < 0.01) normal.copy(impact.section.center).sub(point);
    if (normal.lengthSq() < 0.01) normal.set(0, 1, 0);
    damageWorld({ ...impact, normal: normal.normalize() }, energy * (1 - impact.distance / radius) ** 2);
  }
  emitEnvironment('gravel', point, 1.85);
}

export type EnvironmentEffect = 'water' | 'dust' | 'gravel' | 'repair' | 'impact' | 'blood' | 'tire';
export const environmentEffects: {
  kind: EnvironmentEffect;
  point: THREE.Vector3;
  energy: number;
  motionX: number;
  motionZ: number;
}[] = [];

export function emitEnvironment(
  kind: EnvironmentEffect, point: THREE.Vector3, energy: number, motionX = 0, motionZ = 0,
) {
  if (environmentEffects.length < 64) environmentEffects.push({ kind, point: point.clone(), energy, motionX, motionZ });
}
