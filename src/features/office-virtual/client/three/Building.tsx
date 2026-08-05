import { Html } from '@react-three/drei';
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
  presentationStyle?: boolean;
};

const DESK_LOCAL_Z = -ROOM_D / 2 + 1.25;
const WORK_CHAIR_LOCAL_Z = DESK_LOCAL_Z + 1.05;
const PATROL_LOCAL_Z = 0.8;
const PATROL_AMPLITUDE = 2.75;

function buildIdlePath(index: number, corridorZ: number, cafeCenter: [number, number, number]): [number, number, number][] {
  const room = roomCenter(index);
  const laneOffset = (index % 4 - 1.5) * .28;
  const rowCorridorZ = room[2] + ROOM_D / 2 + GAP / 2 + laneOffset;
  const sideCorridorX = BUILDING_WIDTH / 2 + 1.05 + (index % 3) * .34;
  const cafeStops: Array<[number, number]> = [
    [-5.8, -.2], [-2.8, -.2], [.2, -.2], [3.2, -.2],
    [-5.8, 5], [-2.8, 5], [.2, 5], [3.2, 5],
    [-6, -4.4], [-3.5, -4.4], [-1, -4.4], [4.6, -4.4],
  ];
  const stop = cafeStops[index % cafeStops.length];
  const entranceZ = index % 2 === 0 ? -2.6 : 2.6;
  return [
    [room[0] + ROOM_W / 2 - 1.15, 0, room[2] + ROOM_D / 2 + .35],
    [room[0] + ROOM_W / 2 - 1.15, 0, rowCorridorZ],
    [sideCorridorX, 0, rowCorridorZ],
    [sideCorridorX, 0, corridorZ],
    [cafeCenter[0] - 8.55, 0, corridorZ + laneOffset],
    [cafeCenter[0] - 8.2, 0, corridorZ + entranceZ],
    [cafeCenter[0] - 7.55, 0, corridorZ + entranceZ],
    [cafeCenter[0] + stop[0], 0, corridorZ + stop[1]],
  ];
}

function pathDistance(start: [number, number, number], path: [number, number, number][]): number {
  let distance = 0;
  let previous = start;
  path.forEach((point) => {
    distance += Math.hypot(point[0] - previous[0], point[2] - previous[2]);
    previous = point;
  });
  return distance;
}

function CafeChair({ position, rotation = 0, presentation }: { position: [number, number, number]; rotation?: number; presentation: boolean }) {
  const color = presentation ? '#17302f' : '#6e7d79';
  return (
    <group position={position} rotation={[0, rotation, 0]}>
      <mesh position={[0, .48, 0]} castShadow><boxGeometry args={[.78, .12, .78]} /><meshStandardMaterial color={color} roughness={.55} /></mesh>
      <mesh position={[0, .93, -.32]} castShadow><boxGeometry args={[.78, .88, .12]} /><meshStandardMaterial color={color} roughness={.55} /></mesh>
      {[[-.3,.23,-.3],[.3,.23,-.3],[-.3,.23,.3],[.3,.23,.3]].map(([x,y,z], i) => <mesh key={i} position={[x,y,z]} castShadow><cylinderGeometry args={[.035,.035,.46,8]} /><meshStandardMaterial color="#172322" metalness={.65} /></mesh>)}
    </group>
  );
}

function CafeTable({ position, presentation }: { position: [number, number, number]; presentation: boolean }) {
  return <group position={position}>
    <mesh position={[0,.72,0]} castShadow receiveShadow><cylinderGeometry args={[.9,.9,.1,32]} /><meshStandardMaterial color={presentation ? '#263d3b' : '#c6a879'} roughness={.46} /></mesh>
    <mesh position={[0,.35,0]} castShadow><cylinderGeometry args={[.09,.13,.7,16]} /><meshStandardMaterial color="#172322" metalness={.72} /></mesh>
    <mesh position={[0,.05,0]} castShadow><cylinderGeometry args={[.45,.55,.08,24]} /><meshStandardMaterial color="#172322" metalness={.64} /></mesh>
    <mesh position={[.22,.83,.06]}><cylinderGeometry args={[.1,.085,.2,12]} /><meshStandardMaterial color="#eee6d8" /></mesh>
  </group>;
}

function CafeLounge({ position, presentation }: { position: [number, number, number]; presentation: boolean }) {
  const wall = presentation ? '#152625' : '#dce5e2';
  return <group position={position}>
    <mesh position={[0,-.06,0]} receiveShadow><boxGeometry args={[16,.12,13]} /><meshStandardMaterial color={presentation ? '#0d1b1a' : '#c9aa7c'} roughness={.7} /></mesh>
    <mesh position={[0,1.5,-6.5]} castShadow><boxGeometry args={[16,3,.18]} /><meshStandardMaterial color={wall} /></mesh>
    <mesh position={[8,1.5,0]} castShadow><boxGeometry args={[.18,3,13]} /><meshStandardMaterial color={wall} /></mesh>
    {[-5, 0, 5].map((z) => <mesh key={z} position={[-8,1.5,z]} castShadow><boxGeometry args={[.18,3,z === 0 ? 3.4 : 3]} /><meshStandardMaterial color={wall} /></mesh>)}
    {[-2.6, 2.6].map((z) => <group key={z} position={[-8,0,z]}><mesh position={[0,2.72,0]} castShadow><boxGeometry args={[.22,.22,2]} /><meshStandardMaterial color="#3D6463" metalness={.48} /></mesh>{[-1,1].map((side)=><mesh key={side} position={[0,1.35,side]} castShadow><boxGeometry args={[.22,2.7,.16]} /><meshStandardMaterial color="#3D6463" metalness={.48} /></mesh>)}</group>)}
    <group position={[2.4,0,-5.4]}>
      <mesh position={[0,.56,0]} castShadow><boxGeometry args={[10,1.12,1.25]} /><meshStandardMaterial color={presentation ? '#263b39' : '#a77b50'} roughness={.48} /></mesh>
      <mesh position={[0,1.16,.48]} castShadow><boxGeometry args={[10.2,.12,1.42]} /><meshStandardMaterial color={presentation ? '#426361' : '#dfc49e'} roughness={.35} /></mesh>
      {[-2.65, -.75].map((x) => <group key={x} position={[x,0,0]}><mesh position={[0,1.62,0]} castShadow><boxGeometry args={[1.15,.82,.72]} /><meshStandardMaterial color="#172322" metalness={.72} roughness={.22} /></mesh><mesh position={[0,1.65,.38]}><circleGeometry args={[.19,24]} /><meshStandardMaterial color="#79CBCA" emissive="#397C7B" emissiveIntensity={1.2} /></mesh></group>)}
      <mesh position={[1.45,1.5,.15]} castShadow><boxGeometry args={[2.3,.52,.75]} /><meshStandardMaterial color="#182625" transparent opacity={.68} /></mesh>
      {[.55,1.05,1.55,2.05,2.55].map((x)=><mesh key={x} position={[x,1.62,.54]}><cylinderGeometry args={[.11,.09,.22,12]} /><meshStandardMaterial color="#f1e8da" /></mesh>)}
    </group>
    {[[-4.5,-1.5],[2,-1.5],[-4.5,3.4],[2,3.4]].map(([x,z], i) => <group key={i}><CafeTable position={[x,0,z]} presentation={presentation} /><CafeChair position={[x-1.55,0,z]} rotation={Math.PI/2} presentation={presentation} /><CafeChair position={[x+1.55,0,z]} rotation={-Math.PI/2} presentation={presentation} /></group>)}
    <group position={[5.4,0,3.9]}><mesh position={[0,.42,0]} castShadow><boxGeometry args={[3.6,.82,1]} /><meshStandardMaterial color={presentation ? '#24413f' : '#7d8b87'} /></mesh><mesh position={[0,1.02,-.4]} castShadow><boxGeometry args={[3.6,1.2,.16]} /><meshStandardMaterial color={presentation ? '#1a302f' : '#71817d'} /></mesh></group>
    <Html position={[0,2.45,-6.38]} center distanceFactor={12}><div className="office-coffee-sign">ONYXLINK CAFÉ</div></Html>
    {[[-4.5,2.65,-1.5],[2,2.65,-1.5],[-4.5,2.65,3.4],[2,2.65,3.4],[5.5,2.65,0]].map((p,i)=><pointLight key={i} position={p as [number,number,number]} color={i < 4 ? '#ffd8a8' : '#A0DCDB'} intensity={presentation ? 2.6 : 1.8} distance={8} decay={2} />)}
  </group>;
}

export default function Building({ rooms, selectedId, onSelect, onHover, presentation = false, presentationStyle = presentation }: Props) {
  const frontRoomZ = roomCenter(0)[2];
  const corridorZ = frontRoomZ + ROOM_D / 2 + GAP / 2;
  const cafeCenter: [number, number, number] = [BUILDING_WIDTH / 2 + 12, 0, corridorZ];
  const visibleRooms = presentation ? buildPresentationRoomSlots(rooms) : rooms;

  return (
    <group>
      {/* ground beneath/around the building */}
      <mesh position={[0, -0.2, 0]} rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
        <planeGeometry args={[BUILDING_WIDTH + 42, BUILDING_DEPTH + 24]} />
        <meshStandardMaterial
          color={presentationStyle ? '#020808' : '#d9ddda'}
          roughness={presentationStyle ? 0.68 : 0.88}
          metalness={presentationStyle ? 0.22 : 0}
        />
      </mesh>

      <mesh position={[BUILDING_WIDTH / 2 + 2, -.105, corridorZ]} rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
        <planeGeometry args={[8, 6.6]} />
        <meshStandardMaterial color={presentationStyle ? '#0b1b1a' : '#c4cbc8'} metalness={presentationStyle ? .26 : .05} roughness={.72} />
      </mesh>

      {/* A neutral circulation spine makes the rooms read as one shared office. */}
      <mesh position={[0, -0.115, corridorZ]} rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
        <planeGeometry args={[BUILDING_WIDTH + 1.2, 1.15]} />
        <meshStandardMaterial
          color={presentationStyle ? '#081414' : '#c4cbc8'}
          metalness={presentationStyle ? 0.3 : 0.06}
          roughness={0.76}
        />
      </mesh>
      {[-1.5 * SPACING_X, -0.5 * SPACING_X, 0.5 * SPACING_X, 1.5 * SPACING_X].map((x) => (
        <mesh key={x} position={[x, -0.105, corridorZ]} rotation={[-Math.PI / 2, 0, 0]}>
          <planeGeometry args={[0.055, 1.05]} />
          <meshBasicMaterial color={presentationStyle ? '#397C7B' : '#8fa29d'} />
        </mesh>
      ))}
      <mesh position={[0, -0.1, corridorZ]} rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[ROOM_W, 0.035]} />
        <meshBasicMaterial color={presentationStyle ? '#83CFCE' : '#879995'} />
      </mesh>

      <CafeLounge position={cafeCenter} presentation={presentationStyle} />

      {visibleRooms.map((slot, i) => {
        const room = roomCenter(i);
        const path = buildIdlePath(i, corridorZ, cafeCenter);
        return <OfficeRoom
          key={slot.seatId}
          agent={slot.room}
          center={roomCenter(i)}
          occupied={slot.occupant !== null}
          presentation={presentationStyle}
          phase={i * 1.3}
          doorEnabled={slot.occupant !== null && slot.occupant.status !== 'working'}
          routeDistance={pathDistance([room[0], room[1], room[2] + PATROL_LOCAL_Z], path)}
        />;
      })}

      {visibleRooms.map((slot, i) => {
        if (!slot.occupant) return null;
        const [x, y, z] = roomCenter(i);
        const isWorking = slot.occupant.status === 'working';
        const path = buildIdlePath(i, corridorZ, cafeCenter);
        const start: [number, number, number] = [x, y, z + (isWorking ? WORK_CHAIR_LOCAL_Z : PATROL_LOCAL_Z)];
        return (
          <OfficeCharacter
            key={slot.seatId}
            agent={slot.occupant}
            center={start}
            patrolAmplitude={PATROL_AMPLITUDE}
            phase={i * 1.3}
            idlePath={path}
            routeDistance={pathDistance(start, path)}
            seated={isWorking}
            presentation={presentationStyle}
            isSelected={slot.seatId === selectedId}
            onSelect={onSelect}
            onHover={onHover}
          />
        );
      })}
    </group>
  );
}
