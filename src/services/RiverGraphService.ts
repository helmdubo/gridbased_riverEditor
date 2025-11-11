/**
 * Service for managing river graph operations
 */

import type {
  RiverGraph,
  RiverPoint,
  Tributary,
  Point,
} from '@domain/models/types';
import { generateId } from '@domain/utils/geometry';
import {
  isJunctionPoint,
  canAttachTributaryToPoint,
  isEndPoint,
} from '@domain/utils/riverValidation';

export class RiverGraphService {
  /**
   * Add point to main river
   */
  static addPointToMainRiver(
    riverGraph: RiverGraph,
    x: number,
    y: number,
    selectedPointId: string | null
  ): { graph: RiverGraph; newPointId: string } | null {
    // If main river is empty, add first point
    if (riverGraph.mainRiver.length === 0) {
      const newPoint: RiverPoint = { x, y, id: generateId() };
      return {
        graph: {
          ...riverGraph,
          mainRiver: [newPoint],
        },
        newPointId: newPoint.id,
      };
    }

    if (!selectedPointId) return null;

    // Check if selected point is an endpoint
    if (!isEndPoint(riverGraph, 'main', selectedPointId)) {
      return null; // Internal point - can't extend main river
    }

    const newPoint: RiverPoint = { x, y, id: generateId() };
    const isFirstPoint = riverGraph.mainRiver[0]?.id === selectedPointId;

    return {
      graph: {
        ...riverGraph,
        mainRiver: isFirstPoint
          ? [newPoint, ...riverGraph.mainRiver]
          : [...riverGraph.mainRiver, newPoint],
      },
      newPointId: newPoint.id,
    };
  }

  /**
   * Create new tributary from selected point
   */
  static createTributary(
    riverGraph: RiverGraph,
    selectedPointId: string,
    x: number,
    y: number,
    widthPercent: number
  ): { graph: RiverGraph; tributaryId: string; newPointId: string } | null {
    if (!canAttachTributaryToPoint(riverGraph, selectedPointId)) {
      return null;
    }

    const parentPoint = riverGraph.mainRiver.find((p) => p.id === selectedPointId);
    if (!parentPoint) return null;

    const firstPoint: RiverPoint = { x: parentPoint.x, y: parentPoint.y, id: generateId() };
    const secondPoint: RiverPoint = { x, y, id: generateId() };

    const newTrib: Tributary = {
      id: generateId(),
      parentPointId: selectedPointId,
      points: [firstPoint, secondPoint],
      widthPercent,
      isDetached: false,
    };

    const newTributaries = new Map(riverGraph.tributaries);
    newTributaries.set(newTrib.id, newTrib);

    return {
      graph: {
        ...riverGraph,
        tributaries: newTributaries,
      },
      tributaryId: newTrib.id,
      newPointId: secondPoint.id,
    };
  }

  /**
   * Add point to tributary
   */
  static addPointToTributary(
    riverGraph: RiverGraph,
    tributaryId: string,
    selectedPointId: string,
    x: number,
    y: number
  ): { graph: RiverGraph; newPointId: string } | null {
    const trib = riverGraph.tributaries.get(tributaryId);
    if (!trib) return null;

    const selectedIndex = trib.points.findIndex((p) => p.id === selectedPointId);
    if (selectedIndex === -1) return null;

    const newPoint: RiverPoint = { x, y, id: generateId() };

    // For attached tributaries, only extend from the source (last point)
    if (!trib.isDetached) {
      if (selectedIndex === trib.points.length - 1) {
        const updated = { ...trib, points: [...trib.points, newPoint] };
        const newTributaries = new Map(riverGraph.tributaries);
        newTributaries.set(tributaryId, updated);

        return {
          graph: {
            ...riverGraph,
            tributaries: newTributaries,
          },
          newPointId: newPoint.id,
        };
      }
    } else {
      // Detached tributary - can extend from both ends
      let updatedPoints: RiverPoint[];
      if (selectedIndex === 0) {
        updatedPoints = [newPoint, ...trib.points];
      } else if (selectedIndex === trib.points.length - 1) {
        updatedPoints = [...trib.points, newPoint];
      } else {
        return null;
      }

      const updated = { ...trib, points: updatedPoints };
      const newTributaries = new Map(riverGraph.tributaries);
      newTributaries.set(tributaryId, updated);

      return {
        graph: {
          ...riverGraph,
          tributaries: newTributaries,
        },
        newPointId: newPoint.id,
      };
    }

    return null;
  }

  /**
   * Delete point from main river
   */
  static deleteMainRiverPoint(riverGraph: RiverGraph, pointId: string): RiverGraph {
    const newTributaries = new Map(riverGraph.tributaries);

    // Detach any tributaries connected to this point
    newTributaries.forEach((trib, id) => {
      if (trib.parentPointId === pointId) {
        const updatedPoints = trib.points.slice(1);
        if (updatedPoints.length > 0) {
          newTributaries.set(id, {
            ...trib,
            parentPointId: null,
            isDetached: true,
            points: updatedPoints,
          });
        } else {
          newTributaries.delete(id);
        }
      }
    });

    return {
      mainRiver: riverGraph.mainRiver.filter((p) => p.id !== pointId),
      tributaries: newTributaries,
    };
  }

  /**
   * Delete point from tributary
   */
  static deleteTributaryPoint(
    riverGraph: RiverGraph,
    tributaryId: string,
    pointId: string
  ): RiverGraph {
    const trib = riverGraph.tributaries.get(tributaryId);
    if (!trib) return riverGraph;

    const isMouth = trib.points[0]?.id === pointId;

    // If deleting mouth of attached tributary, detach it
    if (isMouth && !trib.isDetached) {
      const newTributaries = new Map(riverGraph.tributaries);
      newTributaries.set(tributaryId, {
        ...trib,
        isDetached: true,
        parentPointId: null,
      });
      return { ...riverGraph, tributaries: newTributaries };
    }

    const updatedPoints = trib.points.filter((p) => p.id !== pointId);

    // If less than 2 points remain, delete tributary
    if (updatedPoints.length < 2) {
      const newTributaries = new Map(riverGraph.tributaries);
      newTributaries.delete(tributaryId);
      return { ...riverGraph, tributaries: newTributaries };
    }

    const newTributaries = new Map(riverGraph.tributaries);
    newTributaries.set(tributaryId, { ...trib, points: updatedPoints });
    return { ...riverGraph, tributaries: newTributaries };
  }

  /**
   * Delete entire tributary
   */
  static deleteTributary(riverGraph: RiverGraph, tributaryId: string): RiverGraph {
    const newTributaries = new Map(riverGraph.tributaries);
    newTributaries.delete(tributaryId);
    return { ...riverGraph, tributaries: newTributaries };
  }

  /**
   * Move point in river graph
   */
  static movePoint(
    riverGraph: RiverGraph,
    splineId: string,
    pointId: string,
    x: number,
    y: number
  ): RiverGraph {
    if (splineId === 'main') {
      const updatedRiver = riverGraph.mainRiver.map((p) =>
        p.id === pointId ? { ...p, x, y } : p
      );

      // Update any attached tributaries
      const updatedTribs = new Map(riverGraph.tributaries);
      updatedTribs.forEach((trib, id) => {
        if (trib.parentPointId === pointId && !trib.isDetached) {
          updatedTribs.set(id, {
            ...trib,
            points: [{ ...trib.points[0], x, y }, ...trib.points.slice(1)],
          });
        }
      });

      return { mainRiver: updatedRiver, tributaries: updatedTribs };
    } else {
      const trib = riverGraph.tributaries.get(splineId);
      if (!trib) return riverGraph;

      const updatedPoints = trib.points.map((p) => (p.id === pointId ? { ...p, x, y } : p));
      const newTribs = new Map(riverGraph.tributaries);
      newTribs.set(splineId, { ...trib, points: updatedPoints });

      return { ...riverGraph, tributaries: newTribs };
    }
  }

  /**
   * Snap detached tributary to main river point
   */
  static snapTributaryToPoint(
    riverGraph: RiverGraph,
    tributaryId: string,
    targetPointId: string
  ): RiverGraph | null {
    const tributary = riverGraph.tributaries.get(tributaryId);
    if (!tributary || !tributary.isDetached) return null;

    const targetPoint = riverGraph.mainRiver.find((p) => p.id === targetPointId);
    if (!targetPoint || !canAttachTributaryToPoint(riverGraph, targetPointId)) return null;

    const updated: Tributary = {
      ...tributary,
      parentPointId: targetPointId,
      isDetached: false,
      points: [
        { ...tributary.points[0], x: targetPoint.x, y: targetPoint.y },
        ...tributary.points.slice(1),
      ],
    };

    const newTributaries = new Map(riverGraph.tributaries);
    newTributaries.set(tributaryId, updated);

    return { ...riverGraph, tributaries: newTributaries };
  }

  /**
   * Attach tributary to spline by inserting new junction point
   */
  static attachTributaryToSpline(
    riverGraph: RiverGraph,
    tributaryId: string,
    insertAfterIndex: number,
    attachPoint: Point
  ): RiverGraph | null {
    const tributary = riverGraph.tributaries.get(tributaryId);
    if (!tributary || !tributary.isDetached) return null;

    // Create new junction point at the attachment location
    const newJunctionPoint: RiverPoint = {
      x: attachPoint.x,
      y: attachPoint.y,
      id: generateId(),
    };

    // Insert new junction point into main river
    const newMainRiver = [
      ...riverGraph.mainRiver.slice(0, insertAfterIndex + 1),
      newJunctionPoint,
      ...riverGraph.mainRiver.slice(insertAfterIndex + 1),
    ];

    // Update tributary to attach to new junction point
    const updatedTributary: Tributary = {
      ...tributary,
      parentPointId: newJunctionPoint.id,
      isDetached: false,
      points: [
        { ...tributary.points[0], x: attachPoint.x, y: attachPoint.y },
        ...tributary.points.slice(1),
      ],
    };

    const newTributaries = new Map(riverGraph.tributaries);
    newTributaries.set(tributaryId, updatedTributary);

    return {
      mainRiver: newMainRiver,
      tributaries: newTributaries,
    };
  }

  /**
   * Split segment by inserting a point in the middle
   */
  static splitSegment(
    riverGraph: RiverGraph,
    splineId: string,
    segmentIndex: number
  ): { graph: RiverGraph; newPointId: string } | null {
    if (splineId === 'main') {
      const points = riverGraph.mainRiver;
      if (segmentIndex < 0 || segmentIndex >= points.length - 1) return null;

      const p1 = points[segmentIndex];
      const p2 = points[segmentIndex + 1];
      const midPoint: RiverPoint = {
        x: (p1.x + p2.x) / 2,
        y: (p1.y + p2.y) / 2,
        id: generateId(),
      };

      return {
        graph: {
          ...riverGraph,
          mainRiver: [
            ...riverGraph.mainRiver.slice(0, segmentIndex + 1),
            midPoint,
            ...riverGraph.mainRiver.slice(segmentIndex + 1),
          ],
        },
        newPointId: midPoint.id,
      };
    } else {
      const trib = riverGraph.tributaries.get(splineId);
      if (!trib) return null;

      const points = trib.points;
      if (segmentIndex < 0 || segmentIndex >= points.length - 1) return null;

      const p1 = points[segmentIndex];
      const p2 = points[segmentIndex + 1];
      const midPoint: RiverPoint = {
        x: (p1.x + p2.x) / 2,
        y: (p1.y + p2.y) / 2,
        id: generateId(),
      };

      const updatedPoints = [
        ...trib.points.slice(0, segmentIndex + 1),
        midPoint,
        ...trib.points.slice(segmentIndex + 1),
      ];

      const newTributaries = new Map(riverGraph.tributaries);
      newTributaries.set(splineId, { ...trib, points: updatedPoints });

      return {
        graph: { ...riverGraph, tributaries: newTributaries },
        newPointId: midPoint.id,
      };
    }
  }

  /**
   * Update tributary width
   */
  static updateTributaryWidth(
    riverGraph: RiverGraph,
    tributaryId: string,
    widthPercent: number
  ): RiverGraph {
    const trib = riverGraph.tributaries.get(tributaryId);
    if (!trib) return riverGraph;

    const newTribs = new Map(riverGraph.tributaries);
    newTribs.set(tributaryId, { ...trib, widthPercent });

    return { ...riverGraph, tributaries: newTribs };
  }
}
