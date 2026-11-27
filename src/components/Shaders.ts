import { COASTAL_ATOLLS } from '../game/worldMath';

export const skyVertexShader = /* glsl */ `
  varying vec3 vWorldPos;
  void main() {
    vec4 wp = modelMatrix * vec4(position, 1.0);
    vWorldPos = position;
    gl_Position = projectionMatrix * viewMatrix * wp;
  }
`;

export const skyFragmentShader = /* glsl */ `
  uniform float uTime;
  uniform vec3 uZenith;
  uniform vec3 uHorizon;
  uniform vec3 uSunColor;
  uniform vec3 uSunDir;
  uniform float uMoonVis;
  uniform float uStarIntensity;
  uniform float uSunsetWarmth;
  varying vec3 vWorldPos;

  float hash(vec2 p) {
    return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123);
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

  float fbmClouds(vec2 p) {
    float v = 0.0;
    float a = 0.52;
    mat2 rot = mat2(0.80, 0.60, -0.60, 0.80);
    for (int i = 0; i < 4; i++) {
      v += a * noise(p);
      p = rot * p * 2.06 + vec2(11.3, 27.9);
      a *= 0.48;
    }
    return v;
  }

  float starLayer(vec2 uv, float scale, float threshold, float timeSeed, out vec3 starTint) {
    vec2 p = uv * scale;
    vec2 id = floor(p);
    vec2 f = fract(p) - 0.5;
    float rnd = hash(id + timeSeed);
    starTint = mix(vec3(0.74, 0.88, 1.0), vec3(1.0, 0.91, 0.78), fract(rnd * 73.13));
    if (rnd < threshold) return 0.0;
    vec2 off = (vec2(hash(id + 13.7 + timeSeed), hash(id + 29.1 + timeSeed)) - 0.5) * 0.62;
    float d = length(f - off);
    float size = mix(0.052, 0.118, (rnd - threshold) / (1.0 - threshold));
    float pinpoint = 1.0 - smoothstep(size * 0.16, size, d);
    float twinkle = 0.62 + 0.38 * sin(uTime * (1.8 + rnd * 3.9) + rnd * 62.8318);
    float mag = mix(0.35, 1.45, pow((rnd - threshold) / (1.0 - threshold), 1.35));
    return pinpoint * twinkle * mag;
  }

  void main() {
    vec3 dir = normalize(vWorldPos);
    float h = clamp(dir.y, 0.0, 1.0);

    vec3 sunN = normalize(uSunDir);
    float sunDot = max(dot(dir, sunN), 0.0);
    vec3 flatDir = normalize(vec3(dir.x, 0.0, dir.z) + vec3(1e-5, 0.0, 0.0));
    vec3 flatSun = normalize(vec3(sunN.x, 0.0, sunN.z) + vec3(1e-5, 0.0, 0.0));
    float sunAzimuth = max(dot(flatDir, flatSun), 0.0);
    float dayMask = 1.0 - smoothstep(0.28, 0.92, uMoonVis);

    // Physically inspired Rayleigh zenith-to-horizon scatter with subtle azure/golden mid-band
    vec3 midSky = mix(uHorizon, uZenith, 0.46);
    midSky += vec3(0.11, 0.032, 0.072) * uSunsetWarmth;
    midSky += vec3(0.015, 0.045, 0.065) * dayMask * (1.0 - uSunsetWarmth);
    vec3 col = mix(uHorizon, midSky, smoothstep(0.0, 0.23, h));
    col = mix(col, uZenith, pow(smoothstep(0.09, 1.0, h), 0.70));

    // Atmospheric horizon Mie scattering & golden-coral belt (stays seamlessly synced with ocean/terrain horizon)
    vec3 warmScatter = mix(uSunColor, vec3(1.0, 0.44, 0.16), uSunsetWarmth)
                     * (0.035 + 0.16 * pow(sunAzimuth, 2.0) + 0.28 * uSunsetWarmth * pow(sunAzimuth, 1.45))
                     * dayMask;
    float horizonGlow = pow(1.0 - h, 4.2);
    col += warmScatter * horizonGlow;

    // Rose-magenta twilight belt & anti-solar Belt of Venus glow during golden hour
    float twilightArch = smoothstep(0.0, 0.19, h) * exp(-h * 4.9);
    col += vec3(0.74, 0.19, 0.27) * twilightArch * 0.28 * uSunsetWarmth * (0.42 + 0.58 * sunAzimuth);
    float antiSolar = max(dot(flatDir, -flatSun), 0.0);
    col += vec3(0.22, 0.14, 0.34) * pow(antiSolar, 2.2) * twilightArch * 0.22 * uSunsetWarmth;

    // Multi-lobe Solar Mie Corona + Crisp Radiant Sun Disc
    float sunAbove = smoothstep(-0.05, 0.06, sunN.y);
    float sunDiscMask = sunAbove * (1.0 - smoothstep(0.08, 0.58, uMoonVis));
    float sunMieMask = sunAbove * (1.0 - smoothstep(0.25, 0.88, uMoonVis));
    col += mix(uSunColor, vec3(1.0, 0.62, 0.24), uSunsetWarmth * 0.68) * pow(sunDot, 4.5) * 0.24 * sunMieMask;
    col += mix(uSunColor, vec3(1.0, 0.74, 0.38), 0.48) * pow(sunDot, 28.0) * 0.50 * sunDiscMask;
    col += mix(uSunColor, vec3(1.0, 0.90, 0.70), 0.52) * pow(sunDot, 150.0) * 1.05 * sunDiscMask;
    col += mix(uSunColor, vec3(1.0, 0.98, 0.92), 0.68) * smoothstep(0.9974, 0.9994, sunDot) * 2.65 * sunDiscMask;

    // Photorealistic Full Moon + Atmospheric Lunar Halo
    vec3 moonDir = normalize(vec3(-0.955, 0.23, -0.19));
    float moonDot = max(dot(dir, moonDir), 0.0);
    float moonDisc = 0.0;
    if (uMoonVis > 0.005) {
      col += vec3(0.16, 0.38, 0.76) * pow(moonDot, 14.0) * 0.42 * uMoonVis;
      col += vec3(0.62, 0.80, 1.0) * pow(moonDot, 130.0) * 1.02 * uMoonVis;

      moonDisc = smoothstep(0.9940, 0.9968, moonDot);
      if (moonDisc > 0.001) {
        vec3 moonRight = normalize(cross(vec3(0.0, 1.0, 0.0), moonDir));
        vec3 moonUp = cross(moonDir, moonRight);
        vec2 moonUv = vec2(dot(dir, moonRight), dot(dir, moonUp)) / 0.095;
        float r2 = dot(moonUv, moonUv);
        float limb = sqrt(max(0.0, 1.0 - min(r2, 1.0)));
        float mare = noise(moonUv * 3.1 + vec2(1.4, 2.7)) * 0.62 + noise(moonUv * 7.2 + vec2(5.1, 0.9)) * 0.38;
        float crater = noise(moonUv * 17.5 + vec2(3.2, 7.1));
        float lunarDetail = mix(0.66, 1.08, smoothstep(0.30, 0.72, mare)) * (0.92 + 0.12 * crater);
        vec3 moonCol = vec3(0.92, 0.95, 1.0) * lunarDetail * mix(0.76, 1.42, limb);
        col = mix(col, moonCol, moonDisc * uMoonVis);
      }
    }

    // Crisp Twinkling Dual-Layer Starfield (cube-projected to avoid zenith pinching)
    if (uStarIntensity > 0.005 && dir.y > 0.03) {
      vec3 ad = abs(dir);
      vec2 starProj = ad.y > max(ad.x, ad.z)
        ? dir.xz / ad.y
        : (ad.x > ad.z ? dir.zy / ad.x : dir.xy / ad.z);
      vec3 tintA;
      vec3 tintB;
      float sA = starLayer(starProj, 92.0, 0.946, 0.0, tintA);
      float sB = starLayer(starProj + vec2(0.37, 0.61), 156.0, 0.954, 71.3, tintB);
      float elevMask = smoothstep(0.03, 0.24, dir.y);
      float sunGlareMask = 1.0 - clamp(pow(sunDot, 4.0) * 1.6 * sunDiscMask, 0.0, 1.0);
      float moonMask = 1.0 - moonDisc * uMoonVis;
      vec3 starCol = (tintA * sA + tintB * sB * 0.85) * uStarIntensity * elevMask * sunGlareMask * moonMask;
      col += starCol;
    }

    // High-Altitude Wind-Swept Cirrus Cloud Wisps
    if (dir.y > 0.05) {
      vec2 cirrusUv = dir.xz / (dir.y + 0.23) * vec2(0.82, 2.55) + vec2(uTime * 0.0042, uTime * 0.0017);
      float warp = noise(cirrusUv * 1.55) * 0.92;
      float wisp = noise(cirrusUv * 2.7 + vec2(warp, -warp * 0.5)) * 0.56
                 + noise(cirrusUv * 6.2 + vec2(-warp * 0.42, warp)) * 0.30
                 + noise(cirrusUv * 13.4) * 0.14;
      float cirrusAlpha = smoothstep(0.56, 0.82, wisp)
                        * smoothstep(0.05, 0.24, dir.y)
                        * (1.0 - smoothstep(0.72, 0.98, dir.y));
      vec3 cirrusDay = mix(
        vec3(0.86, 0.91, 0.97),
        vec3(1.0, 0.62, 0.32),
        uSunsetWarmth * (0.38 + 0.62 * pow(sunDot, 1.8))
      );
      vec3 cirrusNight = mix(uHorizon * 1.48, vec3(0.48, 0.64, 0.92), pow(moonDot, 3.0) * 0.78);
      vec3 cirrusCol = mix(cirrusDay, cirrusNight, smoothstep(0.15, 0.85, uMoonVis));
      cirrusCol = mix(cirrusCol, uHorizon + warmScatter, pow(1.0 - h, 3.0) * 0.42);
      col = mix(col, cirrusCol, cirrusAlpha * mix(0.40, 0.26, uMoonVis));
    }

    // Sculpted Multi-Octave Cumulus Cloud Banks with Self-Shadowing & Silver-Lining Forward Scatter
    if (dir.y > 0.025) {
      vec2 uv = dir.xz / (dir.y + 0.175) * 1.24 + vec2(uTime * 0.0072, uTime * 0.0036);
      vec2 drift = vec2(noise(uv * 2.0), noise(uv * 1.7 + 8.5)) * 0.62;
      vec2 cloudUv = uv + drift;
      float c = fbmClouds(cloudUv * 1.68);
      float cDetail = noise(cloudUv * 15.8) * 0.08;
      float density = c + cDetail;

      float cloudAlpha = smoothstep(0.51, 0.73, density)
                       * smoothstep(0.03, 0.19, dir.y)
                       * (1.0 - smoothstep(0.54, 0.92, dir.y));

      // Directional self-shadow sample toward sun & moon for volumetric billow lighting
      float sunSample = fbmClouds((cloudUv + sunN.xz * 0.092) * 1.68);
      float lightEdge = smoothstep(-0.045, 0.18, c - sunSample * 0.85);
      float topLit = smoothstep(0.48, 0.78, density) * 0.35 + lightEdge * 0.65;

      float moonSample = fbmClouds((cloudUv + moonDir.xz * 0.092) * 1.68);
      float moonLightEdge = smoothstep(-0.045, 0.18, c - moonSample * 0.85);

      vec3 cloudShadowDay = mix(
        mix(uZenith, uHorizon, 0.54) * 0.84,
        vec3(0.30, 0.15, 0.32),
        uSunsetWarmth * 0.72
      );
      vec3 cloudLitDay = mix(
        vec3(0.99, 0.985, 0.965),
        vec3(1.0, 0.58, 0.22),
        uSunsetWarmth * (0.56 + 0.44 * pow(sunDot, 1.8))
      );
      vec3 cloudDay = mix(cloudShadowDay, cloudLitDay, topLit);

      vec3 cloudShadowNight = uZenith * 0.62;
      vec3 cloudLitNight = mix(uHorizon * 1.22, vec3(0.60, 0.79, 1.0), 0.36 + 0.64 * pow(moonDot, 4.0));
      vec3 cloudNight = mix(cloudShadowNight, cloudLitNight, mix(0.14, 1.0, moonLightEdge) * (0.35 + 0.65 * pow(moonDot, 2.2)));

      // Powder-effect rim & golden Mie silver-lining around sun
      float rimScatter = pow(sunDot, 8.0) * smoothstep(0.42, 0.70, density) * (1.0 - smoothstep(0.70, 0.86, density));
      vec3 cloudCol = mix(cloudDay, cloudNight, smoothstep(0.12, 0.82, uMoonVis));
      cloudCol += mix(uSunColor, vec3(1.0, 0.58, 0.24), uSunsetWarmth) * rimScatter * 0.78 * (1.0 - uMoonVis);
      cloudCol = mix(cloudCol, uHorizon + warmScatter, (1.0 - smoothstep(0.03, 0.21, dir.y)) * 0.56);
      col = mix(col, cloudCol, cloudAlpha * mix(0.74, 0.46, uMoonVis));

      // Subtle atmospheric crepuscular sunbeams streaming through cloud gaps
      float rayAngle = atan(dir.y - sunN.y, dot(dir.xz - sunN.xz, vec2(0.707, 0.707)));
      float rayBands = 0.5 + 0.5 * sin(rayAngle * 15.0 + uTime * 0.22);
      float godRay = pow(sunDot, 4.2) * (1.0 - cloudAlpha * 0.82) * rayBands * smoothstep(0.02, 0.44, dir.y);
      col += mix(uSunColor, vec3(1.0, 0.64, 0.28), uSunsetWarmth) * godRay * 0.095 * sunMieMask;
    }

    // Nocturnal Milky Way Galactic Band
    if (uStarIntensity > 0.15 && dir.y > 0.06) {
      float galaxyPlane = abs(dot(dir, normalize(vec3(0.42, 0.68, -0.59))));
      float galaxyBand = exp(-pow(galaxyPlane / 0.22, 2.0));
      float dustNoise = noise(dir.xz * 4.2 + vec2(1.7, 3.1)) * 0.65 + noise(dir.xz * 11.5) * 0.35;
      vec3 nebulaTint = mix(vec3(0.12, 0.25, 0.56), vec3(0.44, 0.20, 0.58), dustNoise);
      col += nebulaTint * galaxyBand * smoothstep(0.28, 0.78, dustNoise) * uStarIntensity * 0.20 * smoothstep(0.06, 0.32, dir.y);
    }

    gl_FragColor = vec4(col, 1.0);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }
`;

export const waterVertexShader = /* glsl */ `
  uniform float uTime;
  varying vec3 vWorldPos;
  varying vec3 vNormal;
  varying float vCrest;
  varying float vFoamCrest;

  void main() {
    vec4 wp = modelMatrix * vec4(position, 1.0);
    vec2 p = wp.xz;
    float distOrigin = length(p);
    float swellAtten = 1.0 - smoothstep(520.0, 2200.0, distOrigin);
    // Attenuate higher-frequency vertex slopes smoothly at distance to eliminate horizon Moire banding
    float chopAtten = 1.0 - smoothstep(260.0, 920.0, distOrigin);

    // Gentle organic domain warp so ocean swells never form rigid parallel ruler stripes
    float warpA = sin(p.y * 0.021 - p.x * 0.015 + uTime * 0.25) * 1.15;
    float warpB = cos(p.x * 0.019 + p.y * 0.026 - uTime * 0.22) * 1.05;

    // Multi-directional Gerstner / Trochoidal Ocean Swells
    float phaseA = 0.095 * (0.86 * p.x + 0.51 * p.y) + warpA + 1.22 * uTime;
    float phaseB = 0.165 * (-0.58 * p.x + 0.81 * p.y) + warpB + 1.68 * uTime;
    float phaseC = 0.29 * (0.34 * p.x - 0.94 * p.y) - warpA * 0.7 + 2.15 * uTime;
    float phaseD = 0.52 * (0.91 * p.x + 0.41 * p.y) + warpB * 0.6 + 2.85 * uTime;
    float phaseE = 0.88 * (-0.72 * p.x - 0.69 * p.y) + 3.45 * uTime;

    float sinA = sin(phaseA), cosA = cos(phaseA);
    float sinB = sin(phaseB), cosB = cos(phaseB);
    float sinC = sin(phaseC), cosC = cos(phaseC);
    float sinD = sin(phaseD), cosD = cos(phaseD);
    float sinE = sin(phaseE), cosE = cos(phaseE);

    // Trochoidal horizontal crest pinching
    wp.x -= (0.14 * cosA - 0.06 * cosB + 0.03 * cosC) * swellAtten;
    wp.z -= (0.08 * cosA + 0.07 * cosB - 0.04 * cosC) * swellAtten;

    vCrest = (0.36 * sinA + 0.22 * sinB + 0.13 * sinC * chopAtten + 0.06 * sinD * chopAtten + 0.028 * sinE * chopAtten) * swellAtten;
    wp.y += vCrest;

    vec2 slope = (
      vec2(0.029, 0.017) * cosA +
      vec2(-0.021, 0.029) * cosB +
      vec2(0.012, -0.034) * cosC * chopAtten +
      vec2(0.024, 0.011) * cosD * chopAtten +
      vec2(-0.014, -0.014) * cosE * chopAtten
    ) * swellAtten;

    vFoamCrest = clamp((0.32 * sinA + 0.28 * sinB + 0.24 * sinC + 0.18 * sinD) * chopAtten, 0.0, 1.0);
    vNormal = normalize(vec3(-slope.x, 1.0, -slope.y));
    vWorldPos = wp.xyz;
    gl_Position = projectionMatrix * viewMatrix * wp;
  }
`;

export const waterFragmentShader = /* glsl */ `
  uniform float uTime;
  uniform vec3 uShallow;
  uniform vec3 uDeep;
  uniform vec3 uFoam;
  uniform vec3 uSunDir;
  uniform vec3 uSunColor;
  uniform vec3 uHorizonCol;
  uniform vec3 uSkyZenith;
  uniform float uMoonVis;
  uniform float uSunsetWarmth;
  uniform vec3 uCameraPos;
  uniform vec4 uBoatWake;
  varying vec3 vWorldPos;
  varying vec3 vNormal;
  varying float vCrest;
  varying float vFoamCrest;

  float waterHash(vec2 p) {
    vec3 h = fract(vec3(p.xyx) * 0.1031);
    h += dot(h, h.yzx + 33.33);
    return fract((h.x + h.y) * h.z);
  }

  float waterNoise(vec2 p) {
    vec2 i = floor(p), f = fract(p);
    f = f * f * (3.0 - 2.0 * f);
    return mix(
      mix(waterHash(i), waterHash(i + vec2(1.0, 0.0)), f.x),
      mix(waterHash(i + vec2(0.0, 1.0)), waterHash(i + vec2(1.0, 1.0)), f.x),
      f.y
    );
  }

  // Domain-warped organic multi-directional ocean ripple height (zero linear zebra striping!)
  float waveRippleHeight(vec2 p, float t, float microAmt) {
    mat2 rot1 = mat2(0.80, -0.60, 0.60, 0.80);
    mat2 rot2 = mat2(0.54, 0.84, -0.84, 0.54);
    vec2 warp = vec2(
      waterNoise(p * 0.045 + vec2(t * 0.09, -t * 0.06)),
      waterNoise(p * 0.045 + vec2(-t * 0.07, t * 0.08) + 13.7)
    ) * 5.2;
    vec2 q = p + warp;
    float h = waterNoise(q * 0.13 + vec2(t * 0.32, -t * 0.24)) * 0.52;
    h += waterNoise((rot1 * q) * 0.27 + vec2(-t * 0.44, t * 0.36)) * 0.30;
    if (microAmt > 0.01) {
      h += waterNoise((rot2 * p) * 0.62 + vec2(t * 0.68, t * 0.52)) * 0.18 * microAmt;
    }
    return h;
  }

  // Dual-layer procedural cellular caustic pattern for sunlit sandy shallows
  float causticPattern(vec2 uv, float t) {
    vec2 p1 = uv * 0.38 + vec2(t * 0.14, -t * 0.11);
    vec2 p2 = uv * 0.56 + vec2(-t * 0.17, t * 0.13);
    float n1 = waterNoise(p1);
    float n2 = waterNoise(p2 + n1 * 1.45);
    float ridge1 = 1.0 - abs(sin(p1.x * 2.8 + n2 * 4.0) * cos(p1.y * 2.6 - n1 * 3.6));
    float ridge2 = 1.0 - abs(cos((p2.x - p2.y) * 2.4 + n1 * 3.4));
    return pow(clamp(ridge1 * 0.60 + ridge2 * 0.48, 0.0, 1.0), 4.8);
  }

  float atollShore(vec2 delta, float radius, float phase) {
    float angle = atan(delta.x, delta.y);
    return length(delta) / (radius * (1.0 + 0.075 * sin(angle * 3.0 + phase) + 0.044 * cos(angle * 5.0)));
  }

  void main() {
    vec2 p = vWorldPos.xz;
    vec3 viewDir = normalize(uCameraPos - vWorldPos);
    float cameraDistance = distance(vWorldPos, uCameraPos);
    // Smooth distance attenuation prevents distant wave aliasing / zebra striping toward the horizon
    float detail = 1.0 - smoothstep(28.0, 420.0, cameraDistance);
    float microDetail = 1.0 - smoothstep(16.0, 165.0, cameraDistance);
    float normalFlatten = 1.0 - smoothstep(140.0, 680.0, cameraDistance);

    float wind = waterNoise(p * 0.068 + vec2(uTime * -0.042, uTime * 0.028));
    float windFine = waterNoise(p * 0.24 + vec2(uTime * 0.068, uTime * -0.052));
    float windMicro = waterNoise(p * 0.65 + vec2(uTime * -0.10, uTime * 0.09));

    // Analytical finite-difference normal from domain-warped organic multi-directional ripples
    float eps = 0.42;
    float hC = waveRippleHeight(p, uTime, microDetail);
    float hX = waveRippleHeight(p + vec2(eps, 0.0), uTime, microDetail);
    float hZ = waveRippleHeight(p + vec2(0.0, eps), uTime, microDetail);
    vec2 rippleGrad = vec2(hC - hX, hC - hZ) / eps;

    vec3 baseNormal = normalize(mix(vec3(0.0, 1.0, 0.0), vNormal, 0.30 + 0.70 * normalFlatten));
    vec3 n = normalize(
      baseNormal + vec3(rippleGrad.x, 0.0, rippleGrad.y) * (0.28 * detail)
    );

    // Exact Expanded Main Island + Island II + Venice Canal Bathymetry Match
    float dist = length(p);
    vec2 siteUV = vec2(p.x / 105.0, (p.y + 469.0) / 116.0);
    float siteAngle = atan(siteUV.x, siteUV.y);
    float site = length(siteUV) / (1.0 + sin(siteAngle * 3.0) * 0.067 + sin(siteAngle * 5.0 + 0.6) * 0.035);

    bool canal = abs(p.y + 95.0) < 24.0 && p.x > 65.0 && p.x < 365.0;

    float angle = atan(p.x, p.y);
    float absSin = abs(sin(angle));
    float airport = (angle + 0.82) / 0.45;
    float rawR = 228.0 + 52.0 * pow(absSin, 1.85)
      + 16.0 * exp(-pow((angle - 1.62) / 0.52, 2.0))
      + 15.0 * exp(-pow((angle - 2.34) / 0.44, 2.0))
      + 18.0 * exp(-pow((angle - 0.78) / 0.44, 2.0))
      + 18.0 * exp(-pow((angle + 1.88) / 0.52, 2.0))
      + 14.0 * exp(-pow((angle + 2.42) / 0.42, 2.0))
      + 50.0 * exp(-airport * airport);
    float roadRadius = rawR - 23.0 * pow(max(0.0, -cos(angle)), 14.0);
    float northFac = pow(max(0.0, -cos(angle)), 10.0);
    float beach = (50.0 + 18.0 * pow(max(0.0, cos(angle)), 6.0)
      + 9.0 * cos(angle * 3.0 - 0.3)
      - 5.5 * sin(angle * 5.0 + 0.4)
      + 5.0 * cos(angle * 2.0)) * (1.0 - 0.34 * northFac);

    float shore = dist - roadRadius - beach;
    float solis = atollShore(p - vec2(${COASTAL_ATOLLS.solis.x}.0, ${COASTAL_ATOLLS.solis.z}.0), ${COASTAL_ATOLLS.solis.radius}.0, ${COASTAL_ATOLLS.solis.phase});
    float azurea = atollShore(p - vec2(${COASTAL_ATOLLS.azurea.x}.0, ${COASTAL_ATOLLS.azurea.z}.0), ${COASTAL_ATOLLS.azurea.radius}.0, ${COASTAL_ATOLLS.azurea.phase});
    float satellite = min(solis, azurea);
    float deep = canal ? 0.12 : min(min(smoothstep(-7.0, 62.0, shore), smoothstep(0.84, 1.32, site)), smoothstep(0.89, 1.32, satellite));
    float shallowShelf = 1.0 - smoothstep(-4.0, 34.0, shore);
    float islandTwoShallow = 1.0 - smoothstep(0.84, 1.18, site);
    float coastalShallow = canal ? 0.85 : max(max(shallowShelf, islandTwoShallow), 1.0 - smoothstep(0.90, 1.27, satellite));

    vec3 sunN = normalize(uSunDir);
    float daySun = 1.0 - smoothstep(0.15, 0.85, uMoonVis);

    // Clamped 3-Stop Beer-Lambert Turquoise-to-Sapphire Depth Ramp (zero purple/magenta artifacts)
    vec3 crystalAqua = clamp(mix(uShallow * 1.24 + vec3(0.0, 0.10, 0.11), uShallow * 1.08, uMoonVis), vec3(0.0), vec3(0.55, 0.88, 0.92));
    vec3 midTurquoise = mix(uShallow, uDeep, 0.38);
    vec3 water = mix(crystalAqua, midTurquoise, smoothstep(0.0, 0.44, deep));
    water = mix(water, uDeep, smoothstep(0.28, 1.0, pow(deep, 0.86)));
    water += (wind - 0.5) * vec3(0.008, 0.030, 0.036) * (1.0 - deep) * mix(0.30, 1.0, daySun);

    // Sunlit Underwater Caustics in Shallow Coastal Sandbars & Venice Canal (pure aqua-cyan/gold clamped)
    float caustic = causticPattern(p + n.xz * 2.4, uTime);
    float causticFine = causticPattern(p * 1.55 - n.xz * 1.5, uTime * 1.2) * microDetail;
    vec3 causticCol = mix(vec3(0.04, 0.18, 0.19), vec3(0.22, 0.16, 0.07), uSunsetWarmth * 0.52);
    water += causticCol * clamp(caustic * 0.65 + causticFine * 0.38, 0.0, 0.95) * coastalShallow * detail * mix(0.14, 1.0, daySun);

    // Physical Subsurface Scattering (SSS) glowing through thin backlit emerald-turquoise wave crests
    float backLit = pow(max(0.0, dot(viewDir, -vec3(sunN.x, -sunN.y * 0.38, sunN.z))), 2.2);
    float crestHeight = smoothstep(-0.04, 0.52, vCrest) * normalFlatten;
    float sss = (0.28 + 0.72 * backLit) * crestHeight * (1.0 - max(dot(viewDir, n), 0.0));
    vec3 sssTint = mix(vec3(0.03, 0.58, 0.56), vec3(0.95, 0.48, 0.18), uSunsetWarmth * 0.62);
    water += sssTint * sss * (0.34 + 0.28 * (1.0 - deep)) * (0.20 + 0.80 * daySun);

    vec3 flatView = normalize(vec3(-viewDir.x, 0.0, -viewDir.z) + vec3(1e-5, 0.0, 0.0));
    vec3 flatSun = normalize(vec3(sunN.x, 0.0, sunN.z) + vec3(1e-5, 0.0, 0.0));
    float sunAzimuth = max(dot(flatView, flatSun), 0.0);
    vec3 warmScatter = mix(uSunColor, vec3(1.0, 0.44, 0.16), uSunsetWarmth)
                     * (0.035 + 0.15 * pow(sunAzimuth, 2.0) + 0.26 * uSunsetWarmth * pow(sunAzimuth, 1.45))
                     * (1.0 - smoothstep(0.28, 0.92, uMoonVis));
    vec3 horizon = uHorizonCol + warmScatter;

    // Physically Pleasing Schlick Fresnel + Sky & Soft Cloud Reflection
    float facing = max(dot(viewDir, n), 0.0);
    float fresnel = 0.02 + 0.98 * pow(1.0 - facing, 5.0);
    vec3 reflected = reflect(-viewDir, n);
    vec3 reflectedSky = mix(horizon, uSkyZenith, smoothstep(-0.04, 0.72, reflected.y));
    float reflCloud = waterNoise(reflected.xz / (max(reflected.y, 0.14) + 0.24) * 2.1 + vec2(uTime * 0.008, 0.0));
    vec3 cloudReflCol = mix(vec3(0.94, 0.97, 1.0), vec3(1.0, 0.64, 0.36), uSunsetWarmth) * (1.0 - uMoonVis * 0.72);
    reflectedSky = mix(reflectedSky, cloudReflCol, smoothstep(0.56, 0.80, reflCloud) * 0.20 * smoothstep(0.05, 0.45, reflected.y));

    // Multi-Lobe GGX Microfacet Solar Specular Path + Crisp Dancing Diamond Glints
    vec3 halfSun = normalize(viewDir + sunN);
    float ndh = max(dot(n, halfSun), 0.0);
    float rough = mix(0.18, 0.048, detail);
    float a2 = rough * rough * rough * rough;
    float denom = ndh * ndh * (a2 - 1.0) + 1.0;
    float ggxSpec = a2 / max(3.14159 * denom * denom, 1e-4);
    float solarPath = pow(max(dot(reflected, sunN), 0.0), 22.0);
    float tightGlint = pow(ndh, 340.0) * 1.45 * detail;
    float sparkleMask = smoothstep(0.64, 0.94, windMicro);
    float diamondSparkle = smoothstep(0.9960, 0.9995, ndh) * (2.0 + 2.4 * sparkleMask) * microDetail;

    // Bridge & Pier Soft Ocean Shadows
    vec2 crossing = p + sunN.xz * 13.0;
    float bridgeShadow = (1.0 - smoothstep(14.0, 23.0, abs(crossing.x))) *
      smoothstep(-399.0, -372.0, crossing.y) * (1.0 - smoothstep(-250.0, -224.0, crossing.y));
    float pierShadow = (1.0 - smoothstep(46.0, 54.0, abs(crossing.x))) *
      smoothstep(-692.0, -678.0, crossing.y) * (1.0 - smoothstep(-524.0, -508.0, crossing.y));

    vec3 col = mix(
      water * (1.0 - max(bridgeShadow, pierShadow * 0.85) * mix(0.18, 0.36, daySun)),
      reflectedSky,
      fresnel * 0.80
    );
    col += uSunColor * (solarPath * 0.15 + min(ggxSpec, 2.8) * 0.023 * (0.42 + wind * 0.78) + tightGlint + diamondSparkle)
      * (0.14 + 0.86 * daySun);

    // Neon Ferris Wheel & Coaster water reflections — strictly twilight/sunset/midnight so daytime shallows stay pure turquoise!
    float nightPierFactor = smoothstep(0.18, 0.85, uMoonVis) * 0.26 + smoothstep(0.35, 0.95, uSunsetWarmth) * 0.08;
    if (nightPierFactor > 0.005 && p.y < -485.0 && p.y > -735.0 && abs(p.x) < 115.0) {
      float pierProximity = (1.0 - smoothstep(44.0, 110.0, abs(p.x))) *
        smoothstep(-735.0, -675.0, p.y) * (1.0 - smoothstep(-515.0, -485.0, p.y));
      float wheelShimmer = pow(max(0.0, sin(p.x * 0.45 + n.x * 11.0 + uTime * 2.2)), 3.0);
      float coasterShimmer = pow(max(0.0, cos(p.y * 0.38 + n.z * 11.0 - uTime * 2.8)), 3.0);
      vec3 neonWaterGlow = vec3(0.92, 0.30, 0.60) * wheelShimmer + vec3(0.20, 0.76, 1.0) * coasterShimmer;
      col += neonWaterGlow * pierProximity * nightPierFactor;
    }

    // Moonlit Silver Reflection Path on Waves during Twilight & Midnight
    if (uMoonVis > 0.05) {
      vec3 moonDir = normalize(vec3(-0.955, 0.23, -0.19));
      float lunarPath = pow(max(dot(reflected, moonDir), 0.0), 26.0);
      float lunarGlitter = pow(max(dot(n, normalize(viewDir + moonDir)), 0.0), mix(44.0, 180.0, detail));
      col += vec3(0.70, 0.86, 1.0) * (lunarPath * 0.30 + lunarGlitter * (0.28 + wind * 0.62)) * uMoonVis;
    }

    // Animated Multi-Band Breaking Shoreline Surf Foam + Subtle Whitecaps + Boat V-Wake
    float tideSwash = 3.0 * sin(uTime * 0.55 + wind * 3.0);
    float shoreDist = shore + tideSwash;
    float headlandBand = abs(shoreDist) / 15.0;
    float islandTwoBand = abs(site - 0.965) / 0.15;
    float satelliteBand = abs(satellite - 0.918 + tideSwash * 0.004) / 0.14;
    float tideLine = min(min(headlandBand, islandTwoBand), satelliteBand);

    float breakCoord = satelliteBand == tideLine ? satellite * 34.0 : headlandBand < islandTwoBand ? shore * 0.58 : site * 52.0;
    float surfWaveA = sin(breakCoord + wind * 4.8 + 1.80 * uTime);
    float surfWaveB = sin(breakCoord * 1.62 - windFine * 3.4 + 2.45 * uTime);
    float foamWeb = smoothstep(0.30, 0.78, windFine * 0.58 + windMicro * 0.42);

    float primaryBreaker = (1.0 - smoothstep(0.18, 1.05, tideLine)) * smoothstep(0.48, 0.92, surfWaveA) * (0.58 + 0.42 * foamWeb);
    float secondarySwash = (1.0 - smoothstep(0.05, 0.50, tideLine)) * smoothstep(0.38, 0.88, surfWaveB) * (0.48 + 0.52 * foamWeb) * 0.64;
    float waterEdgeKiss = (1.0 - smoothstep(0.0, 0.18, abs(shore + 1.2 * sin(uTime * 0.9 + wind * 4.0)) / 7.5)) * (0.45 + 0.55 * foamWeb) * 0.52;
    float shoreFoam = clamp(primaryBreaker + secondarySwash + waterEdgeKiss, 0.0, 0.88);
    if (canal) shoreFoam *= 0.22;

    float whitecap = smoothstep(0.56, 0.88, vFoamCrest + (wind - 0.48) * 0.34) * (0.42 + 0.58 * foamWeb) * detail * 0.24;

    float wakeFoam = 0.0;
    float wakeSpeed = abs(uBoatWake.w);
    if (wakeSpeed > 1.2) {
      vec2 boatFwd = vec2(sin(uBoatWake.z), cos(uBoatWake.z));
      vec2 boatRight = vec2(boatFwd.y, -boatFwd.x);
      vec2 rel = p - uBoatWake.xy;
      float behind = -dot(rel, boatFwd);
      float sideDist = abs(dot(rel, boatRight));
      if (behind > -1.8 && behind < 44.0) {
        float wakeLen = clamp(behind / 40.0, 0.0, 1.0);
        float armOffset = 1.05 + max(0.0, behind) * 0.34;
        float armMask = exp(-pow((sideDist - armOffset) / (0.65 + wakeLen * 1.48), 2.0));
        float centerProp = exp(-pow(sideDist / (0.75 + wakeLen * 0.98), 2.0)) * (1.0 - wakeLen * 0.62);
        float wakeTurb = 0.55 + 0.45 * sin(behind * 2.4 - uTime * 9.8 + windFine * 5.2);
        float speedFactor = clamp(wakeSpeed / 22.0, 0.0, 1.0);
        wakeFoam = (armMask * 0.80 + centerProp * 0.90) * (1.0 - wakeLen) * wakeTurb * speedFactor;
      }
    }

    col = mix(col, uFoam, clamp(shoreFoam * 0.63 + whitecap + wakeFoam, 0.0, 0.72));

    float haze = smoothstep(380.0, 1620.0, cameraDistance);
    col = mix(col, horizon, haze);
    float distantFade = 1.0 - smoothstep(1680.0, 3100.0, cameraDistance);
    gl_FragColor = vec4(col, distantFade * mix(0.84, 0.99, max(deep, max(haze, fresnel))));
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }
`;

export const sphereVertexShader = /* glsl */ `
  varying vec2 vUv;
  varying vec3 vNormal;
  void main() {
    vUv = uv;
    vNormal = normalize(normalMatrix * normal);
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

export const sphereFragmentShader = /* glsl */ `
  uniform float uTime;
  uniform int uMode;
  varying vec2 vUv;
  varying vec3 vNormal;

  void main() {
    vec2 grid = vec2(280.0, 140.0);
    vec2 ipos = floor(vUv * grid);
    vec2 fpos = fract(vUv * grid);
    float dotMask = (1.0 - smoothstep(0.28, 0.45, distance(fpos, vec2(0.5))));

    vec3 col = vec3(0.05, 0.12, 0.24);
    if (uMode == 0) {
      float wave = sin(ipos.x * 0.14 - uTime * 2.4) * cos(ipos.y * 0.18 + uTime * 1.2);
      col = mix(vec3(0.06, 0.28, 0.58), vec3(0.22, 0.78, 0.98), wave * 0.5 + 0.5);
    } else if (uMode == 1) {
      float pulse = sin(ipos.x * 0.26 + uTime * 8.0) * 0.5 + 0.5;
      col = mix(vec3(0.55, 0.08, 0.12), vec3(1.0, 0.38, 0.14), pulse);
    } else if (uMode == 2) {
      float scan = step(0.80, fract(ipos.y * 0.12 - uTime * 2.2));
      col = mix(vec3(0.05, 0.06, 0.12), vec3(0.65, 0.42, 1.0), scan);
    } else {
      float rain = sin(ipos.x * 0.20 + uTime * 7.5) * 0.5 + 0.5;
      col = mix(vec3(0.08, 0.85, 0.48), vec3(1.0, 0.84, 0.18), rain);
    }
    float rim = 0.7 + 0.3 * max(vNormal.y, 0.0);
    gl_FragColor = vec4(col * (0.35 + 0.75 * dotMask) * rim, 1.0);
  }
`;

export const beamVertexShader = /* glsl */ `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

export const beamFragmentShader = /* glsl */ `
  uniform float uTime;
  uniform vec3 uColor;
  varying vec2 vUv;

  void main() {
    float verticalFade = pow(1.0 - vUv.y, 1.5);
    float pulse = 0.85 + 0.15 * sin(uTime * 3.0);
    gl_FragColor = vec4(uColor, verticalFade * 0.36 * pulse);
  }
`;

export const terrainVertexShader = /* glsl */ `
  #include <common>
  #include <shadowmap_pars_vertex>
  varying vec3 vWorldPos;
  varying vec3 vNormal;
  varying vec2 vUv;

  void main() {
    vec4 worldPosition = modelMatrix * vec4(position, 1.0);
    vec4 mvPosition = viewMatrix * worldPosition;
    vec3 transformedNormal = normalize(normalMatrix * normal);
    vWorldPos = worldPosition.xyz;
    vNormal = normalize(mat3(modelMatrix) * normal);
    vUv = uv;
    #include <shadowmap_vertex>
    gl_Position = projectionMatrix * mvPosition;
  }
`;

export const terrainFragmentShader = /* glsl */ `
  #include <common>
  #include <packing>
  #include <lights_pars_begin>
  #include <shadowmap_pars_fragment>
  #include <shadowmask_pars_fragment>
  uniform vec3 uSunDir;
  uniform vec3 uHorizonCol;
  uniform vec3 uSunLightCol;
  uniform vec3 uAmbientCol;
  uniform vec3 uSunColor;
  uniform float uSunsetWarmth;
  uniform float uMoonVis;
  uniform vec3 uCameraPos;
  uniform float uTime;

  varying vec3 vWorldPos;
  varying vec3 vNormal;
  varying vec2 vUv;

  float hash(vec2 p) {
    p = fract(p * vec2(123.34, 456.21));
    p += dot(p, p + 45.32);
    return fract(p.x * p.y);
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

  float fbm(vec2 p) {
    float v = 0.0;
    float a = 0.5;
    mat2 rot = mat2(0.8, 0.6, -0.6, 0.8);
    for (int i = 0; i < 4; i++) {
      v += a * noise(p);
      p = rot * p * 2.03 + vec2(17.1, 31.7);
      a *= 0.5;
    }
    return v;
  }

  void main() {
    vec2 p = vWorldPos.xz;
    vec3 n = normalize(vNormal);
    vec3 sunDir = normalize(uSunDir);
    vec3 viewDir = normalize(uCameraPos - vWorldPos);
    vec3 halfVec = normalize(viewDir + sunDir);

    // Full Metropolis Street Grid Mask (Avenues, Cross Boulevards, Sidewalks, Canal & Runway)
    bool inCanalCut = abs(p.y + 95.0) < 21.0 && p.x > 72.0 && p.x < 365.0;
    bool onGrandCentral = abs(p.x) < 18.0 && p.y > -225.0 && p.y < 195.0;
    bool onNorthCross = abs(p.y + 120.0) < 10.0 && abs(p.x) < 145.0;
    bool onMidtownCross = abs(p.y) < 11.0 && abs(p.x) < 155.0;
    bool onSouthCross = abs(p.y - 80.0) < 10.0 && abs(p.x) < 155.0;
    bool onCrossBlvd = (onNorthCross || onMidtownCross || onSouthCross) && !inCanalCut;
    bool onRunway = p.x > -210.0 && p.x < -45.0 && p.y > 135.0 && p.y < 175.0;
    bool onRoad = onGrandCentral || onCrossBlvd || onRunway;

    bool onGrandSidewalk = abs(p.x) >= 18.0 && abs(p.x) < 24.0 && p.y > -225.0 && p.y < 195.0;
    bool onNorthSidewalk = abs(p.y + 120.0) >= 10.0 && abs(p.y + 120.0) < 14.0 && abs(p.x) < 145.0;
    bool onMidtownSidewalk = abs(p.y) >= 11.0 && abs(p.y) < 15.0 && abs(p.x) < 155.0;
    bool onSouthSidewalk = abs(p.y - 80.0) >= 10.0 && abs(p.y - 80.0) < 14.0 && abs(p.x) < 155.0;
    bool onSidewalk = !onRoad && !inCanalCut && (onGrandSidewalk || onNorthSidewalk || onMidtownSidewalk || onSouthSidewalk);

    vec3 albedo = vec3(0.25);
    float specStrength = 0.0;
    float specPower = 24.0;
    float grassSheenMask = 0.0;
    float windGustVal = 0.0;

    bool satelliteSand = length(p - vec2(430.0, 340.0)) < 105.0 || length(p - vec2(-430.0, -290.0)) < 93.0;
    if (p.y < -330.0 || satelliteSand) {
      float grain = fbm(p * 1.8);
      float macroN = fbm(p * 0.05);
      float bladeN1 = noise(p * 18.0);
      float bladeN2 = noise(p * 55.0);
      float windPhase = dot(p, vec2(0.16, 0.11)) - uTime * 2.35 + macroN * 3.8;
      float windWave = sin(windPhase) * 0.5 + 0.5;
      windGustVal = windWave;

      float sandRipple = sin(p.x * 2.0 + p.y * 1.5 + grain * 2.8) * 0.5 + 0.5;
      vec3 wetIslandSand = vec3(0.60, 0.48, 0.32);
      vec3 dryIslandSand = vec3(0.89, 0.77, 0.56) + (sandRipple - 0.5) * 0.025;
      vec3 beach = mix(wetIslandSand, dryIslandSand, smoothstep(0.25, 1.35, vWorldPos.y));
      vec3 parkGrass = mix(vec3(0.09, 0.27, 0.07), vec3(0.19, 0.41, 0.13), smoothstep(0.2, 0.8, macroN));
      parkGrass = mix(parkGrass, vec3(0.32, 0.50, 0.17), windWave * 0.30);
      parkGrass *= 0.86 + 0.24 * bladeN1;
      if (satelliteSand) {
        parkGrass = mix(parkGrass, vec3(0.29, 0.46, 0.16), 0.34);
        n = normalize(mix(n, vec3(0.0, 1.0, 0.0), 0.30));
      }
      float grassBlend = smoothstep(1.35, satelliteSand ? 5.8 : 2.35, vWorldPos.y);
      albedo = mix(beach, parkGrass, grassBlend);
      grassSheenMask = grassBlend;
      specStrength = mix(0.44 * (1.0 - smoothstep(0.25, 1.05, vWorldPos.y)), 0.10, grassBlend);
      specPower = mix(64.0, 18.0, grassBlend);
      n = normalize(n + vec3((bladeN2 - 0.5) * 0.22 + windWave * 0.07, 0.0, (bladeN1 - 0.5) * 0.22) * grassBlend * (satelliteSand ? 0.45 : 1.0));

      // Paved Promenade Boulevard from North Bay Bridge (z = -402) to Wonder Ocean Pier Entrance (z = -520)
      float roadDist = abs(p.x);
      if (p.y < -395.0 && p.y > -530.0 && roadDist < 9.5) {
        // Sun-weathered slate-charcoal asphalt (sRGB ~0.27 -> linear ~0.056, never pitch black!)
        vec3 promenadeAsphalt = vec3(0.255, 0.272, 0.302) + (grain - 0.5) * 0.04;
        if (abs(roadDist - 0.25) < 0.12) promenadeAsphalt = vec3(0.96, 0.74, 0.16);
        else if (abs(roadDist - 8.6) < 0.16) promenadeAsphalt = vec3(0.92, 0.94, 0.96);
        float roadMask = 1.0 - smoothstep(8.9, 9.5, roadDist);
        albedo = mix(albedo, promenadeAsphalt, roadMask);
        grassSheenMask *= 1.0 - roadMask;
        specStrength = mix(specStrength, 0.18, roadMask);
      }
    } else if (onRoad) {
      // Sun-weathered slate-charcoal asphalt base with fine mineral micro-grain (matches road textures cleanly)
      float aggCoarse = noise(p * 8.5);
      float aggFine = noise(p * 32.0);
      float aggMicro = noise(p * 95.0);
      vec3 asphaltBase = vec3(0.248, 0.265, 0.294);
      asphaltBase += (aggFine - 0.5) * 0.028 + (aggMicro - 0.5) * 0.032 + (aggCoarse - 0.5) * 0.020;

      // Subtle tar repair seams
      float tarSeam = smoothstep(0.485, 0.5, abs(sin(p.y * 0.19 + noise(p * 0.6) * 2.2))) *
                      smoothstep(0.62, 0.78, noise(p * 0.35));
      asphaltBase = mix(asphaltBase, vec3(0.155, 0.168, 0.188), tarSeam * 0.65);

      // Subtle wheel-track wear lanes
      float wearTrack1 = exp(-pow((abs(p.x) - 4.5) / 2.0, 2.0));
      float wearTrack2 = exp(-pow((abs(p.x) - 12.5) / 2.0, 2.0));
      float tireWear = clamp(wearTrack1 + wearTrack2, 0.0, 1.0) * (onGrandCentral ? 1.0 : 0.35);
      asphaltBase = mix(asphaltBase, vec3(0.215, 0.230, 0.256), tireWear * 0.42);

      n = normalize(n + vec3((aggMicro - 0.5) * 0.055, 0.0, (aggFine - 0.5) * 0.055));
      albedo = asphaltBase;
      specStrength = 0.12 + tireWear * 0.18 + aggMicro * 0.05;
      specPower = mix(28.0, 44.0, tireWear * 0.6);

      float paintNoise = 0.88 + 0.12 * aggFine;
      vec3 yellowPaint = vec3(0.96, 0.73, 0.14) * paintNoise;
      vec3 whitePaint = vec3(0.93, 0.95, 0.97) * paintNoise;

      bool inIntersectionBox = onGrandCentral && onCrossBlvd;

      bool inGrandZebra =
        abs(abs(p.y) - 13.5) < 2.2 ||
        abs(abs(p.y + 120.0) - 12.2) < 2.2 ||
        abs(abs(p.y - 80.0) - 12.2) < 2.2 ||
        abs(p.y + 60.0) < 2.2 ||
        abs(p.y - 40.0) < 2.2;

      bool inCrossZebra = onCrossBlvd && abs(abs(p.x) - 20.2) < 2.2;

      if (onGrandCentral && p.y > -220.0 && p.y < 190.0) {
        if (abs(abs(p.x) - 0.32) < 0.14 && !inGrandZebra && !inIntersectionBox) {
          albedo = yellowPaint;
          specStrength = 0.36;
        }
        if (abs(abs(p.x) - 9.0) < 0.13 && fract(p.y * 0.12) < 0.45 && !inGrandZebra && !inIntersectionBox) {
          albedo = whitePaint;
          specStrength = 0.36;
        }
        if (abs(abs(p.x) - 16.8) < 0.16 && !inIntersectionBox) {
          albedo = whitePaint;
          specStrength = 0.34;
        }
        if (inGrandZebra && abs(p.x) < 16.5) {
          float zebra = step(0.45, fract(p.x * 0.65));
          albedo = mix(albedo, whitePaint, zebra * 0.92);
          specStrength = mix(specStrength, 0.35, zebra);
        }
      }

      if (onCrossBlvd && !onGrandCentral) {
        float centerZ = onNorthCross ? -120.0 : (onMidtownCross ? 0.0 : 80.0);
        float halfW = onMidtownCross ? 11.0 : 10.0;
        float dz = abs(p.y - centerZ);

        if (abs(dz - 0.28) < 0.12 && !inCrossZebra) {
          albedo = yellowPaint;
          specStrength = 0.36;
        } else if (abs(dz - 5.0) < 0.12 && fract(p.x * 0.12) < 0.45 && !inCrossZebra) {
          albedo = whitePaint;
          specStrength = 0.36;
        } else if (abs(dz - (halfW - 1.1)) < 0.15) {
          albedo = whitePaint;
          specStrength = 0.34;
        }

        if (inCrossZebra && dz < halfW - 1.2) {
          float zebra = step(0.45, fract(p.y * 0.65));
          albedo = mix(albedo, whitePaint, zebra * 0.92);
          specStrength = mix(specStrength, 0.35, zebra);
        }
      }

      if (onRunway) {
        float rwCenterZ = 155.0;
        if (abs(p.y - rwCenterZ) < 0.35 && fract(p.x * 0.08) < 0.55) {
          albedo = vec3(0.92, 0.94, 0.96);
        }
        if (abs(abs(p.y - rwCenterZ) - 19.2) < 0.22) {
          albedo = vec3(0.92, 0.94, 0.96);
        }
        if ((abs(p.x + 202.0) < 4.5 || abs(p.x + 53.0) < 4.5) && abs(p.y - rwCenterZ) < 11.5) {
          float keyMask = step(0.45, fract(p.y * 0.6));
          albedo = mix(albedo, vec3(0.93, 0.95, 0.97), keyMask);
        }
      }

      if (onGrandCentral && !onCrossBlvd && abs(abs(p.x) - 18.0) < 0.45) {
        float gutterAO = smoothstep(0.0, 0.45, abs(abs(p.x) - 18.0));
        albedo *= 0.52 + 0.48 * gutterAO;
      }
    } else if (onSidewalk) {
      float ax = abs(p.x);
      bool isCurbEdge =
        (onGrandSidewalk && ax < 18.6) ||
        (onNorthSidewalk && abs(p.y + 120.0) < 10.6) ||
        (onMidtownSidewalk && abs(p.y) < 11.6) ||
        (onSouthSidewalk && abs(p.y - 80.0) < 10.6);

      if (isCurbEdge) {
        vec3 graniteCurb = vec3(0.77, 0.74, 0.70) + (noise(p * 24.0) - 0.5) * 0.05;
        albedo = graniteCurb * 0.82;
        specStrength = 0.15;
      } else {
        // Warm Honed Travertine Promenade Pavers with crisp mortar joints
        vec2 tileUV = p * 0.82;
        vec2 tileId = floor(tileUV);
        vec2 tileF = fract(tileUV);
        float tileVar = hash(tileId) * 0.065 - 0.032;
        float stoneGrain = fbm(p * 6.5) * 0.045;
        vec3 paver = vec3(0.84, 0.81, 0.76) + tileVar + stoneGrain;

        float jointX = smoothstep(0.0, 0.042, tileF.x) * smoothstep(0.0, 0.042, 1.0 - tileF.x);
        float jointY = smoothstep(0.0, 0.042, tileF.y) * smoothstep(0.0, 0.042, 1.0 - tileF.y);
        float mortarMask = jointX * jointY;
        albedo = mix(vec3(0.52, 0.49, 0.45), paver, mortarMask);
        specStrength = 0.18;
        specPower = 36.0;
      }
    } else {
      // Urban City Blocks, Terraced Resort Meadows & Golden Riviera Beaches
      float h = vWorldPos.y;
      float slope = 1.0 - n.y;
      float macroN = fbm(p * 0.036);
      float medN = fbm(p * 0.16);
      float bladeN1 = noise(p * 15.0);
      float bladeN2 = noise(p * 52.0);
      float bladeN3 = noise(p * 115.0);
      float microBlades = bladeN1 * 0.52 + bladeN2 * 0.32 + bladeN3 * 0.16;

      float windPhase = dot(p, vec2(0.16, 0.11)) - uTime * 2.35 + macroN * 3.8;
      float windWave = sin(windPhase) * 0.5 + 0.5;
      float windRipple = sin(windPhase * 2.4 + bladeN1 * 2.0) * 0.5 + 0.5;
      windGustVal = windWave * 0.65 + windRipple * 0.35;

      bool inMetropolisBlocks = abs(p.x) < 140.0 && abs(p.y) < 168.0 && !inCanalCut && h > 2.2;

      if (inMetropolisBlocks) {
        vec2 blockUV = p * 0.45;
        vec2 blockId = floor(blockUV);
        vec2 blockF = fract(blockUV);
        float jX = smoothstep(0.0, 0.04, blockF.x) * smoothstep(0.0, 0.04, 1.0 - blockF.x);
        float jY = smoothstep(0.0, 0.04, blockF.y) * smoothstep(0.0, 0.04, 1.0 - blockF.y);
        float tileJoint = jX * jY;
        float tileTone = hash(blockId) * 0.055 - 0.025;
        vec3 plazaStone = mix(vec3(0.45, 0.46, 0.48), vec3(0.72, 0.72, 0.71) + tileTone, tileJoint);

        vec3 cityTurfA = vec3(0.12, 0.36, 0.13);
        vec3 cityTurfB = vec3(0.22, 0.49, 0.18);
        vec3 sunTipTurf = vec3(0.36, 0.60, 0.21);
        float mowStripe = smoothstep(0.28, 0.72, fract((p.x + p.y) * 0.16));
        vec3 manicuredTurf = mix(cityTurfA, cityTurfB, mowStripe * 0.38 + smoothstep(0.25, 0.75, macroN) * 0.62);
        manicuredTurf = mix(manicuredTurf, sunTipTurf, (windGustVal * 0.45 + smoothstep(0.45, 0.85, medN) * 0.55) * 0.34);
        float rootAO = smoothstep(0.12, 0.42, microBlades);
        manicuredTurf *= 0.82 + 0.32 * rootAO;

        float nearAve = max(
          1.0 - smoothstep(24.0, 42.0, abs(p.x)),
          max(
            1.0 - smoothstep(14.0, 28.0, abs(p.y)),
            1.0 - smoothstep(14.0, 28.0, min(abs(p.y + 120.0), abs(p.y - 80.0)))
          )
        );
        float plazaMask = clamp(nearAve + smoothstep(0.45, 0.68, macroN) * 0.65, 0.0, 1.0);
        float turfMask = 1.0 - plazaMask;
        albedo = mix(manicuredTurf, plazaStone, plazaMask);
        specStrength = mix(0.12, 0.17, plazaMask);
        specPower = mix(16.0, 34.0, plazaMask);
        grassSheenMask = turfMask;
        n = normalize(n + vec3((bladeN2 - 0.5) * 0.18 + windWave * 0.06, 0.0, (bladeN1 - 0.5) * 0.18 + windRipple * 0.05) * turfMask);
      } else {
        // Glossy Wave-Washed Wet Shoreline Sand (h < 0.92)
        float washPulse = 0.08 * sin(uTime * 0.85 + macroN * 4.0);
        vec3 wetSand = vec3(0.59, 0.46, 0.30) + (bladeN2 - 0.5) * 0.028;

        // Warm Wind-Rippled Golden Riviera Beach Sand with Quartz Glints
        float ripple = sin(p.x * 2.2 + p.y * 1.45 + noise(p * 0.35) * 3.4) * 0.5 + 0.5;
        float sandSparkle = smoothstep(0.80, 0.98, noise(p * 48.0)) * 0.044;
        vec3 drySand = vec3(0.91, 0.79, 0.58) + (ripple - 0.5) * 0.028 + (bladeN1 - 0.5) * 0.024 + sandSparkle;

        // Lush Multi-Tone Coastal Meadow & Resort Parkland (emerald fescue, sage, sunlit clover)
        vec3 meadowFescue = vec3(0.10, 0.29, 0.08);
        vec3 oliveSage = vec3(0.20, 0.40, 0.13);
        vec3 goldenTips = vec3(0.35, 0.50, 0.18);
        vec3 darkLoam = vec3(0.08, 0.11, 0.05);

        vec3 grassCol = mix(meadowFescue, oliveSage, smoothstep(0.20, 0.80, macroN));
        float sunCuredMask = smoothstep(0.46, 0.84, medN * 0.66 + windGustVal * 0.34);
        grassCol = mix(grassCol, goldenTips, sunCuredMask * 0.44);
        float creviceMask = 1.0 - smoothstep(0.14, 0.42, microBlades);
        grassCol = mix(grassCol, darkLoam, creviceMask * 0.40);
        grassCol *= 0.86 + 0.26 * microBlades;

        // Sedimentary Coastal Limestone Headland Rock (steep bluffs)
        float strata = sin(vWorldPos.y * 4.5 + noise(p * 0.28) * 2.2) * 0.5 + 0.5;
        vec3 cliffRock = vec3(0.50, 0.46, 0.41) + (strata - 0.5) * 0.10 + (bladeN1 - 0.5) * 0.05;
        cliffRock = mix(cliffRock, vec3(0.33, 0.31, 0.27), smoothstep(0.62, 0.88, noise(p * 1.4)) * 0.45);

        float noisyH = h + (medN - 0.5) * 0.28;
        float rippleSlope = (ripple - 0.5) * 0.026 * (1.0 - smoothstep(1.2, 2.2, noisyH));
        n = normalize(n + vec3(rippleSlope + (bladeN2 - 0.5) * 0.016, 0.0, rippleSlope * 0.68));
        if (noisyH < 0.88 + washPulse) {
          float wetToDry = smoothstep(0.26, 0.88 + washPulse, noisyH);
          albedo = mix(wetSand, drySand, wetToDry);
          specStrength = mix(0.30, 0.08, wetToDry);
          specPower = mix(78.0, 32.0, wetToDry);
        } else if (noisyH < 2.18) {
          float sandToGrass = smoothstep(1.58, 2.16, noisyH);
          albedo = mix(drySand, grassCol, sandToGrass);
          specStrength = mix(0.06, 0.10, sandToGrass);
          specPower = 18.0;
          grassSheenMask = sandToGrass;
          n = normalize(n + vec3((bladeN2 - 0.5) * 0.20 + windWave * 0.07, 0.0, (bladeN1 - 0.5) * 0.20 + windRipple * 0.06) * sandToGrass);
        } else {
          albedo = grassCol;
          specStrength = 0.10;
          specPower = 16.0;
          grassSheenMask = 1.0;
          n = normalize(n + vec3((bladeN2 - 0.5) * 0.25 + windWave * 0.085, 0.0, (bladeN1 - 0.5) * 0.25 + windRipple * 0.075));
        }

        float cliffMask = clamp(
          smoothstep(0.11, 0.22, slope) * smoothstep(1.5, 2.4, h) + smoothstep(7.5, 9.2, h + (macroN - 0.5) * 0.8),
          0.0,
          1.0
        );
        if (cliffMask > 0.001) {
          albedo = mix(albedo, cliffRock, cliffMask);
          specStrength = mix(specStrength, 0.10, cliffMask);
          grassSheenMask *= 1.0 - cliffMask;
        }
      }
    }

    // Convert procedural sRGB albedo into linear color space for accurate theme lighting & ACES tone mapping
    albedo = pow(max(albedo, vec3(0.0)), vec3(2.2));

    float shadow = mix(satelliteSand ? 0.64 : 0.46, 1.0, getShadowMask());
    // Smooth wrap-softened directional sunlight + sky hemisphere so slopes never look blocky/faceted
    float ndl = max(dot(n, sunDir), 0.0);
    float wrapDiff = max(0.0, (dot(n, sunDir) + 0.38) / 1.38);
    vec3 groundBounce = uAmbientCol * vec3(0.52, 0.48, 0.44) + vec3(0.012, 0.016, 0.020);
    vec3 skyAmb = mix(groundBounce, uAmbientCol, 0.5 + 0.5 * n.y);
    vec3 sunLight = uSunLightCol * (ndl * 0.62 + wrapDiff * 0.38) * shadow;

    // Subtle cool counter-sun azure rim fill on shaded slopes for AAA depth separation
    vec3 rimDir = normalize(vec3(-sunDir.x, 0.35, -sunDir.z));
    float rimFill = max(dot(n, rimDir), 0.0) * (1.0 - ndl * 0.65);
    vec3 rimCol = mix(vec3(0.10, 0.22, 0.36), vec3(0.24, 0.14, 0.28), uSunsetWarmth) * rimFill * 0.22;

    float ndh = max(dot(n, halfVec), 0.0);
    float spec = pow(ndh, specPower) * specStrength * shadow;
    vec3 specCol = uSunLightCol * spec * 0.78;

    // Kajiya-Kay Anisotropic Grazing Velvet Sheen & Chlorophyll Subsurface Backscatter on Grass
    vec3 grassSSS = vec3(0.0);
    if (grassSheenMask > 0.01) {
      float grazing = pow(1.0 - max(dot(n, viewDir), 0.0), 2.5);
      float sunForward = pow(max(0.0, dot(-viewDir, vec3(sunDir.x, -0.25, sunDir.z))), 2.2);
      vec3 chlorophyll = vec3(0.26, 0.56, 0.08) * (0.45 + 0.55 * windGustVal);
      grassSSS = chlorophyll * uSunLightCol * (grazing * 0.34 + sunForward * 0.46) * shadow * grassSheenMask;
    }

    vec3 finalCol = albedo * (skyAmb + sunLight + rimCol) + specCol + grassSSS;

    vec3 flatView = normalize(vec3(-viewDir.x, 0.0, -viewDir.z) + vec3(1e-5, 0.0, 0.0));
    vec3 flatSun = normalize(vec3(sunDir.x, 0.0, sunDir.z) + vec3(1e-5, 0.0, 0.0));
    float sunAzimuth = max(dot(flatView, flatSun), 0.0);
    vec3 warmScatter = mix(uSunColor, vec3(1.0, 0.44, 0.16), uSunsetWarmth)
                     * (0.035 + 0.16 * pow(sunAzimuth, 2.0) + 0.28 * uSunsetWarmth * pow(sunAzimuth, 1.45))
                     * (1.0 - smoothstep(0.28, 0.92, uMoonVis));
    vec3 horizon = uHorizonCol + warmScatter;

    float camDist = length(vWorldPos - uCameraPos);
    float distHaze = smoothstep(460.0, 1620.0, camDist);
    finalCol = mix(finalCol, horizon, distHaze * 0.86);
    gl_FragColor = vec4(finalCol, 1.0);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }
`;
