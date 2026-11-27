import React, { useEffect, useLayoutEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import { useFrame } from '@react-three/fiber';
import {
  COAST_CONNECTORS, coastConnectorEnd, coastRoadOffset, coastRoadRadius,
  getTerrainHeight, LANDMARKS,
} from '../game/worldMath';
import { createLimestonePBR, createSidewalkCobblePBR, createRoofGravelHVACPBR } from './Textures';
import { WorldSectionBatch, type Vec3, type WorldPart, type WorldFinish } from './WorldSections';
import { LOBBY_THEMES, resolveActiveThemeId } from '../game/lobbyThemes';
import { simState } from '../game/store';

const shops = [
  { name: 'COVE COFFEE', color: '#39645c' },
  { name: 'BAY MARKET', color: '#7b4640' },
  { name: 'ATELIER', color: '#3c4d68' },
  { name: 'NORTH QUAY', color: '#305a60' },
  { name: 'BOOKSHOP', color: '#77613c' },
  { name: 'RIVIERA BISTRO', color: '#2b5968' },
  { name: 'SOLARIS GALLERY', color: '#6b475f' },
  { name: 'AZUREA GELATO', color: '#2d6a5d' },
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
  { name: 'Riviera Resort', levels: [4, 3, 2, 1], widths: [1, 0.86, 0.68, 0.48], wall: 'terrace', frame: '#efe0c6', bay: 3.7, floor: 3.3 },
  { name: 'Oceanfront Tower', levels: [6, 4, 2], widths: [1, 0.84, 0.62], wall: 'aquaGlass', frame: '#d8ece6', bay: 3.8, floor: 3.55 },
];

export const COASTAL_PLAZAS: { id: string; x: number; z: number; radius: number }[] = [
  { id: 'east-riviera-plaza', x: 222, z: 32, radius: 19 },
  { id: 'west-sunset-plaza', x: -214, z: -38, radius: 19 },
  { id: 'southeast-promenade-plaza', x: 186, z: 146, radius: 18 },
];

export const cityPlots = (() => {
  const plots: { x: number; z: number; y: number; w: number; d: number; style: number }[] = [];
  const protectedAreas = [
    ...LANDMARKS.map(({ position: [x, , z] }) => [x, z, 20]),
    ...COASTAL_PLAZAS.map(({ x, z, radius }) => [x, z, radius + 4]),
    [-52, 42, 24], [98, -35, 32], [-105, 45, 36], [-118, -28, 30],
    [-158, -145, 23], [135, -95, 32], [148, 108, 28], [-138, 155, 25],
    [183, 173, 28],
  ];
  let index = 0;
  for (const zBase of [-210, -188, -166, -146, -95, -74, -53, -32, 28, 51, 105, 126, 147, 168, 190, 210]) {
    for (const xBase of [-262, -240, -218, -196, -175, -154, -132, -110, -88, -66, -43, 43, 65, 87, 109, 131, 153, 175, 197, 219, 241, 263]) {
      index++;
      const x = xBase + (index * 7 % 5 - 2) * 0.6;
      const z = zBase + (index * 13 % 5 - 2) * 0.7;
      const w = 13.5 + index * 3 % 5;
      const d = 12.8 + index * 7 % 5;
      const hw = w / 2 + 2.3;
      const hd = d / 2 + 2.3;
      if (Math.abs(x) - hw < 23.0) continue;
      if (Math.abs(z + 120) - hd < 14.5 || Math.abs(z) - hd < 15.5 || Math.abs(z - 80) - hd < 14.5) continue;
      if ((z + hd > 123 && x - hw < -35) || (x + hw > 61 && Math.abs(z + 95) - hd < 35)) continue;
      // Keep the entire Airport Runway & East departure climb-out corridor (z in [122, 188], x in [-240, 95]) unobstructed
      if (z + hd > 122 && z - hd < 188 && x + hw > -245 && x - hw < 95) continue;
      if (protectedAreas.some(([px, pz, radius]) => Math.hypot(x - px, z - pz) < radius + 7)) continue;
      const corners = [-1, 1].flatMap((a) => [-1, 1].map((b): [number, number] =>
        [x + a * (w / 2 + 2), z + b * (d / 2 + 2)]));
      const offsets = corners.map(([cx, cz]) => coastRoadOffset(cx, cz));
      // Keep every building strictly inside the coastal ring road with generous promenade clearance
      if (Math.max(...offsets) > -15) continue;
      const heights = corners.map(([cx, cz]) => getTerrainHeight(cx, cz));
      if (Math.min(...heights) < 1.35 || Math.max(...heights) - Math.min(...heights) > 1.25) continue;
      const y = Math.max(...heights);
      const dist = Math.hypot(x, z);
      const inOuterClimbZone = z + hd > 124 && z - hd < 186 && x >= 95;
      const style =
        inOuterClimbZone
          ? (index % 2 === 0 ? 6 : 2)
          : dist > 195
            ? [4, 8, 9, 3][(index + Math.abs(Math.round(zBase / 20))) % 4]
            : x > 148 || (x > 0 && z > 125)
              ? (index % 2 === 0 ? 4 : 8)
              : (index * 11 + Math.round(zBase / 30)) % 8;
      plots.push({ x, z, y, w, d, style: (style + profiles.length) % profiles.length });
    }
  }
  return plots;
})();

type FacadeStyle = 'blue' | 'aqua' | 'deco' | 'brick' | 'terrace' | 'shop';

function drawLitPane(
  ctx: CanvasRenderingContext2D,
  px: number,
  py: number,
  pw: number,
  ph: number,
  tone: 'warm' | 'amber' | 'cool' | 'dim'
) {
  if (tone === 'dim') {
    ctx.fillStyle = '#0e141c';
    ctx.fillRect(px, py, pw, ph);
    return;
  }
  const grad = ctx.createLinearGradient(px, py, px, py + ph);
  if (tone === 'cool') {
    grad.addColorStop(0, '#dbf4ff');
    grad.addColorStop(0.28, '#8be0fc');
    grad.addColorStop(0.75, '#4aa8cf');
    grad.addColorStop(1, '#1c445c');
  } else if (tone === 'amber') {
    grad.addColorStop(0, '#ffe8aa');
    grad.addColorStop(0.32, '#f7b24d');
    grad.addColorStop(0.78, '#b86820');
    grad.addColorStop(1, '#4a260c');
  } else {
    grad.addColorStop(0, '#fff4cf');
    grad.addColorStop(0.30, '#ffd47e');
    grad.addColorStop(0.76, '#cf8834');
    grad.addColorStop(1, '#583412');
  }
  ctx.fillStyle = grad;
  ctx.fillRect(px, py, pw, ph);

  // Recessed ceiling light fixture bar + subtle venetian blind texture for 3D interior depth
  ctx.fillStyle = tone === 'cool' ? '#f0fbff' : '#fffbe6';
  ctx.fillRect(px + 2, py + 2, Math.max(2, pw - 4), 2.4);
  ctx.fillStyle = 'rgba(18, 14, 10, 0.24)';
  for (let by = py + 10; by < py + ph - 6; by += 6) {
    ctx.fillRect(px + 1, by, pw - 2, 1.4);
  }
}

function facadeTexture(style: FacadeStyle) {
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
  for (let i = 0; i < 700; i++) {
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
  glass.addColorStop(0, style === 'aqua' ? '#70989a' : '#6b8594');
  glass.addColorStop(0.38, style === 'shop' ? '#5c5240' : '#405666');
  glass.addColorStop(0.7, '#273a45');
  glass.addColorStop(1, '#14222c');
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

  const make = (canvas: HTMLCanvasElement, isSRGB = false) => {
    const texture = new THREE.CanvasTexture(canvas);
    texture.anisotropy = 8;
    if (isSRGB) texture.colorSpace = THREE.SRGBColorSpace;
    return texture;
  };

  // Generate occupancy emissiveMap textures on the same facade geometry coordinates
  const buildEmissiveCanvas = (variant: number) => {
    const emCanvas = document.createElement('canvas');
    emCanvas.width = emCanvas.height = 128;
    const eCtx = emCanvas.getContext('2d')!;
    eCtx.fillStyle = '#000000';
    eCtx.fillRect(0, 0, 128, 128);

    const paneY = top + 2;
    const paneH = bottom - top - 3;
    const leftX = inset + 2;
    const leftW = Math.max(2, 62.1 - leftX);
    const rightX = 65.9;
    const rightW = Math.max(2, inset + panelWidth - 2 - rightX);

    if (style === 'shop') {
      const wash = eCtx.createLinearGradient(0, paneY, 0, paneY + paneH);
      wash.addColorStop(0, '#ffd480');
      wash.addColorStop(0.45, '#e89d42');
      wash.addColorStop(1, '#5e3610');
      eCtx.fillStyle = wash;
      eCtx.fillRect(leftX, paneY, panelWidth - 4, paneH);

      for (let px = inset + 7; px < 117; px += 17) {
        const glow = eCtx.createRadialGradient(px, 30, 1.2, px, 30, 14);
        glow.addColorStop(0, '#fff7db');
        glow.addColorStop(0.42, '#ffc966');
        glow.addColorStop(1, 'rgba(255, 190, 80, 0)');
        eCtx.fillStyle = glow;
        eCtx.fillRect(px - 14, 16, 28, 28);
      }

      // Dark counter silhouette & crisp mullion mask
      eCtx.fillStyle = '#181008';
      eCtx.fillRect(leftX, 88, panelWidth - 4, 16);
      eCtx.fillStyle = '#000000';
      eCtx.fillRect(62.1, top, 3.8, bottom - top);
      return make(emCanvas, true);
    }

    const isGlassTower = style === 'blue' || style === 'aqua';
    if (variant === 0) {
      drawLitPane(eCtx, leftX, paneY, leftW, paneH, 'warm');
      drawLitPane(eCtx, rightX, paneY, rightW, paneH, 'dim');
    } else if (variant === 1) {
      drawLitPane(eCtx, leftX, paneY, leftW, paneH, 'dim');
      drawLitPane(eCtx, rightX, paneY, rightW, paneH, isGlassTower ? 'cool' : 'amber');
    } else if (variant === 2) {
      drawLitPane(eCtx, leftX, paneY, leftW, paneH, 'warm');
      drawLitPane(eCtx, rightX, paneY, rightW, paneH, isGlassTower ? 'cool' : 'amber');
    } else {
      drawLitPane(eCtx, leftX, paneY, leftW, paneH, 'dim');
      drawLitPane(eCtx, rightX, paneY, rightW, paneH, 'dim');
    }

    // Crisp unlit mullion & perimeter shadow mask
    eCtx.fillStyle = '#000000';
    eCtx.fillRect(62.1, top, 3.8, bottom - top);
    return make(emCanvas, true);
  };

  const map = make(channels.color, true);
  const roughnessMap = make(channels.roughness);
  const normalMap = make(channels.normal);
  const emissiveMaps = style === 'shop'
    ? [buildEmissiveCanvas(0)]
    : [0, 1, 2, 3].map((v) => buildEmissiveCanvas(v));

  return { map, roughnessMap, normalMap, emissiveMaps };
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
          const variant = (index * 17 + floorNo * 11 + bay * 7 + (bay ^ floorNo)) % 4;
          const wall = ground ? 'shop' : p.wall + variant;
          const color = ground ? '#e2d9bf' : ['#ffffff', '#dce3df', '#f4e6cc'][(index + bay * 7 + floorNo * 11) % 3];
          add(ground ? 'Storefront glazing' : 'Façade panel', wall, color,
            at(offset, (height - 0.22) / 2), [bayWidth - 0.025, height - 0.22, 0.22], p.wall === 'brick' || p.wall === 'deco' ? 120 : 74, angle);
          if (!ground && (style === 3 || style === 4 || style === 8 || style === 9) && (bay + index) % 3 !== 0) {
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
      if ((style === 3 || style === 8) && tier < p.levels.length - 1) {
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
      add('Roof lantern', 'deco2', '#e8d0a4', [roofX, levelY + 1.1, roofZ], [roofW * 0.58, 2.2, roofD * 0.6], 155);
      add('Finial', 'metal', '#a9a894', [roofX, levelY + 4, roofZ], [0.4, 4.8, 0.4], 77);
    } else if (style === 0 || style === 5) {
      const size = Math.min(roofW, roofD) * 0.85;
      add('Helipad', 'roof', '#525450', [roofX, levelY + 0.26, roofZ], [size, 0.31, size], 220);
      for (const dx of [-0.21, 0.21]) add('Helipad marking', 'paint', '#f6e7be', [roofX + size * dx, levelY + 0.423, roofZ], [size * 0.084, 0.014, size * 0.61], 35, 0, false);
      add('Helipad marking', 'paint', '#f6e7be', [roofX, levelY + 0.423, roofZ], [size * 0.4, 0.014, size * 0.082], 35, 0, false);
      add('Vent stack', 'metal', '#899698', [roofX + roofW * 0.43, levelY + 0.71, roofZ + roofD * 0.41], [0.72, 1.2, 0.67], 105);
    } else if (style === 8 || style === 9 || style === 4) {
      // Rooftop Gardens, Timber Shade Pergolas & Turquoise Plunge Pools on Riviera Waterfront Towers
      add('Rooftop terrace deck', 'wood', '#a58460', [roofX, levelY + 0.22, roofZ], [roofW * 0.84, 0.24, roofD * 0.84], 150);
      const pw = roofW * 0.54;
      const pd = roofD * 0.44;
      for (const sx of [-1, 1]) {
        for (const sz of [-1, 1]) {
          add('Rooftop pergola post', 'wood', '#75583c', [roofX + sx * pw * 0.5, levelY + 1.48, roofZ - roofD * 0.14 + sz * pd * 0.5], [0.2, 2.35, 0.2], 70);
        }
        add('Rooftop planter', 'stone', '#cdc3ae', [roofX + sx * roofW * 0.36, levelY + 0.52, roofZ], [0.58, 0.48, roofD * 0.68], 95);
        for (const gz of [-0.22, 0, 0.22]) {
          add('Rooftop shrub', 'plant', '#597a49', [roofX + sx * roofW * 0.36, levelY + 0.94, roofZ + gz * roofD], [0.68, 0.72, 0.76], 34, 0, false);
        }
      }
      for (const sz of [-1, 1]) {
        add('Rooftop pergola beam', 'wood', '#8a6949', [roofX, levelY + 2.72, roofZ - roofD * 0.14 + sz * pd * 0.5], [pw + 0.5, 0.18, 0.2], 65);
      }
      for (const rx of [-0.45, -0.15, 0.15, 0.45]) {
        add('Rooftop pergola rafter', 'wood', '#9c7856', [roofX + rx * pw, levelY + 2.86, roofZ - roofD * 0.14], [0.14, 0.12, pd + 0.65], 50);
      }
      if (style === 9) {
        add('Rooftop pool coping', 'stone', '#e2d7c2', [roofX, levelY + 0.42, roofZ + roofD * 0.24], [roofW * 0.52, 0.32, roofD * 0.28], 130);
        add('Rooftop plunge pool', 'pool', '#32b5c4', [roofX, levelY + 0.56, roofZ + roofD * 0.24], [roofW * 0.44, 0.12, roofD * 0.21], 90, 0, false);
      }
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

  // Curated Waterfront Coastal Plazas in the Expanded Resort Districts (Travertine Paving, Pergolas, Reflection Basins & Palms)
  COASTAL_PLAZAS.forEach((plaza, pIdx) => {
    owner = 'Coastal Plaza · ' + (pIdx + 1);
    const py = getTerrainHeight(plaza.x, plaza.z);
    if (py < 1.8) return;
    const span = plaza.radius * 1.45;
    add('Plaza travertine deck', 'stone', '#dfd2bc', [plaza.x, py - 0.18, plaza.z], [span, 0.58, span], 420);
    add('Plaza reflection curb', 'stone', '#ece3d2', [plaza.x, py + 0.36, plaza.z], [7.8, 0.56, 7.8], 260);
    add('Plaza reflection basin', 'pool', '#2eb6c9', [plaza.x, py + 0.58, plaza.z], [6.6, 0.14, 6.6], 120, 0, false);
    add('Plaza sculpture plinth', 'concrete', '#e7decb', [plaza.x, py + 1.15, plaza.z], [1.6, 1.3, 1.6], 200);

    // Corner shaded timber pergolas + limestone seating benches
    for (const sx of [-1, 1]) {
      const px = plaza.x + sx * (span * 0.34);
      for (const dz of [-4.2, 0, 4.2]) {
        for (const dx of [-1.8, 1.8]) {
          add('Plaza pergola column', 'wood', '#7a5c40', [px + dx, py + 1.92, plaza.z + dz], [0.24, 3.55, 0.24], 100);
        }
        add('Plaza pergola beam', 'wood', '#8e6d4d', [px, py + 3.76, plaza.z + dz], [4.2, 0.22, 0.24], 85);
      }
      for (const dx of [-1.8, -0.6, 0.6, 1.8]) {
        add('Plaza pergola rafter', 'wood', '#9e7c5a', [px + dx, py + 3.96, plaza.z], [0.14, 0.13, 9.2], 65);
      }
      add('Plaza bench', 'wood', '#aa8860', [px - sx * 0.4, py + 0.52, plaza.z], [0.76, 0.22, 4.2], 80);
    }

    // 4 Corner Palm Planters framing each Coastal Plaza
    for (const sx of [-1, 1]) {
      for (const sz of [-1, 1]) {
        const tx = plaza.x + sx * (span * 0.42);
        const tz = plaza.z + sz * (span * 0.42);
        add('Plaza palm planter', 'stone', '#c4b8a2', [tx, py + 0.42, tz], [2.4, 0.68, 2.4], 150);
        add('Plaza palm trunk', 'wood', '#8d6c4d', [tx, py + 3.1, tz], [0.42, 4.9, 0.42], 95);
        add('Plaza palm canopy', 'plant', '#4a7a42', [tx, py + 5.75, tz], [3.1, 1.45, 3.1], 45, 0, false);
        add('Plaza planter shrub', 'plant', '#5f844e', [tx, py + 0.96, tz], [1.9, 0.62, 1.9], 35, 0, false);
      }
    }
  });

  // Palm-Lined Boulevard Planter Bays along the Extended East/West Coastal Connector Corridors
  owner = 'Riviera Boulevard Promenade';
  for (const road of COAST_CONNECTORS) {
    for (const side of [-1, 1]) {
      const endX = coastConnectorEnd(road.z, side, -22);
      const startX = (road.cityEnd + 14) * side;
      const steps = Math.floor((Math.abs(endX) - Math.abs(startX)) / 24);
      for (let s = 0; s <= steps; s++) {
        const bx = startX + side * s * 24;
        if (Math.abs(bx) > Math.abs(endX) - 10) continue;
        if (bx > 62 && Math.abs(road.z + 95) < 38) continue;
        for (const dz of [-1, 1]) {
          const bz = road.z + dz * (road.halfWidth + 2.8);
          if (bz > 122 && bx < -34) continue;
          if (cityPlots.some((p) => Math.abs(bx - p.x) < p.w * 0.5 + 3.6 && Math.abs(bz - p.z) < p.d * 0.5 + 3.6)) continue;
          if (LANDMARKS.some((lm) => Math.hypot(bx - lm.position[0], bz - lm.position[2]) < 24)) continue;
          const by = getTerrainHeight(bx, bz);
          if (by < 2.2) continue;
          add('Boulevard planter', 'stone', '#c7bca8', [bx, by + 0.32, bz], [3.6, 0.54, 1.8], 130);
          add('Boulevard palm trunk', 'wood', '#8a6a4b', [bx, by + 2.85, bz], [0.36, 4.6, 0.36], 85);
          add('Boulevard palm crown', 'plant', '#4d7d43', [bx, by + 5.3, bz], [2.6, 1.3, 2.6], 40, 0, false);
          add('Boulevard hedge', 'plant', '#61844e', [bx, by + 0.78, bz], [3.1, 0.52, 1.35], 36, 0, false);
        }
      }
    }
  }

  // Dynamically anchored East & West Breakwater Promenade Piers projecting cleanly from the expanded shoreline
  owner = 'Breakwater promenade';
  const breakwaterSpecs: { z: number; dir: 1 | -1 }[] = [
    { z: -48, dir: 1 },
    { z: 24, dir: 1 },
    { z: -24, dir: -1 },
  ];
  for (const { z, dir } of breakwaterSpecs) {
    const approxAngle = Math.atan2(dir * 290, z);
    const roadR = coastRoadRadius(approxAngle);
    const startR = roadR + 26;
    const inland = dir * Math.sqrt(Math.max(100, startR * startR - z * z));
    const y = Math.max(2.35, getTerrainHeight(inland, z));
    for (let i = 0; i < 14; i++) {
      const x = inland + dir * (1.55 + i * 3.1);
      add('Pier decking', 'wood', '#ac8b69', [x, y - 0.16, z], [3.08, 0.36, 5.6], 140);
      for (const side of [-1, 1]) {
        if (i % 2 === 0) {
          const seaFloor = getTerrainHeight(x, z);
          add('Pier pile', 'wood', '#665c4a', [x, (seaFloor + y) / 2 - 0.2, z + side * 2.24],
            [0.43, Math.max(0.8, y - seaFloor + 0.9), 0.45], 110);
        }
        add('Pier guardrail', 'metal', '#768b8c', [x, y + 0.56, z + side * 2.72], [3.09, 0.84, 0.12], 66);
      }
    }
    for (const dz of [-4.5, 4.5]) add('Harbor bollard', 'metal', '#526361', [inland, y + 0.33, z + dz], [0.44, 0.76, 0.46], 70);
  }
  return parts;
}

export function CoastalCity() {
  const parts = useMemo(makeCity, []);
  const cityGroupRef = useRef<THREE.Group>(null);
  const glowRef = useRef(LOBBY_THEMES.SUNLIT_RIVIERA.windowGlow);
  const litMaterialsRef = useRef<{ mat: THREE.MeshStandardMaterial; isShop: boolean }[]>([]);

  const { finishes, emissiveLookup } = useMemo(() => {
    const concrete = createLimestonePBR();
    const paving = createSidewalkCobblePBR();
    const roof = createRoofGravelHVACPBR();

    const blue = facadeTexture('blue');
    const aqua = facadeTexture('aqua');
    const shop = facadeTexture('shop');
    const deco = facadeTexture('deco');
    const brick = facadeTexture('brick');
    const terrace = facadeTexture('terrace');

    const emissiveMapByFinish: Record<string, THREE.CanvasTexture> = {
      shop: shop.emissiveMaps[0],
    };
    const buildVariants = (
      prefix: string,
      pbr: ReturnType<typeof facadeTexture>,
      material: WorldFinish['material'],
      roughness: number,
      metalness?: number
    ): Record<string, WorldFinish> => {
      const entries: Record<string, WorldFinish> = {};
      for (let v = 0; v < 4; v++) {
        const key = `${prefix}${v}`;
        emissiveMapByFinish[key] = pbr.emissiveMaps[v];
        entries[key] = {
          material,
          roughness,
          metalness,
          map: pbr.map,
          roughnessMap: pbr.roughnessMap,
          normalMap: pbr.normalMap,
        };
      }
      return entries;
    };

    const finishMap: Record<string, WorldFinish> = {
      ...buildVariants('blueGlass', blue, 'glass', 0.26, 0.35),
      ...buildVariants('aquaGlass', aqua, 'glass', 0.25, 0.33),
      shop: { material: 'glass', roughness: 0.34, metalness: 0.25, map: shop.map, roughnessMap: shop.roughnessMap, normalMap: shop.normalMap },
      ...buildVariants('deco', deco, 'masonry', 0.65, 0.06),
      ...buildVariants('brick', brick, 'masonry', 0.85),
      ...buildVariants('terrace', terrace, 'glass', 0.45, 0.18),
      rail: { material: 'glass', roughness: 0.27, metalness: 0.32 },
      pool: { material: 'glass', roughness: 0.12, metalness: 0.24, emissive: '#107b8a' },
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

    return { finishes: finishMap, emissiveLookup: emissiveMapByFinish };
  }, []);

  const batches = useMemo(
    () =>
      Object.entries(finishes)
        .map(([id, finish]) => ({ id, finish, parts: parts.filter((part) => part.finish === id) }))
        .filter((batch) => batch.parts.length > 0),
    [parts, finishes]
  );

  useLayoutEffect(() => {
    const root = cityGroupRef.current;
    if (!root) return;
    const tracked: { mat: THREE.MeshStandardMaterial; isShop: boolean }[] = [];
    for (const child of root.children) {
      const emMap = emissiveLookup[child.name];
      if (!emMap) continue;
      child.traverse((obj) => {
        if (obj instanceof THREE.Mesh && obj.material instanceof THREE.MeshStandardMaterial) {
          const mat = obj.material;
          mat.emissive.set('#ffffff');
          mat.emissiveMap = emMap;
          mat.emissiveIntensity = child.name === 'shop' ? Math.max(0.18, glowRef.current * 1.15) : glowRef.current;
          mat.needsUpdate = true;
          tracked.push({ mat, isShop: child.name === 'shop' });
        }
      });
    }
    litMaterialsRef.current = tracked;
  }, [batches, emissiveLookup]);

  useFrame((_, dt) => {
    const activeThemeId = resolveActiveThemeId(simState.startMenuOpen, simState.lobbyTheme, simState.worldTimeTheme);
    const targetGlow = LOBBY_THEMES[activeThemeId].windowGlow;
    const damp = 1 - Math.exp(-6.0 * Math.min(dt, 0.1));
    glowRef.current = THREE.MathUtils.lerp(glowRef.current, targetGlow, damp);
    const activeGlow = glowRef.current < 0.03 ? 0 : glowRef.current;
    for (const entry of litMaterialsRef.current) {
      entry.mat.emissiveIntensity = entry.isShop
        ? (glowRef.current < 0.03 ? 0.03 : glowRef.current * 1.15)
        : activeGlow;
    }
  });

  useEffect(() => () => {
    const textures = new Set<THREE.Texture>();
    Object.values(finishes).forEach((finish) => {
      finish.geometry?.dispose();
      if (finish.map) textures.add(finish.map);
      if (finish.normalMap) textures.add(finish.normalMap);
      if (finish.roughnessMap) textures.add(finish.roughnessMap);
    });
    Object.values(emissiveLookup).forEach((tex) => textures.add(tex));
    textures.forEach((tex) => tex.dispose());
  }, [finishes, emissiveLookup]);

  return (
    <group ref={cityGroupRef}>
      {batches.map(({ id, parts: batchParts, finish }) => (
        <group key={id} name={id}>
          <WorldSectionBatch parts={batchParts} finish={finish} />
        </group>
      ))}
    </group>
  );
}
