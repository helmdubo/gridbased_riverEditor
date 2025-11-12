/**
 * Hook for managing river graph state (V2 - Node-Edge architecture)
 *
 * This is the new version using RiverGraphV2 with Node-Edge model.
 * Replaces the old useRiverGraph hook.
 */

import { useState, useCallback } from 'react';
import type { RiverGraphV2, NodeId, EdgeId } from '@/core/graph/types';
import { makeWidthPx, makeWidthRelative } from '@/core/graph/types';
import GraphService from '@services/GraphService';

export const useRiverGraphV2 = (initialGraph?: RiverGraphV2) => {
  const [riverGraph, setRiverGraph] = useState<RiverGraphV2>(
    initialGraph || GraphService.createEmpty()
  );
  const [activeEdgeId, setActiveEdgeId] = useState<EdgeId | 'main' | null>(null);
  const [selectedNodeId, setSelectedNodeId] = useState<NodeId | null>(null);

  /**
   * Adds a point to the active edge
   *
   * Behavior:
   * - If no main river exists: Create first node of main river
   * - If activeEdgeId is main edge and selectedNodeId exists:
   *   - If selected node is last node: Add to end
   *   - Otherwise: Insert after selected node
   * - If activeEdgeId is tributary: Add to end
   * - Special: If selectedNodeId is set and is valid junction, create tributary
   */
  const addPointToActiveEdge = useCallback(
    (x: number, y: number, tributaryWidthPercent: number) => {
      console.log('➕ Adding point to active edge:', { x, y });

      // Case 1: No main river exists yet - create first node
      if (!GraphService.hasMainRiver(riverGraph)) {
        console.log('🆕 Creating first node and main river');
        const { graph: graphWithNode, nodeId } = GraphService.addNode(riverGraph, x, y);
        const { graph: finalGraph, edgeId } = GraphService.createMainRiver(
          graphWithNode,
          [nodeId],
          60 // Default main river width
        );

        console.log('✅ First node created:', { nodeId, edgeId });
        setRiverGraph(finalGraph);
        setActiveEdgeId(edgeId);
        setSelectedNodeId(nodeId);
        return;
      }

      const mainEdge = GraphService.getMainEdge(riverGraph);
      if (!mainEdge) return;

      console.log('🔧 Main river exists, processing...', {
        selectedNodeId,
        activeEdgeId,
        mainEdgeNodes: mainEdge.nodeIds.length,
      });

      // Case 2: Working with main river
      if (activeEdgeId === null || activeEdgeId === 'main' || activeEdgeId === mainEdge.id) {
        if (selectedNodeId) {
          // Check if selected node is an endpoint (source or mouth)
          const selectedIndex = mainEdge.nodeIds.indexOf(selectedNodeId as string);
          const isSource = selectedIndex === 0;
          const isMouth = selectedIndex === mainEdge.nodeIds.length - 1;

          console.log('🔍 Selected node position:', { selectedIndex, isSource, isMouth });

          // If source endpoint: extend upstream (prepend)
          if (isSource) {
            console.log('⬆️ Extending upstream from source');
            const result = GraphService.extendUpstream(riverGraph, mainEdge.id, x, y);
            setRiverGraph(result.graph);
            setSelectedNodeId(result.nodeId); // New source becomes selected
            return;
          }

          // If mouth endpoint: check if can create tributary, else extend downstream
          if (isMouth) {
            const canAttach = GraphService.canAttachToNode(riverGraph, selectedNodeId);
            console.log('🔍 Can attach tributary to mouth?', canAttach);

            if (canAttach.valid) {
              // Create tributary from mouth junction
              console.log('🌿 Creating tributary from mouth');
              const result = GraphService.createTributaryFromJunction(
                riverGraph,
                mainEdge.id,
                selectedNodeId,
                x,
                y,
                tributaryWidthPercent
              );
              setRiverGraph(result.graph);
              setActiveEdgeId(result.tributaryId);
              setSelectedNodeId(result.newNodeId);
              return;
            }

            // If can't attach, extend downstream (append)
            console.log('⬇️ Extending downstream from mouth');
            const result = GraphService.extendDownstream(riverGraph, mainEdge.id, x, y);
            setRiverGraph(result.graph);
            setSelectedNodeId(result.nodeId); // New mouth becomes selected
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
              mainEdge.id,
              selectedNodeId,
              x,
              y,
              tributaryWidthPercent
            );
            setRiverGraph(result.graph);
            setActiveEdgeId(result.tributaryId);
            setSelectedNodeId(result.newNodeId);
            return;
          }

          // Otherwise, insert node after selected node
          try {
            console.log('📌 Inserting node after selected node');
            const result = GraphService.insertNodeAfter(
              riverGraph,
              mainEdge.id,
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
          const result = GraphService.extendDownstream(riverGraph, mainEdge.id, x, y);
          setRiverGraph(result.graph);
          setSelectedNodeId(result.nodeId);
        }
      } else {
        // Case 3: Working with tributary
        console.log('🌿 Adding to tributary');
        const result = GraphService.addNodeToEdge(riverGraph, activeEdgeId, x, y);
        setRiverGraph(result.graph);
        setSelectedNodeId(result.nodeId);
      }
    },
    [riverGraph, activeEdgeId, selectedNodeId]
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
    },
    [riverGraph, selectedNodeId]
  );

  /**
   * Deletes an edge from the graph
   */
  const deleteEdge = useCallback(
    (edgeId: EdgeId) => {
      const newGraph = GraphService.deleteEdge(riverGraph, edgeId);
      setRiverGraph(newGraph);

      if (activeEdgeId === edgeId) {
        const mainEdge = GraphService.getMainEdge(newGraph);
        setActiveEdgeId(mainEdge?.id || null);
      }
    },
    [riverGraph, activeEdgeId]
  );

  /**
   * Attaches a detached tributary to a junction node
   */
  const attachTributary = useCallback(
    (tribEdgeId: EdgeId, junctionNodeId: NodeId) => {
      try {
        const newGraph = GraphService.attachTributary(riverGraph, tribEdgeId, junctionNodeId);
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
    (tribEdgeId: EdgeId) => {
      const result = GraphService.detachTributary(riverGraph, tribEdgeId, true);
      setRiverGraph(result.graph);
    },
    [riverGraph]
  );

  /**
   * Updates the width of an edge
   */
  const updateEdgeWidth = useCallback(
    (edgeId: EdgeId, widthValue: number, isAbsolute: boolean = false) => {
      const width = isAbsolute ? makeWidthPx(widthValue) : makeWidthRelative(widthValue);
      const newGraph = GraphService.updateEdgeWidth(riverGraph, edgeId, width);
      setRiverGraph(newGraph);
    },
    [riverGraph]
  );

  /**
   * Splits an edge at a specific control segment
   *
   * This is used when user clicks near the curve to insert a point.
   * The segmentIndex comes from segIndexAt array in the geometry cache.
   */
  const splitEdgeAtSegment = useCallback(
    (edgeId: EdgeId, segmentIndex: number, x: number, y: number) => {
      try {
        // Add new node at the click position
        const { graph: graphWithNode, nodeId } = GraphService.addNode(riverGraph, x, y);

        // Split edge at the segment
        const newGraph = GraphService.splitEdge(graphWithNode, edgeId, nodeId, segmentIndex);

        setRiverGraph(newGraph);
        setSelectedNodeId(nodeId);
        setActiveEdgeId(edgeId);
      } catch (e) {
        console.error('Failed to split edge:', e);
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
    setActiveEdgeId(null);
  }, []);

  /**
   * Selects a node
   */
  const selectNode = useCallback((nodeId: NodeId | null) => {
    setSelectedNodeId(nodeId);
  }, []);

  /**
   * Sets the active edge
   */
  const setActiveEdge = useCallback((edgeId: EdgeId | 'main' | null) => {
    setActiveEdgeId(edgeId);
  }, []);

  return {
    // State
    riverGraph,
    activeEdgeId,
    selectedNodeId,

    // Setters
    setActiveEdge,
    selectNode,

    // Graph operations
    addPointToActiveEdge,
    moveNode,
    deleteNode,
    deleteEdge,
    attachTributary,
    detachTributary,
    updateEdgeWidth,
    splitEdgeAtSegment,
    clearAll,

    // Convenience getters
    mainEdge: GraphService.getMainEdge(riverGraph),
    tributaries: GraphService.getTributaries(riverGraph),
    junctionNodes: GraphService.findJunctionNodes(riverGraph),
  };
};
