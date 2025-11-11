/**
 * Curve interpolation with Catmull-Rom splines
 *
 * This module provides functions for smooth curve generation using
 * Catmull-Rom spline interpolation. The key feature is `segIndexAt`,
 * which fixes the snap off-by-one bug by mapping sample points to
 * their source control segments.
 *
 * @module core/geometry/curves
 */

import type { Point } from './geometry';

/**
 * Curve interpolation result with segIndexAt mapping
 */
export interface CurvePoints {
  /** Interpolated curve points */
  points: Point[];

  /**
   * Maps each sample point to its source control segment
   *
   * segIndexAt[k] = index of control segment that generated sample k
   *
   * This is critical for correct snapping behavior:
   * - When user drags a point near the curve, we find closest sample
   * - We use segIndexAt to determine which control segment to split
   * - Without this, we get off-by-one errors at segment boundaries
   *
   * Formula: segIndexAt[k] = Math.min(Math.floor((k - 1) / curveSegments), controlPoints.length - 2)
   *
   * @ue_equivalent
   * UPROPERTY() TArray<int32> SegmentIndexMap;
   */
  segIndexAt: number[];
}

/**
 * Constants for curve generation
 */
export const CURVE_CONSTANTS = {
  /** Catmull-Rom spline tension (0.5 = standard centripetal) */
  TENSION: 0.5,

  /** Default number of segments per control segment */
  DEFAULT_SEGMENTS: 50,

  /** Epsilon for numerical stability */
  EPS: 1e-6,
} as const;

/**
 * Generates smooth curve points using Catmull-Rom spline interpolation
 *
 * This function takes control points and generates a smooth curve by:
 * 1. For each pair of adjacent control points (segment)
 * 2. Generate N interpolated samples using cubic Bezier approximation
 * 3. Track which control segment each sample came from (segIndexAt)
 *
 * The result includes the crucial `segIndexAt` array that maps each
 * sample point to its originating control segment, fixing snap bugs.
 *
 * @param controlPoints - Control points defining the curve
 * @param segments - Number of samples per control segment (default: 50)
 * @returns Curve points with segIndexAt mapping
 *
 * @ue_equivalent
 * UFUNCTION(BlueprintCallable)
 * static void GenerateCurvePoints(const TArray<FVector2D>& ControlPoints, int32 SegmentsPerEdge,
 *                                  TArray<FVector2D>& OutPoints, TArray<int32>& OutSegmentMap);
 * // In UE5: Use USplineComponent::GetSplinePointsFromArray with metadata
 */
export function getCurvePoints(
  controlPoints: Point[],
  segments: number = CURVE_CONSTANTS.DEFAULT_SEGMENTS
): CurvePoints {
  // Edge case: less than 2 points
  if (controlPoints.length < 2) {
    return {
      points: [...controlPoints],
      segIndexAt: controlPoints.map((_, i) => Math.max(0, i - 1)),
    };
  }

  const curvePoints: Point[] = [];
  const segIndexAt: number[] = [];
  const tension = CURVE_CONSTANTS.TENSION;
  const numControlSegments = controlPoints.length - 1;

  // For each control segment
  for (let segIdx = 0; segIdx < numControlSegments; segIdx++) {
    // Get four control points for Catmull-Rom
    const p0 = segIdx > 0 ? controlPoints[segIdx - 1] : controlPoints[segIdx];
    const p1 = controlPoints[segIdx];
    const p2 = controlPoints[segIdx + 1];
    const p3 = segIdx < numControlSegments - 1 ? controlPoints[segIdx + 2] : p2;

    // Compute control points for cubic Bezier approximation of Catmull-Rom
    const cp1x = p1.x + ((p2.x - p0.x) / 6) * tension;
    const cp1y = p1.y + ((p2.y - p0.y) / 6) * tension;
    const cp2x = p2.x - ((p3.x - p1.x) / 6) * tension;
    const cp2y = p2.y - ((p3.y - p1.y) / 6) * tension;

    // Add start point for first segment
    if (segIdx === 0) {
      curvePoints.push({ x: p1.x, y: p1.y });
      segIndexAt.push(0);
    }

    // Generate interpolated samples
    for (let t = 1; t <= segments; t++) {
      const step = t / segments;
      const mt = 1 - step;
      const mt2 = mt * mt;
      const mt3 = mt2 * mt;
      const step2 = step * step;
      const step3 = step2 * step;

      // Cubic Bezier interpolation
      const x = mt3 * p1.x + 3 * mt2 * step * cp1x + 3 * mt * step2 * cp2x + step3 * p2.x;
      const y = mt3 * p1.y + 3 * mt2 * step * cp1y + 3 * mt * step2 * cp2y + step3 * p2.y;

      curvePoints.push({ x, y });
      segIndexAt.push(segIdx); // Map this sample to current control segment
    }
  }

  return { points: curvePoints, segIndexAt };
}

/**
 * Finds the closest point on a curve to a given point
 *
 * Returns the index of the closest curve sample point and the distance.
 *
 * @param curve - Curve points
 * @param point - Query point
 * @returns Index of closest point and distance
 *
 * @ue_equivalent
 * UFUNCTION(BlueprintPure)
 * static void FindClosestPointOnCurve(const TArray<FVector2D>& Curve, FVector2D Point,
 *                                      int32& OutIndex, float& OutDistance);
 */
export function findClosestPointOnCurve(
  curve: Point[],
  point: Point
): { index: number; distance: number } {
  let minDist = Infinity;
  let minIndex = 0;

  for (let i = 0; i < curve.length; i++) {
    const dx = curve[i].x - point.x;
    const dy = curve[i].y - point.y;
    const dist = Math.sqrt(dx * dx + dy * dy);

    if (dist < minDist) {
      minDist = dist;
      minIndex = i;
    }
  }

  return { index: minIndex, distance: minDist };
}

/**
 * Gets the control segment index for a given curve sample index
 *
 * This is the core function that fixes the snap bug. Given a sample
 * index on the interpolated curve, it returns which control segment
 * that sample belongs to.
 *
 * @param sampleIndex - Index on interpolated curve
 * @param segIndexAt - Segment mapping array from getCurvePoints
 * @returns Control segment index
 *
 * @ue_equivalent
 * UFUNCTION(BlueprintPure)
 * static int32 GetControlSegmentForSample(int32 SampleIndex, const TArray<int32>& SegmentMap);
 */
export function getControlSegmentIndex(
  sampleIndex: number,
  segIndexAt: number[]
): number {
  if (sampleIndex < 0 || sampleIndex >= segIndexAt.length) {
    return 0;
  }
  return segIndexAt[sampleIndex];
}

/**
 * Samples a curve at a specific parameter t ∈ [0, 1]
 *
 * @param curve - Curve points
 * @param t - Parameter (0 = start, 1 = end)
 * @returns Interpolated point on curve
 *
 * @ue_equivalent
 * UFUNCTION(BlueprintPure)
 * static FVector2D SampleCurveAtDistance(const TArray<FVector2D>& Curve, float NormalizedDistance);
 */
export function sampleCurveAt(curve: Point[], t: number): Point {
  if (curve.length === 0) {
    return { x: 0, y: 0 };
  }
  if (curve.length === 1) {
    return { ...curve[0] };
  }

  // Clamp t to [0, 1]
  t = Math.max(0, Math.min(1, t));

  // Map t to curve index
  const maxIdx = curve.length - 1;
  const floatIdx = t * maxIdx;
  const idx0 = Math.floor(floatIdx);
  const idx1 = Math.min(idx0 + 1, maxIdx);

  // Linear interpolation between adjacent points
  const frac = floatIdx - idx0;
  const p0 = curve[idx0];
  const p1 = curve[idx1];

  return {
    x: p0.x + (p1.x - p0.x) * frac,
    y: p0.y + (p1.y - p0.y) * frac,
  };
}

/**
 * Calculates the arc length of a curve
 *
 * @param curve - Curve points
 * @returns Total arc length
 *
 * @ue_equivalent
 * UFUNCTION(BlueprintPure)
 * static float GetCurveLength(const TArray<FVector2D>& Curve);
 * // In UE5: USplineComponent::GetSplineLength()
 */
export function getCurveLength(curve: Point[]): number {
  if (curve.length < 2) return 0;

  let length = 0;
  for (let i = 1; i < curve.length; i++) {
    const dx = curve[i].x - curve[i - 1].x;
    const dy = curve[i].y - curve[i - 1].y;
    length += Math.sqrt(dx * dx + dy * dy);
  }

  return length;
}
