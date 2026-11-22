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

  float starLayer(vec2 uv, float scale, float threshold, float timeSeed, out vec3 starTint) {
    vec2 p = uv * scale;
    vec2 id = floor(p);
    vec2 f = fract(p) - 0.5;
    float rnd = hash(id + timeSeed);
    starTint = mix(vec3(0.76, 0.88, 1.0), vec3(1.0, 0.92, 0.80), fract(rnd * 73.13));
    if (rnd < threshold) return 0.0;
    vec2 off = (vec2(hash(id + 13.7 + timeSeed), hash(id + 29.1 + timeSeed)) - 0.5) * 0.62;
    float d = length(f - off);
    float size = mix(0.055, 0.115, (rnd - threshold) / (1.0 - threshold));
    float pinpoint = 1.0 - smoothstep(size * 0.18, size, d);
    float twinkle = 0.64 + 0.36 * sin(uTime * (1.7 + rnd * 3.8) + rnd * 62.8318);
    float mag = mix(0.35, 1.35, pow((rnd - threshold) / (1.0 - threshold), 1.4));
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

    // Rich mid-sky atmospheric scatter blend directly from active theme zenith & horizon
    vec3 midSky = mix(uHorizon, uZenith, 0.48);
    midSky += vec3(0.10, 0.025, 0.065) * uSunsetWarmth;
    vec3 col = mix(uHorizon, midSky, smoothstep(0.0, 0.24, h));
    col = mix(col, uZenith, pow(smoothstep(0.10, 1.0, h), 0.72));

    // Horizon warm scatter & golden-peach sunset/twilight arch (matches water/terrain horizon at h = 0)
    vec3 warmScatter = mix(uSunColor, vec3(1.0, 0.44, 0.16), uSunsetWarmth)
                     * (0.03 + 0.14 * pow(sunAzimuth, 2.2) + 0.24 * uSunsetWarmth * pow(sunAzimuth, 1.5))
                     * (1.0 - smoothstep(0.35, 0.92, uMoonVis));
    float horizonGlow = pow(1.0 - h, 4.5);
    col += warmScatter * horizonGlow;

    float twilightArch = smoothstep(0.0, 0.18, h) * exp(-h * 5.2);
    col += vec3(0.68, 0.16, 0.24) * twilightArch * 0.26 * uSunsetWarmth * (0.45 + 0.55 * sunAzimuth);

    // Sun disc + warm golden Mie glow when above horizon
    float sunAbove = smoothstep(-0.05, 0.06, sunN.y);
    float sunDiscMask = sunAbove * (1.0 - smoothstep(0.08, 0.58, uMoonVis));
    float sunMieMask = sunAbove * (1.0 - smoothstep(0.25, 0.88, uMoonVis));
    col += mix(uSunColor, vec3(1.0, 0.62, 0.26), uSunsetWarmth * 0.65) * pow(sunDot, 5.0) * 0.22 * sunMieMask;
    col += mix(uSunColor, vec3(1.0, 0.72, 0.38), 0.45) * pow(sunDot, 32.0) * 0.45 * sunDiscMask;
    col += mix(uSunColor, vec3(1.0, 0.88, 0.68), 0.5) * pow(sunDot, 160.0) * 0.95 * sunDiscMask;
    col += mix(uSunColor, vec3(1.0, 0.96, 0.90), 0.65) * smoothstep(0.9976, 0.9995, sunDot) * 2.4 * sunDiscMask;

    // Photorealistic full moon + soft atmospheric lunar halo
    vec3 moonDir = normalize(vec3(-0.955, 0.23, -0.19));
    float moonDot = max(dot(dir, moonDir), 0.0);
    float moonDisc = 0.0;
    if (uMoonVis > 0.005) {
      col += vec3(0.16, 0.36, 0.72) * pow(moonDot, 16.0) * 0.38 * uMoonVis;
      col += vec3(0.58, 0.76, 1.0) * pow(moonDot, 140.0) * 0.95 * uMoonVis;

      moonDisc = smoothstep(0.9942, 0.9970, moonDot);
      if (moonDisc > 0.001) {
        vec3 moonRight = normalize(cross(vec3(0.0, 1.0, 0.0), moonDir));
        vec3 moonUp = cross(moonDir, moonRight);
        vec2 moonUv = vec2(dot(dir, moonRight), dot(dir, moonUp)) / 0.095;
        float r2 = dot(moonUv, moonUv);
        float limb = sqrt(max(0.0, 1.0 - min(r2, 1.0)));
        float mare = noise(moonUv * 3.1 + vec2(1.4, 2.7)) * 0.62 + noise(moonUv * 7.2 + vec2(5.1, 0.9)) * 0.38;
        float crater = noise(moonUv * 17.5 + vec2(3.2, 7.1));
        float lunarDetail = mix(0.66, 1.08, smoothstep(0.30, 0.72, mare)) * (0.92 + 0.12 * crater);
        vec3 moonCol = vec3(0.90, 0.94, 1.0) * lunarDetail * mix(0.75, 1.38, limb);
        col = mix(col, moonCol, moonDisc * uMoonVis);
      }
    }

    // Crisp twinkling stars in the upper sky dome (cube-projected to avoid zenith pinching)
    if (uStarIntensity > 0.005 && dir.y > 0.03) {
      vec3 ad = abs(dir);
      vec2 starProj = ad.y > max(ad.x, ad.z)
        ? dir.xz / ad.y
        : (ad.x > ad.z ? dir.zy / ad.x : dir.xy / ad.z);
      vec3 tintA;
      vec3 tintB;
      float sA = starLayer(starProj, 92.0, 0.948, 0.0, tintA);
      float sB = starLayer(starProj + vec2(0.37, 0.61), 152.0, 0.955, 71.3, tintB);
      float elevMask = smoothstep(0.03, 0.24, dir.y);
      float sunGlareMask = 1.0 - clamp(pow(sunDot, 4.0) * 1.6 * sunDiscMask, 0.0, 1.0);
      float moonMask = 1.0 - moonDisc * uMoonVis;
      vec3 starCol = (tintA * sA + tintB * sB * 0.82) * uStarIntensity * elevMask * sunGlareMask * moonMask;
      col += starCol;
    }

    // Soft procedural high-altitude cirrus cloud wisps
    if (dir.y > 0.06) {
      vec2 cirrusUv = dir.xz / (dir.y + 0.24) * vec2(0.85, 2.6) + vec2(uTime * 0.0045, uTime * 0.0018);
      float warp = noise(cirrusUv * 1.6) * 0.85;
      float wisp = noise(cirrusUv * 2.8 + vec2(warp, -warp * 0.5)) * 0.58
                 + noise(cirrusUv * 6.4 + vec2(-warp * 0.4, warp)) * 0.30
                 + noise(cirrusUv * 13.0) * 0.12;
      float cirrusAlpha = smoothstep(0.57, 0.82, wisp)
                        * smoothstep(0.06, 0.26, dir.y)
                        * (1.0 - smoothstep(0.72, 0.98, dir.y));
      vec3 cirrusDay = mix(vec3(0.72, 0.78, 0.86), vec3(1.0, 0.58, 0.30), uSunsetWarmth * (0.35 + 0.65 * pow(sunDot, 2.0)));
      vec3 cirrusNight = mix(uHorizon * 1.45, vec3(0.45, 0.60, 0.88), pow(moonDot, 3.0) * 0.78);
      vec3 cirrusCol = mix(cirrusDay, cirrusNight, smoothstep(0.15, 0.85, uMoonVis));
      cirrusCol = mix(cirrusCol, uHorizon + warmScatter, pow(1.0 - h, 3.0) * 0.45);
      col = mix(col, cirrusCol, cirrusAlpha * mix(0.36, 0.24, uMoonVis));
    }

    // Soft layered cumulus clouds with sunset-lit & moon-silvered edges
    if (dir.y > 0.03) {
      vec2 uv = dir.xz / (dir.y + 0.18) * 1.3 + vec2(uTime * 0.008, uTime * 0.004);
      vec2 drift = vec2(noise(uv * 2.2), noise(uv * 1.8 + 8.5)) * 0.58;
      vec2 cloudUv = uv + drift;
      float c = noise(cloudUv * 1.7) * 0.53 + noise(cloudUv * 4.1) * 0.25 +
        noise(cloudUv * 8.8) * 0.15 + noise(cloudUv * 17.1) * 0.07;
      float cloudAlpha = smoothstep(0.53, 0.74, c) * smoothstep(0.04, 0.20, dir.y) * (1.0 - smoothstep(0.55, 0.9, dir.y));
      float lightEdge = smoothstep(-0.035, 0.19, c - noise((cloudUv + sunN.xz * 0.082) * 1.7) * 0.84);
      float moonLightEdge = smoothstep(-0.035, 0.19, c - noise((cloudUv + moonDir.xz * 0.082) * 1.7) * 0.84);

      vec3 cloudShadowDay = mix(mix(uZenith, uHorizon, 0.50) * 0.86, vec3(0.26, 0.13, 0.28), uSunsetWarmth * 0.68);
      vec3 cloudLitDay = mix(vec3(0.96, 0.96, 0.95), vec3(1.0, 0.56, 0.22), uSunsetWarmth * (0.58 + 0.42 * pow(sunDot, 2.0)));
      vec3 cloudDay = mix(cloudShadowDay, cloudLitDay, lightEdge);

      vec3 cloudShadowNight = uZenith * 0.65;
      vec3 cloudLitNight = mix(uHorizon * 1.18, vec3(0.56, 0.76, 1.0), 0.35 + 0.65 * pow(moonDot, 4.0));
      vec3 cloudNight = mix(cloudShadowNight, cloudLitNight, mix(0.14, 1.0, moonLightEdge) * (0.35 + 0.65 * pow(moonDot, 2.2)));

      vec3 cloudCol = mix(cloudDay, cloudNight, smoothstep(0.12, 0.82, uMoonVis));
      cloudCol = mix(cloudCol, uHorizon + warmScatter, (1.0 - smoothstep(0.04, 0.22, dir.y)) * 0.55);
      col = mix(col, cloudCol, cloudAlpha * mix(0.68, 0.44, uMoonVis));
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

  void main() {
    vec4 wp = modelMatrix * vec4(position, 1.0);
    vec2 p = wp.xz;
    float phaseA = 0.11 * p.x + 1.25 * uTime;
    float phaseB = 0.22 * (0.7 * p.x + 0.7 * p.y) + 1.8 * uTime;
    float phaseC = 0.41 * (-0.4 * p.x + 0.9 * p.y) + 2.3 * uTime;
    vCrest = 0.42 * sin(phaseA) + 0.24 * sin(phaseB) + 0.14 * sin(phaseC);
    wp.y += vCrest;
    vec2 slope = vec2(0.0462, 0.0) * cos(phaseA) + vec2(0.037, 0.037) * cos(phaseB) + vec2(-0.023, 0.052) * cos(phaseC);
    vNormal = vec3(-slope.x, 1.0, -slope.y);
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
  varying vec3 vWorldPos;
  varying vec3 vNormal;
  varying float vCrest;

  float waterHash(vec2 p) {
    vec3 h = fract(vec3(p.xyx) * 0.1031);
    h += dot(h, h.yzx + 33.33);
    return fract((h.x + h.y) * h.z);
  }

  float waterNoise(vec2 p) {
    vec2 i = floor(p), f = fract(p);
    f = f * f * (3.0 - 2.0 * f);
    return mix(mix(waterHash(i), waterHash(i + vec2(1.0, 0.0)), f.x),
      mix(waterHash(i + vec2(0.0, 1.0)), waterHash(i + vec2(1.0, 1.0)), f.x), f.y);
  }

  void main() {
    vec2 p = vWorldPos.xz;
    vec3 viewDir = normalize(uCameraPos - vWorldPos);
    float cameraDistance = distance(vWorldPos, uCameraPos);
    float detail = 1.0 - smoothstep(55.0, 860.0, cameraDistance);
    float wind = waterNoise(p * 0.082 + vec2(uTime * -0.04, uTime * 0.025));
    float rippleA = cos(dot(p, vec2(0.92, 1.58)) + uTime * 3.3 + wind * 5.9);
    float rippleB = cos(dot(p, vec2(-1.79, 0.62)) - uTime * 2.7 + wind * 3.4);
    vec3 n = normalize(vNormal + vec3(rippleA + rippleB * 0.69, 0.0, rippleB - rippleA * 0.46) * 0.042 * detail);

    float dist = length(p);
    vec2 siteUV = vec2(p.x / 105.0, (p.y + 469.0) / 116.0);
    float siteAngle = atan(siteUV.x, siteUV.y);
    float site = length(siteUV) / (1.0 + sin(siteAngle * 3.0) * 0.067 + sin(siteAngle * 5.0 + 0.6) * 0.035);
    bool canal = abs(p.y + 95.0) < 24.0 && p.x > 65.0 && p.x < 290.0;
    float angle = atan(p.x, p.y);
    float airport = (angle + 0.82) / 0.49;
    float roadRadius = 228.0 + 62.0 * exp(-airport * airport) - 23.0 * pow(max(0.0, -cos(angle)), 16.0);
    float beach = 41.0 + 6.0 * cos(angle * 3.0) - 4.0 * sin(angle * 5.0);
    float shore = dist - roadRadius - beach;
    float deep = canal ? 0.13 : min(smoothstep(-6.0, 52.0, shore), smoothstep(0.84, 1.29, site));

    vec3 sunN = normalize(uSunDir);
    float daySun = 1.0 - smoothstep(0.15, 0.85, uMoonVis);

    vec3 water = mix(uShallow, uDeep, deep);
    water += (wind - 0.52) * vec3(0.008, 0.025, 0.028) * (1.0 - deep) * mix(0.35, 1.0, daySun);
    float caustic = pow(max(0.0, cos(p.x * 0.49 + wind * 5.5 + 0.45 * uTime) *
      sin(p.y * 0.40 + wind * 6.1 - 0.58 * uTime)), 4.0);
    water += vec3(0.015, 0.048, 0.036) * caustic * (1.0 - deep) * detail * mix(0.28, 1.0, daySun);

    vec3 flatView = normalize(vec3(-viewDir.x, 0.0, -viewDir.z) + vec3(1e-5, 0.0, 0.0));
    vec3 flatSun = normalize(vec3(sunN.x, 0.0, sunN.z) + vec3(1e-5, 0.0, 0.0));
    float sunAzimuth = max(dot(flatView, flatSun), 0.0);
    vec3 warmScatter = mix(uSunColor, vec3(1.0, 0.44, 0.16), uSunsetWarmth)
                     * (0.03 + 0.14 * pow(sunAzimuth, 2.2) + 0.24 * uSunsetWarmth * pow(sunAzimuth, 1.5))
                     * (1.0 - smoothstep(0.35, 0.92, uMoonVis));
    vec3 horizon = uHorizonCol + warmScatter;

    float facing = max(dot(viewDir, n), 0.0);
    float fresnel = 0.024 + 0.976 * pow(1.0 - facing, 5.0);
    vec3 reflected = reflect(-viewDir, n);
    vec3 reflectedSky = mix(horizon, uSkyZenith, smoothstep(-0.035, 0.72, reflected.y));

    float solarPath = pow(max(dot(reflected, sunN), 0.0), 25.0);
    float glitter = pow(max(dot(n, normalize(viewDir + sunN)), 0.0), mix(36.0, 132.0, detail));

    vec2 crossing = p + sunN.xz * 13.0;
    float bridgeShadow = (1.0 - smoothstep(14.0, 23.0, abs(crossing.x))) *
      smoothstep(-399.0, -372.0, crossing.y) * (1.0 - smoothstep(-250.0, -224.0, crossing.y));
    vec3 col = mix(water * (1.0 - bridgeShadow * mix(0.18, 0.37, daySun)), reflectedSky, fresnel * 0.81);
    col += uSunColor * (solarPath * 0.22 + glitter * (0.16 + wind * 0.48)) * (0.16 + 0.84 * daySun);

    // Subtle shimmering moonlight glitter path on waves during twilight & midnight
    if (uMoonVis > 0.05) {
      vec3 moonDir = normalize(vec3(-0.36, 0.42, -0.83));
      float lunarPath = pow(max(dot(reflected, moonDir), 0.0), 30.0);
      float lunarGlitter = pow(max(dot(n, normalize(viewDir + moonDir)), 0.0), mix(46.0, 156.0, detail));
      col += vec3(0.68, 0.82, 1.0) * (lunarPath * 0.26 + lunarGlitter * (0.22 + wind * 0.56)) * uMoonVis;
    }

    float headland = abs(shore + 3.5 * sin(uTime * 0.43 + wind * 2.4)) / 14.0;
    float landing = abs(site - 0.955) / 0.14;
    float tideLine = min(headland, landing);
    float breakPhase = headland < landing ? shore * 0.68 : site * 58.0;
    float waveFront = sin(breakPhase + wind * 5.5 + 1.6 * uTime);
    float shoreFoam = (1.0 - smoothstep(0.32, 1.1, tideLine)) * smoothstep(0.64, 0.97, waveFront);
    shoreFoam *= mix(0.27, 0.92, smoothstep(0.29, 0.74, wind));
    float cap = smoothstep(0.38, 0.72, vCrest + (wind - 0.54) * 0.41) * detail * 0.19;
    col = mix(col, uFoam, clamp(shoreFoam + cap, 0.0, 0.8));

    float haze = smoothstep(340.0, 1540.0, cameraDistance);
    col = mix(col, horizon, haze);
    float distantFade = 1.0 - smoothstep(1550.0, 2900.0, cameraDistance);
    gl_FragColor = vec4(col, distantFade * mix(0.78, 0.99, max(deep, max(haze, fresnel))));
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

    // Full Metropolis Street Grid Mask (Avenues, Cross Boulevards, Sidewalks & Runway)
    bool inCanalCut = abs(p.y + 95.0) < 21.0 && p.x > 72.0;
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

    if (p.y < -330.0) {
      float grain = fbm(p * 1.8);
      float grade = fbm(vec2(p.x * 0.075, p.y * 0.31));
      float striations = smoothstep(0.72, 0.94, sin(p.x * 0.95 + p.y * 0.1)) * 0.055;
      vec3 compacted = mix(vec3(0.27, 0.155, 0.083), vec3(0.54, 0.37, 0.22), grain * 0.55 + grade * 0.45);
      vec3 beach = mix(vec3(0.34, 0.29, 0.19), vec3(0.63, 0.52, 0.36), grain);
      albedo = mix(beach, compacted - striations, smoothstep(0.8, 3.7, vWorldPos.y));
      float haulRoad = abs(p.x - sin((p.y + 400.0) * 0.027) * 9.0);
      float tireTrack = 1.0 - smoothstep(0.38, 1.15, abs(haulRoad - 3.7));
      if (p.y < -401.0 && p.y > -540.0) {
        albedo = mix(albedo, compacted * (0.82 - tireTrack * 0.15), 1.0 - smoothstep(7.1, 8.6, haulRoad));
      }
    } else if (onRoad) {
      // Crisp dark-charcoal weathered asphalt base with mineral micro-grain sparkle
      float aggCoarse = noise(p * 8.5);
      float aggFine = noise(p * 32.0);
      float aggMicro = noise(p * 95.0);
      float aggSparkle = smoothstep(0.76, 0.96, noise(p * 175.0));
      vec3 asphaltBase = vec3(0.088, 0.095, 0.112);
      asphaltBase += (aggFine - 0.5) * 0.028 + (aggMicro - 0.5) * 0.042 + (aggCoarse - 0.5) * 0.018;

      // Subtle tar repair seams
      float tarSeam = smoothstep(0.485, 0.5, abs(sin(p.y * 0.19 + noise(p * 0.6) * 2.2))) *
                      smoothstep(0.62, 0.78, noise(p * 0.35));
      asphaltBase = mix(asphaltBase, vec3(0.048, 0.052, 0.062), tarSeam * 0.7);

      // Polished dual wheel-track wear lanes
      float wearTrack1 = exp(-pow((abs(p.x) - 4.5) / 2.0, 2.0));
      float wearTrack2 = exp(-pow((abs(p.x) - 12.5) / 2.0, 2.0));
      float tireWear = clamp(wearTrack1 + wearTrack2, 0.0, 1.0) * (onGrandCentral ? 1.0 : 0.35);
      asphaltBase = mix(asphaltBase, vec3(0.122, 0.132, 0.150), tireWear * 0.46);

      // Perturb road normal subtly with mineral micro-grain
      n = normalize(n + vec3((aggMicro - 0.5) * 0.075, 0.0, (aggFine - 0.5) * 0.075));
      albedo = asphaltBase;
      specStrength = 0.14 + tireWear * 0.28 + aggMicro * 0.09 + aggSparkle * 0.18;
      specPower = mix(34.0, 52.0, tireWear * 0.6 + aggSparkle * 0.4);

      float paintNoise = 0.88 + 0.12 * aggFine;
      vec3 yellowPaint = vec3(0.96, 0.73, 0.14) * paintNoise;
      vec3 whitePaint = vec3(0.92, 0.94, 0.96) * paintNoise;

      // Intersection box where Grand Central Ave meets Cross Boulevards
      bool inIntersectionBox = onGrandCentral && onCrossBlvd;

      // Zebra Crosswalks at every intersection (z near 0, -120, +80, -60, +40)
      bool inGrandZebra =
        abs(abs(p.y) - 13.5) < 2.2 ||
        abs(abs(p.y + 120.0) - 12.2) < 2.2 ||
        abs(abs(p.y - 80.0) - 12.2) < 2.2 ||
        abs(p.y + 60.0) < 2.2 ||
        abs(p.y - 40.0) < 2.2;

      bool inCrossZebra = onCrossBlvd && abs(abs(p.x) - 20.2) < 2.2;

      // Crisp reflective traffic markings on Grand Central Avenue
      if (onGrandCentral && p.y > -220.0 && p.y < 190.0) {
        // Double amber-yellow center line
        if (abs(abs(p.x) - 0.32) < 0.14 && !inGrandZebra && !inIntersectionBox) {
          albedo = yellowPaint;
          specStrength = 0.35;
        }
        // Dashed white lane dividers (4 lanes: ±9.0m)
        if (abs(abs(p.x) - 9.0) < 0.13 && fract(p.y * 0.12) < 0.45 && !inGrandZebra && !inIntersectionBox) {
          albedo = whitePaint;
          specStrength = 0.35;
        }
        // Solid white shoulder lines
        if (abs(abs(p.x) - 16.8) < 0.16 && !inIntersectionBox) {
          albedo = whitePaint;
          specStrength = 0.32;
        }
        // Zebra crosswalk stripes across Grand Central Avenue
        if (inGrandZebra && abs(p.x) < 16.5) {
          float zebra = step(0.45, fract(p.x * 0.65));
          albedo = mix(albedo, whitePaint, zebra * 0.92);
          specStrength = mix(specStrength, 0.34, zebra);
        }
      }

      // Cross-Boulevard lane markings & crosswalks (North z=-120, Midtown z=0, South z=+80)
      if (onCrossBlvd && !onGrandCentral) {
        float centerZ = onNorthCross ? -120.0 : (onMidtownCross ? 0.0 : 80.0);
        float halfW = onMidtownCross ? 11.0 : 10.0;
        float dz = abs(p.y - centerZ);

        if (abs(dz - 0.28) < 0.12 && !inCrossZebra) {
          albedo = yellowPaint;
          specStrength = 0.35;
        } else if (abs(dz - 5.0) < 0.12 && fract(p.x * 0.12) < 0.45 && !inCrossZebra) {
          albedo = whitePaint;
          specStrength = 0.35;
        } else if (abs(dz - (halfW - 1.1)) < 0.15) {
          albedo = whitePaint;
          specStrength = 0.32;
        }

        if (inCrossZebra && dz < halfW - 1.2) {
          float zebra = step(0.45, fract(p.y * 0.65));
          albedo = mix(albedo, whitePaint, zebra * 0.92);
          specStrength = mix(specStrength, 0.34, zebra);
        }
      }

      // Airport Runway markings
      if (onRunway) {
        float rwCenterZ = 155.0;
        if (abs(p.y - rwCenterZ) < 0.35 && fract(p.x * 0.08) < 0.55) {
          albedo = vec3(0.92, 0.94, 0.96);
        }
        if (abs(abs(p.y - rwCenterZ) - 19.2) < 0.22) {
          albedo = vec3(0.92, 0.94, 0.96);
        }
        // Runway threshold piano keys
        if ((abs(p.x + 202.0) < 4.5 || abs(p.x + 53.0) < 4.5) && abs(p.y - rwCenterZ) < 11.5) {
          float keyMask = step(0.45, fract(p.y * 0.6));
          albedo = mix(albedo, vec3(0.93, 0.95, 0.97), keyMask);
        }
      }

      // Dark gutter AO crease at curb boundary
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
        // Raised Granite Curb Edge
        vec3 graniteCurb = vec3(0.76, 0.73, 0.69) + (noise(p * 24.0) - 0.5) * 0.05;
        albedo = graniteCurb * 0.82;
        specStrength = 0.14;
      } else {
        // Brushed Concrete & Travertine Paver Sidewalk with crisp mortar grid joints
        vec2 tileUV = p * 0.85;
        vec2 tileId = floor(tileUV);
        vec2 tileF = fract(tileUV);
        float tileVar = hash(tileId) * 0.06 - 0.03;
        float stoneGrain = fbm(p * 6.5) * 0.04;
        vec3 paver = vec3(0.80, 0.79, 0.76) + tileVar + stoneGrain;

        float jointX = smoothstep(0.0, 0.045, tileF.x) * smoothstep(0.0, 0.045, 1.0 - tileF.x);
        float jointY = smoothstep(0.0, 0.045, tileF.y) * smoothstep(0.0, 0.045, 1.0 - tileF.y);
        float mortarMask = jointX * jointY;
        albedo = mix(vec3(0.50, 0.49, 0.47), paver, mortarMask);
        specStrength = 0.15;
        specPower = 32.0;
      }
    } else {
      // Urban City Blocks (Paved Architectural Plazas & Manicured City Turf) + Coastal Beaches
      float h = vWorldPos.y;
      float slope = 1.0 - n.y;
      float macroN = fbm(p * 0.04);
      float medN = fbm(p * 0.18);
      float bladeN1 = noise(p * 14.0);
      float bladeN2 = noise(p * 48.0);
      float microBlades = bladeN1 * 0.65 + bladeN2 * 0.35;

      bool inMetropolisBlocks = abs(p.x) < 135.0 && abs(p.y) < 165.0 && !inCanalCut && h > 2.2;

      if (inMetropolisBlocks) {
        // Architectural stone plaza perimeter around buildings + manicured emerald city park lawns
        vec2 blockUV = p * 0.45;
        vec2 blockId = floor(blockUV);
        vec2 blockF = fract(blockUV);
        float jX = smoothstep(0.0, 0.04, blockF.x) * smoothstep(0.0, 0.04, 1.0 - blockF.x);
        float jY = smoothstep(0.0, 0.04, blockF.y) * smoothstep(0.0, 0.04, 1.0 - blockF.y);
        float tileJoint = jX * jY;
        float tileTone = hash(blockId) * 0.05 - 0.025;
        vec3 plazaStone = mix(vec3(0.42, 0.44, 0.47), vec3(0.66, 0.68, 0.70) + tileTone, tileJoint);

        // Manicured city park turf strips with smooth velvety lawn shading
        vec3 cityTurfA = vec3(0.15, 0.35, 0.15);
        vec3 cityTurfB = vec3(0.23, 0.45, 0.19);
        float mowStripe = smoothstep(0.32, 0.68, fract((p.x + p.y) * 0.16));
        vec3 manicuredTurf = mix(cityTurfA, cityTurfB, mowStripe * 0.36 + smoothstep(0.25, 0.75, macroN) * 0.64);
        manicuredTurf = mix(manicuredTurf, vec3(0.28, 0.48, 0.21), smoothstep(0.45, 0.85, medN) * 0.24);
        manicuredTurf *= 0.92 + 0.16 * microBlades;

        // Blend paved stone plazas near avenues (|x| < 68 or near cross boulevards) with park turf
        float nearAve = max(
          1.0 - smoothstep(24.0, 42.0, abs(p.x)),
          max(
            1.0 - smoothstep(14.0, 28.0, abs(p.y)),
            1.0 - smoothstep(14.0, 28.0, min(abs(p.y + 120.0), abs(p.y - 80.0)))
          )
        );
        float plazaMask = clamp(nearAve + smoothstep(0.45, 0.68, macroN) * 0.65, 0.0, 1.0);
        albedo = mix(manicuredTurf, plazaStone, plazaMask);
        specStrength = mix(0.08, 0.15, plazaMask);
        specPower = mix(20.0, 32.0, plazaMask);
      } else {
        // Wet Shoreline Sand (h < 0.85)
        vec3 wetSand = vec3(0.51, 0.39, 0.27) + (bladeN2 - 0.5) * 0.028;

        // Smooth, Warm Wind-Rippled Beach Sand (0.75 .. 2.15)
        float ripple = sin(p.x * 2.1 + p.y * 1.4 + noise(p * 0.35) * 3.2) * 0.5 + 0.5;
        float sandSparkle = smoothstep(0.82, 0.98, noise(p * 42.0)) * 0.032;
        vec3 drySand = vec3(0.89, 0.77, 0.56) + (ripple - 0.5) * 0.022 + (bladeN1 - 0.5) * 0.024 + sandSparkle;

        // Lush Coastal Grass & Parkland (h >= 1.85) with smooth sunlit organic shading
        vec3 meadowFescue = vec3(0.15, 0.33, 0.13);
        vec3 oliveSage = vec3(0.26, 0.42, 0.17);
        vec3 dryTufts = vec3(0.40, 0.41, 0.21);
        vec3 darkLoam = vec3(0.16, 0.14, 0.10);

        vec3 grassCol = mix(meadowFescue, oliveSage, smoothstep(0.24, 0.76, macroN));
        float sunCuredMask = smoothstep(0.54, 0.84, medN * 0.72 + (1.0 - macroN) * 0.32);
        grassCol = mix(grassCol, dryTufts, sunCuredMask * 0.36);
        float creviceMask = (1.0 - smoothstep(0.16, 0.38, microBlades));
        grassCol = mix(grassCol, darkLoam, creviceMask * 0.34);
        grassCol *= 0.90 + 0.20 * microBlades;

        // Sedimentary Limestone Cliff Rock (steep slopes or high peaks, clear of coastal beaches)
        float strata = sin(vWorldPos.y * 4.2 + noise(p * 0.3) * 2.0) * 0.5 + 0.5;
        vec3 cliffRock = vec3(0.44, 0.41, 0.37) + (strata - 0.5) * 0.09 + (bladeN1 - 0.5) * 0.05;
        cliffRock = mix(cliffRock, vec3(0.30, 0.28, 0.25), smoothstep(0.65, 0.9, noise(p * 1.4)) * 0.45);

        float noisyH = h + (medN - 0.5) * 0.28;
        if (noisyH < 0.82) {
          float wetToDry = smoothstep(0.32, 0.82, noisyH);
          albedo = mix(wetSand, drySand, wetToDry);
          specStrength = mix(0.52, 0.06, wetToDry);
          specPower = 64.0;
        } else if (noisyH < 2.16) {
          float sandToGrass = smoothstep(1.62, 2.14, noisyH);
          albedo = mix(drySand, grassCol, sandToGrass);
          specStrength = 0.05;
          n = normalize(n + vec3((bladeN2 - 0.5) * 0.16, 0.0, (bladeN1 - 0.5) * 0.16) * sandToGrass);
        } else {
          albedo = grassCol;
          specStrength = 0.06;
          n = normalize(n + vec3((bladeN2 - 0.5) * 0.22, 0.0, (bladeN1 - 0.5) * 0.22));
        }

        float cliffMask = clamp(
          smoothstep(0.11, 0.22, slope) * smoothstep(1.5, 2.4, h) + smoothstep(7.5, 9.2, h + (macroN - 0.5) * 0.8),
          0.0,
          1.0
        );
        if (cliffMask > 0.001) {
          albedo = mix(albedo, cliffRock, cliffMask);
          specStrength = mix(specStrength, 0.09, cliffMask);
        }
      }
    }

    // Convert procedural sRGB albedo into linear color space for accurate theme lighting & ACES tone mapping
    albedo = pow(max(albedo, vec3(0.0)), vec3(2.2));

    float shadow = mix(0.44, 1.0, getShadowMask());
    // Analytical Directional Sunlight/Moonlight + Theme-Matched Sky Hemisphere Lighting
    float ndl = max(dot(n, sunDir), 0.0);
    float wrapDiff = max(0.0, (dot(n, sunDir) + 0.25) / 1.25);
    vec3 groundBounce = uAmbientCol * vec3(0.45, 0.42, 0.38) + vec3(0.008, 0.010, 0.014);
    vec3 skyAmb = mix(groundBounce, uAmbientCol, 0.5 + 0.5 * n.y);
    vec3 sunLight = uSunLightCol * (ndl * 0.74 + wrapDiff * 0.26) * shadow;

    // Specular highlight (wet sand water film & worn tire tracks)
    float ndh = max(dot(n, halfVec), 0.0);
    float spec = pow(ndh, specPower) * specStrength * shadow;
    vec3 specCol = uSunLightCol * spec * 0.72;

    vec3 finalCol = albedo * (skyAmb + sunLight) + specCol;

    vec3 flatView = normalize(vec3(-viewDir.x, 0.0, -viewDir.z) + vec3(1e-5, 0.0, 0.0));
    vec3 flatSun = normalize(vec3(sunDir.x, 0.0, sunDir.z) + vec3(1e-5, 0.0, 0.0));
    float sunAzimuth = max(dot(flatView, flatSun), 0.0);
    vec3 warmScatter = mix(uSunColor, vec3(1.0, 0.44, 0.16), uSunsetWarmth)
                     * (0.03 + 0.14 * pow(sunAzimuth, 2.2) + 0.24 * uSunsetWarmth * pow(sunAzimuth, 1.5))
                     * (1.0 - smoothstep(0.35, 0.92, uMoonVis));
    vec3 horizon = uHorizonCol + warmScatter;

    float camDist = length(vWorldPos - uCameraPos);
    float distHaze = smoothstep(420.0, 1500.0, camDist);
    finalCol = mix(finalCol, horizon, distHaze * 0.88);
    gl_FragColor = vec4(finalCol, 1.0);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }
`;

