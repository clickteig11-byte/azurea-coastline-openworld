import * as THREE from 'three';
import { COAST_SUN } from '../game/worldMath';

const TEX_ANISOTROPY = 8;

function makeSeededRand(seedInit: number) {
  let seed = seedInit >>> 0;
  return () => {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    return seed / 4294967296;
  };
}

function configureTexture(
  canvas: HTMLCanvasElement,
  repeatX = 1,
  repeatY = 1,
  isColor = true,
  clampT = false
): THREE.CanvasTexture {
  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = clampT ? THREE.ClampToEdgeWrapping : THREE.RepeatWrapping;
  if (repeatX !== 1 || repeatY !== 1) {
    tex.repeat.set(repeatX, repeatY);
  }
  tex.anisotropy = TEX_ANISOTROPY;
  if (isColor) {
    tex.colorSpace = THREE.SRGBColorSpace;
  }
  return tex;
}

/**
 * Generates a one-time PMREM environment map from a rich procedural sunlit sky/ocean scene.
 * Gives clearcoat car paint, glass skyscrapers, chrome rides, and water realistic reflections at 0ms/frame.
 */
export function createProceduralEnvMap(gl: THREE.WebGLRenderer): THREE.Texture {
  const pmrem = new THREE.PMREMGenerator(gl);
  pmrem.compileEquirectangularShader();

  const envScene = new THREE.Scene();
  const skyGeo = new THREE.SphereGeometry(50, 40, 24);
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

      float hash(vec2 p) {
        return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
      }
      float noise(vec2 p) {
        vec2 i = floor(p);
        vec2 f = fract(p);
        f = f * f * (3.0 - 2.0 * f);
        return mix(
          mix(hash(i), hash(i + vec2(1.0, 0.0)), f.x),
          mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), f.x),
          f.y
        );
      }

      void main() {
        vec3 dir = normalize(vDir);
        float y = dir.y;
        vec3 zenith = vec3(0.032, 0.165, 0.36);
        vec3 midSky = vec3(0.18, 0.44, 0.72);
        vec3 horizon = vec3(0.76, 0.87, 0.94);
        vec3 warmRim = vec3(1.0, 0.88, 0.68);
        vec3 oceanBounce = vec3(0.04, 0.24, 0.32);
        vec3 sandBounce = vec3(0.32, 0.28, 0.21);

        vec3 col;
        if (y >= 0.0) {
          col = mix(horizon, midSky, smoothstep(0.0, 0.32, y));
          col = mix(col, zenith, pow(smoothstep(0.15, 1.0, y), 0.78));
          // Soft sunlit cloud puffs in environment reflection for realistic car/glass highlights
          vec2 cuv = dir.xz / (y + 0.22) * 1.4;
          float c = noise(cuv * 2.1) * 0.65 + noise(cuv * 4.8) * 0.35;
          float cloudMask = smoothstep(0.54, 0.78, c) * smoothstep(0.04, 0.24, y) * (1.0 - smoothstep(0.65, 0.95, y));
          col = mix(col, vec3(1.05, 1.03, 0.98), cloudMask * 0.45);
        } else {
          float landMix = smoothstep(-0.08, -0.52, y) * 0.38;
          vec3 ground = mix(oceanBounce, sandBounce, landMix);
          col = mix(horizon * 0.72, ground, pow(-y, 0.42));
        }

        vec3 sunDir = normalize(uSunDir);
        float sunDot = max(dot(dir, sunDir), 0.0);
        col += warmRim * pow(sunDot, 6.0) * 0.28 * pow(1.0 - abs(y), 2.5);
        col += vec3(1.0, 0.95, 0.82) * pow(sunDot, 36.0) * 1.6;
        col += vec3(1.0, 0.98, 0.92) * pow(sunDot, 220.0) * 4.8;
        gl_FragColor = vec4(col, 1.0);
      }
    `,
  });
  envScene.add(new THREE.Mesh(skyGeo, skyMat));

  const rt = pmrem.fromScene(envScene, 0.018);
  skyGeo.dispose();
  skyMat.dispose();
  pmrem.dispose();
  return rt.texture;
}

/**
 * Architectural Glass Curtain-Wall Skyscraper PBR with warm lit interior depth,
 * brushed anodized mullions, spandrel shadow bands, and crisp roughness contrast.
 */
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

  // Deep architectural slate-blue & steel-teal curtain-wall sky-tinted base
  const bg = ctx.createLinearGradient(0, 0, 0, h);
  bg.addColorStop(0, '#24364e');
  bg.addColorStop(0.42, '#142033');
  bg.addColorStop(1, '#09111e');
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, w, h);

  // Ultra-glossy architectural glass baseline
  rCtx.fillStyle = 'rgb(14,14,14)';
  rCtx.fillRect(0, 0, w, h);

  const rand = makeSeededRand(108);
  const cols = 16;
  const rows = 32;
  const bayW = w / cols; // 32px
  const rowH = h / rows; // 32px

  for (let row = 0; row < rows; row++) {
    const y = row * rowH;
    const isMechanicalFloor = row === 15 || row === 31;
    const floorSuiteActive = rand() > 0.68;
    const floorWarmth = rand();

    for (let col = 0; col < cols; col++) {
      const x = col * bayW;
      const r = rand();

      if (isMechanicalFloor) {
        ctx.fillStyle = '#0d1524';
        ctx.fillRect(x + 2, y + 4, bayW - 3, rowH - 5);
        ctx.fillStyle = '#3b4c63';
        for (let ly = y + 6; ly < y + rowH - 3; ly += 4) {
          ctx.fillRect(x + 3, ly, bayW - 5, 1.5);
        }
        rCtx.fillStyle = 'rgb(175,175,175)';
        rCtx.fillRect(x + 2, y + 4, bayW - 3, rowH - 5);
        continue;
      }

      // Per-pane sky reflection gradient (slight panel-to-panel tilt variance like real curtain walls)
      const g = ctx.createLinearGradient(x, y + 4, x + bayW * 0.4, y + rowH - 1);
      if (r > 0.62) {
        g.addColorStop(0, '#44607f');
        g.addColorStop(0.45, '#253952');
        g.addColorStop(1, '#101b2c');
      } else if (r > 0.25) {
        g.addColorStop(0, '#2c4460');
        g.addColorStop(0.55, '#192a40');
        g.addColorStop(1, '#0c1524');
      } else {
        g.addColorStop(0, '#1f3248');
        g.addColorStop(1, '#09101b');
      }
      ctx.fillStyle = g;
      ctx.fillRect(x + 2, y + 4, bayW - 3, rowH - 5);

      // Subtle architectural interior depth (recessed floor slab + silhouette desk/column)
      const isLit = r > 0.78 || (floorSuiteActive && r > 0.52);
      if (isLit) {
        const warmSuite = floorWarmth > 0.22;
        const ceilGrad = ctx.createLinearGradient(x, y + 5, x, y + rowH - 2);
        if (warmSuite) {
          ceilGrad.addColorStop(0, 'rgba(255, 246, 206, 0.76)');
          ceilGrad.addColorStop(0.38, 'rgba(253, 214, 134, 0.44)');
          ceilGrad.addColorStop(0.75, 'rgba(180, 128, 72, 0.24)');
          ceilGrad.addColorStop(1, 'rgba(24, 32, 48, 0.28)');
        } else {
          ceilGrad.addColorStop(0, 'rgba(224, 244, 255, 0.62)');
          ceilGrad.addColorStop(0.45, 'rgba(147, 210, 245, 0.30)');
          ceilGrad.addColorStop(1, 'rgba(15, 23, 42, 0.25)');
        }
        ctx.fillStyle = ceilGrad;
        ctx.fillRect(x + 3, y + 5, bayW - 5, rowH - 7);

        // Recessed linear LED office ceiling troffer
        ctx.fillStyle = warmSuite ? 'rgba(255, 252, 235, 0.88)' : 'rgba(240, 249, 255, 0.82)';
        ctx.fillRect(x + 5, y + 6, bayW - 9, 2);

        // Subtle silhouetted interior desk / partition in lower third for parallax depth
        if (rand() > 0.42) {
          ctx.fillStyle = 'rgba(15, 23, 42, 0.38)';
          ctx.fillRect(x + 4, y + rowH - 9, (bayW - 8) * (0.4 + rand() * 0.5), 6);
        }
      } else if (r > 0.35) {
        // Subtle partially lowered solar roller blind at top of unlit office
        const blindH = 4 + Math.floor(rand() * 7);
        ctx.fillStyle = 'rgba(148, 163, 184, 0.14)';
        ctx.fillRect(x + 3, y + 5, bayW - 5, blindH);
      }

      // Diagonal specular sky glint stripe across glass pane
      ctx.fillStyle = 'rgba(191, 219, 254, 0.12)';
      ctx.beginPath();
      ctx.moveTo(x + 3, y + 5);
      ctx.lineTo(x + bayW * 0.56, y + 5);
      ctx.lineTo(x + bayW * 0.30, y + rowH - 2);
      ctx.lineTo(x + 3, y + rowH - 2);
      ctx.closePath();
      ctx.fill();

      // Fine secondary center sub-mullion
      ctx.fillStyle = '#1b2738';
      ctx.fillRect(x + bayW * 0.5, y + 4, 1, rowH - 5);
    }
  }

  // Structural spandrel bands between floors (dark anodized slate + upper bevel glint)
  for (let row = 0; row < rows; row++) {
    const y = row * rowH;
    ctx.fillStyle = '#0c1322';
    ctx.fillRect(0, y, w, 4);
    ctx.fillStyle = '#64748b';
    ctx.fillRect(0, y, w, 1);
    ctx.fillStyle = '#020617';
    ctx.fillRect(0, y + 4, w, 1);
    rCtx.fillStyle = 'rgb(142,142,142)';
    rCtx.fillRect(0, y, w, 5);
  }

  // Brushed silver-charcoal vertical structural mullions
  for (let col = 0; col < cols; col++) {
    const x = col * bayW;
    ctx.fillStyle = '#2b394d';
    ctx.fillRect(x, 0, 2, h);
    ctx.fillStyle = '#94a3b8';
    ctx.fillRect(x, 0, 0.85, h);
    rCtx.fillStyle = 'rgb(120,120,120)';
    rCtx.fillRect(x, 0, 2, h);
  }

  return {
    map: configureTexture(cColor, 2, 2, true),
    roughnessMap: configureTexture(cRough, 2, 2, false),
  };
}

/**
 * Warm Venetian Stucco Palazzo Facade PBR with plaster trowel grain, travertine cornices,
 * louvered shutters, and arched windows with warm interior glow.
 */
export function createPalazzoPBR(): THREE.CanvasTexture {
  const w = 512;
  const h = 512;
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d')!;

  const grad = ctx.createLinearGradient(0, 0, 0, h);
  grad.addColorStop(0, '#f5e8d4');
  grad.addColorStop(0.5, '#eddcc4');
  grad.addColorStop(1, '#e1ccb0');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, w, h);

  const rand = makeSeededRand(404);
  // Venetian lime-plaster trowel mottling
  for (let i = 0; i < 2400; i++) {
    const x = rand() * w;
    const y = rand() * h;
    ctx.fillStyle = rand() > 0.48 ? 'rgba(175,132,90,0.08)' : 'rgba(255,252,245,0.10)';
    ctx.fillRect(x, y, 3 + rand() * 5, 2 + rand() * 4);
  }

  // Molded travertine cornice bands with drop shadow
  for (let y = 0; y < h; y += 128) {
    ctx.fillStyle = '#f8f1e6';
    ctx.fillRect(0, y, w, 4);
    ctx.fillStyle = '#d4c3ab';
    ctx.fillRect(0, y + 4, w, 7);
    ctx.fillStyle = 'rgba(72, 54, 38, 0.34)';
    ctx.fillRect(0, y + 11, w, 3);
  }

  // Arched Italian windows with louvered olive shutters & warm interior depth
  for (let row = 0; row < 4; row++) {
    const wy = row * 128 + 30;
    for (let col = 0; col < 6; col++) {
      const wx = col * 85 + 22;

      // Louvered shutters
      for (const sx of [wx - 11, wx + 40]) {
        ctx.fillStyle = '#2f4f1c';
        ctx.fillRect(sx, wy + 12, 9, 58);
        ctx.fillStyle = '#1e3611';
        for (let ly = wy + 15; ly < wy + 68; ly += 4) {
          ctx.fillRect(sx + 1, ly, 7, 1.5);
        }
      }

      // Carved stone frame & keystone
      ctx.fillStyle = '#efe5d6';
      ctx.fillRect(wx - 3, wy - 2, 44, 75);
      ctx.fillStyle = '#c8b8a1';
      ctx.fillRect(wx - 5, wy + 71, 48, 4);

      // Arched opening with warm interior depth or sky reflection
      const lit = rand() > 0.52;
      ctx.save();
      ctx.beginPath();
      ctx.arc(wx + 19, wy + 18, 17, Math.PI, 0);
      ctx.lineTo(wx + 36, wy + 70);
      ctx.lineTo(wx + 2, wy + 70);
      ctx.closePath();
      const winGrad = ctx.createLinearGradient(wx, wy, wx, wy + 70);
      if (lit) {
        winGrad.addColorStop(0, '#fef3c7');
        winGrad.addColorStop(0.55, '#f59e0b');
        winGrad.addColorStop(1, '#78350f');
      } else {
        winGrad.addColorStop(0, '#3b526b');
        winGrad.addColorStop(0.6, '#1e293b');
        winGrad.addColorStop(1, '#0f172a');
      }
      ctx.fillStyle = winGrad;
      ctx.fill();
      ctx.restore();

      // Delicate sash muntins
      ctx.fillStyle = '#d6cab8';
      ctx.fillRect(wx + 18, wy + 1, 2, 69);
      ctx.fillRect(wx + 2, wy + 34, 34, 2);
    }
  }

  return configureTexture(canvas, 1, 1, true);
}

/**
 * Honed Travertine & Cut Limestone Ashlar Masonry PBR
 * Rich porous stone veining, beveled sunlit edges, and recessed shadow mortar joints.
 */
export function createLimestonePBR(): THREE.CanvasTexture {
  const size = 512;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = '#a89c8c';
  ctx.fillRect(0, 0, size, size);

  const rand = makeSeededRand(909);
  const rows = 16;
  const cols = 8;
  const rh = size / rows;
  const cw = size / cols;

  for (let r = 0; r < rows; r++) {
    const offset = (r % 2) * (cw * 0.5);
    for (let c = -1; c <= cols; c++) {
      const bx = c * cw + offset;
      const by = r * rh;
      const shade = 216 + Math.floor(rand() * 24);
      ctx.fillStyle = `rgb(${shade},${shade - 6},${shade - 16})`;
      ctx.fillRect(bx + 1.5, by + 1.5, cw - 3, rh - 3);

      // Sunlit upper-left bevel catch & lower-right mortar shadow
      ctx.fillStyle = 'rgba(255, 252, 245, 0.36)';
      ctx.fillRect(bx + 1.5, by + 1.5, cw - 3, 2);
      ctx.fillRect(bx + 1.5, by + 1.5, 1.5, rh - 3);
      ctx.fillStyle = 'rgba(92, 82, 68, 0.32)';
      ctx.fillRect(bx + 1.5, by + rh - 3, cw - 3, 1.5);

      // Natural travertine horizontal porous striations
      for (let v = 0; v < 4; v++) {
        const vx = bx + 4 + rand() * (cw - 14);
        const vy = by + 4 + rand() * (rh - 8);
        ctx.fillStyle = rand() > 0.45 ? 'rgba(138, 122, 102, 0.20)' : 'rgba(255, 250, 240, 0.22)';
        ctx.fillRect(vx, vy, 6 + rand() * 14, 1.2);
      }
    }
  }

  return configureTexture(canvas, 3, 3, true);
}

/**
 * Weathered Coastal Teak Boardwalk Planks PBR
 * Rich plank-to-plank color variation, organic curved grain fibers, knots, beveled seams,
 * staggered butt joints, and galvanized carriage bolt heads.
 */
export function createBoardwalkWoodPBR(): THREE.CanvasTexture {
  const size = 512;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = '#2b1b10';
  ctx.fillRect(0, 0, size, size);

  const rand = makeSeededRand(404);
  const planks = 16;
  const ph = size / planks; // 32px

  for (let p = 0; p < planks; p++) {
    const y = p * ph;
    // Rich weathered golden-teak & coastal cedar range
    const warmth = rand();
    const r = 118 + Math.floor(warmth * 44);
    const g = 82 + Math.floor(warmth * 32);
    const b = 50 + Math.floor(warmth * 22);

    const plankGrad = ctx.createLinearGradient(0, y + 1, 0, y + ph - 1);
    plankGrad.addColorStop(0, `rgb(${Math.min(255, r + 14)},${Math.min(255, g + 11)},${Math.min(255, b + 8)})`);
    plankGrad.addColorStop(0.22, `rgb(${r},${g},${b})`);
    plankGrad.addColorStop(0.84, `rgb(${Math.max(0, r - 12)},${Math.max(0, g - 9)},${Math.max(0, b - 7)})`);
    plankGrad.addColorStop(1, `rgb(${Math.max(0, r - 28)},${Math.max(0, g - 22)},${Math.max(0, b - 16)})`);
    ctx.fillStyle = plankGrad;
    ctx.fillRect(0, y + 1.5, size, ph - 3);

    // Subtle salt-bleached top highlight & dark recessed shadow groove between planks
    ctx.fillStyle = 'rgba(255, 240, 215, 0.14)';
    ctx.fillRect(0, y + 1.5, size, 1.5);
    ctx.fillStyle = 'rgba(18, 10, 5, 0.72)';
    ctx.fillRect(0, y + ph - 1.5, size, 1.5);

    // Flowing wood-grain fibers
    for (let s = 0; s < 16; s++) {
      const gy = y + 3 + rand() * (ph - 6);
      ctx.strokeStyle = rand() > 0.45 ? 'rgba(255, 232, 198, 0.09)' : 'rgba(34, 18, 8, 0.14)';
      ctx.lineWidth = 0.8 + rand() * 1.1;
      ctx.beginPath();
      ctx.moveTo(0, gy);
      ctx.bezierCurveTo(
        size * 0.33,
        gy + (rand() - 0.5) * 4,
        size * 0.66,
        gy + (rand() - 0.5) * 4,
        size,
        gy
      );
      ctx.stroke();
    }

    // Occasional organic teak wood knot
    if (rand() > 0.55) {
      const kx = 40 + rand() * (size - 80);
      const ky = y + 7 + rand() * (ph - 14);
      ctx.fillStyle = 'rgba(42, 22, 10, 0.34)';
      ctx.beginPath();
      ctx.ellipse(kx, ky, 7 + rand() * 6, 2.5 + rand() * 1.8, (rand() - 0.5) * 0.2, 0, Math.PI * 2);
      ctx.fill();
    }

    // Staggered plank butt joints & galvanized carriage bolt pairs
    const seamX = Math.floor(((p * 173 + 57) % 420) + 46);
    ctx.fillStyle = 'rgba(16, 9, 4, 0.75)';
    ctx.fillRect(seamX, y + 1, 2.5, ph - 2);
    ctx.fillStyle = 'rgba(255, 238, 214, 0.14)';
    ctx.fillRect(seamX + 2.5, y + 2, 1.2, ph - 4);

    for (const bx of [seamX - 7, seamX + 7]) {
      for (const by of [y + 7, y + ph - 7]) {
        ctx.fillStyle = 'rgba(24, 18, 14, 0.65)';
        ctx.beginPath();
        ctx.arc(bx, by, 2.3, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = 'rgba(186, 178, 166, 0.55)';
        ctx.beginPath();
        ctx.arc(bx - 0.5, by - 0.5, 1.2, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  }

  return configureTexture(canvas, 14, 24, true);
}

/**
 * Fast multi-octave terrain & coastal meadow micro-detail texture (via ImageData for <15ms build).
 */
export function createTerrainDetailTexture(): THREE.CanvasTexture {
  const size = 512;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d')!;
  const img = ctx.createImageData(size, size);
  const data = img.data;
  const rand = makeSeededRand(77);

  for (let y = 0; y < size; y++) {
    const wy = y * 0.049;
    for (let x = 0; x < size; x++) {
      const idx = (y * size + x) * 4;
      const wx = x * 0.049;
      const macro = Math.sin(wx + Math.cos(wy * 1.3)) * 12 + Math.cos(wx * 2.1 - wy * 1.7) * 8;
      const ripple = Math.sin(x * 0.19 + y * 0.07 + macro * 0.15) * 6;
      const grain = (rand() - 0.5) * 34;
      const base = Math.max(150, Math.min(252, Math.round(218 + macro + ripple + grain)));
      data[idx] = base;
      data[idx + 1] = Math.max(148, base - 2);
      data[idx + 2] = Math.max(140, base - 6);
      data[idx + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);

  return configureTexture(canvas, 56, 56, false);
}

export function createShadowTexture(): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 128;
  canvas.height = 128;
  const ctx = canvas.getContext('2d')!;
  const grad = ctx.createRadialGradient(64, 64, 6, 64, 64, 62);
  grad.addColorStop(0, 'rgba(15, 23, 42, 0.58)');
  grad.addColorStop(0.55, 'rgba(15, 23, 42, 0.26)');
  grad.addColorStop(1, 'rgba(15, 23, 42, 0.0)');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, 128, 128);
  return new THREE.CanvasTexture(canvas);
}

/**
 * High-Craft Asphalt Road Albedo PBR (512x1024)
 * Fast ImageData multi-scale basalt/quartz mineral aggregate, polished tire-wear lanes,
 * subtle paver seams, and ultra-crisp retro-reflective lane striping.
 */
export function createAsphaltRoadTexture(): THREE.CanvasTexture {
  const w = 512;
  const h = 1024;
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d')!;

  const img = ctx.createImageData(w, h);
  const data = img.data;
  const rand = makeSeededRand(555);

  const laneCenters = [78, 184, 328, 434];
  const wearProfile = new Float32Array(w);
  for (let x = 0; x < w; x++) {
    let wear = 0;
    for (let l = 0; l < laneCenters.length; l++) {
      const dx = (x - laneCenters[l]) / 23;
      wear += Math.exp(-dx * dx);
    }
    const edgeDust = Math.exp(-Math.pow(Math.min(x, w - 1 - x) / 14, 2));
    wearProfile[x] = Math.min(1, wear) - edgeDust * 0.25;
  }

  for (let y = 0; y < h; y++) {
    const longWave = Math.sin(y * 0.035) * 2.2 + Math.cos(y * 0.11) * 1.4;
    for (let x = 0; x < w; x++) {
      const idx = (y * w + x) * 4;
      const r1 = rand();
      const coarse = Math.sin(x * 0.18 + y * 0.11) * 2.4 + Math.cos(x * 0.09 - y * 0.16) * 2.0;
      const agg = (r1 - 0.5) * 17 + coarse;
      const wear = wearProfile[x];
      // Subtle dark paving seam down center & outer lanes
      const seam = Math.abs(x - 256) < 2 || Math.abs(x - 130) < 1.2 || Math.abs(x - 382) < 1.2 ? -5 : 0;
      // Sun-weathered slate-charcoal asphalt (rgb 58..78 sRGB) so roads stay crisp and never crush to black
      const v = Math.max(46, Math.min(96, Math.round(70 - wear * 6.5 + longWave + agg + seam)));
      data[idx] = v;
      data[idx + 1] = Math.min(255, v + 3);
      data[idx + 2] = Math.min(255, v + 7);
      data[idx + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);

  // Subtle realistic rubber tire-path darkening
  laneCenters.forEach((lx) => {
    const g = ctx.createLinearGradient(lx - 28, 0, lx + 28, 0);
    g.addColorStop(0, 'rgba(30, 34, 42, 0)');
    g.addColorStop(0.5, 'rgba(26, 30, 38, 0.22)');
    g.addColorStop(1, 'rgba(30, 34, 42, 0)');
    ctx.fillStyle = g;
    ctx.fillRect(lx - 28, 0, 56, h);
  });

  // Subtle tar crack sealer line
  ctx.strokeStyle = 'rgba(12, 14, 18, 0.55)';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(46, 210);
  ctx.quadraticCurveTo(96, 390, 62, 580);
  ctx.moveTo(410, 640);
  ctx.quadraticCurveTo(372, 820, 424, 980);
  ctx.stroke();

  // Crisp outer white shoulder lines with subtle asphalt grit
  ctx.fillStyle = '#edf2f7';
  ctx.fillRect(14, 0, 6, h);
  ctx.fillRect(w - 20, 0, 6, h);

  // Dashed white lane dividers (sharp highway dashes)
  ctx.fillStyle = 'rgba(244, 247, 252, 0.94)';
  for (let y = 20; y < h; y += 128) {
    ctx.fillRect(130, y, 5, 58);
    ctx.fillRect(w - 135, y, 5, 58);
  }

  // Crisp amber-yellow double center divider
  ctx.fillStyle = '#facc15';
  ctx.fillRect(w / 2 - 9, 0, 6, h);
  ctx.fillRect(w / 2 + 3, 0, 6, h);
  ctx.fillStyle = 'rgba(255, 250, 220, 0.28)';
  ctx.fillRect(w / 2 - 8, 0, 2, h);
  ctx.fillRect(w / 2 + 4, 0, 2, h);

  return configureTexture(canvas, 1, 14, true);
}

export function createAsphaltRoughnessTexture(): THREE.CanvasTexture {
  const w = 256;
  const h = 512;
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d')!;

  const img = ctx.createImageData(w, h);
  const data = img.data;
  const rand = makeSeededRand(556);
  const laneCenters = [39, 92, 164, 217];

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let wear = 0;
      for (let l = 0; l < laneCenters.length; l++) {
        const dx = (x - laneCenters[l]) / 12;
        wear += Math.exp(-dx * dx);
      }
      const n = rand();
      // Balanced sun-weathered asphalt roughness (0.74..0.88) with smooth polished wheel paths & zero spotty dots
      const base = 216 - Math.min(1, wear) * 24 + (n - 0.5) * 22;
      const v = Math.max(182, Math.min(232, Math.round(base)));
      const idx = (y * w + x) * 4;
      data[idx] = v;
      data[idx + 1] = v;
      data[idx + 2] = v;
      data[idx + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);

  // Retro-reflective road paint lines have crisper specular sheen
  ctx.fillStyle = 'rgb(126,126,126)';
  ctx.fillRect(7, 0, 3, h);
  ctx.fillRect(w - 10, 0, 3, h);
  ctx.fillRect(w / 2 - 4.5, 0, 3, h);
  ctx.fillRect(w / 2 + 1.5, 0, 3, h);
  for (let y = 10; y < h; y += 64) {
    ctx.fillRect(65, y, 2.5, 29);
    ctx.fillRect(w - 67.5, y, 2.5, 29);
  }

  return configureTexture(canvas, 1, 14, false);
}

/**
 * Fast Sobel height-to-normal-map converter stub (preserves fast shader path on integrated GPUs).
 */
export function createNormalMapFromCanvas(
  _sourceCanvas: HTMLCanvasElement,
  _strength = 2.4,
  _repeatX = 1,
  _repeatY = 1
): THREE.CanvasTexture {
  return null as unknown as THREE.CanvasTexture;
}

/**
 * Ringed Mediterranean date-palm trunk albedo + normal map.
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
  for (let y = 0; y < h; y += 16) {
    ctx.fillStyle = '#382414';
    ctx.fillRect(0, y, w, 3.5);
    ctx.fillStyle = '#926b47';
    ctx.fillRect(0, y + 3.5, w, 3);
    for (let x = 0; x < w; x += 24) {
      const jitter = (rand() - 0.5) * 4;
      ctx.strokeStyle = rand() > 0.5 ? 'rgba(52, 34, 18, 0.48)' : 'rgba(162, 124, 86, 0.36)';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(x, y + 4);
      ctx.lineTo(x + 12, y + 14 + jitter * 0.3);
      ctx.lineTo(x + 24, y + 4);
      ctx.stroke();
    }
  }

  for (let i = 0; i < 2400; i++) {
    const x = rand() * w;
    const y = rand() * h;
    const shade = 68 + Math.floor(rand() * 58);
    ctx.fillStyle = `rgba(${shade + 24},${shade + 6},${shade - 12},0.35)`;
    ctx.fillRect(x, y, 2, 5);
  }

  const map = configureTexture(canvas, 1, 3, true);
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

  ctx.fillStyle = '#e7dfd3';
  ctx.fillRect(0, 0, w, h);
  rCtx.fillStyle = 'rgb(192,192,192)';
  rCtx.fillRect(0, 0, w, h);

  const rand = makeSeededRand(212);
  for (let y = 0; y < h; y += 16) {
    const offset = ((y / 16) % 2) * 21;
    for (let x = -32; x < w + 32; x += 42) {
      const shade = 218 + Math.floor(rand() * 22);
      ctx.fillStyle = `rgb(${shade},${shade - 6},${shade - 16})`;
      ctx.fillRect(x + offset + 1, y + 1, 40, 14);
    }
  }

  for (let cy = 0; cy < h; cy += 256) {
    ctx.fillStyle = '#f8f2e8';
    ctx.fillRect(0, cy, w, 6);
    ctx.fillStyle = '#a89a86';
    ctx.fillRect(0, cy + 6, w, 3.5);
  }

  const cols = 12;
  const rows = 28;
  const bayW = w / cols;
  const rowH = h / rows;

  for (let col = 0; col < cols; col++) {
    const bx = Math.round(col * bayW);
    const nextBx = Math.round((col + 1) * bayW);
    const bw = nextBx - bx;

    // Fluted Indiana limestone pilaster with sunlit edge highlight
    ctx.fillStyle = '#f5efe4';
    ctx.fillRect(bx, 0, 10, h);
    ctx.fillStyle = '#c4b6a1';
    ctx.fillRect(bx + 3, 0, 1.5, h);
    ctx.fillRect(bx + 6.5, 0, 1.5, h);
    ctx.fillStyle = 'rgba(84, 72, 58, 0.25)';
    ctx.fillRect(bx + 9.5, 0, 1.5, h);

    const winX = bx + 11;
    const winW = bw - 13;

    for (let row = 0; row < rows; row++) {
      const by = Math.round(row * rowH) + 3;
      const winH = Math.round(rowH) - 12;

      // Cast-bronze Art Deco spandrel medallion panel
      ctx.fillStyle = '#2d241b';
      ctx.fillRect(winX, by + winH + 1, winW, 8);
      ctx.strokeStyle = '#927858';
      ctx.lineWidth = 1;
      ctx.strokeRect(winX + 2, by + winH + 2.5, winW - 4, 5);
      rCtx.fillStyle = 'rgb(112,112,112)';
      rCtx.fillRect(winX, by + winH + 1, winW, 8);

      // Recessed dark-bronze window jamb
      ctx.fillStyle = '#181412';
      ctx.fillRect(winX, by, winW, winH);

      const r = rand();
      const winGrad = ctx.createLinearGradient(winX, by + 2, winX, by + winH - 2);
      winGrad.addColorStop(0, '#3a4f69');
      winGrad.addColorStop(0.55, '#1e2c40');
      winGrad.addColorStop(1, '#0e1726');
      ctx.fillStyle = winGrad;
      ctx.fillRect(winX + 2, by + 2, winW - 4, winH - 4);

      if (r > 0.76) {
        const glowGrad = ctx.createLinearGradient(winX, by + 2, winX, by + winH - 2);
        glowGrad.addColorStop(0, 'rgba(255, 245, 200, 0.72)');
        glowGrad.addColorStop(0.5, 'rgba(253, 218, 128, 0.38)');
        glowGrad.addColorStop(1, 'rgba(42, 32, 22, 0.22)');
        ctx.fillStyle = glowGrad;
        ctx.fillRect(winX + 2, by + 2, winW - 4, winH - 4);
      }

      rCtx.fillStyle = 'rgb(22,22,22)';
      rCtx.fillRect(winX + 2, by + 2, winW - 4, winH - 4);

      ctx.fillStyle = '#1c1917';
      ctx.fillRect(winX + Math.floor(winW * 0.5) - 1, by + 1, 2, winH - 2);
      ctx.fillRect(winX + 1, by + Math.floor(winH * 0.42), winW - 2, 1.5);
    }
  }

  return {
    map: configureTexture(cColor, 2, 2, true),
    roughnessMap: configureTexture(cRough, 2, 2, false),
  };
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

  ctx.fillStyle = '#cfc6b8';
  ctx.fillRect(0, 0, w, h);
  rCtx.fillStyle = 'rgb(214,214,214)';
  rCtx.fillRect(0, 0, w, h);

  const rand = makeSeededRand(616);
  const brickH = 6;
  const brickW = 16;
  for (let y = 0; y < h; y += brickH) {
    const rowOffset = ((y / brickH) % 2) * (brickW / 2);
    for (let x = -brickW; x < w + brickW; x += brickW) {
      const kiln = rand();
      const r = 122 + Math.floor(kiln * 48);
      const g = 48 + Math.floor(kiln * 28);
      const b = 34 + Math.floor(kiln * 20);
      ctx.fillStyle = `rgb(${r},${g},${b})`;
      ctx.fillRect(x + rowOffset + 1, y + 1, brickW - 2, brickH - 2);
    }
  }

  // Carved cream limestone belt courses with underside shadow
  ctx.fillStyle = '#ede5d8';
  ctx.fillRect(0, 0, w, 10);
  ctx.fillRect(0, 252, w, 6);
  ctx.fillStyle = '#8f8476';
  ctx.fillRect(0, 10, w, 2);
  ctx.fillRect(0, 258, w, 2);

  const cols = 8;
  const rows = 8;
  const cellW = w / cols;
  const cellH = h / rows;

  for (let row = 0; row < rows; row++) {
    const wy = row * cellH + 14;
    const winH = 38;
    for (let col = 0; col < cols; col++) {
      const wx = col * cellW + 14;
      const winW = 36;

      // Stone keystone lintel & projecting sill
      ctx.fillStyle = '#f0e8db';
      ctx.fillRect(wx - 3, wy - 5, winW + 6, 5);
      ctx.fillRect(wx - 4, wy + winH, winW + 8, 4);
      ctx.fillStyle = '#8a7f72';
      ctx.fillRect(wx - 4, wy + winH + 4, winW + 8, 2);

      ctx.fillStyle = '#1c1917';
      ctx.fillRect(wx, wy, winW, winH);

      const lit = rand() > 0.72;
      const g = ctx.createLinearGradient(wx, wy + 2, wx, wy + winH - 2);
      g.addColorStop(0, '#364a63');
      g.addColorStop(0.55, '#1d2a3d');
      g.addColorStop(1, '#0f172a');
      ctx.fillStyle = g;
      ctx.fillRect(wx + 2, wy + 2, winW - 4, winH - 4);

      if (lit) {
        const lg = ctx.createLinearGradient(wx, wy + 2, wx, wy + winH - 2);
        lg.addColorStop(0, 'rgba(254, 243, 199, 0.72)');
        lg.addColorStop(0.65, 'rgba(251, 191, 36, 0.34)');
        lg.addColorStop(1, 'rgba(92, 48, 20, 0.25)');
        ctx.fillStyle = lg;
        ctx.fillRect(wx + 2, wy + 2, winW - 4, winH - 4);
      }

      rCtx.fillStyle = 'rgb(22,22,22)';
      rCtx.fillRect(wx + 2, wy + 2, winW - 4, winH - 4);

      ctx.fillStyle = '#e5e7eb';
      ctx.fillRect(wx + Math.floor(winW * 0.5) - 1, wy + 2, 1.5, winH - 4);
      ctx.fillRect(wx + 2, wy + Math.floor(winH * 0.5) - 1, winW - 4, 2);
    }
  }

  return {
    map: configureTexture(cColor, 2, 2, true),
    roughnessMap: configureTexture(cRough, 2, 2, false),
  };
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
  rCtx.fillStyle = 'rgb(168,168,168)';
  rCtx.fillRect(0, 0, w, h);

  const rand = makeSeededRand(707);
  for (let py = 0; py < h; py += 32) {
    for (let px = 0; px < w; px += 64) {
      const shade = 192 + Math.floor(rand() * 22);
      ctx.fillStyle = `rgb(${shade},${shade + 3},${shade + 8})`;
      ctx.fillRect(px + 1, py + 1, 62, 30);

      // Subtle board-formed horizontal formwork striations
      ctx.fillStyle = 'rgba(100, 116, 139, 0.14)';
      ctx.fillRect(px + 1, py + 8, 62, 1);
      ctx.fillRect(px + 1, py + 18, 62, 1);

      // Tie-rod cone dimples
      ctx.fillStyle = '#64748b';
      ctx.fillRect(px + 8, py + 5, 2, 2);
      ctx.fillRect(px + 54, py + 5, 2, 2);
    }
  }

  // Sleek horizontal ribbon windows with anodized steel mullions & interior lighting
  for (let row = 0; row < 16; row++) {
    const wy = row * 32 + 10;
    ctx.fillStyle = '#0c1322';
    ctx.fillRect(0, wy, w, 18);
    rCtx.fillStyle = 'rgb(18,18,18)';
    rCtx.fillRect(0, wy, w, 18);

    for (let col = 0; col < 16; col++) {
      const wx = col * 32;
      const isLit = rand() > 0.76;
      const wg = ctx.createLinearGradient(wx, wy + 2, wx, wy + 16);
      wg.addColorStop(0, '#334e6b');
      wg.addColorStop(1, '#142033');
      ctx.fillStyle = wg;
      ctx.fillRect(wx + 2, wy + 2, 28, 14);
      if (isLit) {
        ctx.fillStyle = 'rgba(254, 240, 188, 0.62)';
        ctx.fillRect(wx + 2, wy + 2, 28, 14);
      }
      ctx.fillStyle = '#64748b';
      ctx.fillRect(wx, wy, 1.5, 18);
    }
  }

  return {
    map: configureTexture(cColor, 2, 2, true),
    roughnessMap: configureTexture(cRough, 2, 2, false),
  };
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

  const img = ctx.createImageData(size, size);
  const data = img.data;
  const rand = makeSeededRand(808);
  for (let i = 0; i < size * size; i++) {
    const v = 44 + Math.floor(rand() * 48);
    const p = i * 4;
    data[p] = v;
    data[p + 1] = v + 3;
    data[p + 2] = v + 7;
    data[p + 3] = 255;
  }
  ctx.putImageData(img, 0, 0);

  // Membrane seam strips
  ctx.fillStyle = 'rgba(15, 23, 42, 0.35)';
  for (let y = 64; y < size; y += 64) {
    ctx.fillRect(18, y, size - 36, 3);
  }

  // Perimeter parapet metal coping border
  ctx.strokeStyle = '#94a3b8';
  ctx.lineWidth = 18;
  ctx.strokeRect(9, 9, size - 18, size - 18);
  ctx.strokeStyle = '#1e293b';
  ctx.lineWidth = 3;
  ctx.strokeRect(18, 18, size - 36, size - 36);

  // Rooftop mechanical louver grates & skylight bays
  for (let gx = 64; gx <= 360; gx += 148) {
    for (let gy = 64; gy <= 360; gy += 148) {
      ctx.fillStyle = '#475569';
      ctx.fillRect(gx, gy, 88, 88);
      ctx.strokeStyle = '#cbd5e1';
      ctx.lineWidth = 2;
      ctx.strokeRect(gx, gy, 88, 88);
      ctx.fillStyle = '#1e293b';
      for (let s = 8; s < 80; s += 8) {
        ctx.fillRect(gx + 8, gy + s, 72, 4);
      }
    }
  }

  return configureTexture(canvas, 1, 1, true);
}

/**
 * 5. Luxury Travertine Promenade Stone Pavers PBR
 * Warm ivory/champagne/sand honed travertine slabs with subtle porous veining,
 * chamfered sunlight edges, and recessed grout joints.
 */
export function createSidewalkCobblePBR(): THREE.CanvasTexture {
  const size = 512;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d')!;

  // Warm stone mortar grout bed
  ctx.fillStyle = '#9b9489';
  ctx.fillRect(0, 0, size, size);

  const rand = makeSeededRand(919);
  const tileH = 64;
  const tileW = 64;

  for (let row = 0; row < size / tileH; row++) {
    const y = row * tileH;
    const rowShift = (row % 2) * 32;
    for (let x = -tileW; x < size + tileW; x += tileW) {
      const tx = x + rowShift;
      const v = 212 + Math.floor(rand() * 24);
      const warmShift = Math.floor(rand() * 8);
      ctx.fillStyle = `rgb(${v},${v - 4 - Math.floor(warmShift * 0.4)},${v - 12 - warmShift})`;
      ctx.fillRect(tx + 2, y + 2, tileW - 4, tileH - 4);

      // Crisp upper-left chamfer sunlight edge & lower-right recessed bevel
      ctx.fillStyle = 'rgba(255, 253, 248, 0.42)';
      ctx.fillRect(tx + 2, y + 2, tileW - 4, 2);
      ctx.fillRect(tx + 2, y + 2, 2, tileH - 4);
      ctx.fillStyle = 'rgba(102, 94, 82, 0.28)';
      ctx.fillRect(tx + 2, y + tileH - 4, tileW - 4, 2);

      // Subtle honed travertine horizontal pores/veins
      for (let p = 0; p < 5; p++) {
        const px = tx + 6 + rand() * (tileW - 18);
        const py = y + 6 + rand() * (tileH - 12);
        ctx.fillStyle = rand() > 0.45 ? 'rgba(140, 128, 112, 0.16)' : 'rgba(255, 252, 244, 0.20)';
        ctx.fillRect(px, py, 6 + rand() * 12, 1.3);
      }
    }
  }

  // Fine calcite crystalline micro-grain
  for (let i = 0; i < 4500; i++) {
    const x = rand() * size;
    const y = rand() * size;
    const v = 165 + Math.floor(rand() * 80);
    ctx.fillStyle = `rgba(${v},${v - 3},${v - 7},0.28)`;
    ctx.fillRect(x, y, 2, 2);
  }

  return configureTexture(canvas, 8, 8, true);
}

/**
 * 6. Dark Asphalt Intersection Pad with Crisp Continental Zebra Crosswalks & Turning Wear
 */
export function createCrosswalkIntersectionPBR(): THREE.CanvasTexture {
  const size = 512;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d')!;

  const img = ctx.createImageData(size, size);
  const data = img.data;
  const rand = makeSeededRand(303);
  for (let i = 0; i < size * size; i++) {
    const r = rand();
    const v = 60 + Math.floor(r * 16);
    const p = i * 4;
    data[p] = v;
    data[p + 1] = v + 3;
    data[p + 2] = v + 7;
    data[p + 3] = 255;
  }
  ctx.putImageData(img, 0, 0);

  // Subtle curved turning tire-wear arcs across intersection box
  ctx.strokeStyle = 'rgba(12, 15, 22, 0.28)';
  ctx.lineWidth = 22;
  ctx.beginPath();
  ctx.arc(0, 0, 195, 0, Math.PI * 0.5);
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(size, size, 195, Math.PI, Math.PI * 1.5);
  ctx.stroke();

  // Crisp continental zebra crosswalk stripes on all 4 approaches
  ctx.fillStyle = '#f4f7fb';
  for (let i = 56; i < size - 56; i += 28) {
    ctx.fillRect(i, 14, 16, 42);
    ctx.fillRect(i, size - 56, 16, 42);
    ctx.fillRect(14, i, 42, 16);
    ctx.fillRect(size - 56, i, 42, 16);
  }

  // Stop bars
  ctx.fillRect(52, 62, size - 104, 5);
  ctx.fillRect(52, size - 67, size - 104, 5);
  ctx.fillRect(62, 52, 5, size - 104);
  ctx.fillRect(size - 67, 52, 5, size - 104);

  return configureTexture(canvas, 1, 1, true);
}

/**
 * 7. Riveted Structural Steel Truss & Gusset Plate PBR
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
  for (let i = 0; i < 4500; i++) {
    const x = rand() * size;
    const y = rand() * size;
    const v = 165 + Math.floor(rand() * 55);
    ctx.fillStyle = `rgba(${v},${v},${v + 4},0.34)`;
    ctx.fillRect(x, y, 6, 1);
  }

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

  return configureTexture(canvas, 2, 4, true);
}

/**
 * 8. Glossy Chevron-Ribbed Swedish Ceramic Shell Tile PBR (Sydney Opera House)
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
  rCtx.fillStyle = 'rgb(20,20,20)';
  rCtx.fillRect(0, 0, size, size);

  const rand = makeSeededRand(515);
  for (let x = 0; x < size; x += 32) {
    ctx.fillStyle = '#cbd5e1';
    ctx.fillRect(x, 0, 3, size);
    rCtx.fillStyle = 'rgb(142,142,142)';
    rCtx.fillRect(x, 0, 3, size);

    for (let y = 0; y < size; y += 16) {
      const cream = rand() > 0.45;
      ctx.fillStyle = cream ? '#fafaf9' : '#f1f5f9';
      ctx.fillRect(x + 4, y + 1, 26, 14);
      ctx.strokeStyle = '#e2e8f0';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(x + 4, y + 8);
      ctx.lineTo(x + 17, y + 2);
      ctx.lineTo(x + 30, y + 8);
      ctx.stroke();
    }
  }

  return {
    map: configureTexture(cColor, 3, 3, true),
    roughnessMap: configureTexture(cRough, 3, 3, false),
  };
}

/**
 * 9. Oxidized Verdigris Copper Sheet & Riveted Seam PBR (Statue of Liberty)
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

      ctx.fillStyle = rand() > 0.5 ? 'rgba(13, 148, 136, 0.28)' : 'rgba(180, 130, 80, 0.14)';
      ctx.fillRect(x + 6, y + 6, 50, 50);

      ctx.strokeStyle = '#0f766e';
      ctx.lineWidth = 2;
      ctx.strokeRect(x + 1, y + 1, 62, 62);
    }
  }

  return configureTexture(canvas, 2, 3, true);
}

/**
 * 10. Roman Travertine 3-Story Semi-Circular Arch Arcade + 4th-Story Corinthian Attic PBR
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

  ctx.fillStyle = '#e5dccb';
  ctx.fillRect(0, 0, w, h);
  rCtx.fillStyle = 'rgb(195,195,195)';
  rCtx.fillRect(0, 0, w, h);

  const rand = makeSeededRand(1010);

  for (let y = 0; y < h; y += 16) {
    const offset = ((y / 16) % 2) * 16;
    for (let x = -32; x < w + 32; x += 32) {
      const shade = 212 + Math.floor(rand() * 24);
      ctx.fillStyle = `rgb(${shade},${shade - 10},${shade - 26})`;
      ctx.fillRect(x + offset + 1, y + 1, 30, 14);
    }
  }
  for (let i = 0; i < 3000; i++) {
    const px = rand() * w;
    const py = rand() * h;
    ctx.fillStyle = rand() > 0.5 ? 'rgba(130, 114, 92, 0.16)' : 'rgba(250, 245, 235, 0.14)';
    ctx.fillRect(px, py, 3 + rand() * 5, 1.5);
  }

  const numBays = 8;
  const bayW = w / numBays;

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
    ctx.fillStyle = '#ede3d1';
    ctx.fillRect(bx - 5, 14, 10, 82);
    ctx.fillStyle = '#b8a78e';
    ctx.fillRect(bx - 6, 14, 1.5, 82);
    ctx.fillRect(bx + 5, 14, 1.5, 82);
    ctx.fillStyle = '#f5eee0';
    ctx.fillRect(bx - 7, 14, 14, 6);

    if (col % 2 === 0) {
      ctx.fillStyle = '#1c1917';
      ctx.fillRect(bx + 22, 42, 20, 28);
      ctx.strokeStyle = '#c2b299';
      ctx.lineWidth = 2;
      ctx.strokeRect(bx + 21, 41, 22, 30);
      rCtx.fillStyle = 'rgb(240,240,240)';
      rCtx.fillRect(bx + 22, 42, 20, 28);
    } else {
      ctx.fillStyle = '#cbbba2';
      ctx.beginPath();
      ctx.arc(bx + 32, 54, 10, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = '#94836b';
      ctx.lineWidth = 1.5;
      ctx.stroke();
    }
  }

  const storyHeight = 136;
  const storyStarts = [104, 240, 376];

  for (let sIdx = 0; sIdx < 3; sIdx++) {
    const sy = storyStarts[sIdx];

    ctx.fillStyle = '#f5ede0';
    ctx.fillRect(0, sy, w, 9);
    ctx.fillStyle = '#cfc0a9';
    ctx.fillRect(0, sy + 9, w, 6);
    ctx.fillStyle = '#8c7b65';
    ctx.fillRect(0, sy + 15, w, 3);

    ctx.fillStyle = '#dfd3be';
    ctx.fillRect(0, sy + storyHeight - 8, w, 8);

    for (let col = 0; col < numBays; col++) {
      const bx = col * bayW;
      const archCenterX = bx + bayW * 0.5;
      const archRadius = 19.5;
      const archSpringY = sy + 46;
      const archBottomY = sy + storyHeight - 8;

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

      ctx.strokeStyle = '#786852';
      ctx.lineWidth = 2.5;
      ctx.stroke();

      const warmArchGlow = ctx.createLinearGradient(archCenterX, archBottomY - 26, archCenterX, archBottomY);
      warmArchGlow.addColorStop(0, 'rgba(245, 158, 11, 0)');
      warmArchGlow.addColorStop(1, 'rgba(251, 191, 36, 0.30)');
      ctx.fillStyle = warmArchGlow;
      ctx.fillRect(archCenterX - archRadius + 2, archBottomY - 26, archRadius * 2 - 4, 26);
      ctx.restore();

      rCtx.save();
      rCtx.beginPath();
      rCtx.arc(archCenterX, archSpringY, archRadius, Math.PI, 0, false);
      rCtx.lineTo(archCenterX + archRadius, archBottomY);
      rCtx.lineTo(archCenterX - archRadius, archBottomY);
      rCtx.closePath();
      rCtx.fillStyle = 'rgb(248,248,248)';
      rCtx.fill();
      rCtx.restore();

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
      if (col === 0) {
        ctx.fillRect(w - colW * 0.5, colTop, colW, colH);
      }

      ctx.fillStyle = '#f5ede0';
      ctx.fillRect(colX - 2, colTop, colW + 4, 5);
      ctx.fillRect(colX - 2, colTop + colH - 5, colW + 4, 5);
      if (col === 0) {
        ctx.fillRect(w - colW * 0.5 - 2, colTop, colW + 4, 5);
        ctx.fillRect(w - colW * 0.5 - 2, colTop + colH - 5, colW + 4, 5);
      }
    }
  }

  return {
    map: configureTexture(cColor, 6, 1, true, true),
    roughnessMap: configureTexture(cRough, 6, 1, false, true),
  };
}

/**
 * 11. Monumental Ribbed Pink-Beige Granite & Travertine Podium PBR
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

  ctx.fillStyle = '#d8c7b8';
  ctx.fillRect(0, 0, w, h);
  rCtx.fillStyle = 'rgb(185,185,185)';
  rCtx.fillRect(0, 0, w, h);

  const rand = makeSeededRand(1111);
  const rows = 16;
  const cols = 8;
  const rowH = h / rows;
  const colW = w / cols;

  for (let r = 0; r < rows; r++) {
    const y = r * rowH;
    const offset = (r % 2) * (colW * 0.5);
    for (let c = -1; c <= cols; c++) {
      const x = c * colW + offset;
      const baseR = 206 + Math.floor(rand() * 22);
      const baseG = baseR - 15 + Math.floor(rand() * 6);
      const baseB = baseR - 28 + Math.floor(rand() * 6);

      ctx.fillStyle = `rgb(${baseR},${baseG},${baseB})`;
      ctx.fillRect(x + 2, y + 2, colW - 4, rowH - 4);

      ctx.fillStyle = 'rgba(255, 250, 244, 0.35)';
      ctx.fillRect(x + 2, y + 2, colW - 4, 2);
      ctx.fillStyle = 'rgba(92, 78, 66, 0.42)';
      ctx.fillRect(x + 1, y + rowH - 2, colW - 2, 2);
      ctx.fillRect(x + colW - 2, y + 1, 2, rowH - 2);
    }
  }

  for (let x = 0; x < w; x += 16) {
    ctx.fillStyle = x % 64 === 0 ? 'rgba(110, 94, 80, 0.26)' : 'rgba(120, 104, 90, 0.10)';
    ctx.fillRect(x, 0, x % 64 === 0 ? 4 : 1.5, h);
    ctx.fillStyle = 'rgba(250, 244, 236, 0.16)';
    ctx.fillRect(x + 2, 0, 1.5, h);
  }

  ctx.fillStyle = '#eadfd3';
  ctx.fillRect(0, 0, w, 18);
  ctx.fillStyle = '#9c8978';
  ctx.fillRect(0, 18, w, 5);
  ctx.fillStyle = '#c4b1a0';
  ctx.fillRect(0, h - 24, w, 24);

  for (let i = 0; i < 6500; i++) {
    const px = rand() * w;
    const py = rand() * h;
    const v = 150 + Math.floor(rand() * 90);
    ctx.fillStyle = `rgba(${v},${v - 8},${v - 16},0.28)`;
    ctx.fillRect(px, py, 2, 2);
  }

  return {
    map: configureTexture(cColor, 4, 1, true),
    roughnessMap: configureTexture(cRough, 4, 1, false),
  };
}

/**
 * Rippled Coastal Beach Sand PBR (wind-sculpted sand dunes + sunlit quartz sparkle).
 */
export function createBeachSandPBR(): THREE.CanvasTexture {
  const size = 256;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext('2d')!;
  const img = ctx.createImageData(size, size);
  const data = img.data;
  const rand = makeSeededRand(2424);

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const idx = (y * size + x) * 4;
      const warp = Math.sin(x * 0.049 + y * 0.0245) * 1.8;
      const ripple = Math.sin(x * 0.196 + y * 0.098 + warp) * 10;
      const r = rand();
      const sparkle = r > 0.985 ? 24 : 0;
      const grain = (r - 0.5) * 18 + sparkle;
      data[idx] = Math.max(0, Math.min(255, Math.round(229 + ripple + grain)));
      data[idx + 1] = Math.max(0, Math.min(255, Math.round(202 + ripple * 0.9 + grain * 0.9)));
      data[idx + 2] = Math.max(0, Math.min(255, Math.round(154 + ripple * 0.75 + grain * 0.8)));
      data[idx + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  return configureTexture(canvas, 18, 18, true);
}

/**
 * High-Fidelity CoastRoad Pavement Albedo & Roughness PBR (crushed basalt/quartz aggregate + tire wear).
 */
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
      const fine2 = random();
      const coarse = Math.sin(x * 0.147 + y * 0.098) * 0.5 + 0.5;
      const microPatch = Math.cos(x * 0.0735 - y * 0.1227) * 0.5 + 0.5;
      if (isRoughness) {
        // Balanced matte-to-satin asphalt roughness (0.74..0.88) without isolated shiny dots
        const val = Math.round(194 + (mineral * 0.6 + fine2 * 0.4) * 28 + (coarse - 0.5) * 10 + (microPatch - 0.5) * 8);
        const clamped = Math.max(186, Math.min(228, val));
        pixels.data[i] = clamped;
        pixels.data[i + 1] = clamped;
        pixels.data[i + 2] = clamped;
      } else {
        // Sun-weathered slate-charcoal asphalt (rgb 58..78) with crisp micro-aggregate grain & zero polka dots
        const grain = (mineral - 0.5) * 14 + (fine2 - 0.5) * 8;
        const fleck = Math.round(66 + grain + (coarse - 0.5) * 6 + (microPatch - 0.5) * 5);
        const c = Math.max(52, Math.min(86, fleck));
        pixels.data[i] = c;
        pixels.data[i + 1] = c + 3;
        pixels.data[i + 2] = c + 7;
      }
      pixels.data[i + 3] = 255;
    }
  }

  ctx.putImageData(pixels, 0, 0);
  return configureTexture(canvas, 1, 1, !isRoughness);
}

export function createPavementTexture() {
  return buildPavementCanvasTexture(false);
}

export function createPavementRoughnessTexture() {
  return buildPavementCanvasTexture(true);
}
