/**
 * Hook for managing river graph state (V2 - Node-Spline architecture)
 *
 * This is the new version using RiverGraphV2 with Node-Spline model.
 * Replaces the old useRiverGraph hook.
 */

import { useState, useCallback } from 'react';
import type { RiverGraphV2, NodeId, SplineId, Spline } from '@/core/graph/types';
import { makeWidthPx, makeWidthRelative } from '@/core/graph/types';
import GraphService from '@services/GraphService';

export const useRiverGraphV2 = (initialGraph?: RiverGraphV2) => {
  const [riverGraph, setRiverGraph] = useState<RiverGraphV2>(
    initialGraph || GraphService.createEmpty()
  );
  const [activeSplineId, setActiveSplineId] = useState<SplineId | 'main' | null>(null);
  const [selectedNodeId, setSelectedNodeId] = useState<NodeId | null>(null);
  const [newSplineSession, setNewSplineSession] = useState<
    { splineId: SplineId | null; widthPx: number } | null
  >(null);

  /**
   * Adds a point to the active spline
   *
   * Behavior:
   * - If no main river exists: Create first node of main river
   * - If activeSplineId is main spline and selectedNodeId exists:
   *   - If selected node is last node: Add to end
   *   - Otherwise: Insert after selected node
   * - If activeSplineId is tributary: Add to end
   * - Special: If selectedNodeId is set and is valid junction, create tributary
   */
  const addPointToActiveSpline = useCallback(
    (x: number, y: number, tributaryWidthPercent: number) => {
      console.log('➕ Adding point to active spline:', { x, y });

      if (newSplineSession) {
        if (newSplineSession.splineId === null) {
          console.log('🆕 Starting new independent spline');
          const { graph: graphWithNode, nodeId } = GraphService.addNode(riverGraph, x, y);
          const { graph: graphWithSpline, splineId } = GraphService.createSpline(
            graphWithNode,
            'river',
            [nodeId],
            makeWidthPx(newSplineSession.widthPx)
          );

          setRiverGraph(graphWithSpline);
          setActiveSplineId(splineId);
          setSelectedNodeId(nodeId);
          setNewSplineSession({ splineId, widthPx: newSplineSession.widthPx });
          return;
        }

        console.log('➕ Extending new spline downstream during creation');
        const { graph, nodeId } = GraphService.addNodeToSpline(
          riverGraph,
          newSplineSession.splineId,
          x,
          y
        );
        setRiverGraph(graph);
        setSelectedNodeId(nodeId);
        setActiveSplineId(newSplineSession.splineId);
        setNewSplineSession(null);
        return;
      }

      // Case 1: No main river exists yet - create first node
      if (!GraphService.hasMainRiver(riverGraph)) {
        console.log('🆕 Creating first node and main river');
        const { graph: graphWithNode, nodeId } = GraphService.addNode(riverGraph, x, y);
        const { graph: finalGraph, splineId } = GraphService.createMainRiver(
          graphWithNode,
          [nodeId],
          60 // Default main river width
        );

        console.log('✅ First node created:', { nodeId, splineId });
        setRiverGraph(finalGraph);
        setActiveSplineId(splineId);
        setSelectedNodeId(nodeId);
        return;
      }

      const mainSpline = GraphService.getMainSpline(riverGraph);
      if (!mainSpline) return;

      console.log('🔧 Main river exists, processing...', {
        selectedNodeId,
        activeSplineId,
        mainEdgeNodes: mainSpline.nodeIds.length,
      });

      // Case 2: Working with main river
      if (activeSplineId === null || activeSplineId === 'main' || activeSplineId === mainSpline.id) {
        if (selectedNodeId) {
          // Check if selected node is an endpoint (source or mouth)
          const selectedIndex = mainSpline.nodeIds.indexOf(selectedNodeId as string);
          const isSource = selectedIndex === 0;
          const isMouth = selectedIndex === mainSpline.nodeIds.length - 1;

          console.log('🔍 Selected node position:', { selectedIndex, isSource, isMouth });

          // If source endpoint: extend upstream (prepend)
          if (isSource) {
            if (mainSpline.nodeIds.length === 1) {
              console.log('⬇️ Treating single-source as downstream extension for new mouth');
              const result = GraphService.extendDownstream(riverGraph, mainSpline.id, x, y);
              setRiverGraph(result.graph);
              setSelectedNodeId(result.nodeId);
              return;
            }

            console.log('⬆️ Extending upstream from source');
            const result = GraphService.extendUpstream(riverGraph, mainSpline.id, x, y);
            setRiverGraph(result.graph);
            setSelectedNodeId(result.nodeId); // New source becomes selected
            return;
          }

          // If mouth endpoint: check if can create tributary, else extend downstream
          if (isMouth) {
            console.log('🚫 Tributary creation disabled from mouth, extending downstream instead');
            const result = GraphService.extendDownstream(riverGraph, mainSpline.id, x, y);
            setRiverGraph(result.graph);
            setSelectedNodeId(result.nodeId);
            return;
          }

          // Mid-node: check if can create tributary first
          const canAttach = GraphService.canAttachToNode(riverGraph, selectedNodeId);
          console.log('🔍 Can attach tributary to mid-node?', canAttach);

          if (canAttach.valid) {
            // Create tributary from this junction
            console.log('🌿 Creating tributary from mid-node');
            const result = GraphService.createTributaryFromJunction(
              riverGraph,
              mainSpline.id,
              selectedNodeId,
              x,
              y,
              tributaryWidthPercent
            );
            setRiverGraph(result.graph);
            setActiveSplineId(result.tributaryId);
            setSelectedNodeId(result.newNodeId);
            return;
          }

          // Otherwise, insert node after selected node
          try {
            console.log('📌 Inserting node after selected node');
            const result = GraphService.insertNodeAfter(
              riverGraph,
              mainSpline.id,
              selectedNodeId,
              x,
              y
            );
            console.log('✅ Node inserted:', result.nodeId);
            setRiverGraph(result.graph);
            setSelectedNodeId(result.nodeId);
          } catch (e) {
            console.log('⚠️ Insert failed:', e);
          }
        } else {
          // No selected node - extend downstream (add to mouth end)
          console.log('📍 No selected node, extending downstream');
          const result = GraphService.extendDownstream(riverGraph, mainSpline.id, x, y);
          setRiverGraph(result.graph);
          setSelectedNodeId(result.nodeId);
        }
      } else {
        // Case 3: Working with secondary spline (tributary or independent river)
        const activeSpline = GraphService.getSpline(riverGraph, activeSplineId);
        if (!activeSpline) {
          console.warn('⚠️ Active spline not found:', activeSplineId);
          return;
        }

        const isTributary = activeSpline.kind === 'tributary';
        const selectedIndex = selectedNodeId
          ? activeSpline.nodeIds.indexOf(selectedNodeId as string)
          : -1;
        const isSource = selectedIndex === 0;
        const isMouth = selectedIndex === activeSpline.nodeIds.length - 1;

        if (isTributary) {
          console.log('🌿 Editing tributary spline');

          if (isSource || selectedIndex === -1) {
            console.log('⬆️ Extending tributary upstream (away from junction)');
            const result = GraphService.extendUpstream(riverGraph, activeSplineId, x, y);
            setRiverGraph(result.graph);
            setSelectedNodeId(result.nodeId);
            return;
          }

          console.log('🚫 Tributaries can only grow from their source');
          return;
        }

        console.log('🌊 Editing independent river spline');

        if (selectedNodeId && selectedIndex !== -1) {
          if (isSource) {
            const result = GraphService.extendUpstream(riverGraph, activeSplineId, x, y);
            setRiverGraph(result.graph);
            setSelectedNodeId(result.nodeId);
            return;
          }

          if (isMouth) {
            const result = GraphService.extendDownstream(riverGraph, activeSplineId, x, y);
            setRiverGraph(result.graph);
            setSelectedNodeId(result.nodeId);
            return;
          }

          const canAttach = GraphService.canAttachToNode(riverGraph, selectedNodeId);
          if (canAttach.valid) {
            const result = GraphService.createTributaryFromJunction(
              riverGraph,
              activeSplineId,
              selectedNodeId,
              x,
              y,
              tributaryWidthPercent
            );
            setRiverGraph(result.graph);
            setActiveSplineId(result.tributaryId);
            setSelectedNodeId(result.newNodeId);
            return;
          }

          try {
            const result = GraphService.insertNodeAfter(
              riverGraph,
              activeSplineId,
              selectedNodeId,
              x,
              y
            );
            setRiverGraph(result.graph);
            setSelectedNodeId(result.nodeId);
            return;
          } catch (e) {
            console.warn('⚠️ Failed to insert node on independent spline:', e);
          }
        }

        const result = GraphService.extendDownstream(riverGraph, activeSplineId, x, y);
        setRiverGraph(result.graph);
        setSelectedNodeId(result.nodeId);
      }
    },
    [riverGraph, activeSplineId, selectedNodeId, newSplineSession]
  );

  /**
   * Moves a node to a new position
   */
  const moveNode = useCallback(
    (nodeId: NodeId, x: number, y: number) => {
      const newGraph = GraphService.moveNode(riverGraph, nodeId, x, y);
      setRiverGraph(newGraph);
    },
    [riverGraph]
  );

  /**
   * Deletes a node from the graph
   */
  const deleteNode = useCallback(
    (nodeId: NodeId) => {
      const newGraph = GraphService.deleteNode(riverGraph, nodeId);
      setRiverGraph(newGraph);

      if (selectedNodeId === nodeId) {
        setSelectedNodeId(null);
      }

      if (activeSplineId === 'main') {
        const nextMain = GraphService.getMainSpline(newGraph);
        if (!nextMain) {
          setActiveSplineId(null);
        }
      } else if (activeSplineId) {
        const stillExists = GraphService.getSpline(newGraph, activeSplineId);
        if (!stillExists) {
          const nextMain = GraphService.getMainSpline(newGraph);
          setActiveSplineId(nextMain ? nextMain.id : null);
        }
      }
    },
    [riverGraph, selectedNodeId, activeSplineId]
  );

  /**
   * Deletes an spline from the graph
   */
  const deleteSpline = useCallback(
    (splineId: SplineId) => {
      const newGraph = GraphService.deleteSpline(riverGraph, splineId);
      setRiverGraph(newGraph);

      if (activeSplineId === splineId) {
        const mainSpline = GraphService.getMainSpline(newGraph);
        setActiveSplineId(mainSpline?.id || null);
      }
    },
    [riverGraph, activeSplineId]
  );

  /**
   * Attaches a detached tributary to a junction node
   */
  const attachTributary = useCallback(
    (tribSplineId: SplineId, parentSplineId: SplineId, junctionNodeId: NodeId) => {
      try {
        const newGraph = GraphService.attachTributary(
          riverGraph,
          tribSplineId,
          parentSplineId,
          junctionNodeId
        );
        setRiverGraph(newGraph);
      } catch (e) {
        console.error('Failed to attach tributary:', e);
      }
    },
    [riverGraph]
  );

  /**
   * Detaches a tributary from its junction
   */
  const detachTributary = useCallback(
    (tribEdgeId: SplineId) => {
      const result = GraphService.detachTributary(riverGraph, tribEdgeId, true);
      setRiverGraph(result.graph);
    },
    [riverGraph]
  );

  /**
   * Begins creation of a new independent spline
   */
  const beginNewSpline = useCallback((widthPixels: number) => {
    setNewSplineSession({ splineId: null, widthPx: widthPixels });
    setSelectedNodeId(null);
    setActiveSplineId(null);
  }, []);

  /**
   * Updates the width of an spline
   */
  const updateSplineWidth = useCallback(
    (splineId: SplineId, widthValue: number, isAbsolute: boolean = false) => {
      const width = isAbsolute ? makeWidthPx(widthValue) : makeWidthRelative(widthValue);
      const newGraph = GraphService.updateSplineWidth(riverGraph, splineId, width);
      setRiverGraph(newGraph);
    },
    [riverGraph]
  );

  /**
   * Splits an spline at a specific control segment
   *
   * This is used when user clicks near the curve to insert a point.
   * The segmentIndex comes from segIndexAt array in the geometry cache.
   */
  const splitEdgeAtSegment = useCallback(
    (splineId: SplineId, segmentIndex: number, x: number, y: number) => {
      try {
        // Add new node at the click position
        const { graph: graphWithNode, nodeId } = GraphService.addNode(riverGraph, x, y);

        // Split spline at the segment
        const newGraph = GraphService.splitSpline(graphWithNode, splineId, nodeId, segmentIndex);

        setRiverGraph(newGraph);
        setSelectedNodeId(nodeId);
        setActiveSplineId(splineId);
      } catch (e) {
        console.error('Failed to split spline:', e);
      }
    },
    [riverGraph]
  );

  /**
   * Clears the entire graph
   */
  const clearAll = useCallback(() => {
    setRiverGraph(GraphService.createEmpty());
    setSelectedNodeId(null);
    setActiveSplineId(null);
    setNewSplineSession(null);
  }, []);

  /**
   * Selects a node
   */
  const selectNode = useCallback((nodeId: NodeId | null) => {
    setSelectedNodeId(nodeId);
  }, []);

  /**
   * Sets the active spline
   */
  const setActiveSpline = useCallback((splineId: SplineId | 'main' | null) => {
    setActiveSplineId(splineId);
  }, []);

  const resolveActiveSpline = useCallback((): Spline | null => {
    if (activeSplineId === 'main') {
      return GraphService.getMainSpline(riverGraph);
    }

    if (!activeSplineId) {
      return null;
    }

    return GraphService.getSpline(riverGraph, activeSplineId) ?? null;
  }, [activeSplineId, riverGraph]);

  return {
    // State
    riverGraph,
    activeSplineId,
    selectedNodeId,

    // Setters
    setActiveSpline,
    selectNode,

    // Graph operations
    addPointToActiveSpline,
    moveNode,
    deleteNode,
    deleteSpline,
    attachTributary,
    detachTributary,
    updateSplineWidth,
    splitEdgeAtSegment,
    clearAll,
    beginNewSpline,

    // Convenience getters
    mainSpline: GraphService.getMainSpline(riverGraph),
    tributaries: GraphService.getTributaries(riverGraph),
    junctionNodes: GraphService.findJunctionNodes(riverGraph),
    activeSpline: resolveActiveSpline(),
  };
};
