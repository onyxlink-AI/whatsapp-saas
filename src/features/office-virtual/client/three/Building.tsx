import { BUILDING_DEPTH, BUILDING_WIDTH, GAP, ROOM_D, ROOM_W, SPACING_X, roomCenter } from './layout';
import type { OfficeRoomSlot } from './officeRoster';
import OfficeCharacter from './OfficeCharacter';
import OfficeRoom from './OfficeRoom';
import { buildPresentationRoomSlots } from './presentationRoster';

type Props = {
  rooms: OfficeRoomSlot[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  onHover: (id: string | null) => void;
  presentation?: boolean;
};

const DESK_LOCAL_Z = -ROOM_D / 2 + 1.25;
const WORK_CHAIR_LOCAL_Z = DESK_LOCAL_Z + 1.05;
const PATROL_LOCAL_Z = 0.8;
const PATROL_AMPLITUDE = 2.75;

export default function Building({ rooms, selectedId, onSelect, onHover, presentation = false }: Props) {
  const frontRoomZ = roomCenter(0)[2];
  const corridorZ = frontRoomZ + ROOM_D / 2 + GAP / 2;
  const visibleRooms = presentation ? buildPresentationRoomSlots(rooms) : rooms;

  return (
    <group>
      {/* ground beneath/around the building */}
      <mesh position={[0, -0.2, 0]} rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
        <planeGeometry args={[BUILDING_WIDTH + 20, BUILDING_DEPTH + 20]} />
        <meshStandardMaterial
          color={presentation ? '#020808' : '#d9ddda'}
          roughness={presentation ? 0.68 : 0.88}
          metalness={presentation ? 0.22 : 0}
        />
      </mesh>

      {/* A neutral circulation spine makes the rooms read as one shared office. */}
      <mesh position={[0, -0.115, corridorZ]} rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
        <planeGeometry args={[BUILDING_WIDTH + 1.2, 1.15]} />
        <meshStandardMaterial
          color={presentation ? '#081414' : '#c4cbc8'}
          metalness={presentation ? 0.3 : 0.06}
          roughness={0.76}
        />
      </mesh>
      {[-1.5 * SPACING_X, -0.5 * SPACING_X, 0.5 * SPACING_X, 1.5 * SPACING_X].map((x) => (
        <mesh key={x} position={[x, -0.105, corridorZ]} rotation={[-Math.PI / 2, 0, 0]}>
          <planeGeometry args={[0.055, 1.05]} />
          <meshBasicMaterial color={presentation ? '#397C7B' : '#8fa29d'} />
        </mesh>
      ))}
      <mesh position={[0, -0.1, corridorZ]} rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[ROOM_W, 0.035]} />
        <meshBasicMaterial color={presentation ? '#83CFCE' : '#879995'} />
      </mesh>

      {visibleRooms.map((slot, i) => (
        <OfficeRoom
          key={slot.seatId}
          agent={slot.room}
          center={roomCenter(i)}
          occupied={slot.occupant !== null}
          presentation={presentation}
        />
      ))}

      {visibleRooms.map((slot, i) => {
        if (!slot.occupant) return null;
        const [x, y, z] = roomCenter(i);
        const isWorking = slot.occupant.status === 'working';
        return (
          <OfficeCharacter
            key={slot.seatId}
            agent={slot.occupant}
            center={[x, y, z + (isWorking ? WORK_CHAIR_LOCAL_Z : PATROL_LOCAL_Z)]}
            patrolAmplitude={PATROL_AMPLITUDE}
            phase={i * 1.3}
            seated={isWorking}
            presentation={presentation}
            isSelected={slot.seatId === selectedId}
            onSelect={onSelect}
            onHover={onHover}
          />
        );
      })}
    </group>
  );
}
