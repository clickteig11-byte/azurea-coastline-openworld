import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';
import { test } from 'node:test';
import { Vector3 } from 'three';

// Resolve the same extensionless TypeScript imports as Vite.
registerHooks({
  resolve(specifier, context, next) {
    try {
      return next(specifier, context);
    } catch (error) {
      if (error.code === 'ERR_MODULE_NOT_FOUND' && specifier.startsWith('./') && !specifier.endsWith('.ts')) {
        return next(specifier + '.ts', context);
      }
      throw error;
    }
  },
});

const { fixedWingStep } = await import('../src/game/flight.ts');
const { GRAND_PRIX_LENGTH, crossesRaceGate, grandPrixGates, nearestRaceProgress, sampleGrandPrix } =
  await import('../src/game/grandPrix.ts');
const { shoreReturn, surfaceStep, suspensionStep, launchTumble, stepTumble } = await import('../src/game/motion.ts');
const {
  NORTH_BAY_BRIDGE, coastBeachWidth, coastConnectorEnd, coastRoadHeight, coastRoadOffset,
  coastRoadRadius, getBridgeHeight, getTerrainHeight, getTravelHeight, isConstructionClosed,
} = await import('../src/game/worldMath.ts');
const { pedestrianContact } = await import('../src/game/vehicleContact.ts');
const { blastWorld, damageWorld, getWorldIntegrity, registerWorldSection, traceGround, traceWorld } =
  await import('../src/game/worldDamage.ts');

test('the continuous coastal road clears the runway and meets every inland connector', () => {
  const period = Math.PI * 2;
  assert.ok(Math.abs(coastRoadRadius(0) - coastRoadRadius(period)) < 0.0001);
  assert.ok(Math.abs(coastRoadRadius(Math.PI) + NORTH_BAY_BRIDGE.approach) < 0.001);
  for (let index = 0; index < 720; index++) {
    const angle = period * index / 720;
    const radius = coastRoadRadius(angle);
    const x = Math.sin(angle) * radius;
    const z = Math.cos(angle) * radius;
    assert.ok(Math.abs(getTravelHeight(x, z) - coastRoadHeight(x, z)) < 0.12, [x, z].join(','));
    assert.ok(!(x > -212 && x < -43 && z > 134 && z < 176), 'Runway overlap');
    const shore = radius + coastBeachWidth(angle);
    const sample = (r) => getTerrainHeight(Math.sin(angle) * r, Math.cos(angle) * r);
    if (!(x > 0 && Math.abs(z + 95) < 24)) {
      assert.ok(sample(radius + 15) > 1.9, 'Dry upper beach');
      assert.ok(sample(shore + 18) < -0.7, 'Continuous underwater shelf');
    }
  }
  for (const z of [-120, 0, 80]) for (const side of [-1, 1]) {
    const end = coastConnectorEnd(z, side);
    assert.ok(Math.abs(coastRoadOffset(end, z)) < 0.003);
    assert.ok(Math.abs(getTravelHeight(end, z) - coastRoadHeight(end, z)) < 0.001);
  }
});

test('both bridges keep clear water under the deck and the construction roadblock guards Island II', () => {
  const bayWater = getTerrainHeight(0, -293);
  assert.ok(bayWater < -2 && getTravelHeight(0, -293, 0.3) === bayWater);
  assert.equal(getTravelHeight(0, -293, 12), getBridgeHeight(-293));
  const east = coastConnectorEnd(-95, 1);
  assert.ok(getTravelHeight(east, -95, 0) < -2.5);
  assert.ok(getTravelHeight(east, -95, 9) > 6.6);
  assert.equal(isConstructionClosed(0, NORTH_BAY_BRIDGE.gate + 0.8), false);
  assert.equal(isConstructionClosed(0, NORTH_BAY_BRIDGE.gate - 1), true);
});

test('the racing line stays on pavement and rejects backward checkpoint crossings', () => {
  const position = new Vector3();
  assert.ok(GRAND_PRIX_LENGTH > 1450);
  for (let distance = 0; distance < GRAND_PRIX_LENGTH; distance += 0.75) {
    sampleGrandPrix(distance, position);
    const { x, z, y } = position;
    const city = Math.abs(z - 80) <= 10 || Math.abs(x) <= 16;
    const apron = z >= 216 && z <= 225 && x >= -32 && x <= 20;
    assert.ok(city || apron || Math.abs(coastRoadOffset(x, z)) <= 9, [distance, x, z].join(','));
    assert.ok(y >= 3.28, 'No dips below the race surface');
  }
  sampleGrandPrix(100, position);
  assert.ok(Math.abs(nearestRaceProgress(position, 0, 0) - 100) < 3.2);
  for (const gate of grandPrixGates) {
    const center = new Vector3(...gate.position);
    const forward = new Vector3(Math.sin(gate.yaw), 0, Math.cos(gate.yaw));
    const from = center.clone().addScaledVector(forward, -4);
    const to = center.clone().addScaledVector(forward, 8);
    assert.ok(crossesRaceGate(gate, from, to));
    assert.ok(!crossesRaceGate(gate, to, from));
    assert.ok(!crossesRaceGate(gate, from, to.clone().setY(to.y + 9)));
  }
});

test('a fast ramp exit retains upward momentum, lands, and rebounds on the springs', () => {
  const dt = 1 / 60;
  let car = { y: 0, velocity: 0 };
  let lastSupport = 0;
  let apex = 0;
  let airborne = 0;
  let impulse = 0;
  for (let n = 0; n < 125; n++) {
    const x = n * 22 * dt;
    const support = x < 14 ? 2.7 * (x / 14) ** 1.6 : 0;
    const next = surfaceStep(car.y, car.velocity, support, lastSupport, dt);
    lastSupport = support;
    car = next;
    if (!next.grounded) airborne += dt;
    impulse = Math.max(impulse, next.impact);
    apex = Math.max(apex, next.y);
  }
  assert.ok(apex > 3.6 && airborne > 0.8 && impulse > 9);
  assert.equal(car.y, 0);
  let spring = { offset: 0, velocity: -3.5 };
  let rebound = 0;
  for (let n = 0; n < 90; n++) {
    spring = suspensionStep(spring.offset, spring.velocity, dt);
    rebound = Math.max(rebound, spring.offset);
  }
  assert.ok(rebound > 0.022 && Math.abs(spring.offset) < 0.003);
});

const airplane = {
  dt: 1 / 60, speed: 0, pitch: 0, bank: 0, verticalSpeed: 0, throttle: 0.56,
  pitchCommand: 0, bankCommand: 0, takeoffPower: 1, grounded: true, brake: false,
  boost: false, autoLevel: true, integrity: 100, wingHealth: 1,
  thrustSensitivity: 1, steeringSensitivity: 1, failing: false,
};

function simulateFlight(initial, altitude, seconds, controls) {
  let frame = { ...airplane, ...initial };
  let y = altitude;
  let runway = 0;
  let heading = 0;
  let minVertical = 0;
  for (let n = 0; n < seconds / airplane.dt; n++) {
    const input = {
      ...frame, grounded: y <= 0.10 && frame.verticalSpeed <= 0.45, ...controls(n * airplane.dt),
    };
    frame = { ...input, ...fixedWingStep(input) };
    y = Math.max(0, y + frame.verticalSpeed * airplane.dt);
    if (y < 1) runway += frame.speed * airplane.dt;
    minVertical = Math.min(minVertical, frame.verticalSpeed);
    heading += frame.yawRate * airplane.dt;
  }
  return { ...frame, y, runway, heading, minVertical };
}

test('fixed-wing flight rotates from the runway, banks through a turn, and recovers from a stall', () => {
  const cruise = simulateFlight({}, 0, 12, (time) => ({
    pitchCommand: time < 3.6 ? 1 : 0, bankCommand: time > 7 && time < 10 ? 0.85 : 0,
  }));
  assert.ok(cruise.runway > 15 && cruise.runway < 65);
  assert.ok(cruise.y > 18 && cruise.speed > 43 && Math.abs(cruise.verticalSpeed) < 0.4);
  assert.ok(cruise.heading > 1.15 && Math.abs(cruise.bank) < 0.025);
  const recovered = simulateFlight({ speed: 11 }, 95, 8, (time) => ({ throttle: time < 2 ? 0 : 1 }));
  assert.ok(recovered.minVertical < -12 && recovered.y > 30 && recovered.y < 85);
  assert.ok(recovered.speed > 60 && Math.abs(recovered.verticalSpeed) < 0.7);
});

test('the world-edge steering and current blend without moving an in-bounds vehicle', () => {
  assert.deepEqual(shoreReturn(450, 120, 0, 640, 945), { turn: 0, x: 0, z: 0 });
  const flow = shoreReturn(920, 0, Math.PI / 2, 640, 945);
  assert.ok(flow.x < -0.9 && Math.abs(flow.turn) > 2.8);
});

test('swept pedestrian contact scales impulse with speed and rejects a vehicle above the actor', () => {
  const sweep = { start: new Vector3(0, 3.3, 0), end: new Vector3(0, 3.35, 1.2),
    speed: 32, yaw: 0, travel: 1.2, tick: 1 };
  const contact = pedestrianContact(sweep, 0.5, 3.2, 2.6);
  assert.ok(contact && contact.severity > 0.92 && contact.travelZ > 5.8);
  assert.equal(pedestrianContact(sweep, 0.5, 6.3, 2.6), null);
  const fall = launchTumble(contact.travelX, contact.travelZ, contact.severity, contact.side);
  let y = 3.2;
  let highest = 0;
  for (let i = 0; i < 180; i++) {
    y = stepTumble(fall, y, 3.2, 1 / 60).y;
    highest = Math.max(highest, y);
  }
  assert.ok(highest > 4.1 && fall.grounded && fall.bounces >= 2);
  assert.ok(Math.abs(fall.pitch + Math.PI / 2) < 0.03);
});

test('world hits scar and breach only the sections reached by the hit or blast', () => {
  function wall(x, owner) {
    return { owner, label: 'Glass section', material: 'glass', center: new Vector3(x, 5, 16),
      halfSize: new Vector3(0.8, 2, 0.2), hp: 60, maxHp: 60 };
  }
  const first = wall(0, 'test façade');
  const adjacent = wall(2, 'test façade');
  const remote = wall(18, 'remote façade');
  const unregister = [first, adjacent, remote].map(registerWorldSection);
  try {
    const hit = traceWorld(new Vector3(0, 5, 11), new Vector3(0, 0, 1), 8);
    assert.ok(hit && hit.section === first);
    damageWorld(hit, 25);
    assert.equal(first.hp, 35);
    assert.equal(adjacent.hp, 60);
    assert.equal(getWorldIntegrity(first.owner).stage, 'damaged');
    damageWorld(hit, 45);
    blastWorld(hit.point, 4.5, 48, first);
    assert.equal(first.hp, 0);
    assert.ok(adjacent.hp < 60 && remote.hp === 60);
    assert.ok(!traceWorld(new Vector3(0, 5, 11), new Vector3(0, 0, 1), 8));
    const groundHit = traceGround(new Vector3(0, 16, -290), new Vector3(0, -1, 0), 20);
    assert.ok(groundHit && Math.abs(groundHit.point.y - getBridgeHeight(-290)) < 0.06);
  } finally {
    unregister.forEach((remove) => remove());
  }
});

test('screen-center rays hit only actors that overlap the actual aim direction', async () => {
  const { PerspectiveCamera, Raycaster, Vector2 } = await import('three');
  const { targetDistance } = await import('../src/game/aim.ts');
  const camera = new PerspectiveCamera(65, 16 / 9, 0.04, 500);
  camera.position.set(0, 1.25, -4);
  camera.lookAt(0, 1.25, 8);
  camera.updateMatrixWorld();
  const aim = new Raycaster();
  aim.setFromCamera(new Vector2(), camera);
  assert.ok(Math.abs(targetDistance(aim.ray.origin, aim.ray.direction, 0, 0, 8) - 11.66) < 0.04);
  assert.equal(targetDistance(aim.ray.origin, aim.ray.direction, 0.68, 0, 8), Infinity);
  assert.equal(targetDistance(aim.ray.origin, aim.ray.direction, 0, 0, -8), Infinity);
});

test('placed structures share live travel support, rotated collisions, and destructibility', async () => {
  const { construction, planBuild, placeBuild, placedPieces, BUILD_COST } = await import('../src/game/building.ts');
  const old = { type: construction.type, turn: construction.turn, Wood: construction.resources.Wood };
  construction.type = 'Ramp';
  construction.turn = 0;
  const player = new Vector3(34, 3.25, 23);
  const aim = new Vector3(36, 3.2, 28);
  const plan = planBuild(aim, player);
  assert.ok(plan.valid);
  assert.equal(plan.origin.x % 4, 0);
  assert.ok(placeBuild(aim, player));
  try {
    assert.equal(construction.resources.Wood, old.Wood - BUILD_COST);
    assert.equal(placedPieces().length, 1);
    assert.equal(planBuild(aim, player).valid, false);
    const high = getTravelHeight(36, 29.2, 5.9);
    const low = getTravelHeight(36, 26.6, 3.8);
    assert.ok(high - low > 1.2);
    assert.equal(getTravelHeight(36, 29.2, 3.25), getTerrainHeight(36, 29.2));
    const hit = traceWorld(new Vector3(36, 8, 28), new Vector3(0, -1, 0), 8);
    assert.ok(hit?.section && hit.normal.y > 0.8 && hit.normal.z < -0.35);
    damageWorld(hit, 500);
    assert.equal(placedPieces().length, 0);
    assert.equal(getTravelHeight(36, 29.2, 5.9), getTerrainHeight(36, 29.2));
  } finally {
    construction.type = old.type;
    construction.turn = old.turn;
    construction.resources.Wood = old.Wood;
  }
});

test('handbrake retains rear slip and counter-steer settles it progressively', async () => {
  const { rearSlip } = await import('../src/game/motion.ts');
  let grip = { lateral: 0, angle: 0 };
  let drift = { lateral: 0, angle: 0 };
  for (let i = 0; i < 56; i++) {
    grip = rearSlip(24, grip.lateral, 0.83, false, 1, true, 1 / 60);
    drift = rearSlip(24, drift.lateral, 0.83, true, 1, true, 1 / 60);
  }
  assert.ok(drift.angle < -0.29 && Math.abs(grip.angle) < 0.14);
  const before = Math.abs(drift.angle);
  for (let i = 0; i < 18; i++) drift = rearSlip(24, drift.lateral, -0.45, false, 1, true, 1 / 60);
  assert.ok(Math.abs(drift.angle) < before * 0.19);
});

test('both sourced characters contain binary GLB geometry, materials, skeletons, and usable motion clips', async () => {
  const { readFile } = await import('node:fs/promises');
  for (const file of ['quaternius-man.glb', 'quaternius-woman-casual.glb']) {
    const buffer = await readFile(new URL('../public/models/characters/' + file, import.meta.url));
    assert.equal(buffer.toString('ascii', 0, 4), 'glTF');
    assert.equal(buffer.readUInt32LE(4), 2);
    assert.equal(buffer.readUInt32LE(8), buffer.length);
    const end = 20 + buffer.readUInt32LE(12);
    const gltf = JSON.parse(buffer.toString('utf8', 20, end));
    assert.equal(gltf.skins[0].joints.length, 31);
    assert.ok(gltf.materials.every((material) => material.name && material.pbrMetallicRoughness));
    for (const motion of ['Idle', 'Walk', 'Run', 'Death', 'Jump']) {
      const clip = gltf.animations.find((animation) => animation.name.endsWith('_' + motion));
      const skeletonChannels = clip.channels.filter((channel) => gltf.skins[0].joints.includes(channel.target.node));
      assert.ok(skeletonChannels.length >= (motion === 'Idle' ? 8 : 16));
      assert.ok(clip.samplers.some(({ input }) => gltf.accessors[input].count > 4));
    }
    assert.ok(gltf.meshes.some((mesh) => mesh.primitives.some((primitive) =>
      primitive.attributes.JOINTS_0 !== undefined && primitive.attributes.WEIGHTS_0 !== undefined)));
  }
});
