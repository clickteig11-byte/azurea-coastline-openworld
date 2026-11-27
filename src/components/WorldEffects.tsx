import React, { useEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import { useFrame } from '@react-three/fiber';
import { simState } from '../game/store';
import { environmentEffects, worldImpacts, type WorldSection } from '../game/worldDamage';
import { getTerrainHeight, getTravelHeight } from '../game/worldMath';
import { LOBBY_THEMES, resolveActiveThemeId } from '../game/lobbyThemes';

const poolSize = 900;
const scarCount = 68;
const shardCount = 112;
const matrix = new THREE.Object3D();
const shardShape = new THREE.DodecahedronGeometry(1, 0);
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
    const reach = 21 + ((i * 17) % 34);
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

// ==================== WORLD FANFARE SHADERS ====================

const fireworkVertexShader = /* glsl */ `
  attribute vec3 aColor;
  attribute float aSize;
  attribute float aAlpha;
  attribute float aTwinkle;
  uniform float uTime;
  varying vec3 vColor;
  varying float vAlpha;
  varying float vTwinkle;
  void main() {
    vec4 mvPos = modelViewMatrix * vec4(position, 1.0);
    gl_Position = projectionMatrix * mvPos;
    float twinkle = 0.72 + 0.28 * sin(uTime * 19.0 + aTwinkle * 41.0);
    gl_PointSize = aAlpha < 0.01 || mvPos.z > -0.5 ? 0.0 : clamp((aSize * twinkle * 780.0) / -mvPos.z, 1.5, 42.0);
    vColor = aColor;
    vAlpha = aAlpha * twinkle;
    vTwinkle = aTwinkle;
  }
`;

const fireworkFragmentShader = /* glsl */ `
  varying vec3 vColor;
  varying float vAlpha;
  void main() {
    vec2 p = gl_PointCoord * 2.0 - 1.0;
    float r = length(p);
    if (r > 1.0) discard;
    float core = exp(-r * r * 6.5);
    float flare = exp(-abs(p.x) * 7.0) * exp(-abs(p.y) * 2.4) + exp(-abs(p.y) * 7.0) * exp(-abs(p.x) * 2.4);
    float glow = core + flare * 0.35 * (1.0 - r);
    vec3 col = mix(vColor, vec3(1.0, 0.99, 0.94), core * 0.68);
    gl_FragColor = vec4(col, clamp(glow * vAlpha, 0.0, 1.0));
  }
`;

const searchlightVertexShader = /* glsl */ `
  varying vec2 vUv;
  varying vec3 vNormalDir;
  varying vec3 vViewDir;
  void main() {
    vUv = uv;
    vec4 wp = modelMatrix * vec4(position, 1.0);
    vNormalDir = normalize(mat3(modelMatrix) * normal);
    vViewDir = normalize(cameraPosition - wp.xyz);
    gl_Position = projectionMatrix * viewMatrix * wp;
  }
`;

const searchlightFragmentShader = /* glsl */ `
  uniform vec3 uColor;
  uniform float uIntensity;
  uniform float uTime;
  varying vec2 vUv;
  varying vec3 vNormalDir;
  varying vec3 vViewDir;
  void main() {
    // Cone UV.y = 0 at base (ground pedestal), 1 at sky tip
    float along = clamp(vUv.y, 0.0, 1.0);
    float lengthFade = pow(1.0 - along, 1.65) * smoothstep(0.0, 0.06, along);
    float edgeSoft = pow(abs(dot(normalize(vNormalDir), normalize(vViewDir))), 1.55);
    float shimmer = 0.92 + 0.08 * sin(uTime * 2.4 + along * 8.0);
    float alpha = lengthFade * edgeSoft * uIntensity * shimmer;
    gl_FragColor = vec4(uColor, alpha);
  }
`;

const airMoteVertexShader = /* glsl */ `
  attribute float aPhase;
  attribute float aScale;
  uniform float uTime;
  uniform vec3 uAnchor;
  varying float vAlpha;
  void main() {
    vec3 local = position;
    local.x += sin(uTime * 0.45 + aPhase * 6.283) * 2.4;
    local.y += cos(uTime * 0.35 + aPhase * 9.42) * 1.4;
    local.z += sin(uTime * 0.40 + aPhase * 12.56) * 2.4;
    // Wrap seamlessly inside a 96x34x96 volume around the camera
    vec3 wrapped = mod(local - uAnchor + vec3(48.0, 12.0, 48.0), vec3(96.0, 34.0, 96.0)) - vec3(48.0, 12.0, 48.0) + uAnchor;
    wrapped.y = max(wrapped.y, 2.2);
    vec4 mvPos = modelViewMatrix * vec4(wrapped, 1.0);
    gl_Position = projectionMatrix * mvPos;
    float dist = length(mvPos.xyz);
    float distFade = smoothstep(2.0, 10.0, dist) * (1.0 - smoothstep(32.0, 56.0, dist));
    float pulse = 0.52 + 0.48 * sin(uTime * 1.8 + aPhase * 21.0);
    vAlpha = distFade * pulse;
    gl_PointSize = clamp((aScale * 180.0) / max(-mvPos.z, 1.0), 1.0, 6.5);
  }
`;

const airMoteFragmentShader = /* glsl */ `
  uniform vec3 uColor;
  uniform float uOpacity;
  varying float vAlpha;
  void main() {
    vec2 p = gl_PointCoord * 2.0 - 1.0;
    float r = length(p);
    if (r > 1.0) discard;
    float soft = pow(1.0 - r, 2.2);
    gl_FragColor = vec4(uColor, soft * vAlpha * uOpacity);
  }
`;

const seabirdVertexShader = /* glsl */ `
  attribute float aPhase;
  uniform float uTime;
  varying float vShade;
  void main() {
    vec3 pos = position;
    // Smooth alternating flap-and-glide wing cycle based on distance from fuselage centerline (|pos.x|)
    float wingSpan = abs(pos.x);
    float cycle = uTime * 0.72 + aPhase * 6.2831;
    float glideFactor = smoothstep(-0.25, 0.45, sin(cycle));
    float flap = sin(uTime * 8.2 + aPhase * 19.0 - wingSpan * 0.9) * (0.18 + 0.82 * glideFactor);
    pos.y += wingSpan * wingSpan * 0.42 * flap;
    pos.z += wingSpan * 0.08 * flap;
    vShade = 0.74 + 0.26 * clamp(pos.y * 0.5 + 0.5, 0.0, 1.0);
    vec4 wp = modelMatrix * instanceMatrix * vec4(pos, 1.0);
    gl_Position = projectionMatrix * viewMatrix * wp;
  }
`;

const seabirdFragmentShader = /* glsl */ `
  uniform vec3 uTint;
  varying float vShade;
  void main() {
    gl_FragColor = vec4(uTint * vShade, 1.0);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }
`;

// ==================== WORLD FANFARE COMPONENT ====================

const FIREWORK_POOL = 640;
const FIREWORK_PALETTES: [string, string][] = [
  ['#fbbf24', '#38bdf8'], // Riviera Gold & Azure
  ['#f43f5e', '#fde047'], // Premiere Magenta & Champagne
  ['#22d3ee', '#a855f7'], // Electric Cyan & Royal Violet
  ['#fb923c', '#f8fafc'], // Sunset Coral & Pearl White
  ['#34d399', '#fcd34d'], // Emerald & Gold
  ['#ec4899', '#67e8f9'], // Wonder Pier Pink & Ice Blue
];

const FIREWORK_SITES: [number, number, number][] = [
  [58, 4.5, -585],   // Wonder Pier East Bay
  [-62, 4.5, -610],  // Wonder Pier West Bay
  [74, 4.5, -295],   // North Bay East Channel
  [-76, 4.5, -310],  // North Bay West Channel
  [355, 4.5, -95],   // Venice Harbor Seaward Mouth
  [28, 4.5, 315],    // South Riviera Bay
];

const SEARCHLIGHT_SITES: { x: number; z: number; colorA: string; colorB: string; phase: number }[] = [
  { x: -24, z: -18, colorA: '#fef08a', colorB: '#7dd3fc', phase: 0.0 },
  { x: 24, z: 18, colorA: '#bae6fd', colorB: '#fde68a', phase: 1.4 },
  { x: -52, z: -28, colorA: '#fde68a', colorB: '#93c5fd', phase: 2.6 },
  { x: 95, z: 35, colorA: '#fbcfe8', colorB: '#fef08a', phase: 3.9 },
  { x: 0, z: -206, colorA: '#7dd3fc', colorB: '#fde68a', phase: 5.1 },
  { x: 0, z: -518, colorA: '#f9a8d4', colorB: '#67e8f9', phase: 0.8 },
];

interface FireworkRocket {
  pos: THREE.Vector3;
  vel: THREE.Vector3;
  burstY: number;
  paletteIdx: number;
  trailTimer: number;
}

interface FireworkSpark {
  pos: THREE.Vector3;
  vel: THREE.Vector3;
  age: number;
  life: number;
  size: number;
  drag: number;
  gravity: number;
}

interface FountainSource {
  x: number;
  y: number;
  z: number;
  count: number;
  ringRadius: number;
  heightMin: number;
  heightMax: number;
  spread: number;
  phaseOffset: number;
}

interface PennantSpec {
  basePos: THREE.Vector3;
  yaw: number;
  pitch: number;
  phase: number;
  color: THREE.Color;
}

function createSeabirdGeometry(): THREE.BufferGeometry {
  // Sleek low-poly coastal gull: central fuselage + swept cambered left & right wings
  const positions = new Float32Array([
    // Left inner wing
    0.0, 0.04, 0.42,
    -0.82, 0.14, 0.08,
    0.0, 0.0, -0.46,
    // Left outer wing tip
    -0.82, 0.14, 0.08,
    -1.58, 0.06, -0.28,
    -0.52, 0.04, -0.26,
    // Left trailing bridge
    0.0, 0.0, -0.46,
    -0.82, 0.14, 0.08,
    -0.52, 0.04, -0.26,
    // Right inner wing
    0.0, 0.04, 0.42,
    0.0, 0.0, -0.46,
    0.82, 0.14, 0.08,
    // Right outer wing tip
    0.82, 0.14, 0.08,
    0.52, 0.04, -0.26,
    1.58, 0.06, -0.28,
    // Right trailing bridge
    0.0, 0.0, -0.46,
    0.52, 0.04, -0.26,
    0.82, 0.14, 0.08,
    // Tail fan
    0.0, 0.0, -0.34,
    -0.22, 0.02, -0.78,
    0.22, 0.02, -0.78,
  ]);
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geo.computeVertexNormals();
  return geo;
}

function createPennantGeometry(): THREE.BufferGeometry {
  // Graceful triangular festive pennant hanging downward from top catenary cord
  const positions = new Float32Array([
    -0.28, 0.0, 0.0,
    0.28, 0.0, 0.0,
    0.0, -0.68, 0.0,
  ]);
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geo.computeVertexNormals();
  return geo;
}

function WorldFanfare() {
  const dummy = useMemo(() => new THREE.Object3D(), []);
  const tmpColor = useMemo(() => new THREE.Color(), []);

  // 1. Harbor Fireworks Particle Pool
  const fw = useMemo(() => {
    const positions = new Float32Array(FIREWORK_POOL * 3);
    const colors = new Float32Array(FIREWORK_POOL * 3);
    const sizes = new Float32Array(FIREWORK_POOL);
    const alphas = new Float32Array(FIREWORK_POOL);
    const twinkles = new Float32Array(FIREWORK_POOL);
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3).setUsage(THREE.DynamicDrawUsage));
    geo.setAttribute('aColor', new THREE.BufferAttribute(colors, 3).setUsage(THREE.DynamicDrawUsage));
    geo.setAttribute('aSize', new THREE.BufferAttribute(sizes, 1).setUsage(THREE.DynamicDrawUsage));
    geo.setAttribute('aAlpha', new THREE.BufferAttribute(alphas, 1).setUsage(THREE.DynamicDrawUsage));
    geo.setAttribute('aTwinkle', new THREE.BufferAttribute(twinkles, 1).setUsage(THREE.DynamicDrawUsage));
    const sparks: FireworkSpark[] = Array.from({ length: FIREWORK_POOL }, () => ({
      pos: new THREE.Vector3(),
      vel: new THREE.Vector3(),
      age: 99,
      life: 1,
      size: 1,
      drag: 0.96,
      gravity: 9.8,
    }));
    return {
      geo,
      positions,
      colors,
      sizes,
      alphas,
      twinkles,
      sparks,
      cursor: 0,
      rockets: [] as FireworkRocket[],
      launchTimer: 0.25,
      siteIdx: 0,
      initialized: false,
    };
  }, []);

  const fwUniforms = useMemo(() => ({ uTime: { value: 0 } }), []);

  // 2. Art-Deco Premiere Searchlight Beams
  const searchlightRefs = useRef<(THREE.Mesh | null)[]>([]);
  const searchlightGeo = useMemo(() => {
    const geo = new THREE.CylinderGeometry(7.2, 0.55, 168, 16, 1, true);
    geo.translate(0, 84, 0);
    return geo;
  }, []);
  const searchlightUniforms = useMemo(
    () =>
      SEARCHLIGHT_SITES.flatMap((site) => [
        { uColor: { value: new THREE.Color(site.colorA) }, uIntensity: { value: 0.14 }, uTime: { value: 0 } },
        { uColor: { value: new THREE.Color(site.colorB) }, uIntensity: { value: 0.14 }, uTime: { value: 0 } },
      ]),
    []
  );
  const searchlightBases = useMemo(
    () => SEARCHLIGHT_SITES.map((s) => ({ ...s, y: Math.max(getTerrainHeight(s.x, s.z), 3.2) + 0.15 })),
    []
  );

  // 3. Celebratory Fountain Jets with Rising/Falling Spray Arcs
  const fountainSources = useMemo<FountainSource[]>(() => {
    const parkY = getTerrainHeight(-52, 42) + 0.55;
    const midWestY = getTerrainHeight(-26, -24) + 0.25;
    const midEastY = getTerrainHeight(26, -24) + 0.25;
    return [
      { x: -52, y: parkY, z: 42, count: 140, ringRadius: 6.8, heightMin: 6.5, heightMax: 13.5, spread: 4.8, phaseOffset: 0.0 },
      { x: -26, y: midWestY, z: -24, count: 48, ringRadius: 2.1, heightMin: 4.6, heightMax: 8.6, spread: 2.6, phaseOffset: 1.2 },
      { x: 26, y: midEastY, z: -24, count: 48, ringRadius: 2.1, heightMin: 4.6, heightMax: 8.6, spread: 2.6, phaseOffset: 2.4 },
      { x: -23, y: 3.95, z: -525, count: 42, ringRadius: 2.2, heightMin: 5.4, heightMax: 9.8, spread: 3.1, phaseOffset: 0.7 },
      { x: 23, y: 3.95, z: -525, count: 42, ringRadius: 2.2, heightMin: 5.4, heightMax: 9.8, spread: 3.1, phaseOffset: 1.9 },
    ];
  }, []);
  const fountainTotal = useMemo(() => fountainSources.reduce((acc, s) => acc + s.count, 0), [fountainSources]);
  const fountainMeshRef = useRef<THREE.InstancedMesh>(null);
  const dropletGeo = useMemo(() => new THREE.SphereGeometry(0.16, 6, 5), []);

  // 4. Festive Harbor Pennant / Ribbon Streams + Slender Masts
  const pennantMeshRef = useRef<THREE.InstancedMesh>(null);
  const poleMeshRef = useRef<THREE.InstancedMesh>(null);
  const pennantGeo = useMemo(createPennantGeometry, []);
  const poleGeo = useMemo(() => {
    const g = new THREE.CylinderGeometry(0.08, 0.12, 6.4, 8);
    g.translate(0, 3.2, 0);
    return g;
  }, []);

  const { pennants, poles } = useMemo(() => {
    const palette = ['#f43f5e', '#fbbf24', '#38bdf8', '#f8fafc', '#22d3ee', '#fb923c'];
    const pList: PennantSpec[] = [];
    const mastList: [number, number, number][] = [];

    const spans: { a: [number, number]; b: [number, number]; yOff?: number; count: number; sag: number }[] = [
      // North Bay Gateway Promenade
      { a: [-18.5, -200], b: [-18.5, -214], count: 16, sag: 1.1 },
      { a: [18.5, -200], b: [18.5, -214], count: 16, sag: 1.1 },
      // Island II Approach Promenade Garlands (clear of Wonder Pier arch at z=-515)
      { a: [-13.5, -492], b: [-13.5, -508], count: 18, sag: 1.1 },
      { a: [13.5, -492], b: [13.5, -508], count: 18, sag: 1.1 },
      // South Riviera Promenade Overlook
      { a: [-26, 224], b: [-44, 226], count: 16, sag: 1.2 },
      { a: [26, 224], b: [44, 226], count: 16, sag: 1.2 },
      // Venice Grand Canal Waterfront Garlands
      { a: [94, -74], b: [122, -74], count: 20, sag: 1.4 },
      { a: [94, -116], b: [122, -116], count: 20, sag: 1.4 },
      // Midtown Central Park Fountain Festoon
      { a: [-68, 28], b: [-36, 28], count: 20, sag: 1.6 },
      { a: [-68, 56], b: [-36, 56], count: 20, sag: 1.6 },
    ];

    spans.forEach((span, sIdx) => {
      const ya = span.yOff ?? Math.max(getTerrainHeight(span.a[0], span.a[1]), 3.1);
      const yb = span.yOff ?? Math.max(getTerrainHeight(span.b[0], span.b[1]), 3.1);
      mastList.push([span.a[0], ya, span.a[1]], [span.b[0], yb, span.b[1]]);
      const dx = span.b[0] - span.a[0];
      const dz = span.b[1] - span.a[1];
      const yaw = Math.atan2(dx, dz) + Math.PI * 0.5;
      for (let i = 1; i <= span.count; i++) {
        const u = i / (span.count + 1);
        const sagY = -4.0 * span.sag * u * (1 - u);
        const px = span.a[0] + dx * u;
        const pz = span.a[1] + dz * u;
        const py = THREE.MathUtils.lerp(ya, yb, u) + 6.1 + sagY;
        pList.push({
          basePos: new THREE.Vector3(px, py, pz),
          yaw,
          pitch: 0.08,
          phase: sIdx * 1.3 + i * 0.42,
          color: new THREE.Color(palette[(i + sIdx) % palette.length]),
        });
      }
    });

    return { pennants: pList, poles: mastList };
  }, []);

  useEffect(() => {
    if (poleMeshRef.current) {
      poles.forEach(([x, y, z], i) => {
        dummy.position.set(x, y, z);
        dummy.rotation.set(0, 0, 0);
        dummy.scale.set(1, 1, 1);
        dummy.updateMatrix();
        poleMeshRef.current!.setMatrixAt(i, dummy.matrix);
      });
      poleMeshRef.current.instanceMatrix.needsUpdate = true;
    }
    if (pennantMeshRef.current) {
      pennants.forEach((p, i) => {
        pennantMeshRef.current!.setColorAt(i, p.color);
      });
      if (pennantMeshRef.current.instanceColor) pennantMeshRef.current.instanceColor.needsUpdate = true;
    }
  }, [poles, pennants, dummy]);

  // 5. Shimmering Coastal Air Motes
  const moteGeo = useMemo(() => {
    const count = 180;
    const pos = new Float32Array(count * 3);
    const phase = new Float32Array(count);
    const scale = new Float32Array(count);
    let seed = 4242;
    const rand = () => {
      seed = (seed * 1664525 + 1013904223) >>> 0;
      return seed / 4294967296;
    };
    for (let i = 0; i < count; i++) {
      pos[i * 3] = (rand() - 0.5) * 96;
      pos[i * 3 + 1] = rand() * 34;
      pos[i * 3 + 2] = (rand() - 0.5) * 96;
      phase[i] = rand();
      scale[i] = 0.55 + rand() * 1.15;
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.setAttribute('aPhase', new THREE.BufferAttribute(phase, 1));
    g.setAttribute('aScale', new THREE.BufferAttribute(scale, 1));
    return g;
  }, []);
  const moteUniforms = useMemo(
    () => ({
      uTime: { value: 0 },
      uAnchor: { value: new THREE.Vector3() },
      uColor: { value: new THREE.Color('#fff5d6') },
      uOpacity: { value: 0.45 },
    }),
    []
  );

  // 6. Soaring Animated Seabird Flocks (36 birds across 3 coastal flocks)
  const birdCount = 36;
  const birdMeshRef = useRef<THREE.InstancedMesh>(null);
  const birdGeo = useMemo(() => {
    const g = createSeabirdGeometry();
    const phases = new Float32Array(birdCount);
    for (let i = 0; i < birdCount; i++) phases[i] = (i * 0.6180339) % 1;
    g.setAttribute('aPhase', new THREE.InstancedBufferAttribute(phases, 1));
    return g;
  }, []);
  const birdUniforms = useMemo(
    () => ({
      uTime: { value: 0 },
      uTint: { value: new THREE.Color('#f8fafc') },
    }),
    []
  );
  const birdFlocks = useMemo(
    () =>
      Array.from({ length: birdCount }, (_, i) => {
        const flockIdx = i % 3;
        const center: [number, number, number] =
          flockIdx === 0
            ? [0, 34, -460]     // North Bay & Wonder Pier flock
            : flockIdx === 1
            ? [210, 38, -95]    // Venice Harbor & East Headland flock
            : [-40, 32, 235];   // South Riviera Beachfront flock
        const subIdx = Math.floor(i / 3);
        return {
          cx: center[0],
          cy: center[1] + (subIdx % 4) * 3.8,
          cz: center[2],
          radiusX: 52 + (subIdx % 5) * 16,
          radiusZ: 44 + ((subIdx * 3) % 5) * 14,
          speed: (flockIdx === 1 ? -1 : 1) * (0.14 + (subIdx % 4) * 0.022),
          angleOffset: (subIdx / 12) * Math.PI * 2 + flockIdx * 1.1,
          scale: 0.65 + (subIdx % 3) * 0.16,
        };
      }),
    []
  );

  useEffect(
    () => () => {
      fw.geo.dispose();
      searchlightGeo.dispose();
      dropletGeo.dispose();
      pennantGeo.dispose();
      poleGeo.dispose();
      moteGeo.dispose();
      birdGeo.dispose();
    },
    [fw.geo, searchlightGeo, dropletGeo, pennantGeo, poleGeo, moteGeo, birdGeo]
  );

  const spawnFwSpark = (
    x: number,
    y: number,
    z: number,
    vx: number,
    vy: number,
    vz: number,
    hex: string,
    life: number,
    size: number,
    drag = 0.96,
    gravity = 8.5
  ) => {
    const idx = fw.cursor++ % FIREWORK_POOL;
    const sp = fw.sparks[idx];
    sp.pos.set(x, y, z);
    sp.vel.set(vx, vy, vz);
    sp.age = 0;
    sp.life = life;
    sp.size = size;
    sp.drag = drag;
    sp.gravity = gravity;
    tmpColor.set(hex).toArray(fw.colors, idx * 3);
    fw.twinkles[idx] = (idx * 0.37) % 1;
  };

  const detonateFirework = (origin: THREE.Vector3, paletteIdx: number) => {
    const [primaryHex, secondaryHex] = FIREWORK_PALETTES[paletteIdx % FIREWORK_PALETTES.length];
    const outerCount = 46;
    const innerCount = 20;
    // Outer chrysanthemum burst shell
    for (let i = 0; i < outerCount; i++) {
      const phi = Math.acos(1 - (2 * (i + 0.5)) / outerCount);
      const theta = Math.PI * (1 + Math.sqrt(5)) * i;
      const spd = 21 + ((i * 19) % 11);
      const vx = Math.sin(phi) * Math.cos(theta) * spd;
      const vy = Math.cos(phi) * spd + 3.5;
      const vz = Math.sin(phi) * Math.sin(theta) * spd;
      spawnFwSpark(origin.x, origin.y, origin.z, vx, vy, vz, i % 3 === 0 ? secondaryHex : primaryHex, 1.9 + (i % 5) * 0.22, 3.1, 0.965, 8.2);
    }
    // Inner golden glittering core ring
    for (let i = 0; i < innerCount; i++) {
      const a = (i / innerCount) * Math.PI * 2;
      const spd = 11 + (i % 4) * 2.1;
      spawnFwSpark(
        origin.x,
        origin.y,
        origin.z,
        Math.cos(a) * spd,
        ((i % 3) - 1) * 4.5,
        Math.sin(a) * spd,
        '#fef08a',
        1.45 + (i % 3) * 0.2,
        2.6,
        0.955,
        6.5
      );
    }
  };

  useFrame((state, elapsed) => {
    const dt = Math.min(0.05, elapsed);
    const t = state.clock.elapsedTime;
    const activeThemeId = resolveActiveThemeId(simState.startMenuOpen, simState.lobbyTheme, simState.worldTimeTheme);
    const theme = LOBBY_THEMES[activeThemeId];
    const nightBoost = theme.moonVisibility * 0.85 + theme.sunsetWarmth * 0.45;

    // Seed two dramatic bursts immediately on first frame so sky fanfare is live right away
    if (!fw.initialized) {
      fw.initialized = true;
      detonateFirework(new THREE.Vector3(58, 82, -585), 0);
      detonateFirework(new THREE.Vector3(-72, 76, -305), 1);
      fw.rockets.push({
        pos: new THREE.Vector3(28, 22, 315),
        vel: new THREE.Vector3(-2, 42, -3),
        burstY: 84,
        paletteIdx: 2,
        trailTimer: 0,
      });
    }

    // 1. Update Harbor Fireworks
    fwUniforms.uTime.value = t;
    fw.launchTimer -= dt;
    if (fw.launchTimer <= 0 && fw.rockets.length < 4) {
      fw.launchTimer = 1.65 + ((fw.siteIdx * 37) % 10) * 0.11;
      const site = FIREWORK_SITES[fw.siteIdx % FIREWORK_SITES.length];
      const jitterX = Math.sin(t * 2.1 + fw.siteIdx) * 14;
      const jitterZ = Math.cos(t * 1.7 + fw.siteIdx) * 14;
      fw.rockets.push({
        pos: new THREE.Vector3(site[0] + jitterX, site[1], site[2] + jitterZ),
        vel: new THREE.Vector3(Math.sin(fw.siteIdx * 1.9) * 3.5, 44 + (fw.siteIdx % 3) * 5, Math.cos(fw.siteIdx * 1.3) * 3.5),
        burstY: 68 + (fw.siteIdx % 4) * 9,
        paletteIdx: fw.siteIdx % FIREWORK_PALETTES.length,
        trailTimer: 0,
      });
      fw.siteIdx++;
    }

    for (let r = fw.rockets.length - 1; r >= 0; r--) {
      const rocket = fw.rockets[r];
      rocket.vel.y -= 5.2 * dt;
      rocket.pos.addScaledVector(rocket.vel, dt);
      rocket.trailTimer -= dt;
      if (rocket.trailTimer <= 0) {
        rocket.trailTimer = 0.032;
        spawnFwSpark(
          rocket.pos.x,
          rocket.pos.y,
          rocket.pos.z,
          (Math.random() - 0.5) * 2.2,
          -3.5 - Math.random() * 2.5,
          (Math.random() - 0.5) * 2.2,
          '#fde68a',
          0.48,
          2.2,
          0.92,
          5.0
        );
      }
      if (rocket.pos.y >= rocket.burstY || rocket.vel.y <= 4) {
        detonateFirework(rocket.pos, rocket.paletteIdx);
        fw.rockets.splice(r, 1);
      }
    }

    const fwBright = 0.88 + nightBoost * 0.35;
    for (let i = 0; i < FIREWORK_POOL; i++) {
      const sp = fw.sparks[i];
      if (sp.age >= sp.life) {
        fw.alphas[i] = 0;
        continue;
      }
      sp.age += dt;
      const u = sp.age / sp.life;
      const damp = Math.pow(sp.drag, dt * 60);
      sp.vel.multiplyScalar(damp);
      sp.vel.y -= sp.gravity * dt;
      sp.pos.addScaledVector(sp.vel, dt);
      fw.positions[i * 3] = sp.pos.x;
      fw.positions[i * 3 + 1] = sp.pos.y;
      fw.positions[i * 3 + 2] = sp.pos.z;
      fw.sizes[i] = sp.size * (1.0 - u * 0.55);
      fw.alphas[i] = Math.min(1, (1.0 - u) * 1.45 * fwBright);
    }
    fw.geo.attributes.position.needsUpdate = true;
    fw.geo.attributes.aColor.needsUpdate = true;
    fw.geo.attributes.aSize.needsUpdate = true;
    fw.geo.attributes.aAlpha.needsUpdate = true;
    fw.geo.attributes.aTwinkle.needsUpdate = true;

    // 2. Sweep Art-Deco Premiere Searchlight Beams
    const beamIntensity = 0.065 + theme.sunsetWarmth * 0.08 + theme.moonVisibility * 0.14;
    for (let s = 0; s < SEARCHLIGHT_SITES.length; s++) {
      const ph = SEARCHLIGHT_SITES[s].phase;
      for (let b = 0; b < 2; b++) {
        const idx = s * 2 + b;
        const mesh = searchlightRefs.current[idx];
        const uni = searchlightUniforms[idx];
        if (uni) {
          uni.uTime.value = t;
          uni.uIntensity.value = beamIntensity;
        }
        if (mesh) {
          const dirSign = b === 0 ? 1 : -1;
          mesh.rotation.z = Math.sin(t * 0.42 + ph + b * 1.7) * 0.42 * dirSign;
          mesh.rotation.x = Math.cos(t * 0.31 + ph * 1.3 + b * 2.1) * 0.32;
        }
      }
    }

    // 3. Animate Celebratory Fountain Parabolic Spray Arcs (1 InstancedMesh)
    const fMesh = fountainMeshRef.current;
    if (fMesh) {
      let idx = 0;
      const g = 14.2;
      for (let sIdx = 0; sIdx < fountainSources.length; sIdx++) {
        const src = fountainSources[sIdx];
        const choreo = 0.78 + 0.28 * Math.sin(t * 1.35 + src.phaseOffset);
        for (let i = 0; i < src.count; i++) {
          const isOuterRing = i % 3 !== 0;
          const nozzleIdx = i % 12;
          const angle = (nozzleIdx / 12) * Math.PI * 2 + src.phaseOffset;
          const cycleDur = isOuterRing ? 1.55 : 1.85;
          const u = ((t / cycleDur + i * 0.0731) % 1 + 1) % 1;
          const peakH = THREE.MathUtils.lerp(src.heightMin, src.heightMax, (nozzleIdx % 4) / 3) * choreo;
          const vy0 = Math.sqrt(2 * g * peakH);
          const flightT = (2 * vy0) / g;
          const localT = u * flightT;
          const y = src.y + Math.max(0, vy0 * localT - 0.5 * g * localT * localT);
          const radialStart = isOuterRing ? src.ringRadius : src.ringRadius * 0.28;
          const radialDrift = isOuterRing ? -src.spread * 0.82 * u : src.spread * 0.55 * u;
          const r = radialStart + radialDrift;
          const x = src.x + Math.cos(angle) * r;
          const z = src.z + Math.sin(angle) * r;

          const vyNow = vy0 - g * localT;
          const stretch = 1.15 + Math.min(2.4, Math.abs(vyNow) * 0.14);
          const dropScale = (0.72 + 0.45 * Math.sin(u * Math.PI)) * (isOuterRing ? 0.95 : 1.18);
          dummy.position.set(x, y, z);
          dummy.rotation.set(0, -angle, Math.atan2(vyNow, isOuterRing ? -4.2 : 3.2) - Math.PI * 0.5);
          dummy.scale.set(dropScale, dropScale * stretch, dropScale);
          dummy.updateMatrix();
          fMesh.setMatrixAt(idx++, dummy.matrix);
        }
      }
      fMesh.instanceMatrix.needsUpdate = true;
    }

    // 4. Flutter Festive Harbor Pennants in Coastal Breeze
    const pMesh = pennantMeshRef.current;
    if (pMesh) {
      for (let i = 0; i < pennants.length; i++) {
        const p = pennants[i];
        const wave = Math.sin(t * 4.4 + p.phase) * 0.34 + Math.cos(t * 2.1 + p.phase * 0.6) * 0.14;
        dummy.position.copy(p.basePos);
        dummy.rotation.set(p.pitch + wave, p.yaw, Math.sin(t * 3.1 + p.phase) * 0.12);
        dummy.scale.set(1, 1, 1);
        dummy.updateMatrix();
        pMesh.setMatrixAt(i, dummy.matrix);
      }
      pMesh.instanceMatrix.needsUpdate = true;
    }

    // 5. Shimmering Coastal Air Motes
    moteUniforms.uTime.value = t;
    moteUniforms.uAnchor.value.copy(state.camera.position);
    moteUniforms.uColor.value.set(
      theme.moonVisibility > 0.45 ? '#bae6fd' : theme.sunsetWarmth > 0.4 ? '#fed7aa' : '#fff7d6'
    );
    moteUniforms.uOpacity.value = theme.moonVisibility > 0.45 ? 0.36 : 0.48;

    // 6. Soaring Seabird Flocks
    birdUniforms.uTime.value = t;
    birdUniforms.uTint.value.set(theme.moonVisibility > 0.45 ? '#cbd5e1' : theme.sunsetWarmth > 0.4 ? '#ffedd5' : '#f8fafc');
    const bMesh = birdMeshRef.current;
    if (bMesh) {
      for (let i = 0; i < birdFlocks.length; i++) {
        const b = birdFlocks[i];
        const ang = t * b.speed + b.angleOffset;
        const x = b.cx + Math.cos(ang) * b.radiusX;
        const z = b.cz + Math.sin(ang) * b.radiusZ;
        const y = b.cy + Math.sin(ang * 2.0 + i) * 3.2;
        const dx = -Math.sin(ang) * b.radiusX * b.speed;
        const dz = Math.cos(ang) * b.radiusZ * b.speed;
        const yaw = Math.atan2(dx, dz);
        const bank = (b.speed > 0 ? -0.26 : 0.26) + Math.sin(t * 0.8 + i) * 0.08;
        const pitch = Math.cos(ang * 2.0 + i) * 0.09;
        dummy.position.set(x, y, z);
        dummy.rotation.set(pitch, yaw, bank);
        dummy.scale.setScalar(b.scale);
        dummy.updateMatrix();
        bMesh.setMatrixAt(i, dummy.matrix);
      }
      bMesh.instanceMatrix.needsUpdate = true;
    }
  });

  return (
    <group name="world-fanfare">
      {/* 1. Continuous Harbor Fireworks Bursts */}
      <points geometry={fw.geo} frustumCulled={false} renderOrder={4}>
        <shaderMaterial
          vertexShader={fireworkVertexShader}
          fragmentShader={fireworkFragmentShader}
          uniforms={fwUniforms}
          transparent
          depthWrite={false}
          blending={THREE.AdditiveBlending}
        />
      </points>

      {/* 2. Sweeping Art-Deco Premiere Searchlight Beams */}
      {searchlightBases.map((site, sIdx) => (
        <group key={`searchlight-site-${sIdx}`} position={[site.x, site.y, site.z]}>
          {[0, 1].map((beamIdx) => {
            const uIdx = sIdx * 2 + beamIdx;
            return (
              <mesh
                key={beamIdx}
                ref={(el) => {
                  searchlightRefs.current[uIdx] = el;
                }}
                geometry={searchlightGeo}
                position={[beamIdx === 0 ? -0.8 : 0.8, 0.2, 0]}
                frustumCulled={false}
                renderOrder={3}
              >
                <shaderMaterial
                  vertexShader={searchlightVertexShader}
                  fragmentShader={searchlightFragmentShader}
                  uniforms={searchlightUniforms[uIdx]}
                  transparent
                  depthWrite={false}
                  side={THREE.DoubleSide}
                  blending={THREE.AdditiveBlending}
                />
              </mesh>
            );
          })}
        </group>
      ))}

      {/* 3. Animated Celebratory Fountain Spray Arcs */}
      <instancedMesh ref={fountainMeshRef} args={[dropletGeo, undefined, fountainTotal]} frustumCulled={false} renderOrder={2}>
        <meshStandardMaterial
          color="#e0f7ff"
          emissive="#7dd3fc"
          emissiveIntensity={0.45}
          roughness={0.08}
          metalness={0.12}
          transparent
          opacity={0.78}
        />
      </instancedMesh>

      {/* 4. Festive Harbor Pennants & Masts */}
      <instancedMesh ref={poleMeshRef} args={[poleGeo, undefined, poles.length]} frustumCulled={false} castShadow>
        <meshStandardMaterial color="#f1f5f9" metalness={0.72} roughness={0.28} />
      </instancedMesh>
      <instancedMesh ref={pennantMeshRef} args={[pennantGeo, undefined, pennants.length]} frustumCulled={false}>
        <meshStandardMaterial roughness={0.55} metalness={0.05} side={THREE.DoubleSide} />
      </instancedMesh>

      {/* 5. Shimmering Coastal Air Motes */}
      <points geometry={moteGeo} frustumCulled={false} renderOrder={3}>
        <shaderMaterial
          vertexShader={airMoteVertexShader}
          fragmentShader={airMoteFragmentShader}
          uniforms={moteUniforms}
          transparent
          depthWrite={false}
          blending={THREE.AdditiveBlending}
        />
      </points>

      {/* 6. Soaring Animated Seabird Flocks */}
      <instancedMesh ref={birdMeshRef} args={[birdGeo, undefined, birdCount]} frustumCulled={false}>
        <shaderMaterial
          vertexShader={seabirdVertexShader}
          fragmentShader={seabirdFragmentShader}
          uniforms={birdUniforms}
          side={THREE.DoubleSide}
        />
      </instancedMesh>
    </group>
  );
}

export function WorldEffects() {
  const decals = useRef<(THREE.Mesh<THREE.PlaneGeometry, THREE.MeshBasicMaterial> | null)[]>([]);
  const nextScar = useRef(0);
  const bloodDecals = useRef<(THREE.Mesh | null)[]>([]);
  const nextBlood = useRef(0);
  const shardMesh = useRef<THREE.InstancedMesh>(null);
  const shards = useMemo(
    () =>
      Array.from({ length: shardCount }, () => ({
        position: new THREE.Vector3(),
        velocity: new THREE.Vector3(),
        spin: new THREE.Vector3(),
        euler: new THREE.Euler(),
        size: 0.1,
        life: 0,
        live: false,
      })),
    []
  );
  const nextShard = useRef(0);
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
      geometry.setAttribute(
        name,
        new THREE.BufferAttribute(array, array === positions || array === tint ? 3 : 1).setUsage(THREE.DynamicDrawUsage)
      );
    }
    return {
      geometry,
      positions,
      tint,
      radius,
      opacity,
      kind,
      index: 0,
      values: Array.from({ length: poolSize }, () => ({
        position: new THREE.Vector3(),
        velocity: new THREE.Vector3(),
        age: 0,
        life: 0,
        size: 0,
        fade: 0,
        flight: false,
      })),
    };
  }, []);
  useEffect(
    () => () => {
      pool.geometry.dispose();
      stone.dispose();
      glass.dispose();
    },
    [pool, stone, glass]
  );

  const color = useMemo(() => new THREE.Color(), []);
  function spawn(
    point: THREE.Vector3,
    velocity: THREE.Vector3,
    type: number,
    tint: string,
    life: number,
    size: number,
    fade: number,
    flight = false
  ) {
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
      if (impact.destroyed && shardMesh.current) {
        const quantity = Math.min(12, Math.round(5 + impact.energy / 18));
        for (let i = 0; i < quantity; i++) {
          const index = nextShard.current++ % shardCount;
          const shard = shards[index];
          shard.position.copy(impact.point).addScaledVector(impact.normal, 0.105);
          shard.velocity
            .set((Math.random() - 0.5) * 6.8, 1.9 + Math.random() * 3.2, (Math.random() - 0.5) * 6.5)
            .addScaledVector(impact.normal, 1.3 + Math.random() * 2.9);
          shard.spin.set(Math.random() * 8, Math.random() * 4.6, Math.random() * 7.2);
          shard.euler.set(i * 0.53, i * 1.1, i * 0.385);
          shard.size = 0.065 + Math.random() * (impact.material === 'glass' ? 0.13 : 0.27);
          shard.life = 3.6 + Math.random() * 3;
          shard.live = true;
          shardMesh.current.setColorAt(index, color.set(fragments[impact.material]));
        }
        if (shardMesh.current.instanceColor) shardMesh.current.instanceColor.needsUpdate = true;
      }
      const magnitude = Math.min(1.75, impact.energy / 75);
      for (let i = 0; i < 5 + magnitude * 8 + (impact.destroyed ? 10 : 0); i++) {
        const spark = i % 3 === 0 || impact.material === 'metal';
        velocity
          .set(Math.random() - 0.5, Math.random() * 0.7, Math.random() - 0.5)
          .multiplyScalar(6 + 5 * magnitude)
          .addScaledVector(impact.normal, 1.6 + Math.random() * 4);
        spawn(
          impact.point,
          velocity,
          spark ? 1 : 2,
          spark ? '#ffd184' : fragments[impact.material],
          spark ? 0.21 + Math.random() * 0.4 : 0.65 + Math.random() * 1.4,
          spark ? 0.13 : 0.14 + Math.random() * 0.24,
          1
        );
      }
      for (let i = 0; i < 3 + magnitude * 5; i++) {
        velocity
          .set(Math.random() - 0.5, 0.45 + Math.random() * 1.4, Math.random() - 0.5)
          .addScaledVector(impact.normal, 0.55);
        spawn(
          impact.point,
          velocity,
          0,
          smokeColors[impact.material],
          (impact.destroyed ? 2.1 : 0.8) + Math.random() * 2.2,
          0.3 + magnitude * 0.8,
          0.83
        );
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

    if (!simState.controlSettings.blood) {
      bloodDecals.current.forEach((item) => {
        if (item) item.visible = false;
      });
      for (let i = 0; i < poolSize; i++) if (pool.kind[i] === 4) pool.values[i].life = 0;
    }
    for (const { kind, point, energy, motionX, motionZ } of environmentEffects.splice(0)) {
      if (kind === 'blood' && !simState.controlSettings.blood) continue;
      if (kind === 'blood') {
        const mark = bloodDecals.current[nextBlood.current++ % 24];
        const floor = getTravelHeight(point.x, point.z, point.y);
        if (mark && floor > simState.tideOffset && point.y - floor < 2.8) {
          mark.position.set(point.x + motionX * 0.055, floor + 0.102, point.z + motionZ * 0.055);
          mark.scale.setScalar(0.39 + 0.39 * energy);
          mark.rotation.z += 0.78;
          mark.visible = true;
        }
      }
      if (kind === 'tire') {
        for (let i = 0; i < 4; i++) {
          velocity.set(
            motionX * 0.08 + Math.random() * 0.7 - 0.32,
            0.34 + Math.random() * 0.5,
            motionZ * 0.08 + Math.random() * 0.7 - 0.32
          );
          spawn(point, velocity, 0, i % 2 ? '#d3d7d5' : '#aab0ad', 0.8 + i * 0.19, (0.29 + Math.random() * 0.34) * energy, 0.74);
        }
        continue;
      }
      const count = Math.round(3 + 12 * energy);
      const dust = kind === 'dust' || kind === 'gravel';
      const water = kind === 'water';
      for (let i = 0; i < Math.min(28, count); i++) {
        const angle = i * 2.39996;
        const speed = 0.7 + Math.random() * (2 + 2.5 * energy);
        velocity.set(
          Math.cos(angle) * speed + motionX * 0.2,
          0.32 + Math.random() * (water ? 3.4 : 1.5) * energy,
          Math.sin(angle) * speed + motionZ * 0.2
        );
        const particle =
          kind === 'blood' ? 4 : water ? (i % 3 === 0 ? 0 : 3) : dust ? (i % 4 === 0 && kind === 'gravel' ? 2 : 0) : 1;
        const tint =
          kind === 'blood' ? '#952c33' : water ? '#c4e5e1' : dust ? '#af9a80' : kind === 'repair' ? '#99f4dc' : '#ffcf8d';
        spawn(
          point,
          velocity,
          particle,
          tint,
          0.22 + Math.random() * (dust ? 0.89 : 0.52),
          0.065 + Math.random() * (particle === 0 ? 0.33 : 0.19),
          water && particle === 0 ? 0.57 : 0.85
        );
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
        exhaust
          .set(heli ? source * 0.75 : source * 3.5, heli ? 1.26 : 0.32, heli ? -1.65 : -2.1)
          .applyEuler(rotation)
          .add(simState.planePos);
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
    const debris = shardMesh.current;
    if (debris && nextShard.current > 0) {
      debris.count = Math.min(shardCount, nextShard.current);
      let edited = false;
      for (let index = 0; index < debris.count; index++) {
        const shard = shards[index];
        if (!shard.live) continue;
        edited = true;
        shard.life -= dt;
        shard.velocity.y -= 16 * dt;
        shard.position.addScaledVector(shard.velocity, dt);
        const floor = getTravelHeight(shard.position.x, shard.position.z, shard.position.y) + shard.size * 0.36;
        if (shard.position.y < floor) {
          shard.position.y = floor;
          shard.velocity.y = Math.max(0, -shard.velocity.y * 0.28 - 0.4);
          shard.velocity.x *= Math.exp(-dt * 7);
          shard.velocity.z *= Math.exp(-dt * 7);
          shard.spin.multiplyScalar(Math.exp(-dt * 5));
        }
        shard.euler.x += shard.spin.x * dt;
        shard.euler.y += shard.spin.y * dt;
        shard.euler.z += shard.spin.z * dt;
        const scale = shard.size * THREE.MathUtils.clamp(shard.life * 1.5, 0, 1);
        matrix.position.copy(shard.position);
        matrix.rotation.copy(shard.euler);
        matrix.scale.set(scale, scale * 0.52, scale * 0.68);
        matrix.updateMatrix();
        debris.setMatrixAt(index, matrix.matrix);
        if (shard.life <= 0) shard.live = false;
      }
      if (edited) debris.instanceMatrix.needsUpdate = true;
    }
    if (dirty) for (const attribute of Object.values(pool.geometry.attributes)) attribute.needsUpdate = true;
  });

  return (
    <group>
      <WorldFanfare />
      {Array.from({ length: scarCount }, (_, i) => (
        <mesh
          key={i}
          visible={false}
          ref={(mesh) => {
            decals.current[i] = mesh as (typeof decals.current)[number];
          }}
          renderOrder={2}
        >
          <planeGeometry args={[1, 1]} />
          <meshBasicMaterial map={stone} transparent depthWrite={false} polygonOffset polygonOffsetFactor={-2} />
        </mesh>
      ))}
      {Array.from({ length: 24 }, (_, i) => (
        <mesh
          key={'blood-' + i}
          rotation={[-Math.PI / 2, 0, 0]}
          renderOrder={3}
          visible={false}
          ref={(item) => {
            bloodDecals.current[i] = item;
          }}
        >
          <planeGeometry args={[1, 0.72]} />
          <meshBasicMaterial color="#852a30" map={glass} transparent opacity={0.59} depthWrite={false} polygonOffset polygonOffsetFactor={-2} />
        </mesh>
      ))}
      <instancedMesh ref={shardMesh} args={[shardShape, undefined, shardCount]} count={0} frustumCulled={false}>
        <meshStandardMaterial roughness={0.73} metalness={0.12} />
      </instancedMesh>
      <points geometry={pool.geometry} frustumCulled={false} renderOrder={3}>
        <shaderMaterial transparent depthWrite={false} vertexShader={vertexShader} fragmentShader={fragmentShader} />
      </points>
    </group>
  );
}
