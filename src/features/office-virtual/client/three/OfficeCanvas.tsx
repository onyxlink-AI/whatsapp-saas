import { ContactShadows, OrbitControls } from '@react-three/drei';
import { Canvas, useThree } from '@react-three/fiber';
import { Suspense, useEffect } from 'react';
import * as THREE from 'three';
import type { Agent } from '../types';
import Building from './Building';

export type CameraMode = 'iso' | '2d';

type Props = {
  agents: Agent[];
  selectedId: string | null;
  onSelect: (id: string | null) => void;
  onHover: (id: string | null) => void;
  cameraMode: CameraMode;
};

function ResponsiveCamera({ cameraMode }: { cameraMode: CameraMode }) {
  const { camera, size } = useThree();

  useEffect(() => {
    const narrow = size.width < 640;

    if (cameraMode === '2d') {
      camera.position.set(0, narrow ? 102 : 46, narrow ? 14 : 10);
    } else {
      // Portrait screens need a steeper angle. The previous low angle kept
      // the full width visible but compressed the office depth into a thin
      // strip, making rooms and characters difficult to read on mobile.
      camera.position.set(0, narrow ? 62 : 16, narrow ? 78 : 26);
    }
    camera.lookAt(0, 1.35, 3.2);

    if (camera instanceof THREE.PerspectiveCamera) {
      // react-three-fiber's camera is an imperative Three.js object, not
      // React state — mutating it directly (fov, then updateProjectionMatrix)
      // is the standard r3f pattern, same as the position.set/lookAt calls above.
      // eslint-disable-next-line react-hooks/immutability
      camera.fov = narrow ? 43 : 40;
      camera.updateProjectionMatrix();
    }
  }, [camera, size.width, cameraMode]);

  return null;
}

export default function OfficeCanvas({ agents, selectedId, onSelect, onHover, cameraMode }: Props) {
  const isIso = cameraMode === 'iso';

  return (
    <Canvas
      shadows
      camera={{ position: [0, 16, 26], fov: 40 }}
      onPointerMissed={() => onSelect(null)}
    >
      <color attach="background" args={['#dfe3e1']} />
      {/* far must clear every camera-to-target distance this scene actually
          uses, including narrow-viewport iso (~98) and 2d (~101) framing
          and OrbitControls' maxDistance (115) — at the previous far of 105,
          narrow/mobile screens rendered a fully fogged, empty-looking scene
          (real bug, reproduced in the original Agencia IA app too). */}
      <fog attach="fog" args={['#dfe3e1', 48, 170]} />

      <ambientLight intensity={1.56} color="#fffdf5" />
      <hemisphereLight args={['#e9f4f5', '#b8aa92', 0.88]} />
      <directionalLight
        position={[8, 16, 12]}
        intensity={2.65}
        color="#fff4d8"
        castShadow
        shadow-mapSize={[2048, 2048]}
        shadow-camera-left={-18}
        shadow-camera-right={18}
        shadow-camera-top={16}
        shadow-camera-bottom={-14}
      />
      <directionalLight position={[-10, 10, -6]} intensity={1.05} color="#cbe2e5" />
      <pointLight position={[0, 9, 5]} intensity={1.15} color="#fff8df" distance={34} decay={2} />

      <Suspense fallback={null}>
        <ResponsiveCamera cameraMode={cameraMode} />
        <Building agents={agents} selectedId={selectedId} onSelect={onSelect} onHover={onHover} />
        <ContactShadows position={[0, -0.12, 4]} opacity={0.24} scale={38} blur={2.8} far={18} />
      </Suspense>

      <OrbitControls
        enablePan={false}
        enableRotate={isIso}
        minDistance={16}
        maxDistance={115}
        minPolarAngle={isIso ? Math.PI / 6 : 0.08}
        maxPolarAngle={isIso ? Math.PI / 2.3 : 0.08}
        target={[0, 1.35, 3.2]}
        enableDamping
        dampingFactor={0.08}
      />
    </Canvas>
  );
}
