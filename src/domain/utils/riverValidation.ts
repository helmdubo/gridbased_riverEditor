/**
 * River graph validation utilities
 */

import type { RiverGraph, RiverPoint } from '../models/types';

/** Check if a point is a junction point (has attached tributaries) */
export const isJunctionPoint = (riverGraph: RiverGraph, pointId: string): boolean => {
  for (const trib of riverGraph.tributaries.values()) {
    if (trib.parentPointId === pointId && !trib.isDetached) return true;
  }
  return false;
};

/** Check if coordinates are in forbidden zone around junction points */
export const isInJunctionForbiddenZone = (
  riverGraph: RiverGraph,
  x: number,
  y: number,
  forbiddenRadius: number
): boolean => {
  for (const point of riverGraph.mainRiver) {
    if (isJunctionPoint(riverGraph, point.id)) {
      const dist = Math.hypot(point.x - x, point.y - y);
      if (dist < forbiddenRadius) {
        return true;
      }
    }
  }
  return false;
};

/** Check if tributary can be attached to a specific point */
export const canAttachTributaryToPoint = (riverGraph: RiverGraph, pointId: string): boolean => {
  if (isJunctionPoint(riverGraph, pointId)) return false;

  const pointIndex = riverGraph.mainRiver.findIndex((p) => p.id === pointId);
  if (pointIndex === -1) return false;

  return true;
};

/** Check if point is an endpoint of a spline */
export const isEndPoint = (riverGraph: RiverGraph, splineId: string, pointId: string): boolean => {
  if (splineId === 'main') {
    if (riverGraph.mainRiver.length === 0) return false;
    return (
      riverGraph.mainRiver[0].id === pointId ||
      riverGraph.mainRiver[riverGraph.mainRiver.length - 1].id === pointId
    );
  } else {
    const trib = riverGraph.tributaries.get(splineId);
    if (!trib || trib.points.length === 0) return false;
    return trib.points[0].id === pointId || trib.points[trib.points.length - 1].id === pointId;
  }
};

/** Check if point is an internal point (not an endpoint) of main river */
export const isInternalPoint = (riverGraph: RiverGraph, pointId: string): boolean => {
  const pointIndex = riverGraph.mainRiver.findIndex((p) => p.id === pointId);
  if (pointIndex === -1) return false;
  return pointIndex > 0 && pointIndex < riverGraph.mainRiver.length - 1;
};

/** Get adjacent segments to a point */
export const getAdjacentSegments = (
  riverGraph: RiverGraph,
  splineId: string,
  pointId: string
): Array<{ splineId: string; index: number }> => {
  const segments: Array<{ splineId: string; index: number }> = [];

  if (splineId === 'main') {
    const pointIndex = riverGraph.mainRiver.findIndex((p) => p.id === pointId);
    if (pointIndex === -1) return segments;

    // Segment before this point
    if (pointIndex > 0) {
      segments.push({ splineId: 'main', index: pointIndex - 1 });
    }

    // Segment after this point
    if (pointIndex < riverGraph.mainRiver.length - 1) {
      segments.push({ splineId: 'main', index: pointIndex });
    }
  } else {
    // For tributary points
    const trib = riverGraph.tributaries.get(splineId);
    if (!trib) return segments;

    const pointIndex = trib.points.findIndex((p) => p.id === pointId);
    if (pointIndex === -1) return segments;

    // Segment before this point
    if (pointIndex > 0) {
      const segmentIndex = pointIndex - 1;
      // Skip first segment (0-1) if tributary is attached to main river
      if (trib.isDetached || segmentIndex !== 0) {
        segments.push({ splineId, index: segmentIndex });
      }
    }

    // Segment after this point
    if (pointIndex < trib.points.length - 1) {
      segments.push({ splineId, index: pointIndex });
    }
  }

  return segments;
};

/** Find closest snap target point */
export const findSnapTargetPoint = (
  riverGraph: RiverGraph,
  x: number,
  y: number,
  snapDistance: number
): RiverPoint | null => {
  let targetPoint: RiverPoint | null = null;
  let closestDist = snapDistance;

  riverGraph.mainRiver.forEach((point) => {
    if (canAttachTributaryToPoint(riverGraph, point.id)) {
      const dist = Math.hypot(point.x - x, point.y - y);
      if (dist < closestDist) {
        closestDist = dist;
        targetPoint = point;
      }
    }
  });

  return targetPoint;
};
