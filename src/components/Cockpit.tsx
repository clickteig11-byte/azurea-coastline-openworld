import type { VehicleMode } from '../game/worldMath';

export function Cockpit({ mode, style }: { mode: VehicleMode; style: number }) {
  if (mode === 'FOOT') return null;
  const flight = mode === 'PLANE';
  const car = mode === 'CAR';
  const color = flight ? '#3c4b4c' : car ? ['#285263', '#294c58', '#745747', '#3c5865', '#252e35'][style % 5] : '#d5c5a5';
  return <group>
    <mesh position={[0, -0.39, -1.21]} rotation={[0.18, 0, 0]}>
      <boxGeometry args={[1.53, 0.22, 1.89, 1, 1, 1]} />
      <meshPhysicalMaterial color={color} metalness={0.33} clearcoat={0.43} roughness={flight ? 0.47 : 0.4} />
    </mesh>
    <mesh position={[0, -0.309, -0.52]} rotation={[0.24, 0, 0]}>
      <boxGeometry args={[1.47, 0.16, 0.48]} />
      <meshStandardMaterial color="#293435" roughness={0.64} />
    </mesh>
    {Array.from({ length: flight ? 5 : 3 }, (_, i) => (
      <mesh key={i} position={[(i - (flight ? 2 : 1)) * 0.104, -0.225, -0.629]} rotation={[-Math.PI / 2 + 0.14, 0, 0]}>
        <circleGeometry args={[0.037, 20]} />
        <meshStandardMaterial color="#1b2b32" emissive={i % 2 === 0 ? '#4badb6' : '#dcd393'} emissiveIntensity={0.31} roughness={0.43} />
      </mesh>
    ))}
    {flight && [-1, 1].map((side) => (
      <mesh key={side} position={[side * 0.775, 0.031, -0.61]} rotation={[0, 0, side * 0.25]}>
        <boxGeometry args={[0.041, 0.89, 0.033]} />
        <meshStandardMaterial color="#2b3839" roughness={0.68} />
      </mesh>
    ))}
  </group>;
}
