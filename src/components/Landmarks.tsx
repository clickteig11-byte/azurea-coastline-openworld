import React, { useMemo, useRef } from 'react';
import * as THREE from 'three';
import { useFrame } from '@react-three/fiber';
import { sphereVertexShader, sphereFragmentShader, beamVertexShader, beamFragmentShader } from './Shaders';
import { createLimestonePBR, createPalazzoPBR, createNormalMapFromCanvas } from './Textures';
import { getTerrainHeight } from '../game/worldMath';
import { simState } from '../game/store';

export function VegasLandmarks() {
  const sphereUniforms = useMemo(() => ({ uTime: { value: 0 }, uMode: { value: 0 } }), []);
  const beamUniforms = useMemo(() => ({ uTime: { value: 0 }, uColor: { value: new THREE.Color('#fef9c3') } }), []);
  const beamRef = useRef<THREE.Mesh>(null);

  const limestoneTex = useMemo(() => createLimestonePBR(), []);
  const limestoneNormal = useMemo(
    () => createNormalMapFromCanvas(limestoneTex.image as HTMLCanvasElement, 2.6, 3, 3),
    [limestoneTex]
  );
  const palazzoTex = useMemo(() => createPalazzoPBR(), []);
  const palazzoNormal = useMemo(
    () => createNormalMapFromCanvas(palazzoTex.image as HTMLCanvasElement, 2.5, 1, 1),
    [palazzoTex]
  );

  // Sculpted Luxor corner structural ribs (base corners to apex)
  const luxorCornerRibs = useMemo(() => {
    const up = new THREE.Vector3(0, 1, 0);
    const apex = new THREE.Vector3(0, 44, 0);
    const c = 36 * Math.SQRT1_2; // 25.456
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

  // Sculpted Eiffel Tower 4 curved steel piers
  const eiffelPiers = useMemo(() => {
    const dirs = [
      [1, 1],
      [-1, 1],
      [-1, -1],
      [1, -1],
    ];
    return dirs.map(([sx, sz]) => {
      const curve = new THREE.CatmullRomCurve3([
        new THREE.Vector3(sx * 13.5, 0, sz * 13.5),
        new THREE.Vector3(sx * 9.0, 14, sz * 9.0),
        new THREE.Vector3(sx * 5.2, 28, sz * 5.2),
        new THREE.Vector3(sx * 2.1, 46, sz * 2.1),
        new THREE.Vector3(sx * 0.7, 62, sz * 0.7),
      ]);
      return new THREE.TubeGeometry(curve, 20, 0.55, 8, false);
    });
  }, []);

  // Sculpted Rialto Bridge arch
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

  // Sculpted Lady Liberty draped robe (LatheGeometry)
  const libertyRobeGeo = useMemo(() => {
    const pts = [
      new THREE.Vector2(3.6, 0),
      new THREE.Vector2(3.2, 4),
      new THREE.Vector2(2.6, 9),
      new THREE.Vector2(2.2, 14),
      new THREE.Vector2(2.4, 17),
      new THREE.Vector2(1.5, 19),
      new THREE.Vector2(0.8, 20),
    ];
    return new THREE.LatheGeometry(pts, 18);
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
  });

  const luxorY = getTerrainHeight(-115, 85);
  const eiffelY = getTerrainHeight(95, 35);
  const libertyY = getTerrainHeight(-155, -145);
  const stratY = getTerrainHeight(10, -195);
  const sphereY = getTerrainHeight(0, -45);

  return (
    <group>
      {/* 1. THE SPHERE + TERRACED LIMESTONE PODIUM */}
      <group position={[0, sphereY, -45]}>
        <mesh position={[0, 1.0, 0]} receiveShadow>
          <cylinderGeometry args={[34, 36, 2.0, 48]} />
          <meshStandardMaterial map={limestoneTex} normalMap={limestoneNormal} bumpMap={limestoneTex} bumpScale={0.14} roughness={0.58} />
        </mesh>
        <mesh position={[0, 2.5, 0]} receiveShadow>
          <cylinderGeometry args={[29, 31, 1.2, 48]} />
          <meshStandardMaterial color="#334155" metalness={0.6} roughness={0.3} />
        </mesh>
        <mesh position={[0, 27.5, 0]} castShadow>
          <sphereGeometry args={[28, 64, 48]} />
          <shaderMaterial vertexShader={sphereVertexShader} fragmentShader={sphereFragmentShader} uniforms={sphereUniforms} />
        </mesh>
      </group>

      {/* 2. LUXOR BRONZE-GLASS PYRAMID + STRUCTURAL RIBS + OBELISKS + SKYBEAM */}
      <group position={[-115, luxorY, 85]}>
        <mesh position={[0, 22, 0]} rotation={[0, Math.PI / 4, 0]} castShadow receiveShadow>
          <coneGeometry args={[36, 44, 4]} />
          <meshPhysicalMaterial
            color="#5c4738"
            metalness={0.52}
            roughness={0.16}
            clearcoat={1.0}
            clearcoatRoughness={0.1}
          />
        </mesh>
        {/* Dark Anodized Structural Corner Ribs */}
        {luxorCornerRibs.map((rib, idx) => (
          <mesh key={idx} position={rib.mid} quaternion={rib.quat} castShadow>
            <boxGeometry args={[0.75, rib.len, 0.75]} />
            <meshStandardMaterial color="#1e293b" metalness={0.85} roughness={0.24} />
          </mesh>
        ))}
        {/* Horizontal Glass-Mullion Bands */}
        {[8, 16, 24, 32].map((bandY) => {
          const rBot = 36 * (1 - (bandY - 0.3) / 44) + 0.14;
          const rTop = 36 * (1 - (bandY + 0.3) / 44) + 0.14;
          return (
            <mesh key={bandY} position={[0, bandY, 0]} rotation={[0, Math.PI / 4, 0]}>
              <cylinderGeometry args={[rTop, rBot, 0.6, 4]} />
              <meshStandardMaterial color="#1e293b" metalness={0.82} roughness={0.28} />
            </mesh>
          );
        })}
        {/* Golden Pyramidion Capstone */}
        <mesh position={[0, 41.5, 0]} rotation={[0, Math.PI / 4, 0]}>
          <coneGeometry args={[5.5, 7.0, 4]} />
          <meshPhysicalMaterial color="#f59e0b" metalness={0.88} roughness={0.15} clearcoat={0.8} />
        </mesh>
        {/* Limestone Temple Portal with Fluted Columns */}
        <mesh position={[0, 5.2, 26.5]} castShadow receiveShadow>
          <boxGeometry args={[15, 10.4, 8]} />
          <meshStandardMaterial map={limestoneTex} normalMap={limestoneNormal} bumpMap={limestoneTex} bumpScale={0.18} roughness={0.64} />
        </mesh>
        {[-5.5, -2.5, 2.5, 5.5].map((cx, i) => (
          <mesh key={i} position={[cx, 5.0, 31.2]} castShadow>
            <cylinderGeometry args={[0.55, 0.72, 10, 12]} />
            <meshStandardMaterial map={limestoneTex} normalMap={limestoneNormal} bumpMap={limestoneTex} bumpScale={0.14} roughness={0.58} />
          </mesh>
        ))}
        <mesh position={[0, 4.0, 30.6]}>
          <boxGeometry args={[4.4, 7.2, 0.6]} />
          <meshStandardMaterial color="#0f172a" emissive="#fbbf24" emissiveIntensity={0.75} />
        </mesh>
        {/* Twin Flanking Limestone Obelisks */}
        {[-10.5, 10.5].map((ox) => (
          <group key={ox} position={[ox, 0, 34.5]}>
            <mesh position={[0, 0.7, 0]} castShadow receiveShadow>
              <boxGeometry args={[3.2, 1.4, 3.2]} />
              <meshStandardMaterial map={limestoneTex} normalMap={limestoneNormal} bumpMap={limestoneTex} bumpScale={0.16} roughness={0.68} />
            </mesh>
            <mesh position={[0, 8.1, 0]} rotation={[0, Math.PI / 4, 0]} castShadow>
              <cylinderGeometry args={[0.68, 1.18, 13.5, 4]} />
              <meshStandardMaterial map={limestoneTex} normalMap={limestoneNormal} bumpMap={limestoneTex} bumpScale={0.16} roughness={0.6} />
            </mesh>
            <mesh position={[0, 15.75, 0]} rotation={[0, Math.PI / 4, 0]}>
              <coneGeometry args={[0.68, 1.8, 4]} />
              <meshPhysicalMaterial color="#f59e0b" metalness={0.88} roughness={0.18} />
            </mesh>
          </group>
        ))}
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

      {/* 3. PARIS EIFFEL TOWER (SCULPTED CURVED STEEL PIERS + OBSERVATION DECKS) */}
      <group position={[95, eiffelY, 35]}>
        <mesh position={[0, 0.8, 0]} receiveShadow>
          <boxGeometry args={[31, 1.6, 31]} />
          <meshStandardMaterial map={limestoneTex} normalMap={limestoneNormal} bumpMap={limestoneTex} bumpScale={0.16} roughness={0.64} />
        </mesh>
        {eiffelPiers.map((geo, idx) => (
          <mesh key={idx} geometry={geo} castShadow>
            <meshStandardMaterial color="#92400e" metalness={0.72} roughness={0.28} />
          </mesh>
        ))}
        {/* 1st Observation Deck */}
        <mesh position={[0, 18, 0]} castShadow>
          <boxGeometry args={[17, 1.6, 17]} />
          <meshStandardMaterial color="#b45309" metalness={0.68} roughness={0.3} />
        </mesh>
        {/* 2nd Observation Deck */}
        <mesh position={[0, 34, 0]} castShadow>
          <boxGeometry args={[9.5, 1.4, 9.5]} />
          <meshStandardMaterial color="#d97706" metalness={0.72} roughness={0.26} />
        </mesh>
        {/* Summit Deck + Golden Spire */}
        <mesh position={[0, 52, 0]} castShadow>
          <boxGeometry args={[4.2, 2.2, 4.2]} />
          <meshStandardMaterial color="#fbbf24" metalness={0.85} roughness={0.2} />
        </mesh>
        <mesh position={[0, 63, 0]}>
          <cylinderGeometry args={[0.18, 0.9, 20, 12]} />
          <meshStandardMaterial color="#fef08a" emissive="#f59e0b" emissiveIntensity={0.6} metalness={0.85} />
        </mesh>
      </group>

      {/* 4. LADY LIBERTY (STAR-FORT GRANITE BASE + SCULPTED ROBE + TORCH) */}
      <group position={[-155, libertyY, -145]}>
        {/* Star-Fort Granite Pedestal */}
        <mesh position={[0, 2.5, 0]} rotation={[0, Math.PI / 4, 0]} castShadow receiveShadow>
          <cylinderGeometry args={[14, 16, 5, 8]} />
          <meshStandardMaterial map={limestoneTex} normalMap={limestoneNormal} bumpMap={limestoneTex} bumpScale={0.18} roughness={0.72} />
        </mesh>
        <mesh position={[0, 8.5, 0]} castShadow receiveShadow>
          <boxGeometry args={[11, 8, 11]} />
          <meshStandardMaterial map={limestoneTex} normalMap={limestoneNormal} bumpMap={limestoneTex} bumpScale={0.16} roughness={0.66} />
        </mesh>
        {/* Sculpted Verdigris Copper Statue */}
        <mesh position={[0, 12.5, 0]} geometry={libertyRobeGeo} castShadow>
          <meshStandardMaterial color="#2dd4bf" metalness={0.28} roughness={0.48} />
        </mesh>
        <mesh position={[0, 33.8, 0]} castShadow>
          <sphereGeometry args={[1.6, 16, 16]} />
          <meshStandardMaterial color="#2dd4bf" metalness={0.28} roughness={0.48} />
        </mesh>
        {/* 7-Ray Crown */}
        <mesh position={[0, 35.1, 0]} rotation={[0.15, 0, 0]}>
          <cylinderGeometry args={[2.3, 1.5, 0.9, 7]} />
          <meshStandardMaterial color="#5eead4" metalness={0.45} roughness={0.35} />
        </mesh>
        {/* Raised Torch Arm + Flame */}
        <mesh position={[2.2, 36.2, 0.8]} rotation={[0, 0, -0.25]} castShadow>
          <cylinderGeometry args={[0.45, 0.65, 9, 10]} />
          <meshStandardMaterial color="#2dd4bf" metalness={0.28} roughness={0.48} />
        </mesh>
        <mesh position={[3.3, 41.2, 0.8]}>
          <coneGeometry args={[1.1, 3.0, 12]} />
          <meshStandardMaterial color="#fef08a" emissive="#f59e0b" emissiveIntensity={2.0} />
        </mesh>
      </group>

      {/* 5. VENETIAN GRAND CANAL, RIALTO BRIDGE & ITALIAN PALAZZOS */}
      <group position={[135, 0, -95]}>
        {/* Sculpted Arched Stone Rialto Bridge */}
        <mesh geometry={rialtoArchGeo} position={[0, 0, 0]} castShadow receiveShadow>
          <meshStandardMaterial map={limestoneTex} normalMap={limestoneNormal} bumpMap={limestoneTex} bumpScale={0.18} roughness={0.62} />
        </mesh>
        {/* Stone Arch Ribs flanking the bridge soffit */}
        {[-3.85, 3.85].map((rx) => (
          <mesh key={rx} position={[rx, -1.3, 0]} rotation={[0, Math.PI / 2, Math.PI * 0.14]} castShadow>
            <torusGeometry args={[11.2, 0.36, 8, 24, Math.PI * 0.72]} />
            <meshStandardMaterial map={limestoneTex} normalMap={limestoneNormal} color="#d6cfc2" roughness={0.56} />
          </mesh>
        ))}
        {/* Bridge Balustrade Side Walls */}
        <mesh position={[-3.6, 6.2, 0]} rotation={[Math.PI / 2, 0, 0]}>
          <boxGeometry args={[0.6, 26, 1.4]} />
          <meshStandardMaterial map={limestoneTex} normalMap={limestoneNormal} bumpMap={limestoneTex} bumpScale={0.14} roughness={0.58} />
        </mesh>
        <mesh position={[3.6, 6.2, 0]} rotation={[Math.PI / 2, 0, 0]}>
          <boxGeometry args={[0.6, 26, 1.4]} />
          <meshStandardMaterial map={limestoneTex} normalMap={limestoneNormal} bumpMap={limestoneTex} bumpScale={0.14} roughness={0.58} />
        </mesh>
        {/* Bridge Arcade Columns & Cornice */}
        {[-8.5, -4.25, 0, 4.25, 8.5].map((cz) => {
          const archY = 8.4 - Math.pow(cz / 14, 2) * 3.2;
          return (
            <React.Fragment key={cz}>
              <mesh position={[-3.6, archY, cz]} castShadow>
                <cylinderGeometry args={[0.24, 0.3, 3.2, 8]} />
                <meshStandardMaterial map={limestoneTex} normalMap={limestoneNormal} roughness={0.54} />
              </mesh>
              <mesh position={[3.6, archY, cz]} castShadow>
                <cylinderGeometry args={[0.24, 0.3, 3.2, 8]} />
                <meshStandardMaterial map={limestoneTex} normalMap={limestoneNormal} roughness={0.54} />
              </mesh>
            </React.Fragment>
          );
        })}
        {/* Bridge Approach Steps (North & South Ends) */}
        {[-1, 1].map((dir) => (
          <group key={dir}>
            <mesh position={[0, 2.2, dir * 14.8]} receiveShadow>
              <boxGeometry args={[8.2, 1.4, 2.0]} />
              <meshStandardMaterial map={limestoneTex} normalMap={limestoneNormal} roughness={0.66} />
            </mesh>
            <mesh position={[0, 1.0, dir * 16.5]} receiveShadow>
              <boxGeometry args={[8.6, 1.2, 2.0]} />
              <meshStandardMaterial map={limestoneTex} normalMap={limestoneNormal} roughness={0.66} />
            </mesh>
          </group>
        ))}
        {/* Warm Brass Lantern Posts along the Bridge */}
        {[-8, 0, 8].map((lz) =>
          [-3.6, 3.6].map((lx) => {
            const postY = 8.1 - Math.pow(lz / 14, 2) * 3.0;
            return (
              <group key={`${lx}-${lz}`} position={[lx, postY, lz]}>
                <mesh position={[0, 1.4, 0]}>
                  <cylinderGeometry args={[0.08, 0.12, 2.8, 8]} />
                  <meshStandardMaterial color="#92400e" metalness={0.82} roughness={0.28} />
                </mesh>
                <mesh position={[0, 2.95, 0]}>
                  <sphereGeometry args={[0.32, 10, 10]} />
                  <meshStandardMaterial color="#fef9c3" emissive="#fbbf24" emissiveIntensity={1.8} />
                </mesh>
              </group>
            );
          })
        )}
        {/* Quay Seawall Edges along the Canal */}
        {[-18, 18].map((qz) => (
          <group key={qz} position={[0, 0.4, qz]}>
            <mesh receiveShadow castShadow>
              <boxGeometry args={[112, 3.4, 2.4]} />
              <meshStandardMaterial map={limestoneTex} normalMap={limestoneNormal} bumpMap={limestoneTex} bumpScale={0.18} roughness={0.72} />
            </mesh>
            <mesh position={[0, 1.85, 0]} receiveShadow>
              <boxGeometry args={[112, 0.35, 2.8]} />
              <meshStandardMaterial color="#e7dfd3" roughness={0.55} />
            </mesh>
            {[-40, -24, -10, 10, 24, 40].map((bx) => (
              <mesh key={bx} position={[bx, 2.35, qz > 0 ? -0.9 : 0.9]}>
                <cylinderGeometry args={[0.22, 0.28, 0.85, 8]} />
                <meshStandardMaterial color="#334155" metalness={0.75} roughness={0.35} />
              </mesh>
            ))}
          </group>
        ))}

        {/* Italian Renaissance Palazzos with Terracotta Roofs */}
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
                map={palazzoTex}
                normalMap={palazzoNormal}
                bumpMap={palazzoTex}
                bumpScale={0.16}
                color={p.tint}
                roughness={0.68}
              />
            </mesh>
            {/* Terracotta Pitched Roof */}
            <mesh position={[0, p.h + 2.6, 0]} rotation={[0, Math.PI / 4, 0]} castShadow>
              <coneGeometry args={[Math.max(p.w, p.d) * 0.78, 5.2, 4]} />
              <meshStandardMaterial color="#c2410c" roughness={0.78} />
            </mesh>
          </group>
        ))}

        {/* St. Mark's Campanile Bell Tower */}
        <group position={[-28, 0, 26]}>
          <mesh position={[0, 17, 0]} castShadow receiveShadow>
            <boxGeometry args={[5.5, 34, 5.5]} />
            <meshStandardMaterial color="#b45309" roughness={0.72} />
          </mesh>
          <mesh position={[0, 36.5, 0]} castShadow>
            <boxGeometry args={[5.8, 5, 5.8]} />
            <meshStandardMaterial map={limestoneTex} normalMap={limestoneNormal} roughness={0.6} />
          </mesh>
          <mesh position={[0, 44, 0]} rotation={[0, Math.PI / 4, 0]} castShadow>
            <coneGeometry args={[4.4, 10, 4]} />
            <meshStandardMaterial color="#0f766e" metalness={0.35} roughness={0.4} />
          </mesh>
        </group>
      </group>

      {/* 6. STRATOSPHERE SKY-JUMP TOWER */}
      <group position={[10, stratY, -195]}>
        <mesh position={[0, 36, 0]} castShadow receiveShadow>
          <cylinderGeometry args={[2.2, 4.8, 72, 18]} />
          <meshStandardMaterial color="#e2e8f0" roughness={0.45} metalness={0.25} />
        </mesh>
        <mesh position={[0, 68, 0]} castShadow>
          <cylinderGeometry args={[9.5, 5.5, 8.5, 24]} />
          <meshPhysicalMaterial color="#1e293b" metalness={0.75} roughness={0.14} clearcoat={1} />
        </mesh>
        <mesh position={[0, 82, 0]}>
          <cylinderGeometry args={[0.25, 1.2, 22, 12]} />
          <meshStandardMaterial color="#cbd5e1" metalness={0.85} roughness={0.2} />
        </mesh>
        <mesh position={[0, 1.2, 0]} rotation={[-Math.PI / 2, 0, 0]}>
          <ringGeometry args={[5.4, 7.6, 32]} />
          <meshStandardMaterial color="#22d3ee" emissive="#06b6d4" emissiveIntensity={1.6} />
        </mesh>
      </group>
    </group>
  );
}
