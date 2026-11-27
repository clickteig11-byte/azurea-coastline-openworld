import * as THREE from 'three';

interface Joint {
  bone: THREE.Bone;
  rest: THREE.Quaternion;
  basis: THREE.Quaternion;
  tPoseRest: THREE.Quaternion;
  tPoseBasis: THREE.Quaternion;
}

export type RigPosture = 'feminine' | 'athletic' | 'robotic';

export interface HumanoidRig {
  wrapper: THREE.Group;
  model: THREE.Object3D;
  posture: RigPosture;
  joints: Record<string, Joint>;
  legs: LegRig[];
  gait: number;
  aim: number;
  air: number;
  swim: number;
  freestyle: number;
  stroke: number;
  treadPhase: number;
  emoteElapsed: number;
  emoteBlend: number;
  mixer?: THREE.AnimationMixer;
  clips: Partial<Record<'idle' | 'walk' | 'run' | 'emote', THREE.AnimationAction>>;
}

export interface Pose {
  dt: number;
  time: number;
  phase: number;
  speed: number;
  swimming?: boolean;
  swimSpeed?: number;
  sprinting?: boolean;
  swimWave?: number;
  reverse?: boolean;
  lateral?: number;
  airborne?: 'jump' | 'glide' | 'parachute';
  fallSpeed?: number;
  landing?: number;
  aim?: number;
  recoil?: number;
  harvest?: number;
  emote?: number;
  emoteStyle?: 'WAVE' | 'DANCE' | 'SPIN' | 'FLEX' | 'SHUFFLE';
  lookPitch?: number;
  lookYaw?: number;
  ground?: GroundMotion;
}

const armDirection = new THREE.Vector3();
const rootInverse = new THREE.Quaternion();
const correction = new THREE.Quaternion();
const anatomical = new THREE.Euler(0, 0, 0, 'YXZ');
const target = new THREE.Quaternion();
const root = new THREE.Quaternion();

function setPose(joint: Joint | undefined, x: number, y: number, z: number, blend: number) {
  if (!joint || blend < 0.001) return;
  anatomical.set(x, y, z);
  target.copy(joint.basis).invert().multiply(correction.setFromEuler(anatomical)).multiply(joint.basis);
  target.premultiply(joint.rest);
  joint.bone.quaternion.slerp(target, blend);
}

export function weldSmoothNormals(model: THREE.Object3D) {
  model.traverse((obj) => {
    const mesh = obj as THREE.Mesh;
    if (!mesh.isMesh || !mesh.geometry || mesh.geometry.userData?.smoothWelded) return;
    const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
    if (mats.some((m) => Boolean((m as THREE.MeshStandardMaterial | undefined)?.normalMap))) {
      mesh.geometry.userData.smoothWelded = true;
      return;
    }
    const geo = mesh.geometry;
    const pos = geo.attributes.position;
    if (!pos) return;
    geo.userData.smoothWelded = true;
    if (pos.count > 18000 || (geo.attributes.normal && pos.count > 3500)) return;
    geo.computeVertexNormals();
    const norm = geo.attributes.normal;
    if (!norm) return;
    const sums = new Map<string, [number, number, number]>();
    const keys = new Array<string>(pos.count);
    for (let i = 0; i < pos.count; i++) {
      const k = `${Math.round(pos.getX(i) * 2000)},${Math.round(pos.getY(i) * 2000)},${Math.round(pos.getZ(i) * 2000)}`;
      keys[i] = k;
      const cur = sums.get(k);
      if (cur) {
        cur[0] += norm.getX(i);
        cur[1] += norm.getY(i);
        cur[2] += norm.getZ(i);
      } else {
        sums.set(k, [norm.getX(i), norm.getY(i), norm.getZ(i)]);
      }
    }
    for (let i = 0; i < pos.count; i++) {
      const s = sums.get(keys[i])!;
      const len = Math.hypot(s[0], s[1], s[2]) || 1;
      norm.setXYZ(i, s[0] / len, s[1] / len, s[2] / len);
    }
    norm.needsUpdate = true;
  });
}

interface LegRig {
  hip: Joint;
  knee: Joint;
  ankle: Joint;
  home: THREE.Vector3;
  upperLength: number;
  lowerLength: number;
}

interface GroundMotion {
  x: number;
  z: number;
  heightAt: (x: number, z: number) => number;
}

export function createHumanoidRig(
  wrapper: THREE.Group,
  model: THREE.Object3D,
  animations: THREE.AnimationClip[] = [],
  posture: RigPosture = 'athletic'
): HumanoidRig {
  const rig: HumanoidRig = {
    wrapper, model, posture, joints: {}, gait: 0, aim: 0, air: 0, swim: 0, freestyle: 0, stroke: 0, treadPhase: 0,
    emoteElapsed: 0, emoteBlend: 0, clips: {}, legs: [],
  };
  weldSmoothNormals(model);
  wrapper.updateWorldMatrix(true, true);
  const bones: Record<string, THREE.Bone> = {};
  const aliases: Record<string, string> = { Abdomen: 'Spine', Torso: 'Spine1' };
  for (const [suffix, side] of [['L', 'Left'], ['R', 'Right']]) {
    Object.assign(aliases, {
      ['UpperArm' + suffix]: side + 'Arm', ['LowerArm' + suffix]: side + 'ForeArm',
      ['UpperLeg' + suffix]: side + 'UpLeg', ['LowerLeg' + suffix]: side + 'Leg',
      ['Foot' + suffix]: side + 'Foot', ['Palm' + suffix]: side + 'Hand',
    });
  }
  model.traverse((object) => {
    if (!(object as THREE.Bone).isBone) return;
    const name = object.name.replace(/^mixamorig:?/, '').replace(/[.]/g, '');
    bones[aliases[name] ?? name] = object as THREE.Bone;
  });
  const clip = (name: string) => {
    const lower = name.toLowerCase();
    return animations.find(
      (animation) =>
        animation.name.toLowerCase() === lower ||
        animation.name.toLowerCase().endsWith('_' + lower)
    );
  };
  const walk = clip('Walk'), run = clip('Run'), idle = clip('Idle');
  const emote = clip('SambaDance') ?? clip('agree');
  if (walk && run && idle) {
    rig.mixer = new THREE.AnimationMixer(model);
    for (const [name, c] of Object.entries({ idle, walk, run })) {
      const action = rig.mixer.clipAction(c).setEffectiveWeight(name === 'idle' ? 1 : 0).play();
      if (name !== 'idle') action.time = ((wrapper.id % 13) / 13) * c.duration;
      rig.clips[name as 'idle' | 'walk' | 'run'] = action;
    }
    if (emote) {
      rig.clips.emote = rig.mixer.clipAction(emote).setEffectiveWeight(0).play();
    }
  } else if (emote) {
    rig.mixer = new THREE.AnimationMixer(model);
    rig.clips.emote = rig.mixer.clipAction(emote).setEffectiveWeight(0).play();
  }
  // Snapshot T-pose quaternions & world bases for retargeting before relaxing A/T-pose arms.
  wrapper.getWorldQuaternion(root).invert();
  const tPoseMap = new Map<string, { rest: THREE.Quaternion; basis: THREE.Quaternion }>();
  const savedPoseQuats = new Map<string, THREE.Quaternion>();
  for (const side of ['Left', 'Right']) {
    const arm = bones[side + 'Arm'];
    const elbow = bones[side + 'ForeArm'];
    if (arm && elbow) {
      savedPoseQuats.set(side + 'Arm', arm.quaternion.clone());
      elbow.getWorldPosition(armDirection).sub(arm.getWorldPosition(new THREE.Vector3())).applyQuaternion(root).normalize();
      const sign = Math.sign(armDirection.x) || (side === 'Left' ? 1 : -1);
      const raise = Math.atan2(-armDirection.y, Math.abs(armDirection.x));
      const parentBasis = arm.parent!.getWorldQuaternion(new THREE.Quaternion()).premultiply(root);
      correction.setFromEuler(anatomical.set(0, 0, sign * raise));
      rootInverse.copy(parentBasis).invert();
      arm.quaternion.premultiply(rootInverse.multiply(correction).multiply(parentBasis));
    }
    const hip = bones[side + 'UpLeg'];
    const knee = bones[side + 'Leg'];
    if (hip && knee && hip.parent) {
      savedPoseQuats.set(side + 'UpLeg', hip.quaternion.clone());
      knee.getWorldPosition(armDirection).sub(hip.getWorldPosition(new THREE.Vector3())).applyQuaternion(root).normalize();
      const legSplay = Math.atan2(armDirection.x, Math.max(0.15, -armDirection.y));
      if (Math.abs(legSplay) > 0.01) {
        const parentBasis = hip.parent.getWorldQuaternion(new THREE.Quaternion()).premultiply(root);
        correction.setFromEuler(anatomical.set(0, 0, -legSplay));
        rootInverse.copy(parentBasis).invert();
        hip.quaternion.premultiply(rootInverse.multiply(correction).multiply(parentBasis));
      }
    }
  }
  wrapper.updateWorldMatrix(true, true);
  for (const [name, bone] of Object.entries(bones)) {
    tPoseMap.set(name, {
      rest: bone.quaternion.clone(),
      basis: bone.getWorldQuaternion(new THREE.Quaternion()).premultiply(root),
    });
  }
  for (const [key, q] of savedPoseQuats) {
    bones[key].quaternion.copy(q);
  }
  wrapper.updateWorldMatrix(true, true);

  // Drop A/T-pose arms into a relaxed, natural standing hang close to the sides.
  for (const side of ['Left', 'Right']) {
    const arm = bones[side + 'Arm'];
    const elbow = bones[side + 'ForeArm'];
    if (!arm || !elbow) continue;
    elbow.getWorldPosition(armDirection).sub(arm.getWorldPosition(new THREE.Vector3())).applyQuaternion(root).normalize();
    const sign = Math.sign(armDirection.x) || (side === 'Left' ? 1 : -1);
    const drop = Math.max(0, Math.acos(THREE.MathUtils.clamp(-armDirection.y, -1, 1)) - 0.06);
    const parentBasis = arm.parent!.getWorldQuaternion(new THREE.Quaternion()).premultiply(root);
    correction.setFromEuler(anatomical.set(0, 0, -sign * drop));
    rootInverse.copy(parentBasis).invert();
    arm.quaternion.premultiply(rootInverse.multiply(correction).multiply(parentBasis));
  }
  wrapper.updateWorldMatrix(true, true);
  for (const [name, bone] of Object.entries(bones)) {
    const tp = tPoseMap.get(name)!;
    rig.joints[name] = {
      bone,
      rest: bone.quaternion.clone(),
      basis: bone.getWorldQuaternion(new THREE.Quaternion()).premultiply(root),
      tPoseRest: tp.rest,
      tPoseBasis: tp.basis,
    };
  }
  for (const side of ['Left', 'Right']) {
    const hip = rig.joints[side + 'UpLeg'];
    const knee = rig.joints[side + 'Leg'];
    const ankle = rig.joints[side + 'Foot'];
    if (!hip || !knee || !ankle || ankle.bone.parent !== knee.bone) continue;
    const anklePosition = ankle.bone.getWorldPosition(new THREE.Vector3());
    const kneePosition = knee.bone.getWorldPosition(new THREE.Vector3());
    const hipPosition = hip.bone.getWorldPosition(new THREE.Vector3());
    rig.legs.push({
      hip, knee, ankle, home: wrapper.worldToLocal(anklePosition.clone()),
      upperLength: hipPosition.distanceTo(kneePosition), lowerLength: anklePosition.distanceTo(kneePosition),
    });
  }
  return rig;
}

const retargetSrcDelta = new THREE.Quaternion();
const retargetWorldDelta = new THREE.Quaternion();
const retargetTgtQuat = new THREE.Quaternion();
const retargetSrcRestInv = new THREE.Quaternion();
const retargetSrcBasisInv = new THREE.Quaternion();
const retargetTgtBasisInv = new THREE.Quaternion();

const retargetIdent = new THREE.Quaternion();

/**
 * Retargets Mixamo skeletal AnimationClips (idle, walk, run, SambaDance) from a
 * source HumanoidRig onto any Mixamo-rigged target HumanoidRig using T-pose world-space deltas.
 */
export function retargetMixamoClips(
  targetRig: HumanoidRig,
  sourceRig: HumanoidRig,
  sourceClips: THREE.AnimationClip[],
  names: string[] = ['idle', 'walk', 'run', 'SambaDance']
) {
  if (!sourceClips.length || !Object.keys(targetRig.joints).length) return;
  const wanted = new Set(names.map((n) => n.toLowerCase()));
  const built: THREE.AnimationClip[] = [];

  for (const srcClip of sourceClips) {
    const clipKey = srcClip.name.toLowerCase();
    const matched = names.find((n) => clipKey === n.toLowerCase() || clipKey.endsWith('_' + n.toLowerCase()));
    if (!matched || !wanted.has(matched.toLowerCase())) continue;
    const isIdle = matched.toLowerCase() === 'idle';
    const isHuman = targetRig.posture !== 'robotic';

    const newTracks: THREE.KeyframeTrack[] = [];
    for (const track of srcClip.tracks) {
      if (!track.name.endsWith('.quaternion')) continue;
      const rawBone = track.name.split('.')[0].replace(/^mixamorig:?/, '').replace(/[.]/g, '');
      const srcJoint = sourceRig.joints[rawBone];
      const tgtJoint = targetRig.joints[rawBone];
      if (!srcJoint || !tgtJoint) continue;

      retargetSrcRestInv.copy(srcJoint.tPoseRest).invert();
      retargetSrcBasisInv.copy(srcJoint.tPoseBasis).invert();
      retargetTgtBasisInv.copy(tgtJoint.tPoseBasis).invert();

      // Attenuate xbot's wide robot hip/shoulder stance on human characters during idle/walk
      const isLegOrShoulder = /UpLeg|Shoulder/.test(rawBone);
      const humanGain = isHuman && isIdle && isLegOrShoulder
        ? (targetRig.posture === 'feminine' ? 0.52 : 0.72)
        : 1.0;

      const times = track.times;
      const values = new Float32Array(track.values.length);
      for (let i = 0; i < times.length; i++) {
        const o = i * 4;
        retargetSrcDelta.set(track.values[o], track.values[o + 1], track.values[o + 2], track.values[o + 3]);
        retargetSrcDelta.premultiply(retargetSrcRestInv);
        retargetWorldDelta.copy(srcJoint.tPoseBasis).multiply(retargetSrcDelta).multiply(retargetSrcBasisInv);
        if (humanGain < 0.999) {
          retargetWorldDelta.slerp(retargetIdent, 1 - humanGain);
        }
        retargetTgtQuat.copy(retargetTgtBasisInv).multiply(retargetWorldDelta).multiply(tgtJoint.tPoseBasis);
        retargetTgtQuat.premultiply(tgtJoint.tPoseRest).normalize();
        values[o] = retargetTgtQuat.x;
        values[o + 1] = retargetTgtQuat.y;
        values[o + 2] = retargetTgtQuat.z;
        values[o + 3] = retargetTgtQuat.w;
      }
      newTracks.push(new THREE.QuaternionKeyframeTrack(`${tgtJoint.bone.uuid}.quaternion`, times, values));
    }

    if (newTracks.length > 0) {
      built.push(new THREE.AnimationClip(matched, srcClip.duration, newTracks));
    }
  }

  if (!built.length) return;
  if (!targetRig.mixer) {
    targetRig.mixer = new THREE.AnimationMixer(targetRig.model);
  }
  for (const clip of built) {
    const lower = clip.name.toLowerCase();
    if (lower === 'idle' || lower === 'walk' || lower === 'run') {
      if (!targetRig.clips[lower]) {
        const action = targetRig.mixer.clipAction(clip).setEffectiveWeight(lower === 'idle' ? 1 : 0).play();
        if (lower !== 'idle') action.time = ((targetRig.wrapper.id % 13) / 13) * clip.duration;
        targetRig.clips[lower] = action;
      }
    } else if (lower === 'sambadance' || lower === 'agree') {
      if (!targetRig.clips.emote) {
        targetRig.clips.emote = targetRig.mixer.clipAction(clip).setEffectiveWeight(0).play();
      }
    }
  }
}

const rigOrigin = new THREE.Vector3();
const ankleTarget = new THREE.Vector3();
const upperOrigin = new THREE.Vector3();
const kneeTarget = new THREE.Vector3();
const kneePole = new THREE.Vector3();
const axis = new THREE.Vector3();
const boneDirection = new THREE.Vector3();
const desiredDirection = new THREE.Vector3();
const jointOrigin = new THREE.Vector3();
const orientation = new THREE.Quaternion();
const parentOrientation = new THREE.Quaternion();
const worldCorrection = new THREE.Quaternion();
const localCorrection = new THREE.Quaternion();
const ankleRotation = new THREE.Quaternion();
const localPitchAxis = new THREE.Vector3(1, 0, 0);

export function strideDistance(speed: number) {
  return THREE.MathUtils.lerp(1.04, 2.58, THREE.MathUtils.smoothstep(speed, 2.5, 6.8));
}

function pointBone(bone: THREE.Bone, child: THREE.Bone, toward: THREE.Vector3, weight: number) {
  const origin = bone.getWorldPosition(jointOrigin);
  child.getWorldPosition(boneDirection).sub(origin).normalize();
  desiredDirection.copy(toward).sub(origin).normalize();
  worldCorrection.setFromUnitVectors(boneDirection, desiredDirection);
  bone.parent!.getWorldQuaternion(parentOrientation);
  localCorrection.copy(parentOrientation).invert().multiply(worldCorrection).multiply(parentOrientation).multiply(bone.quaternion);
  bone.quaternion.slerp(localCorrection, weight);
  bone.updateMatrixWorld(true);
}

function groundLegs(rig: HumanoidRig, ground: GroundMotion, phase: number, speed: number, run: number, weight: number) {
  if (weight < 0.01 || !rig.legs.length) return;
  rig.wrapper.updateWorldMatrix(true, true);
  rig.wrapper.getWorldQuaternion(orientation);
  rig.wrapper.getWorldPosition(rigOrigin);
  const stanceDuration = THREE.MathUtils.lerp(0.66, 0.47, run);
  const distance = strideDistance(speed) * stanceDuration * rig.gait;
  for (const [index, leg] of rig.legs.entries()) {
    const cycle = THREE.MathUtils.euclideanModulo(phase / (Math.PI * 2) + index * 0.5, 1);
    const standing = cycle < stanceDuration;
    const swing = THREE.MathUtils.clamp((cycle - stanceDuration) / (1 - stanceDuration), 0, 1);
    const forward = standing ? 0.5 - cycle / stanceDuration : THREE.MathUtils.smootherstep(swing, 0, 1) - 0.5;
    const lift = standing ? 0 : Math.pow(Math.sin(swing * Math.PI), 1.32) * (0.085 + run * 0.21) * rig.gait;
    ankleTarget.copy(leg.home);
    ankleTarget.x += distance * forward * ground.x;
    ankleTarget.z += distance * forward * ground.z;
    ankleTarget.applyQuaternion(orientation).add(rigOrigin);
    const surfaceY = ground.heightAt(ankleTarget.x, ankleTarget.z);
    ankleTarget.y = surfaceY + leg.home.y + lift;

    leg.hip.bone.getWorldPosition(upperOrigin);
    axis.copy(ankleTarget).sub(upperOrigin);
    const length = THREE.MathUtils.clamp(axis.length(), Math.abs(leg.upperLength - leg.lowerLength) + 0.025,
      (leg.upperLength + leg.lowerLength) * 0.997);
    axis.normalize();
    ankleTarget.copy(upperOrigin).addScaledVector(axis, length);
    kneePole.set(0.045 * (index === 0 ? 1 : -1), 0.06, 1).applyQuaternion(orientation);
    kneePole.addScaledVector(axis, -kneePole.dot(axis)).normalize();
    const projection = (leg.upperLength ** 2 - leg.lowerLength ** 2 + length ** 2) / (2 * length);
    const bend = Math.sqrt(Math.max(0, leg.upperLength ** 2 - projection ** 2));
    kneeTarget.copy(upperOrigin).addScaledVector(axis, projection).addScaledVector(kneePole, bend);
    pointBone(leg.hip.bone, leg.knee.bone, kneeTarget, weight);
    pointBone(leg.knee.bone, leg.ankle.bone, ankleTarget, weight);

    // Roll on the heel at touch-down, then over the toe just before lift-off.
    const heel = standing ? 0.17 * (1 - THREE.MathUtils.smoothstep(cycle, 0, 0.13)) : 0;
    const toe = standing ? 0.24 * THREE.MathUtils.smoothstep(cycle / stanceDuration, 0.7, 1) : 0.15 * (1 - swing);
    const pitch = (toe - heel) * rig.gait * ground.z;
    leg.ankle.bone.parent!.getWorldQuaternion(parentOrientation);
    ankleRotation.copy(parentOrientation).invert().multiply(orientation)
      .multiply(worldCorrection.setFromAxisAngle(localPitchAxis, pitch)).multiply(leg.ankle.basis);
    leg.ankle.bone.quaternion.slerp(ankleRotation, weight);
  }
}

export function animateHumanoid(rig: HumanoidRig, motion: Pose) {
  const { dt, time, phase, speed, reverse = false, lateral = 0, airborne, fallSpeed = 0, landing = 0,
    aim = 0, recoil = 0, emote = 0, lookPitch = 0, lookYaw = 0, ground, swimming = false, swimSpeed = 0,
    sprinting = false, swimWave = 0 } = motion;
  const joints = rig.joints;

  // Smooth state transitions
  rig.gait = THREE.MathUtils.damp(rig.gait, swimming ? 0 : THREE.MathUtils.clamp(speed / 2.25, 0, 1), 13, dt);
  rig.aim = THREE.MathUtils.damp(rig.aim, swimming ? 0 : aim, aim > rig.aim ? 22 : 10, dt);
  rig.air = THREE.MathUtils.damp(rig.air, airborne && !swimming ? 1 : 0, 15, dt);
  rig.swim = THREE.MathUtils.damp(rig.swim, swimming ? 1 : 0, swimming ? 8.5 : 10, dt);

  const swimSprint = THREE.MathUtils.clamp(
    Math.max(sprinting && swimSpeed > 0.35 ? 0.9 : 0, (swimSpeed - 3.35) / 1.85),
    0,
    1
  );
  const freestyleTarget = swimming && swimSpeed > 0.35
    ? THREE.MathUtils.smoothstep(swimSpeed, 0.35, 1.75)
    : 0;
  rig.freestyle = THREE.MathUtils.damp(rig.freestyle, freestyleTarget, freestyleTarget > rig.freestyle ? 6.5 : 8.5, dt);

  const canEmote = emote > 0 && rig.gait < 0.15 && !airborne && !swimming;
  if (canEmote) {
    rig.emoteElapsed += dt;
  } else if (emote <= 0) {
    rig.emoteElapsed = 0;
  }
  const emoteTarget = canEmote
    ? THREE.MathUtils.smoothstep(rig.emoteElapsed, 0, 0.24) * THREE.MathUtils.smoothstep(emote, 0, 0.36)
    : 0;
  rig.emoteBlend = THREE.MathUtils.damp(rig.emoteBlend, emoteTarget, emoteTarget > rig.emoteBlend ? 14 : 10, dt);
  const emoteWeight = rig.emoteBlend * (1 - rig.gait) * (1 - rig.air) * (1 - rig.swim);

  const swing = Math.sin(phase);
  const sway = Math.cos(phase);
  const breath = Math.sin(time * 2.15) + Math.sin(time * 4.3 + 0.55) * 0.16;
  const idleSway = Math.sin(time * 0.72);
  const lookDriftYaw = Math.sin(time * 0.52) * 0.085 + Math.sin(time * 0.23) * 0.05;
  const lookDriftPitch = Math.sin(time * 0.41 + 1.1) * 0.032;

  const run = THREE.MathUtils.smoothstep(speed, 2.7, 5.8);
  const sprint = THREE.MathUtils.clamp(
    Math.max(sprinting && speed > 4.2 ? 0.85 : 0, THREE.MathUtils.smoothstep(speed, 6.0, 9.0)),
    0,
    1
  );
  const center = Math.abs(lateral);
  const animated = Boolean(rig.mixer && rig.clips.walk && rig.clips.run && rig.clips.idle);
  const glide = airborne === 'glide';
  const chute = airborne === 'parachute';
  const jumpAir = airborne === 'jump';
  const groundBlend = (1 - rig.air) * (1 - rig.swim);
  const idleStance = (1 - rig.gait) * groundBlend * (1 - rig.aim) * (1 - emoteWeight);
  const response = 1 - Math.exp(-20 * dt);

  const useEmoteClip = Boolean(rig.clips.emote && (motion.emoteStyle === undefined || motion.emoteStyle === 'DANCE'));
  const procEmoteWeight = useEmoteClip ? 0 : emoteWeight;

  // Fade Mixamo / GLB clip weights cleanly during swimming, airborne, and procedural emotes so clips never fight procedural bone overrides.
  if (animated) {
    const emoteClip = rig.clips.emote;
    const swimFade = 1 - rig.swim;
    const airFade = 1 - rig.air * 0.72;
    const locoFade = swimFade * airFade;
    const clipEmoteW = useEmoteClip ? emoteWeight * swimFade : 0;
    const idleW = (1 - rig.gait) * (1 - emoteWeight) * locoFade;
    const walkW = rig.gait * (1 - run) * locoFade;
    const runW = rig.gait * run * locoFade;

    rig.clips.idle!.setEffectiveWeight(idleW);
    rig.clips.walk!.setEffectiveWeight(walkW).setEffectiveTimeScale(
      (reverse ? -1 : 1) * THREE.MathUtils.clamp(speed / 1.52, 0.56, 1.95)
    );
    rig.clips.run!.setEffectiveWeight(runW).setEffectiveTimeScale(
      THREE.MathUtils.clamp(speed / 4.95, 0.72, 1.62)
    );
    if (emoteClip) {
      emoteClip.setEffectiveWeight(clipEmoteW);
    }
    const totalWeight = idleW + walkW + runW + clipEmoteW;
    for (const action of [rig.clips.walk!, rig.clips.run!]) {
      action.paused = Boolean(ground) || totalWeight < 0.004;
      if (ground && totalWeight >= 0.004) {
        const direction = reverse ? -1 : 1;
        action.time = THREE.MathUtils.euclideanModulo((direction * phase) / (Math.PI * 2), 1) * action.getClip().duration;
      }
    }
    rig.clips.idle!.paused = totalWeight < 0.004;
    if (totalWeight >= 0.004) {
      rig.mixer!.update(dt);
    }
  } else if (rig.mixer && rig.clips.emote && useEmoteClip && emoteWeight > 0.004) {
    rig.clips.emote.setEffectiveWeight(emoteWeight * (1 - rig.swim));
    rig.mixer.update(dt);
  }

  const authored = !animated || center > 0.13;
  const baseBlend = authored ? response * (1 - rig.swim) : 0;
  const landComp = landing * (1 - rig.swim);
  const overlay = Math.max(baseBlend, rig.air, landComp * 0.92, procEmoteWeight);
  const stride = rig.gait * (0.44 + run * 0.28 + sprint * 0.14) * groundBlend;

  // Airborne phase breakdown: crisp takeoff tuck -> mid-air arms-out balance -> touchdown brace
  const takeoffTuck = jumpAir ? THREE.MathUtils.clamp((fallSpeed - 1.4) / 5.8, 0, 1) : 0;
  const descentPrep = jumpAir ? THREE.MathUtils.clamp((-fallSpeed - 1.8) / 7.5, 0, 1) : 0;
  const apexBalance = jumpAir ? Math.max(0, 1 - takeoffTuck * 0.75) : 0;

  const airLean = glide ? 0.76 : chute ? -0.14 : 0.10 + takeoffTuck * 0.18 - descentPrep * 0.08;
  const sprintLean = (0.03 + run * 0.15 + sprint * 0.17) * rig.gait * groundBlend;
  const lean = sprintLean + airLean * rig.air + landComp * 0.28;

  // Core torso, pelvis, chest, shoulders & head (land locomotion, breathing idle, jump/landing & sprint lean)
  const hipDrop = swing * stride * 0.065 * (1 - center) - lateral * rig.gait * 0.12 + idleStance * idleSway * 0.032;
  const sprintOverlay = Math.max(overlay, animated ? sprint * rig.gait * groundBlend * 0.28 : 0);
  setPose(
    joints.Hips,
    lean * 0.36 + landComp * 0.16,
    sway * stride * (0.12 + sprint * 0.04) + idleStance * (0.04 + idleSway * 0.035),
    hipDrop,
    overlay
  );
  setPose(
    joints.Spine,
    lean + breath * 0.018 * idleStance + landComp * 0.14,
    -sway * stride * (0.24 + sprint * 0.08) - idleStance * (0.035 + idleSway * 0.02),
    lateral * 0.09 - idleStance * idleSway * 0.024,
    sprintOverlay
  );
  const upperAimBlend = Math.max(baseBlend, rig.aim * 0.78, procEmoteWeight, landComp * 0.45);
  setPose(
    joints.Spine1,
    breath * 0.024 * idleStance - landComp * 0.10 - idleStance * 0.022 + rig.aim * lookPitch * 0.18,
    -sway * stride * 0.10 * (1 - rig.aim) + rig.aim * (-0.16 + lookYaw * 0.28),
    -idleStance * idleSway * 0.012 * (1 - rig.aim),
    upperAimBlend
  );
  setPose(
    joints.Spine2,
    breath * 0.016 * idleStance + rig.aim * lookPitch * 0.10,
    rig.aim * (-0.08 + lookYaw * 0.14),
    0,
    Math.max(baseBlend * 0.65, rig.aim * 0.65, procEmoteWeight)
  );
  const headBlend = Math.max(baseBlend, rig.aim, rig.air, procEmoteWeight, idleStance * (animated ? 0.35 : 0.9));
  setPose(
    joints.Head,
    -lean * 0.74 + lookPitch * (0.36 + rig.aim * 0.22) + idleStance * (breath * 0.014 + lookDriftPitch),
    lookYaw * (0.44 + rig.aim * 0.16) - sway * stride * 0.07 + idleStance * lookDriftYaw,
    -lateral * 0.05 + idleStance * idleSway * 0.025,
    headBlend
  );

  // Legs & Arms (walk/jog/sprint, takeoff tuck, mid-air balance, touchdown compression, upper-body weapon aim)
  for (const [side, sign] of [['Left', 1], ['Right', -1]] as const) {
    const cycle = swing * sign;
    const rise = Math.max(0, Math.sin(phase - 0.45) * sign);
    const step = cycle * stride * (reverse ? -1 : 1) * (1 - center * 0.58);
    const strideWidth = (cycle * 0.39 + sign * 0.11) * lateral * rig.gait;

    // Takeoff drives lead knee high while trail leg extends; mid-air relaxes into agile athletic balance
    const jumpHipBend = sign > 0
      ? 0.78 * takeoffTuck + 0.34 * apexBalance - 0.06 * descentPrep
      : 0.24 * takeoffTuck + 0.22 * apexBalance + 0.12 * descentPrep;
    const bent = (jumpAir ? jumpHipBend : chute ? 0.46 : 0.22) * rig.air;
    const jumpKneeBend = sign > 0
      ? 1.24 * takeoffTuck + 0.66 * apexBalance + 0.32 * descentPrep
      : 0.62 * takeoffTuck + 0.48 * apexBalance + 0.36 * descentPrep;
    const knee =
      rise * stride * (1.12 + run * 0.54 + sprint * 0.32) +
      rig.air * (glide ? 0.36 : jumpAir ? jumpKneeBend : 0.78) +
      landComp * 0.96;

    setPose(
      joints[side + 'UpLeg'],
      -step - bent - landComp * 0.48 - idleStance * (sign > 0 ? 0.04 : 0.015),
      idleStance * sign * 0.03,
      strideWidth + sign * (chute ? 0.14 : jumpAir ? 0.085 : 0.04) * rig.air + sign * (idleStance * 0.05 + landComp * 0.06),
      overlay
    );
    setPose(
      joints[side + 'Leg'],
      knee + idleStance * (sign > 0 ? 0.07 : 0.03),
      0,
      -strideWidth * 0.27,
      overlay
    );
    setPose(
      joints[side + 'Foot'],
      -knee * 0.42 - Math.max(0, cycle) * stride * 0.32 + Math.max(0, -cycle) * stride * 0.24 - landComp * 0.32 - idleStance * 0.03,
      lateral * 0.13 + sign * idleStance * 0.05,
      -strideWidth * 0.45 - sign * idleStance * 0.035,
      overlay
    );
    setPose(joints[side + 'ToeBase'], Math.max(0, -cycle) * stride * 0.58, 0, 0, overlay);

    // Shoulder subtle float & aim alignment
    const shoulderBlend = Math.max(baseBlend * 0.7, rig.aim * 0.75, rig.air * 0.65, procEmoteWeight);
    setPose(
      joints[side + 'Shoulder'],
      rig.aim * (sign < 0 ? -0.10 : -0.06),
      rig.aim * sign * 0.12,
      sign * (idleStance * (0.025 + breath * 0.014) + rig.air * 0.14 + landComp * 0.06),
      shoulderBlend
    );

    // Upper-body arm swing, jump arms-out balance, touchdown brace, relaxed human idle hang, and asymmetric two-handed tactical aiming
    const idleRelaxArmWeight = animated && rig.posture !== 'robotic'
      ? idleStance * (rig.posture === 'feminine' ? 0.72 : 0.56)
      : 0;
    const idleRelaxForeWeight = animated && rig.posture !== 'robotic'
      ? idleStance * (rig.posture === 'feminine' ? 0.58 : 0.44)
      : 0;
    const armWeight = Math.max(baseBlend, rig.aim, rig.air, landComp * 0.65, procEmoteWeight, idleRelaxArmWeight);
    const foreArmWeight = Math.max(baseBlend, rig.aim, rig.air, landComp * 0.65, procEmoteWeight, idleRelaxForeWeight);
    const jumpArmReach = -0.78 * takeoffTuck - 0.38 * apexBalance - 0.34 * descentPrep;
    const reach = chute ? -1.85 : glide ? -0.53 : jumpArmReach;
    const armSwing = cycle * stride * (0.78 + run * 0.38 + sprint * 0.22) - idleStance * (0.035 - breath * 0.012) - landComp * 0.42;
    const idleArmOut = (0.028 + breath * 0.008) * groundBlend * (1 - rig.aim) * sign;
    const airArmOut = (glide ? 1.18 : chute ? 0.48 : 0.38 * takeoffTuck + 0.58 * apexBalance + 0.24 * descentPrep) * sign * rig.air;

    // Two-handed tactical aim: right hand on grip/trigger, left hand reaches across to foregrip
    const aimArmX = (sign < 0 ? -1.32 : -1.24) + lookPitch * 0.50 + recoil * (sign < 0 ? 0.38 : 0.26);
    const aimArmY = sign < 0 ? -0.14 : 0.48;
    const aimArmZ = sign < 0 ? -0.18 : 0.08;
    const aimForeX = (sign < 0 ? -0.66 : -0.84) - recoil * 0.16;
    const aimForeY = sign < 0 ? 0.24 : -0.44;

    const swingElbowPump = Math.max(0, -cycle) * stride * (0.28 + sprint * 0.35);
    const locoForeX = -0.18 - run * 0.56 * groundBlend - sprint * 0.34 * groundBlend - swingElbowPump -
      (chute ? 0.85 : jumpAir ? 0.42 + takeoffTuck * 0.36 : 0.28) * rig.air - landComp * 0.36 - idleStance * breath * 0.018;

    setPose(
      joints[side + 'Arm'],
      THREE.MathUtils.lerp(armSwing + reach * rig.air, aimArmX, rig.aim),
      THREE.MathUtils.lerp(0, aimArmY, rig.aim),
      THREE.MathUtils.lerp(airArmOut + idleArmOut + sign * landComp * 0.24, aimArmZ, rig.aim),
      armWeight
    );
    setPose(
      joints[side + 'ForeArm'],
      THREE.MathUtils.lerp(locoForeX, aimForeX, rig.aim),
      THREE.MathUtils.lerp(0, aimForeY, rig.aim),
      0,
      foreArmWeight
    );
  }

  // Expressive Full-Body Emotes (WAVE, DANCE, SPIN, FLEX, SHUFFLE)
  let emoteDrop = 0;
  if (procEmoteWeight > 0.004) {
    const tEmote = rig.emoteElapsed;
    const style = motion.emoteStyle ?? 'WAVE';
    const groove = Math.sin(tEmote * 6.4);
    const bounce = 0.5 - 0.5 * Math.cos(tEmote * 12.8);
    const wave = Math.sin(tEmote * 8.2);

    if (style === 'DANCE') {
      const beat = Math.sin(tEmote * 8.6);
      const halfBeat = Math.sin(tEmote * 4.3);
      const pulse = 0.5 - 0.5 * Math.cos(tEmote * 17.2);
      emoteDrop = -0.075 * pulse * procEmoteWeight;
      setPose(joints.Hips, -0.07 * pulse, beat * 0.28, beat * 0.14, procEmoteWeight);
      setPose(joints.Spine, -0.09 - 0.06 * pulse, -beat * 0.22, -beat * 0.11, procEmoteWeight);
      setPose(joints.Spine1, -0.07 + 0.05 * pulse, beat * 0.18, halfBeat * 0.08, procEmoteWeight);
      setPose(joints.Head, -0.04 + 0.08 * pulse, -beat * 0.16, beat * 0.10, procEmoteWeight);
      for (const [side, sign] of [['Left', 1], ['Right', -1]] as const) {
        const alt = Math.max(0, sign * beat);
        setPose(joints[side + 'Shoulder'], 0, 0, sign * (0.10 + 0.12 * alt), procEmoteWeight);
        setPose(joints[side + 'UpLeg'], -0.22 * pulse - 0.18 * alt, sign * 0.08, sign * 0.12, procEmoteWeight);
        setPose(joints[side + 'Leg'], 0.42 * pulse + 0.32 * alt, 0, 0, procEmoteWeight);
        setPose(joints[side + 'Foot'], -0.20 * pulse, sign * 0.06, -sign * 0.05, procEmoteWeight);
        setPose(joints[side + 'Arm'], -1.42 + Math.sin(tEmote * 8.6 + sign * 1.45) * 0.48, sign * 0.24, -sign * (0.48 + 0.22 * pulse), procEmoteWeight);
        setPose(joints[side + 'ForeArm'], -1.08 - 0.42 * Math.cos(tEmote * 8.6 + sign), sign * 0.14, 0, procEmoteWeight);
        setPose(joints[side + 'Hand'], Math.sin(tEmote * 17.2 + sign) * 0.24, 0, 0, procEmoteWeight);
      }
    } else if (style === 'SPIN') {
      const spinProgress = THREE.MathUtils.smoothstep(tEmote, 0.14, 1.32);
      const spinAngle = spinProgress * Math.PI * 2;
      const prepCrouch = THREE.MathUtils.smoothstep(tEmote, 0, 0.16) * (1 - THREE.MathUtils.smoothstep(tEmote, 0.16, 0.34));
      const leap = Math.sin(THREE.MathUtils.clamp((tEmote - 0.14) / 1.18, 0, 1) * Math.PI);
      const finishPop = THREE.MathUtils.smoothstep(tEmote, 1.25, 1.55);
      emoteDrop = (0.16 * leap - 0.09 * prepCrouch - 0.03 * finishPop) * procEmoteWeight;
      setPose(joints.Hips, -0.06 * prepCrouch - 0.04 * (1 - leap), spinAngle, 0.05 * leap, procEmoteWeight);
      setPose(joints.Spine, 0.10 * prepCrouch - 0.16 * (leap + finishPop * 0.6), 0, 0, procEmoteWeight);
      setPose(joints.Spine1, -0.08 * (leap + finishPop), 0, 0, procEmoteWeight);
      setPose(joints.Head, -0.10 * (leap + finishPop), 0, 0.06 * finishPop, procEmoteWeight);
      for (const [side, sign] of [['Left', 1], ['Right', -1]] as const) {
        setPose(joints[side + 'Shoulder'], 0, 0, sign * (0.16 * leap + 0.14 * finishPop), procEmoteWeight);
        setPose(joints[side + 'UpLeg'], -0.26 * prepCrouch - 0.16 * leap * (sign > 0 ? 1.5 : 0.4), sign * 0.06, sign * (0.09 + 0.06 * finishPop), procEmoteWeight);
        setPose(joints[side + 'Leg'], 0.52 * prepCrouch + 0.36 * leap * (sign > 0 ? 1.5 : 0.5), 0, 0, procEmoteWeight);
        setPose(joints[side + 'Arm'], -2.52 + 0.16 * Math.sin(tEmote * 9.5) + 0.45 * prepCrouch, sign * 0.22, sign * (0.68 * leap + 0.48 * finishPop), procEmoteWeight);
        setPose(joints[side + 'ForeArm'], -0.26 - 0.28 * prepCrouch, 0, 0, procEmoteWeight);
      }
    } else if (style === 'FLEX') {
      const pump = 0.5 - 0.5 * Math.cos(tEmote * 5.6);
      const turnSide = Math.sin(tEmote * 2.8);
      emoteDrop = -0.045 * pump * procEmoteWeight;
      setPose(joints.Hips, -0.05, 0.22 * turnSide, -0.04 * turnSide, procEmoteWeight);
      setPose(joints.Spine, -0.16 - 0.05 * pump, -0.08 * turnSide, 0.04 * turnSide, procEmoteWeight);
      setPose(joints.Spine1, -0.14 - 0.04 * pump, 0.06 * turnSide, 0, procEmoteWeight);
      setPose(joints.Head, 0.05, -0.20 * turnSide, 0.06 * turnSide, procEmoteWeight);
      for (const [side, sign] of [['Left', 1], ['Right', -1]] as const) {
        setPose(joints[side + 'Shoulder'], -0.06, 0, sign * (0.14 + 0.08 * pump), procEmoteWeight);
        setPose(joints[side + 'UpLeg'], -0.14 - 0.04 * pump, sign * 0.12, sign * 0.17, procEmoteWeight);
        setPose(joints[side + 'Leg'], 0.28 + 0.08 * pump, 0, 0, procEmoteWeight);
        setPose(joints[side + 'Foot'], -0.14, sign * 0.06, -sign * 0.06, procEmoteWeight);
        setPose(joints[side + 'Arm'], -1.24 - 0.18 * pump, sign * 0.26, sign * (1.16 + 0.08 * pump), procEmoteWeight);
        setPose(joints[side + 'ForeArm'], -1.96 - 0.28 * pump, -sign * 0.24, 0, procEmoteWeight);
        setPose(joints[side + 'Hand'], -0.24 * pump, 0, 0, procEmoteWeight);
      }
    } else if (style === 'SHUFFLE') {
      const step = Math.sin(tEmote * 11.2);
      const lift = Math.abs(step);
      emoteDrop = -0.068 * (1 - lift) * procEmoteWeight;
      setPose(joints.Hips, -0.07, step * 0.22, -step * 0.11, procEmoteWeight);
      setPose(joints.Spine, -0.11, -step * 0.18, step * 0.08, procEmoteWeight);
      setPose(joints.Spine1, -0.06, step * 0.12, 0, procEmoteWeight);
      setPose(joints.Head, -0.04 + 0.04 * lift, step * 0.12, -step * 0.06, procEmoteWeight);
      for (const [side, sign] of [['Left', 1], ['Right', -1]] as const) {
        const kick = Math.max(0, sign * step);
        const plant = Math.max(0, -sign * step);
        setPose(joints[side + 'Shoulder'], 0, 0, sign * (0.06 + 0.08 * kick), procEmoteWeight);
        setPose(joints[side + 'UpLeg'], -0.68 * kick + 0.16 * plant - 0.06, sign * 0.08, sign * (0.10 + 0.08 * kick), procEmoteWeight);
        setPose(joints[side + 'Leg'], 1.06 * kick + 0.18, 0, 0, procEmoteWeight);
        setPose(joints[side + 'Foot'], -0.36 * kick + 0.22 * plant, sign * 0.14 * step, 0, procEmoteWeight);
        setPose(joints[side + 'Arm'], -0.52 + sign * step * 0.58, sign * 0.22, sign * (0.36 + 0.10 * lift), procEmoteWeight);
        setPose(joints[side + 'ForeArm'], -1.24 - 0.30 * lift, -sign * 0.16, 0, procEmoteWeight);
      }
    } else {
      // WAVE: warm Riviera salute with rhythmic shoulder groove, left hand poised on hip, expressive elbow/wrist wave
      emoteDrop = -0.048 * bounce * procEmoteWeight;
      setPose(joints.Hips, -0.045 * bounce, groove * 0.14, groove * 0.068, procEmoteWeight);
      setPose(joints.Spine, -0.11 - 0.04 * bounce, -groove * 0.12, -groove * 0.06, procEmoteWeight);
      setPose(joints.Spine1, -0.08, groove * 0.10, 0.04 * wave, procEmoteWeight);
      setPose(joints.Head, -0.06 + 0.045 * bounce, -0.12 + groove * 0.10, 0.08 + wave * 0.06, procEmoteWeight);

      for (const [side, sign] of [['Left', 1], ['Right', -1]] as const) {
        setPose(joints[side + 'UpLeg'], -0.15 * bounce, sign * 0.055, sign * 0.085, procEmoteWeight);
        setPose(joints[side + 'Leg'], 0.30 * bounce, 0, 0, procEmoteWeight);
        setPose(joints[side + 'Foot'], -0.15 * bounce, sign * 0.05, -sign * 0.04, procEmoteWeight);
      }

      setPose(joints.RightShoulder, -0.08, 0, -0.18, procEmoteWeight);
      setPose(joints.RightArm, -2.38 + wave * 0.14, 0.18, -0.58 + wave * 0.26, procEmoteWeight);
      setPose(joints.RightForeArm, -0.48 - wave * 0.42, 0.12, 0.28 * wave, procEmoteWeight);
      setPose(joints.RightHand, wave * 0.28, 0, 0.18 * wave, procEmoteWeight);
      setPose(joints.LeftShoulder, 0, 0, 0.06, procEmoteWeight);
      setPose(joints.LeftArm, -0.16 + groove * 0.10, 0.18, 0.34, procEmoteWeight);
      setPose(joints.LeftForeArm, -0.92 - bounce * 0.12, -0.32, 0, procEmoteWeight);
    }
  }

  // AAA TWO-STATE SWIMMING SYSTEM:
  //   State A (freestyle -> 1): Horizontal prone front-crawl with overhead high-elbow recovery, underwater catch/pull,
  //                             6-beat opposing flutter kick with pointed toes, torso roll, and side-breathing head turn.
  //   State B (freestyle -> 0): Upright buoyant treading water with symmetrical breaststroke arm sculling,
  //                             soft cycling frog/flutter kicks, and wave-synced vertical bobbing.
  const strokeRate = 3.6 + swimSpeed * 0.72 + swimSprint * 1.45;
  rig.stroke = (rig.stroke + dt * strokeRate) % (Math.PI * 2);
  rig.treadPhase = (rig.treadPhase + dt * 2.35) % (Math.PI * 2);

  const swimmingBlend = rig.swim;
  const f = rig.freestyle;
  const swimPitchTarget = swimmingBlend * THREE.MathUtils.lerp(
    0.08 + Math.sin(rig.treadPhase) * 0.035,
    1.36 + swimSprint * 0.06,
    f
  );
  const swimRollTarget = swimmingBlend * Math.sin(rig.stroke) * (0.24 + swimSprint * 0.06) * f;
  rig.wrapper.rotation.x = THREE.MathUtils.damp(rig.wrapper.rotation.x, swimPitchTarget, 10, dt);
  rig.wrapper.rotation.z = THREE.MathUtils.damp(rig.wrapper.rotation.z, swimRollTarget, 10, dt);
  rig.wrapper.position.z = THREE.MathUtils.damp(rig.wrapper.position.z, -0.74 * f * swimmingBlend, 10, dt);

  if (swimmingBlend > 0.01) {
    const treadBobWave = Math.sin(rig.treadPhase);
    const treadSway = Math.sin(rig.treadPhase * 0.5);
    const bodyRoll = Math.sin(rig.stroke);
    const breathTurn = Math.pow(Math.max(0, Math.sin(rig.stroke * 0.5 - 0.35)), 1.6);

    // Core spine, hips, chest, neck & breathing head turn
    setPose(
      joints.Hips,
      THREE.MathUtils.lerp(0.05, -0.06, f),
      THREE.MathUtils.lerp(treadSway * 0.08, bodyRoll * 0.14, f),
      THREE.MathUtils.lerp(treadSway * 0.04, bodyRoll * 0.10, f),
      swimmingBlend
    );
    setPose(
      joints.Spine,
      THREE.MathUtils.lerp(0.08 + treadBobWave * 0.03, -0.09, f),
      THREE.MathUtils.lerp(-treadSway * 0.06, bodyRoll * (0.24 + swimSprint * 0.06), f),
      THREE.MathUtils.lerp(-treadSway * 0.03, bodyRoll * 0.14, f),
      swimmingBlend
    );
    setPose(
      joints.Spine1,
      THREE.MathUtils.lerp(0.04, -0.07, f),
      THREE.MathUtils.lerp(0, bodyRoll * 0.20, f),
      THREE.MathUtils.lerp(0, bodyRoll * 0.08, f),
      swimmingBlend
    );
    setPose(
      joints.Spine2,
      THREE.MathUtils.lerp(0.02, -0.04, f),
      THREE.MathUtils.lerp(0, bodyRoll * 0.12, f),
      0,
      swimmingBlend
    );
    setPose(
      joints.Neck,
      THREE.MathUtils.lerp(-0.04, -0.26 - breathTurn * 0.08, f),
      THREE.MathUtils.lerp(lookYaw * 0.14, -0.22 * breathTurn, f),
      THREE.MathUtils.lerp(0, 0.08 * breathTurn, f),
      swimmingBlend
    );
    setPose(
      joints.Head,
      THREE.MathUtils.lerp(-0.10 + lookPitch * 0.26, -0.70 - breathTurn * 0.16, f),
      THREE.MathUtils.lerp(lookYaw * 0.40 + treadSway * 0.07, -0.56 * breathTurn + lookYaw * 0.12, f),
      THREE.MathUtils.lerp(treadSway * 0.03, 0.16 * breathTurn, f),
      swimmingBlend
    );

    const scullOut = Math.sin(rig.treadPhase);
    const scullDown = Math.cos(rig.treadPhase);

    for (const [side, sign] of [['Left', 1], ['Right', -1]] as const) {
      // Alternating freestyle arm cycle (Left = stroke, Right = stroke + PI)
      const armCycle = rig.stroke + (sign < 0 ? Math.PI : 0);
      const cosC = Math.cos(armCycle);
      const sinC = Math.sin(armCycle);
      const pull = Math.max(0, sinC);      // underwater power catch/pull
      const recovery = Math.max(0, -sinC); // over-water high-elbow recovery
      const reachFwd = Math.max(0, cosC);  // forward entry reach

      // Freestyle arm & shoulder kinematics (YXZ Euler in body frame pitched +78 deg forward)
      const freeShoulderZ = (0.14 * reachFwd + 0.18 * recovery) * sign;
      const freeArmX = -1.54 - cosC * (1.32 + swimSprint * 0.08);
      const freeArmY = (0.86 * recovery - 0.24 * pull) * sign;
      const freeArmZ = (0.24 + 1.26 * recovery + 0.06 * pull) * sign;
      const freeForeX = -0.20 - 0.86 * pull - 1.06 * recovery;
      const freeForeY = -sign * (0.28 * pull - 0.12 * recovery);
      const freeHandX = -0.20 * pull + 0.24 * recovery;
      const freeHandZ = sign * 0.12 * pull;

      // Treading water breaststroke sculling arm kinematics
      const treadShoulderZ = sign * (0.08 + scullOut * 0.06);
      const treadArmX = -0.64 + scullDown * 0.26;
      const treadArmY = sign * (0.24 + scullOut * 0.28);
      const treadArmZ = sign * (0.76 + scullOut * 0.36);
      const treadForeX = -0.78 - scullDown * 0.28;
      const treadForeY = -sign * (0.36 + scullOut * 0.24);
      const treadHandX = scullDown * 0.22;
      const treadHandZ = sign * scullOut * 0.22;

      setPose(
        joints[side + 'Shoulder'],
        THREE.MathUtils.lerp(-0.04, -0.10 * reachFwd, f),
        0,
        THREE.MathUtils.lerp(treadShoulderZ, freeShoulderZ, f),
        swimmingBlend
      );
      setPose(
        joints[side + 'Arm'],
        THREE.MathUtils.lerp(treadArmX, freeArmX, f),
        THREE.MathUtils.lerp(treadArmY, freeArmY, f),
        THREE.MathUtils.lerp(treadArmZ, freeArmZ, f),
        swimmingBlend
      );
      setPose(
        joints[side + 'ForeArm'],
        THREE.MathUtils.lerp(treadForeX, freeForeX, f),
        THREE.MathUtils.lerp(treadForeY, freeForeY, f),
        0,
        swimmingBlend
      );
      setPose(
        joints[side + 'Hand'],
        THREE.MathUtils.lerp(treadHandX, freeHandX, f),
        0,
        THREE.MathUtils.lerp(treadHandZ, freeHandZ, f),
        swimmingBlend
      );

      // Freestyle 6-beat flutter kick (3x per stroke cycle) vs Treading soft cycling frog-flutter kick
      const flutterPhase = rig.stroke * 3 + (sign < 0 ? Math.PI : 0);
      const flutter = Math.sin(flutterPhase);
      const freeUpLegX = flutter * (0.30 + swimSprint * 0.10) + 0.06;
      const freeUpLegZ = sign * 0.065;
      const freeLegX = 0.16 + Math.max(0, -flutter) * (0.50 + swimSprint * 0.16);
      const freeFootX = 0.54 + flutter * 0.14; // pointed toes (plantarflexion)

      const treadKickPhase = rig.treadPhase * 1.2 + (sign < 0 ? Math.PI : 0);
      const treadKick = Math.sin(treadKickPhase);
      const treadUpLegX = -0.44 + treadKick * 0.28;
      const treadUpLegZ = sign * (0.20 + Math.max(0, treadKick) * 0.16);
      const treadLegX = 0.72 + Math.max(0, -treadKick) * 0.44;
      const treadFootX = 0.34 - treadKick * 0.24;

      setPose(
        joints[side + 'UpLeg'],
        THREE.MathUtils.lerp(treadUpLegX, freeUpLegX, f),
        THREE.MathUtils.lerp(sign * 0.08, 0, f),
        THREE.MathUtils.lerp(treadUpLegZ, freeUpLegZ, f),
        swimmingBlend
      );
      setPose(
        joints[side + 'Leg'],
        THREE.MathUtils.lerp(treadLegX, freeLegX, f),
        0,
        0,
        swimmingBlend
      );
      setPose(
        joints[side + 'Foot'],
        THREE.MathUtils.lerp(treadFootX, freeFootX, f),
        0,
        0,
        swimmingBlend
      );
      setPose(joints[side + 'ToeBase'], THREE.MathUtils.lerp(0.08, 0.20, f), 0, 0, swimmingBlend);
    }
  }

  const treadVerticalBob = (Math.sin(rig.treadPhase) * 0.036 + swimWave * 0.05) * (1 - f);
  const freestyleBob = Math.sin(rig.stroke * 2) * 0.02 * f;
  const swimYOffset = swimmingBlend * (0.90 * f + treadVerticalBob + freestyleBob);

  const bob = ground
    ? (-0.044 - run * 0.085 - sprint * 0.035) * rig.gait + Math.abs(sway) * (0.028 + sprint * 0.018) * rig.gait + breath * 0.005 * idleStance
    : (animated && !authored ? 0 : Math.abs(sway) * stride * 0.06 + breath * 0.005 * idleStance);
  rig.wrapper.position.y = THREE.MathUtils.damp(
    rig.wrapper.position.y,
    bob * (1 - swimmingBlend) - landComp * 0.17 + swimYOffset + emoteDrop,
    20,
    dt
  );

  if (motion.harvest !== undefined && swimmingBlend < 0.1) {
    const progress = motion.harvest;
    const windup = Math.sin((Math.PI * THREE.MathUtils.smoothstep(progress, 0, 0.51)) / 2);
    const follow = THREE.MathUtils.smoothstep(progress, 0.38, 0.64);
    const blend = (1 - THREE.MathUtils.smoothstep(progress, 0.69, 1)) * windup;
    setPose(joints.Spine, -0.19 + follow * 0.52, -0.48 + follow * 0.63, 0.055, blend);
    setPose(joints.RightArm, -2.15 + follow * 1.59, 0.28, -0.26, blend);
    setPose(joints.LeftArm, -1.48 + follow * 0.94, -0.37, 0.31, blend);
    setPose(joints.RightForeArm, -1.14 + follow * 0.42, 0, 0, blend);
    setPose(joints.LeftForeArm, -0.76, 0, 0, blend);
  }
  if (ground && swimmingBlend < 0.08) groundLegs(rig, ground, phase, speed, run, groundBlend ** 2);
}
