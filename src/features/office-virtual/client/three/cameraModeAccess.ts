import type { CameraMode } from './OfficeCanvas';

export function resolveCameraModeForViewer(
  isSuperAdmin: boolean,
  savedMode: string | null,
): CameraMode {
  if (savedMode === 'iso' || savedMode === '2d') return savedMode;
  if (isSuperAdmin && savedMode === 'showcase') return 'showcase';
  return isSuperAdmin ? 'showcase' : 'iso';
}

export function allowCameraModeForViewer(
  isSuperAdmin: boolean,
  requestedMode: CameraMode,
): CameraMode {
  return requestedMode === 'showcase' && !isSuperAdmin ? 'iso' : requestedMode;
}
