/**
 * Frenet frame computation for curves
 *
 * This module computes the Frenet frame (tangent, normal, curvature)
 * along a curve. These are essential for:
 * - Flow field generation (flow follows tangents)
 * - River width calculation (measured along normals)
 * - Speed modulation based on curvature
 *
 * @module core/geometry/frames
 */

import type { Point } from './geometry';
import { CURVE_CONSTANTS } from './curves';

/**
 * Tangent vector (normalized direction along curve)
 */
export interface Tangent {
  vx: number;
  vy: number;
}

/**
 * Normal vector (perpendicular to tangent, points left)
 */
export interface Normal {
  x: number;
  y: number;
}

/**
 * Complete Frenet frame at each curve point
 */
export interface CurveFrames {
  /** Tangent vectors (normalized) */
  tangents: Tangent[];

  /** Normal vectors (perpendicular to tangents) */
  normals: Normal[];

  /** Curvature values (1/radius of osculating circle) */
  curvature: number[];
}

/**
 * Computes tangent vectors along a curve
 *
 * For each point on the curve, computes the normalized direction vector.
 * Uses central differences for interior points, forward/backward for endpoints.
 *
 * @param points - Curve points
 * @returns Array of normalized tangent vectors
 *
 * @ue_equivalent
 * UFUNCTION(BlueprintCallable)
 * static void ComputeTangents(const TArray<FVector2D>& Points, TArray<FVector2D>& OutTangents);
 * // In UE5: USplineComponent::GetTangentAtSplinePoint()
 */
export function computeTangents(points: Point[]): Tangent[] {
  const n = points.length;
  const tangents: Tangent[] = [];

  if (n === 0) return tangents;
  if (n === 1) return [{ vx: 1, vy: 0 }];

  const eps = CURVE_CONSTANTS.EPS;

  for (let i = 0; i < n; i++) {
    // Use neighbors for central difference
    const i0 = Math.max(0, i - 1);
    const i1 = Math.min(n - 1, i + 1);

    // Vectors to neighbors
    const a = {
      x: points[i].x - points[i0].x,
      y: points[i].y - points[i0].y,
    };
    const b = {
      x: points[i1].x - points[i].x,
      y: points[i1].y - points[i].y,
    };

    // Lengths
    const la = Math.hypot(a.x, a.y) + eps;
    const lb = Math.hypot(b.x, b.y) + eps;

    // Average direction (weighted by distances)
    const tx = (points[i1].x - points[i0].x) / (la + lb);
    const ty = (points[i1].y - points[i0].y) / (la + lb);

    // Normalize
    const tl = Math.hypot(tx, ty) + eps;
    tangents.push({
      vx: tx / tl,
      vy: ty / tl,
    });
  }

  return tangents;
}

/**
 * Computes normal vectors from tangent vectors
 *
 * Normal is perpendicular to tangent, rotated 90° counter-clockwise.
 * For a tangent (tx, ty), the normal is (-ty, tx).
 *
 * @param tangents - Tangent vectors
 * @returns Array of normal vectors
 *
 * @ue_equivalent
 * UFUNCTION(BlueprintCallable)
 * static void ComputeNormals(const TArray<FVector2D>& Tangents, TArray<FVector2D>& OutNormals);
 */
export function computeNormals(tangents: Tangent[]): Normal[] {
  return tangents.map((t) => ({
    x: -t.vy,
    y: t.vx,
  }));
}

/**
 * Computes curvature along a curve
 *
 * Curvature κ is the rate of change of tangent direction with respect to arc length.
 * Geometrically, κ = 1/R where R is the radius of the osculating circle.
 *
 * High curvature (tight turns) → flow is slower
 * Low curvature (straight) → flow is faster
 *
 * @param points - Curve points
 * @returns Array of curvature values (1/radius)
 *
 * @ue_equivalent
 * UFUNCTION(BlueprintCallable)
 * static void ComputeCurvature(const TArray<FVector2D>& Points, TArray<float>& OutCurvature);
 * // In UE5: Can be computed from USplineComponent tangents
 */
export function computeCurvature(points: Point[]): number[] {
  const n = points.length;
  const curvature: number[] = [];

  if (n < 3) {
    // Need at least 3 points to compute curvature
    return Array(n).fill(0);
  }

  const eps = CURVE_CONSTANTS.EPS;

  for (let i = 0; i < n; i++) {
    const i0 = Math.max(0, i - 1);
    const i1 = Math.min(n - 1, i + 1);

    // Vectors to neighbors
    const a = {
      x: points[i].x - points[i0].x,
      y: points[i].y - points[i0].y,
    };
    const b = {
      x: points[i1].x - points[i].x,
      y: points[i1].y - points[i].y,
    };

    // Lengths
    const la = Math.hypot(a.x, a.y) + eps;
    const lb = Math.hypot(b.x, b.y) + eps;

    // Curvature formula: κ = 2 * |a × b| / (|a| * |b| * |a + b|)
    const cross = a.x * b.y - a.y * b.x;
    const sumLen = Math.hypot(a.x + b.x, a.y + b.y) + eps;

    const curv = (2 * cross) / (la * lb * sumLen + eps);
    curvature.push(curv);
  }

  return curvature;
}

/**
 * Computes complete Frenet frames along a curve
 *
 * This is a convenience function that computes tangents, normals,
 * and curvature in a single call.
 *
 * @param points - Curve points
 * @returns Complete Frenet frames
 *
 * @ue_equivalent
 * UFUNCTION(BlueprintCallable)
 * static void ComputeFrenetFrames(const TArray<FVector2D>& Points,
 *                                  TArray<FVector2D>& OutTangents,
 *                                  TArray<FVector2D>& OutNormals,
 *                                  TArray<float>& OutCurvature);
 */
export function computeFrames(points: Point[]): CurveFrames {
  const tangents = computeTangents(points);
  const normals = computeNormals(tangents);
  const curvature = computeCurvature(points);

  return {
    tangents,
    normals,
    curvature,
  };
}

/**
 * Gets tangent at a specific point index
 *
 * @param frames - Frenet frames
 * @param index - Point index
 * @returns Tangent vector at index
 */
export function getTangentAt(frames: CurveFrames, index: number): Tangent {
  if (index < 0 || index >= frames.tangents.length) {
    return { vx: 1, vy: 0 };
  }
  return frames.tangents[index];
}

/**
 * Gets normal at a specific point index
 *
 * @param frames - Frenet frames
 * @param index - Point index
 * @returns Normal vector at index
 */
export function getNormalAt(frames: CurveFrames, index: number): Normal {
  if (index < 0 || index >= frames.normals.length) {
    return { x: 0, y: 1 };
  }
  return frames.normals[index];
}

/**
 * Gets curvature at a specific point index
 *
 * @param frames - Frenet frames
 * @param index - Point index
 * @returns Curvature value at index
 */
export function getCurvatureAt(frames: CurveFrames, index: number): number {
  if (index < 0 || index >= frames.curvature.length) {
    return 0;
  }
  return frames.curvature[index];
}
