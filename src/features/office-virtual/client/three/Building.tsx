import { useFrame } from '@react-three/fiber';
import { useEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import { BUILDING_DEPTH, BUILDING_WIDTH, GAP, ROOM_D, ROOM_W, SPACING_X, roomCenter } from './layout';
import type { OfficeRoomSlot } from './officeRoster';
import OfficeCharacter from './OfficeCharacter';
import OfficeRoom from './OfficeRoom';
import { resolveCoffeePropState, resolveIdleMotion } from './idleMotion';
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

type IdleRoute = {
  path: [number, number, number][];
  distance: number;
  cupPickupProgress: number;
};

function buildIdleRoute(index: number, corridorZ: number, cafeCenter: [number, number, number]): IdleRoute {
  const room = roomCenter(index);
  const laneOffset = (index % 4 - 1.5) * .28;
  const rowCorridorZ = room[2] + ROOM_D / 2 + GAP / 2 + laneOffset;
  const sideCorridorX = BUILDING_WIDTH / 2 + 1.05 + (index % 3) * .34;
  // Two completely clear internal aisles between the two table rows. Every
  // destination is outside the table, chair, sofa and counter footprints.
  const cafeStopX = -6.05 + (index % 6) * 2.35;
  const cafeAisleZ = index % 2 === 0 ? .35 : 1.35;
  const entranceZ = index % 2 === 0 ? -2.6 : 2.6;
  const cupStationX = 2.8 + (index % 6) * .42;
  const path: [number, number, number][] = [
    [room[0] + ROOM_W / 2 - 1.15, 0, room[2] + ROOM_D / 2 + .35],
    [room[0] + ROOM_W / 2 - 1.15, 0, rowCorridorZ],
    [sideCorridorX, 0, rowCorridorZ],
    [sideCorridorX, 0, corridorZ],
    [cafeCenter[0] - 8.55, 0, corridorZ + laneOffset],
    // Align while still outside. Crossing the wall diagonally was the source
    // of the visible wall clipping in the previous route.
    [cafeCenter[0] - 8.55, 0, corridorZ + entranceZ],
    [cafeCenter[0] - 8.2, 0, corridorZ + entranceZ],
    [cafeCenter[0] - 7.55, 0, corridorZ + entranceZ],
    // Stay against the clear left edge until reaching an internal aisle, then
    // turn at 90 degrees. No diagonal segment can cut across furniture.
    [cafeCenter[0] - 7.4, 0, corridorZ + entranceZ],
    [cafeCenter[0] - 7.4, 0, corridorZ + cafeAisleZ],
    // Every visit reaches the real cup rack first. The approach runs along
    // the clear strip in front of the counter, never through tables/chairs.
    [cafeCenter[0] - 7.4, 0, corridorZ - 4.2],
    [cafeCenter[0] + cupStationX, 0, corridorZ - 4.2],
    [cafeCenter[0] - 7, 0, corridorZ - 4.2],
    [cafeCenter[0] - 7, 0, corridorZ + cafeAisleZ],
    [cafeCenter[0] + cafeStopX, 0, corridorZ + cafeAisleZ],
  ];
  const start: [number, number, number] = [room[0], room[1], room[2] + PATROL_LOCAL_Z];
  const distance = pathDistance(start, path);
  const pickupDistance = pathDistance(start, path.slice(0, 12));
  return { path, distance, cupPickupProgress: Math.min(.94, pickupDistance / distance) };
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

// Antes 3 — se sube para dar sitio a un rótulo de verdad (marco de neón +
// placa de montaje) con margen arriba y abajo, en vez de rozar el techo.
const CAFE_WALL_HEIGHT = 3.7;
const CAFE_WALL_CENTER_Y = CAFE_WALL_HEIGHT / 2;

type CoffeeSchedule = { phase: number; routeDistance: number; cupPickupProgress: number; slotIndex: number };

function CoffeeCup({ presentation = false }: { presentation?: boolean }) {
  const ceramic = presentation ? '#dcecea' : '#eee5d7';
  return <group>
    <mesh castShadow><cylinderGeometry args={[.1,.085,.22,14]} /><meshStandardMaterial color={ceramic} roughness={.55} /></mesh>
    <mesh position={[.11,0,0]} rotation={[Math.PI/2,0,0]}><torusGeometry args={[.065,.018,8,14]} /><meshStandardMaterial color={ceramic} /></mesh>
    <mesh position={[0,.116,0]}><cylinderGeometry args={[.078,.078,.012,14]} /><meshStandardMaterial color="#5b3523" roughness={.9} /></mesh>
  </group>;
}

function RackCoffeeCup({ schedule, position, presentation }: { schedule: CoffeeSchedule; position: [number,number,number]; presentation: boolean }) {
  const cup = useRef<THREE.Group>(null);
  useFrame((state) => {
    const motion = resolveIdleMotion(state.clock.getElapsedTime(), schedule.phase, schedule.routeDistance);
    if (cup.current) cup.current.visible = resolveCoffeePropState(motion, schedule.cupPickupProgress) === 'rack';
  });
  return <group ref={cup} position={position}><CoffeeCup presentation={presentation} /></group>;
}

function DeskCoffeeCup({ position, schedule, presentation }: { position: [number,number,number]; schedule: CoffeeSchedule; presentation: boolean }) {
  const cup = useRef<THREE.Group>(null);
  useFrame((state) => {
    const motion = resolveIdleMotion(state.clock.getElapsedTime(), schedule.phase, schedule.routeDistance);
    if (cup.current) cup.current.visible = resolveCoffeePropState(motion, schedule.cupPickupProgress) === 'desk';
  });
  return <group ref={cup} position={position} visible={false}><CoffeeCup presentation={presentation} /></group>;
}

function CafeSign({ presentation }: { presentation: boolean }) {
  const neon = '#79CBCA';
  const lettering = useMemo(() => {
    if (typeof document === 'undefined') return null;
    const canvas = document.createElement('canvas');
    canvas.width = 1400;
    canvas.height = 220;
    const context = canvas.getContext('2d');
    if (!context) return null;
    context.clearRect(0, 0, canvas.width, canvas.height);
    context.textAlign = 'center';
    context.textBaseline = 'middle';
    context.font = '800 112px Inter, Arial, sans-serif';
    context.letterSpacing = '14px';
    context.shadowColor = neon;
    context.shadowBlur = 34;
    context.fillStyle = '#eafffe';
    context.fillText('ONYXLINK CAFÉ', canvas.width / 2, canvas.height / 2 + 4);
    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.needsUpdate = true;
    return texture;
  }, [neon]);
  useEffect(() => () => lettering?.dispose(), [lettering]);
  return (
    <group position={[0, 2.85, -6.36]}>
      {/* Halo suave detrás de la placa: sin post-procesado no hay bloom de
          verdad, pero un plano emisivo semitransparente algo más grande que
          la placa da la misma sensación de resplandor sobre la pared. */}
      <mesh position={[0, 0, -0.03]}>
        <planeGeometry args={[7.4, 2]} />
        <meshStandardMaterial color={neon} emissive={neon} emissiveIntensity={1} transparent opacity={presentation ? .32 : .22} depthWrite={false} />
      </mesh>
      <mesh castShadow>
        <boxGeometry args={[6.6, 1.5, 0.12]} />
        <meshStandardMaterial color={presentation ? '#0a1716' : '#122120'} metalness={0.4} roughness={0.35} />
      </mesh>
      {/* Marco tipo tubo de neón alrededor del texto. */}
      <mesh position={[0, 0.68, 0.08]}>
        <boxGeometry args={[6.2, 0.06, 0.06]} />
        <meshStandardMaterial color={neon} emissive={neon} emissiveIntensity={presentation ? 2.4 : 1.7} toneMapped={false} />
      </mesh>
      <mesh position={[0, -0.68, 0.08]}>
        <boxGeometry args={[6.2, 0.06, 0.06]} />
        <meshStandardMaterial color={neon} emissive={neon} emissiveIntensity={presentation ? 2.4 : 1.7} toneMapped={false} />
      </mesh>
      <pointLight position={[-1.8, 0, 0.6]} color={neon} intensity={presentation ? 3.2 : 2.2} distance={5.5} decay={2} />
      <pointLight position={[1.8, 0, 0.6]} color={neon} intensity={presentation ? 3.2 : 2.2} distance={5.5} decay={2} />
      {/* A texture on a real scene plane: fixed to the plaque, no DOM
          billboard and no worker/font dependency that can drift on camera. */}
      {lettering && <mesh position={[0, 0, .09]}><planeGeometry args={[5.9, .93]} /><meshBasicMaterial map={lettering} transparent toneMapped={false} depthWrite={false} /></mesh>}
    </group>
  );
}

function CafeLounge({ position, presentation, coffeeSchedules }: { position: [number, number, number]; presentation: boolean; coffeeSchedules: CoffeeSchedule[] }) {
  const wall = presentation ? '#152625' : '#dce5e2';
  return <group position={position}>
    <mesh position={[0,-.06,0]} receiveShadow><boxGeometry args={[16,.12,13]} /><meshStandardMaterial color={presentation ? '#0d1b1a' : '#c9aa7c'} roughness={.7} /></mesh>
    <mesh position={[0,CAFE_WALL_CENTER_Y,-6.5]} castShadow><boxGeometry args={[16,CAFE_WALL_HEIGHT,.18]} /><meshStandardMaterial color={wall} /></mesh>
    <mesh position={[8,CAFE_WALL_CENTER_Y,0]} castShadow><boxGeometry args={[.18,CAFE_WALL_HEIGHT,13]} /><meshStandardMaterial color={wall} /></mesh>
    {[-5, 0, 5].map((z) => <mesh key={z} position={[-8,CAFE_WALL_CENTER_Y,z]} castShadow><boxGeometry args={[.18,CAFE_WALL_HEIGHT,z === 0 ? 3.4 : 3]} /><meshStandardMaterial color={wall} /></mesh>)}
    {[-2.6, 2.6].map((z) => <group key={z} position={[-8,0,z]}><mesh position={[0,2.72,0]} castShadow><boxGeometry args={[.22,.22,2]} /><meshStandardMaterial color="#3D6463" metalness={.48} /></mesh>{[-1,1].map((side)=><mesh key={side} position={[0,1.35,side]} castShadow><boxGeometry args={[.22,2.7,.16]} /><meshStandardMaterial color="#3D6463" metalness={.48} /></mesh>)}</group>)}
    <group position={[2.4,0,-5.4]}>
      <mesh position={[0,.56,0]} castShadow><boxGeometry args={[10,1.12,1.25]} /><meshStandardMaterial color={presentation ? '#263b39' : '#a77b50'} roughness={.48} /></mesh>
      <mesh position={[0,1.16,.48]} castShadow><boxGeometry args={[10.2,.12,1.42]} /><meshStandardMaterial color={presentation ? '#426361' : '#dfc49e'} roughness={.35} /></mesh>
      {[-2.65, -.75].map((x) => <group key={x} position={[x,0,0]}><mesh position={[0,1.62,0]} castShadow><boxGeometry args={[1.15,.82,.72]} /><meshStandardMaterial color="#172322" metalness={.72} roughness={.22} /></mesh><mesh position={[0,1.65,.38]}><circleGeometry args={[.19,24]} /><meshStandardMaterial color="#79CBCA" emissive="#397C7B" emissiveIntensity={1.2} /></mesh></group>)}
      <mesh position={[1.45,1.5,.15]} castShadow><boxGeometry args={[2.3,.52,.75]} /><meshStandardMaterial color="#182625" transparent opacity={.68} /></mesh>
      {Array.from({ length: 12 }, (_, slotIndex) => {
        const position: [number,number,number] = [.45 + (slotIndex % 6) * .43, 1.62 + Math.floor(slotIndex / 6) * .28, .54];
        const schedule = coffeeSchedules.find((item) => item.slotIndex === slotIndex);
        return schedule ? <RackCoffeeCup key={slotIndex} schedule={schedule} presentation={presentation} position={position} /> : <group key={slotIndex} position={position}><CoffeeCup presentation={presentation} /></group>;
      })}
    </group>
    {[[-4.5,-1.5],[2,-1.5],[-4.5,3.4],[2,3.4]].map(([x,z], i) => <group key={i}><CafeTable position={[x,0,z]} presentation={presentation} /><CafeChair position={[x-1.85,0,z]} rotation={Math.PI/2} presentation={presentation} /><CafeChair position={[x+1.85,0,z]} rotation={-Math.PI/2} presentation={presentation} /></group>)}
    <group position={[5.4,0,3.9]}><mesh position={[0,.42,0]} castShadow><boxGeometry args={[3.6,.82,1]} /><meshStandardMaterial color={presentation ? '#24413f' : '#7d8b87'} /></mesh><mesh position={[0,1.02,-.4]} castShadow><boxGeometry args={[3.6,1.2,.16]} /><meshStandardMaterial color={presentation ? '#1a302f' : '#71817d'} /></mesh></group>
    <CafeSign presentation={presentation} />
    {[[-4.5,2.65,-1.5],[2,2.65,-1.5],[-4.5,2.65,3.4],[2,2.65,3.4],[5.5,2.65,0]].map((p,i)=><pointLight key={i} position={p as [number,number,number]} color={i < 4 ? '#ffd8a8' : '#A0DCDB'} intensity={presentation ? 2.6 : 1.8} distance={8} decay={2} />)}
  </group>;
}

export default function Building({ rooms, selectedId, onSelect, onHover, presentation = false, presentationStyle = presentation }: Props) {
  const frontRoomZ = roomCenter(0)[2];
  const corridorZ = frontRoomZ + ROOM_D / 2 + GAP / 2;
  const cafeCenter: [number, number, number] = [BUILDING_WIDTH / 2 + 12, 0, corridorZ];
  const visibleRooms = presentation ? buildPresentationRoomSlots(rooms) : rooms;
  const idleRoutes = visibleRooms.map((_, index) => buildIdleRoute(index, corridorZ, cafeCenter));
  const coffeeSchedules: CoffeeSchedule[] = visibleRooms.flatMap((slot, index) => slot.occupant && slot.occupant.status !== 'working' ? [{ phase: index * 1.3, routeDistance: idleRoutes[index].distance, cupPickupProgress: idleRoutes[index].cupPickupProgress, slotIndex: index }] : []);

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

      <CafeLounge position={cafeCenter} presentation={presentationStyle} coffeeSchedules={coffeeSchedules} />

      {visibleRooms.map((slot, i) => {
        const route = idleRoutes[i];
        return <OfficeRoom
          key={slot.seatId}
          agent={slot.room}
          center={roomCenter(i)}
          occupied={slot.occupant !== null}
          presentation={presentationStyle}
          phase={i * 1.3}
          doorEnabled={slot.occupant !== null && slot.occupant.status !== 'working'}
          routeDistance={route.distance}
        />;
      })}

      {coffeeSchedules.map((schedule) => {
        const room = roomCenter(schedule.slotIndex);
        return <DeskCoffeeCup key={`desk-cup-${schedule.slotIndex}`} schedule={schedule} presentation={presentationStyle} position={[room[0] + .72, .84, room[2] + DESK_LOCAL_Z + .22]} />;
      })}

      {visibleRooms.map((slot, i) => {
        if (!slot.occupant) return null;
        const [x, y, z] = roomCenter(i);
        const isWorking = slot.occupant.status === 'working';
        const route = idleRoutes[i];
        const start: [number, number, number] = [x, y, z + (isWorking ? WORK_CHAIR_LOCAL_Z : PATROL_LOCAL_Z)];
        return (
          <OfficeCharacter
            key={slot.seatId}
            agent={slot.occupant}
            center={start}
            patrolAmplitude={PATROL_AMPLITUDE}
            phase={i * 1.3}
            idlePath={route.path}
            routeDistance={pathDistance(start, route.path)}
            cupPickupProgress={route.cupPickupProgress}
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
