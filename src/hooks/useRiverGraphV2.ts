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
import { useActionLogger } from './useActionLogger';
import { getNodeKind } from '@/core/graph/nodeKinds';
import { assertNetworkValid } from '@/core/graph/invariants';

export const useRiverGraphV2 = (initialGraph?: RiverGraphV2) => {
  const [riverGraph, setRiverGraphInternal] = useState<RiverGraphV2>(
    initialGraph || GraphService.createEmpty()
  );
  const [activeSplineId, setActiveSplineId] = useState<SplineId | null>(null);
  const [selectedNodeId, setSelectedNodeId] = useState<NodeId | null>(null);
  const [newSplineSession, setNewSplineSession] = useState<
    { splineId: SplineId | null; widthPx: number } | null
  >(null);

  // Action logger for debugging
  const actionLogger = useActionLogger(true);

  /**
   * Wrapper for setRiverGraph that validates invariants in dev mode
   * Note: This now validates the graph after every state change in development
   */
  const setRiverGraph = useCallback((newGraph: RiverGraphV2) => {
    assertNetworkValid(newGraph);
    setRiverGraphInternal(newGraph);
  }, []);

  /**
   * Gets context about the currently selected node for logging
   */
  const getSelectedNodeContext = useCallback(() => {
    if (!selectedNodeId) {
      return null;
    }

    const node = riverGraph.nodes[selectedNodeId];
    if (!node) {
      return null;
    }

    const kind = getNodeKind(riverGraph, selectedNodeId);

    // Find which spline contains this node and its position
    let splineId: string | null = null;
    let positionInSpline = -1;

    for (const [sid, spline] of Object.entries(riverGraph.splines)) {
      const s = spline as Spline;
      const index = s.nodeIds.indexOf(selectedNodeId as string);
      if (index !== -1) {
        splineId = sid;
        positionInSpline = index;
        break;
      }
    }

    return {
      id: selectedNodeId,
      kind,
      position: positionInSpline,
      splineId,
      x: node.x,
      y: node.y,
    };
  }, [riverGraph, selectedNodeId]);

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

          actionLogger.log(
            'BEGIN_NEW_RIVER',
            `Create new river spline ${splineId.slice(0, 8)}... at (${Math.round(x)}, ${Math.round(y)})`,
            riverGraph,
            finalGraph,
            { x, y, nodeId, splineId, widthPx: newSplineSession.widthPx, selectedNode: getSelectedNodeContext() }
          );

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

        actionLogger.log(
          'ADD_NODE',
          `Extend spline ${newSplineSession.splineId.slice(0, 8)}... to (${Math.round(x)}, ${Math.round(y)})`,
          riverGraph,
          graph,
          { x, y, nodeId, splineId: newSplineSession.splineId, selectedNode: getSelectedNodeContext() }
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

              actionLogger.log(
                'EXTEND_DOWNSTREAM',
                `Extend main river downstream to (${Math.round(x)}, ${Math.round(y)})`,
                riverGraph,
                result.graph,
                { x, y, nodeId: result.nodeId, splineId: mainSpline.id, selectedNode: getSelectedNodeContext() }
              );

              setRiverGraph(result.graph);
              setSelectedNodeId(result.nodeId);
              return;
            }

            console.log('⬆️ Extending upstream from source');
            const result = GraphService.extendUpstream(riverGraph, mainSpline.id, x, y);

            actionLogger.log(
              'EXTEND_UPSTREAM',
              `Extend main river upstream to (${Math.round(x)}, ${Math.round(y)})`,
              riverGraph,
              result.graph,
              { x, y, nodeId: result.nodeId, splineId: mainSpline.id, selectedNode: getSelectedNodeContext() }
            );

            setRiverGraph(result.graph);
            setSelectedNodeId(result.nodeId); // New source becomes selected
            return;
          }

          // If mouth endpoint: check if can create tributary, else extend downstream
          if (isMouth) {
            console.log('🚫 Tributary creation disabled from mouth, extending downstream instead');
            const result = GraphService.extendDownstream(riverGraph, mainSpline.id, x, y);

            actionLogger.log(
              'EXTEND_DOWNSTREAM',
              `Extend main river downstream to (${Math.round(x)}, ${Math.round(y)})`,
              riverGraph,
              result.graph,
              { x, y, nodeId: result.nodeId, splineId: mainSpline.id, selectedNode: getSelectedNodeContext() }
            );

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

            actionLogger.log(
              'ATTACH_TRIBUTARY',
              `Create tributary from junction node ${selectedNodeId.slice(0, 8)}... to (${Math.round(x)}, ${Math.round(y)})`,
              riverGraph,
              result.graph,
              { x, y, junctionNodeId: selectedNodeId, tributaryId: result.tributaryId, newNodeId: result.newNodeId, widthPercent: tributaryWidthPercent, selectedNode: getSelectedNodeContext() }
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

            actionLogger.log(
              'INSERT_NODE',
              `Insert node after ${selectedNodeId.slice(0, 8)}... at (${Math.round(x)}, ${Math.round(y)})`,
              riverGraph,
              result.graph,
              { x, y, afterNodeId: selectedNodeId, nodeId: result.nodeId, splineId: mainSpline.id, selectedNode: getSelectedNodeContext() }
            );

            setRiverGraph(result.graph);
            setSelectedNodeId(result.nodeId);
          } catch (e) {
            console.log('⚠️ Insert failed:', e);
            actionLogger.log(
              'INSERT_NODE',
              `Insert node failed`,
              riverGraph,
              riverGraph,
              { x, y, afterNodeId: selectedNodeId, splineId: mainSpline.id, selectedNode: getSelectedNodeContext() },
              String(e)
            );
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

        // Treat both 'tributary' and 'stream' the same way (both are attached children)
        const isAttachedChild = activeSpline.parentId !== null;
        const selectedIndex = selectedNodeId
          ? activeSpline.nodeIds.indexOf(selectedNodeId as string)
          : -1;
        const isSource = selectedIndex === 0;
        const isMouth = selectedIndex === activeSpline.nodeIds.length - 1;

        if (isAttachedChild) {
          console.log('🌿 Editing attached child spline (tributary or stream)');

          if (isSource || selectedIndex === -1) {
            console.log('⬆️ Extending child upstream (away from junction)');
            const result = GraphService.extendUpstream(riverGraph, resolvedActiveId, x, y);

            actionLogger.log(
              'EXTEND_UPSTREAM',
              `Extend ${activeSpline.kind} ${resolvedActiveId.slice(0, 8)}... upstream to (${Math.round(x)}, ${Math.round(y)})`,
              riverGraph,
              result.graph,
              {
                x,
                y,
                nodeId: result.nodeId,
                splineId: resolvedActiveId,
                isAttachedChild: true,
                kind: activeSpline.kind,
                parentJunction: activeSpline.parentJunction,
                selectedNode: getSelectedNodeContext(),
              }
            );

            setRiverGraph(result.graph);
            setSelectedNodeId(result.nodeId);
            return;
          }

          // Check if mouth - cannot extend downstream or create branches
          if (isMouth) {
            console.log('🚫 Cannot extend downstream from mouth of attached child (mouth is junction)');
            return;
          }

          // Mid-node (inner): check if can create new branch
          const canAttach = GraphService.canAttachToNode(riverGraph, selectedNodeId);
          const isJunction = GraphService.isJunctionNode(riverGraph, selectedNodeId);
          console.log('🔍 Selected node state (attached child):', { canAttach: canAttach.valid, isJunction, kind: activeSpline.kind });

          if (canAttach.valid) {
            // Create new branch from this mid-node (will become junction)
            // For tributary -> creates stream (level 2)
            // For stream -> blocked by canAttachToNode (would be level 3)
            console.log('🌿 Creating new branch from mid-node of', activeSpline.kind);
            const result = GraphService.createTributaryFromJunction(
              riverGraph,
              resolvedActiveId,
              selectedNodeId,
              x,
              y,
              tributaryWidthPercent
            );

            actionLogger.log(
              'ATTACH_TRIBUTARY',
              `Create ${activeSpline.kind === 'tributary' ? 'stream' : 'branch'} from ${activeSpline.kind} ${resolvedActiveId.slice(0, 8)}... at junction ${selectedNodeId.slice(0, 8)}...`,
              riverGraph,
              result.graph,
              { x, y, parentKind: activeSpline.kind, junctionNodeId: selectedNodeId, tributaryId: result.tributaryId, newNodeId: result.newNodeId, widthPercent: tributaryWidthPercent, selectedNode: getSelectedNodeContext() }
            );

            setRiverGraph(result.graph);
            setActiveSplineId(result.tributaryId);
            setSelectedNodeId(result.newNodeId);
            return;
          }

          // If node is already a junction, don't allow inserting new points
          if (isJunction) {
            console.log('🚫 Cannot insert after junction node - junction already has child');
            return;
          }

          // Otherwise, try to insert node after selected node
          try {
            console.log('📌 Inserting node after selected mid-node in', activeSpline.kind);
            const result = GraphService.insertNodeAfter(
              riverGraph,
              resolvedActiveId,
              selectedNodeId,
              x,
              y
            );
            console.log('✅ Node inserted:', result.nodeId);

            actionLogger.log(
              'INSERT_NODE',
              `Insert node after ${selectedNodeId.slice(0, 8)}... in ${activeSpline.kind} at (${Math.round(x)}, ${Math.round(y)})`,
              riverGraph,
              result.graph,
              { x, y, afterNodeId: selectedNodeId, nodeId: result.nodeId, splineId: resolvedActiveId, kind: activeSpline.kind, selectedNode: getSelectedNodeContext() }
            );

            setRiverGraph(result.graph);
            setSelectedNodeId(result.nodeId);
          } catch (e) {
            console.log('⚠️ Insert failed:', e);
            actionLogger.log(
              'INSERT_NODE',
              `Insert node failed in ${activeSpline.kind}`,
              riverGraph,
              riverGraph,
              { x, y, afterNodeId: selectedNodeId, splineId: resolvedActiveId, kind: activeSpline.kind, selectedNode: getSelectedNodeContext() },
              String(e)
            );
          }

          return;
        }

        console.log('🌊 Editing independent river spline');

        if (selectedNodeId && selectedIndex !== -1) {
          if (isSource) {
            const result = GraphService.extendUpstream(riverGraph, resolvedActiveId, x, y);

            actionLogger.log(
              'EXTEND_UPSTREAM',
              `Extend river ${resolvedActiveId.slice(0, 8)}... upstream to (${Math.round(x)}, ${Math.round(y)})`,
              riverGraph,
              result.graph,
              {
                x,
                y,
                nodeId: result.nodeId,
                splineId: resolvedActiveId,
                isTributary: false,
                selectedNode: getSelectedNodeContext(),
              }
            );

            setRiverGraph(result.graph);
            setSelectedNodeId(result.nodeId);
            return;
          }

          if (isMouth) {
            const result = GraphService.extendDownstream(riverGraph, resolvedActiveId, x, y);

            actionLogger.log(
              'EXTEND_DOWNSTREAM',
              `Extend river ${resolvedActiveId.slice(0, 8)}... downstream to (${Math.round(x)}, ${Math.round(y)})`,
              riverGraph,
              result.graph,
              {
                x,
                y,
                nodeId: result.nodeId,
                splineId: resolvedActiveId,
                isTributary: false,
                selectedNode: getSelectedNodeContext(),
              }
            );

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

        actionLogger.log(
          'EXTEND_DOWNSTREAM',
          `Extend river ${resolvedActiveId.slice(0, 8)}... downstream to (${Math.round(x)}, ${Math.round(y)})`,
          riverGraph,
          result.graph,
          {
            x,
            y,
            nodeId: result.nodeId,
            splineId: resolvedActiveId,
            isTributary: false,
            selectedNode: getSelectedNodeContext(),
          }
        );

        setRiverGraph(result.graph);
        setSelectedNodeId(result.nodeId);
      }
    },
    [riverGraph, activeSplineId, selectedNodeId, newSplineSession, actionLogger]
  );

  /**
   * Moves a node to a new position (used during drag - no logging here)
   * Logging happens in pointer up handler to avoid spam
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
      // Track state before deletion for logging
      const isJunction = GraphService.isJunctionNode(riverGraph, nodeId);
      const affectedSplines: string[] = [];
      const beforeSplineIds = new Set(Object.keys(riverGraph.splines));
      const beforeNodeIds = new Set(Object.keys(riverGraph.nodes));

      // Find all splines affected by this deletion
      Object.values(riverGraph.splines).forEach((s) => {
        const spline = s as Spline;
        if (spline.nodeIds.includes(nodeId as string)) {
          affectedSplines.push(spline.id);
        }
      });

      // Find tributaries that will be detached (if junction)
      const detachedTributaries: string[] = [];
      if (isJunction) {
        Object.values(riverGraph.splines).forEach((s) => {
          const spline = s as Spline;
          if (spline.parentJunction === nodeId) {
            detachedTributaries.push(spline.id);
          }
        });
      }

      // Execute deletion
      let newGraph = GraphService.deleteNode(riverGraph, nodeId);
      newGraph = ensureMainSpline(newGraph);

      // Track what was automatically deleted
      const afterSplineIds = new Set(Object.keys(newGraph.splines));
      const afterNodeIds = new Set(Object.keys(newGraph.nodes));

      const deletedSplines = Array.from(beforeSplineIds).filter(id => !afterSplineIds.has(id));
      const deletedNodes = Array.from(beforeNodeIds).filter(id => !afterNodeIds.has(id));

      // Log the node deletion
      const description = isJunction
        ? `Delete junction node ${nodeId.slice(0, 8)}... (detached ${detachedTributaries.length} child(ren))`
        : `Delete node ${nodeId.slice(0, 8)}...`;

      actionLogger.log(
        'DELETE_NODE',
        description,
        riverGraph,
        newGraph,
        {
          nodeId,
          isJunction,
          affectedSplines,
          detachedTributaries,
          selectedNode: getSelectedNodeContext(),
        }
      );

      // Log DETACH operations for each detached tributary/stream
      if (detachedTributaries.length > 0) {
        detachedTributaries.forEach(tribId => {
          const detachedSpline = riverGraph.splines[tribId as SplineId];
          actionLogger.log(
            'DETACH_TRIBUTARY',
            `${detachedSpline?.kind || 'Child'} ${tribId.slice(0, 8)}... auto-detached (junction deleted)`,
            riverGraph,
            newGraph,
            { tributaryId: tribId, junctionNodeId: nodeId, reason: 'junction_deleted', kind: detachedSpline?.kind, selectedNode: getSelectedNodeContext() }
          );
        });
      }

      // Log automatic spline deletions (when <2 nodes remain)
      const autoDeletedSplines = deletedSplines.filter(id => !affectedSplines.includes(id) ||
        (riverGraph.splines[id as SplineId]?.nodeIds.length ?? 0) <= 2);

      if (autoDeletedSplines.length > 0) {
        autoDeletedSplines.forEach(splineId => {
          const deletedSpline = riverGraph.splines[splineId as SplineId];
          if (deletedSpline) {
            actionLogger.log(
              'DELETE_SPLINE',
              `Spline ${splineId.slice(0, 8)}... auto-deleted (< 2 nodes after node deletion)`,
              riverGraph,
              newGraph,
              {
                splineId,
                reason: 'insufficient_nodes',
                previousNodeCount: deletedSpline.nodeIds.length,
                kind: deletedSpline.kind,
                selectedNode: getSelectedNodeContext()
              }
            );
          }
        });
      }

      // Log automatic node deletions (orphaned nodes or cascade from spline deletion)
      const autoDeletedNodes = deletedNodes.filter(id => id !== nodeId);
      if (autoDeletedNodes.length > 0) {
        autoDeletedNodes.forEach(autoNodeId => {
          const deletedNode = riverGraph.nodes[autoNodeId as NodeId];
          if (deletedNode) {
            actionLogger.log(
              'DELETE_NODE',
              `Node ${autoNodeId.slice(0, 8)}... auto-deleted (orphaned or cascade)`,
              riverGraph,
              newGraph,
              {
                nodeId: autoNodeId,
                reason: 'cascade_deletion',
                kind: deletedNode.kind,
                selectedNode: getSelectedNodeContext()
              }
            );
          }
        });
      }

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
    [riverGraph, selectedNodeId, activeSplineId, ensureMainSpline, actionLogger]
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
      const draggedKind = getNodeKind(riverGraph, draggedNodeId);
      const targetKind = getNodeKind(riverGraph, targetNodeId);
      const survivorKind = draggedNodeId === survivorNodeId ? draggedKind : targetKind;

      const newGraph = GraphService.mergeNodes(riverGraph, draggedNodeId, targetNodeId, survivorNodeId);

      actionLogger.log(
        'MERGE_NODES',
        `Merge ${draggedKind} node ${draggedNodeId.slice(0, 8)}... → ${targetKind} node ${targetNodeId.slice(0, 8)}... (survivor: ${survivorKind})`,
        riverGraph,
        newGraph,
        {
          draggedNodeId,
          targetNodeId,
          survivorNodeId,
          draggedKind,
          targetKind,
          survivorKind,
          selectedNode: getSelectedNodeContext(),
        }
      );

      setRiverGraph(newGraph);

      // Update selected node to survivor if one of the merged nodes was selected
      if (selectedNodeId === draggedNodeId || selectedNodeId === targetNodeId) {
        setSelectedNodeId(survivorNodeId);
      }
    },
    [riverGraph, selectedNodeId, actionLogger]
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
        (spline as Spline).nodeIds.includes(draggedNodeId as string)
      );
      const targetSplineEntry = Object.entries(riverGraph.splines).find(([, spline]) =>
        (spline as Spline).nodeIds.includes(targetNodeId as string)
      );

      const draggedSplineId = draggedSplineEntry ? draggedSplineEntry[0] : 'unknown';
      const targetSplineId = targetSplineEntry ? targetSplineEntry[0] : 'unknown';

      let newGraph = GraphService.attachSplineAsTributary(riverGraph, draggedNodeId, targetNodeId);

      if (draggedSplineEntry && targetSplineEntry) {
        const [, draggedSpline] = draggedSplineEntry as [string, Spline];
        const [targetSplineIdStr] = targetSplineEntry as [string, Spline];

        if (draggedSpline.isMain) {
          newGraph = GraphService.setExclusiveMainSpline(newGraph, targetSplineIdStr as SplineId);
        }
      }

      newGraph = ensureMainSpline(newGraph);

      actionLogger.log(
        'ATTACH_TRIBUTARY',
        `Attach spline ${draggedSplineId.slice(0, 8)}... as tributary to ${targetSplineId.slice(0, 8)}... at junction ${targetNodeId.slice(0, 8)}...`,
        riverGraph,
        newGraph,
        {
          draggedNodeId,
          targetNodeId,
          draggedSplineId,
          targetSplineId,
          newJunctionId: targetNodeId,
          selectedNode: getSelectedNodeContext(),
        }
      );

      setRiverGraph(newGraph);

      // Update selected node to target (new junction)
      setSelectedNodeId(targetNodeId);
    },
    [riverGraph, ensureMainSpline, actionLogger]
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
      // Find which splines are involved
      const draggedSplineEntry = Object.entries(riverGraph.splines).find(([, spline]) =>
        (spline as Spline).nodeIds.includes(draggedNodeId as string)
      );
      const targetSplineEntry = Object.entries(riverGraph.splines).find(([, spline]) =>
        (spline as Spline).nodeIds.includes(targetNodeId as string)
      );

      const draggedSplineId = draggedSplineEntry ? draggedSplineEntry[0] : 'unknown';
      const targetSplineId = targetSplineEntry ? targetSplineEntry[0] : 'unknown';

      const draggedKind = getNodeKind(riverGraph, draggedNodeId);
      const targetKind = getNodeKind(riverGraph, targetNodeId);

      const newGraph = GraphService.mergeSplines(
        riverGraph,
        draggedNodeId,
        targetNodeId
      );

      actionLogger.log(
        'MERGE_SPLINES',
        `Merge spline ${draggedSplineId.slice(0, 8)}... (${draggedKind}) → ${targetSplineId.slice(0, 8)}... (${targetKind}) - river extension`,
        riverGraph,
        newGraph,
        {
          draggedNodeId,
          targetNodeId,
          draggedSplineId,
          targetSplineId,
          draggedKind,
          targetKind,
          selectedNode: getSelectedNodeContext(),
        }
      );

      setRiverGraph(newGraph);
    },
    [riverGraph, actionLogger]
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

    // Action logger (for debugging)
    actionLogger,
  };
};
