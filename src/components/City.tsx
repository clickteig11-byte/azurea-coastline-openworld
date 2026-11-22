import React, { useEffect, useMemo } from 'react';
import * as THREE from 'three';
import { coastRoadOffset, getTerrainHeight, LANDMARKS } from '../game/worldMath';
import { createLimestonePBR, createSidewalkCobblePBR, createRoofGravelHVACPBR } from './Textures';
import { WorldSectionBatch, type Vec3, type WorldPart, type WorldFinish } from './WorldSections';

const shops = [
  { name: 'COVE COFFEE', color: '#39645c' },
  { name: 'BAY MARKET', color: '#7b4640' },
  { name: 'ATELIER', color: '#3c4d68' },
  { name: 'NORTH QUAY', color: '#305a60' },
  { name: 'BOOKSHOP', color: '#77613c' },
] as const;

const profiles = [
  { name: 'Financial', levels: [7, 5, 3], widths: [1, 0.88, 0.67], wall: 'blueGlass', frame: '#a8c0cc', bay: 3.7, floor: 3.45 },
  { name: 'Art Deco', levels: [6, 3, 2, 1], widths: [1, 0.77, 0.57, 0.36], wall: 'deco', frame: '#f0d5a9', bay: 3.1, floor: 3.25 },
  { name: 'Brownstone', levels: [4, 1], widths: [1, 0.77], wall: 'brick', frame: '#b88a72', bay: 3.1, floor: 3.0 },
  { name: 'Terraces', levels: [3, 2, 2, 1], widths: [1, 0.86, 0.71, 0.47], wall: 'terrace', frame: '#e0d5c3', bay: 3.6, floor: 3.1 },
  { name: 'Marina House', levels: [4, 2, 1], widths: [1, 0.85, 0.62], wall: 'aquaGlass', frame: '#def0ea', bay: 3.7, floor: 3.1 },
  { name: 'Atrium', levels: [5, 4, 3], widths: [1, 0.91, 0.76], wall: 'aquaGlass', frame: '#729da5', bay: 3.5, floor: 3.65 },
  { name: 'Market Loft', levels: [3, 1], widths: [1, 0.66], wall: 'brick', frame: '#c49e80', bay: 3.4, floor: 3.1 },
  { name: 'Civic', levels: [4, 2, 2], widths: [1, 0.9, 0.55], wall: 'deco', frame: '#e8d5b9', bay: 3.1, floor: 3.7 },
];

export const cityPlots = (() => {
  const plots: { x: number; z: number; y: number; w: number; d: number; style: number }[] = [];
  const protectedAreas = [
    ...LANDMARKS.map(({ position: [x, , z] }) => [x, z, 20]),
    [-52, 42, 24], [98, -35, 32], [-105, 45, 36], [-118, -28, 30],
    [-158, -145, 23], [135, -95, 32], [148, 108, 28], [-138, 155, 25],
  ];
  let index = 0;
  for (const zBase of [-184, -162, -143, -98, -77, -56, -34, 28, 51, 102, 123, 145, 166]) {
    for (const xBase of [-175, -154, -132, -110, -88, -66, -43, 43, 65, 87, 109, 131, 153, 175, 198]) {
      index++;
      const x = xBase + (index * 7 % 5 - 2) * 0.6;
      const z = zBase + (index * 13 % 5 - 2) * 0.7;
      const w = 13.5 + index * 3 % 5;
      const d = 12.8 + index * 7 % 5;
      if (Math.abs(z + 120) < 21 || Math.abs(z) < 24 || Math.abs(z - 80) < 22) continue;
      if ((z > 123 && x < -35) || (x > 61 && Math.abs(z + 95) < 35)) continue;
      if (protectedAreas.some(([px, pz, radius]) => Math.hypot(x - px, z - pz) < radius + 7)) continue;
      const corners = [-1, 1].flatMap((a) => [-1, 1].map((b): [number, number] =>
        [x + a * (w / 2 + 2), z + b * (d / 2 + 2)]));
      const offsets = corners.map(([cx, cz]) => coastRoadOffset(cx, cz));
      if (Math.min(...offsets) < 14 && Math.max(...offsets) > -14) continue;
      const heights = corners.map(([cx, cz]) => getTerrainHeight(cx, cz));
      if (Math.min(...heights) < 1.3 || Math.max(...heights) - Math.min(...heights) > 1.1) continue;
      const y = Math.max(...heights);
      const style = x > 148 || (x > 0 && z > 125) ? 4 : (index * 11 + Math.round(zBase / 30)) % 8;
      plots.push({ x, z, y, w, d, style: (style + 8) % 8 });
    }
  }
  return plots;
})();

function facadeTexture(style: 'blue' | 'aqua' | 'deco' | 'brick' | 'terrace' | 'shop') {
  const channels = {
    color: document.createElement('canvas'),
    roughness: document.createElement('canvas'),
    normal: document.createElement('canvas'),
  };
  for (const canvas of Object.values(channels)) canvas.width = canvas.height = 256;
  const color = channels.color.getContext('2d')!;
  const roughness = channels.roughness.getContext('2d')!;
  const normal = channels.normal.getContext('2d')!;
  for (const context of [color, roughness, normal]) context.scale(2, 2);

  const base = { blue: '#667987', aqua: '#819897', deco: '#c5ad89', brick: '#875345', terrace: '#b8ad98', shop: '#3e4542' }[style];
  color.fillStyle = base;
  color.fillRect(0, 0, 128, 128);
  roughness.fillStyle = '#dddddd';
  roughness.fillRect(0, 0, 128, 128);
  normal.fillStyle = '#8080ff';
  normal.fillRect(0, 0, 128, 128);
  for (let i = 0; i < 2600; i++) {
    const x = (i * 71.731) % 128;
    const y = (i * 31.937) % 128;
    color.fillStyle = i % 3 === 0 ? '#ffffff1a' : '#191b1a15';
    color.fillRect(x, y, 0.85, 0.55);
  }
  if (style === 'brick') {
    color.lineWidth = 0.68;
    for (let row = 0; row < 17; row++) {
      const y = row * 8;
      color.strokeStyle = '#a49479';
      color.beginPath();
      color.moveTo(0, y);
      color.lineTo(128, y);
      for (let x = (row % 2) * 10; x < 128; x += 20) {
        color.moveTo(x, y);
        color.lineTo(x, y + 8);
      }
      color.stroke();
      color.fillStyle = '#512e263d';
      color.fillRect(0, y + 1, 128, 0.85);
    }
  }

  const inset = style === 'deco' ? 25 : style === 'brick' ? 19 : style === 'terrace' ? 13 : 4;
  const top = style === 'deco' ? 14 : 6;
  const bottom = style === 'shop' ? 123 : 110;
  const panelWidth = 128 - inset * 2;
  const mullion = style === 'shop' ? '#374147' : style === 'deco' || style === 'brick' ? '#52493e' : '#53636b';
  color.fillStyle = '#263238';
  color.fillRect(inset - 1, top - 1, panelWidth + 2, bottom - top + 3);
  const glass = color.createLinearGradient(4, top, 111, bottom);
  glass.addColorStop(0, style === 'aqua' ? '#abc8bf' : '#9eb3bc');
  glass.addColorStop(0.34, style === 'shop' ? '#827456' : '#657d8f');
  glass.addColorStop(0.62, '#465e69');
  glass.addColorStop(1, '#263a46');
  color.fillStyle = glass;
  color.fillRect(inset + 2, top + 2, panelWidth - 4, bottom - top - 3);
  roughness.fillStyle = style === 'shop' ? '#858585' : '#5c5c5c';
  roughness.fillRect(inset + 2, top + 2, panelWidth - 4, bottom - top - 3);

  color.save();
  color.beginPath();
  color.rect(inset + 2, top + 2, panelWidth - 4, bottom - top - 3);
  color.clip();
  color.fillStyle = style === 'shop' ? '#d9c79d41' : '#e5eef340';
  color.beginPath();
  color.moveTo(0, top + 24);
  color.lineTo(128, top - 10);
  color.lineTo(128, top + 5);
  color.lineTo(0, top + 59);
  color.fill();
  color.fillStyle = '#cddfd426';
  color.fillRect(inset, top + 5, panelWidth, 1.2);
  if (style === 'shop') {
    for (let x = inset + 7; x < 117; x += 17) {
      const pendant = color.createRadialGradient(x, 30, 1, x, 30, 11);
      pendant.addColorStop(0, '#ffdf9dcb');
      pendant.addColorStop(1, '#daa55800');
      color.fillStyle = pendant;
      color.fillRect(x - 11, 19, 22, 22);
      color.fillStyle = '#242b2bd5';
      color.fillRect(x - 2, top + 4, 0.7, 22);
    }
    color.fillStyle = '#17242ba8';
    color.fillRect(inset, 88, panelWidth, 16);
    color.fillStyle = '#b59b6f8c';
    color.fillRect(inset, 86, panelWidth, 2.6);
  } else {
    color.fillStyle = '#c2ccc030';
    for (let y = 40; y < 61; y += 4) color.fillRect(inset + 4, y, panelWidth * 0.40, 1);
  }
  color.restore();

  color.fillStyle = mullion;
  color.fillRect(62.1, top, 3.8, bottom - top);
  color.fillRect(inset, bottom - 1, panelWidth, 1.6);
  roughness.fillStyle = '#cccccc';
  roughness.fillRect(61.5, top, 5, bottom - top);
  normal.fillStyle = '#bd81ea';
  normal.fillRect(inset, top, 1.6, bottom - top);
  normal.fillRect(61.5, top, 1.2, bottom - top);
  normal.fillStyle = '#4881e9';
  normal.fillRect(inset + panelWidth - 1.6, top, 1.6, bottom - top);
  normal.fillRect(66, top, 1.2, bottom - top);
  normal.fillStyle = '#80bfee';
  normal.fillRect(inset, top, panelWidth, 1.3);
  normal.fillStyle = '#8050ee';
  normal.fillRect(inset, bottom - 1.3, panelWidth, 1.3);
  color.fillStyle = style === 'deco' ? '#dfc5a2' : '#e1e0d16d';
  color.fillRect(inset - 2, bottom, panelWidth + 4, 2.7);

  const make = (canvas: HTMLCanvasElement) => {
    const texture = new THREE.CanvasTexture(canvas);
    texture.anisotropy = 8;
    return texture;
  };
  const map = make(channels.color);
  map.colorSpace = THREE.SRGBColorSpace;
  return { map, roughnessMap: make(channels.roughness), normalMap: make(channels.normal) };
}

function shopSign(name: string, color: string) {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 48;
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = color;
  ctx.fillRect(0, 0, 512, 48);
  ctx.strokeStyle = '#ccbc90';
  ctx.strokeRect(3, 3, 506, 42);
  ctx.fillStyle = '#fff0c8';
  ctx.font = '700 31px Georgia, serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(name, 256, 25);
  const map = new THREE.CanvasTexture(canvas);
  map.colorSpace = THREE.SRGBColorSpace;
  return map;
}

function makeCity() {
  const parts: WorldPart[] = [];
  let owner = '';
  const add = (label: string, finish: string, color: string, position: Vec3, size: Vec3, durability = 115, yaw = 0, solid = true) =>
    parts.push({ owner, label, finish, color, position, size, durability, yaw, solid });

  cityPlots.forEach(({ x, y, z, w: baseW, d: baseD, style }, index) => {
    const p = profiles[style];
    owner = p.name + ' ' + (index + 1);
    const base = y + 0.11;
    const faces = [0, Math.PI / 2, Math.PI, -Math.PI / 2];
    let offsetX = 0;
    let offsetZ = 0;
    let bend = 0;
    add('Stone forecourt', 'stone', '#d6c7af', [x, y - 0.45, z], [baseW + 4.6, 1.08, baseD + 4.6], 420);
    add('Foundation', 'stone', '#abb0a8', [x, base - 0.42, z], [baseW, 0.8, baseD], 360);

    const level = (levelY: number, w: number, d: number, height: number, ground: boolean, floorNo: number) => {
      add('Floor slab', 'concrete', p.frame, [x + offsetX, levelY + height - 0.13, z + offsetZ], [w + 0.14, 0.26, d + 0.14], 190, bend);
      for (const face of faces) {
        const sideways = Math.abs(Math.sin(face)) > 0.5;
        const breadth = sideways ? d : w;
        const length = sideways ? w : d;
        const bays = Math.max(2, Math.round(breadth / p.bay));
        const bayWidth = breadth / bays;
        const angle = face + bend;
        const at = (across: number, up: number, outward = 0): Vec3 => [
          x + offsetX + Math.sin(angle) * (length / 2 + outward) + Math.cos(angle) * across,
          levelY + up,
          z + offsetZ + Math.cos(angle) * (length / 2 + outward) - Math.sin(angle) * across,
        ];
        for (let bay = 0; bay < bays; bay++) {
          const offset = (bay + 0.5) * bayWidth - breadth / 2;
          const wall = ground ? 'shop' : p.wall;
          const color = ground ? '#e2d9bf' : ['#ffffff', '#dce3df', '#f4e6cc'][(index + bay * 7 + floorNo * 11) % 3];
          add(ground ? 'Storefront glazing' : 'Façade panel', wall, color,
            at(offset, (height - 0.22) / 2), [bayWidth - 0.025, height - 0.22, 0.22], wall === 'brick' || wall === 'deco' ? 120 : 74, angle);
          if (!ground && (style === 3 || style === 4) && (bay + index) % 3 !== 0) {
            add('Balcony slab', 'concrete', p.frame, at(offset, 0.1, 0.64), [bayWidth - 0.1, 0.2, 1.42], 120, angle);
            add('Balcony glazing', 'rail', '#96bcbc', at(offset, 0.58, 1.29), [bayWidth - 0.15, 0.65, 0.095], 48, angle);
          }
        }
        for (const a of [-1, 1]) {
          add('Façade pilaster', 'concrete', p.frame, at(a * (breadth / 2 - 0.13), height / 2, 0.08),
            [ground ? 0.48 : 0.31, height, 0.36], 158, angle);
        }
        if (ground) {
          const awning = ['#4a7774', '#984c3a', '#d5a55f', '#5f677f'][(index + (sideways ? 1 : 0)) % 4];
          add('Retail awning', 'fabric', awning, at(0, height - 0.84, 0.68), [breadth * 0.85, 0.18, 1.6], 48, angle);
          add('Awning valance', 'fabric', awning, at(0, height - 0.99, 1.46), [breadth * 0.85, 0.37, 0.13], 40, angle);
          if (face === 0 || (style === 6 && face === Math.PI / 2)) {
            add('Storefront sign', 'shopSign' + index % shops.length, '#ffffff',
              at(0, height - 0.36, 0.19), [Math.min(9.8, breadth * 0.8), 0.53, 0.065], 55, angle);
            for (const a of [-1, 1]) {
              add('Planter', 'stone', '#a39a8d', at(a * (breadth / 2 - 0.7), 0.28, 1.6), [1.17, 0.54, 0.98], 100, angle);
              add('Planter shrub', 'plant', '#648252', at(a * (breadth / 2 - 0.7), 0.69, 1.6), [0.96, 0.73, 0.77], 38, angle, false);
              if (a === 1 && index % 3 === 0) {
                add('Pavement bench', 'wood', '#a58359', at(-1.8, 0.45, 1.77), [2.25, 0.20, 0.66], 72, angle);
                add('Bench back', 'wood', '#9d7d58', at(-1.8, 0.72, 1.56), [2.25, 0.42, 0.14], 68, angle);
                for (const dx of [-2.54, -1.06]) add('Bench leg', 'metal', '#434d47', at(dx, 0.18, 1.77), [0.11, 0.39, 0.51], 75, angle);
              }
            }
          }
        }
      }
    };

    level(base, baseW, baseD, 3.8, true, 0);
    let levelY = base + 3.8;
    p.levels.forEach((count, tier) => {
      if (style === 5) bend = tier * (index % 2 === 0 ? 0.11 : -0.11);
      if (style === 0 || style === 3) {
        offsetX = tier * 0.56 * (index % 2 === 0 ? 1 : -1);
        offsetZ = tier * -0.35;
      }
      const w = baseW * p.widths[tier];
      const d = baseD * p.widths[tier];
      const floors = count + (tier === 0 && (style === 0 || style === 5) ? index % 4 : 0);
      for (let floor = 0; floor < floors; floor++) {
        level(levelY, w, d, p.floor, false, tier * 10 + floor + 1);
        levelY += p.floor;
      }
      add('Terrace coping', 'concrete', p.frame, [x + offsetX, levelY + 0.08, z + offsetZ], [w + 0.48, 0.23, d + 0.48], 160, bend);
      if (style === 3 && tier < p.levels.length - 1) {
        for (const side of [-1, 1]) {
          const gardenX = x + offsetX + side * w * 0.47;
          add('Terrace planter', 'stone', '#bdb7a3', [gardenX, levelY + 0.22, z + offsetZ], [0.62, 0.36, d * 0.56], 100);
          for (const dz of [-0.21, 0, 0.21]) {
            add('Terrace planting', 'plant', '#61794b', [gardenX, levelY + 0.55, z + offsetZ + dz * d], [0.56, 0.61, 0.85], 36, 0, false);
          }
        }
      }
    });

    const roofX = x + offsetX;
    const roofZ = z + offsetZ;
    const roofW = baseW * p.widths[p.widths.length - 1];
    const roofD = baseD * p.widths[p.widths.length - 1];
    if (style === 1 || style === 7) {
      add('Roof lantern', 'deco', '#e8d0a4', [roofX, levelY + 1.1, roofZ], [roofW * 0.58, 2.2, roofD * 0.6], 155);
      add('Finial', 'metal', '#a9a894', [roofX, levelY + 4, roofZ], [0.4, 4.8, 0.4], 77);
    } else if (style === 0 || style === 5) {
      const size = Math.min(roofW, roofD) * 0.85;
      add('Helipad', 'roof', '#525450', [roofX, levelY + 0.26, roofZ], [size, 0.31, size], 220);
      for (const dx of [-0.21, 0.21]) add('Helipad marking', 'paint', '#f6e7be', [roofX + size * dx, levelY + 0.423, roofZ], [size * 0.084, 0.014, size * 0.61], 35, 0, false);
      add('Helipad marking', 'paint', '#f6e7be', [roofX, levelY + 0.423, roofZ], [size * 0.4, 0.014, size * 0.082], 35, 0, false);
      add('Vent stack', 'metal', '#899698', [roofX + roofW * 0.43, levelY + 0.71, roofZ + roofD * 0.41], [0.72, 1.2, 0.67], 105);
    } else {
      for (const a of [-1, 1]) {
        add('Rooftop HVAC', 'metal', '#9faaa7', [roofX + roofW * 0.23 * a, levelY + 0.66, roofZ + 1.4], [1.62, 1.07, 2.25], 95);
        for (let slot = -2; slot <= 2; slot++) add('Vent grille', 'metal', '#545d5c',
          [roofX + roofW * 0.23 * a, levelY + 1.2, roofZ + 1.4 + slot * 0.31], [1.4, 0.03, 0.1], 35, 0, false);
      }
      if (style === 2 || style === 6) {
        add('Water tank', 'tank', '#937654', [roofX, levelY + 2.2, roofZ - 1.3], [2.5, 2.25, 2.5], 115);
        for (const a of [-1, 1]) for (const b of [-1, 1]) {
          add('Tank stand', 'metal', '#575f5c', [roofX + a * 0.8, levelY + 0.63, roofZ - 1.3 + b * 0.8], [0.18, 1.24, 0.18], 65);
        }
      }
    }
  });

  owner = 'Breakwater promenade';
  for (const z of [-48, 24]) {
    const inland = z === -48 ? 219 : 223;
    const y = getTerrainHeight(inland, z);
    for (let i = 0; i < 10; i++) {
      const x = inland + 1.55 + i * 3.1;
      add('Pier decking', 'wood', '#ac8b69', [x, y - 0.16, z], [3.08, 0.36, 5.4], 140);
      for (const side of [-1, 1]) {
        if (i % 2 === 0) {
          const seaFloor = getTerrainHeight(x, z);
          add('Pier pile', 'wood', '#665c4a', [x, (seaFloor + y) / 2 - 0.2, z + side * 2.14],
            [0.43, y - seaFloor + 0.9, 0.45], 110);
        }
        add('Pier guardrail', 'metal', '#768b8c', [x, y + 0.56, z + side * 2.63], [3.09, 0.84, 0.12], 66);
      }
    }
    for (const dz of [-4.5, 4.5]) add('Harbor bollard', 'metal', '#526361', [inland, y + 0.33, z + dz], [0.44, 0.76, 0.46], 70);
  }
  return parts;
}

export function CoastalCity() {
  const parts = useMemo(makeCity, []);
  const finishes = useMemo<Record<string, WorldFinish>>(() => {
    const concrete = createLimestonePBR();
    const paving = createSidewalkCobblePBR();
    const roof = createRoofGravelHVACPBR();
    return {
      blueGlass: { material: 'glass', roughness: 0.26, metalness: 0.35, ...facadeTexture('blue') },
      aquaGlass: { material: 'glass', roughness: 0.25, metalness: 0.33, ...facadeTexture('aqua') },
      shop: { material: 'glass', roughness: 0.34, metalness: 0.25, ...facadeTexture('shop') },
      deco: { material: 'masonry', roughness: 0.65, metalness: 0.06, ...facadeTexture('deco') },
      brick: { material: 'masonry', roughness: 0.85, ...facadeTexture('brick') },
      terrace: { material: 'glass', roughness: 0.45, metalness: 0.18, ...facadeTexture('terrace') },
      rail: { material: 'glass', roughness: 0.27, metalness: 0.32 },
      concrete: { material: 'masonry', roughness: 0.83, map: concrete },
      stone: { material: 'masonry', roughness: 0.89, map: paving },
      roof: { material: 'masonry', roughness: 0.85, map: roof },
      fabric: { material: 'wood', roughness: 0.94 },
      wood: { material: 'wood', roughness: 0.77 },
      tank: { material: 'wood', roughness: 0.79, geometry: new THREE.CylinderGeometry(0.5, 0.5, 1, 12) },
      metal: { material: 'metal', roughness: 0.49, metalness: 0.48 },
      paint: { material: 'road', roughness: 0.79 },
      plant: { material: 'wood', roughness: 0.94, geometry: new THREE.DodecahedronGeometry(0.53, 1) },
      ...Object.fromEntries(shops.map(({ name, color }, i) => ['shopSign' + i,
        { material: 'wood' as const, roughness: 0.65, map: shopSign(name, color) }])),
    };
  }, []);
  const batches = useMemo(() => Object.entries(finishes).map(([id, finish]) => ({ id, finish, parts: parts.filter((part) => part.finish === id) })), [parts, finishes]);
  useEffect(() => () => Object.entries(finishes).forEach(([id, finish]) => {
    finish.geometry?.dispose();
    if (id.startsWith('shopSign') || ['blueGlass', 'aquaGlass', 'shop', 'deco', 'brick', 'terrace'].includes(id)) {
      finish.map?.dispose();
      finish.normalMap?.dispose();
      finish.roughnessMap?.dispose();
    }
  }), [finishes]);
  return <group>{batches.map(({ id, parts, finish }) => <WorldSectionBatch key={id} parts={parts} finish={finish} />)}</group>;
}
