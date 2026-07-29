import { describe, expect, it } from 'vitest';
import { allowCameraModeForViewer, resolveCameraModeForViewer } from './cameraModeAccess';

describe('camera mode access', () => {
  it('starts superadministration in Presentation and lets it restore that view', () => {
    expect(resolveCameraModeForViewer(true, null)).toBe('showcase');
    expect(resolveCameraModeForViewer(true, 'showcase')).toBe('showcase');
  });

  it('never exposes Presentation to a client, even when localStorage remembers it', () => {
    expect(resolveCameraModeForViewer(false, null)).toBe('iso');
    expect(resolveCameraModeForViewer(false, 'showcase')).toBe('iso');
    expect(allowCameraModeForViewer(false, 'showcase')).toBe('iso');
  });

  it('keeps Operative and 2D available to both roles', () => {
    expect(resolveCameraModeForViewer(false, '2d')).toBe('2d');
    expect(allowCameraModeForViewer(false, 'iso')).toBe('iso');
  });
});
