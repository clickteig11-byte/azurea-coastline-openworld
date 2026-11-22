import { useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { simState } from '../game/store';
import { getTerrainHeight } from '../game/worldMath';

export const lobbyStage = { x: 183, y: 13.05, z: 173, yaw: 0.73 };
const grade = getTerrainHeight(lobbyStage.x, lobbyStage.z);

export function LobbyStage() {
  const stage = useRef<THREE.Group>(null);
  useFrame(() => { if (stage.current) stage.current.visible = simState.startMenuOpen; });
  return (
    <group ref={stage} position={[lobbyStage.x, lobbyStage.y, lobbyStage.z]} rotation={[0, lobbyStage.yaw, 0]} visible={false}>
      <mesh position={[0, -(lobbyStage.y - grade + 1) / 2, 0]} castShadow receiveShadow>
        <boxGeometry args={[18.7, lobbyStage.y - grade + 1, 13.4]} />
        <meshStandardMaterial color="#c2b6a0" roughness={0.82} />
      </mesh>
      <mesh position={[0, -0.29, 0]} castShadow receiveShadow>
        <boxGeometry args={[19.1, 0.54, 13.75]} />
        <meshStandardMaterial color="#d0c4ac" roughness={0.71} />
      </mesh>
      {Array.from({ length: 12 }, (_, i) => (
        <mesh key={i} position={[(i - 5.5) * 1.56, -0.016, 0]} receiveShadow>
          <boxGeometry args={[1.547, 0.033, 13.54]} />
          <meshStandardMaterial color={i % 3 === 0 ? '#d4c7ae' : '#c6b9a4'} roughness={0.86} />
        </mesh>
      ))}
      <mesh position={[0, 0.026, 0]} receiveShadow castShadow>
        <cylinderGeometry args={[1.78, 1.83, 0.075, 88]} />
        <meshStandardMaterial color="#e4d8bd" roughness={0.61} />
      </mesh>
      <mesh rotation={[Math.PI / 2, 0, 0]} position={[0, 0.066, 0]}>
        <torusGeometry args={[1.59, 0.016, 6, 88]} />
        <meshStandardMaterial color="#959481" roughness={0.48} metalness={0.36} />
      </mesh>
      <mesh position={[0, 0.93, -6.3]} castShadow>
        <boxGeometry args={[18.75, 0.12, 0.18]} /><meshStandardMaterial color="#6c6c54" metalness={0.58} roughness={0.41} />
      </mesh>
      {Array.from({ length: 8 }, (_, i) => (
        <group key={i} position={[(i - 3.5) * 2.48, 0, -6.3]}>
          <mesh position={[0, 0.47, 0]} castShadow><boxGeometry args={[0.1, 0.94, 0.16]} /><meshStandardMaterial color="#6c6c54" metalness={0.42} roughness={0.48} /></mesh>
          <mesh position={[1.2, 0.45, 0]}><boxGeometry args={[2.39, 0.78, 0.028]} /><meshPhysicalMaterial color="#9dc0b9" transparent opacity={0.18} roughness={0.2} metalness={0.18} depthWrite={false} /></mesh>
        </group>
      ))}
      {[-7.2, 7.2].map((x) => (
        <group key={x} position={[x, 0, -4.8]}>
          <mesh position={[0, 0.36, 0]} castShadow><boxGeometry args={[2.72, 0.72, 1.12]} /><meshStandardMaterial color="#b9ad93" roughness={0.82} /></mesh>
          {Array.from({ length: 9 }, (_, i) => (
            <mesh key={i} position={[(i - 4) * 0.28, 0.78 + i % 3 * 0.14, Math.sin(i * 3.2) * 0.22]} rotation={[0, i * 1.4, 0.15]} castShadow>
              <icosahedronGeometry args={[0.32 + i % 3 * 0.05, 1]} />
              <meshStandardMaterial color={i % 2 === 0 ? '#3d6655' : '#68805b'} roughness={0.93} />
            </mesh>
          ))}
        </group>
      ))}
      <group position={[-6.4, 0, -3.1]}>
        {[-1.39, 1.39].map((x) => (
          <mesh key={x} position={[x, 1.63, -1.3]} castShadow receiveShadow><boxGeometry args={[0.39, 3.25, 0.39]} />
            <meshStandardMaterial color="#d1c0a2" roughness={0.91} /></mesh>
        ))}
        {Array.from({ length: 7 }, (_, i) => (
          <mesh key={i} position={[(i - 3) * 0.52, 3.22, -0.33]} castShadow>
            <boxGeometry args={[0.21, 0.18, 3]} /><meshStandardMaterial color="#8b644b" roughness={0.73} />
          </mesh>
        ))}
        <mesh position={[0, 0.27, -0.64]} castShadow><boxGeometry args={[2.6, 0.46, 0.79]} />
          <meshStandardMaterial color="#8e6950" roughness={0.71} /></mesh>
        <mesh position={[0, 0.54, -0.64]} castShadow><boxGeometry args={[2.48, 0.14, 0.72]} />
          <meshStandardMaterial color="#ddd4b8" roughness={0.86} /></mesh>
        {[-0.89, 0.67].map((x, index) => (
          <mesh key={x} position={[x, 0.77, -0.92]} rotation={[-0.16, 0, index ? 0.14 : -0.21]} castShadow>
            <boxGeometry args={[0.44, 0.44, 0.15]} /><meshStandardMaterial color={index ? '#325d65' : '#ccc49f'} roughness={0.91} />
          </mesh>
        ))}
      </group>
      <pointLight position={[2.6, 3.8, 2.6]} color="#ffe5b9" intensity={27} distance={13} decay={2} />
      <pointLight position={[-1.8, 2.5, -3.9]} color="#e9eeff" intensity={21} distance={13} decay={2} />
    </group>
  );
}
