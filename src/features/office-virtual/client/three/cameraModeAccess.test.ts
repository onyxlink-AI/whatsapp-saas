import { describe, expect, it } from 'vitest';
import { allowCameraModeForViewer, resolveCameraModeForViewer } from './cameraModeAccess';

describe('camera mode access', () => {
  it('starts every role in Presentation and lets it restore that view', () => {
    expect(resolveCameraModeForViewer(true, null)).toBe('showcase');
    expect(resolveCameraModeForViewer(true, 'showcase')).toBe('showcase');
    expect(resolveCameraModeForViewer(false, null)).toBe('showcase');
    expect(resolveCameraModeForViewer(false, 'showcase')).toBe('showcase');
    expect(allowCameraModeForViewer(false, 'showcase')).toBe('showcase');
  });

  it('keeps Operative and 2D available to both roles', () => {
    expect(resolveCameraModeForViewer(false, '2d')).toBe('2d');
    expect(allowCameraModeForViewer(false, 'iso')).toBe('iso');
  });
});
