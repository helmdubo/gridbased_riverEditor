/**
 * Hook for managing river graph state (V2 - Node-Spline architecture)
 *
 * This is the new version using RiverGraphV2 with Node-Spline model.
 * Replaces the old useRiverGraph hook.
 */

import { useState, useCallback } from 'react';
import type { RiverGraphV2, NodeId, SplineId, Spline } from '@/core/graph/types';
import { makeWidthPx, makeWidthRelative, makeRiverAttributes } from '@/core/graph/types';
import GraphService from '@services/GraphService';

export const useRiverGraphV2 = (initialGraph?: RiverGraphV2) => {
  const [riverGraph, setRiverGraph] = useState<RiverGraphV2>(
    initialGraph || GraphService.createEmpty()
  );
  const [activeSplineId, setActiveSplineId] = useState<SplineId | null>(null);
  const [selectedNodeId, setSelectedNodeId] = useState<NodeId | null>(null);
  const [newSplineSession, setNewSplineSession] = useState<
    { splineId: SplineId | null; widthPx: number } | null
  >(null);

  const ensureMainSpline = useCallback(
    (graph: RiverGraphV2): RiverGraphV2 => {
      const currentMain = GraphService.getMainSpline(graph);
      if (currentMain) {
        return graph;
      }

      const roots = GraphService.getRootSplines(graph);
      if (roots.length > 0) {
        return GraphService.setExclusiveMainSpline(graph, roots[0].id as SplineId);
      }

      return graph;
    },
    []
  );

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
          const attributes = makeRiverAttributes(makeWidthPx(newSplineSession.widthPx));
          const { graph: graphWithSpline, splineId } = GraphService.createSpline(
            graphWithNode,
            'river',
            [nodeId],
            attributes
          );

          const hasMain = GraphService.getMainSpline(graphWithSpline);
          const finalGraph = hasMain
            ? graphWithSpline
            : GraphService.setExclusiveMainSpline(graphWithSpline, splineId);

          setRiverGraph(finalGraph);
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

      // Case 1: No river exists yet - cannot add points without a river
      if (!GraphService.hasIndependentRiver(riverGraph) && !activeSplineId) {
        console.warn('🚫 No river exists - use "New River" button to create one');
        return;
      }

      const mainSpline = GraphService.getMainSpline(riverGraph);
      if (!mainSpline) return;

      const resolvedActiveId = activeSplineId ?? mainSpline.id;
      if (activeSplineId === null) {
        setActiveSplineId(mainSpline.id);
      }

      console.log('🔧 Main river exists, processing...', {
        selectedNodeId,
        activeSplineId: resolvedActiveId,
        mainEdgeNodes: mainSpline.nodeIds.length,
      });

      // Case 2: Working with main river
      if (resolvedActiveId === mainSpline.id) {
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
          const isJunction = GraphService.isJunctionNode(riverGraph, selectedNodeId);
          console.log('🔍 Selected node state:', { canAttach: canAttach.valid, isJunction });

          if (canAttach.valid) {
            // Create tributary from this mid-node (will become junction)
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

          // If node is already a junction, don't allow inserting new points
          if (isJunction) {
            console.log('🚫 Cannot insert after junction node - junction already has tributary');
            return;
          }

          // Otherwise, insert node after selected node
          try {
            console.log('📌 Inserting node after selected mid-node');
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
        const activeSpline = GraphService.getSpline(riverGraph, resolvedActiveId);
        if (!activeSpline) {
          console.warn('⚠️ Active spline not found:', resolvedActiveId);
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
            const result = GraphService.extendUpstream(riverGraph, resolvedActiveId, x, y);
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
            const result = GraphService.extendUpstream(riverGraph, resolvedActiveId, x, y);
            setRiverGraph(result.graph);
            setSelectedNodeId(result.nodeId);
            return;
          }

          if (isMouth) {
            const result = GraphService.extendDownstream(riverGraph, resolvedActiveId, x, y);
            setRiverGraph(result.graph);
            setSelectedNodeId(result.nodeId);
            return;
          }

          const canAttach = GraphService.canAttachToNode(riverGraph, selectedNodeId);
          if (canAttach.valid) {
            const result = GraphService.createTributaryFromJunction(
              riverGraph,
              resolvedActiveId,
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
              resolvedActiveId,
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

        const result = GraphService.extendDownstream(riverGraph, resolvedActiveId, x, y);
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
      let newGraph = GraphService.deleteNode(riverGraph, nodeId);
      newGraph = ensureMainSpline(newGraph);

      setRiverGraph(newGraph);

      if (selectedNodeId === nodeId) {
        setSelectedNodeId(null);
      }

      if (activeSplineId) {
        const stillExists = GraphService.getSpline(newGraph, activeSplineId);
        if (!stillExists) {
          const nextMain = GraphService.getMainSpline(newGraph);
          setActiveSplineId(nextMain ? (nextMain.id as SplineId) : null);
        }
      } else {
        const nextMain = GraphService.getMainSpline(newGraph);
        setActiveSplineId(nextMain ? (nextMain.id as SplineId) : null);
      }
    },
    [riverGraph, selectedNodeId, activeSplineId, ensureMainSpline]
  );

  /**
   * Deletes an spline from the graph
   */
  const deleteSpline = useCallback(
    (splineId: SplineId) => {
      let newGraph = GraphService.deleteSpline(riverGraph, splineId);
      newGraph = ensureMainSpline(newGraph);

      setRiverGraph(newGraph);

      if (activeSplineId === splineId) {
        const mainSpline = GraphService.getMainSpline(newGraph);
        setActiveSplineId(mainSpline ? (mainSpline.id as SplineId) : null);
      }
    },
    [riverGraph, activeSplineId, ensureMainSpline]
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
   * Merges two nodes in the same spline
   *
   * @param draggedNodeId - Node being dragged
   * @param targetNodeId - Node being dropped onto
   * @param survivorNodeId - Node that should survive (from nodeKinds.getMergeSurvivor)
   */
  const mergeNodes = useCallback(
    (draggedNodeId: NodeId, targetNodeId: NodeId, survivorNodeId: NodeId) => {
      const newGraph = GraphService.mergeNodes(riverGraph, draggedNodeId, targetNodeId, survivorNodeId);
      setRiverGraph(newGraph);

      // Update selected node to survivor if one of the merged nodes was selected
      if (selectedNodeId === draggedNodeId || selectedNodeId === targetNodeId) {
        setSelectedNodeId(survivorNodeId);
      }
    },
    [riverGraph, selectedNodeId]
  );

  /**
   * Attaches an existing spline as a tributary to another spline
   *
   * @param draggedNodeId - Endpoint node (source or mouth) of spline to attach
   * @param targetNodeId - Node where tributary will attach (becomes junction)
   */
  const attachSplineAsTributary = useCallback(
    (draggedNodeId: NodeId, targetNodeId: NodeId) => {
      // Find which splines are involved
      const draggedSplineEntry = Object.entries(riverGraph.splines).find(([, spline]) =>
        spline.nodeIds.includes(draggedNodeId as string)
      );
      const targetSplineEntry = Object.entries(riverGraph.splines).find(([, spline]) =>
        spline.nodeIds.includes(targetNodeId as string)
      );

      let newGraph = GraphService.attachSplineAsTributary(riverGraph, draggedNodeId, targetNodeId);

      if (draggedSplineEntry && targetSplineEntry) {
        const [, draggedSpline] = draggedSplineEntry;
        const [targetSplineId] = targetSplineEntry;

        if (draggedSpline.isMain) {
          newGraph = GraphService.setExclusiveMainSpline(newGraph, targetSplineId as SplineId);
        }
      }

      newGraph = ensureMainSpline(newGraph);

      setRiverGraph(newGraph);

      // Update selected node to target (new junction)
      setSelectedNodeId(targetNodeId);
    },
    [riverGraph, ensureMainSpline]
  );

  /**
   * Merges two splines end-to-end (river extension)
   *
   * Target spline always survives (keeps attributes).
   *
   * @param draggedNodeId - Endpoint of dragged spline (source or mouth)
   * @param targetNodeId - Endpoint of target spline (mouth or source)
   */
  const mergeSplines = useCallback(
    (draggedNodeId: NodeId, targetNodeId: NodeId) => {
      const newGraph = GraphService.mergeSplines(
        riverGraph,
        draggedNodeId,
        targetNodeId
      );
      setRiverGraph(newGraph);
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
  const setActiveSpline = useCallback(
    (splineId: SplineId | null) => {
      if (splineId) {
        setActiveSplineId(splineId);
        return;
      }

      const mainSpline = GraphService.getMainSpline(riverGraph);
      setActiveSplineId(mainSpline ? (mainSpline.id as SplineId) : null);
    },
    [riverGraph]
  );

  const resolveActiveSpline = useCallback((): Spline | null => {
    if (activeSplineId) {
      return GraphService.getSpline(riverGraph, activeSplineId) ?? null;
    }

    return GraphService.getMainSpline(riverGraph);
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
    mergeNodes,
    attachSplineAsTributary,
    mergeSplines,

    // Convenience getters
    mainSpline: GraphService.getMainSpline(riverGraph),
    tributaries: GraphService.getTributaries(riverGraph),
    junctionNodes: GraphService.findJunctionNodes(riverGraph),
    activeSpline: resolveActiveSpline(),
  };
};
