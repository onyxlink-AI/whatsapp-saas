import { Html } from '@react-three/drei';
import type { CSSProperties } from 'react';
import type { Agent } from '../types';
import { ROOM_D, ROOM_W, WALL_H, WALL_T } from './layout';

type Props = {
  agent: Agent;
  center: [number, number, number];
  width?: number;
  depth?: number;
};

function Computer({ color, x = 0 }: { color: string; x?: number }) {
  return (
    <group position={[x, 0.89, -0.12]}>
      <mesh position={[0, 0.18, 0]} castShadow>
        <boxGeometry args={[0.78, 0.5, 0.08]} />
        <meshStandardMaterial color="#253038" metalness={0.58} roughness={0.28} />
      </mesh>
      <mesh position={[0, 0.18, 0.046]}>
        <planeGeometry args={[0.68, 0.4]} />
        <meshStandardMaterial color="#d8edf0" emissive="#5e9fb1" emissiveIntensity={0.48} />
      </mesh>
      <mesh position={[-0.22, 0.28, 0.052]}>
        <planeGeometry args={[0.18, 0.025]} />
        <meshBasicMaterial color={color} />
      </mesh>
      <mesh position={[-0.19, 0.18, 0.052]}>
        <planeGeometry args={[0.24, 0.035]} />
        <meshBasicMaterial color="#355260" />
      </mesh>
      <mesh position={[0.19, 0.15, 0.052]}>
        <planeGeometry args={[0.18, 0.17]} />
        <meshBasicMaterial color={color} transparent opacity={0.55} />
      </mesh>
      <mesh position={[0, -0.12, 0]} castShadow>
        <boxGeometry args={[0.07, 0.16, 0.07]} />
        <meshStandardMaterial color="#607078" metalness={0.66} />
      </mesh>
      <mesh position={[0, -0.2, 0.02]} castShadow>
        <boxGeometry args={[0.3, 0.035, 0.16]} />
        <meshStandardMaterial color="#607078" metalness={0.66} />
      </mesh>
    </group>
  );
}

function DeskSetup({ color, executive }: { color: string; executive: boolean }) {
  const deskWidth = executive ? 3 : 2.35;

  return (
    <group>
      <mesh position={[0, 0.69, 0]} castShadow receiveShadow>
        <boxGeometry args={[deskWidth, 0.12, 0.92]} />
        <meshStandardMaterial color="#f4f5f2" metalness={0.08} roughness={0.5} />
      </mesh>
      {[-deskWidth / 2 + 0.15, deskWidth / 2 - 0.15].map((x) => (
        <mesh key={x} position={[x, 0.35, 0]} castShadow>
          <boxGeometry args={[0.1, 0.7, 0.72]} />
          <meshStandardMaterial color="#77858b" metalness={0.58} roughness={0.32} />
        </mesh>
      ))}
      <mesh position={[-deskWidth / 2 + 0.35, 0.37, 0.02]} castShadow>
        <boxGeometry args={[0.55, 0.6, 0.68]} />
        <meshStandardMaterial color="#e2e6e3" metalness={0.12} roughness={0.52} />
      </mesh>
      {[0.2, 0.38, 0.56].map((y) => (
        <mesh key={y} position={[-deskWidth / 2 + 0.35, y, 0.368]}>
          <boxGeometry args={[0.4, 0.025, 0.012]} />
          <meshBasicMaterial color="#9da9aa" />
        </mesh>
      ))}

      {executive ? (
        <>
          <Computer color={color} x={-0.48} />
          <Computer color={color} x={0.48} />
        </>
      ) : (
        <Computer color={color} />
      )}

      <mesh position={[0, 0.77, 0.31]} rotation={[0.02, 0, 0]} castShadow>
        <boxGeometry args={[0.72, 0.035, 0.25]} />
        <meshStandardMaterial color="#cdd5d4" metalness={0.38} roughness={0.34} />
      </mesh>
      <mesh position={[0.58, 0.77, 0.31]} castShadow>
        <boxGeometry args={[0.13, 0.035, 0.19]} />
        <meshStandardMaterial color="#526169" metalness={0.5} roughness={0.32} />
      </mesh>

      <group position={[0, 0, 1.05]}>
        <mesh position={[0, 0.62, 0]} castShadow>
          <boxGeometry args={[0.72, 0.62, 0.15]} />
          <meshStandardMaterial color="#344148" metalness={0.26} roughness={0.48} />
        </mesh>
        <mesh position={[0, 0.62, 0.081]}>
          <boxGeometry args={[0.5, 0.045, 0.018]} />
          <meshStandardMaterial color="#86a99e" emissive="#557b70" emissiveIntensity={0.42} />
        </mesh>
        <mesh position={[0, 0.35, -0.06]} castShadow>
          <boxGeometry args={[0.65, 0.11, 0.58]} />
          <meshStandardMaterial color="#29353b" metalness={0.28} roughness={0.48} />
        </mesh>
        <mesh position={[0, 0.09, 0]} castShadow>
          <cylinderGeometry args={[0.07, 0.07, 0.48, 12]} />
          <meshStandardMaterial color="#08070a" metalness={0.8} />
        </mesh>
        <mesh position={[0, 0.03, 0]} rotation={[0, 0, Math.PI / 2]}>
          <cylinderGeometry args={[0.035, 0.035, 0.72, 8]} />
          <meshStandardMaterial color="#08070a" metalness={0.8} />
        </mesh>
      </group>
    </group>
  );
}

function IndoorPlant({ position }: { position: [number, number, number] }) {
  return (
    <group position={position}>
      <mesh position={[0, 0.28, 0]} castShadow>
        <cylinderGeometry args={[0.32, 0.25, 0.55, 12]} />
        <meshStandardMaterial color="#d5d0c7" roughness={0.72} />
      </mesh>
      <mesh position={[0, 0.88, 0]} castShadow>
        <cylinderGeometry args={[0.035, 0.055, 0.85, 7]} />
        <meshStandardMaterial color="#55705b" roughness={0.85} />
      </mesh>
      {[
        [-0.22, 0.75, 0.02, -0.5],
        [0.23, 0.88, -0.03, 0.48],
        [-0.18, 1.05, 0.03, -0.34],
        [0.19, 1.18, 0, 0.38],
        [0, 1.36, 0.02, 0],
      ].map(([x, y, z, rotation], index) => (
        <mesh key={index} position={[x, y, z]} rotation={[0, 0, rotation]} scale={[1.45, 0.55, 0.8]} castShadow>
          <sphereGeometry args={[0.24, 8, 6]} />
          <meshStandardMaterial color={index % 2 ? '#5f8a68' : '#47765b'} roughness={0.82} />
        </mesh>
      ))}
    </group>
  );
}

function WoodFloor({ width, depth }: { width: number; depth: number }) {
  const plankCount = Math.ceil(depth / 0.48);
  const plankDepth = depth / plankCount;
  const wood = ['#c9a877', '#d7b98a', '#bea072', '#dfc398'];

  return (
    <group position={[0, -0.025, 0]}>
      {Array.from({ length: plankCount }, (_, i) => {
        const z = -depth / 2 + plankDepth * (i + 0.5);
        return (
          <mesh key={i} position={[0, 0, z]} receiveShadow>
            <boxGeometry args={[width - 0.12, 0.07, plankDepth - 0.025]} />
            <meshStandardMaterial color={wood[i % wood.length]} roughness={0.72} />
          </mesh>
        );
      })}
      {[-width / 3, width / 3].map((x) => (
        <mesh key={x} position={[x, 0.039, 0]}>
          <boxGeometry args={[0.018, 0.006, depth - 0.12]} />
          <meshBasicMaterial color="#9a7b58" transparent opacity={0.32} />
        </mesh>
      ))}
    </group>
  );
}

function OfficeWindow({ position, color }: { position: [number, number, number]; color: string }) {
  return (
    <group position={position}>
      <mesh>
        <boxGeometry args={[1.85, 1.18, 0.09]} />
        <meshStandardMaterial color="#aeb9bc" metalness={0.46} roughness={0.34} />
      </mesh>
      <mesh position={[0, 0, 0.051]}>
        <planeGeometry args={[1.62, 0.95]} />
        <meshStandardMaterial color="#dcecf0" emissive="#b9d8df" emissiveIntensity={0.38} metalness={0.12} roughness={0.22} />
      </mesh>
      <mesh position={[0, 0, 0.062]}>
        <boxGeometry args={[0.045, 0.98, 0.025]} />
        <meshStandardMaterial color="#f5f7f5" metalness={0.28} roughness={0.3} />
      </mesh>
      <mesh position={[0, 0, 0.063]}>
        <boxGeometry args={[1.65, 0.045, 0.025]} />
        <meshStandardMaterial color="#f5f7f5" metalness={0.28} roughness={0.3} />
      </mesh>
      <mesh position={[-0.55, -0.31, 0.07]}>
        <planeGeometry args={[0.28, 0.12]} />
        <meshBasicMaterial color={color} transparent opacity={0.68} />
      </mesh>
      <mesh position={[0.48, 0.27, 0.07]}>
        <planeGeometry args={[0.38, 0.06]} />
        <meshBasicMaterial color="#6c8791" transparent opacity={0.55} />
      </mesh>
    </group>
  );
}

function NeutralWallArt({ depth }: { depth: number }) {
  return (
    <group position={[0, 1.95, -depth / 2 + 0.16]}>
      <mesh>
        <boxGeometry args={[2.3, 0.72, 0.08]} />
        <meshStandardMaterial color="#f8f8f5" roughness={0.62} />
      </mesh>
      <mesh position={[-0.55, 0, 0.05]}>
        <circleGeometry args={[0.22, 20]} />
        <meshStandardMaterial color="#6f9184" roughness={0.72} />
      </mesh>
      <mesh position={[0.08, 0, 0.051]} rotation={[0, 0, 0.4]}>
        <planeGeometry args={[0.5, 0.24]} />
        <meshStandardMaterial color="#d4b078" roughness={0.72} />
      </mesh>
      <mesh position={[0.63, 0, 0.052]} rotation={[0, 0, -0.25]}>
        <planeGeometry args={[0.36, 0.38]} />
        <meshStandardMaterial color="#8095a0" roughness={0.72} />
      </mesh>
    </group>
  );
}

export default function OfficeRoom({ agent, center, width = ROOM_W, depth = ROOM_D }: Props) {
  const executive = agent.id === 'coordinator';
  const deskZ = -depth / 2 + 1.25;

  return (
    <group position={center}>
      <WoodFloor width={width} depth={depth} />
      <mesh position={[0, 0.016, 1.05]} rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[executive ? 3.8 : 3.25, executive ? 2.1 : 1.85]} />
        <meshStandardMaterial color="#d8dddc" transparent opacity={0.92} roughness={0.82} />
      </mesh>

      <pointLight position={[0, 2.35, -depth / 2 + 1.25]} color="#fff6df" intensity={1.55} distance={6.4} decay={2} />
      <pointLight position={[0, 2.7, 1]} color="#d9edf1" intensity={0.82} distance={5.8} decay={2} />

      <mesh position={[0, WALL_H / 2, -depth / 2]} castShadow receiveShadow>
        <boxGeometry args={[width, WALL_H, WALL_T]} />
        <meshStandardMaterial color="#e8ece9" metalness={0.04} roughness={0.76} />
      </mesh>
      {[-1, 1].map((side) => (
        <group key={side} position={[side * width / 2, 1.22, 0]}>
          <mesh>
            <boxGeometry args={[WALL_T, 2.44, depth]} />
            <meshStandardMaterial
              color="#dbe7e7"
              transparent
              opacity={0.28}
              roughness={0.18}
              metalness={0.05}
              depthWrite={false}
            />
          </mesh>
          {[-depth / 2, 0, depth / 2].map((z) => (
            <mesh key={z} position={[0, 0, z]} castShadow>
              <boxGeometry args={[0.12, 2.55, 0.11]} />
              <meshStandardMaterial color="#a8b4b6" metalness={0.45} roughness={0.35} />
            </mesh>
          ))}
          <mesh position={[0, 1.22, 0]}>
            <boxGeometry args={[0.12, 0.11, depth]} />
            <meshStandardMaterial color="#a8b4b6" metalness={0.45} roughness={0.35} />
          </mesh>
        </group>
      ))}

      <mesh position={[0, 2.84, -0.35]}>
        <boxGeometry args={[1.9, 0.08, 0.9]} />
        <meshStandardMaterial color="#d6dcda" metalness={0.32} roughness={0.42} />
      </mesh>
      <mesh position={[0, 2.79, -0.35]}>
        <boxGeometry args={[1.7, 0.04, 0.72]} />
        <meshStandardMaterial color="#fffdf5" emissive="#fff0c7" emissiveIntensity={1.15} />
      </mesh>

      <mesh position={[0, 0.1, -depth / 2 + 0.12]}>
        <boxGeometry args={[width - 0.25, 0.11, 0.08]} />
        <meshStandardMaterial color="#a7b6b4" roughness={0.48} />
      </mesh>

      <group position={[0, 0, deskZ]}>
        <DeskSetup color={agent.color} executive={executive} />
      </group>

      <group position={[-width / 2 + 0.55, 1.72, -depth / 2 + 0.16]}>
        <mesh castShadow>
          <boxGeometry args={[0.85, 0.72, 0.09]} />
          <meshStandardMaterial color="#f5f6f3" metalness={0.08} roughness={0.62} />
        </mesh>
        <mesh position={[0, 0, 0.052]}>
          <planeGeometry args={[0.69, 0.55]} />
          <meshStandardMaterial color="#d6e4df" emissive="#9ab9ae" emissiveIntensity={0.25} />
        </mesh>
        <mesh position={[0, 0.1, 0.058]}>
          <planeGeometry args={[0.42, 0.045]} />
          <meshBasicMaterial color="#4d6d62" />
        </mesh>
        <mesh position={[0, -0.07, 0.058]}>
          <planeGeometry args={[0.55, 0.025]} />
          <meshBasicMaterial color="#7c8b8c" />
        </mesh>
      </group>

      <OfficeWindow position={[width / 2 - 2.1, 1.82, -depth / 2 + 0.16]} color={agent.color} />
      {executive && <NeutralWallArt depth={depth} />}

      <group position={[width / 2 - 0.52, 0, -depth / 2 + 0.48]}>
        <mesh position={[0, 0.72, 0]} castShadow>
          <boxGeometry args={[0.75, 1.44, 0.55]} />
          <meshStandardMaterial color="#e1e5e2" metalness={0.14} roughness={0.55} />
        </mesh>
        {[0.32, 0.75, 1.18].map((y) => (
          <mesh key={y} position={[0, y, 0.285]}>
            <boxGeometry args={[0.62, 0.025, 0.02]} />
            <meshBasicMaterial color="#9ba7a7" />
          </mesh>
        ))}
      </group>
      <IndoorPlant position={[width / 2 - 0.7, 0, 0.8]} />

      <Html position={[0, WALL_H + 0.65, 0]} center zIndexRange={[12, 8]}>
        <div className="office-sign" style={{ '--agent-color': agent.color } as CSSProperties}>
          <span className="office-sign__dot" />
          {agent.department}
        </div>
      </Html>
    </group>
  );
}
