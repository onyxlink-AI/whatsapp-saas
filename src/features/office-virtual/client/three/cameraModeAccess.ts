import type { CameraMode } from './OfficeCanvas';

export function resolveCameraModeForViewer(
  canUsePresentation: boolean,
  savedMode: string | null,
): CameraMode {
  if (savedMode === 'showcase') return canUsePresentation ? 'showcase' : 'iso';
  if (savedMode === 'iso' || savedMode === '2d') return savedMode;
  return canUsePresentation ? 'showcase' : 'iso';
}

export function allowCameraModeForViewer(
  canUsePresentation: boolean,
  requestedMode: CameraMode,
): CameraMode {
  if (requestedMode === 'showcase' && !canUsePresentation) return 'iso';
  return requestedMode;
}
