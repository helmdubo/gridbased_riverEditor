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
  RiverAttributes,
} from './types';
import { makeNodeId, makeSplineId } from './types';
import { computeNodeKind, determineSplineKind } from './nodeKinds';
import { generateId } from '../geometry/geometry';

function cloneAttributes(attributes: RiverAttributes): RiverAttributes {
  return {
    ...attributes,
    width: { ...attributes.width },
  };
}

function applyAttributesToSpline(spline: Spline, attributes: RiverAttributes): Spline {
  const cloned = cloneAttributes(attributes);
  return {
    ...spline,
    attributes: cloned,
    width: { ...cloned.width },
  };
}

function syncRootMetadata(graph: RiverGraphV2): void {
  const uniqueRoots = Array.from(new Set(graph.rootSplineIds));
  graph.rootSplineIds = uniqueRoots;

  if (uniqueRoots.length === 0) {
    graph.mainSplineId = null;
    return;
  }

  if (!graph.mainSplineId || !uniqueRoots.includes(graph.mainSplineId)) {
    graph.mainSplineId = uniqueRoots[0];
  }
}

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
      Object.entries(graph.splines).map(([id, spline]) => {
        const clonedSpline = applyAttributesToSpline(
          {
            ...spline,
            nodeIds: [...spline.nodeIds],
            children: [...spline.children],
          },
          spline.attributes
        );

        return [id, clonedSpline];
      })
    ),
    rootSplineIds: [...graph.rootSplineIds],
    mainSplineId: graph.mainSplineId ?? null,
  };
}

/**
 * Recomputes node kinds for every node in the graph based on current topology
 */
function refreshAllNodeKinds(graph: RiverGraphV2): void {
  for (const nodeKey of Object.keys(graph.nodes)) {
    const nodeId = nodeKey as NodeId;
    const node = graph.nodes[nodeId];
    if (!node) {
      continue;
    }

    const nextKind = computeNodeKind(graph, nodeId);
    if (node.kind !== nextKind) {
      graph.nodes[nodeId] = { ...node, kind: nextKind };
    }
  }
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
    kind: 'inner',
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

      let detachedWidth = spline.attributes.width;
      if (detachedWidth.kind === 'relative') {
        const parentSpline = newGraph.splines[spline.parentId];
        if (parentSpline && parentSpline.attributes.width.kind === 'px') {
          detachedWidth = {
            kind: 'px',
            value:
              (detachedWidth.value / 100) * parentSpline.attributes.width.value,
          };
        }
      }

      updatedSpline = applyAttributesToSpline(
        {
          ...updatedSpline,
          kind: 'river',
          parentId: null,
          parentJunction: null,
          isIndependent: true,
          isDetached: true,
        },
        {
          ...spline.attributes,
          width: detachedWidth,
        }
      );
    }

    newGraph.splines[splineId] = updatedSpline;
    if (updatedSpline.parentId === null && !newGraph.rootSplineIds.includes(splineId as SplineId)) {
      newGraph.rootSplineIds = [...newGraph.rootSplineIds, splineId as SplineId];
    }
  }

  // Delete invalid splines
  for (const splineId of splinesToDelete) {
    delete newGraph.splines[splineId];
    newGraph.rootSplineIds = newGraph.rootSplineIds.filter((id) => id !== splineId);
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

  refreshAllNodeKinds(newGraph);

  syncRootMetadata(newGraph);

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
  attributes: RiverAttributes
): CreateSplineResult {
  // Note: Allow spline with 1 node for initial creation (UX convenience)
  // Curve rendering will require at least 2 nodes, but graph can store 1-node spline
  if (nodeIds.length < 1) {
    throw new Error('Cannot create spline with no nodes');
  }

  const newGraph = cloneGraph(graph);
  const splineId = makeSplineId(generateId());

  const spline = applyAttributesToSpline(
    {
      id: splineId,
      kind,
      flowSign: 1,
      nodeIds: nodeIds as string[],
      parentId: null,
      parentJunction: null,
      attributes: cloneAttributes(attributes),
      width: { ...attributes.width },
      isIndependent: kind === 'river',
      isDetached: kind === 'tributary',
      isMain: false,
      children: [],
    },
    attributes
  );

  newGraph.splines[splineId] = spline;

  if (spline.parentId === null) {
    newGraph.rootSplineIds = [...newGraph.rootSplineIds, splineId];
  }

  refreshAllNodeKinds(newGraph);

  syncRootMetadata(newGraph);

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

  refreshAllNodeKinds(newGraph);

  syncRootMetadata(newGraph);

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

  newGraph.rootSplineIds = newGraph.rootSplineIds.filter((id) => id !== splineId);

  refreshAllNodeKinds(newGraph);

  syncRootMetadata(newGraph);

  refreshAllNodeKinds(newGraph);

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

  const clampRelative = (value: number) => Math.max(5, Math.min(100, value));

  // V7: Normalize width to relative percent of parent width
  let newWidth = childSpline.attributes.width;
  if (parentSpline.attributes.width.kind === 'px' && parentSpline.attributes.width.value > 0) {
    if (childSpline.attributes.width.kind === 'relative') {
      newWidth = {
        kind: 'relative',
        value: clampRelative(childSpline.attributes.width.value),
      };
    } else {
      const percent =
        (childSpline.attributes.width.value / parentSpline.attributes.width.value) * 100;
      newWidth = {
        kind: 'relative',
        value: clampRelative(percent),
      };
    }
  } else if (childSpline.attributes.width.kind !== 'relative') {
    newWidth = {
      kind: 'relative',
      value: clampRelative(childSpline.attributes.width.value),
    };
  }

  // Update child spline with correct kind based on hierarchy
  const updatedChild = {
    ...childSpline,
    nodeIds: newNodeIds,
    parentId: parentSplineId,
    parentJunction: junctionNodeId,
    isIndependent: false,
    isDetached: false,
  };

  // Temporarily add to graph to determine kind
  newGraph.splines[childSplineId] = updatedChild;
  const correctKind = determineSplineKind(newGraph, childSplineId);

  newGraph.splines[childSplineId] = applyAttributesToSpline(
    {
      ...updatedChild,
      kind: correctKind, // 'tributary' or 'stream' based on parent's level
    },
    {
      ...childSpline.attributes,
      width: newWidth,
    }
  );

  newGraph.rootSplineIds = newGraph.rootSplineIds.filter((id) => id !== childSplineId);

  // Update parent: add child to children array
  newGraph.splines[parentSplineId] = {
    ...parentSpline,
    children: [...parentSpline.children, childSplineId],
  };

  refreshAllNodeKinds(newGraph);

  syncRootMetadata(newGraph);

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

  // Resolve width to absolute pixels when becoming an independent river
  let detachedWidth = newGraph.splines[tribSplineId].attributes.width;
  if (detachedWidth.kind === 'relative') {
    const parentSpline = newGraph.splines[parentSplineId];
    if (parentSpline && parentSpline.attributes.width.kind === 'px') {
      detachedWidth = {
        kind: 'px',
        value:
          (detachedWidth.value / 100) * parentSpline.attributes.width.value,
      };
    }
  }

  // Detach tributary: make it independent river
  newGraph.splines[tribSplineId] = applyAttributesToSpline(
    {
      ...newGraph.splines[tribSplineId],
      kind: 'river',
      parentId: null,
      parentJunction: null,
      isIndependent: true,
      isDetached: true,
    },
    {
      ...newGraph.splines[tribSplineId].attributes,
      width: detachedWidth,
    }
  );

  if (!newGraph.rootSplineIds.includes(tribSplineId)) {
    newGraph.rootSplineIds = [...newGraph.rootSplineIds, tribSplineId];
  }

  refreshAllNodeKinds(newGraph);

  syncRootMetadata(newGraph);

  refreshAllNodeKinds(newGraph);

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
    flowSign: (spline.flowSign === 1 ? -1 : 1),
  };

  refreshAllNodeKinds(newGraph);

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

  refreshAllNodeKinds(newGraph);

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

  refreshAllNodeKinds(newGraph);

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

  refreshAllNodeKinds(newGraph);

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

  newGraph.splines[splineId] = applyAttributesToSpline(
    spline,
    {
      ...spline.attributes,
      width: { ...width },
    }
  );

  syncRootMetadata(newGraph);

  return newGraph;
}

/**
 * Toggles the main flag on a spline (UI highlighting helper)
 */
export function setSplineMainState(
  graph: RiverGraphV2,
  splineId: SplineId,
  isMain: boolean
): RiverGraphV2 {
  const newGraph = cloneGraph(graph);
  const spline = newGraph.splines[splineId];

  if (!spline) {
    throw new Error(`Spline ${splineId} not found`);
  }

  newGraph.splines[splineId] = {
    ...spline,
    isMain,
  };

  if (isMain) {
    if (!newGraph.rootSplineIds.includes(splineId)) {
      newGraph.rootSplineIds = [...newGraph.rootSplineIds, splineId];
    }
    newGraph.mainSplineId = splineId;
  } else if (newGraph.mainSplineId === splineId) {
    newGraph.mainSplineId = null;
  }

  syncRootMetadata(newGraph);

  return newGraph;
}

/**
 * Merges two nodes in the same spline
 *
 * The higher priority node survives, or target survives on equal priority.
 * The loser node is removed, and all references are replaced with the survivor.
 *
 * Rules:
 * - Must be in same spline
 * - Cannot merge incompatible node kinds (see nodeKinds.canMergeNodes)
 * - Survivor keeps its position
 *
 * @param graph - Current graph state
 * @param draggedNodeId - Node being dragged
 * @param targetNodeId - Node being dropped onto
 * @param survivorNodeId - ID of node that should survive (from getMergeSurvivor)
 * @returns New graph with nodes merged
 *
 * @ue_equivalent
 * UFUNCTION(BlueprintCallable)
 * static FRiverGraph MergeNodes(const FRiverGraph& Graph,
 *                                FGuid DraggedNode,
 *                                FGuid TargetNode,
 *                                FGuid SurvivorNode);
 */
export function mergeNodes(
  graph: RiverGraphV2,
  draggedNodeId: NodeId,
  targetNodeId: NodeId,
  survivorNodeId: NodeId
): RiverGraphV2 {
  if (draggedNodeId === targetNodeId) {
    return graph;
  }

  const newGraph = cloneGraph(graph);

  // Determine which node to remove
  const loserNodeId = survivorNodeId === draggedNodeId ? targetNodeId : draggedNodeId;

  // Find the spline containing these nodes
  let targetSplineId: SplineId | null = null;
  for (const [splineId, spline] of Object.entries(newGraph.splines)) {
    if (
      spline.nodeIds.includes(draggedNodeId as string) &&
      spline.nodeIds.includes(targetNodeId as string)
    ) {
      targetSplineId = splineId as SplineId;
      break;
    }
  }

  if (!targetSplineId) {
    console.warn('Cannot merge nodes: not in same spline');
    return graph;
  }

  const spline = newGraph.splines[targetSplineId];

  // Replace loser with survivor in nodeIds array
  const newNodeIds = spline.nodeIds.map((id) =>
    id === loserNodeId ? (survivorNodeId as string) : id
  );

  // Remove duplicate survivors (if both nodes became the same)
  const deduplicatedNodeIds: string[] = [];
  for (let i = 0; i < newNodeIds.length; i++) {
    if (i === 0 || newNodeIds[i] !== newNodeIds[i - 1]) {
      deduplicatedNodeIds.push(newNodeIds[i]);
    }
  }

  // Update spline
  newGraph.splines[targetSplineId] = {
    ...spline,
    nodeIds: deduplicatedNodeIds,
  };

  // If loser was a junction, update any tributaries that referenced it
  for (const [otherId, otherSpline] of Object.entries(newGraph.splines)) {
    if (otherSpline.parentJunction === loserNodeId) {
      newGraph.splines[otherId] = {
        ...otherSpline,
        parentJunction: survivorNodeId,
      };
    }
  }

  // Delete loser node
  delete newGraph.nodes[loserNodeId];

  refreshAllNodeKinds(newGraph);

  syncRootMetadata(newGraph);

  return newGraph;
}

/**
 * Attaches an existing spline as a tributary to another spline
 *
 * The dragged spline becomes a tributary attached to the target spline at the target node.
 * The dragged node (source or mouth) is merged with the target junction node.
 *
 * Rules:
 * - Dragged spline must not have children
 * - Dragged node must be endpoint (source or mouth)
 * - Target must be in different spline
 *
 * @param graph - Current graph state
 * @param draggedNodeId - Endpoint node of spline to attach (source or mouth)
 * @param targetNodeId - Junction node where tributary will attach
 * @returns New graph with spline attached as tributary
 *
 * @ue_equivalent
 * UFUNCTION(BlueprintCallable)
 * static FRiverGraph AttachSplineAsTributary(const FRiverGraph& Graph,
 *                                             FGuid DraggedNode,
 *                                             FGuid TargetNode);
 */
export function attachSplineAsTributary(
  graph: RiverGraphV2,
  draggedNodeId: NodeId,
  targetNodeId: NodeId
): RiverGraphV2 {
  const newGraph = cloneGraph(graph);

  // Find splines containing each node
  let draggedSplineId: SplineId | null = null;
  let targetSplineId: SplineId | null = null;

  for (const [splineId, spline] of Object.entries(newGraph.splines)) {
    if (spline.nodeIds.includes(draggedNodeId as string)) {
      draggedSplineId = splineId as SplineId;
    }
    if (spline.nodeIds.includes(targetNodeId as string)) {
      targetSplineId = splineId as SplineId;
    }
  }

  if (!draggedSplineId || !targetSplineId) {
    console.warn('Cannot attach: nodes not found in splines');
    return graph;
  }

  if (draggedSplineId === targetSplineId) {
    console.warn('Cannot attach: nodes in same spline');
    return graph;
  }

  const draggedSpline = newGraph.splines[draggedSplineId];
  const targetSpline = newGraph.splines[targetSplineId];

  // Check if dragged node is endpoint
  const draggedIndex = draggedSpline.nodeIds.indexOf(draggedNodeId as string);
  const isSource = draggedIndex === 0;
  const isMouth = draggedIndex === draggedSpline.nodeIds.length - 1;

  if (!isSource && !isMouth) {
    console.warn('Cannot attach: dragged node is not endpoint');
    return graph;
  }

  // Determine which end of tributary connects to parent
  // If dragging source, it becomes the mouth (attach point)
  // If dragging mouth, it stays as mouth (attach point)
  let tributaryNodeIds = [...draggedSpline.nodeIds];

  // If source is being attached, reverse the spline (so mouth becomes attach point)
  if (isSource) {
    tributaryNodeIds.reverse();
  }

  // Replace the attach point (mouth) with target junction node
  tributaryNodeIds[tributaryNodeIds.length - 1] = targetNodeId as string;

  const clampRelative = (value: number) => Math.max(5, Math.min(100, value));
  let newWidth = draggedSpline.attributes.width;
  if (targetSpline.attributes.width.kind === 'px' && targetSpline.attributes.width.value > 0) {
    if (newWidth.kind === 'relative') {
      newWidth = {
        kind: 'relative',
        value: clampRelative(newWidth.value),
      };
    } else {
      const percent = (newWidth.value / targetSpline.attributes.width.value) * 100;
      newWidth = {
        kind: 'relative',
        value: clampRelative(percent),
      };
    }
  } else if (newWidth.kind !== 'relative') {
    newWidth = {
      kind: 'relative',
      value: clampRelative(newWidth.value),
    };
  }

  // Update dragged spline with correct kind based on hierarchy
  const updatedDraggedSpline = {
    ...draggedSpline,
    parentId: targetSplineId,
    parentJunction: targetNodeId,
    nodeIds: tributaryNodeIds,
    isIndependent: false,
    isDetached: false,
  };

  // Temporarily add to graph to determine kind
  newGraph.splines[draggedSplineId] = updatedDraggedSpline;
  const correctKind = determineSplineKind(newGraph, draggedSplineId);

  newGraph.splines[draggedSplineId] = applyAttributesToSpline(
    {
      ...updatedDraggedSpline,
      kind: correctKind, // 'tributary' or 'stream' based on target's level
    },
    {
      ...draggedSpline.attributes,
      width: newWidth,
    }
  );

  newGraph.rootSplineIds = newGraph.rootSplineIds.filter((id) => id !== draggedSplineId);

  // Add tributary to parent's children
  if (!targetSpline.children.includes(draggedSplineId)) {
    newGraph.splines[targetSplineId] = {
      ...targetSpline,
      children: [...targetSpline.children, draggedSplineId],
    };
  }

  // Delete the dragged node (it's now replaced by target junction)
  delete newGraph.nodes[draggedNodeId];

  refreshAllNodeKinds(newGraph);

  syncRootMetadata(newGraph);

  return newGraph;
}

/**
 * Merges two splines end-to-end (river extension)
 *
 * Connects mouth of one spline to source of another, creating a single extended spline.
 * The TARGET spline always survives and absorbs the dragged spline along with all its tributaries.
 * The active (dragged) river flows into the target river.
 *
 * Rules:
 * - One node must be source, other must be mouth (end-to-start connection)
 * - Must be different splines
 * - TARGET spline keeps its attributes (width, etc.) - always the leader
 * - All tributaries of dragged spline are transferred to target spline
 *
 * @param graph - Current graph state
 * @param draggedNodeId - Endpoint of dragged spline (source or mouth)
 * @param targetNodeId - Endpoint of target spline (mouth or source)
 * @returns New graph with splines merged
 *
 * @ue_equivalent
 * UFUNCTION(BlueprintCallable)
 * static FRiverGraph MergeSplines(const FRiverGraph& Graph,
 *                                  FGuid DraggedNode,
 *                                  FGuid TargetNode);
 */
export function mergeSplines(
  graph: RiverGraphV2,
  draggedNodeId: NodeId,
  targetNodeId: NodeId
): RiverGraphV2 {
  const newGraph = cloneGraph(graph);

  // Find splines containing each node
  let draggedSplineId: SplineId | null = null;
  let targetSplineId: SplineId | null = null;

  for (const [splineId, spline] of Object.entries(newGraph.splines)) {
    if (spline.nodeIds.includes(draggedNodeId as string)) {
      draggedSplineId = splineId as SplineId;
    }
    if (spline.nodeIds.includes(targetNodeId as string)) {
      targetSplineId = splineId as SplineId;
    }
  }

  if (!draggedSplineId || !targetSplineId) {
    console.warn('Cannot merge: nodes not found in splines');
    return graph;
  }

  if (draggedSplineId === targetSplineId) {
    console.warn('Cannot merge: nodes in same spline');
    return graph;
  }

  const draggedSpline = newGraph.splines[draggedSplineId];
  const targetSpline = newGraph.splines[targetSplineId];

  // TARGET spline is ALWAYS the survivor (keeps its attributes)
  // DRAGGED spline is ALWAYS absorbed (flows into target)
  const survivorSplineId = targetSplineId;
  const absorbedSplineId = draggedSplineId;

  const survivorSpline = targetSpline;
  const absorbedSpline = draggedSpline;

  const survivorNodeId = targetNodeId;
  const absorbedNodeId = draggedNodeId;

  // Determine positions in arrays
  const survivorIndex = survivorSpline.nodeIds.indexOf(survivorNodeId as string);
  const absorbedIndex = absorbedSpline.nodeIds.indexOf(absorbedNodeId as string);

  const survivorIsSource = survivorIndex === 0;
  const survivorIsMouth = survivorIndex === survivorSpline.nodeIds.length - 1;
  const absorbedIsSource = absorbedIndex === 0;
  const absorbedIsMouth = absorbedIndex === absorbedSpline.nodeIds.length - 1;

  // Merge nodeIds arrays
  let mergedNodeIds: string[];

  if (survivorIsMouth && absorbedIsSource) {
    // Survivor mouth connects to absorbed source: [...survivor, ...absorbed]
    // Keep survivor's mouth, skip absorbed's source (they merge into one node)
    mergedNodeIds = [
      ...survivorSpline.nodeIds,
      ...absorbedSpline.nodeIds.slice(1), // Skip first node (source)
    ];
  } else if (survivorIsSource && absorbedIsMouth) {
    // Survivor source connects to absorbed mouth: [...absorbed, ...survivor]
    // Skip absorbed's mouth (will be deleted), keep survivor's source as merge point
    mergedNodeIds = [
      ...absorbedSpline.nodeIds.slice(0, -1), // Skip last node (mouth)
      ...survivorSpline.nodeIds, // Keep survivor source as merge point
    ];
  } else {
    console.warn('Invalid merge: nodes are not in end-to-start configuration');
    return graph;
  }

  // Transfer tributaries from absorbed spline to survivor
  const mergedChildren = [...survivorSpline.children];

  for (const childId of absorbedSpline.children) {
    if (!mergedChildren.includes(childId)) {
      mergedChildren.push(childId);

      // Update child's parentId to point to survivor
      const childSpline = newGraph.splines[childId];
      if (childSpline) {
        newGraph.splines[childId] = {
          ...childSpline,
          parentId: survivorSplineId,
          isIndependent: false,
          isDetached: false,
        };
      }
    }
  }

  // Update survivor spline with merged nodes and children
  newGraph.splines[survivorSplineId] = {
    ...survivorSpline,
    nodeIds: mergedNodeIds,
    children: mergedChildren,
  };

  // Delete absorbed node
  delete newGraph.nodes[absorbedNodeId];

  // Delete absorbed spline
  delete newGraph.splines[absorbedSplineId];

  const updatedSurvivor = newGraph.splines[survivorSplineId];
  newGraph.rootSplineIds = newGraph.rootSplineIds.filter(
    (id) => id !== absorbedSplineId && id !== survivorSplineId
  );
  if (updatedSurvivor.parentId === null) {
    newGraph.rootSplineIds = [...newGraph.rootSplineIds, survivorSplineId];
  }

  refreshAllNodeKinds(newGraph);

  syncRootMetadata(newGraph);

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
    rootSplineIds: [],
    mainSplineId: null,
  };
}
