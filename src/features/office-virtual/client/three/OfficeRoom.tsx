import { Html } from '@react-three/drei';
import { useThree } from '@react-three/fiber';
import type { CSSProperties } from 'react';
import type { OfficeSceneAgent } from '../types';
import { ROOM_D, ROOM_W, WALL_H, WALL_T } from './layout';
import { officeSignContent } from './officeSign';
import { resolveShowcaseScreenKind, type ShowcaseScreenKind } from './showcaseScreen';

type Props = {
  agent: OfficeSceneAgent;
  center: [number, number, number];
  /** False for an inactive/unavailable seat — suppresses the visible floating sign entirely (no name, no department, not even a generic placeholder). */
  occupied: boolean;
  presentation?: boolean;
  width?: number;
  depth?: number;
};

function Computer({ color, x = 0, presentation = false }: { color: string; x?: number; presentation?: boolean }) {
  return (
    <group position={[x, 0.89, -0.12]}>
      <mesh position={[0, 0.18, 0]} castShadow>
        <boxGeometry args={[0.78, 0.5, 0.08]} />
        <meshStandardMaterial color={presentation ? '#09070f' : '#253038'} metalness={0.68} roughness={0.28} />
      </mesh>
      <mesh position={[0, 0.18, 0.046]}>
        <planeGeometry args={[0.68, 0.4]} />
        <meshStandardMaterial
          color={presentation ? '#160825' : '#d8edf0'}
          emissive={presentation ? color : '#5e9fb1'}
          emissiveIntensity={presentation ? 1.65 : 0.48}
        />
      </mesh>
      <mesh position={[-0.22, 0.28, 0.052]}>
        <planeGeometry args={[0.18, 0.025]} />
        <meshBasicMaterial color={color} />
      </mesh>
      <mesh position={[-0.19, 0.18, 0.052]}>
        <planeGeometry args={[0.24, 0.035]} />
        <meshBasicMaterial color={presentation ? '#7c3aed' : '#355260'} />
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

function DeskSetup({ color, executive, presentation = false }: { color: string; executive: boolean; presentation?: boolean }) {
  const deskWidth = executive ? 3 : 2.35;

  return (
    <group>
      <mesh position={[0, 0.69, 0]} castShadow receiveShadow>
        <boxGeometry args={[deskWidth, 0.12, 0.92]} />
        <meshStandardMaterial color={presentation ? '#111019' : '#f4f5f2'} metalness={presentation ? 0.42 : 0.08} roughness={0.5} />
      </mesh>
      {[-deskWidth / 2 + 0.15, deskWidth / 2 - 0.15].map((x) => (
        <mesh key={x} position={[x, 0.35, 0]} castShadow>
          <boxGeometry args={[0.1, 0.7, 0.72]} />
          <meshStandardMaterial color={presentation ? '#252033' : '#77858b'} metalness={0.58} roughness={0.32} />
        </mesh>
      ))}
      <mesh position={[-deskWidth / 2 + 0.35, 0.37, 0.02]} castShadow>
        <boxGeometry args={[0.55, 0.6, 0.68]} />
        <meshStandardMaterial color={presentation ? '#17131f' : '#e2e6e3'} metalness={0.24} roughness={0.52} />
      </mesh>
      {[0.2, 0.38, 0.56].map((y) => (
        <mesh key={y} position={[-deskWidth / 2 + 0.35, y, 0.368]}>
          <boxGeometry args={[0.4, 0.025, 0.012]} />
          <meshBasicMaterial color="#9da9aa" />
        </mesh>
      ))}

      {executive ? (
        <>
          <Computer color={color} x={-0.48} presentation={presentation} />
          <Computer color={color} x={0.48} presentation={presentation} />
        </>
      ) : (
        <Computer color={color} presentation={presentation} />
      )}

      <mesh position={[0, 0.77, 0.31]} rotation={[0.02, 0, 0]} castShadow>
        <boxGeometry args={[0.72, 0.035, 0.25]} />
        <meshStandardMaterial color={presentation ? '#262032' : '#cdd5d4'} metalness={0.38} roughness={0.34} />
      </mesh>
      <mesh position={[0.58, 0.77, 0.31]} castShadow>
        <boxGeometry args={[0.13, 0.035, 0.19]} />
        <meshStandardMaterial color={presentation ? '#3b3150' : '#526169'} metalness={0.5} roughness={0.32} />
      </mesh>

      <group position={[0, 0, 1.05]}>
        <mesh position={[0, 0.62, 0]} castShadow>
          <boxGeometry args={[0.72, 0.62, 0.15]} />
          <meshStandardMaterial color={presentation ? '#0c0a11' : '#344148'} metalness={0.38} roughness={0.48} />
        </mesh>
        <mesh position={[0, 0.62, 0.081]}>
          <boxGeometry args={[0.5, 0.045, 0.018]} />
          <meshStandardMaterial color={presentation ? '#6d28d9' : '#86a99e'} emissive={presentation ? '#7c3aed' : '#557b70'} emissiveIntensity={presentation ? 1.2 : 0.42} />
        </mesh>
        <mesh position={[0, 0.35, -0.06]} castShadow>
          <boxGeometry args={[0.65, 0.11, 0.58]} />
          <meshStandardMaterial color={presentation ? '#09070d' : '#29353b'} metalness={0.4} roughness={0.48} />
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

function IndoorPlant({ position, presentation = false }: { position: [number, number, number]; presentation?: boolean }) {
  return (
    <group position={position}>
      <mesh position={[0, 0.28, 0]} castShadow>
        <cylinderGeometry args={[0.32, 0.25, 0.55, 12]} />
        <meshStandardMaterial color={presentation ? '#231333' : '#d5d0c7'} roughness={0.72} />
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

function WoodFloor({ width, depth, presentation = false }: { width: number; depth: number; presentation?: boolean }) {
  if (presentation) {
    return (
      <group position={[0, -0.025, 0]}>
        <mesh receiveShadow>
          <boxGeometry args={[width - 0.12, 0.09, depth - 0.12]} />
          <meshStandardMaterial color="#13101b" metalness={0.3} roughness={0.62} />
        </mesh>
        {[-depth / 4, 0, depth / 4].map((z) => (
          <mesh key={z} position={[0, 0.052, z]}>
            <boxGeometry args={[width - 0.28, 0.012, 0.018]} />
            <meshBasicMaterial color="#2e1b48" transparent opacity={0.55} />
          </mesh>
        ))}
      </group>
    );
  }
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

function ScreenBar({
  position,
  width,
  height,
  color,
  opacity = 1,
}: {
  position: [number, number, number];
  width: number;
  height: number;
  color: string;
  opacity?: number;
}) {
  return (
    <mesh position={position}>
      <planeGeometry args={[width, height]} />
      <meshBasicMaterial color={color} transparent={opacity < 1} opacity={opacity} />
    </mesh>
  );
}

function ShowcaseScreenVisual({ kind, color }: { kind: ShowcaseScreenKind; color: string }) {
  const z = 0.078;

  if (kind === 'analytics') {
    const heights = [0.18, 0.34, 0.27, 0.52, 0.43, 0.7, 0.62];
    return (
      <group>
        {heights.map((height, index) => (
          <ScreenBar key={index} position={[-1.18 + index * 0.28, -0.38 + height / 2, z]} width={0.16} height={height} color={index > 4 ? color : '#6d28d9'} opacity={0.92} />
        ))}
        {[0.29, 0.02, -0.25].map((y, index) => (
          <group key={y}>
            <ScreenBar position={[0.82, y, z]} width={0.86 - index * 0.12} height={0.08} color={index === 0 ? color : '#8b5cf6'} />
            <ScreenBar position={[1.25, y, z]} width={0.18} height={0.08} color="#2e2140" />
          </group>
        ))}
      </group>
    );
  }

  if (kind === 'social') {
    return (
      <group>
        {[-0.92, 0, 0.92].map((x, index) => (
          <group key={x} position={[x, 0, 0]}>
            <ScreenBar position={[0, 0.03, z]} width={0.66} height={0.82} color="#171023" />
            <ScreenBar position={[0, 0.21, z + 0.001]} width={0.52} height={0.33} color={index === 1 ? color : '#5b21b6'} opacity={0.9} />
            <mesh position={[-0.18, -0.16, z + 0.002]}>
              <circleGeometry args={[0.075, 18]} />
              <meshBasicMaterial color="#f472b6" />
            </mesh>
            <ScreenBar position={[0.1, -0.16, z + 0.002]} width={0.26} height={0.05} color="#a78bfa" />
            <ScreenBar position={[-0.04, -0.3, z + 0.002]} width={0.46} height={0.045} color="#4c3a60" />
          </group>
        ))}
      </group>
    );
  }

  if (kind === 'whatsapp') {
    return (
      <group>
        <mesh position={[-0.95, 0, z]}>
          <circleGeometry args={[0.38, 32]} />
          <meshBasicMaterial color="#22c55e" />
        </mesh>
        <mesh position={[-0.95, 0.02, z + 0.002]} rotation={[0, 0, -0.55]}>
          <torusGeometry args={[0.16, 0.045, 10, 24, 3.6]} />
          <meshBasicMaterial color="#ffffff" />
        </mesh>
        {[0.27, 0, -0.27].map((y, index) => (
          <group key={y}>
            <ScreenBar position={[0.4 + (index % 2) * 0.18, y, z]} width={index === 1 ? 1.05 : 0.78} height={0.17} color={index === 1 ? '#5b21b6' : '#282038'} />
            <ScreenBar position={[0.25 + (index % 2) * 0.18, y, z + 0.002]} width={index === 1 ? 0.54 : 0.38} height={0.045} color={index === 1 ? '#c4b5fd' : '#8b7aa2'} />
          </group>
        ))}
      </group>
    );
  }

  if (kind === 'voice') {
    const waveform = [0.12, 0.24, 0.42, 0.66, 0.38, 0.76, 0.52, 0.28, 0.62, 0.84, 0.48, 0.3, 0.58, 0.34, 0.16];
    return (
      <group>
        {waveform.map((height, index) => (
          <ScreenBar key={index} position={[-1.25 + index * 0.18, 0, z]} width={0.075} height={height} color={index > 4 && index < 11 ? color : '#7c3aed'} />
        ))}
        <mesh position={[-1.32, -0.39, z]}><circleGeometry args={[0.07, 16]} /><meshBasicMaterial color="#22c55e" /></mesh>
        <ScreenBar position={[-0.83, -0.39, z]} width={0.72} height={0.05} color="#4b3a62" />
        <mesh position={[1.28, -0.39, z]}><circleGeometry args={[0.07, 16]} /><meshBasicMaterial color="#ef4444" /></mesh>
      </group>
    );
  }

  if (kind === 'chatbot') {
    return (
      <group>
        <ScreenBar position={[-0.45, 0.3, z]} width={1.55} height={0.2} color="#2f2340" />
        <ScreenBar position={[-0.68, 0.3, z + 0.002]} width={0.8} height={0.05} color="#9d8ab8" />
        <ScreenBar position={[0.54, 0, z]} width={1.45} height={0.2} color={color} opacity={0.9} />
        <ScreenBar position={[0.31, 0, z + 0.002]} width={0.76} height={0.05} color="#f5f3ff" />
        <ScreenBar position={[-0.56, -0.3, z]} width={1.32} height={0.2} color="#2f2340" />
        {[-0.82, -0.58, -0.34].map((x) => (
          <mesh key={x} position={[x, -0.3, z + 0.002]}><circleGeometry args={[0.04, 12]} /><meshBasicMaterial color="#a78bfa" /></mesh>
        ))}
      </group>
    );
  }

  if (kind === 'proposals') {
    return (
      <group>
        {[0.34, 0.11, -0.12, -0.35].map((y, index) => (
          <group key={y}>
            <ScreenBar position={[0, y, z]} width={2.55} height={0.17} color={index === 0 ? '#251638' : '#181020'} />
            <mesh position={[-1.05, y, z + 0.002]}><circleGeometry args={[0.045, 12]} /><meshBasicMaterial color={index < 2 ? '#22c55e' : color} /></mesh>
            <ScreenBar position={[-0.45, y, z + 0.002]} width={0.78} height={0.045} color="#a995bf" />
            <ScreenBar position={[0.64, y, z + 0.002]} width={0.42} height={0.07} color={index < 2 ? '#14532d' : '#4c1d95'} />
          </group>
        ))}
      </group>
    );
  }

  if (kind === 'finance') {
    const heights = [0.18, 0.28, 0.43, 0.37, 0.58, 0.72];
    return (
      <group>
        <mesh position={[-1.04, 0.24, z]}><ringGeometry args={[0.2, 0.32, 28]} /><meshBasicMaterial color="#22c55e" /></mesh>
        <ScreenBar position={[-0.95, -0.27, z]} width={0.86} height={0.08} color="#166534" />
        {heights.map((height, index) => (
          <ScreenBar key={index} position={[0.05 + index * 0.22, -0.4 + height / 2, z]} width={0.13} height={height} color={index > 3 ? '#22c55e' : color} />
        ))}
        {[0.15, 0.37, 0.58, 0.78].map((y, index) => (
          <mesh key={y} position={[0.18 + index * 0.34, y - 0.2, z + 0.002]}><circleGeometry args={[0.055, 12]} /><meshBasicMaterial color="#86efac" /></mesh>
        ))}
      </group>
    );
  }

  if (kind === 'security') {
    return (
      <group>
        <mesh position={[-0.78, 0, z]}><ringGeometry args={[0.18, 0.36, 32]} /><meshBasicMaterial color={color} /></mesh>
        <mesh position={[-0.78, 0, z + 0.002]}><ringGeometry args={[0.05, 0.08, 24]} /><meshBasicMaterial color="#c4b5fd" /></mesh>
        {[-0.27, 0, 0.27].map((y, index) => (
          <group key={y}>
            <mesh position={[0.15, y, z]}><circleGeometry args={[0.07, 14]} /><meshBasicMaterial color={index === 2 ? '#fbbf24' : '#22c55e'} /></mesh>
            <ScreenBar position={[0.72, y, z]} width={0.82 - index * 0.09} height={0.065} color="#76668c" />
            <ScreenBar position={[1.25, y, z]} width={0.16} height={0.065} color={index === 2 ? '#78350f' : '#14532d'} />
          </group>
        ))}
      </group>
    );
  }

  if (kind === 'calendar') {
    return (
      <group>
        {Array.from({ length: 15 }, (_, index) => {
          const col = index % 5;
          const row = Math.floor(index / 5);
          return <ScreenBar key={index} position={[-1.08 + col * 0.38, 0.28 - row * 0.31, z]} width={0.27} height={0.21} color={index === 7 || index === 13 ? color : '#21172e'} />;
        })}
        {[0.27, 0, -0.27].map((y, index) => (
          <ScreenBar key={y} position={[1.02, y, z]} width={0.72 - index * 0.08} height={0.08} color={index === 0 ? '#22c55e' : '#675477'} />
        ))}
      </group>
    );
  }

  if (kind === 'quality') {
    return (
      <group>
        <mesh position={[-0.88, 0.05, z]}><ringGeometry args={[0.19, 0.36, 32]} /><meshBasicMaterial color={color} /></mesh>
        <ScreenBar position={[-0.88, 0.05, z + 0.002]} width={0.09} height={0.24} color="#e9d5ff" />
        <ScreenBar position={[-0.78, -0.06, z + 0.002]} width={0.24} height={0.09} color="#e9d5ff" />
        {[0.28, 0, -0.28].map((y, index) => (
          <group key={y}>
            <mesh position={[0.03, y, z]}><circleGeometry args={[0.06, 14]} /><meshBasicMaterial color="#22c55e" /></mesh>
            <ScreenBar position={[0.62, y, z]} width={0.85} height={0.065} color={index === 0 ? '#b6a4cc' : '#675477'} />
            <ScreenBar position={[1.22, y, z]} width={0.2} height={0.065} color="#14532d" />
          </group>
        ))}
      </group>
    );
  }

  return (
    <group>
      <mesh position={[-0.92, 0.18, z]}><ringGeometry args={[0.17, 0.31, 28]} /><meshBasicMaterial color={kind === 'brand' ? color : '#4c1d95'} /></mesh>
      {[0.29, 0.02, -0.26].map((y, index) => (
        <group key={y} position={[0.45, y, 0]}>
          <ScreenBar position={[-0.28, 0, z]} width={0.48 + index * 0.12} height={0.07} color={index === 0 ? color : '#4c1d95'} opacity={kind === 'generic' ? 0.55 : 1} />
          <ScreenBar position={[0.55, 0, z]} width={0.55} height={0.07} color="#211631" />
        </group>
      ))}
    </group>
  );
}

function ShowcaseDashboard({ color, depth, kind }: { color: string; depth: number; kind: ShowcaseScreenKind }) {
  return (
    <group position={[0, 1.78, -depth / 2 + 0.17]}>
      <mesh castShadow>
        <boxGeometry args={[3.45, 1.35, 0.12]} />
        <meshStandardMaterial color="#07050c" metalness={0.62} roughness={0.24} />
      </mesh>
      <mesh position={[0, 0, 0.066]}>
        <planeGeometry args={[3.18, 1.1]} />
        <meshStandardMaterial color="#0d0717" emissive="#17072b" emissiveIntensity={1.2} />
      </mesh>
      {kind !== 'brand' && <ShowcaseScreenVisual kind={kind} color={color} />}
      {kind === 'brand' && (
        <Html position={[0, 0, 0.08]} center transform distanceFactor={2.8} zIndexRange={[9, 4]}>
          <div className="showcase-screen-brand" aria-hidden="true">
            <div>ONYX<span>LINK</span></div>
            <small>OFICINA VIRTUAL</small>
          </div>
        </Html>
      )}
      <pointLight position={[0, 0, 0.7]} color={color} intensity={1.1} distance={4.5} decay={2} />
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

export default function OfficeRoom({ agent, center, occupied, presentation = false, width = ROOM_W, depth = ROOM_D }: Props) {
  const { size } = useThree();
  const compactSign = size.width < 768 || (size.height <= 600 && size.width < 1024);
  const executive = agent.id === 'coordinator';
  const deskZ = -depth / 2 + 1.25;
  const accent = presentation && !occupied ? '#6d28d9' : agent.color;
  const showcaseScreen = resolveShowcaseScreenKind(agent, occupied);

  return (
    <group position={center}>
      <WoodFloor width={width} depth={depth} presentation={presentation} />
      <mesh position={[0, 0.016, 1.05]} rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[executive ? 3.8 : 3.25, executive ? 2.1 : 1.85]} />
        <meshStandardMaterial color={presentation ? '#181020' : '#d8dddc'} transparent opacity={0.94} roughness={0.78} />
      </mesh>

      <pointLight position={[0, 2.35, -depth / 2 + 1.25]} color={presentation ? accent : '#fff6df'} intensity={presentation ? 3.85 : 1.55} distance={7.8} decay={2} />
      <pointLight position={[0, 2.7, 1]} color={presentation ? '#c4b5fd' : '#d9edf1'} intensity={presentation ? 2.35 : 0.82} distance={7.2} decay={2} />

      <mesh position={[0, WALL_H / 2, -depth / 2]} castShadow receiveShadow>
        <boxGeometry args={[width, WALL_H, WALL_T]} />
        <meshStandardMaterial color={presentation ? '#18141f' : '#e8ece9'} metalness={presentation ? 0.34 : 0.04} roughness={presentation ? 0.58 : 0.76} />
      </mesh>
      {[-1, 1].map((side) => (
        <group key={side} position={[side * width / 2, 1.22, 0]}>
          <mesh>
            <boxGeometry args={[WALL_T, 2.44, depth]} />
            <meshStandardMaterial
              color={presentation ? '#241a30' : '#dbe7e7'}
              transparent
              opacity={presentation ? 0.78 : 0.28}
              roughness={0.18}
              metalness={0.05}
              depthWrite={false}
            />
          </mesh>
          {[-depth / 2, 0, depth / 2].map((z) => (
            <mesh key={z} position={[0, 0, z]} castShadow>
              <boxGeometry args={[0.12, 2.55, 0.11]} />
              <meshStandardMaterial color={presentation ? '#49355f' : '#a8b4b6'} metalness={0.45} roughness={0.35} />
            </mesh>
          ))}
          <mesh position={[0, 1.22, 0]}>
            <boxGeometry args={[0.12, 0.11, depth]} />
            <meshStandardMaterial color={presentation ? '#49355f' : '#a8b4b6'} metalness={0.45} roughness={0.35} />
          </mesh>
        </group>
      ))}

      <mesh position={[0, 2.84, -0.35]}>
        <boxGeometry args={[1.9, 0.08, 0.9]} />
        <meshStandardMaterial color={presentation ? '#160f22' : '#d6dcda'} metalness={0.42} roughness={0.42} />
      </mesh>
      <mesh position={[0, 2.79, -0.35]}>
        <boxGeometry args={[1.7, 0.04, 0.72]} />
        <meshStandardMaterial color={presentation ? '#6d28d9' : '#fffdf5'} emissive={presentation ? agent.color : '#fff0c7'} emissiveIntensity={presentation ? 2.2 : 1.15} />
      </mesh>

      <mesh position={[0, 0.1, -depth / 2 + 0.12]}>
        <boxGeometry args={[width - 0.25, 0.11, 0.08]} />
        <meshStandardMaterial color={presentation ? '#6d28d9' : '#a7b6b4'} emissive={presentation ? '#5b21b6' : '#000000'} emissiveIntensity={presentation ? 1.4 : 0} roughness={0.48} />
      </mesh>

      <group position={[0, 0, deskZ]}>
        <DeskSetup color={accent} executive={executive} presentation={presentation} />
      </group>

      {!presentation && <group position={[-width / 2 + 0.55, 1.72, -depth / 2 + 0.16]}>
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
      </group>}

      {presentation ? (
        <ShowcaseDashboard color={accent} depth={depth} kind={showcaseScreen} />
      ) : (
        <OfficeWindow position={[width / 2 - 2.1, 1.82, -depth / 2 + 0.16]} color={agent.color} />
      )}
      {executive && !presentation && <NeutralWallArt depth={depth} />}

      <group position={[width / 2 - 0.52, 0, -depth / 2 + 0.48]}>
        <mesh position={[0, 0.72, 0]} castShadow>
          <boxGeometry args={[0.75, 1.44, 0.55]} />
          <meshStandardMaterial color={presentation ? '#120e19' : '#e1e5e2'} metalness={presentation ? 0.4 : 0.14} roughness={0.55} />
        </mesh>
        {[0.32, 0.75, 1.18].map((y) => (
          <mesh key={y} position={[0, y, 0.285]}>
            <boxGeometry args={[0.62, 0.025, 0.02]} />
            <meshBasicMaterial color={presentation ? '#5b21b6' : '#9ba7a7'} />
          </mesh>
        ))}
      </group>
      <IndoorPlant position={[width / 2 - 0.7, 0, 0.8]} presentation={presentation} />

      {presentation && (
        <>
          <mesh position={[0, 0.11, depth / 2 - 0.08]}>
            <boxGeometry args={[width - 0.24, 0.055, 0.07]} />
            <meshStandardMaterial color={accent} emissive={accent} emissiveIntensity={2.8} />
          </mesh>
          {[-1, 1].map((side) => (
            <mesh key={side} position={[side * (width / 2 - 0.08), 0.11, 0]}>
              <boxGeometry args={[0.07, 0.055, depth - 0.24]} />
              <meshStandardMaterial color="#5b21b6" emissive="#5b21b6" emissiveIntensity={2} />
            </mesh>
          ))}
        </>
      )}

      {(() => {
        const sign = officeSignContent(agent, occupied);
        return sign.visible ? (
          compactSign ? (
            <Html position={[0, WALL_H + 0.65, 0]} center transform sprite distanceFactor={14} zIndexRange={[12, 8]}>
              <div className="office-sign" style={{ '--agent-color': agent.color } as CSSProperties}>
                <span className="office-sign__dot" />
                {sign.visibleText}
              </div>
            </Html>
          ) : (
            <Html position={[0, WALL_H + 0.65, 0]} center zIndexRange={[12, 8]}>
              <div className="office-sign" style={{ '--agent-color': agent.color } as CSSProperties}>
                <span className="office-sign__dot" />
                {sign.visibleText}
              </div>
            </Html>
          )
        ) : (
          // Inactive/unavailable seat: no visible sign at all — not even a
          // generic "vacant" label. A screen-reader-only description is the
          // only DOM text present, so the desk still reads as empty to
          // assistive tech without putting anything on screen.
          <Html position={[0, WALL_H + 0.65, 0]} center zIndexRange={[12, 8]}>
            <span className="sr-only">{sign.accessibleText}</span>
          </Html>
        );
      })()}
    </group>
  );
}
