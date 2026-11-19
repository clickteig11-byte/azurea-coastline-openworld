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

    // Natural photographic daytime sky palette (#1d6fa5 cerulean zenith -> #cfe4f5 pale-azure horizon)
    // Preserves warm roulette tint when uZenith shifts red/amber
    float isDaySky = smoothstep(0.15, 0.45, uZenith.b - uZenith.r);
    vec3 photoZenith = mix(uZenith, vec3(0.114, 0.435, 0.647), isDaySky * 0.82);
    vec3 photoHorizon = mix(uHorizon, vec3(0.812, 0.894, 0.961), isDaySky * 0.82);
    vec3 midSky = mix(photoHorizon, photoZenith, 0.46) + vec3(0.015, 0.03, 0.045) * isDaySky;

    vec3 col = mix(photoHorizon, midSky, smoothstep(0.0, 0.28, h));
    col = mix(col, photoZenith, pow(smoothstep(0.12, 1.0, h), 0.72));

    // Subtle warm golden-hour Mie halo around the sun + horizon atmospheric scatter
    vec3 sunN = normalize(uSunDir);
    float sunDot = max(dot(dir, sunN), 0.0);
    float horizonGlow = pow(1.0 - h, 4.5);
    col += vec3(1.0, 0.91, 0.78) * horizonGlow * (0.16 + 0.34 * pow(sunDot, 2.2));
    col += mix(uSunColor, vec3(1.0, 0.86, 0.64), 0.45) * pow(sunDot, 5.0) * 0.24;
    col += vec3(1.0, 0.90, 0.72) * pow(sunDot, 32.0) * 0.42;
    col += vec3(1.0, 0.95, 0.84) * pow(sunDot, 160.0) * 0.85;
    col += vec3(1.0, 0.99, 0.95) * smoothstep(0.9976, 0.9995, sunDot) * 1.9;

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
      vec3 cirrusCol = mix(vec3(0.95, 0.97, 1.0), vec3(1.0, 0.95, 0.88), pow(sunDot, 3.0) * 0.65);
      col = mix(col, cirrusCol, cirrusAlpha * 0.38);
    }

    // Soft layered cumulus clouds
    if (dir.y > 0.03) {
      vec2 uv = dir.xz / (dir.y + 0.18) * 1.3 + vec2(uTime * 0.008, uTime * 0.004);
      float c = noise(uv * 2.0) * 0.6 + noise(uv * 4.5) * 0.3 + noise(uv * 9.0) * 0.1;
      float cloudAlpha = smoothstep(0.56, 0.80, c) * smoothstep(0.03, 0.22, dir.y) * (1.0 - smoothstep(0.62, 0.92, dir.y));
      vec3 cloudCol = mix(vec3(0.97, 0.98, 0.99), vec3(1.0, 0.96, 0.90), pow(sunDot, 4.0) * 0.55);
      col = mix(col, cloudCol, cloudAlpha * 0.58);
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

    // Per-fragment multi-octave wave normal with crisp capillary micro-ripples
    float dx = 0.085 * cos(0.09 * p.x + 1.2 * uTime)
             + 0.052 * cos(0.24 * p.x + 0.16 * p.y + 1.8 * uTime)
             + 0.032 * cos(0.55 * p.x - 0.35 * p.y + 2.6 * uTime)
             + 0.018 * cos(1.35 * p.x + 0.92 * p.y - 3.4 * uTime);
    float dz = 0.085 * cos(0.08 * p.y - 1.1 * uTime)
             + 0.052 * cos(0.16 * p.x + 0.24 * p.y + 1.8 * uTime)
             + 0.032 * cos(-0.35 * p.x + 0.55 * p.y + 2.4 * uTime)
             + 0.018 * cos(-0.95 * p.x + 1.28 * p.y + 3.1 * uTime);
    vec3 n = normalize(vec3(-dx, 1.0, -dz));

    vec3 viewDir = normalize(uCameraPos - vWorldPos);
    float ndv = max(dot(viewDir, n), 0.0);
    float fresnel = clamp(0.04 + 0.96 * pow(1.0 - ndv, 4.0), 0.0, 1.0);

    // Depth-based coastal turquoise to offshore deep Mediterranean sapphire gradient
    vec3 shallowTurquoise = mix(uShallow, vec3(0.06, 0.77, 0.85), 0.78);
    vec3 deepSapphire = mix(uDeep, vec3(0.016, 0.25, 0.54), 0.82);
    float offshoreDepth = inCanal ? 0.05 : smoothstep(218.0, 295.0, dist);
    vec3 base = mix(shallowTurquoise, deepSapphire, clamp(offshoreDepth * 0.82 + fresnel * 0.32, 0.0, 1.0));

    // Subtle caustic shimmer in shallow coastal & Venetian canal waters
    float caustic = sin(p.x * 0.38 + uTime * 2.1) * cos(p.y * 0.38 - uTime * 1.7);
    base += vec3(0.06, 0.19, 0.21) * max(caustic, 0.0) * (1.0 - offshoreDepth) * 0.48;

    // Photographic Fresnel sky reflection (cerulean zenith to pale-azure horizon)
    vec3 reflDir = reflect(-viewDir, n);
    vec3 skyReflect = mix(vec3(0.81, 0.90, 0.96), vec3(0.16, 0.48, 0.72), clamp(reflDir.y * 1.8, 0.0, 1.0));
    base = mix(base, skyReflect, fresnel * 0.58);

    // Warm golden sun-glare path + crisp multi-scale sunlight specular glints on waves
    vec3 halfVec = normalize(viewDir + normalize(uSunDir));
    float ndh = max(dot(n, halfVec), 0.0);
    float goldenPath = pow(ndh, 28.0);
    float waveGlint = pow(ndh, 160.0);
    float crispSparkle = pow(ndh, 380.0);
    base += vec3(1.0, 0.87, 0.58) * goldenPath * 0.38;
    base += vec3(1.0, 0.97, 0.88) * waveGlint * 1.35;
    base += vec3(1.0, 0.99, 0.95) * crispSparkle * 2.2;

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

    // Full Metropolis Street Grid Mask (Avenues, Cross Boulevards, Sidewalks & Runway)
    bool inCanalCut = abs(p.y + 95.0) < 21.0 && p.x > 72.0;
    bool onGrandCentral = abs(p.x) < 18.0 && p.y > -225.0 && p.y < 195.0;
    bool onNorthCross = abs(p.y + 120.0) < 10.0 && abs(p.x) < 145.0;
    bool onMidtownCross = abs(p.y) < 11.0 && abs(p.x) < 155.0;
    bool onSouthCross = abs(p.y - 80.0) < 10.0 && abs(p.x) < 155.0;
    bool onCrossBlvd = (onNorthCross || onMidtownCross || onSouthCross) && !inCanalCut;
    bool onRunway = p.x > -210.0 && p.x < -45.0 && p.y > 135.0 && p.y < 165.0;
    bool onRoad = onGrandCentral || onCrossBlvd || onRunway;

    bool onGrandSidewalk = abs(p.x) >= 18.0 && abs(p.x) < 24.0 && p.y > -225.0 && p.y < 195.0;
    bool onNorthSidewalk = abs(p.y + 120.0) >= 10.0 && abs(p.y + 120.0) < 14.0 && abs(p.x) < 145.0;
    bool onMidtownSidewalk = abs(p.y) >= 11.0 && abs(p.y) < 15.0 && abs(p.x) < 155.0;
    bool onSouthSidewalk = abs(p.y - 80.0) >= 10.0 && abs(p.y - 80.0) < 14.0 && abs(p.x) < 155.0;
    bool onSidewalk = !onRoad && !inCanalCut && (onGrandSidewalk || onNorthSidewalk || onMidtownSidewalk || onSouthSidewalk);

    vec3 albedo = vec3(0.25);
    float specStrength = 0.0;
    float specPower = 24.0;

    if (onRoad) {
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
        // Wet Shoreline Sand (h < 0.75)
        vec3 wetSand = vec3(0.46, 0.40, 0.31) + (bladeN2 - 0.5) * 0.035;

        // Dry Wind-Rippled Beach Sand (0.75 .. 1.85)
        float ripple = sin(p.x * 3.5 + p.y * 2.2 + noise(p * 0.5) * 4.0) * 0.5 + 0.5;
        vec3 drySand = vec3(0.82, 0.74, 0.58) + (ripple - 0.5) * 0.045 + (bladeN1 - 0.5) * 0.03;

        // Lush Coastal Grass & Parkland (h >= 1.85) with smooth sunlit organic shading
        vec3 meadowFescue = vec3(0.15, 0.33, 0.13);
        vec3 oliveSage = vec3(0.26, 0.42, 0.17);
        vec3 dryTufts = vec3(0.40, 0.41, 0.21);
        vec3 darkLoam = vec3(0.16, 0.14, 0.10);

        vec3 grassCol = mix(meadowFescue, oliveSage, smoothstep(0.24, 0.76, macroN));
        float sunCuredMask = smoothstep(0.54, 0.84, medN * 0.72 + (1.0 - macroN) * 0.32);
        grassCol = mix(grassCol, dryTufts, sunCuredMask * 0.36);
        float creviceMask = smoothstep(0.38, 0.16, microBlades);
        grassCol = mix(grassCol, darkLoam, creviceMask * 0.34);
        grassCol *= 0.90 + 0.20 * microBlades;

        // Sedimentary Limestone Cliff Rock (steep slopes or high peaks)
        float strata = sin(vWorldPos.y * 4.2 + noise(p * 0.3) * 2.0) * 0.5 + 0.5;
        vec3 cliffRock = vec3(0.44, 0.41, 0.37) + (strata - 0.5) * 0.09 + (bladeN1 - 0.5) * 0.05;
        cliffRock = mix(cliffRock, vec3(0.30, 0.28, 0.25), smoothstep(0.65, 0.9, noise(p * 1.4)) * 0.45);

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
          n = normalize(n + vec3((bladeN2 - 0.5) * 0.18, 0.0, (bladeN1 - 0.5) * 0.18) * sandToGrass);
        } else {
          albedo = grassCol;
          specStrength = 0.06;
          n = normalize(n + vec3((bladeN2 - 0.5) * 0.22, 0.0, (bladeN1 - 0.5) * 0.22));
        }

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

