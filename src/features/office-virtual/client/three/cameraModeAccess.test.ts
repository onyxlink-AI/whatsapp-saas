import { describe, expect, it } from 'vitest';
import { allowCameraModeForViewer, resolveCameraModeForViewer } from './cameraModeAccess';

describe('camera mode access', () => {
  it('starts presentation viewers in the complete showroom', () => {
    expect(resolveCameraModeForViewer(true, null)).toBe('showcase');
    expect(resolveCameraModeForViewer(true, 'showcase')).toBe('showcase');
  });

  it('keeps operational viewers on the real roster', () => {
    expect(resolveCameraModeForViewer(false, null)).toBe('iso');
    expect(resolveCameraModeForViewer(false, 'showcase')).toBe('iso');
    expect(allowCameraModeForViewer(false, 'showcase')).toBe('iso');
  });

  it('keeps Operative and 2D available to both roles', () => {
    expect(resolveCameraModeForViewer(false, '2d')).toBe('2d');
    expect(allowCameraModeForViewer(false, 'iso')).toBe('iso');
  });
});
