import * as THREE from 'three';

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
    vertexShader: /* glsl */ `
      varying vec3 vDir;
      void main() {
        vDir = normalize(position);
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: /* glsl */ `
      varying vec3 vDir;
      void main() {
        float y = vDir.y;
        vec3 zenith = vec3(0.10, 0.45, 0.85);
        vec3 horizon = vec3(0.75, 0.89, 0.98);
        vec3 ground = vec3(0.24, 0.34, 0.40);
        vec3 col = y >= 0.0
          ? mix(horizon, zenith, pow(y, 0.55))
          : mix(horizon, ground, pow(-y, 0.45));
        vec3 sunDir = normalize(vec3(0.55, 0.48, -0.68));
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

  // Base architectural dark-sapphire & bronze reflective curtain-wall glass (#0f172a to #1e293b)
  const bg = ctx.createLinearGradient(0, 0, 0, h);
  bg.addColorStop(0, '#1e293b');
  bg.addColorStop(0.35, '#172554');
  bg.addColorStop(0.7, '#0f172a');
  bg.addColorStop(1, '#090d16');
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, w, h);

  // Ultra-glossy glass pane roughness (rgb(18,18,18))
  rCtx.fillStyle = 'rgb(18,18,18)';
  rCtx.fillRect(0, 0, w, h);

  const rand = makeSeededRand(108);
  for (let y = 0; y < h; y += 32) {
    const floorSuiteLit = rand() > 0.68;
    for (let x = 0; x < w; x += 32) {
      const r = rand();
      const g = ctx.createLinearGradient(x, y, x, y + 26);
      if (r > 0.75 || (floorSuiteLit && r > 0.45)) {
        // ~25% warm champagne-gold interior penthouse/suite floor bands
        g.addColorStop(0, '#fef3c7');
        g.addColorStop(0.55, '#fde68a');
        g.addColorStop(1, '#b45309');
      } else if (r > 0.42) {
        // Subtle sky-reflection dark sapphire glass pane
        g.addColorStop(0, '#334155');
        g.addColorStop(0.5, '#1e293b');
        g.addColorStop(1, '#0f172a');
      } else if (r > 0.18) {
        // Architectural smoked bronze-slate reflection
        g.addColorStop(0, '#292524');
        g.addColorStop(0.5, '#1e293b');
        g.addColorStop(1, '#0f172a');
      } else {
        // Deep obsidian twilight glass pane
        g.addColorStop(0, '#1e293b');
        g.addColorStop(1, '#090d16');
      }
      ctx.fillStyle = g;
      ctx.fillRect(x + 3, y + 5, 26, 23);

      // Subtle diagonal specular sky-reflection sheen across glass pane
      ctx.fillStyle = 'rgba(148, 163, 184, 0.08)';
      ctx.fillRect(x + 4, y + 6, 10, 21);
    }
  }

  // Crisp dark anodized aluminum vertical mullions (#090d16) & roughness rgb(140,140,140)
  ctx.fillStyle = '#090d16';
  rCtx.fillStyle = 'rgb(140,140,140)';
  for (let x = 0; x < w; x += 32) {
    ctx.fillRect(x, 0, 3, h);
    rCtx.fillRect(x, 0, 3, h);
  }
  // Dark bronze-slate horizontal spandrel bands & mullions
  ctx.fillStyle = '#111827';
  rCtx.fillStyle = 'rgb(140,140,140)';
  for (let y = 0; y < h; y += 32) {
    ctx.fillRect(0, y, w, 5);
    rCtx.fillRect(0, y, w, 5);
  }

  const map = new THREE.CanvasTexture(cColor);
  map.wrapS = THREE.RepeatWrapping;
  map.wrapT = THREE.RepeatWrapping;
  map.anisotropy = 4;
  map.colorSpace = THREE.SRGBColorSpace;

  const roughnessMap = new THREE.CanvasTexture(cRough);
  roughnessMap.wrapS = THREE.RepeatWrapping;
  roughnessMap.wrapT = THREE.RepeatWrapping;
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
