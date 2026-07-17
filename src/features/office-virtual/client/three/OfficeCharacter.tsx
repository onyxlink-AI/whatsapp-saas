import { Html } from '@react-three/drei';
import { useFrame } from '@react-three/fiber';
import { useEffect, useMemo, useRef, useState } from 'react';
import * as THREE from 'three';
import { STATUS_HEX as STATUS_COLOR, STATUS_LABEL_ES as STATUS_LABEL } from '../lib/statusStyles';
import type { Agent } from '../types';

type Props = {
  agent: Agent;
  center: [number, number, number];
  patrolAmplitude: number;
  phase: number;
  seated?: boolean;
  isSelected: boolean;
  onSelect: (id: string) => void;
  onHover: (id: string | null) => void;
};

const POLO_COLOR = '#0b0b0e';
const JEANS_COLOR = '#23436f';
const SHOE_COLOR = '#171216';
const POLO_MATERIAL = new THREE.MeshStandardMaterial({ color: POLO_COLOR, roughness: 0.76 });
const JEANS_MATERIAL = new THREE.MeshStandardMaterial({ color: JEANS_COLOR, roughness: 0.78 });
const SHOE_MATERIAL = new THREE.MeshStandardMaterial({ color: SHOE_COLOR, roughness: 0.72 });
const EYE_MATERIAL = new THREE.MeshStandardMaterial({ color: '#17131a', roughness: 0.5 });
const MOUTH_MATERIAL = new THREE.MeshStandardMaterial({ color: '#642d32', roughness: 0.7 });
const COLLAR_MATERIAL = new THREE.MeshStandardMaterial({ color: '#7c3aed', roughness: 0.6 });
function StandingLeg({
  side,
  legRef,
}: {
  side: -1 | 1;
  legRef: React.RefObject<THREE.Group | null>;
}) {
  return (
    <group ref={legRef} position={[side * 0.15, 0.84, 0]}>
      <mesh position={[0, -0.31, 0]} material={JEANS_MATERIAL} castShadow>
        <capsuleGeometry args={[0.105, 0.43, 3, 7]} />
      </mesh>
      <mesh position={[0, -0.66, 0.055]} material={SHOE_MATERIAL} castShadow>
        <capsuleGeometry args={[0.115, 0.22, 3, 7]} />
      </mesh>
    </group>
  );
}

function SeatedLeg({ side }: { side: -1 | 1 }) {
  return (
    <group position={[side * 0.15, 0.91, 0]}>
      <mesh position={[0, -0.01, 0.25]} rotation={[Math.PI / 2, 0, 0]} material={JEANS_MATERIAL} castShadow>
        <capsuleGeometry args={[0.11, 0.34, 3, 7]} />
      </mesh>
      <mesh position={[0, -0.3, 0.49]} material={JEANS_MATERIAL} castShadow>
        <capsuleGeometry args={[0.105, 0.4, 3, 7]} />
      </mesh>
      <mesh position={[0, -0.57, 0.57]} rotation={[Math.PI / 2, 0, 0]} material={SHOE_MATERIAL} castShadow>
        <capsuleGeometry args={[0.115, 0.22, 3, 7]} />
      </mesh>
    </group>
  );
}

function WalkingArm({
  side,
  skinMaterial,
  armRef,
}: {
  side: -1 | 1;
  skinMaterial: THREE.Material;
  armRef: React.RefObject<THREE.Group | null>;
}) {
  return (
    <group ref={armRef} position={[side * 0.36, 1.47, 0]}>
        <mesh position={[0, -0.13, 0]} material={POLO_MATERIAL} castShadow>
          <capsuleGeometry args={[0.105, 0.16, 3, 7]} />
      </mesh>
      <mesh position={[0, -0.42, 0]} material={skinMaterial} castShadow>
        <capsuleGeometry args={[0.085, 0.3, 3, 7]} />
      </mesh>
      <mesh position={[0, -0.66, 0]} material={skinMaterial} castShadow>
        <sphereGeometry args={[0.105, 8, 6]} />
      </mesh>
    </group>
  );
}

function SeatedArm({ side, skinMaterial }: { side: -1 | 1; skinMaterial: THREE.Material }) {
  return (
    <group position={[side * 0.34, 1.45, 0]}>
      <group rotation={[-0.48, 0, side * 0.08]}>
        <mesh position={[0, -0.14, 0]} material={POLO_MATERIAL} castShadow>
          <capsuleGeometry args={[0.105, 0.16, 3, 7]} />
        </mesh>
        <mesh position={[0, -0.39, 0]} material={skinMaterial} castShadow>
          <capsuleGeometry args={[0.085, 0.28, 3, 7]} />
        </mesh>
      </group>
      <group position={[0, -0.31, 0.3]} rotation={[-Math.PI / 2, 0, 0]}>
        <mesh position={[0, -0.17, 0]} material={skinMaterial} castShadow>
          <capsuleGeometry args={[0.078, 0.2, 3, 7]} />
        </mesh>
        <mesh position={[0, -0.34, 0]} material={skinMaterial} castShadow>
          <sphereGeometry args={[0.095, 8, 6]} />
        </mesh>
      </group>
    </group>
  );
}

export default function OfficeCharacter({
  agent,
  center,
  patrolAmplitude,
  phase,
  seated = false,
  isSelected,
  onSelect,
  onHover,
}: Props) {
  const group = useRef<THREE.Group>(null);
  const leftLeg = useRef<THREE.Group>(null);
  const rightLeg = useRef<THREE.Group>(null);
  const leftArm = useRef<THREE.Group>(null);
  const rightArm = useRef<THREE.Group>(null);
  const bodyBob = useRef<THREE.Group>(null);
  const [hovered, setHovered] = useState(false);

  const materials = useMemo(
    () => ({
      skin: new THREE.MeshStandardMaterial({ color: agent.appearance.skinColor, roughness: 0.74 }),
      hair: new THREE.MeshStandardMaterial({ color: agent.appearance.hairColor, roughness: 0.86 }),
    }),
    [agent.appearance.hairColor, agent.appearance.skinColor],
  );

  useEffect(
    () => () => {
      materials.skin.dispose();
      materials.hair.dispose();
    },
    [materials],
  );

  useFrame((state) => {
    const t = state.clock.getElapsedTime();
    const localX = seated ? 0 : Math.sin(t * 0.6 + phase) * patrolAmplitude;
    const velocity = Math.cos(t * 0.6 + phase);
    if (group.current) {
      group.current.position.set(center[0] + localX, center[1], center[2]);
      const targetYaw = seated ? Math.PI : velocity >= 0 ? Math.PI / 2 : -Math.PI / 2;
      group.current.rotation.y = THREE.MathUtils.lerp(group.current.rotation.y, targetYaw, 0.06);
    }

    const swing = seated ? 0 : Math.sin(t * 5.5) * 0.48;
    if (leftLeg.current) leftLeg.current.rotation.x = swing;
    if (rightLeg.current) rightLeg.current.rotation.x = -swing;
    if (leftArm.current) leftArm.current.rotation.x = -swing;
    if (rightArm.current) rightArm.current.rotation.x = swing;
    if (bodyBob.current) {
      bodyBob.current.position.y = seated ? -0.2 : Math.abs(Math.sin(t * 5.5)) * 0.035;
    }
  });

  return (
    <group
      ref={group}
      dispose={null}
      onClick={(event) => {
        event.stopPropagation();
        onSelect(agent.id);
      }}
      onPointerOver={(event) => {
        event.stopPropagation();
        setHovered(true);
        onHover(agent.id);
        document.body.style.cursor = 'pointer';
      }}
      onPointerOut={() => {
        setHovered(false);
        onHover(null);
        document.body.style.cursor = 'auto';
      }}
    >
      <mesh position={[0, 1.1, 0]} visible={false}>
        <capsuleGeometry args={[0.48, 1.35, 3, 8]} />
      </mesh>

      <group ref={bodyBob}>
        {seated ? (
          <>
            <SeatedLeg side={-1} />
            <SeatedLeg side={1} />
          </>
        ) : (
          <>
            <StandingLeg side={-1} legRef={leftLeg} />
            <StandingLeg side={1} legRef={rightLeg} />
          </>
        )}

        <mesh position={[0, 1.28, 0]} material={POLO_MATERIAL} castShadow>
          <capsuleGeometry args={[0.28, 0.4, 4, 8]} />
        </mesh>
        <mesh position={[0, 1.54, 0.235]} rotation={[Math.PI / 4, 0, 0]} material={COLLAR_MATERIAL}>
          <coneGeometry args={[0.055, 0.13, 3]} />
        </mesh>

        {seated ? (
          <>
            <SeatedArm side={-1} skinMaterial={materials.skin} />
            <SeatedArm side={1} skinMaterial={materials.skin} />
          </>
        ) : (
          <>
            <WalkingArm side={-1} skinMaterial={materials.skin} armRef={leftArm} />
            <WalkingArm side={1} skinMaterial={materials.skin} armRef={rightArm} />
          </>
        )}

        <mesh position={[-0.3, 1.83, 0]} material={materials.skin} castShadow>
          <sphereGeometry args={[0.085, 8, 6]} />
        </mesh>
        <mesh position={[0.3, 1.83, 0]} material={materials.skin} castShadow>
          <sphereGeometry args={[0.085, 8, 6]} />
        </mesh>
        <mesh position={[0, 1.84, 0]} scale={[0.92, 1.06, 0.92]} material={materials.skin} castShadow>
          <sphereGeometry args={[0.3, 12, 9]} />
        </mesh>

        <mesh position={[-0.105, 1.88, 0.267]} material={EYE_MATERIAL}>
          <sphereGeometry args={[0.032, 7, 5]} />
        </mesh>
        <mesh position={[0.105, 1.88, 0.267]} material={EYE_MATERIAL}>
          <sphereGeometry args={[0.032, 7, 5]} />
        </mesh>
        <mesh position={[0, 1.75, 0.28]} scale={[1.6, 0.55, 0.45]} material={MOUTH_MATERIAL}>
          <sphereGeometry args={[0.055, 8, 5]} />
        </mesh>

        <mesh position={[0, 2.04, -0.01]} scale={[0.98, 0.48, 0.98]} material={materials.hair} castShadow>
          <sphereGeometry args={[0.31, 10, 7]} />
        </mesh>
        <mesh position={[-0.24, 1.98, -0.02]} rotation={[0, 0, -0.2]} material={materials.hair} castShadow>
          <sphereGeometry args={[0.115, 8, 6]} />
        </mesh>

        <mesh position={[0, 2.28, 0]}>
          <sphereGeometry args={[0.075, 10, 8]} />
          <meshStandardMaterial
            color={STATUS_COLOR[agent.status]}
            emissive={STATUS_COLOR[agent.status]}
            emissiveIntensity={1.6}
          />
        </mesh>

        <Html position={[0, 2.55, 0]} center distanceFactor={9} occlude={false} zIndexRange={[10, 0]}>
          <div className="flex flex-col items-center pointer-events-none select-none">
            <div
              className="px-2 py-0.5 rounded-full text-[11px] font-medium text-slate-100 bg-slate-900/85 border whitespace-nowrap shadow-lg"
              style={{ borderColor: isSelected ? '#ffffff' : agent.color }}
            >
              {agent.name}
            </div>
            {(hovered || isSelected) && (
              <div className="mt-0.5 text-[9px] text-slate-300 bg-slate-900/70 px-1.5 rounded-full whitespace-nowrap">
                {STATUS_LABEL[agent.status]}
              </div>
            )}
          </div>
        </Html>
      </group>

      {(isSelected || hovered) && (
        <mesh position={[0, 0.02, 0]} rotation={[-Math.PI / 2, 0, 0]}>
          <ringGeometry args={[0.5, 0.62, 28]} />
          <meshBasicMaterial color={agent.color} transparent opacity={0.8} />
        </mesh>
      )}
    </group>
  );
}
