import React, { useEffect, useMemo, useRef, useState } from 'react';
import * as THREE from 'three';
import { useFrame } from '@react-three/fiber';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import {
  skyVertexShader,
  skyFragmentShader,
  waterVertexShader,
  waterFragmentShader,
  terrainVertexShader,
  terrainFragmentShader,
} from './Shaders';
import {
  createLimestonePBR,
  createNormalMapFromCanvas,
  createBarkPBR,
  createAsphaltRoadTexture,
  createAsphaltRoughnessTexture,
  createSidewalkCobblePBR,
  createCrosswalkIntersectionPBR,
  createModernConcreteSteelPBR,
} from './Textures';
import { VegasLandmarks } from './Landmarks';
import { coastRoadRadius, coastRoadOffset, getTerrainHeight, LANDMARKS, NORTH_BAY_BRIDGE } from '../game/worldMath';
import { cityPlots } from './City';
import { DamageableProp } from './WorldSections';
import { registerWorldSection } from '../game/worldDamage';
import { simState } from '../game/store';
import { LOBBY_THEMES, resolveActiveThemeId, type LobbyThemeConfig } from '../game/lobbyThemes';

export { VegasLandmarks };

export interface AtmosphereTarget {
  theme: LobbyThemeConfig;
  zenith: THREE.Color;
  horizon: THREE.Color;
  fogColor: THREE.Color;
  sunColor: THREE.Color;
  dirColor: THREE.Color;
  hemiSky: THREE.Color;
  hemiGround: THREE.Color;
  fillColor: THREE.Color;
  sunDir: THREE.Vector3;
  sunsetWarmth: number;
  moonVisibility: number;
  starIntensity: number;
  envIntensity: number;
}

const ROULETTE_COLORS = {
  redZenith: new THREE.Color('#9a3412'),
  redHorizon: new THREE.Color('#fdba74'),
  redSun: new THREE.Color('#fb923c'),
  redHemi: new THREE.Color('#fca57e'),
  blackZenith: new THREE.Color('#24698f'),
  blackHorizon: new THREE.Color('#aed1e1'),
  blackHemi: new THREE.Color('#93c5fd'),
  blackFill: new THREE.Color('#38bdf8'),
};

export function createAtmosphereTarget(): AtmosphereTarget {
  const theme = LOBBY_THEMES.SUNLIT_RIVIERA;
  return {
    theme,
    zenith: new THREE.Color(theme.skyZenith),
    horizon: new THREE.Color(theme.skyHorizon),
    fogColor: new THREE.Color(theme.fogColor),
    sunColor: new THREE.Color(theme.sunColor),
    dirColor: new THREE.Color(theme.dirColor),
    hemiSky: new THREE.Color(theme.hemiSky),
    hemiGround: new THREE.Color(theme.hemiGround),
    fillColor: new THREE.Color(theme.fillColor),
    sunDir: new THREE.Vector3(...theme.sunDir).normalize(),
    sunsetWarmth: theme.sunsetWarmth,
    moonVisibility: theme.moonVisibility,
    starIntensity: theme.starIntensity,
    envIntensity: 1.0,
  };
}

export function resolveAtmosphereTarget(out: AtmosphereTarget): AtmosphereTarget {
  const themeId = resolveActiveThemeId(simState.startMenuOpen, simState.lobbyTheme, simState.worldTimeTheme);
  const theme = LOBBY_THEMES[themeId];
  out.theme = theme;
  out.zenith.set(theme.skyZenith);
  out.horizon.set(theme.skyHorizon);
  out.fogColor.set(theme.fogColor);
  out.sunColor.set(theme.sunColor);
  out.dirColor.set(theme.dirColor);
  out.hemiSky.set(theme.hemiSky);
  out.hemiGround.set(theme.hemiGround);
  out.fillColor.set(theme.fillColor);
  out.sunDir.set(theme.sunDir[0], theme.sunDir[1], theme.sunDir[2]).normalize();
  out.sunsetWarmth = theme.sunsetWarmth;
  out.moonVisibility = theme.moonVisibility;
  out.starIntensity = theme.starIntensity;
  out.envIntensity =
    themeId === 'SUNLIT_RIVIERA' ? 1.0
    : themeId === 'SUNSET_BOARDWALK' ? 0.78
    : themeId === 'TACTICAL_OVERLOOK' ? 0.48
    : 0.34;

  if (!simState.startMenuOpen) {
    if (simState.roulette === 'RED') {
      out.zenith.lerp(ROULETTE_COLORS.redZenith, 0.78);
      out.horizon.lerp(ROULETTE_COLORS.redHorizon, 0.72);
      out.fogColor.lerp(ROULETTE_COLORS.redHorizon, 0.72);
      out.sunColor.lerp(ROULETTE_COLORS.redSun, 0.55);
      out.dirColor.lerp(ROULETTE_COLORS.redSun, 0.48);
      out.hemiSky.lerp(ROULETTE_COLORS.redHemi, 0.48);
      out.sunsetWarmth = Math.max(out.sunsetWarmth, 0.75);
      out.moonVisibility *= 0.45;
    } else if (simState.roulette === 'BLACK') {
      out.zenith.lerp(ROULETTE_COLORS.blackZenith, 0.76);
      out.horizon.lerp(ROULETTE_COLORS.blackHorizon, 0.70);
      out.fogColor.lerp(ROULETTE_COLORS.blackHorizon, 0.70);
      out.hemiSky.lerp(ROULETTE_COLORS.blackHemi, 0.45);
      out.fillColor.lerp(ROULETTE_COLORS.blackFill, 0.50);
    }
  }
  return out;
}

const tmpSrgbColor = new THREE.Color();
function srgbTripleToLinearVec3(rgb: [number, number, number], out = new THREE.Vector3()): THREE.Vector3 {
  tmpSrgbColor.setRGB(rgb[0], rgb[1], rgb[2], THREE.SRGBColorSpace);
  return out.set(tmpSrgbColor.r, tmpSrgbColor.g, tmpSrgbColor.b);
}

function getSidewalkCobblePBR(): { map: THREE.CanvasTexture; roughnessMap?: THREE.CanvasTexture } {
  return { map: createSidewalkCobblePBR() };
}

function getCrosswalkIntersectionPBR(): { map: THREE.CanvasTexture; roughnessMap?: THREE.CanvasTexture } {
  return { map: createCrosswalkIntersectionPBR() };
}

function getModernConcreteSteelPBR(): { map: THREE.CanvasTexture; roughnessMap?: THREE.CanvasTexture } {
  return createModernConcreteSteelPBR();
}




function createStreetSignTexture(label: string): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 128;
  const ctx = canvas.getContext('2d')!;

  ctx.fillStyle = '#1d4ed8';
  ctx.fillRect(0, 0, 512, 128);
  ctx.strokeStyle = '#f8fafc';
  ctx.lineWidth = 8;
  ctx.strokeRect(8, 8, 496, 112);

  ctx.fillStyle = '#ffffff';
  ctx.font = 'bold 42px Inter, Arial, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(label, 256, 66);

  const tex = new THREE.CanvasTexture(canvas);
  tex.anisotropy = 4;
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

export const REPAIR_BAY_COORDS: [number, number][] = [
  [14, 48],
  [-14, -68],
  [68, 0],
  [-68, 80],
  [-178, 166],
];

export function SkyDome() {
  const dome = useRef<THREE.Mesh>(null);
  const initialTheme = LOBBY_THEMES.SUNLIT_RIVIERA;
  const target = useMemo(createAtmosphereTarget, []);
  const uniforms = useMemo(
    () => ({
      uTime: { value: 0 },
      uZenith: { value: new THREE.Color(initialTheme.skyZenith) },
      uHorizon: { value: new THREE.Color(initialTheme.skyHorizon) },
      uSunColor: { value: new THREE.Color(initialTheme.sunColor) },
      uSunDir: { value: new THREE.Vector3(...initialTheme.sunDir).normalize() },
      uMoonVis: { value: initialTheme.moonVisibility },
      uStarIntensity: { value: initialTheme.starIntensity },
      uSunsetWarmth: { value: initialTheme.sunsetWarmth },
    }),
    []
  );

  useFrame((state, dt) => {
    uniforms.uTime.value = state.clock.elapsedTime;
    resolveAtmosphereTarget(target);
    const damp = 1 - Math.exp(-6.0 * Math.min(dt, 0.1));
    dome.current?.position.copy(state.camera.position);
    uniforms.uZenith.value.lerp(target.zenith, damp);
    uniforms.uHorizon.value.lerp(target.horizon, damp);
    uniforms.uSunColor.value.lerp(target.sunColor, damp);
    uniforms.uSunDir.value.lerp(target.sunDir, damp).normalize();
    uniforms.uMoonVis.value = THREE.MathUtils.lerp(uniforms.uMoonVis.value, target.moonVisibility, damp);
    uniforms.uStarIntensity.value = THREE.MathUtils.lerp(uniforms.uStarIntensity.value, target.starIntensity, damp);
    uniforms.uSunsetWarmth.value = THREE.MathUtils.lerp(uniforms.uSunsetWarmth.value, target.sunsetWarmth, damp);
  });

  return (
    <mesh ref={dome} frustumCulled={false} renderOrder={-10}>
      <sphereGeometry args={[2200, 32, 20]} />
      <shaderMaterial
        vertexShader={skyVertexShader}
        fragmentShader={skyFragmentShader}
        uniforms={uniforms}
        side={THREE.BackSide}
        depthWrite={false}
      />
    </mesh>
  );
}

export function StylizedOcean() {
  const meshRef = useRef<THREE.Mesh>(null);
  const initialTheme = LOBBY_THEMES.SUNLIT_RIVIERA;
  const target = useMemo(createAtmosphereTarget, []);
  const tmpShallow = useMemo(() => new THREE.Vector3(), []);
  const tmpDeep = useMemo(() => new THREE.Vector3(), []);
  const tmpFoam = useMemo(() => new THREE.Vector3(), []);
  const uniforms = useMemo(
    () => ({
      uTime: { value: 0 },
      uShallow: { value: srgbTripleToLinearVec3(initialTheme.oceanShallow) },
      uDeep: { value: srgbTripleToLinearVec3(initialTheme.oceanDeep) },
      uFoam: { value: srgbTripleToLinearVec3(initialTheme.oceanFoam) },
      uSunDir: { value: new THREE.Vector3(...initialTheme.sunDir).normalize() },
      uSunColor: { value: new THREE.Color(initialTheme.sunColor) },
      uHorizonCol: { value: new THREE.Color(initialTheme.skyHorizon) },
      uSkyZenith: { value: new THREE.Color(initialTheme.skyZenith) },
      uMoonVis: { value: initialTheme.moonVisibility },
      uSunsetWarmth: { value: initialTheme.sunsetWarmth },
      uCameraPos: { value: new THREE.Vector3() },
      uBoatWake: { value: new THREE.Vector4(0, 0, 0, 0) },
    }),
    []
  );

  const geometry = useMemo(() => {
    const mesh = new THREE.PlaneGeometry(2, 2, 156, 156);
    mesh.rotateX(-Math.PI / 2);
    const vertices = mesh.attributes.position;
    // Concentrate vertices around the playable coastline and stretch the outer ocean to the horizon.
    const spread = (v: number) => Math.sign(v) * (Math.abs(v) * 610 + Math.abs(v) ** 15 * 4490);
    for (let i = 0; i < vertices.count; i++) vertices.setXYZ(i, spread(vertices.getX(i)), 0, spread(vertices.getZ(i)) - 140);
    mesh.computeBoundingSphere();
    return mesh;
  }, []);

  useFrame((state, dt) => {
    uniforms.uTime.value = state.clock.elapsedTime;
    uniforms.uCameraPos.value.copy(state.camera.position);
    resolveAtmosphereTarget(target);
    const damp = 1 - Math.exp(-6.0 * Math.min(dt, 0.1));
    srgbTripleToLinearVec3(target.theme.oceanShallow, tmpShallow);
    srgbTripleToLinearVec3(target.theme.oceanDeep, tmpDeep);
    srgbTripleToLinearVec3(target.theme.oceanFoam, tmpFoam);
    uniforms.uShallow.value.lerp(tmpShallow, damp);
    uniforms.uDeep.value.lerp(tmpDeep, damp);
    uniforms.uFoam.value.lerp(tmpFoam, damp);
    uniforms.uSunDir.value.lerp(target.sunDir, damp).normalize();
    uniforms.uSunColor.value.lerp(target.sunColor, damp);
    uniforms.uHorizonCol.value.lerp(target.horizon, damp);
    uniforms.uSkyZenith.value.lerp(target.zenith, damp);
    uniforms.uMoonVis.value = THREE.MathUtils.lerp(uniforms.uMoonVis.value, target.moonVisibility, damp);
    uniforms.uSunsetWarmth.value = THREE.MathUtils.lerp(uniforms.uSunsetWarmth.value, target.sunsetWarmth, damp);
    const wakeSpd = !simState.startMenuOpen && simState.mode === 'BOAT' ? simState.boatSpeed : 0;
    uniforms.uBoatWake.value.set(simState.boatPos.x, simState.boatPos.z, simState.boatYaw, wakeSpd);
    if (meshRef.current) {
      meshRef.current.position.y = simState.tideOffset;
    }
  });

  return (
    <mesh ref={meshRef} geometry={geometry}>
      <shaderMaterial
        vertexShader={waterVertexShader}
        fragmentShader={waterFragmentShader}
        uniforms={uniforms}
        transparent
        depthWrite={false}
      />
    </mesh>
  );
}

export function IslandTerrain() {
  const initialTheme = LOBBY_THEMES.SUNLIT_RIVIERA;
  const target = useMemo(createAtmosphereTarget, []);
  const tmpSunLight = useMemo(() => new THREE.Color(), []);
  const tmpAmbient = useMemo(() => new THREE.Color(), []);
  const uniforms = useMemo(
    () => THREE.UniformsUtils.merge([THREE.UniformsLib.lights, {
      uSunDir: { value: new THREE.Vector3(...initialTheme.sunDir).normalize() },
      uHorizonCol: { value: new THREE.Color(initialTheme.skyHorizon) },
      uSunLightCol: { value: new THREE.Color(initialTheme.dirColor).multiplyScalar(initialTheme.dirIntensity * 0.46) },
      uAmbientCol: { value: new THREE.Color(initialTheme.hemiSky).multiplyScalar(initialTheme.hemiIntensity * 0.54) },
      uSunColor: { value: new THREE.Color(initialTheme.sunColor) },
      uSunsetWarmth: { value: initialTheme.sunsetWarmth },
      uMoonVis: { value: initialTheme.moonVisibility },
      uCameraPos: { value: new THREE.Vector3() },
      uActorPos: { value: new THREE.Vector3() },
      uTime: { value: 0 },
    }]),
    []
  );

  const geometry = useMemo(() => {
    const geo = new THREE.PlaneGeometry(780, 1020, 168, 216);
    geo.rotateX(-Math.PI / 2);
    geo.translate(0, 0, -153);
    const pos = geo.attributes.position;

    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i);
      const z = pos.getZ(i);
      pos.setY(i, getTerrainHeight(x, z));
    }

    geo.computeVertexNormals();
    return geo;
  }, []);

  useFrame((state, dt) => {
    uniforms.uTime.value = state.clock.elapsedTime;
    uniforms.uCameraPos.value.copy(state.camera.position);
    const activeActor =
      simState.mode === 'CAR'
        ? simState.carPos
        : simState.mode === 'BOAT'
        ? simState.boatPos
        : simState.mode === 'PLANE'
        ? simState.planePos
        : simState.playerPos;
    uniforms.uActorPos.value.copy(activeActor);
    resolveAtmosphereTarget(target);
    const damp = 1 - Math.exp(-6.0 * Math.min(dt, 0.1));
    tmpSunLight.copy(target.dirColor).multiplyScalar(target.theme.dirIntensity * 0.46);
    tmpAmbient.copy(target.hemiSky).multiplyScalar(target.theme.hemiIntensity * 0.54);
    uniforms.uSunDir.value.lerp(target.sunDir, damp).normalize();
    uniforms.uHorizonCol.value.lerp(target.horizon, damp);
    uniforms.uSunLightCol.value.lerp(tmpSunLight, damp);
    uniforms.uAmbientCol.value.lerp(tmpAmbient, damp);
    uniforms.uSunColor.value.lerp(target.sunColor, damp);
    uniforms.uSunsetWarmth.value = THREE.MathUtils.lerp(uniforms.uSunsetWarmth.value, target.sunsetWarmth, damp);
    uniforms.uMoonVis.value = THREE.MathUtils.lerp(uniforms.uMoonVis.value, target.moonVisibility, damp);
  });

  return (
    <>
      <mesh geometry={geometry} receiveShadow>
        <shaderMaterial
          vertexShader={terrainVertexShader}
          fragmentShader={terrainFragmentShader}
          uniforms={uniforms}
          lights
        />
      </mesh>
      <InstancedGrassMeadows parentUniforms={uniforms} />
    </>
  );
}

const grassVertexShader = /* glsl */ `
  uniform float uTime;
  uniform vec3 uCameraPos;
  uniform vec3 uActorPos;
  varying float vBladeH;
  varying float vWind;
  varying float vFlatten;
  varying vec3 vWorldPos;

  void main() {
    vBladeH = uv.y;
    vec4 worldBase = instanceMatrix * vec4(0.0, 0.0, 0.0, 1.0);
    float dist = distance(worldBase.xyz, uCameraPos);
    float lodScale = 1.0 - smoothstep(115.0, 175.0, dist);

    vec3 localPos = position;
    localPos.y *= lodScale;

    float gustPhase = dot(worldBase.xz, vec2(0.18, 0.13)) - uTime * 2.55;
    float gust = sin(gustPhase) + 0.45 * cos(gustPhase * 2.1 + worldBase.x * 0.4);
    vWind = gust * 0.5 + 0.5;
    float bend = pow(vBladeH, 1.65) * 0.24 * lodScale;
    localPos.x += gust * bend;
    localPos.z += cos(gustPhase * 1.3) * bend * 0.7;

    vec4 wp = instanceMatrix * vec4(localPos, 1.0);

    // Physical grass wake displacement around player & vehicle chassis
    vec2 toBlade = wp.xz - uActorPos.xz;
    float actorDist = length(toBlade);
    float wakeRadius = 2.85;
    float push = (1.0 - smoothstep(0.25, wakeRadius, actorDist)) * pow(vBladeH, 1.35) * lodScale;
    vFlatten = push;
    if (push > 0.001) {
      vec2 pushDir = toBlade / max(actorDist, 0.001);
      wp.xz += pushDir * push * 0.54;
      wp.y -= push * 0.26;
    }

    vWorldPos = wp.xyz;
    gl_Position = projectionMatrix * viewMatrix * wp;
  }
`;

const grassFragmentShader = /* glsl */ `
  uniform vec3 uSunLightCol;
  uniform vec3 uAmbientCol;
  uniform vec3 uHorizonCol;
  uniform vec3 uCameraPos;
  varying float vBladeH;
  varying float vWind;
  varying float vFlatten;
  varying vec3 vWorldPos;

  void main() {
    vec3 rootCol = vec3(0.04, 0.11, 0.035);
    vec3 midCol = vec3(0.11, 0.29, 0.075);
    vec3 tipCol = mix(vec3(0.24, 0.48, 0.11), vec3(0.45, 0.65, 0.18), clamp(vWind + vFlatten * 0.35, 0.0, 1.0));
    vec3 albedo = mix(rootCol, midCol, smoothstep(0.0, 0.52, vBladeH));
    albedo = mix(albedo, tipCol, smoothstep(0.42, 1.0, vBladeH));

    // Ambient occlusion near soil root + chlorophyll translucency at blade tips
    float ao = mix(0.42, 1.15, vBladeH);
    vec3 light = uAmbientCol * 0.85 + uSunLightCol * (0.62 + 0.55 * vBladeH);
    vec3 col = albedo * light * ao;

    float camDist = distance(vWorldPos, uCameraPos);
    float haze = smoothstep(110.0, 175.0, camDist);
    col = mix(col, uHorizonCol, haze * 0.55);

    gl_FragColor = vec4(col, 1.0);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }
`;

function InstancedGrassMeadows({ parentUniforms }: { parentUniforms: Record<string, THREE.IUniform> }) {
  const meshRef = useRef<THREE.InstancedMesh>(null);

  const { bladeGeo, matrices } = useMemo(() => {
    // 5 intersecting tapered curved blades per tuft (25 vertices total)
    const positions: number[] = [];
    const uvs: number[] = [];
    const indices: number[] = [];
    const bladeCount = 5;
    for (let b = 0; b < bladeCount; b++) {
      const angle = (b * Math.PI) / bladeCount + (b % 2 === 0 ? 0.16 : -0.14);
      const cos = Math.cos(angle);
      const sin = Math.sin(angle);
      const wBase = 0.085;
      const wMid = 0.055;
      const hMid = 0.24;
      const hTop = 0.48 + (b % 2) * 0.08;
      const lean = (b - 2) * 0.075;
      const baseIdx = b * 5;

      // 0: bottom-left, 1: bottom-right, 2: mid-left, 3: mid-right, 4: tip
      positions.push(
        -wBase * cos, 0, -wBase * sin,
        wBase * cos, 0, wBase * sin,
        -wMid * cos + lean * 0.4, hMid, -wMid * sin + lean * 0.4,
        wMid * cos + lean * 0.4, hMid, wMid * sin + lean * 0.4,
        lean, hTop, lean
      );
      uvs.push(
        0, 0,
        1, 0,
        0, 0.5,
        1, 0.5,
        0.5, 1.0
      );
      indices.push(
        baseIdx + 0, baseIdx + 1, baseIdx + 2,
        baseIdx + 1, baseIdx + 3, baseIdx + 2,
        baseIdx + 2, baseIdx + 3, baseIdx + 4
      );
    }

    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
    geo.setIndex(indices);
    geo.computeVertexNormals();

    // Deterministic placement of 1,450 lush grass tufts across coastal meadows & park lawns
    const dummy = new THREE.Object3D();
    const mats: THREE.Matrix4[] = [];
    let seed = 1337;
    const rand = () => {
      seed = (seed * 16807) % 2147483647;
      return (seed - 1) / 2147483646;
    };

    for (let i = 0; i < 4200 && mats.length < 1450; i++) {
      const r = 32 + rand() * 195;
      const theta = rand() * Math.PI * 2;
      const x = Math.cos(theta) * r;
      const z = Math.sin(theta) * r;

      // Keep clear of roads, sidewalks, parking bays, transit stops, runway, and canal
      if (Math.abs(x) < 34.5) continue;
      if (Math.abs(z) < 22.5 || Math.abs(z + 120) < 22.5 || Math.abs(z - 80) < 22.5) continue;
      if (x > -215 && x < -40 && z > 125 && z < 185) continue;
      if (x > 66 && Math.abs(z + 95) < 28) continue;
      if (Math.abs(coastRoadOffset(x, z)) < 14.5) continue;

      // Avoid city building plots + generous sidewalk apron
      let insidePlot = false;
      for (let pIdx = 0; pIdx < cityPlots.length; pIdx++) {
        const plot = cityPlots[pIdx];
        if (Math.abs(x - plot.x) < plot.w * 0.56 + 6.5 && Math.abs(z - plot.z) < plot.d * 0.56 + 6.5) {
          insidePlot = true;
          break;
        }
      }
      if (insidePlot) continue;

      const y = getTerrainHeight(x, z);
      if (y < 2.35 || y > 7.4) continue;

      dummy.position.set(x, y - 0.02, z);
      dummy.rotation.set(0, rand() * Math.PI * 2, 0);
      const s = 0.78 + rand() * 0.68;
      dummy.scale.set(s, s * (0.85 + rand() * 0.45), s);
      dummy.updateMatrix();
      mats.push(dummy.matrix.clone());
    }

    return { bladeGeo: geo, matrices: mats };
  }, []);

  useEffect(() => {
    const mesh = meshRef.current;
    if (!mesh) return;
    matrices.forEach((mat, i) => mesh.setMatrixAt(i, mat));
    mesh.instanceMatrix.needsUpdate = true;
  }, [matrices]);

  return (
    <instancedMesh ref={meshRef} args={[bladeGeo, undefined, matrices.length]} frustumCulled={false}>
      <shaderMaterial
        vertexShader={grassVertexShader}
        fragmentShader={grassFragmentShader}
        uniforms={parentUniforms}
        side={THREE.DoubleSide}
      />
    </instancedMesh>
  );
}

export function LuxuryCruiseShip({
  position,
  rotationY = 0,
  scale = 1,
  name = 'MS AZUREA ODYSSEY',
  cruising = false,
  phaseOffset = 0,
}: {
  position: [number, number, number];
  rotationY?: number;
  scale?: number;
  name?: string;
  cruising?: boolean;
  phaseOffset?: number;
}) {
  const shipRef = useRef<THREE.Group>(null);
  const radarRef = useRef<THREE.Group>(null);

  useFrame((state) => {
    const t = state.clock.elapsedTime + phaseOffset;
    if (shipRef.current) {
      const heave = (simState.tideOffset ?? 0) + Math.sin(t * 1.15) * 0.24;
      const roll = Math.sin(t * 0.85) * 0.018;
      const pitch = Math.cos(t * 0.72) * 0.009;
      if (cruising) {
        const driftZ = Math.sin(t * 0.12) * 18;
        const driftX = Math.cos(t * 0.12) * 4.5;
        const headingYaw = rotationY + Math.cos(t * 0.12) * 0.08;
        shipRef.current.position.set(position[0] + driftX, position[1] + heave, position[2] + driftZ);
        shipRef.current.rotation.set(pitch, headingYaw, roll);
      } else {
        shipRef.current.position.set(position[0], position[1] + heave, position[2]);
        shipRef.current.rotation.set(pitch, rotationY, roll);
      }
    }
    if (radarRef.current) {
      radarRef.current.rotation.y = t * 2.8;
    }
  });

  const deckHeights = [3.6, 5.2, 6.8, 8.4, 10.0, 11.6];

  return (
    <group ref={shipRef} position={position} rotation={[0, rotationY, 0]} scale={scale} name={name}>
      {/* Ocean Foam Wake Halo around the 68m Mega-Hull */}
      <mesh position={[0, 0.05, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <ringGeometry args={[7.2, 10.5, 48]} />
        <meshBasicMaterial color="#e0f2fe" transparent opacity={0.28} side={THREE.DoubleSide} depthWrite={false} />
      </mesh>

      {/* Crimson Waterline Boot-Topping Stripe (#dc2626) */}
      <mesh position={[0, 0.45, 0]} castShadow receiveShadow>
        <boxGeometry args={[13.2, 0.75, 58]} />
        <meshStandardMaterial color="#dc2626" roughness={0.38} metalness={0.22} />
      </mesh>
      {/* Flared Sub-Waterline Bulbous Bow */}
      <mesh position={[0, 0.35, 32.5]} rotation={[Math.PI / 2, 0, 0]}>
        <cylinderGeometry args={[2.1, 3.2, 8.5, 16]} />
        <meshStandardMaterial color="#dc2626" roughness={0.35} metalness={0.25} />
      </mesh>

      {/* Sculpted Dark-Navy Lower Hull (#0f172a, length ~68m, beam ~13m) */}
      <mesh position={[0, 1.85, -1.5]} castShadow receiveShadow>
        <boxGeometry args={[13.0, 2.5, 55]} />
        <meshStandardMaterial color="#0f172a" roughness={0.28} metalness={0.48} />
      </mesh>
      {/* Tapered Forward Bow Hull Wedge */}
      <mesh position={[0, 1.95, 29.5]} rotation={[Math.PI / 2, 0, 0]} castShadow receiveShadow>
        <coneGeometry args={[6.6, 11.5, 4]} />
        <meshStandardMaterial color="#0f172a" roughness={0.28} metalness={0.48} />
      </mesh>
      {/* Rounded Cruiser Transom Stern */}
      <mesh position={[0, 1.9, -29.0]} castShadow receiveShadow>
        <cylinderGeometry args={[6.4, 5.8, 2.5, 18]} />
        <meshStandardMaterial color="#0f172a" roughness={0.28} metalness={0.48} />
      </mesh>
      {/* Gold Hull Pinstripe Shear Line */}
      <mesh position={[0, 2.95, 0]}>
        <boxGeometry args={[13.25, 0.16, 56.5]} />
        <meshStandardMaterial color="#fbbf24" emissive="#f59e0b" emissiveIntensity={0.65} metalness={0.85} roughness={0.2} />
      </mesh>

      {/* 6 Stepped White Alabaster Superstructure Promenade Decks (#f8fafc) */}
      {deckHeights.map((dy, idx) => {
        const deckLen = 52 - idx * 3.1;
        const deckBeam = 12.4 - idx * 0.28;
        const zOffset = -1.5 - idx * 0.7;
        return (
          <group key={idx} position={[0, dy, zOffset]}>
            <mesh castShadow receiveShadow>
              <boxGeometry args={[deckBeam, 1.38, deckLen]} />
              <meshStandardMaterial color="#f8fafc" roughness={0.25} metalness={0.15} />
            </mesh>
            <mesh position={[0, 0.08, 0]}>
              <boxGeometry args={[deckBeam + 0.18, 0.62, deckLen - 1.2]} />
              <meshStandardMaterial
                color="#0284c7"
                emissive="#38bdf8"
                emissiveIntensity={0.65}
                roughness={0.12}
                metalness={0.65}
              />
            </mesh>
            <mesh position={[0, -0.34, 0]}>
              <boxGeometry args={[deckBeam + 0.22, 0.14, deckLen - 2.0]} />
              <meshStandardMaterial
                color="#fef08a"
                emissive="#fef08a"
                emissiveIntensity={1.35}
                roughness={0.2}
              />
            </mesh>
          </group>
        );
      })}

      {/* 6 Orange Davit Lifeboats (#f97316) Hung Along Port and Starboard Flanks (3 per side) */}
      {[-1, 1].map((side) =>
        [-14, -2, 10].map((lz, lIdx) => (
          <group key={`lifeboat-${side}-${lIdx}`} position={[side * 6.65, 5.3, lz]}>
            <mesh castShadow>
              <boxGeometry args={[1.25, 0.85, 4.4]} />
              <meshStandardMaterial color="#f97316" roughness={0.3} metalness={0.2} />
            </mesh>
            <mesh position={[0, 0.48, 0]}>
              <boxGeometry args={[1.05, 0.25, 3.6]} />
              <meshStandardMaterial color="#f8fafc" roughness={0.35} />
            </mesh>
          </group>
        ))
      )}

      {/* Cantilevered Panoramic Glass Navigation Bridge Wing (#0ea5e9) near the Bow */}
      <group position={[0, 12.1, 15.5]}>
        <mesh castShadow>
          <boxGeometry args={[16.2, 1.15, 3.8]} />
          <meshStandardMaterial color="#f8fafc" roughness={0.22} metalness={0.25} />
        </mesh>
        <mesh position={[0, 0.08, 0.35]}>
          <boxGeometry args={[15.8, 0.65, 3.4]} />
          <meshStandardMaterial
            color="#0ea5e9"
            emissive="#38bdf8"
            emissiveIntensity={0.85}
            roughness={0.1}
            metalness={0.75}
          />
        </mesh>
        <mesh position={[0, 1.4, 0]}>
          <sphereGeometry args={[0.95, 16, 16]} />
          <meshStandardMaterial color="#f8fafc" roughness={0.2} metalness={0.3} />
        </mesh>
        <mesh position={[0, 2.8, -0.5]}>
          <cylinderGeometry args={[0.16, 0.28, 3.4, 8]} />
          <meshStandardMaterial color="#e2e8f0" metalness={0.8} roughness={0.2} />
        </mesh>
        <group ref={radarRef} position={[0, 4.4, -0.5]}>
          <mesh>
            <boxGeometry args={[3.4, 0.22, 0.42]} />
            <meshStandardMaterial color="#38bdf8" emissive="#0284c7" emissiveIntensity={1.1} />
          </mesh>
        </group>
      </group>

      {/* Deck 7 Rooftop Lido Sun Deck with Two Glowing Turquoise Swimming Pools, Cabanas & Waterslide Arch */}
      <group position={[0, 12.55, -3.5]}>
        <mesh receiveShadow>
          <boxGeometry args={[10.4, 0.28, 34.0]} />
          <meshStandardMaterial color="#fde68a" roughness={0.62} metalness={0.08} />
        </mesh>
        {[-6.5, 5.5].map((pz, pIdx) => (
          <group key={`pool-${pIdx}`} position={[0, 0.16, pz]}>
            <mesh>
              <boxGeometry args={[5.4, 0.14, 7.6]} />
              <meshStandardMaterial
                color="#06b6d4"
                emissive="#22d3ee"
                emissiveIntensity={1.15}
                roughness={0.08}
                metalness={0.3}
              />
            </mesh>
            <mesh position={[0, -0.03, 0]}>
              <boxGeometry args={[6.1, 0.1, 8.3]} />
              <meshStandardMaterial color="#f8fafc" roughness={0.3} />
            </mesh>
          </group>
        ))}
        {[-4.0, 4.0].map((cx) =>
          [-12, -6.5, -1, 5.5, 11].map((cz, cIdx) => (
            <mesh key={`cabana-${cx}-${cIdx}`} position={[cx, 0.55, cz]} castShadow>
              <boxGeometry args={[1.35, 0.75, 1.85]} />
              <meshStandardMaterial color="#f8fafc" roughness={0.35} />
            </mesh>
          ))
        )}
        <mesh position={[0, 2.2, -13.5]} rotation={[0.25, 0, 0]}>
          <torusGeometry args={[3.2, 0.42, 10, 24, Math.PI]} />
          <meshStandardMaterial color="#f97316" emissive="#fb923c" emissiveIntensity={0.45} roughness={0.22} />
        </mesh>
      </group>

      {/* Twin Raked Royal-Blue & Gold Cruise Funnels (#1d4ed8 with #fbbf24 gold bands) */}
      {[-3.2, -11.8].map((fz, fIdx) => (
        <group key={`funnel-${fIdx}`} position={[0, 14.8, fz]} rotation={[-0.24, 0, 0]}>
          <mesh castShadow>
            <cylinderGeometry args={[1.35, 1.85, 5.2, 16]} />
            <meshStandardMaterial color="#1d4ed8" roughness={0.25} metalness={0.45} />
          </mesh>
          <mesh position={[0, 1.1, 0]}>
            <cylinderGeometry args={[1.48, 1.56, 0.68, 16]} />
            <meshStandardMaterial color="#fbbf24" emissive="#f59e0b" emissiveIntensity={0.75} metalness={0.88} roughness={0.18} />
          </mesh>
          <mesh position={[0, 2.55, -0.35]}>
            <boxGeometry args={[3.8, 0.35, 2.4]} />
            <meshStandardMaterial color="#0f172a" metalness={0.65} roughness={0.25} />
          </mesh>
        </group>
      ))}
    </group>
  );
}

export function VegasStripDetails() {
  const fountainRef = useRef<THREE.Group>(null);
  const arcJetsRef = useRef<THREE.Group>(null);
  const mistRef = useRef<THREE.Mesh>(null);
  const checkpointGateRef = useRef<THREE.Group>(null);
  const chevronRef = useRef<THREE.Group>(null);
  const gatePulseRef = useRef<THREE.Mesh>(null);
  const stormWallRef = useRef<THREE.Mesh>(null);
  const stormRingRef = useRef<THREE.Mesh>(null);
  const lootCratesGroupRef = useRef<THREE.Group>(null);
  const marinaGroupRef = useRef<THREE.Group>(null);
  const repairBaysRef = useRef<THREE.Group>(null);

  const [streetLightModel, setStreetLightModel] = useState<THREE.Group | null>(null);
  const [palmModel, setPalmModel] = useState<THREE.Group | null>(null);
  const [chileanPalmModel, setChileanPalmModel] = useState<THREE.Group | null>(null);
  const [lootCrateModel, setLootCrateModel] = useState<THREE.Group | null>(null);
  const [ammoCrateModel, setAmmoCrateModel] = useState<THREE.Group | null>(null);
  const [sloopYachtModel, setSloopYachtModel] = useState<THREE.Group | null>(null);
  const [galleonShipModel, setGalleonShipModel] = useState<THREE.Group | null>(null);
  const [caiqueBoatModel, setCaiqueBoatModel] = useState<THREE.Group | null>(null);

  useEffect(() => {
    const loader = new GLTFLoader();
    const sharedEnvMat = new THREE.MeshStandardMaterial({
      vertexColors: true,
      roughness: 0.65,
      metalness: 0.1,
    });
    const sharedCrateMat = new THREE.MeshStandardMaterial({
      vertexColors: true,
      roughness: 0.35,
      metalness: 0.45,
    });
    loader.load('/models/street_light.glb', (gltf) => {
      gltf.scene.traverse((child) => {
        if ((child as THREE.Mesh).isMesh) {
          (child as THREE.Mesh).material = sharedEnvMat;
        }
      });
      setStreetLightModel(gltf.scene);
    });
    loader.load('/models/palm_tree.glb', (gltf) => {
      gltf.scene.traverse((child) => {
        if ((child as THREE.Mesh).isMesh) {
          (child as THREE.Mesh).material = sharedEnvMat;
        }
      });
      setPalmModel(gltf.scene);
    });
    loader.load('/models/chilean_palm.glb', (gltf) => {
      gltf.scene.traverse((child) => {
        if ((child as THREE.Mesh).isMesh) {
          (child as THREE.Mesh).material = sharedEnvMat;
        }
      });
      setChileanPalmModel(gltf.scene);
    });
    loader.load('/models/loot_crate.glb', (gltf) => {
      gltf.scene.traverse((child) => {
        if ((child as THREE.Mesh).isMesh) {
          (child as THREE.Mesh).material = sharedCrateMat;
        }
      });
      setLootCrateModel(gltf.scene);
    });
    loader.load('/models/ammo_crate.glb', (gltf) => {
      gltf.scene.traverse((child) => {
        if ((child as THREE.Mesh).isMesh) {
          (child as THREE.Mesh).material = sharedCrateMat;
        }
      });
      setAmmoCrateModel(gltf.scene);
    });
    loader.load('/models/sloop_yacht.glb', (gltf) => {
      setSloopYachtModel(gltf.scene);
    });
    loader.load('/models/galleon_ship.glb', (gltf) => {
      setGalleonShipModel(gltf.scene);
    });
    loader.load('/models/caique_boat.glb', (gltf) => {
      setCaiqueBoatModel(gltf.scene);
    });
  }, []);

  // Procedural Metropolis Roadway, Sidewalk, Crosswalk, Limestone & Steel PBR Textures
  const mainAsphaltTex = useMemo(() => {
    const t = createAsphaltRoadTexture();
    t.repeat.set(1, 16);
    return t;
  }, []);

  const crossAsphaltTex = useMemo(() => {
    const t = createAsphaltRoadTexture().clone();
    t.needsUpdate = true;
    t.center.set(0.5, 0.5);
    t.rotation = Math.PI / 2;
    t.repeat.set(1, 6);
    return t;
  }, []);

  const mainAsphaltRough = useMemo(() => {
    const t = createAsphaltRoughnessTexture();
    t.repeat.set(1, 16);
    return t;
  }, []);

  const crossAsphaltRough = useMemo(() => {
    const t = createAsphaltRoughnessTexture().clone();
    t.needsUpdate = true;
    t.center.set(0.5, 0.5);
    t.rotation = Math.PI / 2;
    t.repeat.set(1, 6);
    return t;
  }, []);

  const lampGlowRef = useRef(0.43);
  const { streetLampBulbMat, busLedMat, busKioskMat } = useMemo(() => ({
    streetLampBulbMat: new THREE.MeshStandardMaterial({
      color: '#fef9c3',
      emissive: '#fef08a',
      emissiveIntensity: 0.43,
      roughness: 0.2,
    }),
    busLedMat: new THREE.MeshStandardMaterial({
      color: '#fef08a',
      emissive: '#fef08a',
      emissiveIntensity: 0.55,
      roughness: 0.22,
    }),
    busKioskMat: new THREE.MeshStandardMaterial({
      color: '#38bdf8',
      emissive: '#0284c7',
      emissiveIntensity: 0.85,
      roughness: 0.18,
    }),
  }), []);

  useEffect(() => () => {
    mainAsphaltTex.dispose();
    crossAsphaltTex.dispose();
    mainAsphaltRough.dispose();
    crossAsphaltRough.dispose();
    streetLampBulbMat.dispose();
    busLedMat.dispose();
    busKioskMat.dispose();
  }, [mainAsphaltTex, crossAsphaltTex, mainAsphaltRough, crossAsphaltRough, streetLampBulbMat, busLedMat, busKioskMat]);

  const { map: sidewalkTex, roughnessMap: sidewalkRough } = useMemo(() => getSidewalkCobblePBR(), []);
  const { map: crosswalkTex, roughnessMap: crosswalkRough } = useMemo(() => getCrosswalkIntersectionPBR(), []);
  const { map: steelConcreteTex, roughnessMap: steelConcreteRough } = useMemo(() => getModernConcreteSteelPBR(), []);

  const limestoneTex = useMemo(() => createLimestonePBR(), []);
  const limestoneNormal = useMemo(
    () => createNormalMapFromCanvas(limestoneTex.image as HTMLCanvasElement, 2.5, 3, 3),
    [limestoneTex]
  );

  // Street Sign Textures for the 4 Major Signalized Intersections
  const gantryIntersections = useMemo(
    () => [
      { z: -120, label: 'NORTH BAY PKWY', tex: createStreetSignTexture('NORTH BAY PKWY') },
      { z: -60, label: 'GRAND CENTRAL AVE', tex: createStreetSignTexture('GRAND CENTRAL AVE') },
      { z: 0, label: 'MIDTOWN CROSSING', tex: createStreetSignTexture('MIDTOWN CROSSING') },
      { z: 80, label: 'HARBOR BLVD', tex: createStreetSignTexture('HARBOR BLVD') },
    ],
    []
  );

  // Cloned real 3D GLB cobra-head street lamps along Grand Central Ave sidewalks (clear of cross-streets)
  const streetLampClones = useMemo(() => {
    if (!streetLightModel) return [];
    const list: { key: string; obj: THREE.Group; pos: [number, number, number]; rotY: number }[] = [];
    for (let z = -180; z <= 168; z += 28) {
      if (Math.abs(z + 120) < 16 || Math.abs(z) < 17 || Math.abs(z - 80) < 16) continue;
      for (const x of [-19.2, 19.2]) {
        const y = getTerrainHeight(x, z);
        const clone = streetLightModel.clone(true);
        list.push({
          key: `lamp-${x}-${z}`,
          obj: clone,
          pos: [x, y, z],
          rotY: x < 0 ? Math.PI / 2 : -Math.PI / 2,
        });
      }
    }
    return list;
  }, [streetLightModel]);

  // Cloned real 3D GLB botanical palm trees at outer coastal resort nodes (strictly >= 38m from all LANDMARKS)
  const stripPalmClones = useMemo(() => {
    if (!palmModel && !chileanPalmModel) return [];
    const list: { key: string; obj: THREE.Group; pos: [number, number, number]; rotY: number; scale: number }[] = [];
    const isNearLandmark = (px: number, pz: number) =>
      LANDMARKS.some((lm) => Math.hypot(px - lm.position[0], pz - lm.position[2]) < 38);

    let idx = 0;
    // Outer waterfront resort approaches only (Midtown avenues use cosmopolitan deciduous street trees)
    for (const z of [-188, -168, 162, 182]) {
      for (const x of [-21.4, 21.4]) {
        if (isNearLandmark(x, z)) continue;
        const useChilean = idx % 2 === 1 && chileanPalmModel;
        const src = useChilean ? chileanPalmModel! : (palmModel || chileanPalmModel)!;
        const y = getTerrainHeight(x, z);
        const scale = useChilean ? 0.92 + (idx % 3) * 0.08 : 1.38 + (idx % 3) * 0.12;
        list.push({
          key: `strip-palm-${x}-${z}`,
          obj: src.clone(true),
          pos: [x, y, z],
          rotY: (idx * 1.37) % (Math.PI * 2),
          scale,
        });
        idx++;
      }
    }

    // Coastal & Park Perimeter Palms (filtered >= 38m from all LANDMARKS)
    const plazaCoords: [number, number][] = [
      [-68, 26],
      [-36, 26],
      [-68, 58],
      [-36, 58],
      [68, -72],
      [-75, 22],
      [68, 22],
    ];
    plazaCoords.forEach(([px, pz], pIdx) => {
      if (isNearLandmark(px, pz)) return;
      const useChilean = pIdx % 2 === 0 && chileanPalmModel;
      const src = useChilean ? chileanPalmModel! : (palmModel || chileanPalmModel)!;
      const py = getTerrainHeight(px, pz);
      const scale = useChilean ? 1.02 : 1.48;
      list.push({
        key: `plaza-palm-${pIdx}`,
        obj: src.clone(true),
        pos: [px, py, pz],
        rotY: (pIdx * 2.1) % (Math.PI * 2),
        scale,
      });
    });

    return list;
  }, [palmModel, chileanPalmModel]);

  // Cosmopolitan Urban Deciduous Street Trees along Grand Central Ave (x = ±21.2) & Midtown Cross Ave (z = ±13.5)
  const urbanStreetTrees = useMemo(() => {
    const trees: { key: string; pos: [number, number, number]; scale: number; rotY: number }[] = [];
    const busShelterZ = [-85, -25, 35];
    const isNearLandmark = (px: number, pz: number) =>
      LANDMARKS.some((lm) => Math.hypot(px - lm.position[0], pz - lm.position[2]) < 32);

    let tIdx = 0;
    // Grand Central Avenue deciduous trees (z = -156..+148 outside intersections & bus shelters)
    for (let z = -156; z <= 148; z += 26) {
      if (Math.abs(z + 120) < 16 || Math.abs(z) < 18 || Math.abs(z - 80) < 16) continue;
      if (busShelterZ.some((bz) => Math.abs(z - bz) < 9)) continue;
      for (const x of [-21.2, 21.2]) {
        if (isNearLandmark(x, z)) continue;
        const y = getTerrainHeight(x, z);
        if (y < 1.2) continue;
        trees.push({
          key: `ave-tree-${x}-${z}`,
          pos: [x, y, z],
          scale: 0.92 + (tIdx % 3) * 0.1,
          rotY: (tIdx * 1.7) % (Math.PI * 2),
        });
        tIdx++;
      }
    }

    // Midtown Cross Avenue deciduous trees (z = ±13.5, x = -120..+120 outside Grand Central Ave intersection)
    for (let x = -118; x <= 118; x += 28) {
      if (Math.abs(x) < 28) continue;
      for (const z of [-13.5, 13.5]) {
        if (isNearLandmark(x, z)) continue;
        const y = getTerrainHeight(x, z);
        if (y < 1.2) continue;
        trees.push({
          key: `cross-tree-${x}-${z}`,
          pos: [x, y, z],
          scale: 0.88 + (tIdx % 3) * 0.1,
          rotY: (tIdx * 2.1) % (Math.PI * 2),
        });
        tIdx++;
      }
    }

    return trees;
  }, []);

  // Cloned real 3D GLB Battle Royale Supply (LOOT) & Ammo (AMMO) Crates
  const crateClones = useMemo(() => {
    return simState.lootCrates.map((crate, idx) => {
      const src = crate.kind === 'LOOT' ? lootCrateModel : ammoCrateModel;
      const [cx, , cz] = crate.position;
      const cy = getTerrainHeight(cx, cz);
      return {
        id: crate.id,
        kind: crate.kind,
        pos: [cx, cy, cz] as [number, number, number],
        rotY: (idx * 0.85) % (Math.PI * 2),
        obj: src ? src.clone(true) : null,
      };
    });
  }, [lootCrateModel, ammoCrateModel]);

  useFrame((state, dt) => {
    const t = state.clock.elapsedTime;
    const activeThemeId = resolveActiveThemeId(simState.startMenuOpen, simState.lobbyTheme, simState.worldTimeTheme);
    const targetLampGlow = 0.28 + LOBBY_THEMES[activeThemeId].windowGlow * 1.85;
    const damp = 1 - Math.exp(-2.8 * Math.min(dt, 0.1));
    lampGlowRef.current = THREE.MathUtils.lerp(lampGlowRef.current, targetLampGlow, damp);
    streetLampBulbMat.emissiveIntensity = lampGlowRef.current;
    busLedMat.emissiveIntensity = 0.35 + lampGlowRef.current * 0.65;
    busKioskMat.emissiveIntensity = 0.65 + lampGlowRef.current * 0.45;
    if (fountainRef.current) {
      fountainRef.current.children.forEach((jet, i) => {
        const wave = 0.5 + 0.5 * Math.sin(t * 4.2 + i * 0.55);
        jet.scale.y = 0.55 + wave * 1.9;
        jet.position.y = 0.4 + jet.scale.y * 1.45;
      });
    }
    if (arcJetsRef.current) {
      arcJetsRef.current.children.forEach((arc, i) => {
        const pulse = 0.72 + 0.35 * Math.sin(t * 3.1 + i * 0.52);
        arc.scale.setScalar(pulse);
      });
    }
    if (mistRef.current) {
      const m = 0.92 + 0.14 * Math.sin(t * 2.4);
      mistRef.current.scale.set(m, 1, m);
    }
    if (checkpointGateRef.current) {
      checkpointGateRef.current.visible = simState.gameMode === 'GRAND_PRIX' && !simState.startMenuOpen;
      const cp = simState.checkpoints[simState.activeCheckpoint] ?? simState.checkpoints[0];
      if (cp) {
        const gy = cp.position[1];
        checkpointGateRef.current.position.set(cp.position[0], gy, cp.position[2]);
        checkpointGateRef.current.rotation.set(0, cp.yaw, 0);
      }
    }
    if (chevronRef.current) {
      chevronRef.current.position.y = 11.8 + Math.sin(t * 4.2) * 0.55;
      chevronRef.current.rotation.y = t * 2.0;
    }
    if (gatePulseRef.current) {
      const s = 0.96 + 0.08 * Math.sin(t * 5.0);
      gatePulseRef.current.scale.set(s, 1, s);
    }
    const showCombat = simState.brActive && simState.gameMode === 'BATTLE_ROYALE';
    const sr = simState.stormRadius ?? 235;
    if (stormWallRef.current) {
      stormWallRef.current.visible = showCombat;
      stormWallRef.current.scale.set(sr, 1, sr);
      stormWallRef.current.rotation.y = t * 0.06;
    }
    if (stormRingRef.current) {
      stormRingRef.current.visible = showCombat;
      stormRingRef.current.scale.set(sr, sr, 1);
    }
    if (lootCratesGroupRef.current) {
      lootCratesGroupRef.current.visible = showCombat;
      lootCratesGroupRef.current.children.forEach((crateGroup, idx) => {
        const node = simState.lootCrates[idx];
        if (!node) return;
        const beacon = crateGroup.getObjectByName('crate-beacon');
        const ring = crateGroup.getObjectByName('crate-ring');
        if (beacon) {
          beacon.visible = !node.opened;
        }
        if (ring) {
          ring.visible = !node.opened;
          const pulse = 0.92 + 0.12 * Math.sin(t * 4.0 + idx);
          ring.scale.set(pulse, pulse, 1);
        }
      });
    }
    if (marinaGroupRef.current) {
      marinaGroupRef.current.children.forEach((vessel, idx) => {
        vessel.position.y = (simState.tideOffset ?? 0) + 0.35 + Math.sin(t * 1.6 + idx * 1.1) * 0.16;
        vessel.rotation.z = Math.sin(t * 1.2 + idx * 0.9) * 0.025;
      });
    }
    if (repairBaysRef.current) {
      repairBaysRef.current.children.forEach((bayGroup, idx) => {
        const beacon = bayGroup.getObjectByName('repair-beacon');
        const ring = bayGroup.getObjectByName('repair-ring');
        if (beacon) {
          beacon.rotation.y = t * 2.1 + idx * 0.8;
          beacon.position.y = 5.45 + Math.sin(t * 3.0 + idx) * 0.24;
        }
        if (ring) {
          const pulse = 0.96 + 0.06 * Math.sin(t * 3.6 + idx);
          ring.scale.set(pulse, pulse, 1);
        }
      });
    }
  });

  const groundY = getTerrainHeight(0, 0);
  const parkY = getTerrainHeight(-52, 42);
  const rampY = getTerrainHeight(14.5, 115);

  // Sidewalk Z segments along Grand Central Avenue (split cleanly at z = -120, 0, +80 cross-streets)
  const grandAveSidewalkSegments: [number, number][] = [
    [-205, -132],
    [-108, -13],
    [13, 68],
    [92, 185],
  ];

  // Cross-Town Boulevard specs (split into West and East wings outside Grand Central Ave x = ±16)
  const crossBoulevards = [
    { z: -120, width: 20, westMin: -140, eastMax: 140, name: 'North Cross Boulevard' },
    { z: 0, width: 22, westMin: -150, eastMax: 150, name: 'Midtown Cross Avenue' },
    { z: 80, width: 20, westMin: -145, eastMax: 145, name: 'South Cross Boulevard' },
  ];

  // 6 Zebra Crosswalk Intersection Pad Z-positions along Grand Central Avenue
  const crosswalkZList = [-120, -60, 0, 40, 80, 130];

  return (
    <group>
      {/* 3D Battle Royale Shrinking Storm Wall & Ground Storm Ring */}
      <mesh
        ref={stormWallRef}
        position={[0, 75, 0]}
        scale={[simState.stormRadius, 1, simState.stormRadius]}
      >
        <cylinderGeometry args={[1, 1, 160, 36, 1, true]} />
        <meshBasicMaterial
          color="#a855f7"
          transparent
          opacity={0.12}
          side={THREE.BackSide}
          depthWrite={false}
        />
      </mesh>
      <mesh
        ref={stormRingRef}
        position={[0, 0.25, 0]}
        rotation={[-Math.PI / 2, 0, 0]}
        scale={[simState.stormRadius, simState.stormRadius, 1]}
      >
        <ringGeometry args={[0.985, 1.015, 64]} />
        <meshBasicMaterial
          color="#38bdf8"
          transparent
          opacity={0.58}
          side={THREE.DoubleSide}
          depthWrite={false}
        />
      </mesh>

      {/* 8 Real 3D .glb Battle Royale Supply & Ammo Crates */}
      <group ref={lootCratesGroupRef}>
        {crateClones.map((c) => {
          const accentColor = c.kind === 'LOOT' ? '#fbbf24' : '#38bdf8';
          return (
            <group key={c.id} position={c.pos}>
              {c.obj ? (
                <primitive object={c.obj} scale={1.65} rotation={[0, c.rotY, 0]} />
              ) : (
                <mesh position={[0, 0.55, 0]} castShadow receiveShadow>
                  <boxGeometry args={[1.4, 1.1, 1.0]} />
                  <meshStandardMaterial color={accentColor} roughness={0.35} metalness={0.45} />
                </mesh>
              )}
              <mesh
                name="crate-ring"
                position={[0, 0.14, 0]}
                rotation={[-Math.PI / 2, 0, 0]}
              >
                <ringGeometry args={[1.35, 1.85, 32]} />
                <meshBasicMaterial
                  color={accentColor}
                  transparent
                  opacity={0.62}
                  side={THREE.DoubleSide}
                  depthWrite={false}
                />
              </mesh>
              <mesh name="crate-beacon" position={[0, 26, 0]}>
                <cylinderGeometry args={[0.24, 0.68, 52, 12, 1, true]} />
                <meshBasicMaterial
                  color={accentColor}
                  transparent
                  opacity={0.22}
                  side={THREE.DoubleSide}
                  depthWrite={false}
                />
              </mesh>
            </group>
          );
        })}
      </group>

      {/* ==================== TEXTURED 3D METROPOLIS ROADWAYS, INTERSECTIONS & SIDEWALKS ==================== */}

      {/* 1. Grand Central Avenue between the North Bay and South Promenade junctions */}
      <mesh
        position={[0, groundY + 0.055, (coastRoadRadius(0) + NORTH_BAY_BRIDGE.approach) / 2]}
        rotation={[-Math.PI / 2, 0, 0]}
        receiveShadow
      >
        <planeGeometry args={[NORTH_BAY_BRIDGE.halfWidth * 2, coastRoadRadius(0) - NORTH_BAY_BRIDGE.approach]} />
        <meshStandardMaterial
          map={mainAsphaltTex}
          roughnessMap={mainAsphaltRough}
          roughness={0.86}
          metalness={0.08}
          polygonOffset
          polygonOffsetFactor={1}
          polygonOffsetUnits={1}
        />
      </mesh>

      {/* Grand Central Avenue Textured Concrete Sidewalks (width = 5.5m along x = ±18.8) & Raised Stone Curbs */}
      {grandAveSidewalkSegments.map(([zStart, zEnd], sIdx) => {
        const segLen = zEnd - zStart;
        const zMid = (zStart + zEnd) * 0.5;
        const segY = getTerrainHeight(0, zMid);
        return (
          <group key={`grand-ave-sidewalk-${sIdx}`}>
            {[-18.8, 18.8].map((sx) => (
              <mesh
                key={`sw-${sx}`}
                position={[sx, segY + 0.11, zMid]}
                receiveShadow
                castShadow
              >
                <boxGeometry args={[5.5, 0.14, segLen]} />
                <meshStandardMaterial
                  map={sidewalkTex}
                  roughnessMap={sidewalkRough}
                  roughness={0.76}
                  metalness={0.06}
                />
              </mesh>
            ))}
            {[-16.15, 16.15].map((cx) => (
              <mesh
                key={`curb-${cx}`}
                position={[cx, segY + 0.13, zMid]}
                receiveShadow
                castShadow
              >
                <boxGeometry args={[0.45, 0.18, segLen]} />
                <meshStandardMaterial
                  map={limestoneTex}
                  normalMap={limestoneNormal}
                  bumpMap={limestoneTex}
                  bumpScale={0.1}
                  roughness={0.62}
                />
              </mesh>
            ))}
          </group>
        );
      })}

      {/* 2. Three Cross-Town Boulevards (North Cross z=-120, Midtown Cross z=0, South Cross z=+80) */}
      {crossBoulevards.map((blvd) => {
        const by = getTerrainHeight(0, blvd.z);
        const westLen = -16 - blvd.westMin;
        const westCenter = (blvd.westMin - 16) * 0.5;
        const eastLen = blvd.eastMax - 16;
        const eastCenter = (blvd.eastMax + 16) * 0.5;
        const swOffset = blvd.width * 0.5 + 2.1;
        const curbOffset = blvd.width * 0.5 + 0.18;

        return (
          <group key={blvd.name}>
            {/* West Wing Roadway */}
            <mesh
              position={[westCenter, by + 0.052, blvd.z]}
              rotation={[-Math.PI / 2, 0, 0]}
              receiveShadow
            >
              <planeGeometry args={[westLen, blvd.width]} />
              <meshStandardMaterial
                map={crossAsphaltTex}
                roughnessMap={crossAsphaltRough}
                roughness={0.86}
                metalness={0.08}
                polygonOffset
                polygonOffsetFactor={1}
                polygonOffsetUnits={1}
              />
            </mesh>
            {/* East Wing Roadway */}
            <mesh
              position={[eastCenter, by + 0.052, blvd.z]}
              rotation={[-Math.PI / 2, 0, 0]}
              receiveShadow
            >
              <planeGeometry args={[eastLen, blvd.width]} />
              <meshStandardMaterial
                map={crossAsphaltTex}
                roughnessMap={crossAsphaltRough}
                roughness={0.86}
                metalness={0.08}
                polygonOffset
                polygonOffsetFactor={1}
                polygonOffsetUnits={1}
              />
            </mesh>

            {/* Cross-Boulevard Sidewalks & Raised Stone Curbs (West & East Wings) */}
            {[
              { xCenter: westCenter, len: westLen - 6 },
              { xCenter: eastCenter, len: eastLen - 6 },
            ].map((wing, wIdx) => (
              <group key={`wing-${wIdx}`}>
                {[-swOffset, swOffset].map((dz) => (
                  <mesh
                    key={`csw-${dz}`}
                    position={[wing.xCenter, by + 0.1, blvd.z + dz]}
                    receiveShadow
                  >
                    <boxGeometry args={[wing.len, 0.12, 3.8]} />
                    <meshStandardMaterial
                      map={sidewalkTex}
                      roughnessMap={sidewalkRough}
                      roughness={0.78}
                      metalness={0.05}
                    />
                  </mesh>
                ))}
                {[-curbOffset, curbOffset].map((dz) => (
                  <mesh
                    key={`ccurb-${dz}`}
                    position={[wing.xCenter, by + 0.12, blvd.z + dz]}
                    receiveShadow
                  >
                    <boxGeometry args={[wing.len, 0.16, 0.38]} />
                    <meshStandardMaterial
                      map={limestoneTex}
                      normalMap={limestoneNormal}
                      roughness={0.62}
                    />
                  </mesh>
                ))}
              </group>
            ))}
          </group>
        );
      })}

      {/* 3. Textured Zebra Crosswalk Intersection Pads at (0, -120), (0, -60), (0, 0), (0, 40), (0, 80), and (0, 130) */}
      {crosswalkZList.map((cz) => {
        const iy = getTerrainHeight(0, cz);
        return (
          <mesh
            key={`crosswalk-pad-${cz}`}
            position={[0, iy + 0.072, cz]}
            rotation={[-Math.PI / 2, 0, 0]}
            receiveShadow
          >
            <planeGeometry args={[32, 24]} />
            <meshStandardMaterial
              map={crosswalkTex}
              roughnessMap={crosswalkRough}
              roughness={0.75}
              metalness={0.08}
              polygonOffset
              polygonOffsetFactor={-1}
              polygonOffsetUnits={-1}
            />
          </mesh>
        );
      })}

      {/* 4. Modern City Overhead Traffic Signal Gantries & Illuminated Street-Name Signs on Sidewalks (x = ±19.5) */}
      {gantryIntersections.map((inter) => {
        const gy = getTerrainHeight(0, inter.z);
        return (
          <group key={`gantry-${inter.z}`} position={[0, gy, inter.z]}>
            {[-1, 1].map((side) => {
              const poleX = side * 19.5;
              const armDir = -side; // Cantilever extends inward over driving lanes
              return (
                <group key={`pole-${side}`} position={[poleX, 0, (side < 0 ? -1 : 1) * 11.5]}>
                  {/* Concrete & Steel Foundation Plinth */}
                  <mesh position={[0, 0.45, 0]} castShadow>
                    <cylinderGeometry args={[0.42, 0.52, 0.9, 12]} />
                    <meshStandardMaterial
                      map={steelConcreteTex}
                      roughnessMap={steelConcreteRough}
                      roughness={0.5}
                      metalness={0.45}
                    />
                  </mesh>
                  {/* Vertical Dark-Steel Mast Pole (100% on sidewalk at x = ±19.5) */}
                  <mesh position={[0, 4.2, 0]} castShadow>
                    <cylinderGeometry args={[0.22, 0.28, 7.6, 12]} />
                    <meshStandardMaterial color="#1e293b" metalness={0.82} roughness={0.24} />
                  </mesh>
                  {/* Horizontal Cantilever Mast Arm Overhanging Lanes at y = 7.45m */}
                  <mesh position={[armDir * 7.2, 7.45, 0]} rotation={[0, 0, Math.PI / 2]} castShadow>
                    <cylinderGeometry args={[0.14, 0.19, 14.4, 10]} />
                    <meshStandardMaterial color="#1e293b" metalness={0.82} roughness={0.24} />
                  </mesh>
                  {/* Illuminated Metropolitan Blue Street-Name Sign Plate */}
                  <DamageableProp id={'street-sign-' + inter.z + '-' + side} label="Street sign" material="metal" durability={60}
                    position={[armDir * 5.2, 7.55, 0]} center={[0, 0, 0]} size={[3.8, 0.72, 0.16]}>
                    <mesh>
                      <boxGeometry args={[3.8, 0.72, 0.14]} />
                      <meshStandardMaterial map={inter.tex} emissive="#1e3a8a" emissiveIntensity={0.45} roughness={0.25} />
                    </mesh>
                  </DamageableProp>
                  {/* Twin 3-Aspect Red/Amber/Green LED Traffic Signal Heads */}
                  {[4.2, 10.6].map((offset, hIdx) => (
                    <group key={`sig-${hIdx}`} position={[armDir * offset, 6.72, 0]}>
                      <mesh castShadow>
                        <boxGeometry args={[0.46, 1.28, 0.34]} />
                        <meshStandardMaterial color="#0f172a" metalness={0.75} roughness={0.28} />
                      </mesh>
                      {/* Red LED Aspect */}
                      <mesh position={[0, 0.36, 0.18]}>
                        <sphereGeometry args={[0.12, 10, 10]} />
                        <meshStandardMaterial color="#ef4444" emissive="#ef4444" emissiveIntensity={1.6} />
                      </mesh>
                      {/* Amber LED Aspect */}
                      <mesh position={[0, 0, 0.18]}>
                        <sphereGeometry args={[0.12, 10, 10]} />
                        <meshStandardMaterial color="#f59e0b" emissive="#f59e0b" emissiveIntensity={1.4} />
                      </mesh>
                      {/* Green LED Aspect */}
                      <mesh position={[0, -0.36, 0.18]}>
                        <sphereGeometry args={[0.12, 10, 10]} />
                        <meshStandardMaterial color="#22c55e" emissive="#22c55e" emissiveIntensity={2.2} />
                      </mesh>
                    </group>
                  ))}
                </group>
              );
            })}
          </group>
        );
      })}

      {/* Real 3D GLB Botanical Palm Trees at Outer Coastal Resort Approaches */}
      {stripPalmClones.map((item) => (
        <DamageableProp key={item.key} id={item.key} label="Palm tree" material="wood"
          position={item.pos} center={[0, 3.4, 0]} size={[0.72, 6.8, 0.72]}>
          <primitive object={item.obj} rotation={[0, item.rotY, 0]} scale={item.scale} />
        </DamageableProp>
      ))}

      {/* Sculpted Urban Deciduous Street Trees in Stone Sidewalk Planters along Grand Central Ave & Midtown Cross Ave */}
      {urbanStreetTrees.map((tree, idx) => (
        <DamageableProp key={tree.key} id={tree.key} label="Street tree" material="wood"
          position={tree.pos} center={[0, 2, 0]} size={[0.66, 4, 0.66]}>
          <group rotation={[0, tree.rotY, 0]} scale={tree.scale}>
          {/* Carved Limestone Sidewalk Tree Planter Box & Soil Bed */}
          <mesh position={[0, 0.22, 0]} castShadow receiveShadow>
            <boxGeometry args={[2.1, 0.44, 2.1]} />
            <meshStandardMaterial
              map={limestoneTex}
              normalMap={limestoneNormal}
              roughness={0.62}
              metalness={0.08}
            />
          </mesh>
          <mesh position={[0, 0.45, 0]}>
            <boxGeometry args={[1.76, 0.06, 1.76]} />
            <meshStandardMaterial color="#3f2e21" roughness={0.92} />
          </mesh>
          {/* Dark-Brown Hardwood Trunk & Primary Forks */}
          <mesh position={[0, 2.15, 0]} castShadow>
            <cylinderGeometry args={[0.2, 0.34, 3.6, 10]} />
            <meshStandardMaterial color="#4a3525" roughness={0.86} />
          </mesh>
          {/* 3 Clustered Dark-Emerald & Forest-Green Deciduous Canopy Spheres */}
          <mesh position={[0, 4.75, 0]} castShadow receiveShadow>
            <dodecahedronGeometry args={[1.95, 2]} />
            <meshStandardMaterial color={idx % 2 === 0 ? '#166534' : '#15803d'} roughness={0.78} />
          </mesh>
          <mesh position={[0.78, 4.15, 0.52]} castShadow receiveShadow>
            <dodecahedronGeometry args={[1.42, 2]} />
            <meshStandardMaterial color="#15803d" roughness={0.8} />
          </mesh>
          <mesh position={[-0.72, 4.25, -0.48]} castShadow receiveShadow>
            <dodecahedronGeometry args={[1.48, 2]} />
            <meshStandardMaterial color="#14532d" roughness={0.82} />
          </mesh>
          </group>
        </DamageableProp>
      ))}

      {/* 6 Sleek Glass & Dark-Steel City Bus Shelters / Metro Kiosks along Grand Central Avenue (x = ±20.5, z = -85, -25, +35) */}
      {[-85, -25, 35].map((bz) =>
        [-20.5, 20.5].map((bx) => {
          const by = getTerrainHeight(bx, bz);
          const faceSign = bx < 0 ? 1 : -1;
          return (
            <DamageableProp key={`bus-shelter-${bx}-${bz}`} id={`bus-shelter-${bx}-${bz}`}
              label="Bus shelter" material="glass" durability={115}
              position={[bx, by + 0.14, bz]} center={[0, 1.72, 0]} size={[2.15, 3.43, 5.55]}>
              <group rotation={[0, bx < 0 ? 0 : Math.PI, 0]}>
              {/* Dark-Steel Architectural Shelter Frame Columns */}
              {[-2.4, 2.4].map((dz) => (
                <mesh key={`post-${dz}`} position={[-0.85, 1.65, dz]} castShadow>
                  <cylinderGeometry args={[0.09, 0.11, 3.3, 10]} />
                  <meshStandardMaterial color="#1e293b" metalness={0.82} roughness={0.24} />
                </mesh>
              ))}
              {/* Cantilevered Dark-Steel & Glass Roof Canopy */}
              <mesh position={[0.1, 3.32, 0]} castShadow receiveShadow>
                <boxGeometry args={[2.35, 0.16, 5.6]} />
                <meshStandardMaterial color="#0f172a" metalness={0.85} roughness={0.22} />
              </mesh>
              {/* Warm LED Ceiling Strip Light */}
              <mesh position={[0.15, 3.22, 0]} material={busLedMat}>
                <boxGeometry args={[1.6, 0.05, 4.8]} />
              </mesh>
              {/* Tempered Glass Rear Windscreen Panel */}
              <mesh position={[-0.85, 1.65, 0]}>
                <boxGeometry args={[0.08, 2.85, 4.65]} />
                <meshPhysicalMaterial
                  color="#bae6fd"
                  transparent
                  opacity={0.42}
                  roughness={0.08}
                  metalness={0.2}
                  clearcoat={1}
                />
              </mesh>
              {/* Commuter Bench */}
              <mesh position={[-0.42, 0.58, -0.5]} castShadow>
                <boxGeometry args={[0.62, 0.12, 2.8]} />
                <meshStandardMaterial color="#334155" metalness={0.65} roughness={0.35} />
              </mesh>
              {/* Illuminated City Metro Map & Route Kiosk Totem */}
              <mesh position={[0.1, 1.55, 2.45 * faceSign]} castShadow>
                <boxGeometry args={[1.35, 2.55, 0.22]} />
                <meshStandardMaterial color="#0f172a" metalness={0.8} roughness={0.25} />
              </mesh>
              <mesh position={[0.1, 1.62, 2.45 * faceSign]} material={busKioskMat}>
                <boxGeometry args={[1.12, 1.95, 0.26]} />
              </mesh>
              </group>
            </DamageableProp>
          );
        })
      )}

      {/* Real 3D GLB Cobra-Head Street Lamps along Grand Central Avenue Sidewalks */}
      {streetLampClones.map((lamp) => (
        <DamageableProp key={lamp.key} id={lamp.key} label="Streetlight" material="metal"
          position={lamp.pos} center={[0, 3.9, 0]} size={[0.47, 7.8, 0.47]}>
          <group rotation={[0, lamp.rotY, 0]}>
          <primitive object={lamp.obj} scale={1.08} />
          <mesh position={[0, 8.35, 1.35]} material={streetLampBulbMat}>
            <boxGeometry args={[0.38, 0.1, 0.55]} />
          </mesh>
          </group>
        </DamageableProp>
      ))}

      {/* Active 3D Grand Prix Checkpoint Gate (Single racing lane) */}
      <group ref={checkpointGateRef} position={[0, getTerrainHeight(0, 52), 52]}>
        {[-11.45, 11.45].map((px) => (
          <group key={px} position={[px, 0, 0]}>
            <mesh position={[0, 0.45, 0]} castShadow>
              <cylinderGeometry args={[0.85, 1.05, 0.9, 12]} />
              <meshStandardMaterial color="#f59e0b" metalness={0.88} roughness={0.2} />
            </mesh>
            <mesh position={[0, 5.4, 0]} castShadow>
              <boxGeometry args={[0.92, 9.6, 0.92]} />
              <meshStandardMaterial color="#0f172a" metalness={0.78} roughness={0.22} />
            </mesh>
            <mesh position={[px > 0 ? -0.48 : 0.48, 5.4, 0]}>
              <boxGeometry args={[0.12, 9.0, 0.36]} />
              <meshStandardMaterial color="#22d3ee" emissive="#06b6d4" emissiveIntensity={2.2} />
            </mesh>
            <mesh position={[0, 10.3, 0]}>
              <boxGeometry args={[1.25, 0.55, 1.25]} />
              <meshStandardMaterial color="#fbbf24" emissive="#f59e0b" emissiveIntensity={0.8} metalness={0.85} roughness={0.18} />
            </mesh>
          </group>
        ))}
        {/* Wide-Span Overhead Carbon & Gold Gantry Arch (35.8m clear span) */}
        <mesh position={[0, 10.45, 0]} castShadow>
          <boxGeometry args={[23.7, 0.65, 0.76]} />
          <meshStandardMaterial color="#1e293b" metalness={0.82} roughness={0.2} />
        </mesh>
        <mesh position={[0, 10.45, 0]}>
          <boxGeometry args={[22.4, 0.26, 0.82]} />
          <meshStandardMaterial color="#22d3ee" emissive="#06b6d4" emissiveIntensity={2.4} />
        </mesh>
        <mesh position={[0, 10.98, 0]}>
          <boxGeometry args={[21.6, 0.2, 0.65]} />
          <meshStandardMaterial color="#fde047" emissive="#f59e0b" emissiveIntensity={1.8} />
        </mesh>
        <mesh position={[0, 9.4, 0]}>
          <planeGeometry args={[22.4, 0.6]} />
          <meshBasicMaterial color="#22d3ee" transparent opacity={0.18} side={THREE.DoubleSide} depthWrite={false} />
        </mesh>
        <mesh ref={gatePulseRef} position={[0, 0.14, 0]} rotation={[-Math.PI / 2, 0, 0]}>
          <ringGeometry args={[8.5, 10.2, 36]} />
          <meshBasicMaterial color="#22d3ee" transparent opacity={0.42} side={THREE.DoubleSide} depthWrite={false} />
        </mesh>
        <group ref={chevronRef} position={[0, 12.6, 0]}>
          <mesh rotation={[Math.PI, 0, 0]}>
            <coneGeometry args={[1.35, 2.2, 4]} />
            <meshStandardMaterial color="#fde047" emissive="#f59e0b" emissiveIntensity={2.2} metalness={0.7} roughness={0.15} />
          </mesh>
          <mesh position={[0, 1.45, 0]} rotation={[Math.PI / 2, 0, 0]}>
            <torusGeometry args={[1.6, 0.12, 8, 24]} />
            <meshStandardMaterial color="#22d3ee" emissive="#06b6d4" emissiveIntensity={2.4} />
          </mesh>
        </group>
        <mesh position={[0, 48, 0]}>
          <cylinderGeometry args={[0.18, 0.45, 76, 8]} />
          <meshBasicMaterial color="#22d3ee" transparent opacity={0.16} depthWrite={false} />
        </mesh>
      </group>

      {/* Roadside and airport service bays */}
      <group ref={repairBaysRef}>
        {REPAIR_BAY_COORDS.map(([rx, rz], bIdx) => {
          const ry = getTerrainHeight(rx, rz);
          const isAirfield = rx < -150 && rz > 135;
          // Align E-W cross-street bays (|rx| > 30) along X axis, N-S avenue bays along Z axis
          const rotY = Math.abs(rx) > 30 ? Math.PI / 2 : 0;
          return (
            <group key={`repair-bay-${bIdx}`} position={[rx, ry, rz]} rotation={[0, rotY, 0]}>
              {/* Glowing Emerald Ground Target Ring */}
              <mesh
                name="repair-ring"
                position={[0, 0.14, 0]}
                rotation={[-Math.PI / 2, 0, 0]}
              >
                <ringGeometry args={[3.4, 4.1, 32]} />
                <meshBasicMaterial
                  color="#10b981"
                  transparent
                  opacity={0.72}
                  side={THREE.DoubleSide}
                  depthWrite={false}
                />
              </mesh>
              <mesh position={[0, 0.12, 0]} rotation={[-Math.PI / 2, 0, 0]}>
                <circleGeometry args={[3.35, 32]} />
                <meshBasicMaterial
                  color="#10b981"
                  transparent
                  opacity={0.14}
                  side={THREE.DoubleSide}
                  depthWrite={false}
                />
              </mesh>

              {isAirfield ? (
                <>
                  {[-5.3, 5.3].flatMap((x) => [-5.3, 5.3].map((z) => (
                    <mesh key={x + '/' + z} position={[x, 0.11, z]}>
                      <cylinderGeometry args={[0.18, 0.31, 0.23, 10]} />
                      <meshStandardMaterial color="#bbf7d0" emissive="#34d399" emissiveIntensity={1.7} />
                    </mesh>
                  )))}
                </>
              ) : (
                <>
                  {/* Two Slim Dark-Steel Side Pylons & Street Bollards (x = ±4.2, outside lane) */}
                  {[-4.2, 4.2].map((px) => (
                    <group key={`pylon-${px}`} position={[px, 0, 0]}>
                      {/* Concrete & Steel Plinth */}
                      <mesh position={[0, 0.28, 0]} castShadow receiveShadow>
                        <boxGeometry args={[0.72, 0.56, 0.92]} />
                        <meshStandardMaterial color="#1e293b" metalness={0.72} roughness={0.32} />
                      </mesh>
                      {/* Slim Dark-Steel Upright Pylon */}
                      <mesh position={[0, 2.25, 0]} castShadow>
                        <boxGeometry args={[0.34, 4.3, 0.42]} />
                        <meshStandardMaterial color="#0f172a" metalness={0.84} roughness={0.22} />
                      </mesh>
                      {/* Vertical Emerald Accent Strip */}
                      <mesh position={[px > 0 ? -0.19 : 0.19, 2.25, 0]}>
                        <boxGeometry args={[0.06, 3.6, 0.16]} />
                        <meshStandardMaterial
                          color="#34d399"
                          emissive="#10b981"
                          emissiveIntensity={2.0}
                        />
                      </mesh>
                      {/* Protective Roadside Steel Bollards flanking each pylon */}
                      {[-1.5, 1.5].map((bz) => (
                        <group key={`bollard-${bz}`} position={[0, 0, bz]}>
                          <mesh position={[0, 0.48, 0]} castShadow>
                            <cylinderGeometry args={[0.11, 0.13, 0.96, 10]} />
                            <meshStandardMaterial color="#1e293b" metalness={0.82} roughness={0.28} />
                          </mesh>
                          <mesh position={[0, 0.78, 0]}>
                            <cylinderGeometry args={[0.125, 0.125, 0.14, 10]} />
                            <meshStandardMaterial
                              color="#34d399"
                              emissive="#10b981"
                              emissiveIntensity={1.6}
                            />
                          </mesh>
                        </group>
                      ))}
                    </group>
                  ))}

                  {/* Overhead Dark-Steel Gantry Crossbar & Illuminated Emerald Service Light Bar (y = 4.2m) */}
                  <mesh position={[0, 4.42, 0]} castShadow>
                    <boxGeometry args={[8.9, 0.32, 0.48]} />
                    <meshStandardMaterial color="#0f172a" metalness={0.85} roughness={0.2} />
                  </mesh>
                  <mesh position={[0, 4.2, 0]}>
                    <boxGeometry args={[8.1, 0.16, 0.36]} />
                    <meshStandardMaterial
                      color="#34d399"
                      emissive="#34d399"
                      emissiveIntensity={2.4}
                      roughness={0.18}
                    />
                  </mesh>

                </>
              )}
              {/* Rotating Floating Emerald Cross / Repair Beacon */}
              <group name="repair-beacon" position={isAirfield ? [0, 2.25, -6.6] : [0, 5.45, 0]}>
                <mesh>
                  <boxGeometry args={[1.35, 0.34, 0.34]} />
                  <meshStandardMaterial
                    color="#34d399"
                    emissive="#10b981"
                    emissiveIntensity={2.2}
                    roughness={0.15}
                    metalness={0.35}
                  />
                </mesh>
                <mesh>
                  <boxGeometry args={[0.34, 1.35, 0.34]} />
                  <meshStandardMaterial
                    color="#34d399"
                    emissive="#10b981"
                    emissiveIntensity={2.2}
                    roughness={0.15}
                    metalness={0.35}
                  />
                </mesh>
                <mesh rotation={[Math.PI / 2, 0, 0]}>
                  <torusGeometry args={[1.05, 0.07, 8, 24]} />
                  <meshStandardMaterial
                    color="#6ee7b7"
                    emissive="#10b981"
                    emissiveIntensity={2.0}
                  />
                </mesh>
              </group>
            </group>
          );
        })}
      </group>

      {/* Curbside Shoulder Stunt Launch Ramp (Relocated to [14.5, rampY + 0.1, 115] so main 4 lanes are wide open) */}
      <group position={[14.5, rampY + 0.1, 115]} rotation={[-0.28, 0, 0]}>
        <mesh receiveShadow castShadow>
          <boxGeometry args={[5.2, 0.4, 9.5]} />
          <meshStandardMaterial color="#1e293b" metalness={0.7} roughness={0.25} />
        </mesh>
        <mesh position={[0, 0.22, 0]}>
          <boxGeometry args={[4.4, 0.06, 8.6]} />
          <meshStandardMaterial color="#22d3ee" emissive="#06b6d4" emissiveIntensity={1.2} />
        </mesh>
      </group>

      {/* Central Park West Fountain Plaza (Relocated off-street to [-52, parkY + 0.12, 42]) */}
      <group position={[-52, parkY + 0.12, 42]}>
        {/* Lush Emerald Urban Park Lawn Pad & Limestone Perimeter Walk */}
        <mesh position={[0, -0.06, 0]} rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
          <planeGeometry args={[38, 38]} />
          <meshStandardMaterial color="#15803d" roughness={0.88} />
        </mesh>
        <mesh rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
          <ringGeometry args={[13.2, 16.4, 48]} />
          <meshStandardMaterial
            map={limestoneTex}
            normalMap={limestoneNormal}
            bumpMap={limestoneTex}
            bumpScale={0.14}
            roughness={0.56}
          />
        </mesh>
        <mesh rotation={[-Math.PI / 2, 0, 0]}>
          <circleGeometry args={[13.2, 48]} />
          <meshPhysicalMaterial color="#0369a1" roughness={0.08} metalness={0.35} clearcoat={1.0} />
        </mesh>
        <mesh position={[0, 0.04, 0]} rotation={[-Math.PI / 2, 0, 0]}>
          <ringGeometry args={[4.4, 11.4, 48]} />
          <meshBasicMaterial color="#38bdf8" transparent opacity={0.22} depthWrite={false} />
        </mesh>
        <mesh position={[0, 0.05, 0]} rotation={[-Math.PI / 2, 0, 0]}>
          <ringGeometry args={[5.2, 6.2, 48]} />
          <meshBasicMaterial color="#fde68a" transparent opacity={0.38} depthWrite={false} />
        </mesh>
        <mesh position={[0, 0.05, 0]} rotation={[-Math.PI / 2, 0, 0]}>
          <ringGeometry args={[9.4, 10.2, 48]} />
          <meshBasicMaterial color="#fbbf24" transparent opacity={0.28} depthWrite={false} />
        </mesh>
        <mesh position={[0, 0.65, 0]} castShadow receiveShadow>
          <cylinderGeometry args={[3.4, 4.2, 1.3, 24]} />
          <meshStandardMaterial
            map={limestoneTex}
            normalMap={limestoneNormal}
            bumpMap={limestoneTex}
            bumpScale={0.12}
            roughness={0.48}
          />
        </mesh>
        {/* Vertical Choreographed Plumes */}
        <group ref={fountainRef}>
          {Array.from({ length: 12 }).map((_, i) => {
            const ang = (i / 12) * Math.PI * 2;
            const r = i % 2 === 0 ? 7.8 : 4.8;
            return (
              <mesh key={i} position={[Math.cos(ang) * r, 1.8, Math.sin(ang) * r]}>
                <cylinderGeometry args={[0.11, 0.38, 3.0, 8]} />
                <meshStandardMaterial
                  color="#e0f2fe"
                  emissive="#7dd3fc"
                  emissiveIntensity={0.42}
                  transparent
                  opacity={0.55}
                  roughness={0.1}
                />
              </mesh>
            );
          })}
        </group>
        {/* Curved Water Arc Jets */}
        <group ref={arcJetsRef}>
          {Array.from({ length: 12 }).map((_, i) => {
            const ang = (i / 12) * Math.PI * 2 + Math.PI / 12;
            const r = 7.2;
            return (
              <group key={i} position={[Math.cos(ang) * r, 0.4, Math.sin(ang) * r]} rotation={[0, -ang, 0]}>
                <mesh rotation={[0, 0, 0.08]}>
                  <torusGeometry args={[2.7, 0.085, 6, 16, Math.PI * 0.88]} />
                  <meshStandardMaterial
                    color="#f0f9ff"
                    emissive="#bae6fd"
                    emissiveIntensity={0.5}
                    transparent
                    opacity={0.62}
                    roughness={0.12}
                  />
                </mesh>
              </group>
            );
          })}
        </group>
        {/* Misty Spray Halo */}
        <mesh ref={mistRef} position={[0, 2.2, 0]} rotation={[Math.PI / 2, 0, 0]}>
          <torusGeometry args={[6.4, 1.15, 8, 28]} />
          <meshBasicMaterial color="#e0f2fe" transparent opacity={0.14} depthWrite={false} />
        </mesh>
      </group>

      {/* 2 Giant 7-Deck Luxury Mega-Cruise Ships: MS AZUREA ODYSSEY & MS SOLARIS ROYAL in Deep Ocean Water */}
      <LuxuryCruiseShip
        position={[276, 0.2, -62]}
        rotationY={-0.55}
        scale={1.08}
        name="MS AZUREA ODYSSEY"
        cruising={true}
        phaseOffset={0}
      />
      <LuxuryCruiseShip
        position={[-282, 0.2, -85]}
        rotationY={2.45}
        scale={1.04}
        name="MS SOLARIS ROYAL"
        cruising={true}
        phaseOffset={2.4}
      />

      {/* Offshore Yacht & Tall Ship Marina Fleet Moored in the Deep Venetian Bay & Ocean Channel */}
      <group ref={marinaGroupRef}>
        {sloopYachtModel && (
          <group position={[204, 0.35, -91]} rotation={[0, -0.65, 0]}>
            <primitive object={sloopYachtModel} scale={1.15} />
          </group>
        )}
        {galleonShipModel && (
          <group position={[252, 0.45, -104]} rotation={[0, -2.15, 0]}>
            <primitive object={galleonShipModel} scale={0.68} />
          </group>
        )}
        {caiqueBoatModel && (
          <group position={[182, 0.35, -98]} rotation={[0, 0.85, 0]}>
            <primitive object={caiqueBoatModel} scale={1.32} />
          </group>
        )}
      </group>
    </group>
  );
}

export function InstancedFoliage() {
  const trunkRef = useRef<THREE.InstancedMesh>(null);
  const frondRefs = [
    useRef<THREE.InstancedMesh>(null),
    useRef<THREE.InstancedMesh>(null),
    useRef<THREE.InstancedMesh>(null),
    useRef<THREE.InstancedMesh>(null),
    useRef<THREE.InstancedMesh>(null),
    useRef<THREE.InstancedMesh>(null),
  ];

  const boulderRef = useRef<THREE.InstancedMesh>(null);
  const { map: barkMap, normalMap: barkNormal } = useMemo(() => createBarkPBR(), []);

  // Organic fractured coastal boulder geometry
  const boulderGeo = useMemo(() => {
    const geo = new THREE.DodecahedronGeometry(1, 1);
    const pos = geo.attributes.position;
    for (let i = 0; i < pos.count; i++) {
      const vx = pos.getX(i);
      const vy = pos.getY(i);
      const vz = pos.getZ(i);
      const n = 0.84 + 0.32 * Math.sin(vx * 3.7 + vy * 2.3 + vz * 4.1);
      pos.setXYZ(i, vx * n, vy * (vy < 0 ? 0.65 * n : n), vz * n);
    }
    geo.computeVertexNormals();
    return geo;
  }, []);

  // Arched sculpted palm frond blade
  const frondGeo = useMemo(() => {
    const shape = new THREE.Shape();
    shape.moveTo(0, 0);
    shape.quadraticCurveTo(0.42, 1.6, 0.36, 3.3);
    shape.quadraticCurveTo(0.18, 4.4, 0, 5.1);
    shape.quadraticCurveTo(-0.18, 4.4, -0.36, 3.3);
    shape.quadraticCurveTo(-0.42, 1.6, 0, 0);
    const geo = new THREE.ExtrudeGeometry(shape, { depth: 0.06, bevelEnabled: false, curveSegments: 8 });
    geo.rotateX(Math.PI / 2);
    const pos = geo.attributes.position;
    for (let i = 0; i < pos.count; i++) {
      const z = pos.getZ(i);
      pos.setY(i, pos.getY(i) - 0.055 * z * z);
    }
    geo.computeVertexNormals();
    return geo;
  }, []);

  const { palmTransforms, boulderTransforms, boulderColors } = useMemo(() => {
    const palms: THREE.Matrix4[] = [];
    const dummy = new THREE.Object3D();

    for (let i = 0; i < 220; i++) {
      const angle = (i * 137.5 * Math.PI) / 180;
      const radius = i < 168 ? 58 + ((i * 29) % 185) :
        coastRoadRadius(Math.PI / 2 - angle) + 13.5 + (i * 7 % 11);
      const x = Math.cos(angle) * radius;
      const z = Math.sin(angle) * radius;
      const y = getTerrainHeight(x, z);
      const onCrossRoad = Math.abs(z + 120) < 18 || Math.abs(z) < 20 || Math.abs(z - 80) < 18;
      // Strictly filter out any palm within 38m of ANY landmark in LANDMARKS or inside city buildings
      const nearLandmark = LANDMARKS.some((lm) => Math.hypot(x - lm.position[0], z - lm.position[2]) < 38);
      const nearBuilding = cityPlots.some((b) => Math.hypot(x - b.x, z - b.z) < 14);
      if (
        y > 0.7 &&
        y < 8.5 &&
        Math.abs(x) > 32 &&
        !onCrossRoad &&
        Math.abs(coastRoadOffset(x, z)) > 13 &&
        !nearLandmark &&
        !nearBuilding &&
        !(x > -215 && x < -40 && z > 130 && z < 180)
      ) {
        const s = 0.9 + (i % 5) * 0.14;
        dummy.position.set(x, y + 3.5 * s, z);
        dummy.rotation.set(0.05, (i * 0.7) % Math.PI, 0.03);
        dummy.scale.set(s, s, s);
        dummy.updateMatrix();
        palms.push(dummy.matrix.clone());
      }
    }

    // Coastal boulders scattered naturally along the shoreline (0.2 <= y <= 2.5)
    const boulders: THREE.Matrix4[] = [];
    const bColors: THREE.Color[] = [];
    const rockPalette = [
      new THREE.Color('#b6aea0'),
      new THREE.Color('#9e9689'),
      new THREE.Color('#565b63'),
      new THREE.Color('#6b7078'),
    ];
    for (let i = 0; i < 360; i++) {
      const angle = (i * 137.508 * Math.PI) / 180;
      const radius = 185 + ((i * 37) % 85);
      const x = Math.cos(angle) * radius;
      const z = Math.sin(angle) * radius;
      const y = getTerrainHeight(x, z);
      const nearStrip = Math.abs(x) < 34;
      const nearCross = Math.abs(z + 120) < 18 || Math.abs(z) < 20 || Math.abs(z - 80) < 18;
      const nearRunway = x > -218 && x < -38 && z > 128 && z < 182;
      const nearCanal = x > 60 && Math.abs(z + 95) < 30;
      if (y >= 0.2 && y <= 2.5 && !nearStrip && !nearCross && !nearRunway && !nearCanal && Math.abs(coastRoadOffset(x, z)) > 13) {
        const sx = 1.05 + ((i * 13) % 17) * 0.12;
        const sy = 0.55 + ((i * 7) % 11) * 0.08;
        const sz = 0.95 + ((i * 19) % 15) * 0.11;
        dummy.position.set(x, y + sy * 0.32, z);
        dummy.rotation.set(((i % 5) - 2) * 0.12, (i * 1.13) % (Math.PI * 2), ((i % 3) - 1) * 0.1);
        dummy.scale.set(sx, sy, sz);
        dummy.updateMatrix();
        boulders.push(dummy.matrix.clone());
        bColors.push(rockPalette[i % rockPalette.length]);
      }
    }

    return { palmTransforms: palms, boulderTransforms: boulders, boulderColors: bColors };
  }, []);

  React.useLayoutEffect(() => {
    const dummy = new THREE.Object3D();
    const unregister: (() => void)[] = [];
    if (trunkRef.current) {
      const pos = new THREE.Vector3();
      const quat = new THREE.Quaternion();
      const scl = new THREE.Vector3();
      palmTransforms.forEach((mat, i) => {
        trunkRef.current!.setMatrixAt(i, mat);
        mat.decompose(pos, quat, scl);
        const crowns: THREE.Matrix4[] = [];
        frondRefs.forEach((fRef, fIdx) => {
          if (!fRef.current) return;
          const yaw = (fIdx / 6) * Math.PI * 2 + (i % 3) * 0.5;
          dummy.position.set(pos.x, pos.y + 3.4 * scl.y, pos.z);
          dummy.rotation.set(-0.22, yaw, 0);
          dummy.scale.set(scl.x, scl.y, scl.z);
          dummy.updateMatrix();
          fRef.current.setMatrixAt(i, dummy.matrix);
          crowns[fIdx] = dummy.matrix.clone();
        });
        const pivot = new THREE.Vector3(pos.x, pos.y - 3.5 * scl.y, pos.z);
        const treePos = pos.clone();
        unregister.push(registerWorldSection({
          owner: 'Coastal palm ' + i, label: 'Palm tree', material: 'wood', center: treePos,
          halfSize: new THREE.Vector3(0.49 * scl.x, 3.5 * scl.y, 0.49 * scl.z), hp: 95, maxHp: 95,
          onDamage: (integrity, destroyed) => {
            const tilt = new THREE.Matrix4().makeRotationZ(destroyed ? 1.35 : 0.22 * (1 - integrity));
            tilt.setPosition(pivot.clone().sub(pivot.clone().applyMatrix4(tilt)));
            const trunk = trunkRef.current;
            if (trunk) {
              trunk.setMatrixAt(i, tilt.clone().multiply(mat));
              trunk.instanceMatrix.needsUpdate = true;
            }
            frondRefs.forEach(({ current }, index) => {
              if (!current || !crowns[index]) return;
              current.setMatrixAt(i, tilt.clone().multiply(crowns[index]));
              current.instanceMatrix.needsUpdate = true;
            });
          },
        }));
      });
      trunkRef.current.instanceMatrix.needsUpdate = true;
      frondRefs.forEach((fRef) => {
        if (fRef.current) fRef.current.instanceMatrix.needsUpdate = true;
      });
    }

    if (boulderRef.current) {
      boulderTransforms.forEach((mat, i) => {
        boulderRef.current!.setMatrixAt(i, mat);
        boulderRef.current!.setColorAt(i, boulderColors[i]);
        mat.decompose(dummy.position, dummy.quaternion, dummy.scale);
        unregister.push(registerWorldSection({
          owner: 'Coastal rock ' + i, label: 'Coastal rock', material: 'masonry',
          center: dummy.position.clone(), rotation: dummy.quaternion.clone(), halfSize: dummy.scale.clone().multiplyScalar(0.83),
          hp: 125, maxHp: 125,
          onDamage: (integrity, destroyed) => {
            const rocks = boulderRef.current;
            if (!rocks) return;
            if (destroyed) {
              rocks.setMatrixAt(i, mat.clone().scale(new THREE.Vector3(0, 0, 0)));
              rocks.instanceMatrix.needsUpdate = true;
            } else {
              rocks.setColorAt(i, boulderColors[i].clone().multiplyScalar(0.45 + integrity * 0.55));
              if (rocks.instanceColor) rocks.instanceColor.needsUpdate = true;
            }
          },
        }));
      });
      boulderRef.current.instanceMatrix.needsUpdate = true;
      if (boulderRef.current.instanceColor) boulderRef.current.instanceColor.needsUpdate = true;
    }
    return () => unregister.forEach((remove) => remove());
  }, [palmTransforms, boulderTransforms, boulderColors]);

  return (
    <group>
      <instancedMesh ref={trunkRef} args={[undefined, undefined, palmTransforms.length]} castShadow>
        <cylinderGeometry args={[0.24, 0.52, 7.0, 8]} />
        <meshStandardMaterial
          map={barkMap}
          normalMap={barkNormal}
          bumpMap={barkMap}
          bumpScale={0.22}
          color="#a87c56"
          roughness={0.88}
        />
      </instancedMesh>
      {frondRefs.map((fRef, idx) => (
        <instancedMesh key={idx} ref={fRef} args={[frondGeo, undefined, palmTransforms.length]} castShadow>
          <meshStandardMaterial color={idx % 2 === 0 ? '#3f6212' : '#4d7c0f'} roughness={0.58} side={THREE.DoubleSide} />
        </instancedMesh>
      ))}
      <instancedMesh ref={boulderRef} args={[boulderGeo, undefined, boulderTransforms.length]} castShadow receiveShadow>
        <meshStandardMaterial roughness={0.88} metalness={0.04} />
      </instancedMesh>

    </group>
  );
}

export function ChipCollectibles() {
  const groupRef = useRef<THREE.Group>(null);
  useFrame((state) => {
    const t = state.clock.elapsedTime;
    if (!groupRef.current) return;
    groupRef.current.children.forEach((child, idx) => {
      const node = simState.chipNodes[idx];
      if (!node) return;
      child.visible = !node.collected;
      if (!node.collected) {
        child.rotation.y = t * 1.8 + idx;
        if (!node.isAerial) {
          child.position.y = node.position[1] + Math.sin(t * 2.5 + idx) * 0.35;
        }
      }
    });
  });

  return (
    <group ref={groupRef}>
      {simState.chipNodes.map((c) => (
        <mesh key={c.id} position={c.position}>
          {c.isAerial ? <torusGeometry args={[6.2, 0.42, 8, 28]} /> : <cylinderGeometry args={[1.1, 1.1, 0.32, 16]} />}
          <meshStandardMaterial
            color={c.isAerial ? '#22d3ee' : '#fbbf24'}
            emissive={c.isAerial ? '#06b6d4' : '#f59e0b'}
            emissiveIntensity={1.4}
            metalness={0.6}
            roughness={0.2}
          />
        </mesh>
      ))}
    </group>
  );
}

export function LandmarkBeacons() {
  return (
    <group>
      {LANDMARKS.map((lm) => (
        <mesh key={lm.id} position={[lm.position[0], 115, lm.position[2]]}>
          <cylinderGeometry args={[0.35, 0.35, 220, 8]} />
          <meshBasicMaterial color={lm.color} transparent opacity={0.12} depthWrite={false} />
        </mesh>
      ))}
    </group>
  );
}
