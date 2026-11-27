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

test('both bridges keep clear water under the deck and the Wonder Ocean Pier extends Island II into the ocean', async () => {
  const { OCEAN_AMUSEMENT_PIER, isOnOceanAmusementPier, sampleAmusementRidePose, sampleCoasterTrack } =
    await import('../src/game/worldMath.ts');
  const bayWater = getTerrainHeight(0, -293);
  assert.ok(bayWater < -2 && getTravelHeight(0, -293, 0.3) === bayWater);
  assert.equal(getTravelHeight(0, -293, 12), getBridgeHeight(-293));
  const east = coastConnectorEnd(-95, 1);
  assert.ok(getTravelHeight(east, -95, 0) < -2.5);
  assert.ok(getTravelHeight(east, -95, 9) > 6.6);
  assert.equal(isConstructionClosed(0, NORTH_BAY_BRIDGE.gate + 0.8), false);
  assert.equal(isConstructionClosed(0, NORTH_BAY_BRIDGE.gate - 1), false);
  // Wonder Ocean Pier deck extends over deep ocean water at z = -620 while keeping water underneath
  assert.ok(isOnOceanAmusementPier(0, -620));
  assert.ok(getTerrainHeight(0, -620) < -2.0);
  assert.equal(getTravelHeight(0, -620, 6), OCEAN_AMUSEMENT_PIER.deckY);
  // Ridable Ferris Wheel, Roller Coaster, Carousel & Drop Tower return finite elevated poses on the pier
  for (const rideId of ['FERRIS', 'COASTER', 'CAROUSEL', 'DROP_TOWER']) {
    const pose = sampleAmusementRidePose(rideId, 4.2);
    assert.ok(Number.isFinite(pose.pos.x) && Number.isFinite(pose.pos.y) && Number.isFinite(pose.pos.z));
    assert.ok(pose.pos.y >= OCEAN_AMUSEMENT_PIER.deckY);
  }
  const track = sampleCoasterTrack(0.25);
  assert.ok(track.pos.y > OCEAN_AMUSEMENT_PIER.deckY + 4 && Math.abs(track.bank) <= 0.6);
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

test('LOBBY_THEMES and resolveActiveThemeId cover all 4 coastal themes cleanly', async () => {
  const { LOBBY_THEMES, LOBBY_THEME_ORDER, resolveActiveThemeId } =
    await import('../src/game/lobbyThemes.ts');
  assert.deepEqual(LOBBY_THEME_ORDER, [
    'SUNLIT_RIVIERA',
    'SUNSET_BOARDWALK',
    'TACTICAL_OVERLOOK',
    'MIDNIGHT_HARBOR',
  ]);
  for (const id of LOBBY_THEME_ORDER) {
    const theme = LOBBY_THEMES[id];
    assert.ok(theme, `Missing theme ${id}`);
    assert.equal(theme.id, id);
    assert.ok(theme.label.length > 0 && theme.subtitle.length > 0);
    assert.ok(theme.thumbUrl.startsWith('/images/lobby/'));
    assert.match(theme.accentHex, /^#[0-9a-f]{6}$/i);
    assert.equal(theme.sunDir.length, 3);
    assert.ok(theme.fogNear > 0 && theme.fogFar > theme.fogNear);
    assert.ok(theme.exposure >= 0.8 && theme.exposure <= 1.5);
    for (const triplet of [theme.oceanShallow, theme.oceanDeep, theme.oceanFoam]) {
      assert.equal(triplet.length, 3);
      assert.ok(triplet.every((c) => c >= 0 && c <= 1));
    }
  }
  assert.equal(resolveActiveThemeId(true, 'SUNSET_BOARDWALK', 'MIDNIGHT_HARBOR'), 'SUNSET_BOARDWALK');
  assert.equal(resolveActiveThemeId(true, 'TACTICAL_OVERLOOK', 'AUTO'), 'TACTICAL_OVERLOOK');
  assert.equal(resolveActiveThemeId(false, 'SUNLIT_RIVIERA', 'AUTO'), 'SUNLIT_RIVIERA');
  assert.equal(resolveActiveThemeId(false, 'SUNLIT_RIVIERA', 'MIDNIGHT_HARBOR'), 'MIDNIGHT_HARBOR');
});

test('Grand Prix final-sector progress stays bounded and humanoid emote blends smoothly', async () => {
  const finishPoint = new Vector3();
  sampleGrandPrix(GRAND_PRIX_LENGTH * 0.96, finishPoint);
  const progress = nearestRaceProgress(finishPoint, 0, grandPrixGates.length - 1);
  assert.ok(Number.isFinite(progress) && progress > GRAND_PRIX_LENGTH * 0.8 && progress <= GRAND_PRIX_LENGTH);

  const { Bone, Group } = await import('three');
  const { createHumanoidRig, animateHumanoid } = await import('../src/game/humanoid.ts');
  const wrapper = new Group();
  const model = new Group();
  const hips = new Bone(); hips.name = 'Hips';
  const spine = new Bone(); spine.name = 'Spine';
  const spine1 = new Bone(); spine1.name = 'Spine1';
  const head = new Bone(); head.name = 'Head';
  const rightArm = new Bone(); rightArm.name = 'RightArm'; rightArm.position.set(-0.2, 0.2, 0);
  const rightForeArm = new Bone(); rightForeArm.name = 'RightForeArm'; rightForeArm.position.set(0, -0.28, 0);
  const leftArm = new Bone(); leftArm.name = 'LeftArm'; leftArm.position.set(0.2, 0.2, 0);
  const leftForeArm = new Bone(); leftForeArm.name = 'LeftForeArm'; leftForeArm.position.set(0, -0.28, 0);
  hips.add(spine);
  spine.add(spine1);
  spine1.add(head, rightArm, leftArm);
  rightArm.add(rightForeArm);
  leftArm.add(leftForeArm);
  model.add(hips);
  wrapper.add(model);

  const rig = createHumanoidRig(wrapper, model);
  const restRight = rig.joints.RightArm.rest.clone();
  for (let i = 0; i < 20; i++) {
    animateHumanoid(rig, { dt: 1 / 60, time: i / 60, phase: 0, speed: 0, emote: 2.0 - i / 60 });
  }
  assert.ok(rig.emoteBlend > 0.5);
  assert.ok(rig.joints.RightArm.bone.quaternion.angleTo(restRight) > 0.4);
  for (let i = 0; i < 45; i++) {
    animateHumanoid(rig, { dt: 1 / 60, time: 1 + i / 60, phase: 0, speed: 0, emote: 0 });
  }
  assert.ok(rig.emoteBlend < 0.02);
});

test('4-point hull buoyancy, chassis weight transfer, and welded character normals behave physically', async () => {
  const { sampleHullBuoyancy, getWaveHeight } = await import('../src/game/worldMath.ts');
  const { computeChassisWeightTransfer } = await import('../src/game/motion.ts');
  const { weldSmoothNormals } = await import('../src/game/humanoid.ts');
  const { BoxGeometry, Mesh } = await import('three');

  // 1. 4-point Archimedes hull buoyancy tracks wave heave and wave slope pitch/roll
  const b0 = sampleHullBuoyancy(240, -180, 0, 3.2, 1.15, 2.5);
  const centerWave = getWaveHeight(240, -180, 2.5);
  assert.ok(Number.isFinite(b0.heave) && Math.abs(b0.heave - centerWave) < 0.35);
  assert.ok(Number.isFinite(b0.pitch) && Math.abs(b0.pitch) < 0.45);
  assert.ok(Number.isFinite(b0.roll) && Math.abs(b0.roll) < 0.45);

  // 2. Chassis weight transfer squats under acceleration, dives under braking, and gains aero downforce
  const accelTransfer = computeChassisWeightTransfer(18, 0.4, 38, -0.18, true);
  const brakeTransfer = computeChassisWeightTransfer(-24, 0, 38, 0, true);
  assert.ok(accelTransfer.squatPitch < 0 && brakeTransfer.squatPitch > 0);
  assert.ok(accelTransfer.aeroDownforce > 1.1 && accelTransfer.aeroDrop < -0.02);
  assert.ok(Math.abs(accelTransfer.cornerRoll) > 0.01);

  // 3. Position-welded normals smooth split hard-edge vertices without mutating vertex count
  const box = new BoxGeometry(1, 1, 1).toNonIndexed();
  const mesh = new Mesh(box);
  const beforeCount = box.attributes.position.count;
  weldSmoothNormals(mesh);
  assert.equal(box.attributes.position.count, beforeCount);
  assert.equal(box.userData.smoothWelded, true);
  const n0 = [box.attributes.normal.getX(0), box.attributes.normal.getY(0), box.attributes.normal.getZ(0)];
  // A welded corner normal on a cube has non-zero components on all 3 axes (~0.577 each)
  assert.ok(Math.abs(n0[0]) > 0.4 && Math.abs(n0[1]) > 0.4 && Math.abs(n0[2]) > 0.4);

  // 4. Native SambaDance / agree emote clip binds to HumanoidRig without altering rest pose
  const { AnimationClip, Bone, Group, QuaternionKeyframeTrack } = await import('three');
  const { createHumanoidRig } = await import('../src/game/humanoid.ts');
  const makeClip = (name) =>
    new AnimationClip(name, 1.0, [
      new QuaternionKeyframeTrack('mixamorigHips.quaternion', [0, 1], [0, 0, 0, 1, 0, 0.1, 0, 0.995]),
      new QuaternionKeyframeTrack('mixamorigSpine.quaternion', [0, 1], [0, 0, 0, 1, 0, 0, 0.1, 0.995]),
    ]);
  const wrapper = new Group();
  const model = new Group();
  const hips = new Bone();
  hips.name = 'mixamorigHips';
  const spine = new Bone();
  spine.name = 'mixamorigSpine';
  hips.add(spine);
  model.add(hips);
  wrapper.add(model);
  const rig = createHumanoidRig(wrapper, model, [makeClip('idle'), makeClip('walk'), makeClip('run'), makeClip('agree')]);
  assert.ok(rig.mixer && rig.clips.idle && rig.clips.walk && rig.clips.run && rig.clips.emote);
});

test('All 5 EMOTE_STYLES animate distinct poses and all Tripo characters are rigged GLBs', async () => {
  const fs = await import('node:fs');
  const path = await import('node:path');
  const { Bone, Group } = await import('three');
  const { COASTAL_CHARACTERS, EMOTE_STYLES, HERO_ROSTER, KIT_COLORWAYS } = await import('../src/game/store.ts');
  const { createHumanoidRig, animateHumanoid, weldSmoothNormals } = await import('../src/game/humanoid.ts');

  // Verify HERO_ROSTER groups Chloe Reed & Lola Quinn without duplicate personas and includes v3.1 male heroes
  const chloe = HERO_ROSTER.find((h) => h.heroId === 'CHLOE_REED');
  const lola = HERO_ROSTER.find((h) => h.heroId === 'LOLA_QUINN');
  assert.ok(chloe && chloe.costumes.length >= 5, 'Chloe Reed must group 5+ costumes');
  assert.ok(lola && lola.costumes.length >= 4, 'Lola Quinn must group 4+ costumes');
  assert.ok(HERO_ROSTER.some((h) => h.heroId === 'MARCUS_VANCE' && h.gender === 'male'));
  assert.ok(HERO_ROSTER.some((h) => h.heroId === 'LIAM_STERLING' && h.gender === 'male'));
  assert.ok(KIT_COLORWAYS.length >= 5);

  // Verify weldSmoothNormals skips recalculating normals when a normalMap is present
  const { BoxGeometry, Mesh, MeshStandardMaterial, Texture } = await import('three');
  const nmGeo = new BoxGeometry(1, 1, 1).toNonIndexed();
  const customNormalX = 0.1234;
  nmGeo.attributes.normal.setX(0, customNormalX);
  const nmMesh = new Mesh(nmGeo, new MeshStandardMaterial({ normalMap: new Texture() }));
  weldSmoothNormals(nmMesh);
  assert.ok(Math.abs(nmGeo.attributes.normal.getX(0) - customNormalX) < 1e-5, 'normalMap normals must be preserved');

  assert.equal(EMOTE_STYLES.length, 5);
  const makeRig = () => {
    const wrapper = new Group();
    const model = new Group();
    const hips = new Bone(); hips.name = 'Hips';
    const spine = new Bone(); spine.name = 'Spine';
    const spine1 = new Bone(); spine1.name = 'Spine1';
    const head = new Bone(); head.name = 'Head';
    const rightArm = new Bone(); rightArm.name = 'RightArm';
    const rightForeArm = new Bone(); rightForeArm.name = 'RightForeArm';
    const leftArm = new Bone(); leftArm.name = 'LeftArm';
    const leftForeArm = new Bone(); leftForeArm.name = 'LeftForeArm';
    hips.add(spine);
    spine.add(spine1);
    spine1.add(head, rightArm, leftArm);
    rightArm.add(rightForeArm);
    leftArm.add(leftForeArm);
    model.add(hips);
    wrapper.add(model);
    return createHumanoidRig(wrapper, model);
  };

  for (const style of EMOTE_STYLES) {
    const rig = makeRig();
    const restRight = rig.joints.RightArm.rest.clone();
    for (let i = 0; i < 20; i++) {
      animateHumanoid(rig, {
        dt: 1 / 60,
        time: i / 60,
        phase: 0,
        speed: 0,
        emote: 2.0 - i / 60,
        emoteStyle: style.id,
      });
    }
    assert.ok(rig.emoteBlend > 0.5, `Expected emoteBlend > 0.5 for ${style.id}`);
    assert.ok(rig.joints.RightArm.bone.quaternion.angleTo(restRight) > 0.25, `Expected arm pose change for ${style.id}`);
  }

  const tripoEntries = Object.entries(COASTAL_CHARACTERS).filter(([id]) => id.startsWith('TRIPO_'));
  assert.equal(tripoEntries.length, 14);
  for (const [id, spec] of tripoEntries) {
    const filePath = path.resolve(process.cwd(), 'public', spec.url.replace(/^\//, ''));
    assert.ok(fs.existsSync(filePath), `Missing rigged GLB for ${id}: ${filePath}`);
    const buffer = fs.readFileSync(filePath);
    assert.equal(buffer.toString('utf8', 0, 4), 'glTF');
    const jsonLen = buffer.readUInt32LE(12);
    const gltf = JSON.parse(buffer.toString('utf8', 20, 20 + jsonLen));
    assert.ok(Array.isArray(gltf.skins) && gltf.skins.length >= 1, `Expected skin in ${id}`);
    assert.ok(gltf.skins[0].joints.length >= 20, `Expected >=20 joints in ${id}`);
  }

  const v31Entries = Object.entries(COASTAL_CHARACTERS).filter(([, s]) => s.url.includes('-v31'));
  assert.equal(v31Entries.length, 6);
  for (const [id, spec] of v31Entries) {
    const filePath = path.resolve(process.cwd(), 'public', spec.url.replace(/^\//, ''));
    assert.ok(fs.existsSync(filePath), `Missing v3.1 rigged GLB for ${id}: ${filePath}`);
    const buffer = fs.readFileSync(filePath);
    assert.equal(buffer.toString('utf8', 0, 4), 'glTF');
    const jsonLen = buffer.readUInt32LE(12);
    const gltf = JSON.parse(buffer.toString('utf8', 20, 20 + jsonLen));
    assert.ok(Array.isArray(gltf.skins) && gltf.skins.length >= 1, `Expected skin in ${id}`);
    assert.ok(gltf.skins[0].joints.length >= 20, `Expected >=20 joints in ${id}`);
  }

  // Verify Mixamo clip retargeting onto a rotated A-pose skeleton with leg normalization produces valid finite clips
  const { AnimationClip, QuaternionKeyframeTrack } = await import('three');
  const { retargetMixamoClips } = await import('../src/game/humanoid.ts');
  const srcRig = makeRig();
  const tgtWrapper = new Group();
  const tgtModel = new Group();
  tgtModel.rotation.y = -Math.PI / 2;
  const tgtHips = new Bone(); tgtHips.name = 'mixamorig:Hips';
  const tgtSpine = new Bone(); tgtSpine.name = 'mixamorig:Spine';
  const tgtRightArm = new Bone(); tgtRightArm.name = 'mixamorig:RightArm';
  const tgtRightFore = new Bone(); tgtRightFore.name = 'mixamorig:RightForeArm'; tgtRightFore.position.set(0, -0.25, 0);
  const tgtUpLeg = new Bone(); tgtUpLeg.name = 'mixamorig:LeftUpLeg';
  const tgtKnee = new Bone(); tgtKnee.name = 'mixamorig:LeftLeg'; tgtKnee.position.set(0.06, -0.4, 0);
  tgtHips.add(tgtSpine, tgtUpLeg);
  tgtUpLeg.add(tgtKnee);
  tgtSpine.add(tgtRightArm);
  tgtRightArm.add(tgtRightFore);
  tgtModel.add(tgtHips);
  tgtWrapper.add(tgtModel);
  const tgtRig = createHumanoidRig(tgtWrapper, tgtModel, [], 'feminine');
  const srcClip = new AnimationClip('idle', 1, [
    new QuaternionKeyframeTrack('mixamorigRightArm.quaternion', [0, 1], [0, 0, 0, 1, 0, 0, -0.5, 0.866]),
  ]);
  retargetMixamoClips(tgtRig, srcRig, [srcClip], ['idle']);
  assert.ok(tgtRig.mixer && tgtRig.clips.idle, 'Expected retargeted idle clip');
  animateHumanoid(tgtRig, { dt: 1 / 60, time: 0.5, phase: 0, speed: 0 });
  assert.ok(Number.isFinite(tgtRig.joints.RightArm.bone.quaternion.x));
});

test('on-foot strafe matches true Three.js screen-right (D right, A left) and coaster FPV Frenet frame is orthonormal', async () => {
  const { computeFootWishVelocity } = await import('../src/game/motion.ts');
  const { sampleCoasterU, sampleAmusementRidePose, OCEAN_AMUSEMENT_PIER } = await import('../src/game/worldMath.ts');

  // 1. Verify screen-right D (+1) and screen-left A (-1) across 4 cardinal headings
  for (const yaw of [0, Math.PI / 2, Math.PI, -Math.PI / 2]) {
    const fwd = new Vector3(Math.sin(yaw), 0, Math.cos(yaw));
    const expectedRight = new Vector3().crossVectors(fwd, new Vector3(0, 1, 0)).normalize();
    const rightMove = computeFootWishVelocity(yaw, 0, 1, 5);
    const leftMove = computeFootWishVelocity(yaw, 0, -1, 5);
    assert.ok(Math.abs(rightMove.vx - expectedRight.x * 5) < 1e-6);
    assert.ok(Math.abs(rightMove.vz - expectedRight.z * 5) < 1e-6);
    assert.ok(Math.abs(leftMove.vx + expectedRight.x * 5) < 1e-6);
    assert.ok(Math.abs(leftMove.vz + expectedRight.z * 5) < 1e-6);
  }

  // 2. Verify coaster energy-conserving progress and orthonormal FPV Frenet frame
  const speeds = [];
  for (let t = 0; t < 20; t += 0.8) {
    const u = sampleCoasterU(t);
    assert.ok(u >= 0 && u < 1);
    const pose = sampleAmusementRidePose('COASTER', t);
    assert.ok(pose.pos.y >= OCEAN_AMUSEMENT_PIER.deckY);
    assert.ok(pose.tangent && pose.bankedRight && pose.bankedUp);
    assert.ok(Math.abs(pose.tangent.length() - 1) < 1e-3);
    assert.ok(Math.abs(pose.bankedRight.length() - 1) < 1e-3);
    assert.ok(Math.abs(pose.bankedUp.length() - 1) < 1e-3);
    assert.ok(Math.abs(pose.tangent.dot(pose.bankedRight)) < 1e-3);
    assert.ok(Math.abs(pose.tangent.dot(pose.bankedUp)) < 1e-3);
    assert.ok(typeof pose.speedKmh === 'number' && pose.speedKmh >= 38 && pose.speedKmh <= 132);
    speeds.push(pose.speedKmh);
  }
  assert.ok(Math.max(...speeds) - Math.min(...speeds) >= 25, 'Coaster speed should accelerate strongly on drops');
});
