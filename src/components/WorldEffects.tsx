import React, { useEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import { useFrame } from '@react-three/fiber';
import { simState } from '../game/store';
import { environmentEffects, worldImpacts, type WorldSection } from '../game/worldDamage';
import { getTravelHeight } from '../game/worldMath';

const poolSize = 900;
const scarCount = 68;
const up = new THREE.Vector3(0, 0, 1);
const smokeColors = { glass: '#657f8b', metal: '#5e5955', masonry: '#817463', wood: '#7f684e', road: '#524b43' };
const fragments = { glass: '#a6dfec', metal: '#c3b7aa', masonry: '#b4a592', wood: '#997448', road: '#746d63' };

function scarTexture(glass: boolean) {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 128;
  const ctx = canvas.getContext('2d')!;
  const fade = ctx.createRadialGradient(64, 64, 1, 64, 64, 59);
  fade.addColorStop(0, glass ? 'rgba(15,30,42,.93)' : 'rgba(8,7,6,.94)');
  fade.addColorStop(0.24, glass ? 'rgba(122,177,191,.54)' : 'rgba(29,22,17,.8)');
  fade.addColorStop(1, 'rgba(30,22,17,0)');
  ctx.fillStyle = fade;
  ctx.fillRect(0, 0, 128, 128);
  for (let i = 0; i < 15; i++) {
    const theta = i * 2.39996;
    const reach = 21 + (i * 17 % 34);
    const x = Math.cos(theta);
    const y = Math.sin(theta);
    ctx.strokeStyle = glass ? 'rgba(231,248,246,.82)' : i % 2 === 0 ? 'rgba(13,10,7,.78)' : 'rgba(170,131,94,.67)';
    ctx.lineWidth = 0.7 + (i % 4) * 0.6;
    ctx.beginPath();
    ctx.moveTo(64 + x * 7, 64 + y * 7);
    ctx.lineTo(64 + x * reach * 0.54 - y * 6, 64 + y * reach * 0.54 + x * 6);
    ctx.lineTo(64 + x * reach, 64 + y * reach);
    ctx.stroke();
  }
  const map = new THREE.CanvasTexture(canvas);
  map.colorSpace = THREE.SRGBColorSpace;
  return map;
}

const vertexShader = `
  attribute vec3 tint;
  attribute float opacity;
  attribute float radius;
  attribute float kind;
  varying vec3 vTint;
  varying float vOpacity;
  varying float vKind;
  void main() {
    vec4 eye = modelViewMatrix * vec4(position, 1.0);
    gl_Position = projectionMatrix * eye;
    gl_PointSize = opacity < 0.001 || eye.z > 0.0 ? 0.0 : clamp(radius * 580.0 / -eye.z, 1.0, 157.0);
    vTint = tint;
    vOpacity = opacity;
    vKind = kind;
  }
`;
const fragmentShader = `
  varying vec3 vTint;
  varying float vOpacity;
  varying float vKind;
  void main() {
    vec2 p = gl_PointCoord * 2.0 - 1.0;
    float d = length(p);
    float a;
    if (vKind < 0.5) {
      float edge = 0.7 + 0.17 * cos(7.0 * atan(p.y, p.x)) + 0.11 * sin(12.0 * p.x * p.y + p.y * 6.0);
      a = (1.0 - smoothstep(0.12, edge, d)) * 0.73;
    } else if (vKind < 1.5) {
      a = 1.0 - smoothstep(0.12, 1.0, length(p * vec2(0.6, 1.8)));
    } else if (vKind > 2.5) {
      a = 1.0 - smoothstep(0.39, 1.0, length(p * vec2(1.0, 0.65)));
    } else {
      a = 1.0 - smoothstep(0.33, 0.8, abs(p.x + p.y * 0.31) + abs(p.y - p.x * 0.24));
    }
    gl_FragColor = vec4(vTint, a * vOpacity);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }
`;

export function WorldEffects() {
  const decals = useRef<(THREE.Mesh<THREE.PlaneGeometry, THREE.MeshBasicMaterial> | null)[]>([]);
  const nextScar = useRef(0);
  const scarSections = useRef<(WorldSection | undefined)[]>([]);
  const emission = useRef(0);
  const plumes = useRef<{ point: THREE.Vector3; life: number; nextPuff: number }[]>([]);
  const previousDamage = useRef(100);
  const previousAircraft = useRef(-1);
  const [stone, glass] = useMemo(() => [scarTexture(false), scarTexture(true)], []);
  const pool = useMemo(() => {
    const positions = new Float32Array(poolSize * 3);
    const tint = new Float32Array(poolSize * 3);
    const radius = new Float32Array(poolSize);
    const opacity = new Float32Array(poolSize);
    const kind = new Float32Array(poolSize);
    const geometry = new THREE.BufferGeometry();
    for (const [name, array] of Object.entries({ position: positions, tint, radius, opacity, kind })) {
      geometry.setAttribute(name, new THREE.BufferAttribute(array, array === positions || array === tint ? 3 : 1)
        .setUsage(THREE.DynamicDrawUsage));
    }
    return {
      geometry, positions, tint, radius, opacity, kind, index: 0,
      values: Array.from({ length: poolSize }, () => ({ position: new THREE.Vector3(), velocity: new THREE.Vector3(), age: 0, life: 0, size: 0, fade: 0, flight: false })),
    };
  }, []);
  useEffect(() => () => {
    pool.geometry.dispose();
    stone.dispose();
    glass.dispose();
  }, [pool, stone, glass]);

  const color = useMemo(() => new THREE.Color(), []);
  function spawn(point: THREE.Vector3, velocity: THREE.Vector3, type: number, tint: string, life: number, size: number, fade: number, flight = false) {
    const i = pool.index++ % poolSize;
    const p = pool.values[i];
    p.position.copy(point);
    p.velocity.copy(velocity);
    p.age = 0;
    p.life = life;
    p.size = size;
    p.fade = fade;
    p.flight = flight;
    pool.kind[i] = type;
    color.set(tint).toArray(pool.tint, i * 3);
  }

  const exhaust = useMemo(() => new THREE.Vector3(), []);
  const velocity = useMemo(() => new THREE.Vector3(), []);
  const rotation = useMemo(() => new THREE.Euler(0, 0, 0, 'YXZ'), []);
  const terrainCollision = useMemo(() => new THREE.Vector3(), []);

  useFrame((_, elapsed) => {
    const dt = Math.min(0.05, elapsed);
    for (const impact of worldImpacts.splice(0)) {
      const index = nextScar.current++ % scarCount;
      const scar = decals.current[index];
      if (impact.destroyed) {
        scarSections.current.forEach((section, i) => {
          if (section === impact.section && decals.current[i]) decals.current[i]!.visible = false;
        });
      } else if (scar) {
        scarSections.current[index] = impact.section;
        const radius = THREE.MathUtils.clamp(0.24 + impact.energy / 82, 0.36, 2.9);
        scar.position.copy(impact.point).addScaledVector(impact.normal, 0.035);
        scar.quaternion.setFromUnitVectors(up, impact.normal);
        scar.rotateZ(nextScar.current * 2.39996);
        scar.scale.set(radius, radius * (impact.material === 'road' ? 1.45 : 0.95), 1);
        scar.material.map = impact.material === 'glass' ? glass : stone;
        scar.visible = true;
      }
      if (impact.destroyed && impact.material !== 'glass' && impact.energy > 56 && plumes.current.length < 11) {
        plumes.current.push({ point: impact.point.clone().addScaledVector(impact.normal, 0.32), life: 8.5, nextPuff: 0.24 });
      }
      const magnitude = Math.min(1.75, impact.energy / 75);
      for (let i = 0; i < 5 + magnitude * 8 + (impact.destroyed ? 10 : 0); i++) {
        const spark = i % 3 === 0 || impact.material === 'metal';
        velocity.set(Math.random() - 0.5, Math.random() * 0.7, Math.random() - 0.5)
          .multiplyScalar(6 + 5 * magnitude).addScaledVector(impact.normal, 1.6 + Math.random() * 4);
        spawn(impact.point, velocity, spark ? 1 : 2, spark ? '#ffd184' : fragments[impact.material],
          spark ? 0.21 + Math.random() * 0.4 : 0.65 + Math.random() * 1.4, spark ? 0.13 : 0.14 + Math.random() * 0.24, 1);
      }
      for (let i = 0; i < 3 + magnitude * 5; i++) {
        velocity.set(Math.random() - .5, 0.45 + Math.random() * 1.4, Math.random() - .5).addScaledVector(impact.normal, 0.55);
        spawn(impact.point, velocity, 0, smokeColors[impact.material],
          (impact.destroyed ? 2.1 : 0.8) + Math.random() * 2.2, 0.3 + magnitude * 0.8, 0.83);
      }
    }

    for (let i = plumes.current.length - 1; i >= 0; i--) {
      const plume = plumes.current[i];
      plume.life -= dt;
      plume.nextPuff -= dt;
      if (plume.life <= 0) plumes.current.splice(i, 1);
      else if (plume.nextPuff < 0) {
        plume.nextPuff = 0.21 + Math.random() * 0.21;
        velocity.set(Math.random() - 0.42, 1.4 + Math.random() * 0.95, Math.random() - 0.45);
        spawn(plume.point, velocity, 0, '#595653', 2.8 + Math.random() * 0.9, 0.72, Math.min(0.86, plume.life));
      }
    }

    for (const { kind, point, energy, motionX, motionZ } of environmentEffects.splice(0)) {
      const count = Math.round(3 + 12 * energy);
      const dust = kind === 'dust' || kind === 'gravel';
      const water = kind === 'water';
      for (let i = 0; i < Math.min(28, count); i++) {
        const angle = i * 2.39996;
        const speed = 0.7 + Math.random() * (2 + 2.5 * energy);
        velocity.set(Math.cos(angle) * speed + motionX * 0.2,
          0.32 + Math.random() * (water ? 3.4 : 1.5) * energy,
          Math.sin(angle) * speed + motionZ * 0.2);
        const particle = water ? (i % 3 === 0 ? 0 : 3) : dust ? (i % 4 === 0 && kind === 'gravel' ? 2 : 0) : 1;
        const tint = water ? '#c4e5e1' : dust ? '#af9a80' : kind === 'repair' ? '#99f4dc' : '#ffcf8d';
        spawn(point, velocity, particle, tint, 0.22 + Math.random() * (dust ? 0.89 : 0.52),
          0.065 + Math.random() * (particle === 0 ? 0.33 : 0.19), water && particle === 0 ? 0.57 : 0.85);
      }
    }

    const aircraft = simState.aircraftDamage;
    if ((aircraft.hull === 100 && previousDamage.current < 100) || previousAircraft.current !== simState.activePlaneIdx) {
      for (const p of pool.values) if (p.flight) p.life = 0;
    }
    previousDamage.current = aircraft.hull;
    previousAircraft.current = simState.activePlaneIdx;
    emission.current -= dt;
    if (aircraft.hull < 76 && emission.current <= 0) {
      const heli = simState.activePlaneIdx === 1;
      emission.current = aircraft.hull < 45 ? 0.043 : 0.095;
      rotation.set(-simState.planePitch, simState.planeYaw, -simState.planeRoll);
      const side = aircraft.left < aircraft.right ? -1 : 1;
      const sources = aircraft.left < 60 && aircraft.right < 60 && !heli ? [-1, 1] : [side];
      for (const source of sources) {
        exhaust.set(heli ? source * 0.75 : source * 3.5, heli ? 1.26 : 0.32, heli ? -1.65 : -2.1)
          .applyEuler(rotation).add(simState.planePos);
        velocity.set(Math.random() - 0.5, 1.3 + Math.random(), Math.random() - 0.5);
        const critical = aircraft.state === 'burning' || aircraft.state === 'wrecked';
        spawn(exhaust, velocity, 0, critical ? '#292b2c' : '#777979', critical ? 3.2 : 2.1, critical ? 1.85 : 1.25, 0.93, true);
        if (critical) {
          velocity.y += 0.8;
          spawn(exhaust, velocity, 0, Math.random() > 0.45 ? '#ffb24a' : '#e5511a', 0.36, 1.18, 1, true);
          velocity.x += 2 * (Math.random() - 0.5);
          spawn(exhaust, velocity, 1, '#ffe6a8', 0.25, 0.21, 1, true);
        }
      }
    }

    let dirty = false;
    for (let i = 0; i < poolSize; i++) {
      const p = pool.values[i];
      p.age += dt;
      if (p.age >= p.life) {
        if (pool.opacity[i] !== 0) {
          pool.opacity[i] = 0;
          dirty = true;
        }
        continue;
      }
      dirty = true;
      const fraction = p.age / p.life;
      const type = pool.kind[i];
      if (type > 0) p.velocity.y -= (type === 1 ? 12 : 17) * dt;
      const moving = p.velocity.lengthSq() > 0.001;
      p.position.addScaledVector(p.velocity, dt);
      if (type === 2 && moving) {
        terrainCollision.copy(p.position);
        const surface = getTravelHeight(terrainCollision.x, terrainCollision.z, terrainCollision.y);
        if (p.position.y < surface + 0.045) {
          p.position.y = surface + 0.045;
          if (Math.abs(p.velocity.y) < 2) p.velocity.set(0, 0, 0);
          else p.velocity.multiplyScalar(0.42).y *= -1;
        }
      }
      p.position.toArray(pool.positions, 3 * i);
      pool.radius[i] = p.size * (type === 0 ? 0.55 + fraction * 2.2 : 1);
      pool.opacity[i] = p.fade * (type === 0 ? Math.min(1, fraction * 9 + 0.28) * (1 - fraction) : Math.min(1, 2 * (1 - fraction)));
    }
    if (dirty) for (const attribute of Object.values(pool.geometry.attributes)) attribute.needsUpdate = true;
  });

  return (
    <group>
      {Array.from({ length: scarCount }, (_, i) => (
        <mesh key={i} visible={false} ref={(mesh) => { decals.current[i] = mesh as (typeof decals.current)[number]; }} renderOrder={2}>
          <planeGeometry args={[1, 1]} />
          <meshBasicMaterial map={stone} transparent depthWrite={false} polygonOffset polygonOffsetFactor={-2} />
        </mesh>
      ))}
      <points geometry={pool.geometry} frustumCulled={false} renderOrder={3}>
        <shaderMaterial transparent depthWrite={false} vertexShader={vertexShader} fragmentShader={fragmentShader} />
      </points>
    </group>
  );
}
