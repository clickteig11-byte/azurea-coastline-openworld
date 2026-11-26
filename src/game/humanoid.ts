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
  stroke: number;
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
    wrapper, model, posture, joints: {}, gait: 0, aim: 0, air: 0, swim: 0, stroke: 0,
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

  // Drop A/T-pose arms into a relaxed, natural standing hang.
  for (const side of ['Left', 'Right']) {
    const arm = bones[side + 'Arm'];
    const elbow = bones[side + 'ForeArm'];
    if (!arm || !elbow) continue;
    elbow.getWorldPosition(armDirection).sub(arm.getWorldPosition(new THREE.Vector3())).applyQuaternion(root).normalize();
    const sign = Math.sign(armDirection.x) || (side === 'Left' ? 1 : -1);
    const drop = Math.max(0, Math.acos(THREE.MathUtils.clamp(-armDirection.y, -1, 1)) - 0.16);
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
    aim = 0, recoil = 0, emote = 0, lookPitch = 0, lookYaw = 0, ground, swimming = false, swimSpeed = 0 } = motion;
  const joints = rig.joints;
  rig.gait = THREE.MathUtils.damp(rig.gait, THREE.MathUtils.clamp(speed / 2.3, 0, 1), 13, dt);
  rig.aim = THREE.MathUtils.damp(rig.aim, aim, aim > rig.aim ? 22 : 10, dt);
  rig.air = THREE.MathUtils.damp(rig.air, airborne ? 1 : 0, 15, dt);

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
  const breath = Math.sin(time * 2.45);
  const idleSway = Math.sin(time * 0.95);
  const run = THREE.MathUtils.smoothstep(speed, 2.8, 6.3);
  const center = Math.abs(lateral);
  const animated = Boolean(rig.mixer && rig.clips.walk && rig.clips.run && rig.clips.idle);
  const glide = airborne === 'glide';
  const chute = airborne === 'parachute';
  const tuck = airborne === 'jump';
  const groundBlend = 1 - rig.air;
  const idleStance = (1 - rig.gait) * groundBlend * (1 - rig.aim);
  const response = 1 - Math.exp(-20 * dt);

  const useEmoteClip = Boolean(rig.clips.emote && (motion.emoteStyle === undefined || motion.emoteStyle === 'DANCE'));
  if (animated) {
    const emoteClip = rig.clips.emote;
    const clipEmoteW = useEmoteClip ? emoteWeight : 0;
    rig.clips.idle!.setEffectiveWeight((1 - rig.gait) * (1 - emoteWeight));
    rig.clips.walk!.setEffectiveWeight(rig.gait * (1 - run)).setEffectiveTimeScale(
      (reverse ? -1 : 1) * THREE.MathUtils.clamp(speed / 1.5, 0.56, 1.9));
    rig.clips.run!.setEffectiveWeight(rig.gait * run).setEffectiveTimeScale(THREE.MathUtils.clamp(speed / 5.1, 0.7, 1.4));
    if (emoteClip) {
      emoteClip.setEffectiveWeight(clipEmoteW);
    }
    for (const action of [rig.clips.walk!, rig.clips.run!]) {
      action.paused = Boolean(ground);
      if (ground) {
        const direction = reverse ? -1 : 1;
        action.time = THREE.MathUtils.euclideanModulo(direction * phase / (Math.PI * 2), 1) * action.getClip().duration;
      }
    }
    rig.mixer!.update(dt);
  } else if (rig.mixer && rig.clips.emote && useEmoteClip && emoteWeight > 0.004) {
    rig.clips.emote.setEffectiveWeight(emoteWeight);
    rig.mixer.update(dt);
  }
  const procEmoteWeight = useEmoteClip ? 0 : emoteWeight;
  const authored = !animated || center > 0.13;
  const baseBlend = authored ? response : 0;
  const overlay = Math.max(baseBlend, rig.air, landing * 0.85, procEmoteWeight);
  const stride = rig.gait * (0.42 + run * 0.27) * groundBlend;
  const airLean = glide ? 0.76 : chute ? -0.12 : 0.11;
  const lean = (0.02 + run * 0.18) * rig.gait * groundBlend + airLean * rig.air + landing * 0.24;
  setPose(joints.Hips, lean * 0.4, sway * stride * 0.105 + idleStance * 0.04,
    -lateral * rig.gait * 0.12 + idleStance * idleSway * 0.02, overlay);
  setPose(joints.Spine, lean + breath * 0.014, -sway * stride * 0.2 - idleStance * 0.04,
    lateral * 0.09 - idleStance * idleSway * 0.015, overlay);
  setPose(joints.Spine1, breath * 0.014 - landing * 0.08 - idleStance * 0.025, rig.aim * lookYaw * 0.22,
    0, Math.max(baseBlend, rig.aim * 0.5, procEmoteWeight));
  setPose(joints.Head, -lean * 0.68 + lookPitch * 0.36 + idleStance * breath * 0.012,
    lookYaw * 0.42 - sway * stride * 0.06 + idleStance * idleSway * 0.035,
    -lateral * 0.05, Math.max(baseBlend, rig.aim, rig.air, procEmoteWeight));

  for (const [side, sign] of [['Left', 1], ['Right', -1]] as const) {
    const cycle = swing * sign;
    const rise = Math.max(0, Math.sin(phase - 0.47) * sign);
    const step = cycle * stride * (reverse ? -1 : 1) * (1 - center * 0.6);
    const strideWidth = (cycle * 0.39 + sign * 0.11) * lateral * rig.gait;
    const bent = (tuck ? (fallSpeed > 0 ? 0.57 : 0.26) + sign * 0.17 : chute ? 0.44 : 0.2) * rig.air;
    const knee = rise * stride * (1.05 + run * 0.5) + rig.air * (glide ? 0.36 : 0.77) + landing * 0.59;
    setPose(joints[side + 'UpLeg'], -step - bent - landing * 0.29 - idleStance * (sign > 0 ? 0.035 : 0.015), 0,
      strideWidth + sign * (chute ? 0.12 : 0.038) * rig.air + sign * idleStance * 0.045, overlay);
    setPose(joints[side + 'Leg'], knee + idleStance * (sign > 0 ? 0.06 : 0.03), 0, -strideWidth * 0.27, overlay);
    setPose(joints[side + 'Foot'], -knee * 0.43 - Math.max(0, cycle) * stride * 0.35 - idleStance * 0.03,
      lateral * 0.13 + sign * idleStance * 0.05, -strideWidth * 0.45 - sign * idleStance * 0.035, overlay);
    setPose(joints[side + 'ToeBase'], Math.max(0, -cycle) * stride * 0.55, 0, 0, overlay);

    const armWeight = Math.max(baseBlend, rig.aim, rig.air, procEmoteWeight);
    const reach = chute ? -1.85 : glide ? -0.53 : -0.37;
    const armSwing = cycle * stride * (0.73 + run * 0.34) - idleStance * 0.04;
    const idleArmOut = (0.075 * groundBlend * (1 - rig.aim)) * sign;
    setPose(joints[side + 'Arm'], THREE.MathUtils.lerp(armSwing + reach * rig.air,
      -1.15 + lookPitch * 0.4 + recoil * 0.35, rig.aim), rig.aim * sign * 0.22,
      (glide ? 1.18 : chute ? 0.46 : 0.13) * sign * rig.air + idleArmOut - 0.12 * sign * rig.aim, armWeight);
    setPose(joints[side + 'ForeArm'], -0.22 - run * 0.52 * groundBlend - (chute ? 0.83 : 0.28) * rig.air - rig.aim * 0.46,
      -sign * rig.aim * 0.24, 0, armWeight);
  }

  let emoteDrop = 0;
  if (procEmoteWeight > 0.004) {
    const tEmote = rig.emoteElapsed;
    const style = motion.emoteStyle ?? 'WAVE';
    const groove = Math.sin(tEmote * 6.2);
    const bounce = 0.5 - 0.5 * Math.cos(tEmote * 12.4);
    const wave = Math.sin(tEmote * 7.8);

    if (style === 'DANCE') {
      const beat = Math.sin(tEmote * 8.4);
      const pulse = 0.5 - 0.5 * Math.cos(tEmote * 16.8);
      emoteDrop = -0.065 * pulse * procEmoteWeight;
      setPose(joints.Hips, -0.06 * pulse, beat * 0.24, beat * 0.11, procEmoteWeight);
      setPose(joints.Spine, -0.08 - 0.05 * pulse, -beat * 0.18, -beat * 0.09, procEmoteWeight);
      setPose(joints.Spine1, -0.06, beat * 0.14, 0, procEmoteWeight);
      setPose(joints.Head, -0.04 + 0.06 * pulse, -beat * 0.14, beat * 0.08, procEmoteWeight);
      for (const [side, sign] of [['Left', 1], ['Right', -1]] as const) {
        const alt = Math.max(0, sign * beat);
        setPose(joints[side + 'UpLeg'], -0.20 * pulse - 0.16 * alt, sign * 0.07, sign * 0.11, procEmoteWeight);
        setPose(joints[side + 'Leg'], 0.38 * pulse + 0.28 * alt, 0, 0, procEmoteWeight);
        setPose(joints[side + 'Foot'], -0.18 * pulse, sign * 0.05, -sign * 0.05, procEmoteWeight);
        setPose(joints[side + 'Arm'], -1.35 + Math.sin(tEmote * 8.4 + sign * 1.4) * 0.42, sign * 0.22, -sign * (0.48 + 0.18 * pulse), procEmoteWeight);
        setPose(joints[side + 'ForeArm'], -1.05 - 0.35 * Math.cos(tEmote * 8.4 + sign), 0, 0, procEmoteWeight);
      }
    } else if (style === 'SPIN') {
      const spinProgress = THREE.MathUtils.smoothstep(tEmote, 0.1, 1.35);
      const spinAngle = spinProgress * Math.PI * 2;
      const leap = Math.sin(Math.min(1, tEmote / 1.45) * Math.PI);
      emoteDrop = (0.14 * leap - 0.04 * (1 - leap)) * procEmoteWeight;
      setPose(joints.Hips, -0.05 * (1 - leap), spinAngle, 0, procEmoteWeight);
      setPose(joints.Spine, -0.14, 0, 0, procEmoteWeight);
      setPose(joints.Head, -0.08, 0, 0, procEmoteWeight);
      for (const [side, sign] of [['Left', 1], ['Right', -1]] as const) {
        setPose(joints[side + 'UpLeg'], -0.12 * (1 - leap), sign * 0.05, sign * 0.08, procEmoteWeight);
        setPose(joints[side + 'Leg'], 0.24 * (1 - leap), 0, 0, procEmoteWeight);
        setPose(joints[side + 'Arm'], -2.45 + 0.12 * Math.sin(tEmote * 9), sign * 0.18, -sign * 0.52, procEmoteWeight);
        setPose(joints[side + 'ForeArm'], -0.24, 0, 0, procEmoteWeight);
      }
    } else if (style === 'FLEX') {
      const pump = 0.5 - 0.5 * Math.cos(tEmote * 5.2);
      emoteDrop = -0.03 * pump * procEmoteWeight;
      setPose(joints.Hips, -0.04, 0.14 * Math.sin(tEmote * 2.6), 0, procEmoteWeight);
      setPose(joints.Spine, -0.14 - 0.04 * pump, 0, 0, procEmoteWeight);
      setPose(joints.Spine1, -0.10, 0, 0, procEmoteWeight);
      setPose(joints.Head, 0.04, -0.12 * Math.sin(tEmote * 2.6), 0, procEmoteWeight);
      for (const [side, sign] of [['Left', 1], ['Right', -1]] as const) {
        setPose(joints[side + 'UpLeg'], -0.10, sign * 0.10, sign * 0.15, procEmoteWeight);
        setPose(joints[side + 'Leg'], 0.20, 0, 0, procEmoteWeight);
        setPose(joints[side + 'Foot'], -0.10, sign * 0.05, -sign * 0.06, procEmoteWeight);
        setPose(joints[side + 'Arm'], -1.18 - 0.14 * pump, sign * 0.22, -sign * 1.12, procEmoteWeight);
        setPose(joints[side + 'ForeArm'], -1.88 - 0.26 * pump, sign * 0.18, 0, procEmoteWeight);
      }
    } else if (style === 'SHUFFLE') {
      const step = Math.sin(tEmote * 10.5);
      const lift = Math.abs(step);
      emoteDrop = -0.055 * (1 - lift) * procEmoteWeight;
      setPose(joints.Hips, -0.06, step * 0.18, -step * 0.09, procEmoteWeight);
      setPose(joints.Spine, -0.10, -step * 0.14, step * 0.06, procEmoteWeight);
      setPose(joints.Head, -0.04, step * 0.10, -step * 0.05, procEmoteWeight);
      for (const [side, sign] of [['Left', 1], ['Right', -1]] as const) {
        const kick = Math.max(0, sign * step);
        setPose(joints[side + 'UpLeg'], -0.58 * kick - 0.08, sign * 0.06, sign * 0.09, procEmoteWeight);
        setPose(joints[side + 'Leg'], 0.92 * kick + 0.14, 0, 0, procEmoteWeight);
        setPose(joints[side + 'Foot'], -0.32 * kick, 0, 0, procEmoteWeight);
        setPose(joints[side + 'Arm'], -0.45 + sign * step * 0.48, sign * 0.2, -sign * 0.34, procEmoteWeight);
        setPose(joints[side + 'ForeArm'], -1.15 - 0.25 * lift, 0, 0, procEmoteWeight);
      }
    } else {
      emoteDrop = -0.042 * bounce * procEmoteWeight;

      // Confident chest lift, rhythmic shoulder groove, subtle knee bounce, and raised right-arm salute/wave
      setPose(joints.Hips, -0.04 * bounce, groove * 0.12, groove * 0.055, procEmoteWeight);
      setPose(joints.Spine, -0.10 - 0.035 * bounce, -groove * 0.11, -groove * 0.05, procEmoteWeight);
      setPose(joints.Spine1, -0.075, groove * 0.08, 0, procEmoteWeight);
      setPose(joints.Head, -0.055 + 0.04 * bounce, -0.10 + groove * 0.08, groove * 0.05, procEmoteWeight);

      for (const [side, sign] of [['Left', 1], ['Right', -1]] as const) {
        setPose(joints[side + 'UpLeg'], -0.14 * bounce, sign * 0.05, sign * 0.075, procEmoteWeight);
        setPose(joints[side + 'Leg'], 0.28 * bounce, 0, 0, procEmoteWeight);
        setPose(joints[side + 'Foot'], -0.14 * bounce, sign * 0.05, -sign * 0.04, procEmoteWeight);
      }

      setPose(joints.RightArm, -2.32 + wave * 0.12, 0.18, -0.56 + wave * 0.22, procEmoteWeight);
      setPose(joints.RightForeArm, -0.52 - wave * 0.36, 0, 0.24 * wave, procEmoteWeight);
      setPose(joints.LeftArm, -0.22 + groove * 0.12, 0.14, 0.24, procEmoteWeight);
      setPose(joints.LeftForeArm, -0.68 - bounce * 0.12, 0.25, 0, procEmoteWeight);
    }
  }

  rig.swim = THREE.MathUtils.damp(rig.swim, swimming ? 1 : 0, 10, dt);
  rig.stroke = (rig.stroke + dt * (2.6 + 0.73 * swimSpeed)) % (2 * Math.PI);
  const swimmingBlend = rig.swim;
  const freestyle = swimmingBlend * THREE.MathUtils.smoothstep(swimSpeed, 0.18, 2.5);
  rig.wrapper.rotation.x = THREE.MathUtils.damp(rig.wrapper.rotation.x, 1.13 * freestyle, 12, dt);
  if (swimmingBlend > 0.02) {
    setPose(joints.Head, -0.49 * freestyle, Math.sin(rig.stroke * 0.5) * 0.24 * freestyle, 0, swimmingBlend);
    setPose(joints.Spine, 0.07 * freestyle, 0, Math.sin(rig.stroke) * 0.18 * freestyle, swimmingBlend);
    for (const [side, sign] of [['Left', 1], ['Right', -1]] as const) {
      const cycle = rig.stroke + (sign < 0 ? Math.PI : 0);
      const kick = Math.sin(cycle * 2) * 0.23;
      setPose(joints[side + 'Arm'], -0.35 + Math.cos(cycle) * 1.42 * freestyle, 0.15 * sign,
        (0.64 - 0.4 * freestyle + Math.sin(cycle) * 0.34) * sign, swimmingBlend);
      setPose(joints[side + 'ForeArm'], -0.55 - Math.max(0, Math.sin(cycle)) * 0.74, 0, 0, swimmingBlend);
      setPose(joints[side + 'UpLeg'], kick * freestyle - 0.23 * (1 - freestyle), 0, sign * 0.09, swimmingBlend);
      setPose(joints[side + 'Leg'], 0.35 + Math.max(0, -kick) * 1.25, 0, 0, swimmingBlend);
      setPose(joints[side + 'Foot'], -0.22, 0, 0, swimmingBlend);
    }
  }

  const bob = ground
    ? (-0.044 - run * 0.093) * rig.gait + Math.abs(sway) * 0.024 * rig.gait + breath * 0.004
    : (animated && !authored ? 0 : Math.abs(sway) * stride * 0.055 + breath * 0.004);
  rig.wrapper.position.y = THREE.MathUtils.damp(rig.wrapper.position.y, bob - landing * 0.10 + freestyle * 0.7 + emoteDrop, 22, dt);
  if (motion.harvest !== undefined) {
    const progress = motion.harvest;
    const windup = Math.sin(Math.PI * THREE.MathUtils.smoothstep(progress, 0, 0.51) / 2);
    const follow = THREE.MathUtils.smoothstep(progress, 0.38, 0.64);
    const blend = (1 - THREE.MathUtils.smoothstep(progress, 0.69, 1)) * windup;
    setPose(joints.Spine, -0.19 + follow * 0.52, -0.48 + follow * 0.63, 0.055, blend);
    setPose(joints.RightArm, -2.15 + follow * 1.59, 0.28, -0.26, blend);
    setPose(joints.LeftArm, -1.48 + follow * 0.94, -0.37, 0.31, blend);
    setPose(joints.RightForeArm, -1.14 + follow * 0.42, 0, 0, blend);
    setPose(joints.LeftForeArm, -0.76, 0, 0, blend);
  }
  if (ground) groundLegs(rig, ground, phase, speed, run, groundBlend ** 2);

}
