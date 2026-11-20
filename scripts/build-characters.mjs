import { mkdir, readFile, writeFile } from 'node:fs/promises';
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

const baseDirectory = new URL('../public/models/', import.meta.url);
const outputDirectory = new URL('characters/', baseDirectory);
const glbHeader = 0x46546c67;
const jsonChunk = 0x4e4f534a;
const binaryChunk = 0x004e4942;

const avatars = [
  {
    label: 'Harbor Navigator',
    file: 'harbor-navigator.glb',
    source: 'human_hotel_guest.glb',
    remove: ['attach-hands-mesh'],
    coat: '#427b7e',
    trousers: '#51595b',
    accent: '#c0e4d9',
    trim: '#202e38',
    shell: '#295b62',
    height: 1.64,
    chest: 1.24,
  },
  {
    label: 'Coastal Rescue Pilot',
    file: 'coastal-rescue-pilot.glb',
    source: 'human_medic.glb',
    remove: ['attach-hat-mesh', 'attach-back-mesh', 'attach-righthand-mesh'],
    coat: '#9e5b3f',
    trousers: '#394449',
    accent: '#ffbb52',
    trim: '#2b3139',
    shell: '#b85333',
    height: 1.70,
    chest: 1.33,
  },
];

function encodeGlb(document, segments) {
  const body = Buffer.concat(segments);
  const json = Buffer.from(JSON.stringify(document));
  const jsonLength = Math.ceil(json.length / 4) * 4;
  const binaryLength = Math.ceil(body.length / 4) * 4;
  const result = Buffer.alloc(28 + jsonLength + binaryLength);
  result.writeUInt32LE(glbHeader, 0);
  result.writeUInt32LE(2, 4);
  result.writeUInt32LE(result.length, 8);
  result.writeUInt32LE(jsonLength, 12);
  result.writeUInt32LE(jsonChunk, 16);
  result.fill(0x20, 20, 20 + jsonLength);
  json.copy(result, 20);
  result.writeUInt32LE(binaryLength, 20 + jsonLength);
  result.writeUInt32LE(binaryChunk, 24 + jsonLength);
  body.copy(result, 28 + jsonLength);
  return result;
}

function colorValues(hex) {
  return new THREE.Color(hex).toArray();
}

function objectTransforms(nodes) {
  const objects = nodes.map((node) => {
    const object = new THREE.Object3D();
    if (node.matrix) object.matrix.fromArray(node.matrix).decompose(object.position, object.quaternion, object.scale);
    if (node.translation) object.position.fromArray(node.translation);
    if (node.rotation) object.quaternion.fromArray(node.rotation);
    if (node.scale) object.scale.fromArray(node.scale);
    return object;
  });
  nodes.forEach((node, index) => node.children?.forEach((child) => objects[index].add(objects[child])));
  objects.filter((object) => !object.parent).forEach((object) => object.updateMatrixWorld(true));
  return objects;
}

function makeEquipment(avatar) {
  const equipment = [];
  const box = (bone, finish, position, dimensions, radius = 0.01, rotation = [0, 0, 0]) => {
    const geometry = new RoundedBoxGeometry(...dimensions, 2, radius);
    geometry.deleteAttribute('uv');
    geometry.rotateX(rotation[0]).rotateY(rotation[1]).rotateZ(rotation[2]).translate(...position);
    equipment.push({ bone, finish, geometry });
  };
  const ellipsoid = (bone, finish, position, radii) => {
    const geometry = new THREE.SphereGeometry(1, 16, 12).toNonIndexed();
    geometry.deleteAttribute('uv');
    geometry.scale(...radii).translate(...position);
    equipment.push({ bone, finish, geometry });
  };
  const strip = (bone, finish, from, to, width, depth) => {
    const a = new THREE.Vector3(...from);
    const b = new THREE.Vector3(...to);
    const axis = b.clone().sub(a);
    const position = a.clone().lerp(b, 0.5);
    const geometry = new RoundedBoxGeometry(width, axis.length(), depth, 1, Math.min(depth, width) * 0.32);
    geometry.deleteAttribute('uv');
    geometry.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), axis.normalize()));
    geometry.translate(...position);
    equipment.push({ bone, finish, geometry });
  };

  const { height, chest } = avatar;
  const isPilot = avatar.file.includes('pilot');
  const front = isPilot ? 0.153 : 0.144;
  if (isPilot) {
    ellipsoid('Head', 'shell', [0, height - 0.032, -0.008], [0.126, 0.135, 0.132]);
    ellipsoid('Head', 'trim', [0, height - 0.098, 0.085], [0.104, 0.050, 0.061]);
    ellipsoid('Head', 'visor', [0, height - 0.098, 0.102], [0.101, 0.036, 0.063]);
    for (const x of [-1, 1]) {
      ellipsoid('Head', 'trim', [x * 0.119, height - 0.107, -0.012], [0.024, 0.055, 0.05]);
      ellipsoid('Head', 'hardware', [x * 0.132, height - 0.107, -0.011], [0.015, 0.037, 0.036]);
    }
    strip('Head', 'trim', [-0.129, height - 0.127, 0.018], [-0.047, height - 0.199, 0.134], 0.009, 0.009);
    box('Head', 'trim', [-0.045, height - 0.198, 0.137], [0.034, 0.015, 0.014], 0.006);
    box('Spine2', 'trim', [0, chest - 0.085, -0.158], [0.268, 0.33, 0.117], 0.032);
    box('Spine2', 'shell', [0, chest - 0.065, -0.221], [0.225, 0.255, 0.036], 0.018);
    for (const x of [-0.07, 0.07]) strip('Spine2', 'accent', [x, chest + 0.016, -0.246], [x, chest - 0.153, -0.246], 0.014, 0.011);
  } else {
    ellipsoid('Head', 'shell', [0, height - 0.027, -0.011], [0.113, 0.057, 0.121]);
    box('Head', 'trim', [0, height - 0.060, 0.108], [0.18, 0.021, 0.123], 0.010, [-0.13, 0, 0]);
    box('Head', 'accent', [0, height - 0.033, 0.104], [0.052, 0.028, 0.008], 0.004);
    box('Spine1', 'trim', [0.079, chest - 0.071, -0.150], [0.17, 0.227, 0.098], 0.025, [0, -0.06, -0.21]);
    box('Spine1', 'shell', [0.078, chest - 0.048, -0.197], [0.142, 0.158, 0.024], 0.011, [0, -0.06, -0.21]);
    strip('Spine2', 'trim', [-0.102, chest + 0.07, front - 0.042], [0.145, chest - 0.214, front], 0.045, 0.028);
    box('Spine2', 'hardware', [0.018, chest - 0.088, front + 0.019], [0.043, 0.041, 0.018], 0.006, [0, 0, -0.72]);
  }

  for (const side of [-1, 1]) {
    const x = side * 0.097;
    box('Spine2', 'shell', [x, chest - 0.103, front + 0.012],
      [0.079, 0.092, 0.031], 0.011, [0.04, side * 0.23, side * -0.06]);
    box('Spine2', 'trim', [x, chest - 0.082, front + 0.028], [0.066, 0.015, 0.009], 0.004, [0, side * 0.22, side * -0.06]);
    box('Spine2', 'accent', [x, chest - 0.033, front + 0.014], [0.060, 0.016, 0.012], 0.003, [0, side * 0.22, 0]);
    const arm = side > 0 ? 'LeftArm' : 'RightArm';
    box(arm, 'trim', [side * 0.264, chest + 0.07, 0.059], [0.083, 0.044, 0.033], 0.009);
    box(arm, 'accent', [side * 0.264, chest + 0.07, 0.078], [0.055, 0.013, 0.008], 0.002);
  }
  strip('Spine2', 'hardware', [0.005, chest - 0.064, front + 0.018], [0.005, chest + 0.033, front], 0.009, 0.01);
  return equipment;
}

async function buildAvatar(avatar) {
  const source = await readFile(new URL(avatar.source, baseDirectory));
  const jsonEnd = 20 + source.readUInt32LE(12);
  const model = JSON.parse(source.subarray(20, jsonEnd));
  const pieces = [source.subarray(jsonEnd + 8)];
  let offset = pieces[0].length;

  const removed = new Set(model.nodes.flatMap(({ name }, index) => avatar.remove.includes(name) ? [index] : []));
  for (const node of [...model.nodes, ...model.scenes]) {
    for (const property of ['children', 'nodes']) {
      if (node[property]) node[property] = node[property].filter((index) => !removed.has(index));
    }
  }

  const transforms = objectTransforms(model.nodes);
  const newMaterial = (name, color, roughnessFactor, metallicFactor = 0) => {
    const index = model.materials.length;
    model.materials.push({ name, pbrMetallicRoughness: { baseColorFactor: [...colorValues(color), 1], roughnessFactor, metallicFactor } });
    return index;
  };

  const palette = {
    shell: newMaterial('Outfit Shell', avatar.shell, 0.6),
    trim: newMaterial('Woven Webbing', avatar.trim, 0.9),
    accent: newMaterial('Reflective Safety Trim', avatar.accent, 0.32, 0.21),
    hardware: newMaterial('Anodized Hardware', '#bdc4be', 0.32, 0.72),
    visor: newMaterial('Smoke Visor', '#3f606d', 0.20, 0.65),
  };
  const cloth = newMaterial('Outfit Fabric', avatar.coat, 0.73);
  const trousers = newMaterial('Utility Trousers', avatar.trousers, 0.79);
  for (const node of model.nodes) {
    if (node.mesh == null) continue;
    const finish = /attach-(top|coat)-/.test(node.name) ? cloth : /attach-bottom-/.test(node.name) ? trousers : undefined;
    if (finish === undefined) continue;
    for (const part of model.meshes[node.mesh].primitives) {
      part.material = finish;
      // The source bake contains the original outfit color. The new fabric material supplies its replacement.
      delete part.attributes.COLOR_0;
    }
  }

  const append = (attribute, type, bounds) => {
    const data = Buffer.from(attribute.array.buffer, attribute.array.byteOffset, attribute.array.byteLength);
    const bufferView = model.bufferViews.push({ buffer: 0, byteOffset: offset, byteLength: data.byteLength, target: 34962 }) - 1;
    offset += data.byteLength;
    pieces.push(data);
    const accessor = { bufferView, componentType: 5126, count: attribute.count, type };
    if (bounds) {
      accessor.min = bounds.min.toArray();
      accessor.max = bounds.max.toArray();
    }
    return model.accessors.push(accessor) - 1;
  };

  const groups = new Map();
  for (const { bone, finish, geometry } of makeEquipment(avatar)) {
    const key = bone + ':' + finish;
    if (!groups.has(key)) groups.set(key, { bone, finish, geometry: [] });
    groups.get(key).geometry.push(geometry);
  }
  for (const { bone, finish, geometry } of groups.values()) {
    const parent = model.nodes.findIndex((node) => node.name === bone);
    if (parent < 0) throw new Error('Missing equipment joint ' + bone);
    const merged = mergeGeometries(geometry);
    merged.applyMatrix4(transforms[parent].matrixWorld.clone().invert());
    merged.computeBoundingBox();
    const position = append(merged.getAttribute('position'), 'VEC3', merged.boundingBox);
    const normal = append(merged.getAttribute('normal'), 'VEC3');
    const mesh = model.meshes.push({ name: finish + ' ' + bone, primitives: [{ attributes: { POSITION: position, NORMAL: normal }, material: palette[finish] }] }) - 1;
    const node = model.nodes.push({ name: avatar.label + ' ' + finish + ' ' + bone, mesh }) - 1;
    (model.nodes[parent].children ??= []).push(node);
  }

  model.asset.generator = 'World Horizon character source builder';
  model.asset.extras = {
    ...model.asset.extras,
    character: avatar.label,
    changes: 'World Horizon added equipment meshes, finish materials, and apparel colors. Original body, rig, and action clips retained.',
    baseFile: avatar.source,
  };
  model.scenes[model.scene ?? 0].name = avatar.label;
  model.buffers[0].byteLength = offset;
  const output = encodeGlb(model, pieces);
  await writeFile(new URL(avatar.file, outputDirectory), output);
  console.log(avatar.file, output.length, 'bytes');
}

await mkdir(outputDirectory, { recursive: true });
await Promise.all(avatars.map(buildAvatar));
