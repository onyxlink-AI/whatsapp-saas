import type { CameraMode } from './OfficeCanvas';

export function resolveCameraModeForViewer(
  _isSuperAdmin: boolean,
  savedMode: string | null,
): CameraMode {
  if (savedMode === 'showcase' || savedMode === 'iso' || savedMode === '2d') return savedMode;
  return 'showcase';
}

export function allowCameraModeForViewer(
  _isSuperAdmin: boolean,
  requestedMode: CameraMode,
): CameraMode {
  return requestedMode;
}
