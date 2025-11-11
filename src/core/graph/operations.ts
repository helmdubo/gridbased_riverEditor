/**
 * Pure functions for graph operations
 *
 * All functions in this module are pure and immutable:
 * - They do not modify the input graph
 * - They return a new graph with the requested changes
 * - They have no side effects
 *
 * This design makes them easy to:
 * - Test in isolation
 * - Implement undo/redo (just store graph snapshots)
 * - Port to UE5 Blueprint Function Library
 *
 * @module core/graph/operations
 */

import type {
  RiverGraphV2,
  Node,
  NodeId,
  Edge,
  EdgeId,
  EdgeKind,
  Width,
  FlowSign,
} from './types';
import { makeNodeId, makeEdgeId } from './types';

/**
 * Result of an operation that creates a new node
 */
export interface AddNodeResult {
  graph: RiverGraphV2;
  nodeId: NodeId;
}

/**
 * Result of an operation that creates a new edge
 */
export interface CreateEdgeResult {
  graph: RiverGraphV2;
  edgeId: EdgeId;
}

/**
 * Generates a unique ID (UUID v4)
 * @ue_equivalent FGuid::NewGuid() in UE5
 */
export function generateId(): string {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

/**
 * Creates a deep copy of a graph (for immutability)
 */
function cloneGraph(graph: RiverGraphV2): RiverGraphV2 {
  return {
    nodes: { ...graph.nodes },
    edges: Object.fromEntries(
      Object.entries(graph.edges).map(([id, edge]) => [
        id,
        {
          ...edge,
          nodeIds: [...edge.nodeIds],
          width: { ...edge.width },
        },
      ])
    ),
    mainEdgeId: graph.mainEdgeId,
  };
}

/**
 * Adds a new node to the graph at the specified position
 *
 * @param graph - Current graph state
 * @param x - X coordinate
 * @param y - Y coordinate
 * @returns New graph with added node and the new node's ID
 *
 * @ue_equivalent
 * UFUNCTION(BlueprintCallable)
 * static FRiverGraph AddNode(const FRiverGraph& Graph, FVector2D Position, FGuid& OutNodeId);
 */
export function addNode(graph: RiverGraphV2, x: number, y: number): AddNodeResult {
  const newGraph = cloneGraph(graph);
  const nodeId = makeNodeId(generateId());

  const node: Node = {
    id: nodeId,
    x,
    y,
  };

  newGraph.nodes[nodeId] = node;

  return {
    graph: newGraph,
    nodeId,
  };
}

/**
 * Deletes a node from the graph
 *
 * WARNING: This will also remove the node from any edges that reference it.
 * If this causes an edge to have <2 nodes, that edge is deleted too.
 *
 * @param graph - Current graph state
 * @param nodeId - ID of node to delete
 * @returns New graph with node removed
 *
 * @ue_equivalent
 * UFUNCTION(BlueprintCallable)
 * static FRiverGraph DeleteNode(const FRiverGraph& Graph, const FGuid& NodeId);
 */
export function deleteNode(graph: RiverGraphV2, nodeId: NodeId): RiverGraphV2 {
  const newGraph = cloneGraph(graph);

  // Remove node
  delete newGraph.nodes[nodeId];

  // Remove node from all edges and delete edges that become invalid
  const edgesToDelete: EdgeId[] = [];

  for (const [edgeId, edge] of Object.entries(newGraph.edges)) {
    const newNodeIds = edge.nodeIds.filter((id) => id !== nodeId);

    if (newNodeIds.length < 2) {
      // Edge becomes invalid (less than 2 nodes)
      edgesToDelete.push(edgeId as EdgeId);
    } else {
      // Update edge with filtered nodeIds
      newGraph.edges[edgeId] = {
        ...edge,
        nodeIds: newNodeIds,
      };
    }
  }

  // Delete invalid edges
  for (const edgeId of edgesToDelete) {
    delete newGraph.edges[edgeId];
    // If we deleted the main edge, clear mainEdgeId
    if (newGraph.mainEdgeId === edgeId) {
      newGraph.mainEdgeId = null;
    }
  }

  return newGraph;
}

/**
 * Moves a node to a new position
 *
 * @param graph - Current graph state
 * @param nodeId - ID of node to move
 * @param x - New X coordinate
 * @param y - New Y coordinate
 * @returns New graph with node moved
 *
 * @ue_equivalent
 * UFUNCTION(BlueprintCallable)
 * static FRiverGraph MoveNode(const FRiverGraph& Graph, const FGuid& NodeId, FVector2D NewPosition);
 */
export function moveNode(
  graph: RiverGraphV2,
  nodeId: NodeId,
  x: number,
  y: number
): RiverGraphV2 {
  const newGraph = cloneGraph(graph);

  if (newGraph.nodes[nodeId]) {
    newGraph.nodes[nodeId] = {
      ...newGraph.nodes[nodeId],
      x,
      y,
    };
  }

  return newGraph;
}

/**
 * Creates a new edge in the graph
 *
 * @param graph - Current graph state
 * @param kind - Edge type (main or tributary)
 * @param nodeIds - Array of node IDs defining the edge path (must be ≥2)
 * @param width - Width specification
 * @param flowSign - Flow direction (default: 1)
 * @returns New graph with edge created and the new edge's ID
 *
 * @ue_equivalent
 * UFUNCTION(BlueprintCallable)
 * static FRiverGraph CreateEdge(const FRiverGraph& Graph, ERiverEdgeKind Kind,
 *                                const TArray<FGuid>& NodeIds, FRiverWidth Width,
 *                                int32 FlowSign, FGuid& OutEdgeId);
 */
export function createEdge(
  graph: RiverGraphV2,
  kind: EdgeKind,
  nodeIds: NodeId[],
  width: Width,
  flowSign: FlowSign = 1
): CreateEdgeResult {
  if (nodeIds.length < 2) {
    throw new Error('Cannot create edge with less than 2 nodes');
  }

  const newGraph = cloneGraph(graph);
  const edgeId = makeEdgeId(generateId());

  const edge: Edge = {
    id: edgeId,
    kind,
    nodeIds: nodeIds as string[],
    width,
    flowSign,
    parentJunction: null,
    isDetached: kind === 'tributary', // Tributaries start detached
  };

  newGraph.edges[edgeId] = edge;

  // If this is the first main edge, set it as mainEdgeId
  if (kind === 'main' && newGraph.mainEdgeId === null) {
    newGraph.mainEdgeId = edgeId;
  }

  return {
    graph: newGraph,
    edgeId,
  };
}

/**
 * Splits an edge by inserting a new node at the specified index
 *
 * The new node is inserted between nodeIds[atIndex] and nodeIds[atIndex+1].
 * The node position should be computed externally (e.g., from curve interpolation).
 *
 * @param graph - Current graph state
 * @param edgeId - ID of edge to split
 * @param newNodeId - ID of the new node to insert (must already exist in graph.nodes)
 * @param atIndex - Index where to insert the node (0-based)
 * @returns New graph with edge split
 *
 * @ue_equivalent
 * UFUNCTION(BlueprintCallable)
 * static FRiverGraph SplitEdge(const FRiverGraph& Graph, const FGuid& EdgeId,
 *                               const FGuid& NewNodeId, int32 AtIndex);
 */
export function splitEdge(
  graph: RiverGraphV2,
  edgeId: EdgeId,
  newNodeId: NodeId,
  atIndex: number
): RiverGraphV2 {
  const newGraph = cloneGraph(graph);
  const edge = newGraph.edges[edgeId];

  if (!edge) {
    throw new Error(`Edge ${edgeId} not found`);
  }

  if (!newGraph.nodes[newNodeId]) {
    throw new Error(`Node ${newNodeId} not found`);
  }

  if (atIndex < 0 || atIndex >= edge.nodeIds.length) {
    throw new Error(`Invalid index ${atIndex} for edge with ${edge.nodeIds.length} nodes`);
  }

  // Insert new node at specified index
  const newNodeIds = [...edge.nodeIds];
  newNodeIds.splice(atIndex + 1, 0, newNodeId as string);

  newGraph.edges[edgeId] = {
    ...edge,
    nodeIds: newNodeIds,
  };

  return newGraph;
}

/**
 * Deletes an edge from the graph
 *
 * Note: This does not delete the nodes that were part of the edge.
 * Use with deleteNode() if you want to clean up orphaned nodes.
 *
 * @param graph - Current graph state
 * @param edgeId - ID of edge to delete
 * @returns New graph with edge removed
 *
 * @ue_equivalent
 * UFUNCTION(BlueprintCallable)
 * static FRiverGraph DeleteEdge(const FRiverGraph& Graph, const FGuid& EdgeId);
 */
export function deleteEdge(graph: RiverGraphV2, edgeId: EdgeId): RiverGraphV2 {
  const newGraph = cloneGraph(graph);

  delete newGraph.edges[edgeId];

  // If we deleted the main edge, clear mainEdgeId
  if (newGraph.mainEdgeId === edgeId) {
    newGraph.mainEdgeId = null;
  }

  return newGraph;
}

/**
 * Attaches a detached tributary to a junction node
 *
 * This operation:
 * 1. Sets the tributary's parentJunction to the specified node
 * 2. Sets isDetached = false
 * 3. Makes the first node of the tributary the same as the junction node
 *
 * @param graph - Current graph state
 * @param tribEdgeId - ID of tributary edge to attach
 * @param junctionNodeId - ID of node where tributary should join
 * @returns New graph with tributary attached
 *
 * @ue_equivalent
 * UFUNCTION(BlueprintCallable)
 * static FRiverGraph AttachTributary(const FRiverGraph& Graph, const FGuid& TribEdgeId,
 *                                     const FGuid& JunctionNodeId);
 */
export function attachTributary(
  graph: RiverGraphV2,
  tribEdgeId: EdgeId,
  junctionNodeId: NodeId
): RiverGraphV2 {
  const newGraph = cloneGraph(graph);
  const tribEdge = newGraph.edges[tribEdgeId];

  if (!tribEdge) {
    throw new Error(`Tributary edge ${tribEdgeId} not found`);
  }

  if (tribEdge.kind !== 'tributary') {
    throw new Error(`Edge ${tribEdgeId} is not a tributary`);
  }

  if (!newGraph.nodes[junctionNodeId]) {
    throw new Error(`Junction node ${junctionNodeId} not found`);
  }

  // Update tributary to attach to junction
  const newNodeIds = [...tribEdge.nodeIds];
  newNodeIds[0] = junctionNodeId as string; // First node (mouth) becomes junction

  newGraph.edges[tribEdgeId] = {
    ...tribEdge,
    nodeIds: newNodeIds,
    parentJunction: junctionNodeId as string,
    isDetached: false,
  };

  return newGraph;
}

/**
 * Detaches a tributary from its junction
 *
 * This operation:
 * 1. Sets isDetached = true
 * 2. Sets parentJunction = null
 * 3. Optionally creates a new node at the mouth position
 *
 * @param graph - Current graph state
 * @param tribEdgeId - ID of tributary edge to detach
 * @param createNewMouthNode - If true, creates a new node for the mouth (default: false)
 * @returns New graph with tributary detached (and optionally new node ID)
 *
 * @ue_equivalent
 * UFUNCTION(BlueprintCallable)
 * static FRiverGraph DetachTributary(const FRiverGraph& Graph, const FGuid& TribEdgeId,
 *                                     bool bCreateNewMouthNode, FGuid& OutNewNodeId);
 */
export function detachTributary(
  graph: RiverGraphV2,
  tribEdgeId: EdgeId,
  createNewMouthNode: boolean = false
): AddNodeResult {
  const newGraph = cloneGraph(graph);
  const tribEdge = newGraph.edges[tribEdgeId];

  if (!tribEdge) {
    throw new Error(`Tributary edge ${tribEdgeId} not found`);
  }

  if (tribEdge.kind !== 'tributary') {
    throw new Error(`Edge ${tribEdgeId} is not a tributary`);
  }

  let newMouthNodeId: NodeId = tribEdge.nodeIds[0] as NodeId;

  // Optionally create a new mouth node
  if (createNewMouthNode && tribEdge.nodeIds[0]) {
    const oldMouthNode = newGraph.nodes[tribEdge.nodeIds[0]];
    if (oldMouthNode) {
      const addResult = addNode(newGraph, oldMouthNode.x, oldMouthNode.y);
      newGraph.nodes = addResult.graph.nodes;
      newMouthNodeId = addResult.nodeId;

      // Update tributary to use new mouth node
      const newNodeIds = [...tribEdge.nodeIds];
      newNodeIds[0] = newMouthNodeId as string;
      newGraph.edges[tribEdgeId] = {
        ...tribEdge,
        nodeIds: newNodeIds,
      };
    }
  }

  // Detach tributary
  newGraph.edges[tribEdgeId] = {
    ...newGraph.edges[tribEdgeId],
    parentJunction: null,
    isDetached: true,
  };

  return {
    graph: newGraph,
    nodeId: newMouthNodeId,
  };
}

/**
 * Updates the width of an edge
 *
 * @param graph - Current graph state
 * @param edgeId - ID of edge to update
 * @param width - New width specification
 * @returns New graph with edge width updated
 *
 * @ue_equivalent
 * UFUNCTION(BlueprintCallable)
 * static FRiverGraph UpdateEdgeWidth(const FRiverGraph& Graph, const FGuid& EdgeId,
 *                                     FRiverWidth NewWidth);
 */
export function updateEdgeWidth(
  graph: RiverGraphV2,
  edgeId: EdgeId,
  width: Width
): RiverGraphV2 {
  const newGraph = cloneGraph(graph);
  const edge = newGraph.edges[edgeId];

  if (!edge) {
    throw new Error(`Edge ${edgeId} not found`);
  }

  newGraph.edges[edgeId] = {
    ...edge,
    width: { ...width },
  };

  return newGraph;
}

/**
 * Updates the flow sign of an edge
 *
 * @param graph - Current graph state
 * @param edgeId - ID of edge to update
 * @param flowSign - New flow direction (1 or -1)
 * @returns New graph with flow sign updated
 *
 * @ue_equivalent
 * UFUNCTION(BlueprintCallable)
 * static FRiverGraph UpdateFlowSign(const FRiverGraph& Graph, const FGuid& EdgeId,
 *                                    int32 NewFlowSign);
 */
export function updateFlowSign(
  graph: RiverGraphV2,
  edgeId: EdgeId,
  flowSign: FlowSign
): RiverGraphV2 {
  const newGraph = cloneGraph(graph);
  const edge = newGraph.edges[edgeId];

  if (!edge) {
    throw new Error(`Edge ${edgeId} not found`);
  }

  newGraph.edges[edgeId] = {
    ...edge,
    flowSign,
  };

  return newGraph;
}

/**
 * Creates an empty graph
 *
 * @ue_equivalent
 * UFUNCTION(BlueprintPure)
 * static FRiverGraph CreateEmptyGraph();
 */
export function createEmptyGraph(): RiverGraphV2 {
  return {
    nodes: {},
    edges: {},
    mainEdgeId: null,
  };
}
