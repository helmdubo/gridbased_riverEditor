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
  Spline,
  SplineId,
  SplineKind,
  Width,
} from './types';
import { makeNodeId, makeSplineId } from './types';
import { generateId } from '../geometry/geometry';

/**
 * Result of an operation that creates a new node
 */
export interface AddNodeResult {
  graph: RiverGraphV2;
  nodeId: NodeId;
}

/**
 * Result of an operation that creates a new spline
 */
export interface CreateSplineResult {
  graph: RiverGraphV2;
  splineId: SplineId;
}

/**
 * Creates a deep copy of a graph (for immutability)
 */
function cloneGraph(graph: RiverGraphV2): RiverGraphV2 {
  return {
    nodes: { ...graph.nodes },
    splines: Object.fromEntries(
      Object.entries(graph.splines).map(([id, spline]) => [
        id,
        {
          ...spline,
          nodeIds: [...spline.nodeIds],
          width: { ...spline.width },
        },
      ])
    ),
    mainSplineId: graph.mainSplineId,
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
 * WARNING: This will also remove the node from any splines that reference it.
 * If this causes an spline to have <2 nodes, that spline is deleted too.
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

  // Remove node from all splines and delete splines that become invalid
  const splinesToDelete: SplineId[] = [];
  const detachments: Array<{ parentId: SplineId; childId: SplineId }> = [];

  for (const [splineId, spline] of Object.entries(newGraph.splines)) {
    const newNodeIds = spline.nodeIds.filter((id) => id !== nodeId);

    if (!spline.nodeIds.includes(nodeId as string)) {
      continue;
    }

    if (newNodeIds.length < 2) {
      // Spline becomes invalid (less than 2 nodes)
      splinesToDelete.push(splineId as SplineId);
      continue;
    }

    let updatedSpline: Spline = {
      ...spline,
      nodeIds: newNodeIds,
    };

    if (spline.kind === 'tributary' && spline.parentJunction === nodeId && spline.parentId) {
      // Junction removed: detach tributary and let it become independent
      detachments.push({ parentId: spline.parentId, childId: splineId as SplineId });
      updatedSpline = {
        ...updatedSpline,
        kind: 'river',
        parentId: null,
        parentJunction: null,
      };
    }

    newGraph.splines[splineId] = updatedSpline;
  }

  // Delete invalid splines
  for (const splineId of splinesToDelete) {
    delete newGraph.splines[splineId];
    if (newGraph.mainSplineId === splineId) {
      newGraph.mainSplineId = null;
    }
  }

  // Remove detached tributaries from their former parents
  for (const { parentId, childId } of detachments) {
    const parentSpline = newGraph.splines[parentId];
    if (!parentSpline) continue;
    newGraph.splines[parentId] = {
      ...parentSpline,
      children: parentSpline.children.filter((id) => id !== childId),
    };
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
 * Creates a new spline in the graph
 *
 * Creates an spline connecting the specified nodes. The order of nodeIds defines
 * the downstream flow: nodeIds[0] = source, nodeIds[last] = mouth.
 *
 * @param graph - Current graph state
 * @param kind - Spline type ('river' for independent, 'tributary' for attached child)
 * @param nodeIds - Array of node IDs defining the spline path (must be ≥1)
 * @param width - Width specification (px or relative)
 * @returns New graph with spline created and the new spline's ID
 *
 * @ue_equivalent
 * UFUNCTION(BlueprintCallable)
 * static FRiverGraph CreateSpline(const FRiverGraph& Graph, ERiverEdgeKind Kind,
 *                                const TArray<FGuid>& NodeIds, FRiverWidth Width,
 *                                FGuid& OutEdgeId);
 */
export function createSpline(
  graph: RiverGraphV2,
  kind: SplineKind,
  nodeIds: NodeId[],
  width: Width
): CreateSplineResult {
  // Note: Allow spline with 1 node for initial creation (UX convenience)
  // Curve rendering will require at least 2 nodes, but graph can store 1-node spline
  if (nodeIds.length < 1) {
    throw new Error('Cannot create spline with no nodes');
  }

  const newGraph = cloneGraph(graph);
  const splineId = makeSplineId(generateId());

  const spline: Spline = {
    id: splineId,
    kind,
    nodeIds: nodeIds as string[],
    parentId: null,           // Independent river by default
    parentJunction: null,
    width,
    children: [],             // No children by default
  };

  newGraph.splines[splineId] = spline;

  // If this is the first 'river' spline and no mainSplineId set, make it main
  if (kind === 'river' && newGraph.mainSplineId === null) {
    newGraph.mainSplineId = splineId;
  }

  return {
    graph: newGraph,
    splineId,
  };
}

/**
 * Splits an spline by inserting a new node at the specified index
 *
 * The new node is inserted between nodeIds[atIndex] and nodeIds[atIndex+1].
 * The node position should be computed externally (e.g., from curve interpolation).
 *
 * @param graph - Current graph state
 * @param splineId - ID of spline to split
 * @param newNodeId - ID of the new node to insert (must already exist in graph.nodes)
 * @param atIndex - Index where to insert the node (0-based)
 * @returns New graph with spline split
 *
 * @ue_equivalent
 * UFUNCTION(BlueprintCallable)
 * static FRiverGraph SplitSpline(const FRiverGraph& Graph, const FGuid& SplineId,
 *                               const FGuid& NewNodeId, int32 AtIndex);
 */
export function splitSpline(
  graph: RiverGraphV2,
  splineId: SplineId,
  newNodeId: NodeId,
  atIndex: number
): RiverGraphV2 {
  const newGraph = cloneGraph(graph);
  const spline = newGraph.splines[splineId];

  if (!spline) {
    throw new Error(`Spline ${splineId} not found`);
  }

  if (!newGraph.nodes[newNodeId]) {
    throw new Error(`Node ${newNodeId} not found`);
  }

  if (atIndex < 0 || atIndex >= spline.nodeIds.length) {
    throw new Error(`Invalid index ${atIndex} for spline with ${spline.nodeIds.length} nodes`);
  }

  // Insert new node at specified index
  const newNodeIds = [...spline.nodeIds];
  newNodeIds.splice(atIndex + 1, 0, newNodeId as string);

  newGraph.splines[splineId] = {
    ...spline,
    nodeIds: newNodeIds,
  };

  return newGraph;
}

/**
 * Deletes an spline from the graph
 *
 * Note: This does not delete the nodes that were part of the spline.
 * Use with deleteNode() if you want to clean up orphaned nodes.
 *
 * @param graph - Current graph state
 * @param splineId - ID of spline to delete
 * @returns New graph with spline removed
 *
 * @ue_equivalent
 * UFUNCTION(BlueprintCallable)
 * static FRiverGraph DeleteSpline(const FRiverGraph& Graph, const FGuid& SplineId);
 */
export function deleteSpline(graph: RiverGraphV2, splineId: SplineId): RiverGraphV2 {
  const newGraph = cloneGraph(graph);

  delete newGraph.splines[splineId];

  // If we deleted the main spline, clear mainSplineId
  if (newGraph.mainSplineId === splineId) {
    newGraph.mainSplineId = null;
  }

  return newGraph;
}

/**
 * Attaches an independent river as a tributary to a parent river at a junction node
 *
 * This operation (following invariants V2-V7):
 * 1. Sets tributary's parentId to parent river spline
 * 2. Sets parentJunction to the junction node
 * 3. Changes kind to 'tributary'
 * 4. Makes last node of tributary (mouth) the junction node
 * 5. Adds tributary to parent's children array
 * 6. Applies width constraint (V7): min(child.widthPx, parent.widthPx)
 *
 * @param graph - Current graph state
 * @param childSplineId - ID of spline to attach as tributary
 * @param parentSplineId - ID of parent river spline
 * @param junctionNodeId - ID of node where tributary joins (must be in parent.nodeIds[1..last])
 * @returns New graph with tributary attached
 *
 * @throws If child already has tributaries (V3), child already attached (V2),
 *         junction not in valid position (V5), or splines not found
 *
 * @ue_equivalent
 * UFUNCTION(BlueprintCallable)
 * static FRiverGraph AttachTributary(const FRiverGraph& Graph, const FGuid& ChildEdgeId,
 *                                     const FGuid& ParentEdgeId, const FGuid& JunctionNodeId);
 */
export function attachTributary(
  graph: RiverGraphV2,
  childSplineId: SplineId,
  parentSplineId: SplineId,
  junctionNodeId: NodeId
): RiverGraphV2 {
  const newGraph = cloneGraph(graph);
  const childSpline = newGraph.splines[childSplineId];
  const parentSpline = newGraph.splines[parentSplineId];

  if (!childSpline) {
    throw new Error(`Child spline ${childSplineId} not found`);
  }

  if (!parentSpline) {
    throw new Error(`Parent spline ${parentSplineId} not found`);
  }

  // V3: Rivers with tributaries cannot be tributaries themselves
  if (childSpline.children.length > 0) {
    throw new Error(`Spline ${childSplineId} has tributaries and cannot be attached as tributary`);
  }

  // V2: Child cannot already be attached
  if (childSpline.parentId !== null) {
    throw new Error(`Spline ${childSplineId} is already attached to ${childSpline.parentId}`);
  }

  if (!newGraph.nodes[junctionNodeId]) {
    throw new Error(`Junction node ${junctionNodeId} not found`);
  }

  // V5: Junction must be in parent.nodeIds[1..last] (not at index 0 = source)
  const junctionIndex = parentSpline.nodeIds.indexOf(junctionNodeId as string);
  if (junctionIndex < 1) {
    throw new Error(`Junction node must not be at source (index 0) of parent river`);
  }

  // Update child: set mouth (last node) to junction
  const newNodeIds = [...childSpline.nodeIds];
  newNodeIds[newNodeIds.length - 1] = junctionNodeId as string;

  // V7: Apply width constraint if relative
  let newWidth = childSpline.width;
  if (childSpline.width.kind === 'relative' && parentSpline.width.kind === 'px') {
    const childWidthPx = (childSpline.width.value / 100) * parentSpline.width.value;
    newWidth = { kind: 'px', value: Math.min(childWidthPx, parentSpline.width.value) };
  }

  // Update child spline
  newGraph.splines[childSplineId] = {
    ...childSpline,
    kind: 'tributary',
    nodeIds: newNodeIds,
    parentId: parentSplineId,
    parentJunction: junctionNodeId,
    width: newWidth,
  };

  // Update parent: add child to children array
  newGraph.splines[parentSplineId] = {
    ...parentSpline,
    children: [...parentSpline.children, childSplineId],
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
 * @param tribEdgeId - ID of tributary spline to detach
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
  tribSplineId: SplineId,
  createNewMouthNode: boolean = false
): AddNodeResult {
  const newGraph = cloneGraph(graph);
  const tribSpline = newGraph.splines[tribSplineId];

  if (!tribSpline) {
    throw new Error(`Tributary spline ${tribSplineId} not found`);
  }

  if (tribSpline.kind !== 'tributary') {
    throw new Error(`Spline ${tribSplineId} is not a tributary`);
  }

  const parentSplineId = tribSpline.parentId;
  if (!parentSplineId) {
    throw new Error(`Tributary ${tribSplineId} has no parent (already detached?)`);
  }

  // Get mouth node (last node in tributary)
  let newMouthNodeId: NodeId = tribSpline.nodeIds[tribSpline.nodeIds.length - 1] as NodeId;

  // Optionally create a new mouth node
  if (createNewMouthNode && newMouthNodeId) {
    const oldMouthNode = newGraph.nodes[newMouthNodeId];
    if (oldMouthNode) {
      const addResult = addNode(newGraph, oldMouthNode.x, oldMouthNode.y);
      newGraph.nodes = addResult.graph.nodes;
      newMouthNodeId = addResult.nodeId;

      // Update tributary to use new mouth node
      const newNodeIds = [...tribSpline.nodeIds];
      newNodeIds[newNodeIds.length - 1] = newMouthNodeId as string;
      newGraph.splines[tribSplineId] = {
        ...tribSpline,
        nodeIds: newNodeIds,
      };
    }
  }

  // Remove tributary from parent's children array
  const parentSpline = newGraph.splines[parentSplineId];
  if (parentSpline) {
    newGraph.splines[parentSplineId] = {
      ...parentSpline,
      children: parentSpline.children.filter(id => id !== tribSplineId),
    };
  }

  // Detach tributary: make it independent river
  newGraph.splines[tribSplineId] = {
    ...newGraph.splines[tribSplineId],
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
 * Reverses the direction of an spline by reversing its nodeIds array
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
 * @param splineId - ID of spline to reverse
 * @returns New graph with spline direction reversed
 *
 * @ue_equivalent
 * UFUNCTION(BlueprintCallable)
 * static FRiverGraph ReverseSpline(const FRiverGraph& Graph, const FGuid& SplineId);
 */
export function reverseSpline(graph: RiverGraphV2, splineId: SplineId): RiverGraphV2 {
  const newGraph = cloneGraph(graph);
  const spline = newGraph.splines[splineId];

  if (!spline) {
    throw new Error(`Spline ${splineId} not found`);
  }

  // Reverse the nodeIds array
  newGraph.splines[splineId] = {
    ...spline,
    nodeIds: [...spline.nodeIds].reverse(),
  };

  return newGraph;
}

/**
 * Extends an spline upstream by adding a new node at the source end
 *
 * @param graph - Current graph state
 * @param splineId - ID of spline to extend
 * @param x - X coordinate of new source node
 * @param y - Y coordinate of new source node
 * @returns New graph with spline extended upstream and new node ID
 *
 * @ue_equivalent
 * UFUNCTION(BlueprintCallable)
 * static FRiverGraph ExtendUpstream(const FRiverGraph& Graph, const FGuid& SplineId,
 *                                    float X, float Y, FGuid& OutNewNodeId);
 */
export function extendUpstream(
  graph: RiverGraphV2,
  splineId: SplineId,
  x: number,
  y: number
): AddNodeResult {
  const newGraph = cloneGraph(graph);
  const spline = newGraph.splines[splineId];

  if (!spline) {
    throw new Error(`Spline ${splineId} not found`);
  }

  // Create new node
  const addResult = addNode(newGraph, x, y);
  const newNodeId = addResult.nodeId;
  newGraph.nodes = addResult.graph.nodes;

  // Prepend new node to spline (becomes new source)
  newGraph.splines[splineId] = {
    ...spline,
    nodeIds: [newNodeId as string, ...spline.nodeIds],
  };

  return {
    graph: newGraph,
    nodeId: newNodeId,
  };
}

/**
 * Extends an spline downstream by adding a new node at the mouth end
 *
 * This operation allows extending from mouth even if it's a junction node (V5 case).
 *
 * @param graph - Current graph state
 * @param splineId - ID of spline to extend
 * @param x - X coordinate of new mouth node
 * @param y - Y coordinate of new mouth node
 * @returns New graph with spline extended downstream and new node ID
 *
 * @ue_equivalent
 * UFUNCTION(BlueprintCallable)
 * static FRiverGraph ExtendDownstream(const FRiverGraph& Graph, const FGuid& SplineId,
 *                                      float X, float Y, FGuid& OutNewNodeId);
 */
export function extendDownstream(
  graph: RiverGraphV2,
  splineId: SplineId,
  x: number,
  y: number
): AddNodeResult {
  const newGraph = cloneGraph(graph);
  const spline = newGraph.splines[splineId];

  if (!spline) {
    throw new Error(`Spline ${splineId} not found`);
  }

  // Create new node
  const addResult = addNode(newGraph, x, y);
  const newNodeId = addResult.nodeId;
  newGraph.nodes = addResult.graph.nodes;

  // Append new node to spline (becomes new mouth)
  newGraph.splines[splineId] = {
    ...spline,
    nodeIds: [...spline.nodeIds, newNodeId as string],
  };

  return {
    graph: newGraph,
    nodeId: newNodeId,
  };
}

/**
 * Inserts a new node between two existing nodes in an spline
 *
 * @param graph - Current graph state
 * @param splineId - ID of spline to insert into
 * @param afterIndex - Index after which to insert (new node goes at afterIndex + 1)
 * @param x - X coordinate of new node
 * @param y - Y coordinate of new node
 * @returns New graph with node inserted and new node ID
 *
 * @ue_equivalent
 * UFUNCTION(BlueprintCallable)
 * static FRiverGraph InsertBetween(const FRiverGraph& Graph, const FGuid& SplineId,
 *                                   int32 AfterIndex, float X, float Y, FGuid& OutNewNodeId);
 */
export function insertBetween(
  graph: RiverGraphV2,
  splineId: SplineId,
  afterIndex: number,
  x: number,
  y: number
): AddNodeResult {
  const newGraph = cloneGraph(graph);
  const spline = newGraph.splines[splineId];

  if (!spline) {
    throw new Error(`Spline ${splineId} not found`);
  }

  if (afterIndex < 0 || afterIndex >= spline.nodeIds.length) {
    throw new Error(`Invalid afterIndex ${afterIndex} for spline with ${spline.nodeIds.length} nodes`);
  }

  // Create new node
  const addResult = addNode(newGraph, x, y);
  const newNodeId = addResult.nodeId;
  newGraph.nodes = addResult.graph.nodes;

  // Insert new node after afterIndex
  const newNodeIds = [...spline.nodeIds];
  newNodeIds.splice(afterIndex + 1, 0, newNodeId as string);

  newGraph.splines[splineId] = {
    ...spline,
    nodeIds: newNodeIds,
  };

  return {
    graph: newGraph,
    nodeId: newNodeId,
  };
}

/**
 * Updates the width of an spline
 *
 * @param graph - Current graph state
 * @param splineId - ID of spline to update
 * @param width - New width specification
 * @returns New graph with spline width updated
 *
 * @ue_equivalent
 * UFUNCTION(BlueprintCallable)
 * static FRiverGraph UpdateSplineWidth(const FRiverGraph& Graph, const FGuid& SplineId,
 *                                     FRiverWidth NewWidth);
 */
export function updateSplineWidth(
  graph: RiverGraphV2,
  splineId: SplineId,
  width: Width
): RiverGraphV2 {
  const newGraph = cloneGraph(graph);
  const spline = newGraph.splines[splineId];

  if (!spline) {
    throw new Error(`Spline ${splineId} not found`);
  }

  newGraph.splines[splineId] = {
    ...spline,
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
    splines: {},
    mainSplineId: null,
  };
}
