import React, { useMemo, useRef } from 'react';
import * as THREE from 'three';
import { useFrame } from '@react-three/fiber';
import { sphereVertexShader, sphereFragmentShader, beamVertexShader, beamFragmentShader } from './Shaders';
import {
  createSkyscraperPBR,
  createArtDecoLimestonePBR,
  createBrickResidentialPBR,
  createModernConcreteSteelPBR,
  createSteelTrussPBR,
  createCeramicShellPBR,
  createCopperPatinaPBR,
  createLimestonePBR,
  createPalazzoPBR,
  createSidewalkCobblePBR,
  createColosseumArcadePBR,
  createGranitePodiumPBR,
} from './Textures';
import { getTerrainHeight } from '../game/worldMath';
import { simState } from '../game/store';

type TextureOrPBR =
  | THREE.CanvasTexture
  | {
      map: THREE.CanvasTexture;
      roughnessMap?: THREE.CanvasTexture;
      normalMap?: THREE.CanvasTexture;
    };

function unwrapPBR(tex: TextureOrPBR): {
  map: THREE.CanvasTexture;
  roughnessMap?: THREE.CanvasTexture;
} {
  if (tex && 'map' in tex) {
    return { map: tex.map, roughnessMap: tex.roughnessMap };
  }
  return { map: tex as THREE.CanvasTexture };
}

export function VegasLandmarks() {
  const sphereUniforms = useMemo(() => ({ uTime: { value: 0 }, uMode: { value: 0 } }), []);
  const beamUniforms = useMemo(() => ({ uTime: { value: 0 }, uColor: { value: new THREE.Color('#fef9c3') } }), []);
  const beamRef = useRef<THREE.Mesh>(null);
  const eiffelBeaconRef = useRef<THREE.Group>(null);
  const clockMinuteHandsRef = useRef<(THREE.Mesh | null)[]>([]);
  const clockHourHandsRef = useRef<(THREE.Mesh | null)[]>([]);

  // Rich procedural PBR texture suite across all 12 Global Landmarks
  const skyscraperPBR = useMemo(() => unwrapPBR(createSkyscraperPBR()), []);
  const artDecoPBR = useMemo(() => unwrapPBR(createArtDecoLimestonePBR()), []);
  const brickPBR = useMemo(() => unwrapPBR(createBrickResidentialPBR()), []);
  const concreteSteelPBR = useMemo(() => unwrapPBR(createModernConcreteSteelPBR()), []);
  const steelTrussPBR = useMemo(() => unwrapPBR(createSteelTrussPBR()), []);
  const ceramicShellPBR = useMemo(() => unwrapPBR(createCeramicShellPBR()), []);
  const copperPatinaPBR = useMemo(() => unwrapPBR(createCopperPatinaPBR()), []);
  const limestonePBR = useMemo(() => unwrapPBR(createLimestonePBR()), []);
  const palazzoPBR = useMemo(() => unwrapPBR(createPalazzoPBR()), []);
  const cobblePBR = useMemo(() => unwrapPBR(createSidewalkCobblePBR()), []);
  const colosseumArcadePBR = useMemo(() => unwrapPBR(createColosseumArcadePBR()), []);
  const granitePodiumPBR = useMemo(() => unwrapPBR(createGranitePodiumPBR()), []);

  // 2. GOLDEN GATE SUSPENSION BRIDGE — Twin Catenary Main Cables & Vertical Suspender Ropes
  const goldenGateGeometry = useMemo(() => {
    const cableSides = [-23, 23];
    const cables = cableSides.map((xPos) => {
      // North side-span (-48..-22), main center span (-22..+22), south side-span (+22..+48)
      const northPts: THREE.Vector3[] = [];
      for (let i = 0; i <= 8; i++) {
        const u = i / 8;
        const z = -48 + u * 26;
        const y = 4 + Math.pow(u, 1.55) * 64;
        northPts.push(new THREE.Vector3(xPos, y, z));
      }
      const centerPts: THREE.Vector3[] = [];
      for (let i = 0; i <= 16; i++) {
        const u = (i / 16) * 2 - 1; // -1 to +1
        const z = u * 22;
        const y = 18.5 + u * u * 49.5; // 18.5m mid-span up to 68m tower saddles
        centerPts.push(new THREE.Vector3(xPos, y, z));
      }
      const southPts: THREE.Vector3[] = [];
      for (let i = 0; i <= 8; i++) {
        const u = i / 8;
        const z = 22 + u * 26;
        const y = 4 + Math.pow(1 - u, 1.55) * 64;
        southPts.push(new THREE.Vector3(xPos, y, z));
      }

      return {
        northGeo: new THREE.TubeGeometry(new THREE.CatmullRomCurve3(northPts), 16, 0.52, 8, false),
        centerGeo: new THREE.TubeGeometry(new THREE.CatmullRomCurve3(centerPts), 28, 0.55, 8, false),
        southGeo: new THREE.TubeGeometry(new THREE.CatmullRomCurve3(southPts), 16, 0.52, 8, false),
      };
    });

    // Vertical suspender ropes every 8m
    const suspenders: { z: number; h: number; yMid: number }[] = [];
    for (let z = -44; z <= 44; z += 8) {
      if (Math.abs(Math.abs(z) - 22) < 2.5) continue;
      let cableY = 18.5;
      if (Math.abs(z) < 22) {
        const u = z / 22;
        cableY = 18.5 + u * u * 49.5;
      } else {
        const u = (48 - Math.abs(z)) / 26;
        cableY = 4 + Math.pow(Math.max(0, u), 1.55) * 64;
      }
      const h = Math.max(2, cableY - 1.5);
      suspenders.push({ z, h, yMid: 1.5 + h / 2 });
    }

    return { cables, suspenders };
  }, []);

  // 4. PARIS EIFFEL TOWER — 4 Multi-Chord Lattice Legs, Horizontal Girders & Diagonal X-Bracing Trusses
  const { eiffelPiers, eiffelTrussStruts } = useMemo(() => {
    const getSpanAtY = (y: number) => {
      if (y <= 18) return 13.5 - (y / 18) * (13.5 - 7.8);
      if (y <= 34) return 7.8 - ((y - 18) / 16) * (7.8 - 4.2);
      return Math.max(0.85, 4.2 - ((y - 34) / 28) * (4.2 - 0.85));
    };

    const dirs = [
      [1, 1],
      [-1, 1],
      [-1, -1],
      [1, -1],
    ];

    // Each of the 4 main corner piers has an outer and inner chord plus box-lattice thickness
    const piers: THREE.TubeGeometry[] = [];
    dirs.forEach(([sx, sz]) => {
      const chords = [
        [0, 0],
        [sx * 0.65, 0],
        [0, sz * 0.65],
        [-sx * 0.55, -sz * 0.55],
      ];
      chords.forEach(([ox, oz], cIdx) => {
        const scale = 1 - cIdx * 0.08;
        const curve = new THREE.CatmullRomCurve3([
          new THREE.Vector3(sx * 13.5 + ox, 0.8, sz * 13.5 + oz),
          new THREE.Vector3(sx * 9.8 + ox * 0.85, 11, sz * 9.8 + oz * 0.85),
          new THREE.Vector3(sx * 7.8 + ox * 0.7, 18, sz * 7.8 + oz * 0.7),
          new THREE.Vector3(sx * 5.6 + ox * 0.5, 26, sz * 5.6 + oz * 0.5),
          new THREE.Vector3(sx * 4.2 + ox * 0.35, 34, sz * 4.2 + oz * 0.35),
          new THREE.Vector3(sx * 2.1 + ox * 0.2, 48, sz * 2.1 + oz * 0.2),
          new THREE.Vector3(sx * 0.85, 62, sz * 0.85),
        ]);
        piers.push(new THREE.TubeGeometry(curve, 24, cIdx === 0 ? 0.52 : 0.28 * scale, 6, false));
      });
    });

    // Build horizontal & diagonal X-bracing iron truss struts across all 3 tower stages on all 4 faces
    const struts: { mid: THREE.Vector3; quat: THREE.Quaternion; len: number; radius: number }[] = [];
    const up = new THREE.Vector3(0, 1, 0);
    const addStrut = (a: THREE.Vector3, b: THREE.Vector3, radius: number) => {
      const dir = new THREE.Vector3().subVectors(b, a);
      const len = dir.length();
      if (len < 0.1) return;
      const mid = new THREE.Vector3().addVectors(a, b).multiplyScalar(0.5);
      const quat = new THREE.Quaternion().setFromUnitVectors(up, dir.normalize());
      struts.push({ mid, quat, len, radius });
    };

    // Stage 1: Internal leg X-bracing inside each of the 4 splayed legs (y = 2..17m)
    const legBands = [2.2, 5.5, 9.0, 12.5, 16.2];
    dirs.forEach(([sx, sz]) => {
      for (let i = 0; i < legBands.length - 1; i++) {
        const y0 = legBands[i];
        const y1 = legBands[i + 1];
        const s0 = getSpanAtY(y0);
        const s1 = getSpanAtY(y1);
        const w0 = 1.45 - i * 0.12;
        const w1 = 1.45 - (i + 1) * 0.12;
        // Outer & inner leg corner posts at y0 and y1
        const a0 = new THREE.Vector3(sx * (s0 + w0), y0, sz * (s0 - w0));
        const b0 = new THREE.Vector3(sx * (s0 - w0), y0, sz * (s0 + w0));
        const a1 = new THREE.Vector3(sx * (s1 + w1), y1, sz * (s1 - w1));
        const b1 = new THREE.Vector3(sx * (s1 - w1), y1, sz * (s1 + w1));
        addStrut(a0, b0, 0.16);
        addStrut(a0, b1, 0.14);
        addStrut(b0, a1, 0.14);
      }
    });

    // Stage 1 Upper Spandrel Lattice Belt above the 4 semicircular base arches (y = 12.5..17.5m)
    const stage1Belt = [12.5, 15.0, 17.4];
    for (let i = 0; i < stage1Belt.length - 1; i++) {
      const y0 = stage1Belt[i];
      const y1 = stage1Belt[i + 1];
      const s0 = getSpanAtY(y0);
      const s1 = getSpanAtY(y1);
      [-1, 1].forEach((side) => {
        // North/South faces
        addStrut(new THREE.Vector3(-s0, y0, side * s0), new THREE.Vector3(s0, y0, side * s0), 0.18);
        addStrut(new THREE.Vector3(-s0, y0, side * s0), new THREE.Vector3(0, y1, side * s1), 0.15);
        addStrut(new THREE.Vector3(0, y0, side * s0), new THREE.Vector3(-s1, y1, side * s1), 0.15);
        addStrut(new THREE.Vector3(0, y0, side * s0), new THREE.Vector3(s1, y1, side * s1), 0.15);
        addStrut(new THREE.Vector3(s0, y0, side * s0), new THREE.Vector3(0, y1, side * s1), 0.15);
        // East/West faces
        addStrut(new THREE.Vector3(side * s0, y0, -s0), new THREE.Vector3(side * s0, y0, s0), 0.18);
        addStrut(new THREE.Vector3(side * s0, y0, -s0), new THREE.Vector3(side * s1, y1, 0), 0.15);
        addStrut(new THREE.Vector3(side * s0, y0, 0), new THREE.Vector3(side * s1, y1, -s1), 0.15);
        addStrut(new THREE.Vector3(side * s0, y0, 0), new THREE.Vector3(side * s1, y1, s1), 0.15);
        addStrut(new THREE.Vector3(side * s0, y0, s0), new THREE.Vector3(side * s1, y1, 0), 0.15);
      });
    }

    // Stage 2 (y = 19..34m) & Stage 3 (y = 35..61m): Full 4-face Horizontal & Diagonal X-Bracing Trusses
    const upperLevels = [19.2, 22.8, 26.4, 30.0, 33.5, 35.5, 39.5, 43.5, 47.5, 51.5, 55.5, 59.5];
    for (let i = 0; i < upperLevels.length - 1; i++) {
      const y0 = upperLevels[i];
      const y1 = upperLevels[i + 1];
      if (Math.abs(y0 - 33.5) < 0.2) continue; // 2nd deck break
      const s0 = getSpanAtY(y0);
      const s1 = getSpanAtY(y1);
      const r = y0 < 34 ? 0.16 : 0.13;

      [-1, 1].forEach((side) => {
        // North & South faces (z = ±s)
        const nL0 = new THREE.Vector3(-s0, y0, side * s0);
        const nR0 = new THREE.Vector3(s0, y0, side * s0);
        const nL1 = new THREE.Vector3(-s1, y1, side * s1);
        const nR1 = new THREE.Vector3(s1, y1, side * s1);
        addStrut(nL0, nR0, r * 1.15);
        addStrut(nL0, nR1, r);
        addStrut(nR0, nL1, r);

        // East & West faces (x = ±s)
        const eL0 = new THREE.Vector3(side * s0, y0, -s0);
        const eR0 = new THREE.Vector3(side * s0, y0, s0);
        const eL1 = new THREE.Vector3(side * s1, y1, -s1);
        const eR1 = new THREE.Vector3(side * s1, y1, s1);
        addStrut(eL0, eR0, r * 1.15);
        addStrut(eL0, eR1, r);
        addStrut(eR0, eL1, r);
      });
    }

    return { eiffelPiers: piers, eiffelTrussStruts: struts };
  }, []);

  // 7. SYDNEY OPERA HOUSE — 6 Sculpted Pointed Gothic-Arch Ceramic Sail Vaults (rising to y = 34m!)
  const operaSailGeometries = useMemo(() => {
    const makeSailShell = (height: number, width: number, length: number) => {
      // Utzon's pointed spherical-triangle shell vault:
      // Springs from a narrow rear pedestal at (0, 0, 0) and sweeps upward & forward
      // to a pointed Gothic arch peak at (length, height, 0) with vaulted side ribs planted on the podium.
      const uSegs = 22;
      const vSegs = 24; // -1..0..+1 across the pointed Gothic arch
      const positions: number[] = [];
      const uvs: number[] = [];
      const indices: number[] = [];

      const evalShellPoint = (u: number, v: number, wallOffset: number) => {
        const av = Math.abs(v);
        const signV = v < 0 ? -1 : 1;
        // Ridge height rises along a dramatic sweeping arc up to `height`
        const ridgeH = Math.pow(u, 0.68) * height;
        // Half-width flares from narrow pedestal base to wide middle/front vault
        const halfW = (0.14 + 0.86 * Math.pow(Math.sin(u * Math.PI * 0.58), 0.85)) * (width * 0.5);
        // Pointed Gothic arch cross-section (two circular/parabolic arcs meeting at a sharp ridge at v = 0)
        const archFactor = Math.max(0, 1 - Math.pow(av, 1.38));
        const y = Math.max(0, ridgeH * archFactor - wallOffset * 0.4);
        const z = signV * (av * halfW - wallOffset * signV * 0.35);
        // Side bases plant on podium while the pointed ridge beak sweeps dramatically forward
        const x = u * length - Math.pow(av, 1.55) * (length * 0.28 * u) - wallOffset * 0.35;
        return [x, y, z] as const;
      };

      // Outer shell surface (layer 0) and inner shell surface (layer 1)
      for (let layer = 0; layer < 2; layer++) {
        const offset = layer === 0 ? 0 : 0.55;
        for (let iu = 0; iu <= uSegs; iu++) {
          const u = iu / uSegs;
          for (let iv = 0; iv <= vSegs; iv++) {
            const v = (iv / vSegs) * 2 - 1;
            const [x, y, z] = evalShellPoint(u, v, offset);
            positions.push(x, y, z);
            uvs.push(u * 2.5, (iv / vSegs) * 3.0);
          }
        }
      }

      const stride = vSegs + 1;
      const layerVerts = (uSegs + 1) * stride;

      // Outer surface triangles
      for (let iu = 0; iu < uSegs; iu++) {
        for (let iv = 0; iv < vSegs; iv++) {
          const a = iu * stride + iv;
          const b = (iu + 1) * stride + iv;
          const c = (iu + 1) * stride + (iv + 1);
          const d = iu * stride + (iv + 1);
          indices.push(a, b, d, b, c, d);
        }
      }
      // Inner surface triangles (reversed winding)
      for (let iu = 0; iu < uSegs; iu++) {
        for (let iv = 0; iv < vSegs; iv++) {
          const a = layerVerts + iu * stride + iv;
          const b = layerVerts + (iu + 1) * stride + iv;
          const c = layerVerts + (iu + 1) * stride + (iv + 1);
          const d = layerVerts + iu * stride + (iv + 1);
          indices.push(a, d, b, b, d, c);
        }
      }
      // Stitch front pointed-arch rim (iu = uSegs) between outer and inner shells
      const frontU = uSegs * stride;
      for (let iv = 0; iv < vSegs; iv++) {
        const o0 = frontU + iv;
        const o1 = frontU + iv + 1;
        const i0 = layerVerts + frontU + iv;
        const i1 = layerVerts + frontU + iv + 1;
        indices.push(o0, i0, o1, o1, i0, i1);
      }

      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
      geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
      geo.setIndex(indices);
      geo.computeVertexNormals();
      return geo;
    };

    return {
      // Tallest Concert Hall shell rises 29m above the 5m podium -> y = 34m total!
      tallHallA: makeSailShell(29.0, 14.5, 17.5),
      midHallA: makeSailShell(23.5, 12.4, 14.8),
      lowHallA: makeSailShell(18.0, 10.2, 11.8),
      tallHallB: makeSailShell(25.5, 13.0, 15.8),
      midHallB: makeSailShell(20.0, 11.0, 13.0),
      restaurantShell: makeSailShell(14.0, 8.8, 9.8),
    };
  }, []);

  // 9. NEW YORK STATUE OF LIBERTY — 11-Point Star-Fort & Sculpted Draped Copper Robe
  const { starFortGeo, libertyRobeGeo } = useMemo(() => {
    const starShape = new THREE.Shape();
    const points = 11;
    const outerR = 17.5;
    const innerR = 12.2;
    for (let i = 0; i < points * 2; i++) {
      const angle = (i * Math.PI) / points;
      const r = i % 2 === 0 ? outerR : innerR;
      const x = Math.cos(angle) * r;
      const y = Math.sin(angle) * r;
      if (i === 0) starShape.moveTo(x, y);
      else starShape.lineTo(x, y);
    }
    starShape.closePath();
    const sGeo = new THREE.ExtrudeGeometry(starShape, {
      depth: 4.8,
      bevelEnabled: true,
      bevelThickness: 0.35,
      bevelSize: 0.35,
      bevelSegments: 2,
    });
    sGeo.rotateX(-Math.PI / 2);

    const pts = [
      new THREE.Vector2(3.8, 0),
      new THREE.Vector2(3.3, 4.5),
      new THREE.Vector2(2.7, 9.5),
      new THREE.Vector2(2.3, 14.5),
      new THREE.Vector2(2.5, 17.5),
      new THREE.Vector2(1.6, 19.5),
      new THREE.Vector2(0.85, 20.5),
    ];
    const rGeo = new THREE.LatheGeometry(pts, 20);
    return { starFortGeo: sGeo, libertyRobeGeo: rGeo };
  }, []);

  // 11. VENICE RIALTO BRIDGE — Sculpted Stone Arch
  const rialtoArchGeo = useMemo(() => {
    const shape = new THREE.Shape();
    shape.moveTo(-14, 0);
    shape.lineTo(-14, 4.8);
    shape.quadraticCurveTo(0, 11.2, 14, 4.8);
    shape.lineTo(14, 0);
    shape.lineTo(10.5, 0);
    shape.quadraticCurveTo(0, 7.6, -10.5, 0);
    shape.closePath();

    const geo = new THREE.ExtrudeGeometry(shape, {
      depth: 8,
      bevelEnabled: true,
      bevelThickness: 0.25,
      bevelSize: 0.25,
      bevelSegments: 2,
    });
    geo.translate(0, 0, -4);
    geo.rotateY(Math.PI / 2);
    return geo;
  }, []);

  // 12. CAIRO / GIZA GREAT PYRAMID — Structural Corner Ribs
  const pyramidCornerRibs = useMemo(() => {
    const up = new THREE.Vector3(0, 1, 0);
    const apex = new THREE.Vector3(0, 44, 0);
    const c = 34 * Math.SQRT1_2;
    return [
      [1, 1],
      [-1, 1],
      [-1, -1],
      [1, -1],
    ].map(([sx, sz]) => {
      const base = new THREE.Vector3(sx * c, 0, sz * c);
      const dir = new THREE.Vector3().subVectors(apex, base);
      const len = dir.length();
      const mid = new THREE.Vector3().addVectors(base, apex).multiplyScalar(0.5);
      const quat = new THREE.Quaternion().setFromUnitVectors(up, dir.normalize());
      return { mid, quat, len };
    });
  }, []);

  useFrame((state) => {
    const t = state.clock.elapsedTime;
    sphereUniforms.uTime.value = t;
    beamUniforms.uTime.value = t;
    sphereUniforms.uMode.value =
      simState.roulette === 'RED' ? 1 : simState.roulette === 'BLACK' ? 2 : simState.roulette === 'GREEN_00' ? 3 : 0;

    if (beamRef.current) {
      beamRef.current.rotation.z = simState.roulette === 'RED' ? Math.sin(t * 0.8) * 0.25 : 0;
    }
    if (eiffelBeaconRef.current) {
      eiffelBeaconRef.current.rotation.y = t * 0.85;
    }
    for (let i = 0; i < clockMinuteHandsRef.current.length; i++) {
      const minHand = clockMinuteHandsRef.current[i];
      const hrHand = clockHourHandsRef.current[i];
      if (minHand) minHand.rotation.z = -t * 0.08;
      if (hrHand) hrHand.rotation.z = -t * 0.0067 - 0.85;
    }
  });

  // Terrain heights for all 12 Global Landmarks + East Science Sphere
  const empireY = getTerrainHeight(-52, -28);
  const goldenGateY = getTerrainHeight(0, -205);
  const bigBenY = getTerrainHeight(-52, -88);
  const eiffelY = getTerrainHeight(95, 35);
  const burjY = getTerrainHeight(54, -148);
  const colosseumY = getTerrainHeight(-105, 45);
  const sydneyY = getTerrainHeight(148, 108);
  const tokyoY = getTerrainHeight(52, -28);
  const libertyY = getTerrainHeight(-158, -145);
  const rioY = getTerrainHeight(58, 148);
  const gizaY = getTerrainHeight(-118, -28);
  const sphereY = getTerrainHeight(98, -35);

  return (
    <group>
      {/* =================================================================================
          1. NEW YORK — EMPIRE STATE BUILDING (Art Deco Limestone & Skyscraper Curtain Wall)
             Position: [-52, empireY, -28] — West Midtown Block (clear of avenues)
         ================================================================================= */}
      <group position={[-52, empireY, -28]}>
        {/* Street-Level Pink-Beige Granite Water-Table Foundation Plinth (27.2m × 1.8m × 27.2m) */}
        <mesh position={[0, 0.9, 0]} castShadow receiveShadow>
          <boxGeometry args={[27.2, 1.8, 27.2]} />
          <meshStandardMaterial
            map={granitePodiumPBR.map}
            roughnessMap={granitePodiumPBR.roughnessMap}
            roughness={0.58}
            metalness={0.1}
          />
        </mesh>
        {/* 5-Story Indiana Limestone Base Podium (26m × 10m × 26m) */}
        <mesh position={[0, 5.8, 0]} castShadow receiveShadow>
          <boxGeometry args={[26, 10, 26]} />
          <meshStandardMaterial
            map={artDecoPBR.map}
            roughnessMap={artDecoPBR.roughnessMap}
            roughness={0.62}
            metalness={0.12}
          />
        </mesh>
        {/* Grand Fifth Avenue Brass & Marble Entrance Portal */}
        <mesh position={[13.1, 3.8, 0]}>
          <boxGeometry args={[0.5, 7.2, 6.4]} />
          <meshStandardMaterial color="#d97706" metalness={0.85} roughness={0.22} />
        </mesh>
        <mesh position={[13.25, 3.4, 0]}>
          <boxGeometry args={[0.3, 5.8, 4.8]} />
          <meshStandardMaterial color="#fef3c7" emissive="#fbbf24" emissiveIntensity={1.1} />
        </mesh>
        {/* Lower Transition Setback Tier (22m × 6m × 22m) */}
        <mesh position={[0, 13, 0]} castShadow receiveShadow>
          <boxGeometry args={[22, 6, 22]} />
          <meshStandardMaterial
            map={artDecoPBR.map}
            roughnessMap={artDecoPBR.roughnessMap}
            roughness={0.58}
            metalness={0.18}
          />
        </mesh>
        {/* Main 86-Story Art Deco Central Shaft (18m × 58m × 18m) */}
        <mesh position={[0, 45, 0]} castShadow receiveShadow>
          <boxGeometry args={[18, 58, 18]} />
          <meshPhysicalMaterial
            map={skyscraperPBR.map}
            roughnessMap={skyscraperPBR.roughnessMap}
            color="#e2e8f0"
            metalness={0.68}
            roughness={0.22}
            clearcoat={0.85}
          />
        </mesh>
        {/* Iconic Vertical Nickel-Chrome Art Deco Spandrel Piers along all 4 faces */}
        {[-6, -2, 2, 6].map((offset) => (
          <React.Fragment key={offset}>
            <mesh position={[offset, 45, 9.12]} castShadow>
              <boxGeometry args={[0.85, 58, 0.35]} />
              <meshStandardMaterial map={artDecoPBR.map} color="#e7e5e4" metalness={0.45} roughness={0.38} />
            </mesh>
            <mesh position={[offset, 45, -9.12]} castShadow>
              <boxGeometry args={[0.85, 58, 0.35]} />
              <meshStandardMaterial map={artDecoPBR.map} color="#e7e5e4" metalness={0.45} roughness={0.38} />
            </mesh>
            <mesh position={[9.12, 45, offset]} castShadow>
              <boxGeometry args={[0.35, 58, 0.85]} />
              <meshStandardMaterial map={artDecoPBR.map} color="#e7e5e4" metalness={0.45} roughness={0.38} />
            </mesh>
            <mesh position={[-9.12, 45, offset]} castShadow>
              <boxGeometry args={[0.35, 58, 0.85]} />
              <meshStandardMaterial map={artDecoPBR.map} color="#e7e5e4" metalness={0.45} roughness={0.38} />
            </mesh>
          </React.Fragment>
        ))}
        {/* Symmetrical Art Deco Stepped Setbacks (14m, 10.5m, 7.5m) with LED Floodlight Crowns */}
        <mesh position={[0, 77.5, 0]} castShadow>
          <boxGeometry args={[14, 7, 14]} />
          <meshStandardMaterial map={artDecoPBR.map} roughness={0.48} metalness={0.3} />
        </mesh>
        <mesh position={[0, 81.2, 0]}>
          <boxGeometry args={[14.3, 0.55, 14.3]} />
          <meshStandardMaterial color="#38bdf8" emissive="#38bdf8" emissiveIntensity={1.8} />
        </mesh>
        <mesh position={[0, 84, 0]} castShadow>
          <boxGeometry args={[10.5, 6, 10.5]} />
          <meshStandardMaterial map={artDecoPBR.map} roughness={0.44} metalness={0.38} />
        </mesh>
        <mesh position={[0, 87.2, 0]}>
          <boxGeometry args={[10.8, 0.5, 10.8]} />
          <meshStandardMaterial color="#f8fafc" emissive="#38bdf8" emissiveIntensity={2.0} />
        </mesh>
        <mesh position={[0, 89.5, 0]} castShadow>
          <boxGeometry args={[7.5, 5, 7.5]} />
          <meshStandardMaterial map={artDecoPBR.map} roughness={0.4} metalness={0.45} />
        </mesh>
        {/* Silver Chrome Dirigible Mooring Mast & Illuminated 102nd-Floor Observatory */}
        <mesh position={[0, 95.5, 0]} castShadow>
          <cylinderGeometry args={[2.2, 3.2, 7.5, 16]} />
          <meshPhysicalMaterial color="#e2e8f0" metalness={0.92} roughness={0.14} clearcoat={1} />
        </mesh>
        <mesh position={[0, 99.6, 0]}>
          <cylinderGeometry args={[2.5, 2.5, 1.2, 16]} />
          <meshStandardMaterial color="#fef9c3" emissive="#38bdf8" emissiveIntensity={2.4} />
        </mesh>
        {/* Broadcast Needle Spire reaching ~112m into the sky */}
        <mesh position={[0, 106, 0]}>
          <cylinderGeometry args={[0.14, 0.75, 13, 12]} />
          <meshStandardMaterial color="#f8fafc" metalness={0.95} roughness={0.1} />
        </mesh>
        <mesh position={[0, 112.8, 0]}>
          <sphereGeometry args={[0.42, 10, 10]} />
          <meshStandardMaterial color="#ef4444" emissive="#ef4444" emissiveIntensity={3.2} />
        </mesh>
      </group>

      {/* =================================================================================
          2. SAN FRANCISCO — GOLDEN GATE SUSPENSION BRIDGE
             Position: [0, goldenGateY, -205] — Spans North Bay Highway (z = -165..-255)
             Twin H-Towers straddle x = -23 and x = +23 so 44m roadway is 100% unobstructed!
         ================================================================================= */}
      <group position={[0, goldenGateY, -205]}>
        {/* North & South Monumental Granite/Concrete Cable Anchorages outside roadway at x = ±23, z = ±48 */}
        {[-48, 48].map((az) =>
          [-23, 23].map((ax) => (
            <mesh key={`anch-${ax}-${az}`} position={[ax, 2.6, az]} castShadow receiveShadow>
              <boxGeometry args={[4.8, 5.4, 8.8]} />
              <meshStandardMaterial
                map={granitePodiumPBR.map}
                roughnessMap={granitePodiumPBR.roughnessMap}
                roughness={0.66}
                metalness={0.14}
              />
            </mesh>
          ))
        )}

        {/* Twin Monumental International Orange (#c2410c) Art Deco H-Towers (z = -22 and z = +22) */}
        {[-22, 22].map((tz) => (
          <group key={`tower-${tz}`} position={[0, 0, tz]}>
            {/* Ribbed Granite/Concrete Pier Fenders at the base of each leg (x = ±23) */}
            {[-23, 23].map((lx) => (
              <React.Fragment key={`leg-${lx}`}>
                <mesh position={[lx, 2.0, 0]} castShadow receiveShadow>
                  <boxGeometry args={[5.6, 4.0, 7.4]} />
                  <meshStandardMaterial
                    map={granitePodiumPBR.map}
                    roughnessMap={granitePodiumPBR.roughnessMap}
                    roughness={0.64}
                  />
                </mesh>
                {/* Main Stepped Art Deco Vertical Steel Shafts (height = 68m) */}
                <mesh position={[lx, 36, 0]} castShadow receiveShadow>
                  <boxGeometry args={[3.2, 64, 4.4]} />
                  <meshStandardMaterial
                    map={steelTrussPBR.map}
                    roughnessMap={steelTrussPBR.roughnessMap}
                    color="#c2410c"
                    metalness={0.68}
                    roughness={0.34}
                  />
                </mesh>
                <mesh position={[lx, 18, 0]} castShadow>
                  <boxGeometry args={[4.1, 28, 5.2]} />
                  <meshStandardMaterial
                    map={steelTrussPBR.map}
                    roughnessMap={steelTrussPBR.roughnessMap}
                    color="#ea580c"
                    metalness={0.64}
                    roughness={0.36}
                  />
                </mesh>
                {/* Cast-Steel Cable Saddle at Tower Peak (y = 68.5m) */}
                <mesh position={[lx, 68.5, 0]}>
                  <boxGeometry args={[3.6, 1.6, 4.8]} />
                  <meshStandardMaterial color="#9a3412" metalness={0.82} roughness={0.25} />
                </mesh>
              </React.Fragment>
            ))}

            {/* 4 Horizontal Art Deco Portal Cross-Struts HIGH ABOVE ROADWAY (y = 22, 36, 50, 64) */}
            {[22, 36, 50, 64].map((cy) => (
              <group key={`strut-${cy}`} position={[0, cy, 0]}>
                <mesh castShadow>
                  <boxGeometry args={[46, 2.8, 3.2]} />
                  <meshStandardMaterial
                    map={steelTrussPBR.map}
                    roughnessMap={steelTrussPBR.roughnessMap}
                    color="#c2410c"
                    metalness={0.7}
                    roughness={0.32}
                  />
                </mesh>
                {/* Art Deco stepped portal arch gussets on each cross-strut */}
                {[-19, 19].map((gx) => (
                  <mesh key={gx} position={[gx, -2.1, 0]}>
                    <boxGeometry args={[4.5, 1.8, 2.6]} />
                    <meshStandardMaterial color="#9a3412" metalness={0.72} roughness={0.34} />
                  </mesh>
                ))}
              </group>
            ))}
          </group>
        ))}

        {/* Twin Sweeping Catenary Main Suspension Cables along x = -23 and x = +23 */}
        {goldenGateGeometry.cables.map((cable, idx) => (
          <React.Fragment key={`cable-${idx}`}>
            <mesh geometry={cable.northGeo} castShadow>
              <meshStandardMaterial color="#c2410c" metalness={0.78} roughness={0.26} />
            </mesh>
            <mesh geometry={cable.centerGeo} castShadow>
              <meshStandardMaterial color="#c2410c" metalness={0.78} roughness={0.26} />
            </mesh>
            <mesh geometry={cable.southGeo} castShadow>
              <meshStandardMaterial color="#c2410c" metalness={0.78} roughness={0.26} />
            </mesh>
          </React.Fragment>
        ))}

        {/* Vertical Steel Suspender Ropes every 8m along x = ±23 */}
        {goldenGateGeometry.suspenders.map((s, idx) =>
          [-23, 23].map((sx) => (
            <mesh key={`susp-${idx}-${sx}`} position={[sx, s.yMid, s.z]}>
              <cylinderGeometry args={[0.09, 0.09, s.h, 6]} />
              <meshStandardMaterial color="#94a3b8" metalness={0.85} roughness={0.22} />
            </mesh>
          ))
        )}

        {/* Side Pedestrian Walkways & International Orange Steel Guardrails at x = ±21.8 */}
        {[-21.8, 21.8].map((wx) => (
          <group key={`walkway-${wx}`} position={[wx, 0, 0]}>
            <mesh position={[0, 0.35, 0]} receiveShadow>
              <boxGeometry args={[2.2, 0.7, 96]} />
              <meshStandardMaterial
                map={granitePodiumPBR.map}
                roughnessMap={granitePodiumPBR.roughnessMap}
                roughness={0.65}
              />
            </mesh>
            <mesh position={[wx > 0 ? 0.85 : -0.85, 1.45, 0]} castShadow>
              <boxGeometry args={[0.35, 1.5, 96]} />
              <meshStandardMaterial
                map={steelTrussPBR.map}
                roughnessMap={steelTrussPBR.roughnessMap}
                color="#c2410c"
                metalness={0.68}
                roughness={0.34}
              />
            </mesh>
          </group>
        ))}
      </group>

      {/* =================================================================================
          3. LONDON — BIG BEN (ELIZABETH TOWER) & WESTMINSTER GREAT CLOCK
             Position: [-52, bigBenY, -88] — Neo-Gothic Carved Limestone & 4 Illuminated Dials
         ================================================================================= */}
      <group position={[-52, bigBenY, -88]}>
        {/* Carved Granite & Portland Stone Base Plinth (13.8m × 3.2m × 13.8m) */}
        <mesh position={[0, 1.6, 0]} castShadow receiveShadow>
          <boxGeometry args={[13.8, 3.2, 13.8]} />
          <meshStandardMaterial
            map={granitePodiumPBR.map}
            roughnessMap={granitePodiumPBR.roughnessMap}
            roughness={0.64}
          />
        </mesh>
        {/* Main Neo-Gothic Golden Sandstone & Limestone Shaft (11m × 40m × 11m) */}
        <mesh position={[0, 21.5, 0]} castShadow receiveShadow>
          <boxGeometry args={[11, 40, 11]} />
          <meshStandardMaterial
            map={artDecoPBR.map}
            roughnessMap={artDecoPBR.roughnessMap}
            color="#f5e6c8"
            roughness={0.56}
            metalness={0.14}
          />
        </mesh>
        {/* 4 Corner Neo-Gothic Buttress Piers + Gilded Finials */}
        {[
          [-5.4, -5.4],
          [5.4, -5.4],
          [-5.4, 5.4],
          [5.4, 5.4],
        ].map(([bx, bz], idx) => (
          <group key={idx} position={[bx, 0, bz]}>
            <mesh position={[0, 26, 0]} castShadow>
              <boxGeometry args={[1.4, 52, 1.4]} />
              <meshStandardMaterial map={artDecoPBR.map} color="#e7d3b0" roughness={0.52} />
            </mesh>
            <mesh position={[0, 54.5, 0]}>
              <coneGeometry args={[0.95, 4.5, 4]} />
              <meshStandardMaterial color="#f59e0b" metalness={0.88} roughness={0.2} />
            </mesh>
          </group>
        ))}

        {/* Overhanging Upper Belfry Clock Stage (13m × 11m × 13m at y = 46m) */}
        <mesh position={[0, 46, 0]} castShadow receiveShadow>
          <boxGeometry args={[13, 11, 13]} />
          <meshStandardMaterial
            map={artDecoPBR.map}
            roughnessMap={artDecoPBR.roughnessMap}
            color="#fde68a"
            roughness={0.48}
            metalness={0.24}
          />
        </mesh>
        {/* Gilded Gothic Cornice Mouldings below & above Clock Stage */}
        {[40.4, 51.6].map((cy) => (
          <mesh key={cy} position={[0, cy, 0]}>
            <boxGeometry args={[13.8, 0.7, 13.8]} />
            <meshStandardMaterial color="#d97706" metalness={0.85} roughness={0.22} />
          </mesh>
        ))}

        {/* 4 Illuminated Great Clock Dials (North, South, East, West) */}
        {[
          { pos: [0, 46, 6.58] as [number, number, number], rot: [0, 0, 0] as [number, number, number] },
          { pos: [0, 46, -6.58] as [number, number, number], rot: [0, Math.PI, 0] as [number, number, number] },
          { pos: [6.58, 46, 0] as [number, number, number], rot: [0, Math.PI / 2, 0] as [number, number, number] },
          { pos: [-6.58, 46, 0] as [number, number, number], rot: [0, -Math.PI / 2, 0] as [number, number, number] },
        ].map((face, idx) => (
          <group key={idx} position={face.pos} rotation={face.rot}>
            {/* Gilded Square Frame */}
            <mesh position={[0, 0, -0.04]}>
              <boxGeometry args={[8.8, 8.8, 0.16]} />
              <meshStandardMaterial color="#b45309" metalness={0.82} roughness={0.25} />
            </mesh>
            {/* Illuminated White Opal Glass Clock Face */}
            <mesh rotation={[Math.PI / 2, 0, 0]}>
              <cylinderGeometry args={[3.9, 3.9, 0.18, 32]} />
              <meshStandardMaterial color="#fefce8" emissive="#fef08a" emissiveIntensity={1.65} />
            </mesh>
            {/* Outer & Inner Dark Iron + Gold Chapter Rings */}
            <mesh position={[0, 0, 0.12]}>
              <ringGeometry args={[3.35, 3.85, 32]} />
              <meshStandardMaterial color="#1e293b" metalness={0.85} roughness={0.2} />
            </mesh>
            <mesh position={[0, 0, 0.13]}>
              <ringGeometry args={[2.55, 2.75, 32]} />
              <meshStandardMaterial color="#d97706" metalness={0.88} roughness={0.2} />
            </mesh>
            {/* 12 Roman Numeral Hour Ticks */}
            {Array.from({ length: 12 }).map((_, hIdx) => {
              const ang = (hIdx * Math.PI) / 6;
              return (
                <mesh
                  key={hIdx}
                  position={[Math.sin(ang) * 3.1, Math.cos(ang) * 3.1, 0.14]}
                  rotation={[0, 0, -ang]}
                >
                  <boxGeometry args={[0.24, 0.58, 0.08]} />
                  <meshStandardMaterial color="#0f172a" />
                </mesh>
              );
            })}
            {/* 3D Gunmetal & Copper Hour Hand */}
            <mesh
              ref={(el) => {
                clockHourHandsRef.current[idx] = el;
              }}
              position={[0, 0, 0.2]}
              rotation={[0, 0, -0.85]}
            >
              <boxGeometry args={[0.36, 2.3, 0.12]} />
              <meshStandardMaterial color="#0f172a" metalness={0.8} roughness={0.2} />
            </mesh>
            {/* 3D Copper Minute Hand (4.2m long) */}
            <mesh
              ref={(el) => {
                clockMinuteHandsRef.current[idx] = el;
              }}
              position={[0, 0, 0.26]}
            >
              <boxGeometry args={[0.22, 3.4, 0.12]} />
              <meshStandardMaterial color="#1e293b" metalness={0.85} roughness={0.18} />
            </mesh>
            {/* Center Gold Medallion Hub */}
            <mesh position={[0, 0, 0.32]} rotation={[Math.PI / 2, 0, 0]}>
              <cylinderGeometry args={[0.42, 0.42, 0.16, 16]} />
              <meshStandardMaterial color="#f59e0b" metalness={0.9} roughness={0.15} />
            </mesh>
          </group>
        ))}

        {/* Open Belfry Colonnade Stage (y = 53.5m) */}
        <mesh position={[0, 53.5, 0]} castShadow>
          <boxGeometry args={[10.2, 3.4, 10.2]} />
          <meshStandardMaterial color="#1e293b" emissive="#fbbf24" emissiveIntensity={0.45} />
        </mesh>
        {/* Steeply Pitched Cast-Iron & Verdigris-Gold Roof Spire (y = 55m..74m) */}
        <mesh position={[0, 61.5, 0]} rotation={[0, Math.PI / 4, 0]} castShadow>
          <cylinderGeometry args={[2.8, 7.6, 13, 4]} />
          <meshStandardMaterial
            map={copperPatinaPBR.map}
            roughnessMap={copperPatinaPBR.roughnessMap}
            color="#334155"
            metalness={0.68}
            roughness={0.32}
          />
        </mesh>
        {/* Glowing Ayrton Light Lantern & Steep Upper Finial Spire */}
        <mesh position={[0, 69.2, 0]}>
          <cylinderGeometry args={[1.6, 2.2, 2.8, 8]} />
          <meshStandardMaterial color="#fef9c3" emissive="#fde047" emissiveIntensity={2.6} />
        </mesh>
        <mesh position={[0, 74.0, 0]} rotation={[0, Math.PI / 4, 0]}>
          <coneGeometry args={[2.2, 7.2, 4]} />
          <meshStandardMaterial color="#fbbf24" metalness={0.9} roughness={0.16} />
        </mesh>
      </group>

      {/* =================================================================================
          4. PARIS — EIFFEL TOWER & CHAMP DE MARS PARK PROMENADE
             Position: [95, eiffelY, 35]
         ================================================================================= */}
      <group position={[95, eiffelY, 35]}>
        {/* Manicured Green Champ de Mars Lawn & Parisian Gravel Cross-Path (NO bulky white box!) */}
        <mesh position={[0, 0.08, 0]} receiveShadow>
          <boxGeometry args={[34, 0.16, 34]} />
          <meshStandardMaterial color="#2d5a27" roughness={0.88} />
        </mesh>
        <mesh position={[0, 0.12, 0]} receiveShadow>
          <boxGeometry args={[34, 0.18, 7.5]} />
          <meshStandardMaterial map={cobblePBR.map} color="#d6c7b2" roughness={0.78} />
        </mesh>
        <mesh position={[0, 0.12, 0]} receiveShadow>
          <boxGeometry args={[7.5, 0.18, 34]} />
          <meshStandardMaterial map={cobblePBR.map} color="#d6c7b2" roughness={0.78} />
        </mesh>
        {/* Central Ornamental Octagonal Reflecting Basin under the 4 Arches */}
        <mesh position={[0, 0.16, 0]} receiveShadow>
          <cylinderGeometry args={[5.2, 5.5, 0.28, 8]} />
          <meshStandardMaterial map={granitePodiumPBR.map} roughness={0.6} />
        </mesh>

        {/* 4 Angled Masonry Stone Pier Foundations at the 4 Corners ([±13.5, 0, ±13.5]) */}
        {[
          [1, 1],
          [-1, 1],
          [-1, -1],
          [1, -1],
        ].map(([sx, sz], idx) => (
          <group key={idx} position={[sx * 13.5, 0, sz * 13.5]}>
            {/* Lower Granite Footing Plinth */}
            <mesh position={[0, 0.85, 0]} castShadow receiveShadow>
              <boxGeometry args={[4.4, 1.7, 4.4]} />
              <meshStandardMaterial
                map={granitePodiumPBR.map}
                roughnessMap={granitePodiumPBR.roughnessMap}
                roughness={0.62}
              />
            </mesh>
            {/* Angled Haussmann Stone Pier Shoe cradling the iron leg */}
            <mesh
              position={[-sx * 0.45, 2.0, -sz * 0.45]}
              rotation={[sz * 0.24, 0, -sx * 0.24]}
              castShadow
              receiveShadow
            >
              <boxGeometry args={[3.4, 2.2, 3.4]} />
              <meshStandardMaterial
                map={granitePodiumPBR.map}
                roughnessMap={granitePodiumPBR.roughnessMap}
                color="#d8c7b8"
                roughness={0.58}
              />
            </mesh>
          </group>
        ))}

        {/* 4 Multi-Chord Curved Parisian Bronze-Iron Lattice Piers (#6b4c35) */}
        {eiffelPiers.map((geo, idx) => (
          <mesh key={idx} geometry={geo} castShadow receiveShadow>
            <meshStandardMaterial
              map={steelTrussPBR.map}
              roughnessMap={steelTrussPBR.roughnessMap}
              color="#6b4c35"
              metalness={0.72}
              roughness={0.32}
            />
          </mesh>
        ))}

        {/* Horizontal & Diagonal X-Bracing Iron Truss Struts across all 3 Tower Stages */}
        {eiffelTrussStruts.map((s, idx) => (
          <mesh key={idx} position={s.mid} quaternion={s.quat} castShadow>
            <cylinderGeometry args={[s.radius, s.radius, s.len, 6]} />
            <meshStandardMaterial
              map={steelTrussPBR.map}
              color="#6b4c35"
              metalness={0.74}
              roughness={0.3}
            />
          </mesh>
        ))}

        {/* 4 Semicircular Iron Lattice Base Arches on North, South, East, and West Faces (connecting the 4 piers at y = 8m) */}
        {[
          { pos: [0, 2.2, 10.6] as [number, number, number], rotY: 0, tiltX: -0.22 },
          { pos: [0, 2.2, -10.6] as [number, number, number], rotY: Math.PI, tiltX: -0.22 },
          { pos: [10.6, 2.2, 0] as [number, number, number], rotY: Math.PI / 2, tiltX: -0.22 },
          { pos: [-10.6, 2.2, 0] as [number, number, number], rotY: -Math.PI / 2, tiltX: -0.22 },
        ].map((arch, idx) => (
          <group key={idx} position={arch.pos} rotation={[0, arch.rotY, 0]}>
            <group rotation={[arch.tiltX, 0, 0]}>
            {/* Outer Arch Ring */}
            <mesh castShadow>
              <torusGeometry args={[8.8, 0.36, 8, 32, Math.PI]} />
              <meshStandardMaterial
                map={steelTrussPBR.map}
                color="#6b4c35"
                metalness={0.75}
                roughness={0.28}
              />
            </mesh>
            {/* Inner Concentric Lattice Arch Ring */}
            <mesh castShadow>
              <torusGeometry args={[7.6, 0.28, 8, 32, Math.PI]} />
              <meshStandardMaterial
                map={steelTrussPBR.map}
                color="#7c583e"
                metalness={0.75}
                roughness={0.28}
              />
            </mesh>
            {/* Radial Spandrel Lattice Spokes connecting Inner & Outer Arch Rings */}
            {Array.from({ length: 13 }).map((_, sIdx) => {
              const ang = (sIdx / 12) * Math.PI;
              const rMid = 8.2;
              return (
                <mesh
                  key={sIdx}
                  position={[Math.cos(ang) * rMid, Math.sin(ang) * rMid, 0]}
                  rotation={[0, 0, ang - Math.PI / 2]}
                >
                  <cylinderGeometry args={[0.1, 0.1, 1.3, 6]} />
                  <meshStandardMaterial color="#6b4c35" metalness={0.75} roughness={0.3} />
                </mesh>
              );
            })}
            </group>
          </group>
        ))}

        {/* 1st Observation Deck Double-Gallery Pavilion (y = 18m) with Warm Parisian Illumination */}
        <mesh position={[0, 18.0, 0]} castShadow receiveShadow>
          <boxGeometry args={[17.8, 1.6, 17.8]} />
          <meshStandardMaterial
            map={steelTrussPBR.map}
            roughnessMap={steelTrussPBR.roughnessMap}
            color="#6b4c35"
            metalness={0.72}
            roughness={0.3}
          />
        </mesh>
        <mesh position={[0, 19.1, 0]}>
          <boxGeometry args={[16.2, 0.75, 16.2]} />
          <meshStandardMaterial color="#fef3c7" emissive="#f59e0b" emissiveIntensity={1.35} />
        </mesh>
        <mesh position={[0, 19.75, 0]} castShadow>
          <boxGeometry args={[17.2, 0.55, 17.2]} />
          <meshStandardMaterial color="#7c583e" metalness={0.74} roughness={0.28} />
        </mesh>

        {/* 2nd Observation Deck Double-Gallery Platform (y = 34m) */}
        <mesh position={[0, 34.0, 0]} castShadow receiveShadow>
          <boxGeometry args={[10.4, 1.4, 10.4]} />
          <meshStandardMaterial
            map={steelTrussPBR.map}
            roughnessMap={steelTrussPBR.roughnessMap}
            color="#6b4c35"
            metalness={0.72}
            roughness={0.28}
          />
        </mesh>
        <mesh position={[0, 34.95, 0]}>
          <boxGeometry args={[9.4, 0.55, 9.4]} />
          <meshStandardMaterial color="#fef3c7" emissive="#f59e0b" emissiveIntensity={1.45} />
        </mesh>

        {/* Upper Tapered Iron Lattice Shaft Core (y = 35m..60m) */}
        <mesh position={[0, 47.5, 0]} rotation={[0, Math.PI / 4, 0]} castShadow>
          <cylinderGeometry args={[1.25, 3.6, 25, 4, 6, true]} />
          <meshStandardMaterial
            map={steelTrussPBR.map}
            roughnessMap={steelTrussPBR.roughnessMap}
            color="#6b4c35"
            metalness={0.75}
            roughness={0.28}
            side={THREE.DoubleSide}
          />
        </mesh>

        {/* Summit Cupola Observatory (y = 60.5m) + Rotating Golden Sky-Beacon */}
        <mesh position={[0, 60.5, 0]} castShadow>
          <cylinderGeometry args={[2.2, 2.5, 2.4, 8]} />
          <meshStandardMaterial color="#6b4c35" metalness={0.78} roughness={0.24} />
        </mesh>
        <mesh position={[0, 62.1, 0]}>
          <cylinderGeometry args={[1.7, 2.0, 1.1, 12]} />
          <meshStandardMaterial color="#fef3c7" emissive="#fbbf24" emissiveIntensity={1.8} />
        </mesh>
        <group ref={eiffelBeaconRef} position={[0, 64.0, 0]}>
          <mesh>
            <cylinderGeometry args={[1.15, 1.15, 2.2, 12]} />
            <meshStandardMaterial color="#fef9c3" emissive="#fde047" emissiveIntensity={2.8} />
          </mesh>
          <mesh position={[0, 0, 6]} rotation={[Math.PI / 2, 0, 0]}>
            <coneGeometry args={[1.8, 12, 12, 1, true]} />
            <meshBasicMaterial color="#fef08a" transparent opacity={0.35} side={THREE.DoubleSide} />
          </mesh>
        </group>
        <mesh position={[0, 71.5, 0]}>
          <cylinderGeometry args={[0.12, 0.7, 15, 12]} />
          <meshStandardMaterial color="#f8fafc" emissive="#f59e0b" emissiveIntensity={0.75} metalness={0.9} />
        </mesh>
      </group>

      {/* =================================================================================
          5. DUBAI — BURJ KHALIFA MEGATALL SPIRE (Height = 128m — Tallest on the Island!)
             Position: [54, burjY, -148] — Stepped Y-Plan Spiral Buttressed Glass Tower
         ================================================================================= */}
      <group position={[54, burjY, -148]}>
        {/* Sculpted Reflective Pool & Terraced Travertine/Granite Podium (ZERO office windows on base!) */}
        <mesh position={[0, 1.0, 0]} receiveShadow>
          <cylinderGeometry args={[18, 20, 2.0, 6]} />
          <meshStandardMaterial
            map={granitePodiumPBR.map}
            roughnessMap={granitePodiumPBR.roughnessMap}
            roughness={0.52}
            metalness={0.18}
          />
        </mesh>
        <mesh position={[0, 2.15, 0]} rotation={[-Math.PI / 2, 0, 0]}>
          <ringGeometry args={[13.5, 17.5, 36]} />
          <meshStandardMaterial color="#38bdf8" emissive="#0284c7" emissiveIntensity={1.2} />
        </mesh>

        {/* Central Hexagonal Silver-Glass Megatall Core (y = 2m..106m) */}
        <mesh position={[0, 54, 0]} castShadow receiveShadow>
          <cylinderGeometry args={[2.6, 5.8, 104, 6]} />
          <meshPhysicalMaterial
            map={skyscraperPBR.map}
            roughnessMap={skyscraperPBR.roughnessMap}
            color="#bae6fd"
            metalness={0.85}
            roughness={0.14}
            clearcoat={1.0}
          />
        </mesh>

        {/* 7 Spiraling Y-Plan (3-Wing at 0°, 120°, 240°) Stepped Setback Buttresses */}
        {[
          { h: 20, r: 12.5, wingIdx: 0 },
          { h: 32, r: 11.2, wingIdx: 1 },
          { h: 44, r: 9.8, wingIdx: 2 },
          { h: 56, r: 8.5, wingIdx: 0 },
          { h: 68, r: 7.2, wingIdx: 1 },
          { h: 80, r: 5.8, wingIdx: 2 },
          { h: 92, r: 4.5, wingIdx: 0 },
        ].map((tier, tIdx) => (
          <group key={tIdx}>
            {[0, 1, 2].map((wIdx) => {
              const angle = (wIdx * Math.PI * 2) / 3;
              // Each wing steps back asymmetrically in a spiral pattern
              const wingReach = wIdx === tier.wingIdx ? tier.r : tier.r * 0.82;
              const wx = Math.cos(angle) * (wingReach * 0.5);
              const wz = Math.sin(angle) * (wingReach * 0.5);
              return (
                <group key={wIdx} position={[wx, tier.h / 2 + 2, wz]} rotation={[0, -angle, 0]}>
                  <mesh castShadow receiveShadow>
                    <boxGeometry args={[wingReach, tier.h, 4.2 - tIdx * 0.25]} />
                    <meshPhysicalMaterial
                      map={skyscraperPBR.map}
                      roughnessMap={skyscraperPBR.roughnessMap}
                      color="#e0f2fe"
                      metalness={0.82}
                      roughness={0.16}
                      clearcoat={1.0}
                    />
                  </mesh>
                  {/* Rounded Nose Fin + Glowing Stainless-Steel Setback Crown */}
                  <mesh position={[wingReach / 2, tier.h / 2 + 0.2, 0]}>
                    <cylinderGeometry args={[2.0 - tIdx * 0.12, 2.0 - tIdx * 0.12, 0.5, 12]} />
                    <meshStandardMaterial color="#f8fafc" emissive="#38bdf8" emissiveIntensity={2.0} />
                  </mesh>
                </group>
              );
            })}
          </group>
        ))}

        {/* Upper Telescopic Spire & Strobe Beacon reaching 128m */}
        <mesh position={[0, 114, 0]} castShadow>
          <cylinderGeometry args={[0.85, 2.2, 18, 12]} />
          <meshPhysicalMaterial color="#f1f5f9" metalness={0.95} roughness={0.1} clearcoat={1} />
        </mesh>
        <mesh position={[0, 124, 0]}>
          <cylinderGeometry args={[0.15, 0.65, 10, 10]} />
          <meshStandardMaterial color="#ffffff" emissive="#e0f2fe" emissiveIntensity={1.6} metalness={0.95} />
        </mesh>
        <mesh position={[0, 129, 0]}>
          <sphereGeometry args={[0.45, 10, 10]} />
          <meshStandardMaterial color="#38bdf8" emissive="#38bdf8" emissiveIntensity={3.5} />
        </mesh>
      </group>

      {/* =================================================================================
          6. ROME — THE COLOSSEUM (FLAVIAN AMPHITHEATRE)
             Position: [-105, colosseumY, 45] — Open Semi-Circular Arched Travertine Arcade & Cavea
         ================================================================================= */}
      <group position={[-105, colosseumY, 45]}>
        {/* Travertine Stone Stylobate Base Plaza */}
        <mesh position={[0, 0.55, 0]} receiveShadow>
          <cylinderGeometry args={[24.0, 25.0, 1.1, 64]} />
          <meshStandardMaterial
            map={granitePodiumPBR.map}
            roughnessMap={granitePodiumPBR.roughnessMap}
            roughness={0.68}
          />
        </mesh>

        {/* Sandy Elliptical Arena Floor (y = 1.2m) + Travertine Arena Podium Wall */}
        <mesh position={[0, 1.2, 0]} receiveShadow>
          <cylinderGeometry args={[14.2, 14.2, 0.35, 48]} />
          <meshStandardMaterial color="#d6b88a" roughness={0.88} />
        </mesh>
        <mesh position={[0, 2.8, 0]} receiveShadow>
          <cylinderGeometry args={[14.3, 14.3, 3.2, 48, 1, true]} />
          <meshStandardMaterial
            map={limestonePBR.map}
            color="#d6c4ab"
            roughness={0.68}
            side={THREE.DoubleSide}
          />
        </mesh>

        {/* Outer Open-Ended Cylindrical Travertine Facade with 3 Stories of Semi-Circular Roman Arches */}
        <mesh position={[0, 10.6, 0]} castShadow receiveShadow>
          <cylinderGeometry args={[22.0, 22.0, 19.2, 64, 1, true]} />
          <meshStandardMaterial
            map={colosseumArcadePBR.map}
            roughnessMap={colosseumArcadePBR.roughnessMap}
            color="#efe4d2"
            roughness={0.62}
            side={THREE.DoubleSide}
          />
        </mesh>

        {/* Historic Surviving North-East Outer Ring rising to the 4th-Story Corinthian Attic (y = 12.6m, height = 23.2m) */}
        <mesh position={[0, 12.6, 0]} rotation={[0, -0.45, 0]} castShadow receiveShadow>
          <cylinderGeometry args={[22.45, 22.45, 23.2, 48, 1, true, 0, Math.PI * 1.24]} />
          <meshStandardMaterial
            map={colosseumArcadePBR.map}
            roughnessMap={colosseumArcadePBR.roughnessMap}
            color="#e7d8c1"
            roughness={0.6}
            side={THREE.DoubleSide}
          />
        </mesh>

        {/* Inner Concentric Travertine Arched Ambulatory Wall (r = 19.6m, openEnded = true) */}
        <mesh position={[0, 9.8, 0]} castShadow receiveShadow>
          <cylinderGeometry args={[19.6, 19.6, 17.6, 64, 1, true]} />
          <meshStandardMaterial
            map={colosseumArcadePBR.map}
            roughnessMap={colosseumArcadePBR.roughnessMap}
            color="#dfd0b8"
            roughness={0.66}
            side={THREE.DoubleSide}
          />
        </mesh>

        {/* Sculpted Travertine Cornice Rings between Arcade Stories */}
        {[
          { y: 6.2, r: 22.15 },
          { y: 11.4, r: 22.15 },
          { y: 16.5, r: 22.15 },
          { y: 20.2, r: 22.15 },
        ].map((ring, rIdx) => (
          <mesh key={rIdx} position={[0, ring.y, 0]} rotation={[Math.PI / 2, 0, 0]}>
            <torusGeometry args={[ring.r, 0.34, 8, 64]} />
            <meshStandardMaterial map={limestonePBR.map} color="#e2d3bc" roughness={0.58} />
          </mesh>
        ))}

        {/* 36 Perimeter Travertine Engaged Columns & Warm Roman Arch Intrados Uplighting */}
        {Array.from({ length: 36 }).map((_, i) => {
          const ang = (i * Math.PI * 2) / 36;
          const cx = Math.cos(ang) * 22.2;
          const cz = Math.sin(ang) * 22.2;
          return (
            <group key={i} position={[cx, 0, cz]} rotation={[0, -ang, 0]}>
              <mesh position={[0, 10.6, 0]} castShadow>
                <cylinderGeometry args={[0.32, 0.38, 19.0, 10]} />
                <meshStandardMaterial map={limestonePBR.map} color="#efe4d2" roughness={0.56} />
              </mesh>
              {i % 2 === 0 && (
                <>
                  {/* Warm Amber Roman Arch Glow recessed inside the ambulatory */}
                  <mesh position={[-1.1, 3.6, 0]}>
                    <boxGeometry args={[0.35, 3.2, 1.4]} />
                    <meshStandardMaterial color="#fef3c7" emissive="#f59e0b" emissiveIntensity={1.15} />
                  </mesh>
                  <mesh position={[-1.1, 9.0, 0]}>
                    <boxGeometry args={[0.35, 3.0, 1.4]} />
                    <meshStandardMaterial color="#fef3c7" emissive="#d97706" emissiveIntensity={0.95} />
                  </mesh>
                </>
              )}
            </group>
          );
        })}

        {/* Tiered Interior Travertine Cavea Seating Rings stepping down inside to the Arena Floor */}
        {[
          { rOut: 19.4, rIn: 17.8, y: 14.8, h: 3.0 },
          { rOut: 17.8, rIn: 16.0, y: 10.6, h: 3.0 },
          { rOut: 16.0, rIn: 14.3, y: 6.4, h: 3.0 },
        ].map((cavea, cIdx) => (
          <mesh key={cIdx} position={[0, cavea.y, 0]} receiveShadow>
            <cylinderGeometry args={[cavea.rOut, cavea.rIn, cavea.h, 48, 1, true]} />
            <meshStandardMaterial
              map={limestonePBR.map}
              roughnessMap={limestonePBR.roughnessMap}
              color="#d6c7b2"
              roughness={0.68}
              side={THREE.DoubleSide}
            />
          </mesh>
        ))}
      </group>

      {/* =================================================================================
          7. SYDNEY — SYDNEY OPERA HOUSE (6 Pointed Gothic-Arch Ceramic Sail Shells & Granite Podium)
             Position: [148, sydneyY, 108]
         ================================================================================= */}
      <group position={[148, sydneyY, 108]}>
        {/* Bennelong Point Monumental Pink-Beige Granite Harbor Podium (46m × 5m × 34m — ZERO office windows!) */}
        <mesh position={[0, 2.5, 0]} castShadow receiveShadow>
          <boxGeometry args={[46, 5, 34]} />
          <meshStandardMaterial
            map={granitePodiumPBR.map}
            roughnessMap={granitePodiumPBR.roughnessMap}
            color="#dfd0c2"
            roughness={0.6}
            metalness={0.1}
          />
        </mesh>
        {/* Waterfront Broadwalk Granite Balustrade Promenade around the Harbor Podium */}
        <mesh position={[1.0, 5.35, 16.6]} castShadow receiveShadow>
          <boxGeometry args={[44, 0.7, 0.6]} />
          <meshStandardMaterial map={granitePodiumPBR.map} color="#e7d9cc" roughness={0.55} />
        </mesh>
        <mesh position={[1.0, 5.35, -16.6]} castShadow receiveShadow>
          <boxGeometry args={[44, 0.7, 0.6]} />
          <meshStandardMaterial map={granitePodiumPBR.map} color="#e7d9cc" roughness={0.55} />
        </mesh>
        <mesh position={[22.7, 5.35, 0]} castShadow receiveShadow>
          <boxGeometry args={[0.6, 0.7, 33.8]} />
          <meshStandardMaterial map={granitePodiumPBR.map} color="#e7d9cc" roughness={0.55} />
        </mesh>

        {/* Ceremonial Monumental Grand Staircase facing West toward the Forecourt */}
        {[0, 1, 2, 3, 4, 5].map((step) => (
          <mesh key={step} position={[-23.2 - step * 1.35, 4.5 - step * 0.75, 0]} receiveShadow>
            <boxGeometry args={[1.5, 0.85, 26]} />
            <meshStandardMaterial
              map={granitePodiumPBR.map}
              roughnessMap={granitePodiumPBR.roughnessMap}
              color="#e5d5c5"
              roughness={0.62}
            />
          </mesh>
        ))}

        {/* Concert Hall (North Wing) — 3 Interlocking Pointed Gothic-Arch White Ceramic Sail Vaults (rising to y = 34m!) */}
        <group position={[-11, 5.0, -7.2]}>
          {/* Shell A1: Main Tallest Vault (height 29m + 5m podium = 34m peak!) */}
          <mesh geometry={operaSailGeometries.tallHallA} position={[-7.5, 0, 0]} rotation={[0, 0.06, 0]} castShadow receiveShadow>
            <meshPhysicalMaterial
              map={ceramicShellPBR.map}
              roughnessMap={ceramicShellPBR.roughnessMap}
              color="#f8fafc"
              roughness={0.16}
              metalness={0.1}
              clearcoat={1.0}
              clearcoatRoughness={0.08}
              side={THREE.DoubleSide}
            />
          </mesh>
          {/* Shell A2: Middle Interlocking Vault */}
          <mesh geometry={operaSailGeometries.midHallA} position={[1.5, 0, 0]} rotation={[0, 0.03, 0]} castShadow receiveShadow>
            <meshPhysicalMaterial
              map={ceramicShellPBR.map}
              roughnessMap={ceramicShellPBR.roughnessMap}
              color="#f8fafc"
              roughness={0.16}
              metalness={0.1}
              clearcoat={1.0}
              clearcoatRoughness={0.08}
              side={THREE.DoubleSide}
            />
          </mesh>
          {/* Shell A3: Harbor-Facing Vault */}
          <mesh geometry={operaSailGeometries.lowHallA} position={[9.2, 0, 0]} castShadow receiveShadow>
            <meshPhysicalMaterial
              map={ceramicShellPBR.map}
              roughnessMap={ceramicShellPBR.roughnessMap}
              color="#f8fafc"
              roughness={0.16}
              metalness={0.1}
              clearcoat={1.0}
              clearcoatRoughness={0.08}
              side={THREE.DoubleSide}
            />
          </mesh>
          {/* Dark Bronze-Framed Acoustic Glass Curtain Walls recessed into the Shell Openings */}
          <mesh position={[5.8, 8.2, 0]} rotation={[0, 0, -0.28]}>
            <coneGeometry args={[5.8, 16.5, 4]} />
            <meshPhysicalMaterial
              color="#1e293b"
              emissive="#fbbf24"
              emissiveIntensity={0.42}
              metalness={0.78}
              roughness={0.14}
              clearcoat={1.0}
            />
          </mesh>
          <mesh position={[17.2, 5.8, 0]} rotation={[0, 0, -0.32]}>
            <coneGeometry args={[4.2, 11.5, 4]} />
            <meshPhysicalMaterial
              color="#1e293b"
              emissive="#f59e0b"
              emissiveIntensity={0.48}
              metalness={0.78}
              roughness={0.14}
              clearcoat={1.0}
            />
          </mesh>
        </group>

        {/* Joan Sutherland Theatre (South Wing) — 2 Interlocking Pointed Gothic-Arch Ceramic Sail Vaults */}
        <group position={[-8, 5.0, 7.6]}>
          <mesh geometry={operaSailGeometries.tallHallB} position={[-5.5, 0, 0]} rotation={[0, -0.06, 0]} castShadow receiveShadow>
            <meshPhysicalMaterial
              map={ceramicShellPBR.map}
              roughnessMap={ceramicShellPBR.roughnessMap}
              color="#f8fafc"
              roughness={0.16}
              metalness={0.1}
              clearcoat={1.0}
              clearcoatRoughness={0.08}
              side={THREE.DoubleSide}
            />
          </mesh>
          <mesh geometry={operaSailGeometries.midHallB} position={[3.5, 0, 0]} rotation={[0, -0.03, 0]} castShadow receiveShadow>
            <meshPhysicalMaterial
              map={ceramicShellPBR.map}
              roughnessMap={ceramicShellPBR.roughnessMap}
              color="#f8fafc"
              roughness={0.16}
              metalness={0.1}
              clearcoat={1.0}
              clearcoatRoughness={0.08}
              side={THREE.DoubleSide}
            />
          </mesh>
          {/* Dark Bronze-Framed Glass Curtain Wall recessed into South Hall Opening */}
          <mesh position={[12.5, 6.8, 0]} rotation={[0, 0, -0.3]}>
            <coneGeometry args={[4.8, 13.5, 4]} />
            <meshPhysicalMaterial
              color="#1e293b"
              emissive="#fbbf24"
              emissiveIntensity={0.45}
              metalness={0.78}
              roughness={0.14}
              clearcoat={1.0}
            />
          </mesh>
        </group>

        {/* 6th Bennelong Restaurant Entrance Shell at Forecourt (facing West) */}
        <group position={[-13.5, 5.0, 9.8]} rotation={[0, Math.PI, 0]}>
          <mesh geometry={operaSailGeometries.restaurantShell} castShadow receiveShadow>
            <meshPhysicalMaterial
              map={ceramicShellPBR.map}
              roughnessMap={ceramicShellPBR.roughnessMap}
              color="#f8fafc"
              roughness={0.16}
              metalness={0.1}
              clearcoat={1.0}
              clearcoatRoughness={0.08}
              side={THREE.DoubleSide}
            />
          </mesh>
          <mesh position={[6.8, 4.4, 0]} rotation={[0, 0, -0.3]}>
            <coneGeometry args={[3.4, 8.8, 4]} />
            <meshPhysicalMaterial
              color="#1e293b"
              emissive="#fbbf24"
              emissiveIntensity={0.45}
              metalness={0.78}
              roughness={0.14}
              clearcoat={1.0}
            />
          </mesh>
        </group>
      </group>

      {/* =================================================================================
          8. TOKYO — TOKYO TOWER & SHIBUYA NEON PLAZA
             Position: [52, tokyoY, -28] — 78m Red & White Lattice Tower + Neon Billboards
         ================================================================================= */}
      <group position={[52, tokyoY, -28]}>
        {/* Shibuya Plaza Granite & Cobble Base Podium */}
        <mesh position={[0, 0.5, 0]} receiveShadow>
          <boxGeometry args={[26, 1.0, 26]} />
          <meshStandardMaterial
            map={granitePodiumPBR.map}
            roughnessMap={granitePodiumPBR.roughnessMap}
            roughness={0.64}
          />
        </mesh>
        {/* 4 Splayed Red Steel Lattice Corner Legs + Granite Footings */}
        {[
          [1, 1],
          [-1, 1],
          [-1, -1],
          [1, -1],
        ].map(([sx, sz], idx) => (
          <React.Fragment key={idx}>
            <mesh position={[sx * 8.6, 1.4, sz * 8.6]} castShadow receiveShadow>
              <boxGeometry args={[2.8, 1.8, 2.8]} />
              <meshStandardMaterial map={granitePodiumPBR.map} roughness={0.6} />
            </mesh>
            <mesh
              position={[sx * 6.5, 13, sz * 6.5]}
              rotation={[sz * 0.2, 0, -sx * 0.2]}
              castShadow
            >
              <boxGeometry args={[1.6, 27, 1.6]} />
              <meshStandardMaterial
                map={steelTrussPBR.map}
                roughnessMap={steelTrussPBR.roughnessMap}
                color="#dc2626"
                metalness={0.68}
                roughness={0.3}
              />
            </mesh>
          </React.Fragment>
        ))}
        {/* Horizontal & Arch-Truss Bracing Rings between the 4 Lower Red Legs */}
        {[9, 15, 21].map((ly, lIdx) => {
          const span = (8.5 - lIdx * 1.4) * 2;
          return (
            <mesh key={lIdx} position={[0, ly, 0]} castShadow>
              <boxGeometry args={[span, 0.9, span]} />
              <meshStandardMaterial
                map={steelTrussPBR.map}
                color={lIdx === 1 ? '#f8fafc' : '#dc2626'}
                metalness={0.68}
                roughness={0.3}
              />
            </mesh>
          );
        })}

        {/* 2-Story White & Red Main Observation Deck (y = 26m) */}
        <mesh position={[0, 26, 0]} castShadow>
          <boxGeometry args={[13.5, 4.4, 13.5]} />
          <meshStandardMaterial color="#f8fafc" roughness={0.28} metalness={0.35} />
        </mesh>
        <mesh position={[0, 26, 0]}>
          <boxGeometry args={[13.8, 1.4, 13.8]} />
          <meshStandardMaterial color="#fef08a" emissive="#38bdf8" emissiveIntensity={1.6} />
        </mesh>

        {/* 7 Alternating International Orange-Red (#dc2626) & Crisp White (#f8fafc) Lattice Bands */}
        {[
          { y: 31.5, h: 6.5, rBot: 4.5, rTop: 3.9, col: '#dc2626' },
          { y: 38.0, h: 6.5, rBot: 3.9, rTop: 3.3, col: '#f8fafc' },
          { y: 44.5, h: 6.5, rBot: 3.3, rTop: 2.7, col: '#dc2626' },
          { y: 50.5, h: 5.5, rBot: 2.7, rTop: 2.2, col: '#f8fafc' },
          { y: 57.5, h: 6.0, rBot: 1.9, rTop: 1.4, col: '#dc2626' },
          { y: 63.5, h: 6.0, rBot: 1.4, rTop: 0.9, col: '#f8fafc' },
          { y: 71.5, h: 10.0, rBot: 0.65, rTop: 0.18, col: '#dc2626' },
        ].map((band, bIdx) => (
          <mesh key={bIdx} position={[0, band.y, 0]} rotation={[0, Math.PI / 4, 0]} castShadow>
            <cylinderGeometry args={[band.rTop, band.rBot, band.h, 4]} />
            <meshStandardMaterial
              map={steelTrussPBR.map}
              roughnessMap={steelTrussPBR.roughnessMap}
              color={band.col}
              metalness={0.68}
              roughness={0.28}
            />
          </mesh>
        ))}

        {/* Top Deck Observatory (y = 53.5m) */}
        <mesh position={[0, 53.5, 0]} castShadow>
          <cylinderGeometry args={[3.4, 3.4, 2.8, 8]} />
          <meshStandardMaterial color="#f8fafc" emissive="#f43f5e" emissiveIntensity={0.95} />
        </mesh>

        {/* Flanking Shibuya-Style Illuminated Vertical Neon Signboards on Plaza Corners */}
        {[
          { pos: [-10.5, 6.5, 10.5] as [number, number, number], col: '#ec4899' },
          { pos: [10.5, 7.5, 10.5] as [number, number, number], col: '#06b6d4' },
          { pos: [-10.5, 7.0, -10.5] as [number, number, number], col: '#fde047' },
          { pos: [10.5, 6.5, -10.5] as [number, number, number], col: '#a855f7' },
        ].map((neon, nIdx) => (
          <group key={nIdx} position={neon.pos}>
            <mesh castShadow>
              <boxGeometry args={[2.4, 11, 2.4]} />
              <meshStandardMaterial color="#0f172a" metalness={0.8} roughness={0.25} />
            </mesh>
            <mesh position={[0, 0.5, 0]}>
              <boxGeometry args={[2.55, 9.2, 1.8]} />
              <meshStandardMaterial color={neon.col} emissive={neon.col} emissiveIntensity={2.2} />
            </mesh>
          </group>
        ))}
      </group>

      {/* =================================================================================
          9. NEW YORK — STATUE OF LIBERTY & 11-POINT HARBOR STAR-FORT
             Position: [-158, libertyY, -145]
         ================================================================================= */}
      <group position={[-158, libertyY, -145]}>
        {/* Sculpted 11-Point Fort Wood Granite Star-Fort Base */}
        <mesh geometry={starFortGeo} position={[0, 0, 0]} castShadow receiveShadow>
          <meshStandardMaterial
            map={granitePodiumPBR.map}
            roughnessMap={granitePodiumPBR.roughnessMap}
            roughness={0.7}
          />
        </mesh>
        {/* Richard Morris Hunt Rusticated Granite Pedestal + Colonnade Balcony (ZERO office windows!) */}
        <mesh position={[0, 10.5, 0]} castShadow receiveShadow>
          <boxGeometry args={[12.5, 12, 12.5]} />
          <meshStandardMaterial
            map={granitePodiumPBR.map}
            roughnessMap={granitePodiumPBR.roughnessMap}
            roughness={0.62}
          />
        </mesh>
        <mesh position={[0, 17.2, 0]} castShadow>
          <boxGeometry args={[10.2, 2.4, 10.2]} />
          <meshStandardMaterial map={limestonePBR.map} roughness={0.58} />
        </mesh>
        {/* Sculpted Verdigris Copper Statue (createCopperPatinaPBR) */}
        <mesh position={[0, 18.2, 0]} geometry={libertyRobeGeo} castShadow>
          <meshStandardMaterial
            map={copperPatinaPBR.map}
            roughnessMap={copperPatinaPBR.roughnessMap}
            color="#5eead4"
            metalness={0.36}
            roughness={0.46}
          />
        </mesh>
        {/* Tablet of Law held in left arm (JULY IV MDCCLXXVI) */}
        <mesh position={[-2.6, 30.5, 1.6]} rotation={[0.35, 0.25, 0.4]} castShadow>
          <boxGeometry args={[1.8, 3.2, 0.45]} />
          <meshStandardMaterial
            map={copperPatinaPBR.map}
            roughnessMap={copperPatinaPBR.roughnessMap}
            color="#5eead4"
            metalness={0.38}
            roughness={0.42}
          />
        </mesh>
        {/* Sculpted Head & 7-Ray Halo Crown */}
        <mesh position={[0, 39.5, 0]} castShadow>
          <sphereGeometry args={[1.65, 16, 16]} />
          <meshStandardMaterial
            map={copperPatinaPBR.map}
            roughnessMap={copperPatinaPBR.roughnessMap}
            color="#5eead4"
            metalness={0.36}
            roughness={0.46}
          />
        </mesh>
        <mesh position={[0, 40.8, 0]} rotation={[0.15, 0, 0]}>
          <cylinderGeometry args={[2.5, 1.5, 0.95, 7]} />
          <meshStandardMaterial color="#99f6e4" metalness={0.52} roughness={0.32} />
        </mesh>
        {[0, 1, 2, 3, 4, 5, 6].map((rayIdx) => {
          const ang = ((rayIdx - 3) * Math.PI) / 8;
          return (
            <mesh
              key={rayIdx}
              position={[Math.sin(ang) * 2.4, 41.2 + Math.cos(ang) * 0.6, Math.cos(ang) * 1.4]}
              rotation={[0.4, 0, -ang]}
            >
              <coneGeometry args={[0.24, 2.2, 4]} />
              <meshStandardMaterial color="#99f6e4" metalness={0.55} roughness={0.3} />
            </mesh>
          );
        })}
        {/* Raised Right Torch Arm + Glowing Golden Flame */}
        <mesh position={[2.2, 42.0, 0.8]} rotation={[0, 0, -0.25]} castShadow>
          <cylinderGeometry args={[0.48, 0.68, 9.2, 10]} />
          <meshStandardMaterial
            map={copperPatinaPBR.map}
            roughnessMap={copperPatinaPBR.roughnessMap}
            color="#5eead4"
            metalness={0.36}
            roughness={0.46}
          />
        </mesh>
        <mesh position={[3.3, 46.8, 0.8]}>
          <cylinderGeometry args={[1.1, 0.55, 0.9, 12]} />
          <meshStandardMaterial color="#d97706" metalness={0.85} roughness={0.22} />
        </mesh>
        <mesh position={[3.3, 48.6, 0.8]}>
          <coneGeometry args={[1.15, 3.2, 12]} />
          <meshStandardMaterial color="#fef08a" emissive="#f59e0b" emissiveIntensity={2.6} />
        </mesh>
      </group>

      {/* =================================================================================
          10. RIO DE JANEIRO — CHRIST THE REDEEMER ON CORCOVADO PEAK
              Position: [58, rioY, 148] — Octagonal Pedestal & 28m Art Deco Soapstone Statue
         ================================================================================= */}
      <group position={[58, rioY, 148]} rotation={[0, Math.PI, 0]}>
        {/* Corcovado Mountain Stepped Observation Plaza */}
        <mesh position={[0, 1.5, 0]} castShadow receiveShadow>
          <cylinderGeometry args={[16, 19, 3.0, 8]} />
          <meshStandardMaterial
            map={granitePodiumPBR.map}
            roughnessMap={granitePodiumPBR.roughnessMap}
            roughness={0.68}
          />
        </mesh>
        {/* 12m Octagonal Ribbed Granite Pedestal (ZERO office windows!) */}
        <mesh position={[0, 9.0, 0]} castShadow receiveShadow>
          <cylinderGeometry args={[5.2, 6.8, 12.0, 8]} />
          <meshStandardMaterial
            map={granitePodiumPBR.map}
            roughnessMap={granitePodiumPBR.roughnessMap}
            color="#e7e5e4"
            roughness={0.55}
          />
        </mesh>
        {/* Monumental 28m Art Deco Pale Soapstone Draped Tunic Torso */}
        <mesh position={[0, 26.5, 0]} castShadow receiveShadow>
          <cylinderGeometry args={[2.6, 4.2, 23.5, 12]} />
          <meshStandardMaterial
            map={limestonePBR.map}
            roughnessMap={limestonePBR.roughnessMap}
            color="#f5f5f4"
            roughness={0.46}
            metalness={0.08}
          />
        </mesh>
        {/* Draped Diagonal Mantle Fold & Sacred Heart Relief on Chest */}
        <mesh position={[0, 28.5, 2.55]}>
          <boxGeometry args={[2.8, 14, 0.6]} />
          <meshStandardMaterial map={limestonePBR.map} color="#fafaf9" roughness={0.42} />
        </mesh>
        <mesh position={[0, 32.8, 2.95]}>
          <sphereGeometry args={[0.62, 12, 12]} />
          <meshStandardMaterial color="#fef3c7" emissive="#fbbf24" emissiveIntensity={1.1} />
        </mesh>
        {/* Wide Outstretched Horizontal Arms (26m Wingspan!) */}
        <mesh position={[0, 34.2, 0]} castShadow receiveShadow>
          <boxGeometry args={[26.0, 2.6, 2.4]} />
          <meshStandardMaterial
            map={limestonePBR.map}
            roughnessMap={limestonePBR.roughnessMap}
            color="#f5f5f4"
            roughness={0.45}
          />
        </mesh>
        {/* Tapered Draped Sleeves under Outstretched Arms */}
        {[-6.5, 6.5].map((ax, idx) => (
          <mesh key={idx} position={[ax, 32.6, 0]} rotation={[0, 0, ax > 0 ? 0.16 : -0.16]} castShadow>
            <boxGeometry args={[10.5, 1.8, 1.9]} />
            <meshStandardMaterial map={limestonePBR.map} color="#f5f5f4" roughness={0.46} />
          </mesh>
        ))}
        {/* Gently Bowed Art Deco Sculpted Head */}
        <mesh position={[0, 40.2, 0.45]} rotation={[0.18, 0, 0]} castShadow>
          <cylinderGeometry args={[1.45, 1.35, 3.8, 12]} />
          <meshStandardMaterial map={limestonePBR.map} color="#f5f5f4" roughness={0.44} />
        </mesh>
      </group>

      {/* =================================================================================
          11. VENICE — RIALTO BRIDGE, GRAND CANAL & ST. MARK'S CAMPANILE
              Position: [135, 0, -95]
         ================================================================================= */}
      <group position={[135, 0, -95]}>
        {/* Sculpted Arched Stone Rialto Bridge */}
        <mesh geometry={rialtoArchGeo} position={[0, 0, 0]} castShadow receiveShadow>
          <meshStandardMaterial
            map={limestonePBR.map}
            roughnessMap={limestonePBR.roughnessMap}
            roughness={0.6}
          />
        </mesh>
        {[-3.85, 3.85].map((rx) => (
          <mesh key={rx} position={[rx, -1.3, 0]} rotation={[0, Math.PI / 2, Math.PI * 0.14]} castShadow>
            <torusGeometry args={[11.2, 0.36, 8, 24, Math.PI * 0.72]} />
            <meshStandardMaterial map={limestonePBR.map} color="#d6cfc2" roughness={0.56} />
          </mesh>
        ))}
        {/* Bridge Balustrade Side Walls & Central Covered Portico */}
        {[-3.6, 3.6].map((bx) => (
          <mesh key={bx} position={[bx, 6.2, 0]} rotation={[Math.PI / 2, 0, 0]}>
            <boxGeometry args={[0.6, 26, 1.4]} />
            <meshStandardMaterial map={limestonePBR.map} roughness={0.58} />
          </mesh>
        ))}
        {[-8.5, -4.25, 0, 4.25, 8.5].map((cz) => {
          const archY = 8.4 - Math.pow(cz / 14, 2) * 3.2;
          return (
            <React.Fragment key={cz}>
              <mesh position={[-3.6, archY, cz]} castShadow>
                <cylinderGeometry args={[0.24, 0.3, 3.2, 8]} />
                <meshStandardMaterial map={limestonePBR.map} roughness={0.54} />
              </mesh>
              <mesh position={[3.6, archY, cz]} castShadow>
                <cylinderGeometry args={[0.24, 0.3, 3.2, 8]} />
                <meshStandardMaterial map={limestonePBR.map} roughness={0.54} />
              </mesh>
            </React.Fragment>
          );
        })}
        {/* Bridge Approach Steps */}
        {[-1, 1].map((dir) => (
          <group key={dir}>
            <mesh position={[0, 2.2, dir * 14.8]} receiveShadow>
              <boxGeometry args={[8.2, 1.4, 2.0]} />
              <meshStandardMaterial map={limestonePBR.map} roughness={0.66} />
            </mesh>
            <mesh position={[0, 1.0, dir * 16.5]} receiveShadow>
              <boxGeometry args={[8.6, 1.2, 2.0]} />
              <meshStandardMaterial map={limestonePBR.map} roughness={0.66} />
            </mesh>
          </group>
        ))}
        {/* Quay Seawall Edges along the Grand Canal */}
        {[-18, 18].map((qz) => (
          <group key={qz} position={[0, 0.4, qz]}>
            <mesh receiveShadow castShadow>
              <boxGeometry args={[112, 3.4, 2.4]} />
              <meshStandardMaterial map={limestonePBR.map} roughness={0.72} />
            </mesh>
            <mesh position={[0, 1.85, 0]} receiveShadow>
              <boxGeometry args={[112, 0.35, 2.8]} />
              <meshStandardMaterial color="#e7dfd3" roughness={0.55} />
            </mesh>
          </group>
        ))}

        {/* 4 Italian Renaissance Palazzos (createPalazzoPBR) */}
        {[
          { x: -18, z: -26, w: 18, h: 16, d: 14, tint: '#fef3c7' },
          { x: 18, z: -26, w: 20, h: 20, d: 14, tint: '#fed7aa' },
          { x: -18, z: 26, w: 18, h: 18, d: 14, tint: '#fecdd3' },
          { x: 18, z: 26, w: 22, h: 15, d: 14, tint: '#fde68a' },
        ].map((p, idx) => (
          <group key={idx} position={[p.x, 0, p.z]}>
            <mesh position={[0, p.h / 2, 0]} castShadow receiveShadow>
              <boxGeometry args={[p.w, p.h, p.d]} />
              <meshStandardMaterial
                map={palazzoPBR.map}
                roughnessMap={palazzoPBR.roughnessMap}
                color={p.tint}
                roughness={0.66}
              />
            </mesh>
            <mesh position={[0, p.h + 2.6, 0]} rotation={[0, Math.PI / 4, 0]} castShadow>
              <coneGeometry args={[Math.max(p.w, p.d) * 0.78, 5.2, 4]} />
              <meshStandardMaterial color="#c2410c" roughness={0.78} />
            </mesh>
          </group>
        ))}

        {/* St. Mark's Campanile Fluted Brick Bell Tower (createBrickResidentialPBR) */}
        <group position={[-28, 0, 26]}>
          <mesh position={[0, 17, 0]} castShadow receiveShadow>
            <boxGeometry args={[5.8, 34, 5.8]} />
            <meshStandardMaterial
              map={brickPBR.map}
              roughnessMap={brickPBR.roughnessMap}
              color="#d97706"
              roughness={0.68}
            />
          </mesh>
          <mesh position={[0, 36.5, 0]} castShadow>
            <boxGeometry args={[6.2, 5.2, 6.2]} />
            <meshStandardMaterial map={limestonePBR.map} roughness={0.55} />
          </mesh>
          <mesh position={[0, 44.5, 0]} rotation={[0, Math.PI / 4, 0]} castShadow>
            <coneGeometry args={[4.6, 11, 4]} />
            <meshStandardMaterial
              map={copperPatinaPBR.map}
              roughnessMap={copperPatinaPBR.roughnessMap}
              color="#14b8a6"
              metalness={0.42}
              roughness={0.38}
            />
          </mesh>
        </group>
      </group>

      {/* =================================================================================
          12. CAIRO / GIZA — GREAT PYRAMID, TEMPLE PORTAL, TWIN OBELISKS & SKYBEAM
              Position: [-118, gizaY, -28] — Relocated cleanly to West Heritage Plaza
         ================================================================================= */}
      <group position={[-118, gizaY, -28]}>
        {/* Monumental Limestone & Bronze-Glass Great Pyramid */}
        <mesh position={[0, 22, 0]} rotation={[0, Math.PI / 4, 0]} castShadow receiveShadow>
          <coneGeometry args={[34, 44, 4]} />
          <meshPhysicalMaterial
            map={limestonePBR.map}
            roughnessMap={limestonePBR.roughnessMap}
            color="#bfa07a"
            metalness={0.38}
            roughness={0.28}
            clearcoat={0.75}
          />
        </mesh>
        {/* Structural Corner Ribs */}
        {pyramidCornerRibs.map((rib, idx) => (
          <mesh key={idx} position={rib.mid} quaternion={rib.quat} castShadow>
            <boxGeometry args={[0.75, rib.len, 0.75]} />
            <meshStandardMaterial color="#1e293b" metalness={0.85} roughness={0.24} />
          </mesh>
        ))}
        {/* Golden Pyramidion Capstone */}
        <mesh position={[0, 41.5, 0]} rotation={[0, Math.PI / 4, 0]}>
          <coneGeometry args={[5.2, 6.8, 4]} />
          <meshPhysicalMaterial color="#f59e0b" metalness={0.9} roughness={0.14} clearcoat={0.9} />
        </mesh>
        {/* Colonnaded Temple Portal facing East toward the City */}
        <mesh position={[25.5, 5.2, 0]} castShadow receiveShadow>
          <boxGeometry args={[8, 10.4, 15]} />
          <meshStandardMaterial map={limestonePBR.map} roughness={0.64} />
        </mesh>
        {[-5.5, -2.5, 2.5, 5.5].map((cz, i) => (
          <mesh key={i} position={[30.2, 5.0, cz]} castShadow>
            <cylinderGeometry args={[0.55, 0.72, 10, 12]} />
            <meshStandardMaterial map={limestonePBR.map} roughness={0.58} />
          </mesh>
        ))}
        {/* Twin Flanking Limestone Obelisks with Electrum Tips */}
        {[-10.5, 10.5].map((oz) => (
          <group key={oz} position={[33.0, 0, oz]}>
            <mesh position={[0, 0.7, 0]} castShadow receiveShadow>
              <boxGeometry args={[3.2, 1.4, 3.2]} />
              <meshStandardMaterial map={limestonePBR.map} roughness={0.68} />
            </mesh>
            <mesh position={[0, 8.1, 0]} rotation={[0, Math.PI / 4, 0]} castShadow>
              <cylinderGeometry args={[0.68, 1.18, 13.5, 4]} />
              <meshStandardMaterial map={limestonePBR.map} roughness={0.6} />
            </mesh>
            <mesh position={[0, 15.75, 0]} rotation={[0, Math.PI / 4, 0]}>
              <coneGeometry args={[0.68, 1.8, 4]} />
              <meshPhysicalMaterial color="#f59e0b" metalness={0.88} roughness={0.18} />
            </mesh>
          </group>
        ))}
        {/* Vertical Volumetric Skybeam */}
        <mesh ref={beamRef} position={[0, 220, 0]}>
          <cylinderGeometry args={[3.8, 0.8, 360, 16, 1, true]} />
          <shaderMaterial
            vertexShader={beamVertexShader}
            fragmentShader={beamFragmentShader}
            uniforms={beamUniforms}
            transparent
            depthWrite={false}
            blending={THREE.AdditiveBlending}
            side={THREE.DoubleSide}
          />
        </mesh>
      </group>

      {/* =================================================================================
          + GEODESIC SCIENCE SPHERE (East Science Plaza — Clear of all Avenues)
            Position: [98, sphereY, -35]
         ================================================================================= */}
      <group position={[98, sphereY, -35]}>
        <mesh position={[0, 1.0, 0]} receiveShadow>
          <cylinderGeometry args={[28, 30, 2.0, 48]} />
          <meshStandardMaterial map={limestonePBR.map} roughness={0.58} />
        </mesh>
        <mesh position={[0, 2.4, 0]} receiveShadow>
          <cylinderGeometry args={[24, 26, 1.1, 48]} />
          <meshStandardMaterial color="#334155" metalness={0.6} roughness={0.3} />
        </mesh>
        <mesh position={[0, 23.5, 0]} castShadow>
          <sphereGeometry args={[23, 64, 48]} />
          <shaderMaterial
            vertexShader={sphereVertexShader}
            fragmentShader={sphereFragmentShader}
            uniforms={sphereUniforms}
          />
        </mesh>
      </group>
    </group>
  );
}
