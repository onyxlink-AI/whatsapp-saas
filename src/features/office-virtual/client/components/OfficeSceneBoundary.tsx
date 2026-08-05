'use client';

import dynamic from 'next/dynamic';
import { useEffect, useState } from 'react';
import { Loader2, MonitorOff, PlayCircle } from 'lucide-react';
import type { CameraMode } from '../three/OfficeCanvas';
import type { OfficeRoomSlot } from '../three/officeRoster';

// Full-bleed 3D "Oficina" scene, loaded lazily so the rest of the SaaS panel
// (dashboard, inbox, pipeline...) never pays for the three.js/@react-three
// bundle. next/dynamic + ssr:false keeps it entirely out of the server
// render and out of the initial client chunk for every other route — it
// only downloads once someone actually opens /oficina-virtual and lands on
// this view. React's normal conditional rendering in OfficeVirtualApp (only
// one view mounted at a time) unmounts this whole subtree — and with it the
// underlying WebGL context and animation loop — the moment the admin
// switches to any other view, so it never keeps consuming GPU/CPU in the
// background.
const OfficeCanvas = dynamic(() => import('../three/OfficeCanvas'), {
  ssr: false,
  loading: () => <SceneStatus icon={<Loader2 className="w-5 h-5 animate-spin" />} title="Cargando la oficina..." />,
});

type Props = {
  rooms: OfficeRoomSlot[];
  selectedId: string | null;
  onSelect: (id: string | null) => void;
  onHover: (id: string | null) => void;
  cameraMode: CameraMode;
};

type SceneAvailability = 'checking' | 'ready' | 'no-webgl' | 'reduced-motion';

function supportsWebGL(): boolean {
  try {
    const canvas = document.createElement('canvas');
    return Boolean(canvas.getContext('webgl2') || canvas.getContext('webgl') || canvas.getContext('experimental-webgl'));
  } catch {
    return false;
  }
}

function SceneStatus({ icon, title, description, action }: { icon: React.ReactNode; title: string; description?: string; action?: React.ReactNode }) {
  return (
    <div className="onyx-scene-status absolute inset-0 flex items-center justify-center">
      <div className="flex flex-col items-center gap-3 text-center px-6 max-w-sm">
        <div className="onyx-scene-status__icon w-11 h-11 rounded-xl flex items-center justify-center">
          {icon}
        </div>
        <div>
          <div className="text-sm font-semibold text-white/90">{title}</div>
          {description && <p className="text-xs text-white/45 mt-1 leading-relaxed">{description}</p>}
        </div>
        {action}
      </div>
    </div>
  );
}

export default function OfficeSceneBoundary({ rooms, selectedId, onSelect, onHover, cameraMode }: Props) {
  const [availability, setAvailability] = useState<SceneAvailability>('checking');
  const [forceEnabled, setForceEnabled] = useState(false);

  useEffect(() => {
    // Feature detection (WebGL, prefers-reduced-motion) only exists in the
    // browser and can't be derived from props/state, so it has no purer
    // home than an effect — there's no DOM/matchMedia access during render.
    const reducedMotion = !forceEnabled && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const next: SceneAvailability = reducedMotion ? 'reduced-motion' : supportsWebGL() ? 'ready' : 'no-webgl';
    // eslint-disable-next-line react-hooks/set-state-in-effect -- see comment above.
    setAvailability(next);
  }, [forceEnabled]);

  if (availability === 'checking') {
    return <SceneStatus icon={<Loader2 className="w-5 h-5 animate-spin" />} title="Preparando la oficina..." />;
  }

  if (availability === 'no-webgl') {
    return (
      <SceneStatus
        icon={<MonitorOff className="w-5 h-5" />}
        title="Este navegador no admite la vista 3D"
        description="La Oficina necesita WebGL. Prueba con un navegador o dispositivo distinto, o usa Panel y Agentes para el mismo estado del equipo sin la escena 3D."
      />
    );
  }

  if (availability === 'reduced-motion') {
    return (
      <SceneStatus
        icon={<MonitorOff className="w-5 h-5" />}
        title="Movimiento reducido activado"
        description="Tu sistema pide reducir el movimiento, así que la oficina animada no se carga por defecto. Panel y Agentes muestran el mismo estado del equipo sin animación."
        action={
          <button
            onClick={() => setForceEnabled(true)}
            className="onyx-office-hud__action mt-1"
          >
            <PlayCircle className="w-3.5 h-3.5" />
            Ver la oficina de todas formas
          </button>
        }
      />
    );
  }

  return <OfficeCanvas rooms={rooms} selectedId={selectedId} onSelect={onSelect} onHover={onHover} cameraMode={cameraMode} />;
}
