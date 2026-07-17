import type { Agent } from '../types';
import {
  BUILDING_DEPTH,
  BUILDING_WIDTH,
  COORD_ROOM_D,
  COORD_ROOM_W,
  GAP,
  ROOM_D,
  ROOM_W,
  SPACING_X,
  coordinatorRoomCenter,
  roomCenter,
} from './layout';
import OfficeCharacter from './OfficeCharacter';
import OfficeRoom from './OfficeRoom';

type Props = {
  agents: Agent[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  onHover: (id: string | null) => void;
};

const DESK_LOCAL_Z = -ROOM_D / 2 + 1.25;
const WORK_CHAIR_LOCAL_Z = DESK_LOCAL_Z + 1.05;
const PATROL_LOCAL_Z = 0.8;
const PATROL_AMPLITUDE = 2.75;

export default function Building({ agents, selectedId, onSelect, onHover }: Props) {
  const coordinator = agents.find((a) => a.id === 'coordinator');
  const specialists = agents.filter((a) => a.id !== 'coordinator');
  const coordCenter = coordinatorRoomCenter();
  const frontRoomZ = roomCenter(0)[2];
  const corridorZ = frontRoomZ + ROOM_D / 2 + GAP / 2;

  return (
    <group>
      {/* ground beneath/around the building */}
      <mesh position={[0, -0.2, 0]} rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
        <planeGeometry args={[BUILDING_WIDTH + 20, BUILDING_DEPTH + 20]} />
        <meshStandardMaterial color="#d9ddda" roughness={0.88} />
      </mesh>

      {/* A neutral circulation spine makes the rooms read as one shared office. */}
      <mesh position={[0, -0.115, corridorZ]} rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
        <planeGeometry args={[BUILDING_WIDTH + 1.2, 1.15]} />
        <meshStandardMaterial color="#c4cbc8" metalness={0.06} roughness={0.76} />
      </mesh>
      {[-SPACING_X, 0, SPACING_X].map((x) => (
        <mesh key={x} position={[x, -0.105, corridorZ]} rotation={[-Math.PI / 2, 0, 0]}>
          <planeGeometry args={[0.055, 1.05]} />
          <meshBasicMaterial color="#8fa29d" />
        </mesh>
      ))}
      <mesh position={[0, -0.1, corridorZ]} rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[ROOM_W, 0.035]} />
        <meshBasicMaterial color="#879995" />
      </mesh>

      {coordinator && <OfficeRoom agent={coordinator} center={coordCenter} width={COORD_ROOM_W} depth={COORD_ROOM_D} />}
      {coordinator && (
        <OfficeCharacter
          agent={coordinator}
          center={[
            coordCenter[0],
            coordCenter[1],
            coordCenter[2] + WORK_CHAIR_LOCAL_Z,
          ]}
          patrolAmplitude={PATROL_AMPLITUDE}
          phase={0}
          seated
          isSelected={coordinator.id === selectedId}
          onSelect={onSelect}
          onHover={onHover}
        />
      )}

      {specialists.map((agent, i) => {
        const center = roomCenter(i);
        return <OfficeRoom key={agent.id} agent={agent} center={center} />;
      })}

      {specialists.map((agent, i) => {
        const [x, y, z] = roomCenter(i);
        const isWorking = agent.status === 'working';
        return (
          <OfficeCharacter
            key={agent.id}
            agent={agent}
            center={[x, y, z + (isWorking ? WORK_CHAIR_LOCAL_Z : PATROL_LOCAL_Z)]}
            patrolAmplitude={PATROL_AMPLITUDE}
            phase={i * 1.3}
            seated={isWorking}
            isSelected={agent.id === selectedId}
            onSelect={onSelect}
            onHover={onHover}
          />
        );
      })}
    </group>
  );
}
