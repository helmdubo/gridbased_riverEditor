/**
 * Hook for managing river interaction state (hover, drag, snap)
 */

import { useState, useCallback } from 'react';
import type {
  SplineSnapInfo,
  SegmentInfo,
  InsertPointPreview,
  DraggingTributaryInfo,
  RiverGraph,
  Point,
} from '@domain/models/types';
import {
  findSnapTargetPoint,
  isInJunctionForbiddenZone,
  getAdjacentSegments,
} from '@domain/utils/riverValidation';
import { findClosestPointOnSpline, distanceToSegment } from '@domain/utils/geometry';
import { getCurvePoints } from '@domain/utils/curves';
import { SNAP_DISTANCE, SPLINE_SNAP_DISTANCE } from '@domain/constants';

export const useRiverInteractions = (riverGraph: RiverGraph, mainRiverbedWidth: number) => {
  const [hoveredPointId, setHoveredPointId] = useState<string | null>(null);
  const [hoveredTributaryId, setHoveredTributaryId] = useState<string | null>(null);
  const [hoveredTributaryPointId, setHoveredTributaryPointId] = useState<string | null>(null);
  const [hoveredSegment, setHoveredSegment] = useState<SegmentInfo | null>(null);
  const [insertPointPreview, setInsertPointPreview] = useState<InsertPointPreview | null>(null);

  const [draggingPointId, setDraggingPointId] = useState<string | null>(null);
  const [draggingTributaryInfo, setDraggingTributaryInfo] =
    useState<DraggingTributaryInfo | null>(null);

  const [snapTargetPointId, setSnapTargetPointId] = useState<string | null>(null);
  const [splineSnapInfo, setSplineSnapInfo] = useState<SplineSnapInfo | null>(null);

  const checkSplineSnap = useCallback(
    (mouthX: number, mouthY: number) => {
      // First check if we're snapping to a point
      const targetPoint = findSnapTargetPoint(riverGraph, mouthX, mouthY, SNAP_DISTANCE);

      if (targetPoint) {
        setSnapTargetPointId(targetPoint.id);
        setSplineSnapInfo(null);
        return;
      }

      setSnapTargetPointId(null);

      // Check if we're in a forbidden zone around any junction
      if (isInJunctionForbiddenZone(riverGraph, mouthX, mouthY, mainRiverbedWidth)) {
        setSplineSnapInfo(null);
        return;
      }

      const mainCurve = getCurvePoints(riverGraph.mainRiver);
      if (mainCurve.length < 2) {
        setSplineSnapInfo(null);
        return;
      }

      const closest = findClosestPointOnSpline(mainCurve, mouthX, mouthY);

      if (closest && closest.distance < SPLINE_SNAP_DISTANCE) {
        // Check if the snap point is in a forbidden zone
        if (isInJunctionForbiddenZone(riverGraph, closest.point.x, closest.point.y, mainRiverbedWidth)) {
          setSplineSnapInfo(null);
          return;
        }

        setSplineSnapInfo({
          segmentIndex: closest.segmentIndex,
          t: closest.t,
          point: closest.point,
        });
      } else {
        setSplineSnapInfo(null);
      }
    },
    [riverGraph, mainRiverbedWidth]
  );

  const updateHoverState = useCallback(
    (x: number, y: number, selectedPointId: string | null, activeSplineId: string) => {
      let found = false;

      // Check main river points first
      riverGraph.mainRiver.forEach((p) => {
        if (!found && Math.hypot(p.x - x, p.y - y) < 15) {
          setHoveredPointId(p.id);
          setHoveredTributaryId(null);
          setHoveredTributaryPointId(null);
          setHoveredSegment(null);
          setInsertPointPreview(null);
          found = true;
        }
      });

      // Check tributary points
      if (!found) {
        riverGraph.tributaries.forEach((trib, id) => {
          trib.points.forEach((p) => {
            if (!found && Math.hypot(p.x - x, p.y - y) < 15) {
              setHoveredPointId(null);
              setHoveredTributaryId(id);
              setHoveredTributaryPointId(p.id);
              setHoveredSegment(null);
              setInsertPointPreview(null);
              found = true;
            }
          });
        });
      }

      // Check segments only if a point is selected and no point is being hovered
      if (!found && selectedPointId) {
        const adjacentSegments = getAdjacentSegments(riverGraph, activeSplineId, selectedPointId);

        for (const seg of adjacentSegments) {
          let p1: Point, p2: Point;

          if (seg.splineId === 'main') {
            p1 = riverGraph.mainRiver[seg.index];
            p2 = riverGraph.mainRiver[seg.index + 1];
          } else {
            const trib = riverGraph.tributaries.get(seg.splineId);
            if (!trib) continue;
            p1 = trib.points[seg.index];
            p2 = trib.points[seg.index + 1];
          }

          if (!p1 || !p2) continue;

          const distToSegment = distanceToSegment(x, y, p1.x, p1.y, p2.x, p2.y);

          if (distToSegment < SPLINE_SNAP_DISTANCE) {
            const midPoint = { x: (p1.x + p2.x) / 2, y: (p1.y + p2.y) / 2 };
            setInsertPointPreview({ splineId: seg.splineId, index: seg.index, point: midPoint });
            setHoveredSegment({ splineId: seg.splineId, index: seg.index });
            setHoveredPointId(null);
            setHoveredTributaryId(null);
            setHoveredTributaryPointId(null);
            found = true;
            break;
          }
        }
      }

      if (!found) {
        setHoveredPointId(null);
        setHoveredTributaryId(null);
        setHoveredTributaryPointId(null);
        setHoveredSegment(null);
        setInsertPointPreview(null);
      }
    },
    [riverGraph]
  );

  const clearDragState = useCallback(() => {
    setDraggingPointId(null);
    setDraggingTributaryInfo(null);
    setSnapTargetPointId(null);
    setSplineSnapInfo(null);
  }, []);

  return {
    hoveredPointId,
    hoveredTributaryId,
    hoveredTributaryPointId,
    hoveredSegment,
    insertPointPreview,
    draggingPointId,
    draggingTributaryInfo,
    snapTargetPointId,
    splineSnapInfo,
    setHoveredPointId,
    setHoveredTributaryId,
    setHoveredTributaryPointId,
    setHoveredSegment,
    setInsertPointPreview,
    setDraggingPointId,
    setDraggingTributaryInfo,
    setSnapTargetPointId,
    setSplineSnapInfo,
    checkSplineSnap,
    updateHoverState,
    clearDragState,
  };
};
