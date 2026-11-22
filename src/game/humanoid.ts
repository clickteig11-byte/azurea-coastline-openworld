import * as THREE from 'three';

interface Joint {
  bone: THREE.Bone;
  rest: THREE.Quaternion;
  basis: THREE.Quaternion;
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

export interface HumanoidRig {
  wrapper: THREE.Group;
  joints: Record<string, Joint>;
  legs: LegRig[];
  gait: number;
  aim: number;
  air: number;
  swim: number;
  stroke: number;
  mixer?: THREE.AnimationMixer;
  clips: Partial<Record<'idle' | 'walk' | 'run', THREE.AnimationAction>>;
}

interface Pose {
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

export function createHumanoidRig(wrapper: THREE.Group, model: THREE.Object3D, animations: THREE.AnimationClip[] = []): HumanoidRig {
  const rig: HumanoidRig = { wrapper, joints: {}, gait: 0, aim: 0, air: 0, swim: 0, stroke: 0, clips: {}, legs: [] };
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
  const clip = (name: string) => animations.find((animation) => animation.name === name || animation.name.endsWith('_' + name));
  const walk = clip('Walk'), run = clip('Run'), idle = clip('Idle');
  if (walk && run && idle) {
    rig.mixer = new THREE.AnimationMixer(model);
    for (const [name, clip] of Object.entries({ idle, walk, run })) {
      const action = rig.mixer.clipAction(clip).setEffectiveWeight(name === 'idle' ? 1 : 0).play();
      if (name !== 'idle') action.time = (wrapper.id % 13) / 13 * clip.duration;
      rig.clips[name as 'idle' | 'walk' | 'run'] = action;
    }
  }
  // Use the same anatomical axes on glTF skeletons whose local bone axes differ.
  wrapper.getWorldQuaternion(root).invert();
  for (const side of ['Left', 'Right']) {
    const arm = bones[side + 'Arm'];
    const elbow = bones[side + 'ForeArm'];
    if (!arm || !elbow) continue;
    elbow.getWorldPosition(armDirection).sub(arm.getWorldPosition(new THREE.Vector3())).applyQuaternion(root).normalize();
    const sign = Math.sign(armDirection.x);
    const drop = Math.max(0, Math.acos(THREE.MathUtils.clamp(-armDirection.y, -1, 1)) - 0.11);
    const parentBasis = arm.parent!.getWorldQuaternion(new THREE.Quaternion()).premultiply(root);
    correction.setFromEuler(anatomical.set(0, 0, -sign * drop));
    rootInverse.copy(parentBasis).invert();
    arm.quaternion.premultiply(rootInverse.multiply(correction).multiply(parentBasis));
  }
  wrapper.updateWorldMatrix(true, true);
  for (const [name, bone] of Object.entries(bones)) {
    rig.joints[name] = { bone, rest: bone.quaternion.clone(), basis: bone.getWorldQuaternion(new THREE.Quaternion()).premultiply(root) };
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
    aim = 0, recoil = 0, lookPitch = 0, lookYaw = 0, ground, swimming = false, swimSpeed = 0 } = motion;
  const joints = rig.joints;
  rig.gait = THREE.MathUtils.damp(rig.gait, THREE.MathUtils.clamp(speed / 2.3, 0, 1), 13, dt);
  rig.aim = THREE.MathUtils.damp(rig.aim, aim, aim > rig.aim ? 22 : 10, dt);
  rig.air = THREE.MathUtils.damp(rig.air, airborne ? 1 : 0, 15, dt);
  const swing = Math.sin(phase);
  const sway = Math.cos(phase);
  const breath = Math.sin(time * 2.45);
  const run = THREE.MathUtils.smoothstep(speed, 2.8, 6.3);
  const center = Math.abs(lateral);
  const animated = Boolean(rig.mixer && rig.clips.walk && rig.clips.run && rig.clips.idle);
  const glide = airborne === 'glide';
  const chute = airborne === 'parachute';
  const tuck = airborne === 'jump';
  const groundBlend = 1 - rig.air;
  const response = 1 - Math.exp(-20 * dt);

  if (animated) {
    rig.clips.idle!.setEffectiveWeight(1 - rig.gait);
    rig.clips.walk!.setEffectiveWeight(rig.gait * (1 - run)).setEffectiveTimeScale(
      (reverse ? -1 : 1) * THREE.MathUtils.clamp(speed / 1.5, 0.56, 1.9));
    rig.clips.run!.setEffectiveWeight(rig.gait * run).setEffectiveTimeScale(THREE.MathUtils.clamp(speed / 5.1, 0.7, 1.4));
    for (const action of [rig.clips.walk!, rig.clips.run!]) {
      action.paused = Boolean(ground);
      if (ground) {
        const direction = reverse ? -1 : 1;
        action.time = THREE.MathUtils.euclideanModulo(direction * phase / (Math.PI * 2), 1) * action.getClip().duration;
      }
    }
    rig.mixer!.update(dt);
  }
  const authored = !animated || center > 0.13;
  const baseBlend = authored ? response : 0;
  const overlay = Math.max(baseBlend, rig.air, landing * 0.85);
  const stride = rig.gait * (0.42 + run * 0.27) * groundBlend;
  const airLean = glide ? 0.76 : chute ? -0.12 : 0.11;
  const lean = (0.02 + run * 0.18) * rig.gait * groundBlend + airLean * rig.air + landing * 0.24;
  setPose(joints.Hips, lean * 0.4, sway * stride * 0.105, -lateral * rig.gait * 0.12, overlay);
  setPose(joints.Spine, lean + breath * 0.013, -sway * stride * 0.2, lateral * 0.09, overlay);
  setPose(joints.Spine1, breath * 0.012 - landing * 0.08, rig.aim * lookYaw * 0.22, 0, Math.max(baseBlend, rig.aim * 0.5));
  setPose(joints.Head, -lean * 0.68 + lookPitch * 0.36, lookYaw * 0.42 - sway * stride * 0.06,
    -lateral * 0.05, Math.max(baseBlend, rig.aim, rig.air));

  for (const [side, sign] of [['Left', 1], ['Right', -1]] as const) {
    const cycle = swing * sign;
    const rise = Math.max(0, Math.sin(phase - 0.47) * sign);
    const step = cycle * stride * (reverse ? -1 : 1) * (1 - center * 0.6);
    const strideWidth = (cycle * 0.39 + sign * 0.11) * lateral * rig.gait;
    const bent = (tuck ? (fallSpeed > 0 ? 0.57 : 0.26) + sign * 0.17 : chute ? 0.44 : 0.2) * rig.air;
    const knee = rise * stride * (1.05 + run * 0.5) + rig.air * (glide ? 0.36 : 0.77) + landing * 0.59;
    setPose(joints[side + 'UpLeg'], -step - bent - landing * 0.29, 0, strideWidth + sign * (chute ? 0.12 : 0.038) * rig.air, overlay);
    setPose(joints[side + 'Leg'], knee, 0, -strideWidth * 0.27, overlay);
    setPose(joints[side + 'Foot'], -knee * 0.43 - Math.max(0, cycle) * stride * 0.35, lateral * 0.13, -strideWidth * 0.45, overlay);
    setPose(joints[side + 'ToeBase'], Math.max(0, -cycle) * stride * 0.55, 0, 0, overlay);

    const armSign = Math.sign(joints[side + 'Arm']?.bone.position.x ?? sign) || sign;
    const armWeight = Math.max(baseBlend, rig.aim, rig.air);
    const reach = chute ? -1.85 : glide ? -0.53 : -0.37;
    const armSwing = cycle * stride * (0.73 + run * 0.34);
    setPose(joints[side + 'Arm'], THREE.MathUtils.lerp(armSwing + reach * rig.air,
      -1.15 + lookPitch * 0.4 + recoil * 0.35, rig.aim), rig.aim * sign * 0.22,
      (glide ? 1.18 : chute ? 0.46 : 0.13) * armSign * rig.air - 0.12 * armSign * rig.aim, armWeight);
    setPose(joints[side + 'ForeArm'], -0.12 - run * 0.48 * groundBlend - (chute ? 0.83 : 0.28) * rig.air - rig.aim * 0.46,
      -sign * rig.aim * 0.24, 0, armWeight);
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
  rig.wrapper.position.y = THREE.MathUtils.damp(rig.wrapper.position.y, bob - landing * 0.10 + freestyle * 0.7, 22, dt);
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
