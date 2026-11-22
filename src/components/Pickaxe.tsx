export function Pickaxe() {
  return <group rotation={[0, 0, -0.12]}>
    <mesh position={[0, 0.045, 0]} castShadow>
      <cylinderGeometry args={[0.026, 0.031, 0.87, 9]} />
      <meshStandardMaterial color="#7a5037" roughness={0.78} />
    </mesh>
    <mesh position={[0, -0.19, 0]}>
      <cylinderGeometry args={[0.034, 0.034, 0.27, 9]} />
      <meshStandardMaterial color="#262d2d" roughness={0.89} />
    </mesh>
    <mesh position={[0, 0.42, 0]}>
      <boxGeometry args={[0.22, 0.071, 0.094]} />
      <meshStandardMaterial color="#526064" roughness={0.32} metalness={0.78} />
    </mesh>
    <mesh position={[-0.155, 0.385, 0]} rotation={[0, 0, 1.19]}>
      <coneGeometry args={[0.058, 0.24, 4]} />
      <meshStandardMaterial color="#879098" roughness={0.37} metalness={0.86} />
    </mesh>
    <mesh position={[0.166, 0.405, 0]} rotation={[0, 0, -1.61]}>
      <coneGeometry args={[0.073, 0.25, 4]} />
      <meshStandardMaterial color="#748087" roughness={0.37} metalness={0.83} />
    </mesh>
  </group>;
}
