/**
 * Hook for managing river graph state
 */

import { useState, useCallback } from 'react';
import type { RiverGraph, Point } from '@domain/models/types';
import { RiverGraphService } from '@services';

export const useRiverGraph = (
  initialGraph: RiverGraph = { mainRiver: [], tributaries: new Map() }
) => {
  const [riverGraph, setRiverGraph] = useState<RiverGraph>(initialGraph);
  const [activeSplineId, setActiveSplineId] = useState<string>('main');
  const [selectedPointId, setSelectedPointId] = useState<string | null>(null);

  const addPointToActiveSpline = useCallback(
    (x: number, y: number, tributaryWidthPercent: number) => {
      if (activeSplineId === 'main') {
        // Try to add to main river
        const result = RiverGraphService.addPointToMainRiver(riverGraph, x, y, selectedPointId);

        if (result) {
          setRiverGraph(result.graph);
          setSelectedPointId(result.newPointId);
          return;
        }

        // If can't add to main river, try to create tributary
        if (selectedPointId) {
          const tribResult = RiverGraphService.createTributary(
            riverGraph,
            selectedPointId,
            x,
            y,
            tributaryWidthPercent
          );

          if (tribResult) {
            setRiverGraph(tribResult.graph);
            setActiveSplineId(tribResult.tributaryId);
            setSelectedPointId(tribResult.newPointId);
          } else {
            alert('Cannot create tributary at this junction point.');
          }
        }
      } else {
        // Add to tributary
        if (!selectedPointId) return;

        const result = RiverGraphService.addPointToTributary(
          riverGraph,
          activeSplineId,
          selectedPointId,
          x,
          y
        );

        if (result) {
          setRiverGraph(result.graph);
          setSelectedPointId(result.newPointId);
        }
      }
    },
    [riverGraph, activeSplineId, selectedPointId]
  );

  const deleteRiverPoint = useCallback(
    (pointId: string) => {
      const newGraph = RiverGraphService.deleteMainRiverPoint(riverGraph, pointId);
      setRiverGraph(newGraph);

      if (selectedPointId === pointId) {
        setSelectedPointId(null);
        setActiveSplineId('main');
      }
    },
    [riverGraph, selectedPointId]
  );

  const deleteTributaryPoint = useCallback(
    (tributaryId: string, pointId: string) => {
      const newGraph = RiverGraphService.deleteTributaryPoint(riverGraph, tributaryId, pointId);
      setRiverGraph(newGraph);
    },
    [riverGraph]
  );

  const deleteTributary = useCallback(
    (tributaryId: string) => {
      const newGraph = RiverGraphService.deleteTributary(riverGraph, tributaryId);
      setRiverGraph(newGraph);

      if (activeSplineId === tributaryId) {
        setActiveSplineId('main');
      }
    },
    [riverGraph, activeSplineId]
  );

  const movePoint = useCallback(
    (splineId: string, pointId: string, x: number, y: number) => {
      const newGraph = RiverGraphService.movePoint(riverGraph, splineId, pointId, x, y);
      setRiverGraph(newGraph);
    },
    [riverGraph]
  );

  const snapTributaryToPoint = useCallback(
    (tributaryId: string, targetPointId: string) => {
      const newGraph = RiverGraphService.snapTributaryToPoint(
        riverGraph,
        tributaryId,
        targetPointId
      );
      if (newGraph) {
        setRiverGraph(newGraph);
      }
    },
    [riverGraph]
  );

  const attachTributaryToSpline = useCallback(
    (tributaryId: string, insertAfterIndex: number, attachPoint: Point) => {
      const newGraph = RiverGraphService.attachTributaryToSpline(
        riverGraph,
        tributaryId,
        insertAfterIndex,
        attachPoint
      );
      if (newGraph) {
        setRiverGraph(newGraph);
      }
    },
    [riverGraph]
  );

  const splitSegment = useCallback(
    (splineId: string, segmentIndex: number) => {
      const result = RiverGraphService.splitSegment(riverGraph, splineId, segmentIndex);
      if (result) {
        setRiverGraph(result.graph);
        setSelectedPointId(result.newPointId);
        setActiveSplineId(splineId);
      }
    },
    [riverGraph]
  );

  const updateTributaryWidth = useCallback(
    (tributaryId: string, widthPercent: number) => {
      const newGraph = RiverGraphService.updateTributaryWidth(
        riverGraph,
        tributaryId,
        widthPercent
      );
      setRiverGraph(newGraph);
    },
    [riverGraph]
  );

  const clearAll = useCallback(() => {
    setRiverGraph({ mainRiver: [], tributaries: new Map() });
    setSelectedPointId(null);
    setActiveSplineId('main');
  }, []);

  return {
    riverGraph,
    activeSplineId,
    selectedPointId,
    setActiveSplineId,
    setSelectedPointId,
    addPointToActiveSpline,
    deleteRiverPoint,
    deleteTributaryPoint,
    deleteTributary,
    movePoint,
    snapTributaryToPoint,
    attachTributaryToSpline,
    splitSegment,
    updateTributaryWidth,
    clearAll,
  };
};
