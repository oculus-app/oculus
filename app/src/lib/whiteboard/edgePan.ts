/**
 * The camera follows a drag held at the canvas's edge: each frame it moves towards that edge on the same curve as
 * a list's edge scroll (`edgeSpeed`), and the gesture is re-applied under the still pointer.
 */
import { edgeSpeed } from '@/hooks/gestures/edgeScroll';
import type { Point } from './model';

/** Gesture modes whose drag follows the pointer in world space, so panning under them extends the drag. */
const PANNING = new Set(['draw', 'move', 'resize', 'point', 'segment', 'marquee', 'lasso', 'capture', 'crop', 'capture-copy']);

/**
 * Whether a gesture pans at the edge. Touch never does: a finger's gesture becomes two-finger navigation instead.
 * Pen ink never does either: writing into a page's margin is ordinary on a tablet, and the page must stay put under
 * the nib. Erasing never does, so it only ever erases where the eraser actually passed.
 */
export function edgePans(mode: string, pointerType: string, ink: boolean): boolean {
  if (pointerType === 'touch' || !PANNING.has(mode)) return false;
  return !(ink && pointerType === 'pen');
}

/**
 * The camera's move this frame, in screen pixels to add to the viewport's x and y, for a pointer at `screen` on a
 * canvas `size`: towards the edge it is held at, or {0, 0} away from the edges.
 */
export function edgePanStep(screen: Point, size: { width: number; height: number }): Point {
  return { x: -edgeSpeed(screen.x, 0, size.width) || 0, y: -edgeSpeed(screen.y, 0, size.height) || 0 };
}
