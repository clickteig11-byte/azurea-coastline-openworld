import { memo, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { simState } from '../game/store';
import { AZUREA_RAMPS, COASTAL_ATOLLS, getTerrainHeight, getWaveHeight, marineRampHeight, SOLIS_JETTY, SURF_VILLAGE } from '../game/worldMath';

type XYZ = [number, number, number];
const box = new THREE.BoxGeometry();
const sphere = new THREE.SphereGeometry(1, 18, 12);
const cylinder = new THREE.CylinderGeometry(1, 1, 1, 20);
const tapered = new THREE.CylinderGeometry(0.78, 1, 1, 40);
const roof = new THREE.ConeGeometry(1, 1, 32);
const dockWood = ['#956044', '#ad7652', '#ba8560', '#a47150', '#c39069'];
const materials = new Map<string, THREE.MeshStandardMaterial>();
function finish(color: string) {
  let material = materials.get(color);
  if (!material) {
    material = new THREE.MeshStandardMaterial({ color, roughness: 0.77 });
    materials.set(color, material);
  }
  return material;
}

const brass = new THREE.MeshStandardMaterial({ color: '#dcae54', roughness: 0.33, metalness: 0.63 });
const glass = new THREE.MeshPhysicalMaterial({ color: '#a9e4e6', metalness: 0.18, roughness: 0.12, transparent: true, opacity: 0.29, depthWrite: false, side: THREE.DoubleSide });
const warm = new THREE.MeshStandardMaterial({ color: '#fff1bc', emissive: '#ffae46', emissiveIntensity: 1.35 });
const cream = '#fff0d6';
const red = '#bd3938';
const teal = '#179b9f';
const darkWood = '#573d35';

function Block({ p, s, color, yaw = 0 }: { p: XYZ; s: XYZ; color: string; yaw?: number }) {
  return <mesh geometry={box} material={finish(color)} position={p} scale={s} rotation-y={yaw} />;
}

function TimberDeck({ width, length, alongX = false }: { width: number; length: number; alongX?: boolean }) {
  const boards = useMemo(() => {
    const count = Math.ceil(length / 0.7);
    const pitch = length / count;
    const matrices: THREE.Matrix4[] = [];
    const colors: THREE.Color[] = [];
    for (let index = 0; index < count; index++) {
      const distance = (index + 0.5) * pitch - length / 2;
      matrices.push(new THREE.Matrix4().makeScale(alongX ? pitch - 0.026 : width, 0.22, alongX ? width : pitch - 0.026)
        .setPosition(alongX ? distance : 0, -0.11, alongX ? 0 : distance));
      colors.push(new THREE.Color(dockWood[(index * 7 + Math.floor(index / 7)) % dockWood.length]));
    }
    return { matrices, colors };
  }, [alongX, length, width]);
  return <instancedMesh args={[box, finish('#ffffff'), boards.matrices.length]} receiveShadow ref={(mesh) => {
    if (!mesh) return;
    boards.matrices.forEach((matrix, i) => {
      mesh.setMatrixAt(i, matrix);
      mesh.setColorAt(i, boards.colors[i]);
    });
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    mesh.computeBoundingSphere();
  }} />;
}

function Piling({ x, z, top }: { x: number; z: number; top: number }) {
  const bottom = Math.min(top - 0.45, getTerrainHeight(x, z) - 0.2);
  return <mesh geometry={cylinder} material={finish(darkWood)} position={[x, (top + bottom) / 2, z]} scale={[0.22, top - bottom, 0.22]} />;
}

function Lantern({ p }: { p: XYZ }) {
  return <group position={p}>
    <mesh geometry={cylinder} material={finish(darkWood)} position-y={0.55} scale={[0.065, 1.1, 0.065]} />
    <mesh geometry={box} material={warm} position-y={1.23} scale={[0.23, 0.32, 0.23]} />
    <mesh geometry={roof} material={brass} position-y={1.46} scale={[0.22, 0.16, 0.22]} />
    <Block p={[0, 1.06, 0]} s={[0.33, 0.07, 0.33]} color={darkWood} />
  </group>;
}

const leaf = (() => {
  const positions: number[] = [];
  const indices: number[] = [];
  for (let i = 0; i <= 12; i++) {
    const t = i / 12;
    const width = 0.04 + 0.56 * Math.sin(Math.PI * t) ** 1.25;
    const y = 0.98 * Math.sin(Math.PI * t) - 1.03 * t * t;
    positions.push(-width, y - width * 0.38, t * 3.5, 0, y, t * 3.5, width, y - width * 0.38, t * 3.5);
    if (i > 0) {
      const a = (i - 1) * 3;
      indices.push(a, a + 3, a + 1, a + 1, a + 3, a + 4, a + 1, a + 4, a + 2, a + 2, a + 4, a + 5);
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return geometry;
})();
const leaves = ['#236d4d', '#408955', '#66a152'].map((color) =>
  new THREE.MeshStandardMaterial({ color, roughness: 0.85, side: THREE.DoubleSide }));
const stalk = new THREE.CylinderGeometry(0.17, 0.32, 1, 9);
const boulder = new THREE.DodecahedronGeometry(1, 0);
function Palm({ x, z, size, yaw }: { x: number; z: number; size: number; yaw: number }) {
  const height = 5.1;
  return <group position={[x, getTerrainHeight(x, z) - 0.15, z]} rotation-y={yaw} scale={size}>
    <mesh geometry={stalk} material={finish('#997151')} position={[0.37, height / 2, 0]} rotation-z={-0.145} scale-y={height + 0.12} />
    <group position={[0.75, height, 0]}>
      <mesh geometry={sphere} material={finish('#65753a')} scale={[0.36, 0.36, 0.35]} />
      {Array.from({ length: 8 }, (_, i) => <mesh key={i} geometry={leaf} material={leaves[i % leaves.length]}
        rotation={[i % 2 ? 0.05 : -0.26, i * Math.PI / 4, 0]} scale={i % 2 ? 0.88 : 1} />)}
    </group>
  </group>;
}

type PalmSpot = [x: number, z: number, size: number];
function Palms({ spots }: { spots: readonly PalmSpot[] }) {
  return <>{spots.map(([x, z, size], i) => <Palm key={x + ':' + z} x={x} z={z} size={size} yaw={i * 2.4} />)}</>;
}

function RockCluster({ x, z, radius, count = 7 }: { x: number; z: number; radius: number; count?: number }) {
  return <>{Array.from({ length: count }, (_, i) => {
    const angle = i * 2.39996;
    const dx = x + Math.cos(angle) * radius * Math.sqrt(i / count);
    const dz = z + Math.sin(angle) * radius * Math.sqrt(i / count);
    const size = 0.8 + (i % 4) * 0.47;
    return <mesh key={i} geometry={boulder} material={finish(['#6f6960', '#92867a', '#a29983'][i % 3])}
      position={[dx, getTerrainHeight(dx, dz) + size * 0.14, dz]} scale={[size * 1.35, size * 0.72, size]}
      rotation={[i * 0.73, angle, i * 0.15]} />;
  })}</>;
}

const beamLength = 92;
const beamGeometry = new THREE.CylinderGeometry(0.18, 8.1, beamLength, 48, 1, true);
const beamMaterial = new THREE.ShaderMaterial({
  transparent: true, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending,
  vertexShader: `
    varying vec3 vNormal;
    varying vec3 vView;
    varying float vDistance;
    void main() {
      vec4 view = modelViewMatrix * vec4(position, 1.0);
      vNormal = normalMatrix * normal;
      vView = -view.xyz;
      vDistance = 0.5 - position.y / 92.0;
      gl_Position = projectionMatrix * view;
    }`,
  fragmentShader: `
    varying vec3 vNormal;
    varying vec3 vView;
    varying float vDistance;
    void main() {
      float rim = 1.0 - abs(dot(normalize(vNormal), normalize(vView + vec3(0.0, 0.0, 0.0001))));
      float alpha = (0.022 + 0.035 * rim * rim) * pow(1.0 - clamp(vDistance, 0.0, 1.0), 1.5);
      gl_FragColor = vec4(1.0, 0.78, 0.40, alpha);
      #include <colorspace_fragment>
    }`,
});

function Lighthouse() {
  const rotor = useRef<THREE.Group>(null);
  const { x, z } = COASTAL_ATOLLS.solis;
  useFrame(({ clock }) => {
    if (rotor.current) rotor.current.rotation.y = clock.elapsedTime * 0.34;
  });
  const bands = 8;
  const towerHeight = 14.4;
  const radiusAt = (t: number) => 2.65 - 0.8 * t;
  const belt = useMemo(() => Array.from({ length: bands }, (_, i) =>
    new THREE.CylinderGeometry(radiusAt((i + 1) / bands), radiusAt(i / bands), towerHeight / bands, 40)), []);
  return <group position={[x, getTerrainHeight(x, z), z]}>
    <mesh geometry={cylinder} material={finish('#bfb6a2')} position-y={0.1} scale={[3.1, 0.56, 3.1]} />
    {belt.map((geometry, i) => <mesh key={i} geometry={geometry} material={finish(i % 2 ? red : cream)}
      position-y={(i + 0.5) * towerHeight / bands} castShadow />)}
    <Block p={[0, 1.25, 2.59]} s={[1.25, 2.5, 0.18]} color={cream} />
    <Block p={[0, 1.11, 2.7]} s={[0.95, 2.22, 0.12]} color='#264d54' />
    {[4.45, 8.1, 11.65].map((y, i) => <group key={y} rotation-y={i * 2.1}>
      <Block p={[0, y, radiusAt(y / towerHeight) + 0.025]} s={[0.72, 0.94, 0.14]} color={cream} />
      <Block p={[0, y + 0.015, radiusAt(y / towerHeight) + 0.1]} s={[0.5, 0.7, 0.045]} color='#45666c' />
    </group>)}
    <mesh geometry={cylinder} material={finish(cream)} position-y={14.5} scale={[2.62, 0.34, 2.62]} />
    <mesh geometry={cylinder} material={brass} position-y={14.7} scale={[1.66, 0.14, 1.66]} />
    <mesh geometry={cylinder} material={glass} position-y={15.92} scale={[1.57, 2.36, 1.57]} />
    {Array.from({ length: 12 }, (_, i) => {
      const a = i * Math.PI / 6;
      return <group key={i} rotation-y={a}>
        <mesh geometry={cylinder} material={brass} position={[0, 15.94, 1.57]} scale={[0.052, 2.46, 0.052]} />
        <mesh geometry={cylinder} material={brass} position={[0, 15.11, 2.45]} scale={[0.045, 0.95, 0.045]} />
        <Block p={[0, 15.56, 2.38]} s={[1.27, 0.065, 0.065]} color='#a27d45' />
      </group>;
    })}
    <mesh geometry={cylinder} material={brass} position-y={17.13} scale={[1.74, 0.15, 1.74]} />
    <mesh geometry={roof} material={finish(red)} position-y={17.83} scale={[1.91, 1.4, 1.91]} />
    <mesh geometry={cylinder} material={brass} position-y={18.75} scale={[0.09, 0.62, 0.09]} />
    <mesh geometry={sphere} material={brass} position-y={19.08} scale={0.21} />
    <group ref={rotor} position-y={15.94}>
      <mesh geometry={sphere} material={warm} scale={[0.58, 0.6, 0.58]} />
      <mesh geometry={cylinder} material={brass} position-z={0.52} rotation-x={Math.PI / 2} scale={[0.53, 0.14, 0.53]} />
      <mesh geometry={sphere} material={warm} position-z={0.61} scale={[0.47, 0.47, 0.15]} />
      <mesh geometry={beamGeometry} material={beamMaterial} position-z={beamLength / 2 + 0.64} rotation-x={-Math.PI / 2} />
    </group>
  </group>;
}

function ShingledRoof({ width, depth, height, y, color }: { width: number; depth: number; height: number; y: number; color: string }) {
  const run = width / 2;
  return <group position-y={y}>
    {[-1, 1].map((side) => <mesh key={side} geometry={box} material={finish(color)}
      position={[side * run / 2, height / 2, 0]} rotation-z={-side * Math.atan2(height, run)}
      scale={[Math.hypot(run, height) + 0.2, 0.16, depth]} />)}
  </group>;
}

function Cabin({ x, z }: { x: number; z: number }) {
  return <group position={[x, getTerrainHeight(x, z) + 0.12, z]} rotation-y={0.34}>
    <Block p={[0, 0, 0]} s={[6.5, 0.4, 5.6]} color={darkWood} />
    <Block p={[0, 1.35, 0]} s={[5.8, 2.7, 4.6]} color='#d5a877' />
    <ShingledRoof width={6.6} depth={5.35} y={2.7} height={1.4} color='#744b43' />
    {[-1.75, 1.75].map((xx) => <group key={xx} position-x={xx}>
      <Block p={[0, 1.6, 2.32]} s={[1.42, 1.12, 0.09]} color={cream} />
      <Block p={[0, 1.6, 2.38]} s={[1.15, 0.87, 0.06]} color='#537b81' />
    </group>)}
    <Block p={[0, 1.08, 2.35]} s={[1.05, 2.16, 0.12]} color='#3a7670' />
    <Lantern p={[2.6, 0, 2.75]} />
    <Block p={[1.8, 3.49, -0.98]} s={[0.7, 1.3, 0.8]} color='#8d7970' />
  </group>;
}

function Solis() {
  const { x, z, endX, y } = SOLIS_JETTY;
  const { x: summitX, z: summitZ } = COASTAL_ATOLLS.solis;
  const diveX = summitX + 36;
  const diveZ = summitZ + 29;
  const deckY = getTerrainHeight(diveX, diveZ - 3.4) + 0.34;
  return <group name="Solis Lighthouse Atoll">
    <Lighthouse />
    <group position={[(x + endX) / 2, y, z]}>
      <TimberDeck width={5.2} length={endX - x} alongX />
      {[-2.46, 2.46].map((side) => <Block key={side} p={[0, -0.23, side]} s={[endX - x, 0.27, 0.17]} color={darkWood} />)}
    </group>
    {Array.from({ length: 7 }, (_, i) => x + 1 + i * (endX - x - 2) / 6).map((xx, i) => <group key={xx}>
      {[-2.12, 2.12].map((side) => <Piling key={side} x={xx} z={z + side} top={y + 0.27} />)}
      {i % 2 === 0 ? <Lantern p={[xx, y, z - 2.12]} /> : <group position={[xx, y + 0.46, z + 2.12]}>
        <mesh geometry={cylinder} material={brass} scale={[0.15, 0.48, 0.15]} />
        <mesh geometry={cylinder} material={brass} position-y={0.26} scale={[0.22, 0.1, 0.22]} />
      </group>}
    </group>)}
    <group position={[diveX, deckY, diveZ]}>
      <TimberDeck width={4.4} length={7.4} />
      {[-1.9, 1.9].map((side) => <group key={side} position-x={side}>
        <Block p={[0, 0.98, -1.05]} s={[0.13, 0.13, 5.1]} color={darkWood} />
        {[-3.4, -0.9, 1.5].map((zz) => <Block key={zz} p={[0, 0.5, zz]} s={[0.14, 1.1, 0.14]} color={darkWood} />)}
      </group>)}
      <Block p={[0, 0.024, 3.12]} s={[3.2, 0.05, 0.7]} color={red} />
      <Lantern p={[-1.9, 0, -3.4]} />
    </group>
    {[-1.75, 1.75].flatMap((dx) => [-2.8, 2.8].map((dz) =>
      <Piling key={dx + ':' + dz} x={diveX + dx} z={diveZ + dz} top={deckY} />))}
    <RockCluster x={477} z={381} radius={13} count={14} />
    <RockCluster x={490} z={318} radius={9} />
    <RockCluster x={399} z={396} radius={11} />
    <Cabin x={451} z={322} />
    <Palms spots={[[444, 320, 1.05], [449, 314, 0.82], [459, 325, 1.1], [462, 331, 0.86],
      [422, 369, 1.16], [426, 373, 0.9], [434, 371, 1.05], [409, 319, 0.94], [417, 312, 1.05]]} />
  </group>;
}

const rampColors = [teal, '#f4bf55', '#fef3d3', '#167279'].map(finish);
function Ramp({ ramp }: { ramp: typeof AZUREA_RAMPS[number] }) {
  const { x, z, width, length } = ramp;
  const surface = useMemo(() => {
    const positions: number[] = [];
    const geometry = new THREE.BufferGeometry();
    const height = (longitudinal: number) => marineRampHeight(x, z + Math.min(length, Math.max(0, longitudinal))) ?? 0.24;
    function strip(left: number, right: number, start: number, end: number, material: number, chevron = false) {
      const segments = Math.max(1, Math.ceil((end - start) * 2));
      const vertexStart = positions.length / 3;
      for (let i = 0; i < segments; i++) {
        const a = THREE.MathUtils.lerp(start, end, i / segments);
        const b = THREE.MathUtils.lerp(start, end, (i + 1) / segments);
        const aL = a - (chevron ? Math.abs(left) * 0.34 : 0);
        const aR = a - (chevron ? Math.abs(right) * 0.34 : 0);
        const bL = b - (chevron ? Math.abs(left) * 0.34 : 0);
        const bR = b - (chevron ? Math.abs(right) * 0.34 : 0);
        const lift = chevron ? 0.018 : 0;
        positions.push(left, height(aL) + lift, aL, left, height(bL) + lift, bL, right, height(aR) + lift, aR,
          right, height(aR) + lift, aR, left, height(bL) + lift, bL, right, height(bR) + lift, bR);
      }
      geometry.addGroup(vertexStart, segments * 6, material);
    }
    strip(-width / 2 + 0.7, width / 2 - 0.7, 0, length, 0);
    strip(-width / 2, -width / 2 + 0.7, 0, length, 1);
    strip(width / 2 - 0.7, width / 2, 0, length, 1);
    for (const tip of [5.6, 10.9, 16.2, 21.5, 25.6]) {
      strip(-3.9, 0, tip, tip + 0.48, 2, true);
      strip(0, 3.9, tip, tip + 0.48, 2, true);
    }
    for (const side of [-1, 1]) {
      const edge = side * width / 2;
      const start = positions.length / 3;
      for (let i = 0; i < 36; i++) {
        const a = i * length / 36;
        const b = (i + 1) * length / 36;
        const u = [edge, height(a), a];
        const v = [edge, height(b), b];
        const lowerA = [edge, -0.42, a];
        const lowerB = [edge, -0.42, b];
        positions.push(...(side < 0 ? [...u, ...lowerA, ...v, ...v, ...lowerA, ...lowerB] :
          [...u, ...v, ...lowerA, ...v, ...lowerB, ...lowerA]));
      }
      geometry.addGroup(start, 36 * 6, 3);
    }
    const end = positions.length / 3;
    positions.push(-width / 2, -0.42, length, width / 2, -0.42, length, -width / 2, height(length), length,
      width / 2, -0.42, length, width / 2, height(length), length, -width / 2, height(length), length);
    geometry.addGroup(end, 6, 3);
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geometry.computeVertexNormals();
    return geometry;
  }, [length, width, x, z]);
  return <group position={[x, 0, z]}>
    <mesh geometry={surface} material={rampColors} receiveShadow />
    {[-1, 1].map((side) => <group key={side}>
      <Floating x={side * (width / 2 + 1.05)} z={length * 0.42} waveX={x} waveZ={z}>
        <Block p={[0, -0.12, 0]} s={[1.85, 0.79, length * 0.9]} color='#247d83' />
        <Block p={[0, 0.25, 0]} s={[1.92, 0.13, length * 0.91]} color='#e7ab55' />
      </Floating>
      {[0.7, length - 0.6].map((zz) => <Lantern key={zz}
        p={[side * (width / 2 + 0.18), marineRampHeight(x, z + zz) ?? 0.24, zz]} />)}
    </group>)}
  </group>;
}

function Floating({ x, z, waveX = 0, waveZ = 0, yaw = 0, children }: {
  x: number; z: number; waveX?: number; waveZ?: number; yaw?: number; children: React.ReactNode;
}) {
  const float = useRef<THREE.Group>(null);
  useFrame(({ clock }) => {
    const t = clock.elapsedTime;
    const wx = waveX + x;
    const wz = waveZ + z;
    if (!float.current) return;
    float.current.position.y = simState.tideOffset + getWaveHeight(wx, wz, t);
    float.current.rotation.z = (getWaveHeight(wx + 1.6, wz, t) - getWaveHeight(wx - 1.6, wz, t)) * 0.07;
  });
  return <group position={[x, 0, z]} rotation-y={yaw}><group ref={float}>{children}</group></group>;
}

function MarinaDock({ x, z, width, length, yaw = 0 }: { x: number; z: number; width: number; length: number; yaw?: number }) {
  return <Floating x={x} z={z} yaw={yaw}>
    <Block p={[0, 0.05, 0]} s={[width, 0.65, length]} color='#428e89' />
    <group position-y={0.65}><TimberDeck width={width} length={length} /></group>
    {[-1, 1].map((side) => <group key={side}>
      <Block p={[side * width / 2, 0.37, 0]} s={[0.15, 0.22, length]} color={cream} />
      <Lantern p={[side * (width / 2 - 0.38), 0.66, side * (length / 2 - 0.63)]} />
    </group>)}
  </Floating>;
}

function Azurea() {
  const { x, z } = COASTAL_ATOLLS.azurea;
  return <group name="Azurea Stunt Atoll and Floating Marina Reef">
    {AZUREA_RAMPS.map((ramp) => <Ramp key={ramp.x} ramp={ramp} />)}
    <MarinaDock x={x + 18} z={z - 10} width={4} length={25} yaw={Math.PI / 2} />
    <MarinaDock x={x + 8} z={z - 1} width={3.2} length={13.5} />
    <MarinaDock x={x + 24} z={z - 1.5} width={3.2} length={12.5} />
    <MarinaDock x={x + 36} z={z - 13} width={3.2} length={17} yaw={0.13} />
    {[[52, -35], [58, -29], [63, -21], [66, -13], [66, -4], [63, 4]].map(([dx, dz], i) =>
      <Floating key={dx + ':' + dz} x={x + dx} z={z + dz}>
        <mesh geometry={sphere} material={finish(i % 2 ? '#f3c458' : '#ec684e')} position-y={0.15} scale={[0.72, 0.53, 0.72]} />
        <mesh geometry={cylinder} material={finish(cream)} position-y={0.26} scale={[0.68, 0.12, 0.68]} />
        <mesh geometry={cylinder} material={brass} position-y={0.64} scale={[0.06, 0.31, 0.06]} />
        <mesh geometry={sphere} material={warm} position-y={0.8} scale={0.13} />
      </Floating>)}
    <RockCluster x={x - 26} z={z - 28} radius={13} />
    <RockCluster x={x + 28} z={z - 39} radius={11} />
    <RockCluster x={x + 34} z={z + 25} radius={12} />
    <Palms spots={[[x - 18, z - 11, 1.12], [x - 26, z - 18, 0.9], [x - 14, z - 22, 1],
      [x - 26, z + 21, 1.15], [x - 20, z + 25, 0.9], [x + 14, z + 31, 0.95], [x + 22, z + 35, 1.12],
      [x + 32, z - 32, 0.82], [x + 35, z - 29, 1.05]]} />
  </group>;
}

const signMaterials = new Map<string, THREE.MeshBasicMaterial>();
function VillageSign({ text, color }: { text: string; color: string }) {
  const material = useMemo(() => {
    if (typeof document === 'undefined') return undefined;
    const key = text + color;
    const cached = signMaterials.get(key);
    if (cached) return cached;
    const canvas = document.createElement('canvas');
    canvas.width = 256;
    canvas.height = 64;
    const ctx = canvas.getContext('2d');
    if (!ctx) return undefined;
    ctx.fillStyle = cream;
    ctx.fillRect(0, 0, 256, 64);
    ctx.strokeStyle = color;
    ctx.lineWidth = 3;
    ctx.strokeRect(5, 5, 246, 54);
    ctx.fillStyle = color;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = 'bold 34px Georgia, serif';
    ctx.fillText(text, 128, 34, 230);
    const map = new THREE.CanvasTexture(canvas);
    map.colorSpace = THREE.SRGBColorSpace;
    const next = new THREE.MeshBasicMaterial({ map });
    signMaterials.set(key, next);
    return next;
  }, [color, text]);
  return material ? <mesh geometry={box} material={material} position={[0, 2.29, 1.71]} scale={[2.75, 0.68, 0.04]} /> : null;
}

const surfboardMaterial = ['#e57e69', cream, '#3aadb1'].map(finish);
const surfboardGeometry = (() => {
  const geometry = new THREE.SphereGeometry(1, 24, 16);
  geometry.clearGroups();
  for (let row = 0; row < 16; row++) {
    const start = row === 0 ? 0 : (row * 2 - 1) * 72;
    const count = row === 0 || row === 15 ? 72 : 144;
    geometry.addGroup(start, count, row === 4 || row === 10 ? 1 : row >= 5 && row <= 9 ? 2 : 0);
  }
  return geometry;
})();

function Shack({ x, z, y, yaw, color, sign }: { x: number; z: number; y: number; yaw: number; color: string; sign: string }) {
  const snack = sign !== 'SURF SHOP' && sign !== 'BOARD HIRE';
  return <group position={[x, y, z]} rotation-y={yaw}>
    <Block p={[0, 0.09, 0]} s={[5.05, 0.2, 3.83]} color={darkWood} />
    <Block p={[0, 1.34, 0]} s={[4.6, 2.66, 3.38]} color={color} />
    <ShingledRoof width={5.05} depth={3.9} height={0.91} y={2.67} color={snack ? '#ad6557' : '#618d86'} />
    <Block p={[0, 1.19, 1.71]} s={[3.1, 1.37, 0.08]} color={darkWood} />
    <Block p={[0, 1.16, 1.76]} s={[2.84, 1.08, 0.04]} color={snack ? '#385352' : '#7dc2c0'} />
    <Block p={[0, 0.68, 1.91]} s={[3.4, 0.12, 0.62]} color={cream} />
    <VillageSign text={sign} color='#29585b' />
    {snack ? <group position={[0, 1.94, 2.31]} rotation-x={0.25}>
      {Array.from({ length: 10 }, (_, i) => <group key={i} position-x={(i - 4.5) * 0.38}>
        <Block p={[0, 0, 0]} s={[0.38, 0.075, 1.33]} color={i % 2 ? cream : color} />
        <Block p={[0, -0.12, 0.65]} s={[0.38, 0.2, 0.065]} color={i % 2 ? cream : color} />
      </group>)}
    </group> : [-1, 1, 2].map((side) => <group key={side} position={[side < 0 ? -2.03 : 1.65 + side * 0.34, 1.28, 1.89]}
      rotation={[0.14, side * 0.26, side * -0.14]}>
      <mesh geometry={surfboardGeometry} material={surfboardMaterial} scale={[0.31, 1.24, 0.075]} />
    </group>)}
  </group>;
}

function Cabana({ x, z, yaw }: { x: number; z: number; yaw: number }) {
  return <group position={[x, getTerrainHeight(x, z), z]} rotation-y={yaw}>
    <group position-y={0.23}><TimberDeck width={3.8} length={3.45} /></group>
    {[-1.6, 1.6].flatMap((xx) => [-1.4, 1.4].map((zz) =>
      <Block key={xx + ':' + zz} p={[xx, 1.55, zz]} s={[0.13, 2.65, 0.13]} color={cream} />))}
    <group position-y={2.83} rotation-z={0.08}>
      {Array.from({ length: 8 }, (_, i) => <Block key={i} p={[(i - 3.5) * 0.32, 0, 0]} s={[0.34, 0.13, 3.55]} color={i % 2 ? cream : '#63aead'} />)}
    </group>
    <Block p={[0, 0.57, -0.54]} s={[2.6, 0.33, 0.82]} color='#e8ba93' />
  </group>;
}

function Festoon({ from, to, drop }: { from: XYZ; to: XYZ; drop: number }) {
  const { wire, bulbs } = useMemo(() => {
    const path = new THREE.CatmullRomCurve3(Array.from({ length: 9 }, (_, i) => {
      const t = i / 8;
      return new THREE.Vector3(
        THREE.MathUtils.lerp(from[0], to[0], t),
        THREE.MathUtils.lerp(from[1], to[1], t) - drop * 4 * t * (1 - t),
        THREE.MathUtils.lerp(from[2], to[2], t),
      );
    }));
    return { wire: new THREE.TubeGeometry(path, 20, 0.023, 5, false),
      bulbs: Array.from({ length: 14 }, (_, i) => path.getPoint((i + 1) / 15)) };
  }, [drop, from, to]);
  return <>
    <mesh geometry={wire} material={finish(darkWood)} />
    {bulbs.map((p, i) => <mesh key={i} geometry={sphere} material={warm} position={[p.x, p.y - 0.11, p.z]} scale={[0.092, 0.15, 0.092]} />)}
  </>;
}

function Stage() {
  return <group position={[60, SURF_VILLAGE.boardwalkY, -478.5]}>
    <group position={[0, 0.63, -8.7]}>
      <TimberDeck width={15.8} length={6.7} />
      <Block p={[0, -0.38, 0]} s={[15.7, 0.68, 6.6]} color={darkWood} />
      <Block p={[0, 1.29, -3.14]} s={[14.7, 2.6, 0.23]} color='#317875' />
      {[-5.9, 5.9].map((x) => <group key={x} position-x={x}>
        <Block p={[0, 0.76, 1.3]} s={[0.93, 1.5, 0.86]} color='#313b42' />
        {[0.42, 1.02].map((y) => <mesh key={y} geometry={cylinder} material={finish('#545e62')}
          position={[0, y, 1.75]} scale={[0.26, 0.055, 0.26]} rotation-x={Math.PI / 2} />)}
      </group>)}
    </group>
    {[-7.5, 7.5].flatMap((x) => [-11, -4.9, 3.1].map((z) =>
      <Block key={x + ':' + z} p={[x, 2.62, z]} s={[0.16, 5.24, 0.16]} color={darkWood} />))}
    <Festoon from={[-7.5, 5.24, -11]} to={[7.5, 5.24, -11]} drop={1.02} />
    <Festoon from={[-7.5, 5.24, -4.9]} to={[7.5, 5.24, -4.9]} drop={1.32} />
    <Festoon from={[-7.5, 5.24, -4.9]} to={[7.5, 5.24, 3.1]} drop={1.1} />
    <Festoon from={[7.5, 5.24, -4.9]} to={[-7.5, 5.24, 3.1]} drop={1.1} />
    {[0.4, 3.1, 5.8, 8.5].map((z) => <group key={z}>
      {[-4.3, 4.3].map((x) => <group key={x}>
        <Block p={[x, 0.48, z]} s={[6.2, 0.17, 0.72]} color='#bd8761' />
        {[-2.5, 2.5].map((d) => <Block key={d} p={[x + d, 0.2, z]} s={[0.2, 0.4, 0.52]} color={darkWood} />)}
      </group>)}
    </group>)}
  </group>;
}

function SurfVillage() {
  const { westX, eastX, minZ, maxZ, boardwalkY: y } = SURF_VILLAGE;
  const centerZ = (minZ + maxZ) / 2;
  return <group name="Boardwalk Surf Village and Seaside Amphitheater">
    {[westX, eastX].map((x) => <group key={x}>
      <group position={[x, y, centerZ]}><TimberDeck width={8.2} length={maxZ - minZ} /></group>
      {Array.from({ length: 12 }, (_, i) => minZ + 1.5 + i * 8.18).map((z, i) => <group key={z}>
        {[-3.68, 3.68].map((offset) => <Piling key={offset} x={x + offset} z={z} top={y - 0.1} />)}
        {i % 2 === 0 && <Lantern p={[x + Math.sign(x) * -3.53, y, z]} />}
      </group>)}
    </group>)}
    <group position={[60, y, -478.5]}><TimberDeck width={26} length={25} /></group>
    {[48, 59, 71].flatMap((x) => [-489.5, -479, -468].map((z) => <Piling key={x + ':' + z} x={x} z={z} top={y - 0.12} />))}
    <Stage />
    <Shack x={westX - 2} z={-487} y={y} yaw={Math.PI / 2} color='#a8d7c0' sign="SURF SHOP" />
    <Shack x={westX - 2} z={-451} y={y} yaw={Math.PI / 2} color='#f39b8f' sign="GELATO" />
    <Shack x={eastX + 2} z={-449} y={y} yaw={-Math.PI / 2} color='#e8b174' sign="TACOS" />
    <Shack x={eastX + 2} z={-425} y={y} yaw={-Math.PI / 2} color='#a9c3df' sign="BOARD HIRE" />
    {[[-55, -497], [-54, -477], [-55, -437], [54, -437], [53, -414], [55, -503]].map(([x, z], i) =>
      <Cabana key={z + ':' + x} x={x} z={z} yaw={i % 2 ? 0.33 : -0.31} />)}
    <Palms spots={[[-51, -502, 1], [-53, -487, 0.81], [-50, -472, 0.86], [-54, -440, 1.06],
      [-51, -419, 0.85], [-36, -431, 1], [52, -496, 1.2], [57, -494, 0.9], [68, -491, 1.05],
      [53, -461, 1.1], [49, -439, 0.86], [50, -417, 0.9], [36, -417, 1.1]]} />
  </group>;
}

const DestinationScene = memo(function DestinationScene() {
  return <><Solis /><Azurea /><SurfVillage /></>;
});

export function CoastalDestinations() {
  return <DestinationScene />;
}
