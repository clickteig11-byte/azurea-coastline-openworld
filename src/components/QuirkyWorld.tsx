import { Suspense, memo, useMemo, useRef } from 'react';
import { Text } from '@react-three/drei';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { coastalBurst, coastalNow, quack } from '../game/coastalPlay';
import {
  BEACH_BALLS, DUCK, HYDRO_RINGS, PERFORMER, POSTCARDS, TRAMPOLINE_RADIUS, TRAMPOLINES,
  VOLLEYBALL_NETS, kickBeachBall, stepBeachBall, type BallMotion,
} from '../game/quirky';
import { simState } from '../game/store';
import { soundEngine } from '../game/soundEngine';
import { WONDER_PIER_TERRACE_Y, getTravelHeight, getWaveHeight } from '../game/worldMath';

type Vec = [number, number, number];
const TAU = Math.PI * 2;
const sides = [-1, 1];
const cream = '#fff0ce', coral = '#fa756b', aqua = '#31d5c9', goldColor = '#ffbd42';
const rainbow = [goldColor, cream, coral, aqua, '#8cb2ff', '#ed96ff'];
const sphere = new THREE.SphereGeometry(1, 28, 18);
const box = new THREE.BoxGeometry(), rod = new THREE.CylinderGeometry(1, 1, 1, 12);
const torus = new THREE.TorusGeometry(1, 0.065, 10, 64);
const jewel = new THREE.OctahedronGeometry();
const up = new THREE.Vector3(0, 1, 0);
const flat: Vec = [-Math.PI / 2, 0, 0];
const material = (color: string, metalness = 0, roughness = 0.58) =>
  new THREE.MeshStandardMaterial({ color, metalness, roughness });
const paint = { cream: material(cream), coral: material(coral), aqua: material(aqua), dark: material('#233041'),
  skin: material('#b96d46'), gold: material(goldColor, 0.67, 0.25), chrome: material('#e0eff7', 0.76, 0.24) };
const duckGold = new THREE.MeshPhysicalMaterial({ color: '#ffd72e', roughness: 0.25, clearcoat: 1, metalness: 0.2 });
const orange = new THREE.MeshPhysicalMaterial({ color: '#ff881d', roughness: 0.29, clearcoat: 0.8 });
const lens = new THREE.MeshPhysicalMaterial({ color: '#4a2930', metalness: 0.45, roughness: 0.16, clearcoat: 1 });
const water = new THREE.MeshBasicMaterial({ color: '#a3fff6', transparent: true, opacity: 0.8, depthWrite: false });
const ground = (x: number, z: number): Vec => [x, getTravelHeight(x, z), z];
const surface = (x: number, z: number, t: number) => simState.tideOffset + getWaveHeight(x, z, t);
const playing = () => !simState.startMenuOpen && !simState.controlsOpen && !simState.customizerOpen &&
  !simState.activeRide && (simState.gameMode === 'FREE_ROAM' || simState.gameMode === 'WORLD_TOUR');
function Shape({ geo = sphere, mat, p, s, r }: {
  geo?: THREE.BufferGeometry; mat: THREE.Material; p?: Vec; s?: Vec | number; r?: Vec;
}) {
  return <mesh geometry={geo} material={mat} position={p} scale={s} rotation={r} />;
}
function Bar({ a, b, radius, mat = paint.chrome }: { a: Vec; b: Vec; radius: number; mat?: THREE.Material }) {
  const start = new THREE.Vector3(...a), axis = new THREE.Vector3(...b).sub(start);
  const length = axis.length();
  return <mesh geometry={rod} material={mat} position={start.addScaledVector(axis, 0.5)}
    quaternion={new THREE.Quaternion().setFromUnitVectors(up, axis.normalize())} scale={[radius, length, radius]} />;
}

function GoldenDuck() {
  const duck = useRef<THREE.Group>(null), spray = useRef<THREE.InstancedMesh>(null);
  const wasNear = useRef(false);
  const drop = useMemo(() => new THREE.Object3D(), []);
  useFrame(({ clock }) => {
    const t = clock.elapsedTime;
    const p = simState.mode === 'BOAT' ? simState.boatPos : simState.mode === 'CAR' ? simState.carPos : simState.playerPos;
    const near = p.y < 9 && Math.hypot(p.x - DUCK.x, p.z - DUCK.z) < DUCK.radius + 5;
    if (playing() && simState.mode !== 'PLANE') {
      if (near && !wasNear.current) quack();
      wasNear.current = near;
    }
    const remaining = simState.coastal.duckUntil - coastalNow();
    const wobble = Math.sin(t * 9) * THREE.MathUtils.clamp(remaining, 0, 1);
    duck.current?.position.set(DUCK.x, surface(DUCK.x, DUCK.z, t) + wobble * 0.53, DUCK.z);
    duck.current?.rotation.set(Math.sin(t * 1.7) * 0.06, -0.6 + wobble * 0.08, wobble * 0.13);
    const mesh = spray.current;
    if (!mesh) return;
    mesh.visible = remaining > 0;
    if (remaining <= 0) return;
    for (let i = 0; i < mesh.count; i++) {
      const f = (t * 0.71 + i / mesh.count) % 1;
      drop.position.set(Math.sin(i * 2.4) * f, 4.15 + 12 * f - 15 * f * f, 4.9 + f * 11);
      const size = (0.1 + 0.065 * Math.sin(i * 2 + t * 19)) * Math.min(1, remaining * 4);
      drop.scale.set(size, size * 1.65, size);
      drop.updateMatrix();
      mesh.setMatrixAt(i, drop.matrix);
    }
    mesh.instanceMatrix.needsUpdate = true;
  });
  return <group name="Sir Quacks-a-Lot" ref={duck}>
    <Shape mat={duckGold} p={[0, 1.25, 0]} s={[4.1, 2.5, 5.1]} />
    <Shape mat={duckGold} p={[0, 2.45, -3.67]} s={[2.1, 1.22, 2.35]} r={[-0.49, 0, 0]} />
    <Shape mat={duckGold} p={[0, 4.18, 2.34]} s={[2.28, 2.38, 2.26]} />
    <Shape mat={orange} p={[0, 3.82, 4.21]} s={[1.7, 0.4, 1.48]} />
    <Bar a={[-0.54, 4.93, 4.51]} b={[0.54, 4.93, 4.51]} radius={0.09} mat={paint.gold} />
    {sides.map((side) => <group key={side}>
      <Shape mat={duckGold} p={[side * 3.39, 1.7, -0.56]} s={[0.94, 1.24, 3]} r={[0.21, side * 0.21, 0]} />
      <group position={[side * 1.12, 4.85, 4.19]} rotation={[0, side * 0.24, side * 0.13]}>
        <Shape mat={paint.gold} s={[1.2, 0.91, 0.22]} />
        <Shape mat={lens} p={[0, 0, 0.12]} s={[1.07, 0.78, 0.18]} />
        </group>
      <Bar a={[side * 2.18, 4.99, 3.94]} b={[side * 2.24, 4.95, 2.45]} radius={0.09} mat={paint.gold} />
    </group>)}
    <instancedMesh args={[jewel, water, 36]} ref={spray} frustumCulled={false} visible={false} />
  </group>;
}

function stripes(colors: string[]) {
  const pixels = new Uint8Array(colors.flatMap((color) => {
    const rgb = new THREE.Color(color).getRGB(new THREE.Color(), THREE.SRGBColorSpace);
    return [rgb.r, rgb.g, rgb.b, 1].map((value) => Math.round(255 * value));
  }));
  const texture = new THREE.DataTexture(pixels, colors.length, 1);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.needsUpdate = true;
  return texture;
}
const trampolineMat = new THREE.MeshStandardMaterial({ map: stripes([aqua, cream, coral, cream, aqua, cream, coral, cream, aqua]) });
const matDisk = new THREE.CircleGeometry(TRAMPOLINE_RADIUS, 64);
function Trampolines() { return <>{TRAMPOLINES.map(({ name, x, z }) => <group key={name} name={name + ' trampoline'} position={ground(x, z)}>
    <Shape geo={matDisk} mat={trampolineMat} p={[0, 0.78, 0]} r={flat} />
    <Shape geo={torus} mat={paint.chrome} p={[0, 0.78, 0]} s={[TRAMPOLINE_RADIUS, TRAMPOLINE_RADIUS, 1.2]} r={flat} />
    {Array.from({ length: 6 }, (_, i) => {
      const a = i * TAU / 6;
      const x = Math.cos(a), z = Math.sin(a);
      return <Bar key={i} a={[2.72 * x, 0.03, 2.72 * z]} b={[2.33 * x, 0.75, 2.33 * z]} radius={0.085} />;
    })}
  </group>)}</>; }

const arch = new THREE.CurvePath<THREE.Vector3>();
const archPoints = [new THREE.Vector3(-2.9, 0.14, 0), ...Array.from({ length: 33 }, (_, i) =>
  new THREE.Vector3(-2.9 * Math.cos(i * Math.PI / 32), 3 + 1.6 * Math.sin(i * Math.PI / 32), 0)),
new THREE.Vector3(2.9, 0.14, 0)];
for (let i = 1; i < archPoints.length; i++) arch.add(new THREE.LineCurve3(archPoints[i - 1], archPoints[i]));
const frameEdge = new THREE.TubeGeometry(arch, 96, 0.18, 10);
const frameTrim = new THREE.TubeGeometry(arch, 96, 0.065, 8);
const frameGlow = new THREE.MeshStandardMaterial({ color: cream, emissive: '#ffcf7b', emissiveIntensity: 0.45 });
const star = new THREE.Shape();
for (let i = 0; i < 10; i++) {
  const a = Math.PI / 2 + i * TAU / 10, r = i % 2 ? 0.2 : 0.43;
  if (i === 0) star.moveTo(r * Math.cos(a), r * Math.sin(a));
  else star.lineTo(r * Math.cos(a), r * Math.sin(a));
}
star.closePath();
const sealStar = new THREE.ExtrudeGeometry(star, { depth: 0.07, bevelSize: 0.025, bevelThickness: 0.025, bevelSegments: 2 });
function Postcard({ card }: { card: typeof POSTCARDS[number] }) {
  const seal = useRef<THREE.Group>(null);
  useFrame(() => { if (seal.current) seal.current.visible = simState.coastal.postcards.includes(card.id); });
  const position: Vec = card.id === 'wonder'
    ? [card.x, WONDER_PIER_TERRACE_Y, card.z]
    : ground(card.x, card.z);
  return <group name={card.name} position={position} rotation-y={card.yaw}>
    <Shape geo={frameEdge} mat={paint.gold} />
    <Shape geo={frameTrim} mat={frameGlow} p={[0, 0, 0.16]} />
    {sides.map((side) => <group key={side} position-x={side * 2.9}>
      <Shape geo={box} mat={paint.cream} p={[0, 0.14, 0]} s={[0.83, 0.28, 0.75]} />
      {[0.42, 2.68, 3.14].map((y) => <Shape key={y} mat={paint.gold} p={[0, y, 0.12]} s={[0.27, 0.13, 0.21]} />)}
    </group>)}
    <Shape mat={paint.gold} p={[0, 4.57, 0]} s={[1.54, 0.43, 0.22]} />
    <Shape mat={paint.cream} p={[0, 4.57, 0.12]} s={[1.47, 0.35, 0.16]} />
    <Suspense fallback={null}><Text position={[0, 4.57, 0.3]} fontSize={0.25} color="#643f28">Azurea Postcard</Text></Suspense>
    <group ref={seal} position={[2.45, 3.63, 0.29]} visible={false}>
      <Shape mat={paint.coral} s={[0.53, 0.53, 0.075]} />
      <Shape geo={sealStar} mat={paint.gold} p={[0, 0, 0.07]} />
    </group>
  </group>;
}

const ballPaints = [rainbow, [cream, aqua, cream, coral, cream, goldColor]].map((colors) =>
  new THREE.MeshPhysicalMaterial({ map: stripes(colors), roughness: 0.32, clearcoat: 0.5 }));
const nets = VOLLEYBALL_NETS.map(({ x, z, halfWidth }) => {
  const lines: number[] = [];
  for (let i = 0; i <= 28; i++) {
    const u = halfWidth * (i / 14 - 1);
    lines.push(u, 1.13, 0, u, 2.53, 0);
  }
  for (let i = 0; i <= 7; i++) lines.push(-halfWidth, 1.13 + i * 0.2, 0, halfWidth, 1.13 + i * 0.2, 0);
  const geometry = new THREE.BufferGeometry().setAttribute('position', new THREE.Float32BufferAttribute(lines, 3));
  return { x, z, halfWidth, geometry };
});
const netThread = new THREE.LineBasicMaterial({ color: '#efead9', transparent: true, opacity: 0.72 });
function BeachGames() {
  const meshes = useRef<(THREE.Mesh | null)[]>([]);
  const balls = useMemo(() => BEACH_BALLS.map(({ x, z }, i) => {
    const radius = 0.93 + i % 3 * 0.12;
    const spawn: BallMotion = { x, z, y: getTravelHeight(x, z) + radius, radius, vx: 0, vy: 0, vz: 0 };
    return { spawn, motion: spawn, contact: false };
  }), []);
  useFrame(({ clock }, delta) => {
    const dt = Math.min(delta, 0.045);
    const car = simState.mode === 'CAR', p = car ? simState.carPos : simState.playerPos;
    const canKick = playing() && (car || simState.mode === 'FOOT');
    balls.forEach((ball, i) => {
      const before = ball.motion;
      const { x, y, z, radius } = before, dx = x - p.x, dz = z - p.z;
      const contact = canKick && Math.abs(y - p.y) < radius + 1.3 &&
        Math.hypot(dx, dz) < radius + (car ? 2 : 0.55);
      let motion = before;
      if (contact && !ball.contact) {
        const yaw = car ? simState.carYaw : simState.playerYaw;
        const centered = Math.hypot(dx, dz) < 0.05;
        const speed = car ? Math.abs(simState.carSpeed) : Math.hypot(simState.playerVel.x, simState.playerVel.z);
        motion = kickBeachBall(before, centered ? Math.sin(yaw) : dx, centered ? Math.cos(yaw) : dz,
          Math.min(car ? 28 : 14, (car ? 9 : 5) + speed * 0.45));
        soundEngine.playCoastal('ball');
        coastalBurst('ball', x, y, z);
      }
      ball.contact = contact;
      const nx = x + motion.vx * dt, nz = z + motion.vz * dt;
      const floor = Math.max(getTravelHeight(nx, nz, y - radius), surface(nx, nz, clock.elapsedTime) - radius * 0.35);
      const next = stepBeachBall(motion, floor, dt);
      for (const net of nets) {
        const side = Math.sign(z - net.z) || 1, edge = net.z + side * radius;
        if ((z - edge) * side < 0 || (next.z - edge) * side >= 0) continue;
        const hit = (edge - z) / (next.z - z);
        const height = THREE.MathUtils.lerp(y, next.y, hit) - getTravelHeight(net.x, net.z);
        if (Math.abs(THREE.MathUtils.lerp(x, next.x, hit) - net.x) > net.halfWidth + radius ||
            height + radius < 1.13 || height - radius > 2.6) continue;
        next.z = edge + side * 0.02;
        next.vz *= -0.63;
        break;
      }
      ball.motion = next;
      const mesh = meshes.current[i];
      if (!mesh) return;
      mesh.position.set(ball.motion.x, ball.motion.y, ball.motion.z);
      mesh.rotation.x += (ball.motion.z - z) / radius;
      mesh.rotation.z -= (ball.motion.x - x) / radius;
    });
  });
  return <>
    {nets.map(({ x, z, halfWidth, geometry }) => <group key={x} position={ground(x, z)}>
      <lineSegments geometry={geometry} material={netThread} />
      <Shape geo={box} mat={paint.cream} p={[0, 2.55, 0]} s={[halfWidth * 2, 0.11, 0.07]} />
      {sides.map((side) => <Shape key={side} geo={rod} mat={paint.coral} p={[side * halfWidth, 1.4, 0]} s={[0.1, 2.8, 0.1]} />)}
    </group>)}
    {balls.map(({ spawn: { x, y, z, radius } }, i) => <mesh key={i} ref={(node) => { meshes.current[i] = node; }}
      geometry={sphere} material={ballPaints[i % ballPaints.length]} position={[x, y, z]} scale={radius} rotation={[0.4, i, 0.44]} />)}
  </>;
}

const dolphinSkin = material('#48a9ae', 0.48, 0.25), dolphinBelly = material('#b0e4da', 0.12);
const fin = new THREE.Shape().moveTo(-0.62, 0).quadraticCurveTo(-0.29, 0.85, 0.52, 1.07)
  .quadraticCurveTo(0.26, 0.46, 0.55, 0).closePath();
const finGeo = new THREE.ExtrudeGeometry(fin, { depth: 0.04, steps: 1, bevelThickness: 0.045, bevelSize: 0.045 });
const pod = [1.08, 0.94, 1, 0.86, 0.96];
// The waterward loop skirts the coastline between Wonder Pier and Solis.
const route = new THREE.CatmullRomCurve3([
  [74, -608], [242, -561], [391, -367], [475, -124], [481, 123], [529, 294], [473, 434],
  [709, 359], [714, -271], [418, -672],
].map(([x, z]) => new THREE.Vector3(x, 0, z)), true);
function DolphinPod() {
  const models = useRef<(THREE.Group | null)[]>([]), rings = useRef<(THREE.Mesh | null)[]>([]);
  const { point, heading, foam } = useMemo(() => ({
    point: new THREE.Vector3(), heading: new THREE.Vector3(), foam: pod.map(() => water.clone()),
  }), []);
  useFrame(({ clock }) => {
    const t = clock.elapsedTime;
    pod.forEach((size, i) => {
      const model = models.current[i], ring = rings.current[i];
      if (!model || !ring) return;
      const u = (1.025 + t / 165 - i * 0.0045) % 1;
      const phase = ((t + 8 - i * 0.44) / 7.1) % 1;
      const jump = THREE.MathUtils.clamp((phase - 0.13) / 0.53, 0, 1);
      const lift = Math.sin(jump * Math.PI);
      const side = (i % 2 ? -1 : 1) * (2 + i * 2.3);
      route.getPointAt(u, point);
      route.getTangentAt(u, heading);
      const x = point.x + heading.z * side, z = point.z - heading.x * side;
      model.visible = phase > 0.11 && phase < 0.69;
      model.position.set(x, surface(x, z, t) - 0.99 + lift * (4.55 + i * 0.17), z);
      model.rotation.set(-Math.cos(jump * Math.PI) * 0.83 * Math.min(1, lift * 8), Math.atan2(heading.x, heading.z), 0.13 * Math.sin(phase * TAU), 'YXZ');
      const age = (phase - (phase >= 0.62 ? 0.62 : 0.13)) * 7.1;
      ring.visible = age >= 0 && age < 1.1;
      if (!ring.visible) return;
      const impact = (1 + u - age / 165) % 1;
      route.getPointAt(impact, point);
      route.getTangentAt(impact, heading);
      const sx = point.x + heading.z * side, sz = point.z - heading.x * side;
      ring.position.set(sx, surface(sx, sz, t) + 0.08, sz);
      ring.scale.set(size * (0.42 + age * 2.5), size * (0.42 + age * 2.5), 0.24);
      foam[i].opacity = (1 - age / 1.1) * 0.74;
    });
  });
  return <group name="Leaping dolphin pod">{pod.map((size, i) => <group key={i}>
    <group ref={(node) => { models.current[i] = node; }} scale={size} visible={false}>
      <Shape mat={dolphinSkin} s={[0.64, 0.61, 1.72]} />
      <Shape mat={dolphinBelly} p={[0, -0.31, 0.38]} s={[0.49, 0.29, 1.13]} />
      <Shape mat={dolphinSkin} p={[0, -0.08, 1.52]} s={[0.29, 0.18, 0.64]} />
      <Shape mat={dolphinSkin} p={[0, -0.11, -1.39]} s={[0.27, 0.23, 0.74]} />
      <Shape geo={finGeo} mat={dolphinSkin} p={[0, 0.39, -0.17]} s={[0.74, 0.84, 1]} r={[0, Math.PI / 2, 0]} />
      {sides.map((side) => <group key={side}>
          <Shape mat={dolphinSkin} p={[side * 0.52, -0.24, 0.03]} s={[0.67, 0.09, 0.24]} r={[0, side * 0.46, -side * 0.47]} />
        <Shape mat={dolphinSkin} p={[side * 0.43, -0.16, -1.98]} s={[0.62, 0.068, 0.23]} r={[0, side * 0.37, 0]} />
      </group>)}
    </group>
    <mesh ref={(node) => { rings.current[i] = node; }} geometry={torus} material={foam[i]} rotation={flat} visible={false} />
  </group>)}</group>;
}

function HydroRings() {
  const spinners = useRef<(THREE.Group | null)[]>([]);
  const glow = useMemo(() => HYDRO_RINGS.map(() => new THREE.MeshStandardMaterial({
    color: aqua, emissive: aqua, emissiveIntensity: 0.9, metalness: 0.34, roughness: 0.26,
  })), []);
  useFrame(({ clock }) => {
    const t = clock.elapsedTime, active = coastalNow() < simState.coastal.hydroUntil;
    spinners.current.forEach((spinner, i) => {
      if (!spinner) return;
      const boosted = active && simState.coastal.hydroRing === i;
      spinner.rotation.z = t * (i % 2 ? -0.9 : 0.9);
      glow[i].emissiveIntensity = boosted ? 3.1 + Math.sin(t * 19) : 0.9 + Math.sin(t * 3 + i) * 0.24;
      spinner.scale.setScalar(boosted ? 1.04 + Math.sin(t * 14) * 0.045 : 1);
    });
  });
  return <>{HYDRO_RINGS.map(({ x, y, z, yaw }, i) => <group key={x} name="Hydro-Boost" position={[x, y, z]} rotation-y={yaw}>
    <group ref={(node) => { spinners.current[i] = node; }}>
      <Shape geo={torus} mat={glow[i]} s={[5.5, 5.5, 1.8]} />
      <Shape geo={torus} mat={paint.gold} s={[5.92, 5.92, 1.85]} />
      {Array.from({ length: 8 }, (_, j) => <Shape key={j} geo={jewel} mat={glow[i]}
        p={[5.91 * Math.cos(j * TAU / 8), 5.91 * Math.sin(j * TAU / 8), 0]} s={0.34} />)}
    </group>
  </group>)}</>;
}

function StreetPerformer() {
  const body = useRef<THREE.Group>(null), limbs = useRef<(THREE.Group | null)[]>([]);
  const mirror = useRef({ active: false, start: 0, id: 0 });
  const { x, z } = PERFORMER;
  const position = ground(x, z);
  useFrame(({ clock }, dt) => {
    const t = clock.elapsedTime, now = coastalNow(), { reaction, burst } = simState.coastal;
    const emote = reaction.kind === 'emote' && now < reaction.until;
    const active = playing() && (simState.lobbyEmoteTimer > 0 || emote);
    if (active && (!mirror.current.active || (emote && reaction.id !== mirror.current.id))) {
      mirror.current.start = t;
      if (burst.kind !== 'performer' || burst.until <= now + 1.25) coastalBurst('performer', x, position[1] + 1.2, z);
    }
    mirror.current.active = active;
    if (emote) mirror.current.id = reaction.id;
    const beat = (active ? t - mirror.current.start : t) * 6, wave = Math.sin(beat), step = Math.cos(beat);
    const move = active ? simState.activeEmote : null;
    if (!body.current) return;
    body.current.position.y = 0.06 + Math.abs(wave) * (move === 'SHUFFLE' ? 0.23 : 0.12);
    body.current.rotation.y = move === 'SPIN' ? beat : Math.atan2(Math.sin(body.current.rotation.y), Math.cos(body.current.rotation.y)) *
      Math.exp(-dt * 8) + wave * dt;
    limbs.current.forEach((limb, i) => {
      if (!limb) return;
      const side = sides[i % 2];
      if (i < 2) {
        const pose = move === 'WAVE' && i === 1 ? 2.6 + wave * 0.32 :
          move === 'FLEX' ? 1.8 : move === 'SPIN' ? 1.1 : move === 'DANCE' ? 1.3 + side * wave * 0.65 : 0.32 + side * wave * 0.35;
        limb.rotation.z = THREE.MathUtils.damp(limb.rotation.z, side * pose, 12, dt);
      } else {
        limb.rotation.x = side * step * (move === 'SHUFFLE' ? 0.67 : 0.31);
      }
    });
  });
  return <group name="Boardwalk street performer" position={position}>
    {Array.from({ length: 24 }, (_, i) => <Shape key={i} geo={box}
      mat={(i + Math.floor(i / 6)) % 2 ? paint.coral : paint.cream} p={[i % 6 * 0.65 - 1.625, 0.025, Math.floor(i / 6) * 0.63 - 0.945]} s={[0.65, 0.05, 0.63]} />)}
    <Shape geo={box} mat={paint.dark} p={[-1.34, 0.28, -0.54]} s={[0.92, 0.45, 0.35]} />
    {sides.map((side) => <Shape key={side} mat={paint.aqua} p={[-1.34 + side * 0.24, 0.27, -0.36]} s={[0.16, 0.16, 0.032]} />)}
    <Shape geo={rod} mat={paint.gold} p={[1.32, 0.09, 0.74]} s={[0.43, 0.12, 0.34]} />
    <Shape geo={rod} mat={paint.dark} p={[1.32, 0.19, 0.74]} s={[0.28, 0.17, 0.23]} />
    <group ref={body}>
      <Shape mat={paint.aqua} p={[0, 1.31, 0]} s={[0.39, 0.52, 0.23]} />
      <Shape mat={paint.skin} p={[0, 1.98, 0]} s={[0.27, 0.31, 0.25]} />
      <Shape mat={paint.coral} p={[0, 2.18, 0.025]} s={[0.29, 0.13, 0.27]} />
      {sides.map((side, i) => <group key={side}>
        <group ref={(node) => { limbs.current[i] = node; }} position={[side * 0.34, 1.64, 0]}>
          <Shape mat={paint.aqua} p={[0, -0.19, 0]} s={[0.128, 0.28, 0.12]} />
          <Shape mat={paint.skin} p={[0, -0.43, 0.06]} s={[0.09, 0.2, 0.087]} />
        </group>
        <group ref={(node) => { limbs.current[i + 2] = node; }} position={[side * 0.18, 0.96, 0]}>
          <Shape mat={paint.dark} p={[0, -0.42, 0]} s={[0.145, 0.45, 0.14]} />
          <Shape mat={paint.cream} p={[0, -0.91, 0.1]} s={[0.15, 0.09, 0.24]} />
        </group>
      </group>)}
    </group>
  </group>;
}

const burstSizes = { spring: [4.4, 3], ball: [2.7, 1.75], jackpot: [11, 8], performer: [2.8, 2.65] };
function Celebrations() {
  const fx = useRef<THREE.Group>(null), ring = useRef<THREE.Mesh>(null), flakes = useRef<THREE.InstancedMesh>(null);
  const seen = useRef(0);
  const { ringMat, flakeMat, dummy, color } = useMemo(() => ({
    ringMat: new THREE.MeshBasicMaterial({ color: goldColor, transparent: true, depthWrite: false }),
    flakeMat: new THREE.MeshBasicMaterial({ transparent: true, depthWrite: false }),
    dummy: new THREE.Object3D(), color: new THREE.Color(),
  }), []);
  useFrame(() => {
    if (!fx.current || !ring.current || !flakes.current) return;
    const { id, kind, x, y, z, until } = simState.coastal.burst;
    const mesh = flakes.current, remaining = until - coastalNow();
    fx.current.visible = id > 0 && remaining > 0;
    if (!fx.current.visible) return;
    if (seen.current !== id) {
      seen.current = id;
      fx.current.position.set(x, y, z);
      for (let i = 0; i < mesh.count; i++) mesh.setColorAt(i, color.set(rainbow[i % rainbow.length]));
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    }
    const [width, height] = burstSizes[kind];
    const life = THREE.MathUtils.clamp(1 - remaining / 1.45, 0, 1);
    const radius = width * (1 - (1 - life) ** 2);
    ring.current.scale.set(radius + 0.2, radius + 0.2, 0.45);
    ringMat.opacity = (1 - life) ** 2;
    flakeMat.opacity = Math.min(1, remaining * 2.5);
    for (let i = 0; i < mesh.count; i++) {
      const a = i * 2.39996 + life * 0.45, d = radius * (0.35 + i % 11 / 16);
      dummy.position.set(Math.cos(a) * d, 4 * height * life * (1 - life) * (0.59 + i % 7 / 14), Math.sin(a) * d);
      dummy.rotation.set(i + life * 8, i * 0.4 + life * 4, life * 6);
      const size = (0.065 + i % 4 * 0.032) * (1 - life * 0.65);
      dummy.scale.set(size, size * 0.48, size * 1.7);
      dummy.updateMatrix();
      mesh.setMatrixAt(i, dummy.matrix);
    }
    mesh.instanceMatrix.needsUpdate = true;
  });
  return <group name="Coastal celebrations" ref={fx} visible={false}>
    <mesh ref={ring} geometry={torus} material={ringMat} rotation={flat} />
    <instancedMesh ref={flakes} args={[jewel, flakeMat, 42]} frustumCulled={false} />
  </group>;
}

const Scene = memo(() => <>
  <GoldenDuck /><Trampolines />
  {POSTCARDS.map((card) => <Postcard key={card.id} card={card} />)}
  <BeachGames /><DolphinPod /><HydroRings /><StreetPerformer /><Celebrations />
</>);
export function QuirkyWorld() { return <Scene />; }
