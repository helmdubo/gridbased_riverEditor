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
} from './types';
import { makeNodeId, makeEdgeId } from './types';
import { generateId } from '../geometry/geometry';

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
 * Creates an edge connecting the specified nodes. The order of nodeIds defines
 * the downstream flow: nodeIds[0] = source, nodeIds[last] = mouth.
 *
 * @param graph - Current graph state
 * @param kind - Edge type ('river' for independent, 'tributary' for attached child)
 * @param nodeIds - Array of node IDs defining the edge path (must be ≥1)
 * @param width - Width specification (px or relative)
 * @returns New graph with edge created and the new edge's ID
 *
 * @ue_equivalent
 * UFUNCTION(BlueprintCallable)
 * static FRiverGraph CreateEdge(const FRiverGraph& Graph, ERiverEdgeKind Kind,
 *                                const TArray<FGuid>& NodeIds, FRiverWidth Width,
 *                                FGuid& OutEdgeId);
 */
export function createEdge(
  graph: RiverGraphV2,
  kind: EdgeKind,
  nodeIds: NodeId[],
  width: Width
): CreateEdgeResult {
  // Note: Allow edge with 1 node for initial creation (UX convenience)
  // Curve rendering will require at least 2 nodes, but graph can store 1-node edge
  if (nodeIds.length < 1) {
    throw new Error('Cannot create edge with no nodes');
  }

  const newGraph = cloneGraph(graph);
  const edgeId = makeEdgeId(generateId());

  const edge: Edge = {
    id: edgeId,
    kind,
    nodeIds: nodeIds as string[],
    parentId: null,           // Independent river by default
    parentJunction: null,
    width,
    children: [],             // No children by default
  };

  newGraph.edges[edgeId] = edge;

  // If this is the first 'river' edge and no mainEdgeId set, make it main
  if (kind === 'river' && newGraph.mainEdgeId === null) {
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
 * Attaches an independent river as a tributary to a parent river at a junction node
 *
 * This operation (following invariants V2-V7):
 * 1. Sets tributary's parentId to parent river edge
 * 2. Sets parentJunction to the junction node
 * 3. Changes kind to 'tributary'
 * 4. Makes last node of tributary (mouth) the junction node
 * 5. Adds tributary to parent's children array
 * 6. Applies width constraint (V7): min(child.widthPx, parent.widthPx)
 *
 * @param graph - Current graph state
 * @param childEdgeId - ID of edge to attach as tributary
 * @param parentEdgeId - ID of parent river edge
 * @param junctionNodeId - ID of node where tributary joins (must be in parent.nodeIds[1..last])
 * @returns New graph with tributary attached
 *
 * @throws If child already has tributaries (V3), child already attached (V2),
 *         junction not in valid position (V5), or edges not found
 *
 * @ue_equivalent
 * UFUNCTION(BlueprintCallable)
 * static FRiverGraph AttachTributary(const FRiverGraph& Graph, const FGuid& ChildEdgeId,
 *                                     const FGuid& ParentEdgeId, const FGuid& JunctionNodeId);
 */
export function attachTributary(
  graph: RiverGraphV2,
  childEdgeId: EdgeId,
  parentEdgeId: EdgeId,
  junctionNodeId: NodeId
): RiverGraphV2 {
  const newGraph = cloneGraph(graph);
  const childEdge = newGraph.edges[childEdgeId];
  const parentEdge = newGraph.edges[parentEdgeId];

  if (!childEdge) {
    throw new Error(`Child edge ${childEdgeId} not found`);
  }

  if (!parentEdge) {
    throw new Error(`Parent edge ${parentEdgeId} not found`);
  }

  // V3: Rivers with tributaries cannot be tributaries themselves
  if (childEdge.children.length > 0) {
    throw new Error(`Edge ${childEdgeId} has tributaries and cannot be attached as tributary`);
  }

  // V2: Child cannot already be attached
  if (childEdge.parentId !== null) {
    throw new Error(`Edge ${childEdgeId} is already attached to ${childEdge.parentId}`);
  }

  if (!newGraph.nodes[junctionNodeId]) {
    throw new Error(`Junction node ${junctionNodeId} not found`);
  }

  // V5: Junction must be in parent.nodeIds[1..last] (not at index 0 = source)
  const junctionIndex = parentEdge.nodeIds.indexOf(junctionNodeId as string);
  if (junctionIndex < 1) {
    throw new Error(`Junction node must not be at source (index 0) of parent river`);
  }

  // Update child: set mouth (last node) to junction
  const newNodeIds = [...childEdge.nodeIds];
  newNodeIds[newNodeIds.length - 1] = junctionNodeId as string;

  // V7: Apply width constraint if relative
  let newWidth = childEdge.width;
  if (childEdge.width.kind === 'relative' && parentEdge.width.kind === 'px') {
    const childWidthPx = (childEdge.width.value / 100) * parentEdge.width.value;
    newWidth = { kind: 'px', value: Math.min(childWidthPx, parentEdge.width.value) };
  }

  // Update child edge
  newGraph.edges[childEdgeId] = {
    ...childEdge,
    kind: 'tributary',
    nodeIds: newNodeIds,
    parentId: parentEdgeId,
    parentJunction: junctionNodeId as string,
    width: newWidth,
  };

  // Update parent: add child to children array
  newGraph.edges[parentEdgeId] = {
    ...parentEdge,
    children: [...parentEdge.children, childEdgeId],
  };

  return newGraph;
}

/**
 * Detaches a tributary from its parent river, making it an independent river
 *
 * This operation (following invariants V2-V4, V7):
 * 1. Removes tributary from parent's children array
 * 2. Sets tributary's parentId = null
 * 3. Sets parentJunction = null
 * 4. Changes kind to 'river'
 * 5. Keeps width as-is (V7: width remains frozen in px)
 * 6. Optionally creates a new mouth node to separate from junction
 *
 * @param graph - Current graph state
 * @param tribEdgeId - ID of tributary edge to detach
 * @param createNewMouthNode - If true, creates a new node for the mouth (default: false)
 * @returns New graph with tributary detached (and optionally new mouth node ID)
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

  const parentEdgeId = tribEdge.parentId;
  if (!parentEdgeId) {
    throw new Error(`Tributary ${tribEdgeId} has no parent (already detached?)`);
  }

  // Get mouth node (last node in tributary)
  let newMouthNodeId: NodeId = tribEdge.nodeIds[tribEdge.nodeIds.length - 1] as NodeId;

  // Optionally create a new mouth node
  if (createNewMouthNode && newMouthNodeId) {
    const oldMouthNode = newGraph.nodes[newMouthNodeId];
    if (oldMouthNode) {
      const addResult = addNode(newGraph, oldMouthNode.x, oldMouthNode.y);
      newGraph.nodes = addResult.graph.nodes;
      newMouthNodeId = addResult.nodeId;

      // Update tributary to use new mouth node
      const newNodeIds = [...tribEdge.nodeIds];
      newNodeIds[newNodeIds.length - 1] = newMouthNodeId as string;
      newGraph.edges[tribEdgeId] = {
        ...tribEdge,
        nodeIds: newNodeIds,
      };
    }
  }

  // Remove tributary from parent's children array
  const parentEdge = newGraph.edges[parentEdgeId];
  if (parentEdge) {
    newGraph.edges[parentEdgeId] = {
      ...parentEdge,
      children: parentEdge.children.filter(id => id !== tribEdgeId),
    };
  }

  // Detach tributary: make it independent river
  newGraph.edges[tribEdgeId] = {
    ...newGraph.edges[tribEdgeId],
    kind: 'river',
    parentId: null,
    parentJunction: null,
    // V7: width remains as-is (already in px if it was relative)
  };

  return {
    graph: newGraph,
    nodeId: newMouthNodeId,
  };
}

/**
 * Reverses the direction of an edge by reversing its nodeIds array
 *
 * This operation (following invariant V1):
 * - Reverses nodeIds: [source, ..., mouth] becomes [mouth, ..., source]
 * - New source becomes old mouth, new mouth becomes old source
 *
 * Use cases:
 * - Correcting flow direction when attaching tributary
 * - Converting "backwards" river to proper downstream flow
 *
 * @param graph - Current graph state
 * @param edgeId - ID of edge to reverse
 * @returns New graph with edge direction reversed
 *
 * @ue_equivalent
 * UFUNCTION(BlueprintCallable)
 * static FRiverGraph ReverseEdge(const FRiverGraph& Graph, const FGuid& EdgeId);
 */
export function reverseEdge(graph: RiverGraphV2, edgeId: EdgeId): RiverGraphV2 {
  const newGraph = cloneGraph(graph);
  const edge = newGraph.edges[edgeId];

  if (!edge) {
    throw new Error(`Edge ${edgeId} not found`);
  }

  // Reverse the nodeIds array
  newGraph.edges[edgeId] = {
    ...edge,
    nodeIds: [...edge.nodeIds].reverse(),
  };

  return newGraph;
}

/**
 * Extends an edge upstream by adding a new node at the source end
 *
 * @param graph - Current graph state
 * @param edgeId - ID of edge to extend
 * @param x - X coordinate of new source node
 * @param y - Y coordinate of new source node
 * @returns New graph with edge extended upstream and new node ID
 *
 * @ue_equivalent
 * UFUNCTION(BlueprintCallable)
 * static FRiverGraph ExtendUpstream(const FRiverGraph& Graph, const FGuid& EdgeId,
 *                                    float X, float Y, FGuid& OutNewNodeId);
 */
export function extendUpstream(
  graph: RiverGraphV2,
  edgeId: EdgeId,
  x: number,
  y: number
): AddNodeResult {
  const newGraph = cloneGraph(graph);
  const edge = newGraph.edges[edgeId];

  if (!edge) {
    throw new Error(`Edge ${edgeId} not found`);
  }

  // Create new node
  const addResult = addNode(newGraph, x, y);
  const newNodeId = addResult.nodeId;
  newGraph.nodes = addResult.graph.nodes;

  // Prepend new node to edge (becomes new source)
  newGraph.edges[edgeId] = {
    ...edge,
    nodeIds: [newNodeId as string, ...edge.nodeIds],
  };

  return {
    graph: newGraph,
    nodeId: newNodeId,
  };
}

/**
 * Extends an edge downstream by adding a new node at the mouth end
 *
 * This operation allows extending from mouth even if it's a junction node (V5 case).
 *
 * @param graph - Current graph state
 * @param edgeId - ID of edge to extend
 * @param x - X coordinate of new mouth node
 * @param y - Y coordinate of new mouth node
 * @returns New graph with edge extended downstream and new node ID
 *
 * @ue_equivalent
 * UFUNCTION(BlueprintCallable)
 * static FRiverGraph ExtendDownstream(const FRiverGraph& Graph, const FGuid& EdgeId,
 *                                      float X, float Y, FGuid& OutNewNodeId);
 */
export function extendDownstream(
  graph: RiverGraphV2,
  edgeId: EdgeId,
  x: number,
  y: number
): AddNodeResult {
  const newGraph = cloneGraph(graph);
  const edge = newGraph.edges[edgeId];

  if (!edge) {
    throw new Error(`Edge ${edgeId} not found`);
  }

  // Create new node
  const addResult = addNode(newGraph, x, y);
  const newNodeId = addResult.nodeId;
  newGraph.nodes = addResult.graph.nodes;

  // Append new node to edge (becomes new mouth)
  newGraph.edges[edgeId] = {
    ...edge,
    nodeIds: [...edge.nodeIds, newNodeId as string],
  };

  return {
    graph: newGraph,
    nodeId: newNodeId,
  };
}

/**
 * Inserts a new node between two existing nodes in an edge
 *
 * @param graph - Current graph state
 * @param edgeId - ID of edge to insert into
 * @param afterIndex - Index after which to insert (new node goes at afterIndex + 1)
 * @param x - X coordinate of new node
 * @param y - Y coordinate of new node
 * @returns New graph with node inserted and new node ID
 *
 * @ue_equivalent
 * UFUNCTION(BlueprintCallable)
 * static FRiverGraph InsertBetween(const FRiverGraph& Graph, const FGuid& EdgeId,
 *                                   int32 AfterIndex, float X, float Y, FGuid& OutNewNodeId);
 */
export function insertBetween(
  graph: RiverGraphV2,
  edgeId: EdgeId,
  afterIndex: number,
  x: number,
  y: number
): AddNodeResult {
  const newGraph = cloneGraph(graph);
  const edge = newGraph.edges[edgeId];

  if (!edge) {
    throw new Error(`Edge ${edgeId} not found`);
  }

  if (afterIndex < 0 || afterIndex >= edge.nodeIds.length) {
    throw new Error(`Invalid afterIndex ${afterIndex} for edge with ${edge.nodeIds.length} nodes`);
  }

  // Create new node
  const addResult = addNode(newGraph, x, y);
  const newNodeId = addResult.nodeId;
  newGraph.nodes = addResult.graph.nodes;

  // Insert new node after afterIndex
  const newNodeIds = [...edge.nodeIds];
  newNodeIds.splice(afterIndex + 1, 0, newNodeId as string);

  newGraph.edges[edgeId] = {
    ...edge,
    nodeIds: newNodeIds,
  };

  return {
    graph: newGraph,
    nodeId: newNodeId,
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
