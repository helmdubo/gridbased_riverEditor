/**
 * Geometry utilities for river editor
 */

import type { Point } from '../models/types';

/** Clamp value between 0 and 1 */
export const clamp01 = (v: number): number => Math.max(0, Math.min(1, v));

/** Calculate distance between two points */
export const distance = (p1: Point, p2: Point): number => {
  return Math.hypot(p2.x - p1.x, p2.y - p1.y);
};

/** Calculate squared distance between two points (faster than distance) */
export const distanceSquared = (p1: Point, p2: Point): number => {
  const dx = p2.x - p1.x;
  const dy = p2.y - p1.y;
  return dx * dx + dy * dy;
};

/** Calculate distance from point to line segment */
export const distanceToSegment = (
  px: number,
  py: number,
  x1: number,
  y1: number,
  x2: number,
  y2: number
): number => {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const len2 = dx * dx + dy * dy;

  if (len2 === 0) {
    return Math.hypot(px - x1, py - y1);
  }

  let t = ((px - x1) * dx + (py - y1) * dy) / len2;
  t = Math.max(0, Math.min(1, t));

  const projX = x1 + t * dx;
  const projY = y1 + t * dy;

  return Math.hypot(px - projX, py - projY);
};

/** Calculate distance from point to curve */
export const distanceToCurve = (px: number, py: number, curvePoints: Point[]): number => {
  if (curvePoints.length < 2) return Infinity;

  let minDistSq = Infinity;
  for (let i = 0; i < curvePoints.length - 1; i++) {
    const p1 = curvePoints[i];
    const p2 = curvePoints[i + 1];
    const dx = p2.x - p1.x;
    const dy = p2.y - p1.y;
    const len2 = dx * dx + dy * dy;

    if (len2 === 0) {
      const distSq = (px - p1.x) ** 2 + (py - p1.y) ** 2;
      if (distSq < minDistSq) minDistSq = distSq;
      continue;
    }

    let t = ((px - p1.x) * dx + (py - p1.y) * dy) / len2;
    t = Math.max(0, Math.min(1, t));

    const projX = p1.x + t * dx;
    const projY = p1.y + t * dy;
    const distSq = (px - projX) ** 2 + (py - projY) ** 2;

    if (distSq < minDistSq) minDistSq = distSq;
  }

  return Math.sqrt(minDistSq);
};

/** Find closest point on spline to given coordinates */
export const findClosestPointOnSpline = (
  splinePoints: Point[],
  x: number,
  y: number
): { segmentIndex: number; t: number; point: Point; distance: number } | null => {
  if (splinePoints.length < 2) return null;

  let bestSegment = 0;
  let bestT = 0;
  let bestPoint = { x: splinePoints[0].x, y: splinePoints[0].y };
  let bestDist = Infinity;

  for (let i = 0; i < splinePoints.length - 1; i++) {
    const p1 = splinePoints[i];
    const p2 = splinePoints[i + 1];
    const dx = p2.x - p1.x;
    const dy = p2.y - p1.y;
    const len2 = dx * dx + dy * dy;

    if (len2 === 0) continue;

    let t = ((x - p1.x) * dx + (y - p1.y) * dy) / len2;
    t = Math.max(0, Math.min(1, t));

    const projX = p1.x + t * dx;
    const projY = p1.y + t * dy;
    const dist = Math.sqrt((x - projX) ** 2 + (y - projY) ** 2);

    if (dist < bestDist) {
      bestDist = dist;
      bestSegment = i;
      bestT = t;
      bestPoint = { x: projX, y: projY };
    }
  }

  return { segmentIndex: bestSegment, t: bestT, point: bestPoint, distance: bestDist };
};

/** Find nearest point on curve to given coordinates */
export const nearestCurveIndex = (curve: Point[], x: number, y: number): number => {
  let best = 0;
  let bestD2 = Infinity;
  for (let i = 0; i < curve.length; i++) {
    const d2 = (x - curve[i].x) ** 2 + (y - curve[i].y) ** 2;
    if (d2 < bestD2) {
      bestD2 = d2;
      best = i;
    }
  }
  return best;
};

/** Generate unique ID */
export const generateId = (): string => Math.random().toString(36).substr(2, 9);
