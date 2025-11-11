/**
 * Curve interpolation and analysis utilities
 */

import type { Point } from '../models/types';
import { SPLINE_TENSION, DEFAULT_CURVE_SEGMENTS, EPS } from '../constants';

/** Generate smooth curve points using Catmull-Rom spline interpolation */
export const getCurvePoints = (points: Point[], segments: number = DEFAULT_CURVE_SEGMENTS): Point[] => {
  if (points.length < 2) return points;

  const curvePoints: Point[] = [];
  const tension = SPLINE_TENSION;

  for (let i = 0; i < points.length - 1; i++) {
    const p0 = i > 0 ? points[i - 1] : points[i];
    const p1 = points[i];
    const p2 = points[i + 1];
    const p3 = i < points.length - 2 ? points[i + 2] : p2;

    const cp1x = p1.x + ((p2.x - p0.x) / 6) * tension;
    const cp1y = p1.y + ((p2.y - p0.y) / 6) * tension;
    const cp2x = p2.x - ((p3.x - p1.x) / 6) * tension;
    const cp2y = p2.y - ((p3.y - p1.y) / 6) * tension;

    if (i === 0) curvePoints.push({ x: p1.x, y: p1.y });

    for (let t = 1; t <= segments; t++) {
      const step = t / segments;
      const mt = 1 - step;
      const mt2 = mt * mt;
      const mt3 = mt2 * mt;
      const step2 = step * step;
      const step3 = step2 * step;

      const x = mt3 * p1.x + 3 * mt2 * step * cp1x + 3 * mt * step2 * cp2x + step3 * p2.x;
      const y = mt3 * p1.y + 3 * mt2 * step * cp1y + 3 * mt * step2 * cp2y + step3 * p2.y;

      curvePoints.push({ x, y });
    }
  }

  return curvePoints;
};

/** Compute tangent vectors, normals, and curvature along curve */
export const computeCurveFrames = (curve: Point[]) => {
  const n = curve.length;
  const tangents = Array(n)
    .fill(0)
    .map(() => ({ vx: 0, vy: 0 }));
  const normals = Array(n)
    .fill(0)
    .map(() => ({ x: 0, y: 0 }));
  const curvature = Array(n).fill(0);

  for (let i = 0; i < n; i++) {
    const i0 = Math.max(0, i - 1);
    const i1 = Math.min(n - 1, i + 1);

    const a = { x: curve[i].x - curve[i0].x, y: curve[i].y - curve[i0].y };
    const b = { x: curve[i1].x - curve[i].x, y: curve[i1].y - curve[i].y };

    const la = Math.hypot(a.x, a.y) + EPS;
    const lb = Math.hypot(b.x, b.y) + EPS;

    const tx = (curve[i1].x - curve[i0].x) / (la + lb);
    const ty = (curve[i1].y - curve[i0].y) / (la + lb);
    const tl = Math.hypot(tx, ty) + EPS;

    const tnorm = { vx: tx / tl, vy: ty / tl };
    tangents[i] = tnorm;
    normals[i] = { x: -tnorm.vy, y: tnorm.vx };

    curvature[i] = (2 * (a.x * b.y - a.y * b.x)) / (la * lb * Math.hypot(a.x + b.x, a.y + b.y) + EPS);
  }

  return { tangents, normals, curvature };
};
