import { describe, expect, test } from 'bun:test';
import { edgePanStep, edgePans } from '@/lib/whiteboard/edgePan';

const size = { width: 800, height: 600 };

describe('edgePanStep', () => {
  test('away from the edges the camera stays', () => {
    expect(edgePanStep({ x: 400, y: 300 }, size)).toEqual({ x: 0, y: 0 });
  });
  test('held at an edge the camera moves to show what lies past it', () => {
    expect(edgePanStep({ x: 799, y: 300 }, size).x).toBeLessThan(0);
    expect(edgePanStep({ x: 1, y: 300 }, size).x).toBeGreaterThan(0);
    expect(edgePanStep({ x: 400, y: 599 }, size).y).toBeLessThan(0);
    expect(edgePanStep({ x: 400, y: 1 }, size).y).toBeGreaterThan(0);
  });
  test('deeper in the band is faster, and past the edge is the fastest', () => {
    const shallow = -edgePanStep({ x: 760, y: 300 }, size).x, deep = -edgePanStep({ x: 795, y: 300 }, size).x;
    expect(deep).toBeGreaterThan(shallow);
    expect(edgePanStep({ x: 2000, y: 300 }, size).x).toBe(-16);
  });
  test('a corner pans on both axes', () => {
    expect(edgePanStep({ x: -10, y: 700 }, size)).toEqual({ x: 16, y: -16 });
  });
  test('an unlaid canvas never pans', () => {
    expect(edgePanStep({ x: 0, y: 0 }, { width: 0, height: 0 })).toEqual({ x: 0, y: 0 });
  });
});

describe('edgePans', () => {
  test('drags that follow the pointer pan with a mouse or a pen', () => {
    for (const mode of ['draw', 'move', 'resize', 'point', 'segment', 'marquee', 'lasso']) {
      expect(edgePans(mode, 'mouse', false)).toBe(true);
      expect(edgePans(mode, 'pen', false)).toBe(true);
    }
  });
  test('touch, a pan, an erase and a crop confirmation never do', () => {
    expect(edgePans('move', 'touch', false)).toBe(false);
    for (const mode of ['pan', 'erase', 'crop-confirm', 'write']) expect(edgePans(mode, 'mouse', false)).toBe(false);
  });
  test('ink pans with a mouse, never with a pen', () => {
    expect(edgePans('draw', 'mouse', true)).toBe(true);
    expect(edgePans('draw', 'pen', true)).toBe(false);
  });
});
