import { ContactShadows, OrbitControls } from '@react-three/drei';
import { Canvas, useThree } from '@react-three/fiber';
import { Suspense, useEffect } from 'react';
import * as THREE from 'three';
import Building from './Building';
import type { OfficeRoomSlot } from './officeRoster';

export type CameraMode = 'showcase' | 'iso' | '2d';

type Props = {
  rooms: OfficeRoomSlot[];
  selectedId: string | null;
  onSelect: (id: string | null) => void;
  onHover: (id: string | null) => void;
  cameraMode: CameraMode;
};

function ResponsiveCamera({ cameraMode }: { cameraMode: CameraMode }) {
  const { camera, gl, size } = useThree();

  useEffect(() => {
    const portrait = size.width < 640 && size.height > size.width;
    const target: [number, number, number] =
      cameraMode === 'showcase' ? [0, 0.8, 0] : [0, 1.35, portrait ? 2.4 : 3.2];

    if (cameraMode === '2d') {
      camera.position.set(0, portrait ? 68 : 54, portrait ? 8 : 12);
    } else if (cameraMode === 'showcase') {
      // Locked cinematic framing inspired by a premium operations dashboard.
      // The original interactive isometric and top-down cameras stay intact.
      camera.position.set(0, portrait ? 48 : 32, portrait ? 55 : 42);
    } else {
      // Portrait screens need a closer and more vertical profile. The old
      // long-distance framing kept every edge visible but made rooms, desks
      // and people too small to understand on a phone.
      camera.position.set(0, portrait ? 46 : 20, portrait ? 58 : 32);
    }
    camera.lookAt(...target);

    if (camera instanceof THREE.PerspectiveCamera) {
      // react-three-fiber's camera is an imperative Three.js object, not
      // React state — mutating it directly (fov, then updateProjectionMatrix)
      // is the standard r3f pattern, same as the position.set/lookAt calls above.
      // eslint-disable-next-line react-hooks/immutability
      camera.fov =
        cameraMode === 'showcase' ? (portrait ? 46 : 38) : portrait ? 46 : 40;
      camera.updateProjectionMatrix();
    }

    // Filmic tone mapping gives the dark materials readable mid-tones while
    // keeping the violet screens and LED strips from looking flat or clipped.
    // eslint-disable-next-line react-hooks/immutability
    gl.toneMapping = THREE.ACESFilmicToneMapping;
    gl.toneMappingExposure = cameraMode === '2d' ? 1 : 1.32;
  }, [camera, gl, size.width, size.height, cameraMode]);

  return null;
}

export default function OfficeCanvas({ rooms, selectedId, onSelect, onHover, cameraMode }: Props) {
  const isIso = cameraMode === 'iso';
  const isShowcase = cameraMode === 'showcase';
  const hasPresentationStyle = isShowcase || isIso;
  const background = hasPresentationStyle ? '#041010' : '#dfe3e1';
  const controlsTarget: [number, number, number] = isShowcase
    ? [0, 0.8, 0]
    : [0, 1.35, 3.2];

  return (
    <Canvas
      dpr={[1, 1.5]}
      shadows
      camera={{ position: [0, 20, 32], fov: 40 }}
      style={{ touchAction: 'none' }}
      onPointerMissed={() => onSelect(null)}
    >
      <color attach="background" args={[background]} />
      {/* far must clear every camera-to-target distance this scene actually
          uses, including narrow-viewport iso (~98) and 2d (~101) framing
          and OrbitControls' maxDistance (115) — at the previous far of 105,
          narrow/mobile screens rendered a fully fogged, empty-looking scene
          (real bug, reproduced in the original Agencia IA app too). */}
      <fog
        attach="fog"
        args={hasPresentationStyle ? ['#041010', 42, 118] : ['#dfe3e1', 48, 170]}
      />

      <ambientLight
        intensity={hasPresentationStyle ? 1.05 : 1.56}
        color={hasPresentationStyle ? '#DFF3F3' : '#fffdf5'}
      />
      <hemisphereLight
        args={
          hasPresentationStyle
            ? ['#A0DCDB', '#071414', 1.02]
            : ['#e9f4f5', '#b8aa92', 0.88]
        }
      />
      <directionalLight
        position={[8, 16, 12]}
        intensity={hasPresentationStyle ? 2.85 : 2.65}
        color={hasPresentationStyle ? '#DFF3F3' : '#fff4d8'}
        castShadow
        shadow-mapSize={[2048, 2048]}
        shadow-camera-left={-18}
        shadow-camera-right={18}
        shadow-camera-top={16}
        shadow-camera-bottom={-14}
      />
      <directionalLight
        position={[-10, 10, -6]}
        intensity={hasPresentationStyle ? 1.65 : 1.05}
        color={hasPresentationStyle ? '#8AD3D2' : '#cbe2e5'}
      />
      <pointLight
        position={[0, 9, 5]}
        intensity={hasPresentationStyle ? 4.35 : 1.15}
        color={hasPresentationStyle ? '#79CBCA' : '#fff8df'}
        distance={hasPresentationStyle ? 52 : 34}
        decay={2}
      />
      {hasPresentationStyle && (
        <>
          <pointLight position={[-16, 5, -8]} intensity={2.8} color="#5AA9A8" distance={34} decay={2} />
          <pointLight position={[16, 5, 8]} intensity={2.6} color="#A0DCDB" distance={34} decay={2} />
        </>
      )}

      <Suspense fallback={null}>
        <ResponsiveCamera cameraMode={cameraMode} />
        <Building
          rooms={rooms}
          selectedId={selectedId}
          onSelect={onSelect}
          onHover={onHover}
          presentation={isShowcase}
          presentationStyle={hasPresentationStyle}
        />
        <ContactShadows
          position={[0, -0.12, 4]}
          opacity={hasPresentationStyle ? 0.58 : 0.24}
          scale={38}
          blur={hasPresentationStyle ? 2 : 2.8}
          far={18}
          color={hasPresentationStyle ? '#000000' : '#2b3633'}
        />
      </Suspense>

      <OrbitControls
        enablePan={false}
        enableRotate={isIso || isShowcase}
        minDistance={16}
        maxDistance={115}
        minPolarAngle={isIso ? Math.PI / 6 : isShowcase ? Math.PI / 5 : 0.08}
        maxPolarAngle={isIso ? Math.PI / 2.3 : isShowcase ? Math.PI / 2.12 : 0.08}
        target={controlsTarget}
        enableDamping
        dampingFactor={0.08}
        rotateSpeed={isShowcase ? 0.5 : 1}
        zoomSpeed={isShowcase ? 0.72 : 1}
      />
    </Canvas>
  );
}
