export const skyVertexShader = /* glsl */ `
  varying vec3 vWorldPos;
  void main() {
    vec4 wp = modelMatrix * vec4(position, 1.0);
    vWorldPos = wp.xyz;
    gl_Position = projectionMatrix * viewMatrix * wp;
  }
`;

export const skyFragmentShader = /* glsl */ `
  uniform float uTime;
  uniform vec3 uZenith;
  uniform vec3 uHorizon;
  uniform vec3 uSunColor;
  uniform vec3 uSunDir;
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

  void main() {
    vec3 dir = normalize(vWorldPos);
    float h = clamp(dir.y, 0.0, 1.0);
    vec3 col = mix(uHorizon, uZenith, pow(h, 0.48));

    // Warm atmospheric horizon scatter + Mie sun scattering + crisp solar corona
    float sunDot = max(dot(dir, normalize(uSunDir)), 0.0);
    float horizonGlow = pow(1.0 - h, 4.0);
    col += vec3(1.0, 0.89, 0.74) * horizonGlow * (0.22 + 0.42 * pow(sunDot, 2.0));
    col += uSunColor * pow(sunDot, 6.0) * 0.30;
    col += uSunColor * pow(sunDot, 48.0) * 0.58;
    col += vec3(1.0, 0.95, 0.82) * pow(sunDot, 180.0) * 0.95;
    col += vec3(1.0, 0.99, 0.94) * smoothstep(0.9974, 0.9995, sunDot) * 2.0;

    // Soft layered cumulus clouds
    if (dir.y > 0.03) {
      vec2 uv = dir.xz / (dir.y + 0.18) * 1.3 + vec2(uTime * 0.008, uTime * 0.004);
      float c = noise(uv * 2.0) * 0.6 + noise(uv * 4.5) * 0.3 + noise(uv * 9.0) * 0.1;
      float cloudAlpha = smoothstep(0.54, 0.78, c) * smoothstep(0.03, 0.22, dir.y) * (1.0 - smoothstep(0.65, 0.95, dir.y));
      col = mix(col, vec3(0.99, 0.98, 0.96), cloudAlpha * 0.65);
    }

    gl_FragColor = vec4(col, 1.0);
  }
`;

export const waterVertexShader = /* glsl */ `
  uniform float uTime;
  varying vec3 vWorldPos;
  varying vec3 vNormal;
  varying float vCrest;

  void main() {
    vec3 pos = position;
    float w1 = 0.35 * sin(0.11 * pos.x + 1.25 * uTime);
    float w2 = 0.20 * sin(0.22 * (0.7 * pos.x + 0.7 * pos.z) + 1.8 * uTime);
    float w3 = 0.11 * sin(0.41 * (-0.4 * pos.x + 0.9 * pos.z) + 2.3 * uTime);
    pos.y += w1 + w2 + w3;
    vCrest = (w1 + w2 + w3);

    float dx = 0.35 * 0.11 * cos(0.11 * pos.x + 1.25 * uTime) + 0.20 * 0.22 * 0.7 * cos(0.22 * (0.7 * pos.x + 0.7 * pos.z) + 1.8 * uTime);
    float dz = 0.20 * 0.22 * 0.7 * cos(0.22 * (0.7 * pos.x + 0.7 * pos.z) + 1.8 * uTime) + 0.11 * 0.41 * 0.9 * cos(0.41 * (-0.4 * pos.x + 0.9 * pos.z) + 2.3 * uTime);
    vNormal = normalize(vec3(-dx, 1.0, -dz));

    vec4 wp = modelMatrix * vec4(pos, 1.0);
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
  uniform vec3 uCameraPos;
  varying vec3 vWorldPos;
  varying vec3 vNormal;
  varying float vCrest;

  void main() {
    vec2 p = vWorldPos.xz;
    float dist = length(vWorldPos.xz);
    bool inCanal = abs(vWorldPos.z + 95.0) < 24.0 && vWorldPos.x > 65.0 && vWorldPos.x < 290.0;

    // Per-fragment multi-octave wave normal for silky sun glints (zero triangle faceting)
    float dx = 0.08 * cos(0.09 * p.x + 1.2 * uTime)
             + 0.05 * cos(0.24 * p.x + 0.16 * p.y + 1.8 * uTime)
             + 0.03 * cos(0.55 * p.x - 0.35 * p.y + 2.6 * uTime);
    float dz = 0.08 * cos(0.08 * p.y - 1.1 * uTime)
             + 0.05 * cos(0.16 * p.x + 0.24 * p.y + 1.8 * uTime)
             + 0.03 * cos(-0.35 * p.x + 0.55 * p.y + 2.4 * uTime);
    vec3 n = normalize(vec3(-dx, 1.0, -dz));

    vec3 viewDir = normalize(uCameraPos - vWorldPos);
    float fresnel = pow(1.0 - max(dot(viewDir, n), 0.0), 3.4);

    // Depth-based coastal turquoise to offshore Mediterranean sapphire gradient
    vec3 shallowTurquoise = mix(uShallow, vec3(0.08, 0.78, 0.88), 0.75);
    vec3 deepSapphire = mix(uDeep, vec3(0.02, 0.32, 0.62), 0.8);
    float offshoreDepth = inCanal ? 0.06 : smoothstep(220.0, 290.0, dist);
    vec3 base = mix(shallowTurquoise, deepSapphire, clamp(offshoreDepth * 0.78 + fresnel * 0.38, 0.0, 1.0));

    // Subtle caustic shimmer in shallow coastal & Venetian canal waters
    float caustic = sin(p.x * 0.38 + uTime * 2.1) * cos(p.y * 0.38 - uTime * 1.7);
    base += vec3(0.06, 0.18, 0.20) * max(caustic, 0.0) * (1.0 - offshoreDepth) * 0.45;

    // Sky reflection tint on grazing angles
    vec3 skyReflect = vec3(0.76, 0.91, 0.99);
    base = mix(base, skyReflect, fresnel * 0.50);

    // Warm golden sun-glare path across waves + crisp sunlit specular sparkle
    vec3 halfVec = normalize(viewDir + normalize(uSunDir));
    float ndh = max(dot(n, halfVec), 0.0);
    float goldenPath = pow(ndh, 26.0);
    float spec = pow(ndh, 150.0);
    base += vec3(1.0, 0.86, 0.55) * goldenPath * 0.42;
    base += vec3(1.0, 0.97, 0.88) * spec * 1.45;

    // Open-water whitecap interference
    float wA = sin(0.18 * p.x + 0.11 * p.y + 1.6 * uTime);
    float wB = sin(-0.14 * p.x + 0.21 * p.y - 1.3 * uTime);
    float openFoam = smoothstep(0.72, 0.96, wA * wB) * (0.35 + 0.65 * fresnel) * 0.35;

    // Breaking whitewater surf foam rings along the island beach shoreline (225..268m)
    float totalFoam = openFoam;
    if (dist > 224.0 && dist < 270.0) {
      float surfZone = smoothstep(225.0, 236.0, dist) * (1.0 - smoothstep(254.0, 268.0, dist));
      float warp = sin(p.x * 0.07 + p.y * 0.05) * 2.4;
      float breaker1 = sin(dist * 0.52 + warp + uTime * 2.5);
      float surfFoam = surfZone * smoothstep(0.36, 0.86, breaker1) * 0.85;
      totalFoam = clamp(openFoam + surfFoam, 0.0, 1.0);
    }

    vec3 col = mix(base, uFoam, totalFoam);
    float alpha = mix(0.84, 0.95, clamp(offshoreDepth + totalFoam * 0.5, 0.0, 1.0));
    gl_FragColor = vec4(col, alpha);
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
    float dotMask = smoothstep(0.45, 0.28, distance(fpos, vec2(0.5)));

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
  varying vec3 vWorldPos;
  varying vec3 vNormal;
  varying vec2 vUv;

  void main() {
    vUv = uv;
    vec4 wp = modelMatrix * vec4(position, 1.0);
    vWorldPos = wp.xyz;
    vNormal = normalize(mat3(modelMatrix) * normal);
    gl_Position = projectionMatrix * viewMatrix * wp;
  }
`;

export const terrainFragmentShader = /* glsl */ `
  uniform vec3 uSunDir;
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

    // Road, Cross-Boulevard, Sidewalk & Runway Masks
    bool onMainStrip = abs(p.x) < 22.0 && abs(p.y) < 126.0;
    bool onVeniceBlvd = abs(p.y + 85.0) < 10.0 && p.x >= 22.0 && p.x < 145.0;
    bool onCrossBlvd = (abs(p.y - 87.0) < 11.0 && p.x > -105.0 && p.x <= -22.0) ||
                       (abs(p.x + 82.0) < 14.0 && p.y >= 32.0 && p.y <= 98.0) ||
                       (abs(p.y - 35.0) < 10.0 && p.x >= 22.0 && p.x < 102.0);
    bool onRunway = p.x > -210.0 && p.x < -45.0 && p.y > 135.0 && p.y < 165.0;
    bool onSidewalk = abs(p.x) >= 22.0 && abs(p.x) < 30.0 && abs(p.y) < 126.0 && !onVeniceBlvd && !onCrossBlvd;

    vec3 albedo = vec3(0.25);
    float specStrength = 0.0;
    float specPower = 24.0;

    if (onMainStrip || onVeniceBlvd || onCrossBlvd || onRunway) {
      // Rich dark weathered asphalt base with multi-frequency aggregate sparkle
      float aggCoarse = noise(p * 8.5);
      float aggFine = noise(p * 32.0);
      float aggMicro = noise(p * 95.0);
      vec3 asphaltBase = vec3(0.11, 0.12, 0.14);
      asphaltBase += (aggFine - 0.5) * 0.032 + (aggMicro - 0.5) * 0.048 + (aggCoarse - 0.5) * 0.022;

      // Subtle tar repair seams
      float tarSeam = smoothstep(0.485, 0.5, abs(sin(p.y * 0.19 + noise(p * 0.6) * 2.2))) *
                      smoothstep(0.62, 0.78, noise(p * 0.35));
      asphaltBase = mix(asphaltBase, vec3(0.06, 0.065, 0.075), tarSeam * 0.65);

      // Polished dual wheel-track wear lanes
      float wearTrack1 = exp(-pow((abs(p.x) - 5.5) / 2.2, 2.0));
      float wearTrack2 = exp(-pow((abs(p.x) - 14.5) / 2.2, 2.0));
      float tireWear = clamp(wearTrack1 + wearTrack2, 0.0, 1.0) * (onMainStrip ? 1.0 : 0.35);
      asphaltBase = mix(asphaltBase, vec3(0.145, 0.155, 0.175), tireWear * 0.42);

      // Perturb road normal slightly with micro-aggregate
      n = normalize(n + vec3((aggMicro - 0.5) * 0.06, 0.0, (aggFine - 0.5) * 0.06));
      albedo = asphaltBase;
      specStrength = 0.12 + tireWear * 0.26 + aggMicro * 0.08;
      specPower = 28.0;

      // Crisp reflective traffic markings on the Strip
      if (onMainStrip && abs(p.y) < 122.0) {
        float paintNoise = 0.88 + 0.12 * aggFine;
        vec3 yellowPaint = vec3(0.96, 0.73, 0.14) * paintNoise;
        vec3 whitePaint = vec3(0.92, 0.94, 0.96) * paintNoise;

        // Crosswalk Zebra Stripes
        bool inCrosswalk = abs(p.y - 22.0) < 2.4 || abs(p.y + 52.0) < 2.4 ||
                           abs(p.y - 58.0) < 2.4 || abs(p.y + 92.0) < 2.4;

        // Double amber-yellow center line
        if (abs(abs(p.x) - 0.35) < 0.14 && !inCrosswalk) {
          albedo = yellowPaint;
          specStrength = 0.35;
        }
        // Dashed white lane dividers
        if (abs(abs(p.x) - 10.5) < 0.13 && fract(p.y * 0.12) < 0.45 && !inCrosswalk) {
          albedo = whitePaint;
          specStrength = 0.35;
        }
        // Solid white shoulder lines
        if (abs(abs(p.x) - 20.6) < 0.16) {
          albedo = whitePaint;
          specStrength = 0.32;
        }
        // Crosswalk stripes across main road
        if (inCrosswalk && abs(p.x) < 20.0) {
          float zebra = step(0.45, fract(p.x * 0.65));
          albedo = mix(albedo, whitePaint, zebra * 0.92);
          specStrength = mix(specStrength, 0.34, zebra);
        }
      }

      // Cross-boulevard center lines
      if ((onVeniceBlvd || onCrossBlvd) && !onMainStrip) {
        float centerTarget = onVeniceBlvd ? -85.0 : 35.0;
        if (abs(abs(p.y - centerTarget) - 0.3) < 0.12) {
          albedo = vec3(0.94, 0.71, 0.15);
        } else if (abs(abs(p.y - centerTarget) - 8.6) < 0.14) {
          albedo = vec3(0.90, 0.92, 0.94);
        }
      }

      // Airport Runway markings
      if (onRunway) {
        float rwCenterZ = 150.0;
        if (abs(p.y - rwCenterZ) < 0.35 && fract(p.x * 0.08) < 0.55) {
          albedo = vec3(0.92, 0.94, 0.96);
        }
        if (abs(abs(p.y - rwCenterZ) - 13.0) < 0.22) {
          albedo = vec3(0.92, 0.94, 0.96);
        }
        // Runway threshold piano keys
        if ((abs(p.x + 202.0) < 4.5 || abs(p.x + 53.0) < 4.5) && abs(p.y - rwCenterZ) < 11.5) {
          float keyMask = step(0.45, fract(p.y * 0.6));
          albedo = mix(albedo, vec3(0.93, 0.95, 0.97), keyMask);
        }
      }

      // Dark gutter AO crease at curb boundary
      if (onMainStrip && abs(abs(p.x) - 22.0) < 0.45) {
        float gutterAO = smoothstep(0.0, 0.45, abs(abs(p.x) - 22.0));
        albedo *= 0.52 + 0.48 * gutterAO;
      }
    } else if (onSidewalk) {
      float ax = abs(p.x);
      if (ax < 22.6) {
        // Raised Curb Edge: alternating red/white near corners + warm granite curb
        bool nearCorner = abs(p.y - 22.0) < 6.0 || abs(p.y + 52.0) < 6.0 ||
                          abs(p.y - 58.0) < 6.0 || abs(p.y + 92.0) < 6.0;
        vec3 graniteCurb = vec3(0.76, 0.73, 0.67) + (noise(p * 24.0) - 0.5) * 0.05;
        if (nearCorner) {
          float stripe = step(0.5, fract(p.y * 0.55));
          graniteCurb = mix(vec3(0.78, 0.16, 0.14), vec3(0.92, 0.91, 0.88), stripe);
        }
        // Dark gutter crease at 22.0
        float curbAO = smoothstep(0.0, 0.35, abs(ax - 22.0));
        albedo = graniteCurb * (0.65 + 0.35 * curbAO);
        specStrength = 0.14;
      } else {
        // Travertine Stone Sidewalk with crisp mortar grid joints
        vec2 tileUV = p * 0.85;
        vec2 tileId = floor(tileUV);
        vec2 tileF = fract(tileUV);
        float tileVar = hash(tileId) * 0.08 - 0.04;
        float stoneGrain = fbm(p * 6.5) * 0.05;
        vec3 travertine = vec3(0.83, 0.79, 0.71) + tileVar + stoneGrain;

        // Mortar joint lines
        float jointX = smoothstep(0.0, 0.045, tileF.x) * smoothstep(0.0, 0.045, 1.0 - tileF.x);
        float jointY = smoothstep(0.0, 0.045, tileF.y) * smoothstep(0.0, 0.045, 1.0 - tileF.y);
        float mortarMask = jointX * jointY;
        albedo = mix(vec3(0.52, 0.49, 0.44), travertine, mortarMask);

        // Soft outer sidewalk AO
        float outerAO = 1.0 - 0.25 * smoothstep(29.1, 30.0, ax);
        albedo *= outerAO;
        specStrength = 0.16;
        specPower = 32.0;
      }
    } else {
      // Natural Realistic Grass, Coastal Scrub, Limestone Cliffs & Beach Sand
      float h = vWorldPos.y;
      float slope = 1.0 - n.y;
      float macroN = fbm(p * 0.04);
      float medN = fbm(p * 0.18);
      float bladeN1 = noise(p * 14.0);
      float bladeN2 = noise(p * 48.0);
      float microBlades = bladeN1 * 0.65 + bladeN2 * 0.35;

      // Wet Shoreline Sand (h < 0.75)
      vec3 wetSand = vec3(0.46, 0.40, 0.31) + (bladeN2 - 0.5) * 0.035;

      // Dry Wind-Rippled Beach Sand (0.75 .. 1.85)
      float ripple = sin(p.x * 3.5 + p.y * 2.2 + noise(p * 0.5) * 4.0) * 0.5 + 0.5;
      vec3 drySand = vec3(0.82, 0.74, 0.58) + (ripple - 0.5) * 0.045 + (bladeN1 - 0.5) * 0.03;

      // Photorealistic Multi-Tone Grass & Mediterranean Scrub (h >= 1.85)
      vec3 meadowFescue = vec3(0.16, 0.29, 0.11);
      vec3 oliveSage = vec3(0.28, 0.39, 0.16);
      vec3 dryTufts = vec3(0.48, 0.44, 0.22);
      vec3 darkLoam = vec3(0.18, 0.15, 0.11);

      vec3 grassCol = mix(meadowFescue, oliveSage, smoothstep(0.28, 0.72, macroN));
      float sunCuredMask = smoothstep(0.52, 0.82, medN * 0.75 + (1.0 - macroN) * 0.35);
      grassCol = mix(grassCol, dryTufts, sunCuredMask * 0.65);
      // Dark soil/loam underlayer in micro-crevices + blade tips brightening
      float creviceMask = smoothstep(0.42, 0.18, microBlades);
      grassCol = mix(grassCol, darkLoam, creviceMask * 0.55);
      grassCol *= 0.88 + 0.26 * microBlades;

      // Sedimentary Limestone Cliff Rock (steep slopes or high peaks)
      float strata = sin(vWorldPos.y * 4.2 + noise(p * 0.3) * 2.0) * 0.5 + 0.5;
      vec3 cliffRock = vec3(0.44, 0.41, 0.37) + (strata - 0.5) * 0.09 + (bladeN1 - 0.5) * 0.05;
      cliffRock = mix(cliffRock, vec3(0.30, 0.28, 0.25), smoothstep(0.65, 0.9, noise(p * 1.4)) * 0.45);

      // Elevation & slope transitions with organic noise breakup
      float noisyH = h + (medN - 0.5) * 0.32;
      if (noisyH < 0.75) {
        float wetToDry = smoothstep(0.45, 0.75, noisyH);
        albedo = mix(wetSand, drySand, wetToDry);
        specStrength = mix(0.55, 0.06, wetToDry);
        specPower = 64.0;
      } else if (noisyH < 1.85) {
        float sandToGrass = smoothstep(1.35, 1.85, noisyH);
        albedo = mix(drySand, grassCol, sandToGrass);
        specStrength = 0.05;
        // Perturb normal for grass micro-relief
        n = normalize(n + vec3((bladeN2 - 0.5) * 0.18, 0.0, (bladeN1 - 0.5) * 0.18) * sandToGrass);
      } else {
        albedo = grassCol;
        specStrength = 0.06;
        n = normalize(n + vec3((bladeN2 - 0.5) * 0.22, 0.0, (bladeN1 - 0.5) * 0.22));
      }

      // Blend cliff rock on steep slopes or high elevations
      float cliffMask = clamp(
        smoothstep(0.11, 0.22, slope) + smoothstep(7.5, 9.2, h + (macroN - 0.5) * 0.8),
        0.0,
        1.0
      );
      if (cliffMask > 0.001) {
        albedo = mix(albedo, cliffRock, cliffMask);
        specStrength = mix(specStrength, 0.09, cliffMask);
      }
    }

    // Analytical Soft Building & Palm Shadows cast along -sunDir.xz
    float shadow = 1.0;
    vec2 sunProj = p + sunDir.xz * 18.0;

    // Strip hotel tower row shadows
    if (abs(sunProj.x) > 30.0 && abs(sunProj.x) < 56.0 && abs(sunProj.y) < 110.0) {
      float towerRow = smoothstep(30.0, 35.0, abs(sunProj.x)) * (1.0 - smoothstep(51.0, 56.0, abs(sunProj.x)));
      float towerGap = smoothstep(-0.2, 0.35, sin(sunProj.y * 0.48));
      shadow = min(shadow, 1.0 - 0.38 * towerRow * towerGap);
    }

    // Luxor & Eiffel landmark analytical shadows
    float luxorDist = length((p + sunDir.xz * 26.0) - vec2(-82.0, 32.0));
    float luxorDistActual = length((p + sunDir.xz * 26.0) - vec2(-115.0, 85.0));
    shadow = min(shadow, 0.62 + 0.38 * smoothstep(14.0, 28.0, min(luxorDist, luxorDistActual)));

    float eiffelDist = length((p + sunDir.xz * 28.0) - vec2(-72.0, -62.0));
    float eiffelDistActual = length((p + sunDir.xz * 28.0) - vec2(95.0, 35.0));
    shadow = min(shadow, 0.66 + 0.34 * smoothstep(10.0, 24.0, min(eiffelDist, eiffelDistActual)));

    // Repeating dappled palm-frond shadows along Strip sidewalks
    if (abs(p.x) > 17.5 && abs(p.x) < 28.5 && abs(p.y) < 118.0) {
      vec2 palmProj = p + sunDir.xz * 5.2;
      float palmSideX = palmProj.x > 0.0 ? 23.5 : -23.5;
      float palmCellZ = floor((palmProj.y + 7.0) / 14.0) * 14.0;
      vec2 dPalm = palmProj - vec2(palmSideX, palmCellZ);
      float rPalm = length(dPalm);
      if (rPalm < 4.4) {
        float ang = atan(dPalm.y, dPalm.x);
        float fronds = smoothstep(-0.25, 0.55, cos(ang * 7.0 + rPalm * 0.8));
        float canopyFalloff = (1.0 - smoothstep(1.2, 4.3, rPalm)) * fronds;
        shadow = min(shadow, 1.0 - canopyFalloff * 0.42);
      }
    }

    // Analytical Directional Sunlight + Sky Hemisphere Lighting
    float ndl = max(dot(n, sunDir), 0.0);
    float wrapDiff = max(0.0, (dot(n, sunDir) + 0.25) / 1.25);
    vec3 skyAmb = mix(vec3(0.22, 0.25, 0.30), vec3(0.55, 0.68, 0.82), 0.5 + 0.5 * n.y);
    vec3 sunLight = vec3(1.02, 0.96, 0.86) * (ndl * 0.72 + wrapDiff * 0.28) * shadow;

    // Specular highlight (wet sand water film & worn tire tracks)
    float ndh = max(dot(n, halfVec), 0.0);
    float spec = pow(ndh, specPower) * specStrength * shadow;
    vec3 specCol = vec3(1.0, 0.95, 0.84) * spec;

    vec3 finalCol = albedo * (skyAmb * 0.52 + sunLight) + specCol;
    gl_FragColor = vec4(finalCol, 1.0);
  }
`;

