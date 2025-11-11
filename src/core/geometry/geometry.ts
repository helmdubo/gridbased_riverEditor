/**
 * Basic geometry utilities
 *
 * Pure mathematical functions for 2D geometry operations.
 * All functions are stateless and have no side effects.
 *
 * @module core/geometry/geometry
 */

/**
 * 2D point or vector
 */
export interface Point {
  x: number;
  y: number;
}

/**
 * 2D vector (same as Point, but semantically different)
 */
export interface Vector2D {
  x: number;
  y: number;
}

/**
 * Calculates Euclidean distance between two points
 *
 * @param p1 - First point
 * @param p2 - Second point
 * @returns Distance between points
 *
 * @ue_equivalent
 * UFUNCTION(BlueprintPure)
 * static float Distance2D(FVector2D A, FVector2D B);
 * // In UE5: FVector2D::Distance(A, B)
 */
export function distance(p1: Point, p2: Point): number {
  const dx = p2.x - p1.x;
  const dy = p2.y - p1.y;
  return Math.sqrt(dx * dx + dy * dy);
}

/**
 * Calculates squared distance between two points (faster, avoids sqrt)
 *
 * Useful for distance comparisons where you don't need the actual distance value.
 *
 * @param p1 - First point
 * @param p2 - Second point
 * @returns Squared distance between points
 *
 * @ue_equivalent
 * UFUNCTION(BlueprintPure)
 * static float DistanceSquared2D(FVector2D A, FVector2D B);
 * // In UE5: FVector2D::DistSquared(A, B)
 */
export function distanceSquared(p1: Point, p2: Point): number {
  const dx = p2.x - p1.x;
  const dy = p2.y - p1.y;
  return dx * dx + dy * dy;
}

/**
 * Calculates the shortest distance from a point to a line segment
 *
 * @param px - Point X coordinate
 * @param py - Point Y coordinate
 * @param x1 - Segment start X
 * @param y1 - Segment start Y
 * @param x2 - Segment end X
 * @param y2 - Segment end Y
 * @returns Shortest distance from point to segment
 *
 * @ue_equivalent
 * UFUNCTION(BlueprintPure)
 * static float DistanceToSegment(FVector2D Point, FVector2D SegmentStart, FVector2D SegmentEnd);
 */
export function distanceToSegment(
  px: number,
  py: number,
  x1: number,
  y1: number,
  x2: number,
  y2: number
): number {
  // Vector from segment start to point
  const dx = px - x1;
  const dy = py - y1;

  // Segment vector
  const sx = x2 - x1;
  const sy = y2 - y1;

  // Segment length squared
  const segLenSq = sx * sx + sy * sy;

  // If segment is actually a point
  if (segLenSq === 0) {
    return Math.sqrt(dx * dx + dy * dy);
  }

  // Project point onto segment (parameterized as t ∈ [0,1])
  const t = Math.max(0, Math.min(1, (dx * sx + dy * sy) / segLenSq));

  // Find closest point on segment
  const closestX = x1 + t * sx;
  const closestY = y1 + t * sy;

  // Distance from point to closest point
  const distX = px - closestX;
  const distY = py - closestY;

  return Math.sqrt(distX * distX + distY * distY);
}

/**
 * Calculates dot product of two 2D vectors
 *
 * @param v1 - First vector
 * @param v2 - Second vector
 * @returns Dot product
 *
 * @ue_equivalent
 * UFUNCTION(BlueprintPure)
 * static float DotProduct2D(FVector2D A, FVector2D B);
 * // In UE5: FVector2D::DotProduct(A, B)
 */
export function dot(v1: Vector2D, v2: Vector2D): number {
  return v1.x * v2.x + v1.y * v2.y;
}

/**
 * Calculates 2D cross product (returns scalar z-component)
 *
 * Useful for determining which side of a line a point is on.
 * Positive = left side, Negative = right side, Zero = on the line
 *
 * @param v1 - First vector
 * @param v2 - Second vector
 * @returns Z-component of 3D cross product
 *
 * @ue_equivalent
 * UFUNCTION(BlueprintPure)
 * static float CrossProduct2D(FVector2D A, FVector2D B);
 * // In UE5: FVector2D::CrossProduct(A, B)
 */
export function cross(v1: Vector2D, v2: Vector2D): number {
  return v1.x * v2.y - v1.y * v2.x;
}

/**
 * Calculates the length (magnitude) of a vector
 *
 * @param v - Vector
 * @returns Length of vector
 *
 * @ue_equivalent
 * UFUNCTION(BlueprintPure)
 * static float VectorLength(FVector2D V);
 * // In UE5: V.Size()
 */
export function length(v: Vector2D): number {
  return Math.sqrt(v.x * v.x + v.y * v.y);
}

/**
 * Normalizes a vector (makes it unit length)
 *
 * @param v - Vector to normalize
 * @returns Normalized vector (length = 1)
 *
 * @ue_equivalent
 * UFUNCTION(BlueprintPure)
 * static FVector2D NormalizeVector(FVector2D V);
 * // In UE5: V.GetSafeNormal()
 */
export function normalize(v: Vector2D): Vector2D {
  const len = length(v);
  if (len === 0) {
    return { x: 0, y: 0 };
  }
  return {
    x: v.x / len,
    y: v.y / len,
  };
}

/**
 * Rotates a vector 90 degrees counter-clockwise (perpendicular)
 *
 * Useful for computing normals from tangents.
 *
 * @param v - Vector to rotate
 * @returns Perpendicular vector
 *
 * @ue_equivalent
 * UFUNCTION(BlueprintPure)
 * static FVector2D Perpendicular(FVector2D V);
 */
export function perpendicular(v: Vector2D): Vector2D {
  return { x: -v.y, y: v.x };
}

/**
 * Linear interpolation between two values
 *
 * @param a - Start value
 * @param b - End value
 * @param t - Interpolation parameter (0 = a, 1 = b)
 * @returns Interpolated value
 *
 * @ue_equivalent
 * UFUNCTION(BlueprintPure)
 * static float Lerp(float A, float B, float Alpha);
 * // In UE5: FMath::Lerp(A, B, Alpha)
 */
export function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

/**
 * Linear interpolation between two points
 *
 * @param p1 - Start point
 * @param p2 - End point
 * @param t - Interpolation parameter (0 = p1, 1 = p2)
 * @returns Interpolated point
 *
 * @ue_equivalent
 * UFUNCTION(BlueprintPure)
 * static FVector2D LerpVector(FVector2D A, FVector2D B, float Alpha);
 * // In UE5: FMath::Lerp(A, B, Alpha)
 */
export function lerpPoint(p1: Point, p2: Point, t: number): Point {
  return {
    x: lerp(p1.x, p2.x, t),
    y: lerp(p1.y, p2.y, t),
  };
}

/**
 * Clamps a value between min and max
 *
 * @param value - Value to clamp
 * @param min - Minimum value
 * @param max - Maximum value
 * @returns Clamped value
 *
 * @ue_equivalent
 * UFUNCTION(BlueprintPure)
 * static float Clamp(float Value, float Min, float Max);
 * // In UE5: FMath::Clamp(Value, Min, Max)
 */
export function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

/**
 * Generates a UUID v4 string
 *
 * @returns UUID string
 *
 * @ue_equivalent
 * UFUNCTION(BlueprintCallable)
 * static FGuid NewGuid();
 * // In UE5: FGuid::NewGuid()
 */
export function generateId(): string {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}
