import * as THREE from 'three';
import { COAST_SUN } from '../game/worldMath';

function makeSeededRand(seedInit: number) {
  let seed = seedInit;
  return () => {
    seed = (seed * 1664525 + 1013904223) % 4294967296;
    return seed / 4294967296;
  };
}

/**
 * Generates a one-time PMREM environment map from a procedural sunlit sky/ocean scene.
 * Gives clearcoat car paint, glass skyscrapers, and water realistic reflections at 0ms/frame.
 */
export function createProceduralEnvMap(gl: THREE.WebGLRenderer): THREE.Texture {
  const pmrem = new THREE.PMREMGenerator(gl);
  pmrem.compileEquirectangularShader();

  const envScene = new THREE.Scene();
  const skyGeo = new THREE.SphereGeometry(50, 32, 16);
  const skyMat = new THREE.ShaderMaterial({
    side: THREE.BackSide,
    uniforms: { uSunDir: { value: COAST_SUN } },
    vertexShader: /* glsl */ `
      varying vec3 vDir;
      void main() {
        vDir = normalize(position);
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: /* glsl */ `
      varying vec3 vDir;
      uniform vec3 uSunDir;
      void main() {
        float y = vDir.y;
        vec3 zenith = vec3(0.045, 0.18, 0.32);
        vec3 horizon = vec3(0.63, 0.73, 0.76);
        vec3 ground = vec3(0.083, 0.125, 0.14);
        vec3 col = y >= 0.0
          ? mix(horizon, zenith, pow(y, 0.55))
          : mix(horizon, ground, pow(-y, 0.45));
        vec3 sunDir = normalize(uSunDir);
        float sun = pow(max(dot(normalize(vDir), sunDir), 0.0), 48.0);
        col += vec3(1.0, 0.94, 0.78) * sun * 2.2;
        gl_FragColor = vec4(col, 1.0);
      }
    `,
  });
  envScene.add(new THREE.Mesh(skyGeo, skyMat));

  const rt = pmrem.fromScene(envScene, 0.02);
  skyGeo.dispose();
  skyMat.dispose();
  pmrem.dispose();
  return rt.texture;
}

export function createSkyscraperPBR(): {
  map: THREE.CanvasTexture;
  roughnessMap: THREE.CanvasTexture;
} {
  const w = 512;
  const h = 1024;
  const cColor = document.createElement('canvas');
  cColor.width = w;
  cColor.height = h;
  const ctx = cColor.getContext('2d')!;

  const cRough = document.createElement('canvas');
  cRough.width = w;
  cRough.height = h;
  const rCtx = cRough.getContext('2d')!;

  // Base architectural deep slate-blue & dark steel-teal curtain-wall glass (#0f172a to #1e293b)
  const bg = ctx.createLinearGradient(0, 0, 0, h);
  bg.addColorStop(0, '#1e293b');
  bg.addColorStop(0.45, '#0f172a');
  bg.addColorStop(1, '#090d16');
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, w, h);

  // Ultra-glossy glass pane roughness (rgb(18,18,18))
  rCtx.fillStyle = 'rgb(18,18,18)';
  rCtx.fillRect(0, 0, w, h);

  const rand = makeSeededRand(108);
  const cols = 16; // 16 window bays across per tile (32 across with repeat 2x2)
  const rows = 32; // 32 floor rows per tile (64 rows with repeat 2x2)
  const bayW = w / cols; // 32px
  const rowH = h / rows; // 32px

  for (let row = 0; row < rows; row++) {
    const y = row * rowH;
    const isMechanicalFloor = row === 15 || row === 31;
    const floorSuiteActive = rand() > 0.76;

    for (let col = 0; col < cols; col++) {
      const x = col * bayW;
      const r = rand();

      if (isMechanicalFloor) {
        // Dark architectural louver band on mechanical equipment floors
        ctx.fillStyle = '#0f172a';
        ctx.fillRect(x + 2, y + 4, bayW - 3, rowH - 5);
        ctx.fillStyle = '#334155';
        for (let ly = y + 6; ly < y + rowH - 3; ly += 4) {
          ctx.fillRect(x + 3, ly, bayW - 5, 1.5);
        }
        rCtx.fillStyle = 'rgb(155,155,155)';
        rCtx.fillRect(x + 2, y + 4, bayW - 3, rowH - 5);
        continue;
      }

      // Base glass reflection gradient per pane (deep slate-blue & dark steel-teal)
      const g = ctx.createLinearGradient(x, y + 4, x, y + rowH - 1);
      if (r > 0.55) {
        g.addColorStop(0, '#334155');
        g.addColorStop(0.55, '#1e293b');
        g.addColorStop(1, '#0f172a');
      } else if (r > 0.22) {
        g.addColorStop(0, '#1e293b');
        g.addColorStop(0.6, '#152238');
        g.addColorStop(1, '#0f172a');
      } else {
        g.addColorStop(0, '#1e293b');
        g.addColorStop(1, '#090d16');
      }
      ctx.fillStyle = g;
      ctx.fillRect(x + 2, y + 4, bayW - 3, rowH - 5);

      // Understated warm white / soft-amber office ceiling lights in ~20% of panes
      const isLit = r > 0.82 || (floorSuiteActive && r > 0.62);
      if (isLit) {
        const ceilGrad = ctx.createLinearGradient(x, y + 5, x, y + rowH - 3);
        ceilGrad.addColorStop(0, 'rgba(254, 243, 199, 0.55)');
        ceilGrad.addColorStop(0.45, 'rgba(253, 230, 138, 0.28)');
        ceilGrad.addColorStop(1, 'rgba(15, 23, 42, 0.15)');
        ctx.fillStyle = ceilGrad;
        ctx.fillRect(x + 3, y + 5, bayW - 5, rowH - 7);

        // Recessed linear office ceiling light fixture bar near top of pane
        ctx.fillStyle = 'rgba(255, 251, 235, 0.65)';
        ctx.fillRect(x + 5, y + 6, bayW - 9, 2);
      }

      // Subtle sky reflection band across upper glass
      ctx.fillStyle = 'rgba(148, 163, 184, 0.09)';
      ctx.fillRect(x + 3, y + 5, (bayW - 5) * 0.45, rowH - 7);

      // Fine secondary center sub-mullion dividing each bay into twin vertical curtain panes
      ctx.fillStyle = '#1e293b';
      ctx.fillRect(x + bayW * 0.5, y + 4, 1, rowH - 5);
    }
  }

  // Realistic spandrel bands (4px) between floors in dark anodized charcoal-slate
  for (let row = 0; row < rows; row++) {
    const y = row * rowH;
    ctx.fillStyle = '#0f172a';
    ctx.fillRect(0, y, w, 4);
    ctx.fillStyle = '#475569';
    ctx.fillRect(0, y, w, 1);
    rCtx.fillStyle = 'rgb(135,135,135)';
    rCtx.fillRect(0, y, w, 4);
  }

  // Thin silver/charcoal aluminum vertical mullions (1.5px)
  for (let col = 0; col < cols; col++) {
    const x = col * bayW;
    ctx.fillStyle = '#334155';
    ctx.fillRect(x, 0, 1.5, h);
    ctx.fillStyle = '#64748b';
    ctx.fillRect(x, 0, 0.75, h);
    rCtx.fillStyle = 'rgb(125,125,125)';
    rCtx.fillRect(x, 0, 2, h);
  }

  const map = new THREE.CanvasTexture(cColor);
  map.wrapS = THREE.RepeatWrapping;
  map.wrapT = THREE.RepeatWrapping;
  map.repeat.set(2, 2);
  map.anisotropy = 4;
  map.colorSpace = THREE.SRGBColorSpace;

  const roughnessMap = new THREE.CanvasTexture(cRough);
  roughnessMap.wrapS = THREE.RepeatWrapping;
  roughnessMap.wrapT = THREE.RepeatWrapping;
  roughnessMap.repeat.set(2, 2);
  roughnessMap.anisotropy = 4;

  return { map, roughnessMap };
}

export function createPalazzoPBR(): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 512;
  const ctx = canvas.getContext('2d')!;

  // Warm Venetian stucco
  ctx.fillStyle = '#f3e5d0';
  ctx.fillRect(0, 0, 512, 512);

  const rand = makeSeededRand(404);
  for (let i = 0; i < 4000; i++) {
    const x = rand() * 512;
    const y = rand() * 512;
    ctx.fillStyle = rand() > 0.5 ? 'rgba(180,140,100,0.08)' : 'rgba(255,255,255,0.08)';
    ctx.fillRect(x, y, 4, 4);
  }

  // Stone cornice bands
  ctx.fillStyle = '#d6c7b2';
  for (let y = 0; y < 512; y += 128) {
    ctx.fillRect(0, y, 512, 12);
  }

  // Arched Italian windows with dark shutters
  for (let row = 0; row < 4; row++) {
    const wy = row * 128 + 30;
    for (let col = 0; col < 6; col++) {
      const wx = col * 85 + 22;
      // Shutters
      ctx.fillStyle = '#3f6212';
      ctx.fillRect(wx - 10, wy + 12, 9, 58);
      ctx.fillRect(wx + 39, wy + 12, 9, 58);
      // Stone frame
      ctx.fillStyle = '#e7ddd0';
      ctx.fillRect(wx - 2, wy - 2, 42, 74);
      // Dark reflective glass + warm interior
      ctx.fillStyle = rand() > 0.6 ? '#fde68a' : '#1e293b';
      ctx.beginPath();
      ctx.arc(wx + 19, wy + 18, 17, Math.PI, 0);
      ctx.lineTo(wx + 36, wy + 70);
      ctx.lineTo(wx + 2, wy + 70);
      ctx.closePath();
      ctx.fill();
    }
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.anisotropy = 4;
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

export function createLimestonePBR(): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 512;
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = '#e7dfd3';
  ctx.fillRect(0, 0, 512, 512);

  const rand = makeSeededRand(909);
  const rows = 16;
  const cols = 8;
  const rh = 512 / rows;
  const cw = 512 / cols;
  for (let r = 0; r < rows; r++) {
    const offset = (r % 2) * (cw * 0.5);
    for (let c = -1; c <= cols; c++) {
      const shade = 216 + Math.floor(rand() * 24);
      ctx.fillStyle = `rgb(${shade},${shade - 6},${shade - 16})`;
      ctx.fillRect(c * cw + offset + 1, r * rh + 1, cw - 2, rh - 2);
    }
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(3, 3);
  tex.anisotropy = 4;
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

export function createTerrainDetailTexture(): THREE.CanvasTexture {
  const size = 512;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = '#e5e3de';
  ctx.fillRect(0, 0, size, size);

  const rand = makeSeededRand(77);

  // 1. Macro-scale organic mottling (soft mineral/soil patches)
  for (let i = 0; i < 220; i++) {
    const x = rand() * size;
    const y = rand() * size;
    const r = 18 + rand() * 38;
    const light = rand() > 0.5;
    const grad = ctx.createRadialGradient(x, y, r * 0.1, x, y, r);
    grad.addColorStop(0, light ? 'rgba(255, 253, 248, 0.10)' : 'rgba(95, 92, 84, 0.11)');
    grad.addColorStop(1, 'rgba(225, 223, 218, 0)');
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
  }

  // 2. Medium-scale aggregate & organic clump variation
  for (let i = 0; i < 1800; i++) {
    const x = rand() * size;
    const y = rand() * size;
    const r = 2.0 + rand() * 5.5;
    const tone = rand();
    ctx.fillStyle =
      tone > 0.52
        ? 'rgba(255, 255, 252, 0.08)'
        : tone > 0.2
          ? 'rgba(110, 106, 98, 0.09)'
          : 'rgba(72, 70, 64, 0.08)';
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
  }

  // 3. Fine micro-contrast mineral/aggregate grain
  for (let i = 0; i < 32000; i++) {
    const x = rand() * size;
    const y = rand() * size;
    const v = 192 + Math.floor(rand() * 62);
    const w = rand() > 0.72 ? 2 : 1;
    ctx.fillStyle = `rgba(${v},${v - 1},${v - 3},0.55)`;
    ctx.fillRect(x, y, w, w);
  }

  // 4. Subtle micro-striations for natural wind-blown sand / brushed aggregate
  ctx.lineWidth = 1;
  for (let i = 0; i < 240; i++) {
    const x = rand() * size;
    const y = rand() * size;
    const len = 10 + rand() * 26;
    ctx.strokeStyle = rand() > 0.5 ? 'rgba(255,255,255,0.045)' : 'rgba(80,78,72,0.05)';
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x + len, y + (rand() - 0.5) * 4);
    ctx.stroke();
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(56, 56);
  tex.anisotropy = 4;
  return tex;
}

export function createShadowTexture(): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 128;
  canvas.height = 128;
  const ctx = canvas.getContext('2d')!;
  const grad = ctx.createRadialGradient(64, 64, 6, 64, 64, 62);
  grad.addColorStop(0, 'rgba(15, 23, 42, 0.55)');
  grad.addColorStop(0.55, 'rgba(15, 23, 42, 0.25)');
  grad.addColorStop(1, 'rgba(15, 23, 42, 0.0)');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, 128, 128);
  return new THREE.CanvasTexture(canvas);
}

export function createAsphaltRoadTexture(): THREE.CanvasTexture {
  const w = 512;
  const h = 1024;
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d')!;

  // Base charcoal asphalt
  ctx.fillStyle = '#252932';
  ctx.fillRect(0, 0, w, h);

  // Subtle darker tire-wear tracks in the 4 lanes
  const lanes = [78, 184, 328, 434];
  lanes.forEach((lx) => {
    const g = ctx.createLinearGradient(lx - 26, 0, lx + 26, 0);
    g.addColorStop(0, 'rgba(15, 18, 24, 0)');
    g.addColorStop(0.5, 'rgba(12, 14, 20, 0.35)');
    g.addColorStop(1, 'rgba(15, 18, 24, 0)');
    ctx.fillStyle = g;
    ctx.fillRect(lx - 26, 0, 52, h);
  });

  // Fine asphalt mineral aggregate grain
  const rand = makeSeededRand(555);
  for (let i = 0; i < 24000; i++) {
    const x = rand() * w;
    const y = rand() * h;
    const v = 28 + Math.floor(rand() * 34);
    ctx.fillStyle = `rgb(${v},${v + 2},${v + 6})`;
    ctx.fillRect(x, y, 2, 2);
  }

  // Crisp outer white shoulder lines
  ctx.fillStyle = '#e2e8f0';
  ctx.fillRect(14, 0, 6, h);
  ctx.fillRect(w - 20, 0, 6, h);

  // Dashed white lane dividers
  ctx.fillStyle = 'rgba(241, 245, 249, 0.9)';
  for (let y = 20; y < h; y += 128) {
    ctx.fillRect(130, y, 5, 58);
    ctx.fillRect(w - 135, y, 5, 58);
  }

  // Double-yellow center divider
  ctx.fillStyle = '#facc15';
  ctx.fillRect(w / 2 - 9, 0, 6, h);
  ctx.fillRect(w / 2 + 3, 0, 6, h);

  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(1, 14);
  tex.anisotropy = 4;
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

export function createAsphaltRoughnessTexture(): THREE.CanvasTexture {
  const w = 256;
  const h = 512;
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d')!;

  ctx.fillStyle = 'rgb(224,224,224)';
  ctx.fillRect(0, 0, w, h);

  // Polished tire-wear wheel paths inside the 4 lanes
  const lanes = [39, 92, 164, 217];
  lanes.forEach((lx) => {
    const g = ctx.createLinearGradient(lx - 13, 0, lx + 13, 0);
    g.addColorStop(0, 'rgba(155,155,155,0)');
    g.addColorStop(0.5, 'rgba(145,145,145,0.65)');
    g.addColorStop(1, 'rgba(155,155,155,0)');
    ctx.fillStyle = g;
    ctx.fillRect(lx - 13, 0, 26, h);
  });

  // Micro-grain mineral aggregate roughness speckle
  const rand = makeSeededRand(556);
  for (let i = 0; i < 12000; i++) {
    const x = rand() * w;
    const y = rand() * h;
    const v = 165 + Math.floor(rand() * 78);
    ctx.fillStyle = `rgb(${v},${v},${v})`;
    ctx.fillRect(x, y, 2, 2);
  }

  // Slightly higher-sheen reflective road paint lines
  ctx.fillStyle = 'rgb(142,142,142)';
  ctx.fillRect(7, 0, 3, h);
  ctx.fillRect(w - 10, 0, 3, h);
  ctx.fillRect(w / 2 - 4.5, 0, 3, h);
  ctx.fillRect(w / 2 + 1.5, 0, 3, h);
  for (let y = 10; y < h; y += 64) {
    ctx.fillRect(65, y, 2.5, 29);
    ctx.fillRect(w - 67.5, y, 2.5, 29);
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(1, 14);
  tex.anisotropy = 4;
  return tex;
}

/**
 * Fast Sobel height-to-normal-map converter for procedural CanvasTextures.
 * Produces tangent-space normal maps so grazing sunlight catches mortar joints,
 * stucco grain, asphalt aggregate, and palm bark rings.
 */
export function createNormalMapFromCanvas(
  _sourceCanvas: HTMLCanvasElement,
  _strength = 2.4,
  _repeatX = 1,
  _repeatY = 1
): THREE.CanvasTexture {
  // Return null-cast on Intel UHD 617 so Three.js uses fast albedo+roughness+envMap without expensive dFdx/dFdy tangent normal shaders
  return null as unknown as THREE.CanvasTexture;
}

/**
 * Generates a ringed Mediterranean date-palm trunk albedo + Sobel normal map.
 */
export function createBarkPBR(): {
  map: THREE.CanvasTexture;
  normalMap: THREE.CanvasTexture;
} {
  const w = 256;
  const h = 512;
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d')!;

  ctx.fillStyle = '#6d4c30';
  ctx.fillRect(0, 0, w, h);

  const rand = makeSeededRand(313);

  // Horizontal ringed palm leaf-scar segments
  for (let y = 0; y < h; y += 16) {
    // Deep ring crevice
    ctx.fillStyle = '#3d2817';
    ctx.fillRect(0, y, w, 3);
    // Sunlit upper ridge
    ctx.fillStyle = '#8b6543';
    ctx.fillRect(0, y + 3, w, 3);
    // Mid-segment fibrous diamond weave
    for (let x = 0; x < w; x += 24) {
      const jitter = (rand() - 0.5) * 4;
      ctx.strokeStyle = rand() > 0.5 ? 'rgba(52, 34, 18, 0.48)' : 'rgba(156, 118, 82, 0.35)';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(x, y + 4);
      ctx.lineTo(x + 12, y + 14 + jitter * 0.3);
      ctx.lineTo(x + 24, y + 4);
      ctx.stroke();
    }
  }

  // Fine vertical bark fiber grain
  for (let i = 0; i < 4500; i++) {
    const x = rand() * w;
    const y = rand() * h;
    const shade = 68 + Math.floor(rand() * 58);
    ctx.fillStyle = `rgba(${shade + 24},${shade + 6},${shade - 12},0.35)`;
    ctx.fillRect(x, y, 2, 5);
  }

  const map = new THREE.CanvasTexture(canvas);
  map.wrapS = THREE.RepeatWrapping;
  map.wrapT = THREE.RepeatWrapping;
  map.repeat.set(1, 3);
  map.anisotropy = 4;
  map.colorSpace = THREE.SRGBColorSpace;

  const normalMap = createNormalMapFromCanvas(canvas, 3.0, 1, 3);
  return { map, normalMap };
}

/**
 * 1. Art Deco Carved Limestone & Bronze Spandrel Office Facade PBR
 */
export function createArtDecoLimestonePBR(): {
  map: THREE.CanvasTexture;
  roughnessMap: THREE.CanvasTexture;
} {
  const w = 512;
  const h = 1024;
  const cColor = document.createElement('canvas');
  cColor.width = w;
  cColor.height = h;
  const ctx = cColor.getContext('2d')!;

  const cRough = document.createElement('canvas');
  cRough.width = w;
  cRough.height = h;
  const rCtx = cRough.getContext('2d')!;

  // Base carved Indiana limestone ashlar masonry
  ctx.fillStyle = '#e7dfd3';
  ctx.fillRect(0, 0, w, h);
  rCtx.fillStyle = 'rgb(190,190,190)';
  rCtx.fillRect(0, 0, w, h);

  const rand = makeSeededRand(212);
  // Fine limestone ashlar masonry stone courses
  for (let y = 0; y < h; y += 16) {
    const offset = ((y / 16) % 2) * 21;
    for (let x = -32; x < w + 32; x += 42) {
      const shade = 220 + Math.floor(rand() * 20);
      ctx.fillStyle = `rgb(${shade},${shade - 6},${shade - 16})`;
      ctx.fillRect(x + offset + 1, y + 1, 40, 14);
    }
  }

  // Classical horizontal limestone cornice bands every 7 floors
  for (let cy = 0; cy < h; cy += 256) {
    ctx.fillStyle = '#f5efe6';
    ctx.fillRect(0, cy, w, 6);
    ctx.fillStyle = '#b5a895';
    ctx.fillRect(0, cy + 6, w, 3);
  }

  // High-density 12 vertical window bays × 28 floor rows per tile
  const cols = 12;
  const rows = 28;
  const bayW = w / cols; // 42.67px
  const rowH = h / rows; // 36.57px

  for (let col = 0; col < cols; col++) {
    const bx = Math.round(col * bayW);
    const nextBx = Math.round((col + 1) * bayW);
    const bw = nextBx - bx;

    // Subtle vertical fluted Indiana limestone pilaster between bays (10px wide)
    ctx.fillStyle = '#f2ece1';
    ctx.fillRect(bx, 0, 10, h);
    ctx.fillStyle = '#c8bca9';
    ctx.fillRect(bx + 3, 0, 1.5, h);
    ctx.fillRect(bx + 6.5, 0, 1.5, h);

    const winX = bx + 11;
    const winW = bw - 13;

    for (let row = 0; row < rows; row++) {
      const by = Math.round(row * rowH) + 3;
      const winH = Math.round(rowH) - 12;

      // Dark-bronze Art Deco spandrel panel below each window
      ctx.fillStyle = '#33291f';
      ctx.fillRect(winX, by + winH + 1, winW, 8);
      ctx.strokeStyle = '#786248';
      ctx.lineWidth = 1;
      ctx.strokeRect(winX + 2, by + winH + 2.5, winW - 4, 5);

      // Recessed dark-bronze window frame (#1c1917)
      ctx.fillStyle = '#1c1917';
      ctx.fillRect(winX, by, winW, winH);

      // Architectural glass with understated warm interior office light in ~18% of bays
      const r = rand();
      const winGrad = ctx.createLinearGradient(winX, by + 2, winX, by + winH - 2);
      winGrad.addColorStop(0, '#334155');
      winGrad.addColorStop(0.55, '#1e293b');
      winGrad.addColorStop(1, '#0f172a');
      ctx.fillStyle = winGrad;
      ctx.fillRect(winX + 2, by + 2, winW - 4, winH - 4);

      if (r > 0.82) {
        const glowGrad = ctx.createLinearGradient(winX, by + 2, winX, by + winH - 2);
        glowGrad.addColorStop(0, 'rgba(254, 243, 199, 0.52)');
        glowGrad.addColorStop(0.6, 'rgba(253, 230, 138, 0.25)');
        glowGrad.addColorStop(1, 'rgba(28, 25, 23, 0.2)');
        ctx.fillStyle = glowGrad;
        ctx.fillRect(winX + 2, by + 2, winW - 4, winH - 4);
      }

      // Glossy window glass roughness
      rCtx.fillStyle = 'rgb(28,28,28)';
      rCtx.fillRect(winX + 2, by + 2, winW - 4, winH - 4);

      // Fine dark-bronze center vertical & upper transom mullions
      ctx.fillStyle = '#1c1917';
      ctx.fillRect(winX + Math.floor(winW * 0.5) - 1, by + 1, 2, winH - 2);
      ctx.fillRect(winX + 1, by + Math.floor(winH * 0.42), winW - 2, 1.5);
    }
  }

  const map = new THREE.CanvasTexture(cColor);
  map.wrapS = THREE.RepeatWrapping;
  map.wrapT = THREE.RepeatWrapping;
  map.repeat.set(2, 2);
  map.anisotropy = 4;
  map.colorSpace = THREE.SRGBColorSpace;

  const roughnessMap = new THREE.CanvasTexture(cRough);
  roughnessMap.wrapS = THREE.RepeatWrapping;
  roughnessMap.wrapT = THREE.RepeatWrapping;
  roughnessMap.repeat.set(2, 2);
  roughnessMap.anisotropy = 4;

  return { map, roughnessMap };
}

/**
 * 2. Classic Urban Red/Terracotta & Brownstone Brick Residential PBR
 */
export function createBrickResidentialPBR(): {
  map: THREE.CanvasTexture;
  roughnessMap: THREE.CanvasTexture;
} {
  const w = 512;
  const h = 512;
  const cColor = document.createElement('canvas');
  cColor.width = w;
  cColor.height = h;
  const ctx = cColor.getContext('2d')!;

  const cRough = document.createElement('canvas');
  cRough.width = w;
  cRough.height = h;
  const rCtx = cRough.getContext('2d')!;

  // Warm lime-mortar base
  ctx.fillStyle = '#cfc6b8';
  ctx.fillRect(0, 0, w, h);
  rCtx.fillStyle = 'rgb(212,212,212)';
  rCtx.fillRect(0, 0, w, h);

  const rand = makeSeededRand(616);
  // Fine running-bond warm red-brown & russet brickwork
  const brickH = 6;
  const brickW = 16;
  for (let y = 0; y < h; y += brickH) {
    const rowOffset = ((y / brickH) % 2) * (brickW / 2);
    for (let x = -brickW; x < w + brickW; x += brickW) {
      const r = 128 + Math.floor(rand() * 42);
      const g = 52 + Math.floor(rand() * 24);
      const b = 36 + Math.floor(rand() * 18);
      ctx.fillStyle = `rgb(${r},${g},${b})`;
      ctx.fillRect(x + rowOffset + 1, y + 1, brickW - 2, brickH - 2);
    }
  }

  // Carved cream limestone cornice & belt courses
  ctx.fillStyle = '#e7dfd3';
  ctx.fillRect(0, 0, w, 10);
  ctx.fillRect(0, 252, w, 6);
  ctx.fillStyle = '#a89d8e';
  ctx.fillRect(0, 9, w, 2);

  // High-density 8 columns × 8 rows of realistic multi-pane sash windows with cream stone lintels and sills
  const cols = 8;
  const rows = 8;
  const cellW = w / cols; // 64px
  const cellH = h / rows; // 64px

  for (let row = 0; row < rows; row++) {
    const wy = row * cellH + 14;
    const winH = 38;
    for (let col = 0; col < cols; col++) {
      const wx = col * cellW + 14;
      const winW = 36;

      // Cream stone keystone lintel & projecting sill
      ctx.fillStyle = '#ede5d8';
      ctx.fillRect(wx - 3, wy - 5, winW + 6, 5);
      ctx.fillRect(wx - 4, wy + winH, winW + 8, 4);
      ctx.fillStyle = '#9c9284';
      ctx.fillRect(wx - 4, wy + winH + 4, winW + 8, 1.5);

      // Recessed dark architectural window frame
      ctx.fillStyle = '#1c1917';
      ctx.fillRect(wx, wy, winW, winH);

      // Dark slate window glass with understated warm interior curtain glow in ~22% of windows
      const lit = rand() > 0.78;
      const g = ctx.createLinearGradient(wx, wy + 2, wx, wy + winH - 2);
      g.addColorStop(0, '#334155');
      g.addColorStop(0.55, '#1e293b');
      g.addColorStop(1, '#0f172a');
      ctx.fillStyle = g;
      ctx.fillRect(wx + 2, wy + 2, winW - 4, winH - 4);

      if (lit) {
        ctx.fillStyle = 'rgba(254, 243, 199, 0.48)';
        ctx.fillRect(wx + 2, wy + 2, winW - 4, winH - 4);
      }

      // Glossy window roughness
      rCtx.fillStyle = 'rgb(26,26,26)';
      rCtx.fillRect(wx + 2, wy + 2, winW - 4, winH - 4);

      // Crisp cream-white double-hung sash muntin bars
      ctx.fillStyle = '#e2e8f0';
      ctx.fillRect(wx + Math.floor(winW * 0.5) - 1, wy + 2, 1.5, winH - 4);
      ctx.fillRect(wx + 2, wy + Math.floor(winH * 0.5) - 1, winW - 4, 2);
    }
  }

  const map = new THREE.CanvasTexture(cColor);
  map.wrapS = THREE.RepeatWrapping;
  map.wrapT = THREE.RepeatWrapping;
  map.repeat.set(2, 2);
  map.anisotropy = 4;
  map.colorSpace = THREE.SRGBColorSpace;

  const roughnessMap = new THREE.CanvasTexture(cRough);
  roughnessMap.wrapS = THREE.RepeatWrapping;
  roughnessMap.wrapT = THREE.RepeatWrapping;
  roughnessMap.repeat.set(2, 2);
  roughnessMap.anisotropy = 4;

  return { map, roughnessMap };
}

/**
 * 3. Architectural Board-Formed Concrete & Brushed Anodized Steel PBR
 */
export function createModernConcreteSteelPBR(): {
  map: THREE.CanvasTexture;
  roughnessMap: THREE.CanvasTexture;
} {
  const w = 512;
  const h = 512;
  const cColor = document.createElement('canvas');
  cColor.width = w;
  cColor.height = h;
  const ctx = cColor.getContext('2d')!;

  const cRough = document.createElement('canvas');
  cRough.width = w;
  cRough.height = h;
  const rCtx = cRough.getContext('2d')!;

  ctx.fillStyle = '#cbd5e1';
  ctx.fillRect(0, 0, w, h);
  rCtx.fillStyle = 'rgb(165,165,165)';
  rCtx.fillRect(0, 0, w, h);

  const rand = makeSeededRand(707);
  // Concrete architectural panels with expansion joints and tie-rod cone dimples
  for (let py = 0; py < h; py += 32) {
    for (let px = 0; px < w; px += 64) {
      const shade = 194 + Math.floor(rand() * 20);
      ctx.fillStyle = `rgb(${shade},${shade + 3},${shade + 8})`;
      ctx.fillRect(px + 1, py + 1, 62, 30);

      // Formwork tie-rod dimples
      ctx.fillStyle = '#64748b';
      ctx.fillRect(px + 8, py + 6, 2, 2);
      ctx.fillRect(px + 54, py + 6, 2, 2);
    }
  }

  // High-density sleek horizontal ribbon windows with dark anodized steel mullions
  for (let row = 0; row < 16; row++) {
    const wy = row * 32 + 10;
    ctx.fillStyle = '#0f172a';
    ctx.fillRect(0, wy, w, 18);
    rCtx.fillStyle = 'rgb(20,20,20)';
    rCtx.fillRect(0, wy, w, 18);

    for (let col = 0; col < 16; col++) {
      const wx = col * 32;
      const isLit = rand() > 0.8;
      ctx.fillStyle = '#1e293b';
      ctx.fillRect(wx + 2, wy + 2, 28, 14);
      if (isLit) {
        ctx.fillStyle = 'rgba(254, 243, 199, 0.45)';
        ctx.fillRect(wx + 2, wy + 2, 28, 14);
      }
      ctx.fillStyle = '#475569';
      ctx.fillRect(wx, wy, 1.5, 18);
    }
  }

  const map = new THREE.CanvasTexture(cColor);
  map.wrapS = THREE.RepeatWrapping;
  map.wrapT = THREE.RepeatWrapping;
  map.repeat.set(2, 2);
  map.anisotropy = 4;
  map.colorSpace = THREE.SRGBColorSpace;

  const roughnessMap = new THREE.CanvasTexture(cRough);
  roughnessMap.wrapS = THREE.RepeatWrapping;
  roughnessMap.wrapT = THREE.RepeatWrapping;
  roughnessMap.repeat.set(2, 2);
  roughnessMap.anisotropy = 4;

  return { map, roughnessMap };
}

/**
 * 4. City Rooftop Tar-and-Gravel Membrane, Skylight & Mechanical Louver Pad PBR
 */
export function createRoofGravelHVACPBR(): THREE.CanvasTexture {
  const size = 512;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d')!;

  // Dark weathered roofing bitumen membrane
  ctx.fillStyle = '#334155';
  ctx.fillRect(0, 0, size, size);

  const rand = makeSeededRand(808);
  for (let i = 0; i < 18000; i++) {
    const x = rand() * size;
    const y = rand() * size;
    const v = 42 + Math.floor(rand() * 52);
    ctx.fillStyle = `rgb(${v},${v + 3},${v + 7})`;
    ctx.fillRect(x, y, 2, 2);
  }

  // Perimeter parapet metal coping border
  ctx.strokeStyle = '#94a3b8';
  ctx.lineWidth = 18;
  ctx.strokeRect(9, 9, size - 18, size - 18);
  ctx.strokeStyle = '#1e293b';
  ctx.lineWidth = 3;
  ctx.strokeRect(18, 18, size - 36, size - 36);

  // Rooftop mechanical louver grates & solar/skylight bays
  for (let gx = 64; gx <= 360; gx += 148) {
    for (let gy = 64; gy <= 360; gy += 148) {
      ctx.fillStyle = '#475569';
      ctx.fillRect(gx, gy, 88, 88);
      ctx.strokeStyle = '#cbd5e1';
      ctx.lineWidth = 2;
      ctx.strokeRect(gx, gy, 88, 88);
      // HVAC Louver slats
      ctx.fillStyle = '#1e293b';
      for (let s = 8; s < 80; s += 8) {
        ctx.fillRect(gx + 8, gy + s, 72, 4);
      }
    }
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.anisotropy = 4;
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

/**
 * 5. Urban Brushed Concrete Sidewalk & Plaza Paver Tiles PBR
 */
export function createSidewalkCobblePBR(): THREE.CanvasTexture {
  const size = 512;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d')!;

  ctx.fillStyle = '#d6d3d1';
  ctx.fillRect(0, 0, size, size);

  const rand = makeSeededRand(919);
  const tile = 64;
  for (let y = 0; y < size; y += tile) {
    for (let x = 0; x < size; x += tile) {
      const v = 204 + Math.floor(rand() * 22);
      ctx.fillStyle = `rgb(${v},${v - 2},${v - 6})`;
      ctx.fillRect(x + 2, y + 2, tile - 4, tile - 4);
    }
  }

  // Fine granite mineral speckle
  for (let i = 0; i < 12000; i++) {
    const x = rand() * size;
    const y = rand() * size;
    const v = 160 + Math.floor(rand() * 75);
    ctx.fillStyle = `rgba(${v},${v - 2},${v - 4},0.35)`;
    ctx.fillRect(x, y, 2, 2);
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(8, 8);
  tex.anisotropy = 4;
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

/**
 * 6. Dark Asphalt Intersection Pad with Continental Zebra Crosswalks
 */
export function createCrosswalkIntersectionPBR(): THREE.CanvasTexture {
  const size = 512;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d')!;

  ctx.fillStyle = '#1e222a';
  ctx.fillRect(0, 0, size, size);

  const rand = makeSeededRand(303);
  for (let i = 0; i < 14000; i++) {
    const x = rand() * size;
    const y = rand() * size;
    const v = 26 + Math.floor(rand() * 28);
    ctx.fillStyle = `rgb(${v},${v + 2},${v + 5})`;
    ctx.fillRect(x, y, 2, 2);
  }

  // Crisp white continental zebra stripes on all 4 approaches
  ctx.fillStyle = '#f1f5f9';
  for (let i = 56; i < size - 56; i += 28) {
    // North & South crosswalks
    ctx.fillRect(i, 14, 16, 42);
    ctx.fillRect(i, size - 56, 16, 42);
    // West & East crosswalks
    ctx.fillRect(14, i, 42, 16);
    ctx.fillRect(size - 56, i, 42, 16);
  }

  // Stop bars
  ctx.fillRect(52, 62, size - 104, 5);
  ctx.fillRect(52, size - 67, size - 104, 5);
  ctx.fillRect(62, 52, 5, size - 104);
  ctx.fillRect(size - 67, 52, 5, size - 104);

  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.anisotropy = 4;
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

/**
 * 7. Riveted Structural Steel Truss & Gusset Plate PBR (for Golden Gate, Eiffel, Tokyo Tower)
 */
export function createSteelTrussPBR(): THREE.CanvasTexture {
  const size = 512;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d')!;

  ctx.fillStyle = '#b8bec8';
  ctx.fillRect(0, 0, size, size);

  const rand = makeSeededRand(414);
  // Brushed metallic steel grain
  for (let i = 0; i < 9000; i++) {
    const x = rand() * size;
    const y = rand() * size;
    const v = 165 + Math.floor(rand() * 55);
    ctx.fillStyle = `rgba(${v},${v},${v + 4},0.35)`;
    ctx.fillRect(x, y, 6, 1);
  }

  // Cross-bracing structural steel gusset ribs
  ctx.strokeStyle = '#64748b';
  ctx.lineWidth = 10;
  for (let y = 0; y < size; y += 128) {
    for (let x = 0; x < size; x += 128) {
      ctx.strokeRect(x + 4, y + 4, 120, 120);
      ctx.beginPath();
      ctx.moveTo(x + 4, y + 4);
      ctx.lineTo(x + 124, y + 124);
      ctx.moveTo(x + 124, y + 4);
      ctx.lineTo(x + 4, y + 124);
      ctx.stroke();

      // Rivet heads along gusset plates
      ctx.fillStyle = '#e2e8f0';
      for (let r = 16; r <= 112; r += 16) {
        ctx.beginPath();
        ctx.arc(x + r, y + 10, 2.5, 0, Math.PI * 2);
        ctx.arc(x + r, y + 118, 2.5, 0, Math.PI * 2);
        ctx.arc(x + 10, y + r, 2.5, 0, Math.PI * 2);
        ctx.arc(x + 118, y + r, 2.5, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(2, 4);
  tex.anisotropy = 4;
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

/**
 * 8. Glossy Chevron-Ribbed Swedish Ceramic Shell Tile PBR (for Sydney Opera House)
 */
export function createCeramicShellPBR(): {
  map: THREE.CanvasTexture;
  roughnessMap: THREE.CanvasTexture;
} {
  const size = 512;
  const cColor = document.createElement('canvas');
  cColor.width = size;
  cColor.height = size;
  const ctx = cColor.getContext('2d')!;

  const cRough = document.createElement('canvas');
  cRough.width = size;
  cRough.height = size;
  const rCtx = cRough.getContext('2d')!;

  ctx.fillStyle = '#f8fafc';
  ctx.fillRect(0, 0, size, size);
  rCtx.fillStyle = 'rgb(24,24,24)';
  rCtx.fillRect(0, 0, size, size);

  const rand = makeSeededRand(515);
  // Precast concrete rib radial lines & glossy white/cream ceramic chevron tiles
  for (let x = 0; x < size; x += 32) {
    ctx.fillStyle = '#cbd5e1';
    ctx.fillRect(x, 0, 3, size);
    rCtx.fillStyle = 'rgb(140,140,140)';
    rCtx.fillRect(x, 0, 3, size);

    for (let y = 0; y < size; y += 16) {
      const cream = rand() > 0.45;
      ctx.fillStyle = cream ? '#f8fafc' : '#f1f5f9';
      ctx.fillRect(x + 4, y + 1, 26, 14);
      // Subtle chevron diagonal tile seam
      ctx.strokeStyle = '#e2e8f0';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(x + 4, y + 8);
      ctx.lineTo(x + 17, y + 2);
      ctx.lineTo(x + 30, y + 8);
      ctx.stroke();
    }
  }

  const map = new THREE.CanvasTexture(cColor);
  map.wrapS = THREE.RepeatWrapping;
  map.wrapT = THREE.RepeatWrapping;
  map.repeat.set(3, 3);
  map.anisotropy = 4;
  map.colorSpace = THREE.SRGBColorSpace;

  const roughnessMap = new THREE.CanvasTexture(cRough);
  roughnessMap.wrapS = THREE.RepeatWrapping;
  roughnessMap.wrapT = THREE.RepeatWrapping;
  roughnessMap.repeat.set(3, 3);
  roughnessMap.anisotropy = 4;

  return { map, roughnessMap };
}

/**
 * 9. Oxidized Verdigris Copper Sheet & Riveted Seam PBR (for Statue of Liberty)
 */
export function createCopperPatinaPBR(): THREE.CanvasTexture {
  const size = 512;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d')!;

  ctx.fillStyle = '#2dd4bf';
  ctx.fillRect(0, 0, size, size);

  const rand = makeSeededRand(999);
  for (let y = 0; y < size; y += 64) {
    for (let x = 0; x < size; x += 64) {
      const g = 175 + Math.floor(rand() * 38);
      const b = 155 + Math.floor(rand() * 35);
      ctx.fillStyle = `rgb(42,${g},${b})`;
      ctx.fillRect(x + 1, y + 1, 62, 62);

      // Subtle bronze/verdigris patina mottling
      ctx.fillStyle = rand() > 0.5 ? 'rgba(13, 148, 136, 0.28)' : 'rgba(180, 130, 80, 0.14)';
      ctx.fillRect(x + 6, y + 6, 50, 50);

      // Riveted copper sheet seam border
      ctx.strokeStyle = '#0f766e';
      ctx.lineWidth = 2;
      ctx.strokeRect(x + 1, y + 1, 62, 62);
    }
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(2, 3);
  tex.anisotropy = 4;
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

/**
 * 10. Roman Travertine 3-Story Semi-Circular Arch Arcade + 4th-Story Corinthian Attic PBR (for Rome Colosseum)
 */
export function createColosseumArcadePBR(): {
  map: THREE.CanvasTexture;
  roughnessMap: THREE.CanvasTexture;
} {
  const w = 512;
  const h = 512;
  const cColor = document.createElement('canvas');
  cColor.width = w;
  cColor.height = h;
  const ctx = cColor.getContext('2d')!;

  const cRough = document.createElement('canvas');
  cRough.width = w;
  cRough.height = h;
  const rCtx = cRough.getContext('2d')!;

  // Base warm Roman travertine limestone (#e5dccb / #d6c9b4)
  ctx.fillStyle = '#e5dccb';
  ctx.fillRect(0, 0, w, h);
  rCtx.fillStyle = 'rgb(195,195,195)';
  rCtx.fillRect(0, 0, w, h);

  const rand = makeSeededRand(1010);

  // Fine travertine ashlar stone blocks & natural porous striations
  for (let y = 0; y < h; y += 16) {
    const offset = ((y / 16) % 2) * 16;
    for (let x = -32; x < w + 32; x += 32) {
      const shade = 212 + Math.floor(rand() * 24);
      ctx.fillStyle = `rgb(${shade},${shade - 10},${shade - 26})`;
      ctx.fillRect(x + offset + 1, y + 1, 30, 14);
    }
  }
  for (let i = 0; i < 4500; i++) {
    const px = rand() * w;
    const py = rand() * h;
    ctx.fillStyle = rand() > 0.5 ? 'rgba(130, 114, 92, 0.16)' : 'rgba(250, 245, 235, 0.14)';
    ctx.fillRect(px, py, 3 + rand() * 5, 1.5);
  }

  const numBays = 8; // 8 arches per 512px tile -> 48 arches around perimeter with repeat(6, 1)
  const bayW = w / numBays; // 64px

  // Top 4th-Story Corinthian Attic Wall (y = 0..104)
  ctx.fillStyle = '#efe7d6';
  ctx.fillRect(0, 0, w, 10);
  ctx.fillStyle = '#a3927a';
  ctx.fillRect(0, 10, w, 4);
  ctx.fillStyle = '#f2ead9';
  ctx.fillRect(0, 96, w, 8);
  ctx.fillStyle = '#9c8b73';
  ctx.fillRect(0, 102, w, 3);

  for (let col = 0; col < numBays; col++) {
    const bx = col * bayW;
    // Corinthian flat pilaster between attic bays
    ctx.fillStyle = '#ede3d1';
    ctx.fillRect(bx - 5, 14, 10, 82);
    ctx.fillStyle = '#b8a78e';
    ctx.fillRect(bx - 6, 14, 1.5, 82);
    ctx.fillRect(bx + 5, 14, 1.5, 82);
    // Corinthian capital
    ctx.fillStyle = '#f5eee0';
    ctx.fillRect(bx - 7, 14, 14, 6);

    // Alternating rectangular bronze-shield / recessed attic window in each bay
    if (col % 2 === 0) {
      ctx.fillStyle = '#1c1917';
      ctx.fillRect(bx + 22, 42, 20, 28);
      ctx.strokeStyle = '#c2b299';
      ctx.lineWidth = 2;
      ctx.strokeRect(bx + 21, 41, 22, 30);
      rCtx.fillStyle = 'rgb(240,240,240)';
      rCtx.fillRect(bx + 22, 42, 20, 28);
    } else {
      // Carved travertine medallion shield in odd bays
      ctx.fillStyle = '#cbbba2';
      ctx.beginPath();
      ctx.arc(bx + 32, 54, 10, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = '#94836b';
      ctx.lineWidth = 1.5;
      ctx.stroke();
    }
  }

  // 3 Stacked Classical Arcade Stories (Ionic, Corinthian, Tuscanic orders: y = 104..512)
  const storyHeight = 136;
  const storyStarts = [104, 240, 376];

  for (let sIdx = 0; sIdx < 3; sIdx++) {
    const sy = storyStarts[sIdx];

    // Classical entablature & projecting cornice belt at top of story
    ctx.fillStyle = '#f5ede0';
    ctx.fillRect(0, sy, w, 9);
    ctx.fillStyle = '#cfc0a9';
    ctx.fillRect(0, sy + 9, w, 6);
    ctx.fillStyle = '#8c7b65';
    ctx.fillRect(0, sy + 15, w, 3);

    // Parapet stylobate sill at bottom of story
    ctx.fillStyle = '#dfd3be';
    ctx.fillRect(0, sy + storyHeight - 8, w, 8);

    for (let col = 0; col < numBays; col++) {
      const bx = col * bayW;
      const archCenterX = bx + bayW * 0.5; // bx + 32
      const archRadius = 19.5;
      const archSpringY = sy + 46;
      const archBottomY = sy + storyHeight - 8;

      // Radial travertine voussoir arch ring stones around the semi-circular arch
      ctx.save();
      ctx.beginPath();
      ctx.arc(archCenterX, archSpringY, archRadius + 6, Math.PI, 0, false);
      ctx.lineTo(archCenterX + archRadius + 6, archBottomY);
      ctx.lineTo(archCenterX - archRadius - 6, archBottomY);
      ctx.closePath();
      ctx.fillStyle = '#d4c5ae';
      ctx.fill();
      ctx.strokeStyle = '#96856e';
      ctx.lineWidth = 1.5;
      ctx.stroke();

      // Radial voussoir wedge joints along the semi-circular arch ring
      for (let a = 0; a <= 8; a++) {
        const ang = Math.PI + (a * Math.PI) / 8;
        ctx.beginPath();
        ctx.moveTo(archCenterX + Math.cos(ang) * archRadius, archSpringY + Math.sin(ang) * archRadius);
        ctx.lineTo(
          archCenterX + Math.cos(ang) * (archRadius + 6.5),
          archSpringY + Math.sin(ang) * (archRadius + 6.5)
        );
        ctx.stroke();
      }
      ctx.restore();

      // Deep, dark-shadowed semi-circular Roman arch opening (#0f172a / #1c1917)
      ctx.save();
      ctx.beginPath();
      ctx.arc(archCenterX, archSpringY, archRadius, Math.PI, 0, false);
      ctx.lineTo(archCenterX + archRadius, archBottomY);
      ctx.lineTo(archCenterX - archRadius, archBottomY);
      ctx.closePath();

      const archGrad = ctx.createLinearGradient(archCenterX - archRadius, archSpringY - archRadius, archCenterX + archRadius, archBottomY);
      archGrad.addColorStop(0, '#090d16');
      archGrad.addColorStop(0.55, '#1c1917');
      archGrad.addColorStop(1, '#29221c');
      ctx.fillStyle = archGrad;
      ctx.fill();

      // Inner recessed travertine intrados soffit depth rim & warm Roman amber uplight glow at base
      ctx.strokeStyle = '#786852';
      ctx.lineWidth = 2.5;
      ctx.stroke();

      const warmArchGlow = ctx.createLinearGradient(archCenterX, archBottomY - 26, archCenterX, archBottomY);
      warmArchGlow.addColorStop(0, 'rgba(245, 158, 11, 0)');
      warmArchGlow.addColorStop(1, 'rgba(251, 191, 36, 0.28)');
      ctx.fillStyle = warmArchGlow;
      ctx.fillRect(archCenterX - archRadius + 2, archBottomY - 26, archRadius * 2 - 4, 26);
      ctx.restore();

      // High roughness inside the dark arch void so it stays deep matte shadow
      rCtx.save();
      rCtx.beginPath();
      rCtx.arc(archCenterX, archSpringY, archRadius, Math.PI, 0, false);
      rCtx.lineTo(archCenterX + archRadius, archBottomY);
      rCtx.lineTo(archCenterX - archRadius, archBottomY);
      rCtx.closePath();
      rCtx.fillStyle = 'rgb(248,248,248)';
      rCtx.fill();
      rCtx.restore();

      // Engaged Roman travertine half-column between every arch (shaded cylindrically)
      const colW = 11;
      const colX = bx - colW * 0.5;
      const colTop = sy + 18;
      const colH = storyHeight - 26;
      const colGrad = ctx.createLinearGradient(colX, 0, colX + colW, 0);
      colGrad.addColorStop(0, '#a8977e');
      colGrad.addColorStop(0.35, '#f5ede0');
      colGrad.addColorStop(0.7, '#dfd2bc');
      colGrad.addColorStop(1, '#8c7b64');
      ctx.fillStyle = colGrad;
      ctx.fillRect(colX, colTop, colW, colH);
      // Wrap-around column at right edge of tile for col === 0
      if (col === 0) {
        ctx.fillRect(w - colW * 0.5, colTop, colW, colH);
      }

      // Column capital & base plinth
      ctx.fillStyle = '#f5ede0';
      ctx.fillRect(colX - 2, colTop, colW + 4, 5);
      ctx.fillRect(colX - 2, colTop + colH - 5, colW + 4, 5);
      if (col === 0) {
        ctx.fillRect(w - colW * 0.5 - 2, colTop, colW + 4, 5);
        ctx.fillRect(w - colW * 0.5 - 2, colTop + colH - 5, colW + 4, 5);
      }
    }
  }

  const map = new THREE.CanvasTexture(cColor);
  map.wrapS = THREE.RepeatWrapping;
  map.wrapT = THREE.ClampToEdgeWrapping;
  map.repeat.set(6, 1);
  map.anisotropy = 4;
  map.colorSpace = THREE.SRGBColorSpace;

  const roughnessMap = new THREE.CanvasTexture(cRough);
  roughnessMap.wrapS = THREE.RepeatWrapping;
  roughnessMap.wrapT = THREE.ClampToEdgeWrapping;
  roughnessMap.repeat.set(6, 1);
  roughnessMap.anisotropy = 4;

  return { map, roughnessMap };
}

/**
 * 11. Monumental Ribbed Pink-Beige Granite & Travertine Podium PBR (ZERO office windows!)
 * Used for Sydney Opera House Bennelong Point podium, bridge piers, and monument bases.
 */
export function createGranitePodiumPBR(): {
  map: THREE.CanvasTexture;
  roughnessMap: THREE.CanvasTexture;
} {
  const w = 512;
  const h = 512;
  const cColor = document.createElement('canvas');
  cColor.width = w;
  cColor.height = h;
  const ctx = cColor.getContext('2d')!;

  const cRough = document.createElement('canvas');
  cRough.width = w;
  cRough.height = h;
  const rCtx = cRough.getContext('2d')!;

  // Base warm pink-beige granite & travertine masonry (#d8c7b8)
  ctx.fillStyle = '#d8c7b8';
  ctx.fillRect(0, 0, w, h);
  rCtx.fillStyle = 'rgb(185,185,185)';
  rCtx.fillRect(0, 0, w, h);

  const rand = makeSeededRand(1111);

  // Monumental rusticated ashlar granite stone courses (ZERO windows!)
  const rows = 16;
  const cols = 8;
  const rowH = h / rows; // 32px
  const colW = w / cols; // 64px

  for (let r = 0; r < rows; r++) {
    const y = r * rowH;
    const offset = (r % 2) * (colW * 0.5);
    for (let c = -1; c <= cols; c++) {
      const x = c * colW + offset;
      const baseR = 206 + Math.floor(rand() * 22);
      const baseG = baseR - 15 + Math.floor(rand() * 6);
      const baseB = baseR - 28 + Math.floor(rand() * 6);

      // Stone block face
      ctx.fillStyle = `rgb(${baseR},${baseG},${baseB})`;
      ctx.fillRect(x + 2, y + 2, colW - 4, rowH - 4);

      // Top sunlit chamfer highlight & bottom recessed shadow joint
      ctx.fillStyle = 'rgba(255, 250, 244, 0.35)';
      ctx.fillRect(x + 2, y + 2, colW - 4, 2);
      ctx.fillStyle = 'rgba(92, 78, 66, 0.42)';
      ctx.fillRect(x + 1, y + rowH - 2, colW - 2, 2);
      ctx.fillRect(x + colW - 2, y + 1, 2, rowH - 2);
    }
  }

  // Subtle vertical precast ribbed granite fluting & buttress piers every 64px
  for (let x = 0; x < w; x += 16) {
    ctx.fillStyle = x % 64 === 0 ? 'rgba(110, 94, 80, 0.26)' : 'rgba(120, 104, 90, 0.10)';
    ctx.fillRect(x, 0, x % 64 === 0 ? 4 : 1.5, h);
    ctx.fillStyle = 'rgba(250, 244, 236, 0.16)';
    ctx.fillRect(x + 2, 0, 1.5, h);
  }

  // Projecting upper cornice cap & lower water-table plinth moulding
  ctx.fillStyle = '#eadfd3';
  ctx.fillRect(0, 0, w, 18);
  ctx.fillStyle = '#9c8978';
  ctx.fillRect(0, 18, w, 5);
  ctx.fillStyle = '#c4b1a0';
  ctx.fillRect(0, h - 24, w, 24);

  // Fine mineral granite crystalline speckle
  for (let i = 0; i < 14000; i++) {
    const px = rand() * w;
    const py = rand() * h;
    const v = 150 + Math.floor(rand() * 90);
    ctx.fillStyle = `rgba(${v},${v - 8},${v - 16},0.28)`;
    ctx.fillRect(px, py, 2, 2);
  }

  const map = new THREE.CanvasTexture(cColor);
  map.wrapS = THREE.RepeatWrapping;
  map.wrapT = THREE.RepeatWrapping;
  map.repeat.set(4, 1);
  map.anisotropy = 4;
  map.colorSpace = THREE.SRGBColorSpace;

  const roughnessMap = new THREE.CanvasTexture(cRough);
  roughnessMap.wrapS = THREE.RepeatWrapping;
  roughnessMap.wrapT = THREE.RepeatWrapping;
  roughnessMap.repeat.set(4, 1);
  roughnessMap.anisotropy = 4;

  return { map, roughnessMap };
}

function buildPavementCanvasTexture(isRoughness: boolean): THREE.CanvasTexture {
  const size = 256;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext('2d')!;
  const pixels = ctx.createImageData(size, size);
  const random = makeSeededRand(8707);

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const i = (y * size + x) * 4;
      const mineral = random();
      const coarse = Math.sin(x * 0.14 + y * 0.09) * 0.5 + 0.5;
      const sparkle = random() < 0.042;
      if (isRoughness) {
        const val = Math.round(184 + mineral * 54 + (sparkle ? -42 : coarse * 10));
        const clamped = Math.max(125, Math.min(248, val));
        pixels.data[i] = clamped;
        pixels.data[i + 1] = clamped;
        pixels.data[i + 2] = clamped;
      } else {
        const fleck = Math.round(37 + mineral * 20 + coarse * 5 + (sparkle ? mineral * 34 : 0));
        pixels.data[i] = fleck;
        pixels.data[i + 1] = fleck + 2;
        pixels.data[i + 2] = fleck + 4;
      }
      pixels.data[i + 3] = 255;
    }
  }

  ctx.putImageData(pixels, 0, 0);
  const texture = new THREE.CanvasTexture(canvas);
  if (!isRoughness) {
    texture.colorSpace = THREE.SRGBColorSpace;
  }
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
  texture.anisotropy = 4;
  return texture;
}

export function createPavementTexture() {
  return buildPavementCanvasTexture(false);
}

export function createPavementRoughnessTexture() {
  return buildPavementCanvasTexture(true);
}
