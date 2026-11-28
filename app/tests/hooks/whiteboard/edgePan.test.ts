import { describe, expect, test } from 'bun:test';
import { createWhiteboardDocument, type WhiteboardElement } from '@/lib/whiteboard/model';
import { createHarness, pointer, type Harness } from './harness';

const shape: WhiteboardElement = { id: 'shape', type: 'rectangle', x: 100, y: 100, width: 40, height: 30, stroke: '#000', fill: '#ffffff', strokeWidth: 2, style: 'clean', seed: 1 };
const size = { width: 400, height: 300 };
const view = (h: Harness) => h.editor.documentRef.current.viewport;
function setup(elements: WhiteboardElement[] = []) {
  const h = createHarness({ size });
  h.render({ ...createWhiteboardDocument(), elements });
  return h;
}
/** Runs `count` frames of everything pending: edge-pan ticks and redraws. */
function frames(h: Harness, count: number) { for (let index = 0; index < count; index++) h.frame(); }

describe('a drag held at the canvas edge pans the camera', () => {
  test('a moved shape keeps under the still pointer while the camera pans, and the camera is saved on release', () => {
    const h = setup([shape]);
    h.editor.setTool('select'); h.render();
    h.editor.pointerDown(pointer(1, 'mouse', 120, 115));
    h.editor.pointerMove(pointer(1, 'mouse', 399, 115, { buttons: 1 }));
    frames(h, 10);
    const camera = view(h);
    expect(camera.x).toBeLessThan(-100);
    expect(camera.y).toBe(0);
    h.editor.pointerUp(pointer(1, 'mouse', 399, 115));
    h.render();
    // The pointer's world point moved by its screen travel plus the camera's.
    expect(h.editor.documentRef.current.elements[0]).toMatchObject({ x: 100 + 279 - camera.x, y: 100 });
    expect(h.published.at(-1)!.viewport).toEqual(camera);
    frames(h, 5);
    expect(view(h)).toEqual(camera);
  });
  test('the pan stops once the pointer leaves the band', () => {
    const h = setup();
    h.editor.setTool('select'); h.render();
    h.editor.pointerDown(pointer(1, 'mouse', 200, 150));
    h.editor.pointerMove(pointer(1, 'mouse', 200, 299, { buttons: 1 }));
    frames(h, 3);
    const camera = view(h);
    expect(camera.y).toBeLessThan(0);
    h.editor.pointerMove(pointer(1, 'mouse', 200, 200, { buttons: 1 }));
    frames(h, 5);
    expect(view(h)).toEqual(camera);
  });
  test('a mouse draws a shape past the edge; nothing pans before the drag passes its threshold', () => {
    const h = setup();
    h.editor.setTool('rectangle'); h.render();
    h.editor.pointerDown(pointer(1, 'mouse', 1, 150));
    frames(h, 5);
    expect(view(h).x).toBe(0);
    h.editor.pointerMove(pointer(1, 'mouse', 399, 150, { buttons: 1 }));
    frames(h, 5);
    const camera = view(h);
    h.editor.pointerUp(pointer(1, 'mouse', 399, 150));
    expect(h.editor.documentRef.current.elements[0]).toMatchObject({ x: 1, width: 398 - camera.x });
  });
  test('touch and pen ink never pan; mouse ink does', () => {
    for (const type of ['touch', 'pen']) {
      const h = setup();
      h.editor.setTool('freedraw'); h.render();
      h.editor.pointerDown(pointer(1, type, 200, 150, { buttons: 1 }));
      h.editor.pointerMove(pointer(1, type, 399, 150, { buttons: 1 }));
      frames(h, 5);
      expect(view(h)).toEqual({ x: 0, y: 0, zoom: 1 });
    }
    const h = setup();
    h.editor.setTool('freedraw'); h.render();
    h.editor.pointerDown(pointer(1, 'mouse', 200, 150, { buttons: 1 }));
    h.editor.pointerMove(pointer(1, 'mouse', 399, 150, { buttons: 1 }));
    frames(h, 5);
    expect(view(h).x).toBeLessThan(0);
    h.editor.pointerUp(pointer(1, 'mouse', 399, 150));
    const stroke = h.editor.documentRef.current.elements[0];
    expect(stroke.points!.at(-1)!.x).toBe(199 - view(h).x);
  });
  test('Escape mid-pan drops the preview and leaves the camera where it panned to', () => {
    const h = setup();
    h.editor.setTool('select'); h.render();
    h.editor.pointerDown(pointer(1, 'mouse', 200, 150));
    h.editor.pointerMove(pointer(1, 'mouse', 0, 150, { buttons: 1 }));
    frames(h, 3);
    const camera = view(h);
    expect(camera.x).toBeGreaterThan(0);
    h.editor.pointerCancel(pointer(1, 'mouse', 0, 150));
    frames(h, 3);
    expect(view(h)).toEqual(camera);
    expect(h.published.at(-1)!.viewport).toEqual(camera);
  });
});
