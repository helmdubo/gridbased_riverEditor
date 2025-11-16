/**
 * Node kind classification and priority system
 *
 * Defines vertex types (Source, Mouth, Junction, Inner) and their merge priorities.
 * Higher priority nodes "absorb" lower priority ones during merge operations.
 *
 * @module core/graph/nodeKinds
 */

import type { RiverGraphV2, NodeId, NodeKind, SplineId, Spline } from './types';

/**
 * Priority levels for merge operations
 *
 * During drag-and-drop merge:
 * - Higher priority nodes absorb lower priority ones
 * - Equal priority: dragged node dissolves into target
 * - Junction/Source/Mouth don't merge with themselves
 *
 * Priority hierarchy (high to low):
 * 1. Junction (priority 3) - cannot merge with junction
 * 2. Source/Mouth (priority 2) - cannot merge with same kind
 * 3. Inner (priority 1) - merges with everything
 */
const NODE_KIND_PRIORITY: Record<NodeKind, number> = {
  junction: 3,
  source: 2,
  mouth: 2,
  inner: 1,
};

function findSplinesContainingNode(graph: RiverGraphV2, nodeId: NodeId) {
  return Object.entries(graph.splines).filter(([, spline]) =>
    spline.nodeIds.includes(nodeId as string)
  );
}

/**
 * Get all roles of a node (comprehensive classification)
 *
 * A node can have multiple roles simultaneously:
 * - junction (belongs to 2+ splines)
 * - source (first node in some spline)
 * - mouth (last node in some spline)
 * - inner (middle node in some spline)
 *
 * Example: After deleting first node of parent river:
 *   River A: [n2] → [n3]  (n2 is source)
 *              ↑
 *   Tributary: [n4] → [n2] (n2 is mouth)
 *   → n2 roles: junction=true, asSourceOf=[A], asMouthOf=[Tributary]
 *
 * @param graph - River graph
 * @param nodeId - Node to analyze
 * @returns Complete role information
 */
export interface NodeRoles {
  /** Primary classification (used for UI icon priority) */
  primary: NodeKind;
  /** Is this node a junction (belongs to 2+ splines)? */
  isJunction: boolean;
  /** Splines where this node is the source (first node) */
  asSourceOf: SplineId[];
  /** Splines where this node is the mouth (last node) */
  asMouthOf: SplineId[];
  /** Splines where this node is inner (middle node) */
  asInnerOf: SplineId[];
}

export function getNodeRoles(graph: RiverGraphV2, nodeId: NodeId): NodeRoles {
  const containingSplines = findSplinesContainingNode(graph, nodeId);

  const asSourceOf: SplineId[] = [];
  const asMouthOf: SplineId[] = [];
  const asInnerOf: SplineId[] = [];

  for (const [splineId, spline] of containingSplines) {
    const nodeIndex = spline.nodeIds.indexOf(nodeId as string);

    if (nodeIndex === 0) {
      asSourceOf.push(splineId as SplineId);
    } else if (nodeIndex === spline.nodeIds.length - 1) {
      asMouthOf.push(splineId as SplineId);
    } else if (nodeIndex > 0) {
      asInnerOf.push(splineId as SplineId);
    }
  }

  const isJunction = containingSplines.length > 1;

  // Determine primary kind (for backwards compatibility and UI priority)
  let primary: NodeKind = 'inner';
  if (isJunction) {
    primary = 'junction';
  } else if (asSourceOf.length > 0) {
    primary = 'source';
  } else if (asMouthOf.length > 0) {
    primary = 'mouth';
  } else if (asInnerOf.length > 0) {
    primary = 'inner';
  }

  return {
    primary,
    isJunction,
    asSourceOf,
    asMouthOf,
    asInnerOf,
  };
}

/**
 * Derives node kind based on current topology (LEGACY - prioritized classification)
 *
 * This function returns only ONE primary kind, using priority:
 * junction > source > mouth > inner
 *
 * IMPORTANT: This loses information when a node has multiple roles!
 * Example: node that is both source AND mouth AND junction will return only 'junction'.
 *
 * For complete role information, use getNodeRoles() instead.
 *
 * @param graph - River graph
 * @param nodeId - Node to classify
 * @returns Primary node kind classification
 *
 * @ue_equivalent
 * UFUNCTION(BlueprintCallable)
 * static ERiverNodeKind DeriveNodeKind(const FRiverGraph& Graph, FGuid NodeId);
 */
export function computeNodeKind(graph: RiverGraphV2, nodeId: NodeId): NodeKind {
  // Use getNodeRoles for comprehensive analysis
  const roles = getNodeRoles(graph, nodeId);
  return roles.primary;
}

/**
 * Gets stored node kind from the graph (falls back to derived value for robustness)
 */
export function getNodeKind(graph: RiverGraphV2, nodeId: NodeId): NodeKind {
  const node = graph.nodes[nodeId];
  if (!node) {
    return 'inner';
  }
  return node.kind ?? computeNodeKind(graph, nodeId);
}

/**
 * Get priority level for a node
 *
 * @param graph - River graph
 * @param nodeId - Node ID
 * @returns Priority level (higher = more important)
 *
 * @ue_equivalent
 * UFUNCTION(BlueprintCallable)
 * static int32 GetNodePriority(const FRiverGraph& Graph, FGuid NodeId);
 */
export function getNodePriority(graph: RiverGraphV2, nodeId: NodeId): number {
  const kind = getNodeKind(graph, nodeId);
  return NODE_KIND_PRIORITY[kind];
}

/**
 * Check if two nodes can be merged
 *
 * Merge rules:
 * - Must be in the same spline
 * - Must be adjacent (neighbors in nodeIds array) to prevent loops
 * - Inner → anything: allowed (Inner is absorbed)
 * - Junction → Junction: forbidden
 * - Source → Source: forbidden
 * - Mouth → Mouth: forbidden
 * - Source → Mouth: forbidden (would collapse entire spline)
 * - Mouth → Source: forbidden (would collapse entire spline)
 *
 * @param graph - River graph
 * @param draggedNodeId - Node being dragged
 * @param targetNodeId - Node being dropped onto
 * @returns True if merge is allowed
 *
 * @ue_equivalent
 * UFUNCTION(BlueprintCallable)
 * static bool CanMergeNodes(const FRiverGraph& Graph, FGuid DraggedNode, FGuid TargetNode);
 */
export function canMergeNodes(
  graph: RiverGraphV2,
  draggedNodeId: NodeId,
  targetNodeId: NodeId
): boolean {
  if (draggedNodeId === targetNodeId) {
    return false;
  }

  const draggedEntry = findSplinesContainingNode(graph, draggedNodeId)[0];
  const targetEntry = findSplinesContainingNode(graph, targetNodeId)[0];

  if (!draggedEntry || !targetEntry) {
    return false;
  }

  const [draggedSplineId, draggedSpline] = draggedEntry;
  const [targetSplineId, targetSpline] = targetEntry;

  // Must be in the same spline
  if (draggedSplineId !== targetSplineId) {
    return false;
  }

  // NEW: Check adjacency to prevent loops/twists
  // Nodes must be neighbors in the nodeIds array
  const draggedIndex = draggedSpline.nodeIds.indexOf(draggedNodeId as string);
  const targetIndex = targetSpline.nodeIds.indexOf(targetNodeId as string);

  if (draggedIndex === -1 || targetIndex === -1) {
    return false;
  }

  const indexDistance = Math.abs(draggedIndex - targetIndex);
  if (indexDistance !== 1) {
    // Not adjacent - would create a loop or twist
    return false;
  }

  const draggedKind = getNodeKind(graph, draggedNodeId);
  const targetKind = getNodeKind(graph, targetNodeId);

  // Inner nodes can merge with anything (they get absorbed)
  if (draggedKind === 'inner' || targetKind === 'inner') {
    return true;
  }

  // Junction cannot merge with junction
  if (draggedKind === 'junction' && targetKind === 'junction') {
    return false;
  }

  // Source cannot merge with source
  if (draggedKind === 'source' && targetKind === 'source') {
    return false;
  }

  // Mouth cannot merge with mouth
  if (draggedKind === 'mouth' && targetKind === 'mouth') {
    return false;
  }

  // Source and Mouth cannot merge (would collapse entire spline)
  if (
    (draggedKind === 'source' && targetKind === 'mouth') ||
    (draggedKind === 'mouth' && targetKind === 'source')
  ) {
    return false;
  }

  return true;
}

/**
 * Determine which node survives during merge
 *
 * Priority rules:
 * - Higher priority node survives
 * - Equal priority: target survives (dragged is removed)
 *
 * @param graph - River graph
 * @param draggedNodeId - Node being dragged
 * @param targetNodeId - Node being dropped onto
 * @returns ID of surviving node
 *
 * @ue_equivalent
 * UFUNCTION(BlueprintCallable)
 * static FGuid GetMergeSurvivor(const FRiverGraph& Graph, FGuid DraggedNode, FGuid TargetNode);
 */
export function getMergeSurvivor(
  graph: RiverGraphV2,
  draggedNodeId: NodeId,
  targetNodeId: NodeId
): NodeId {
  const draggedPriority = getNodePriority(graph, draggedNodeId);
  const targetPriority = getNodePriority(graph, targetNodeId);

  if (draggedPriority > targetPriority) {
    return draggedNodeId;
  }

  return targetNodeId;
}

/**
 * Check if two splines can be merged (river extension)
 *
 * Rules:
 * - One node must be source, other must be mouth (end-to-start connection)
 * - Must be in different splines
 * - At least one spline should be the active/main spline
 * - Must NOT be in parent-child relationship (prevents cycles)
 *
 * @param graph - River graph
 * @param draggedNodeId - Node being dragged (should be source/mouth)
 * @param targetNodeId - Target node (should be mouth/source)
 * @returns True if splines can be merged
 *
 * @ue_equivalent
 * UFUNCTION(BlueprintCallable)
 * static bool CanMergeSplines(const FRiverGraph& Graph, FGuid DraggedNode, FGuid TargetNode);
 */
export function canMergeSplines(
  graph: RiverGraphV2,
  draggedNodeId: NodeId,
  targetNodeId: NodeId
): boolean {
  if (draggedNodeId === targetNodeId) {
    return false;
  }

  const draggedEntry = findSplinesContainingNode(graph, draggedNodeId)[0];
  const targetEntry = findSplinesContainingNode(graph, targetNodeId)[0];

  if (!draggedEntry || !targetEntry) {
    return false;
  }

  const [draggedSplineId, draggedSpline] = draggedEntry;
  const [targetSplineId, targetSpline] = targetEntry;

  if (draggedSplineId === targetSplineId) {
    return false;
  }

  // I1: Only independent rivers can merge (not tributaries or streams)
  if (draggedSpline.parentId !== null || targetSpline.parentId !== null) {
    return false;
  }

  // I2: Prevent cycles - check that neither spline is descendant of the other
  if (
    isDescendantOf(graph, draggedSplineId as SplineId, targetSplineId as SplineId) ||
    isDescendantOf(graph, targetSplineId as SplineId, draggedSplineId as SplineId)
  ) {
    return false;
  }

  // I5: Enforce tree depth ≤ 2 (River → Tributary → Stream)
  // Rivers with children CAN merge, but result must not exceed depth 2
  const draggedDepth = getTreeDepth(graph, draggedSplineId as SplineId);
  const targetDepth = getTreeDepth(graph, targetSplineId as SplineId);
  const maxDepth = Math.max(draggedDepth, targetDepth);

  if (maxDepth > 2) {
    // Cannot merge: resulting tree would be too deep
    return false;
  }

  // CRITICAL: Prevent cycles - forbid merge between parent and child splines
  // Example: River A has tributary B attached → B[source] cannot merge with A[mouth]
  // This would create: A → junction → B → A[mouth], forming a cycle
  if (draggedSpline.parentId === targetSplineId) {
    // Dragged spline is a child of target spline
    return false;
  }

  if (targetSpline.parentId === draggedSplineId) {
    // Target spline is a child of dragged spline
    return false;
  }

  const draggedKind = getNodeKind(graph, draggedNodeId);
  const targetKind = getNodeKind(graph, targetNodeId);

  const isValidConnection =
    (draggedKind === 'mouth' && targetKind === 'source') ||
    (draggedKind === 'source' && targetKind === 'mouth');

  if (!isValidConnection) {
    return false;
  }

  return true;
}

/**
 * Check if spline B is a descendant of spline A (direct or indirect child)
 * This prevents creating cycles in the river hierarchy
 */
function isDescendantOf(graph: RiverGraphV2, splineId: SplineId, ancestorId: SplineId): boolean {
  const spline = graph.splines[splineId];
  if (!spline) {
    return false;
  }

  // Check direct children
  if (spline.children.includes(ancestorId)) {
    return true;
  }

  // Check indirect descendants (recursive)
  for (const childId of spline.children) {
    if (isDescendantOf(graph, childId as SplineId, ancestorId)) {
      return true;
    }
  }

  return false;
}

/**
 * Calculate the maximum tree depth from this spline downwards
 *
 * Depth calculation:
 * - 0 = leaf node (no children)
 * - 1 = has children that are all leaves
 * - 2 = has children with children (grandchildren exist)
 *
 * @param graph - River graph
 * @param splineId - Root spline to measure from
 * @returns Maximum depth (0 = no children, 1 = has children, 2 = has grandchildren)
 */
export function getTreeDepth(graph: RiverGraphV2, splineId: SplineId): number {
  const spline = graph.splines[splineId];
  if (!spline || spline.children.length === 0) {
    return 0; // Leaf node
  }

  // Find max depth among all children
  let maxChildDepth = 0;
  for (const childId of spline.children) {
    const childDepth = getTreeDepth(graph, childId as SplineId);
    maxChildDepth = Math.max(maxChildDepth, childDepth);
  }

  return 1 + maxChildDepth;
}

/**
 * Checks whether a dragged spline endpoint can attach as a tributary to the target node
 *
 * Hierarchy depth ≤ 2:
 * - River (level 0) can accept Tributary (becomes level 1)
 * - Tributary (level 1) can accept Stream (becomes level 2)
 * - Stream (level 2) cannot accept children
 *
 * Conditions:
 * - Nodes must belong to different splines
 * - Dragged spline must be independent (not already attached)
 * - Dragged node must be an endpoint (source or mouth)
 * - Target hierarchy depth + dragged depth ≤ 2
 * - Target node must not be source and must not be a junction
 * - No cycles (target cannot be descendant of dragged)
 */
export function canAttachAsTributary(
  graph: RiverGraphV2,
  draggedNodeId: NodeId,
  targetNodeId: NodeId
): boolean {
  if (draggedNodeId === targetNodeId) {
    return false;
  }

  const draggedEntry = findSplinesContainingNode(graph, draggedNodeId)[0];
  const targetEntry = findSplinesContainingNode(graph, targetNodeId)[0];

  if (!draggedEntry || !targetEntry) {
    return false;
  }

  const [draggedSplineId, draggedSpline] = draggedEntry;
  const [targetSplineId, targetSpline] = targetEntry;

  // Must be different splines
  if (draggedSplineId === targetSplineId) {
    return false;
  }

  // Dragged spline must be independent (not already a tributary/stream)
  if (draggedSpline.parentId !== null) {
    return false;
  }

  // Dragged spline must be a river (independent)
  if (draggedSpline.kind !== 'river') {
    return false;
  }

  // Dragged node must be an endpoint
  const draggedIndex = draggedSpline.nodeIds.indexOf(draggedNodeId as string);
  if (draggedIndex === -1) {
    return false;
  }

  const draggedIsEndpoint =
    draggedIndex === 0 || draggedIndex === draggedSpline.nodeIds.length - 1;
  if (!draggedIsEndpoint) {
    return false;
  }

  // Calculate target's hierarchy level (0 = river, 1 = tributary, 2 = stream)
  let targetLevel = 0;
  let currentSpline = targetSpline;
  while (currentSpline.parentId !== null) {
    targetLevel++;
    const parent = graph.splines[currentSpline.parentId];
    if (!parent) break;
    currentSpline = parent as Spline;
  }

  // Calculate dragged's tree depth (0 = no children, 1 = has children, 2 = has grandchildren)
  const draggedDepth = getTreeDepth(graph, draggedSplineId as SplineId);

  // I5: Enforce total depth ≤ 2
  // If target is at level 1 (tributary) and dragged has children, result would be level 3
  if (targetLevel + 1 + draggedDepth > 2) {
    return false; // Would exceed maximum depth
  }

  // Target node must not be the source
  const targetIndex = targetSpline.nodeIds.indexOf(targetNodeId as string);
  if (targetIndex < 1) {
    return false;
  }

  // Target node must not already be a junction
  const targetNode = graph.nodes[targetNodeId];
  if (targetNode?.kind === 'junction') {
    return false;
  }

  // I2: Prevent cycles - target spline cannot be a descendant of dragged spline
  if (isDescendantOf(graph, draggedSplineId as SplineId, targetSplineId as SplineId)) {
    return false;
  }

  return true;
}

/**
 * Determine the correct kind (river/tributary/stream) for a spline based on hierarchy
 *
 * Hierarchy rules:
 * - Level 0: parentId === null → 'river'
 * - Level 1: parent is river (parent.parentId === null) → 'tributary'
 * - Level 2: parent is tributary (parent.parentId !== null) → 'stream'
 *
 * @param graph - River graph
 * @param splineId - Spline ID to classify
 * @returns 'river', 'tributary', or 'stream'
 */
export function determineSplineKind(graph: RiverGraphV2, splineId: SplineId): 'river' | 'tributary' | 'stream' {
  const spline = graph.splines[splineId];
  if (!spline) {
    return 'river'; // Fallback for non-existent spline
  }

  if (spline.parentId === null) {
    return 'river'; // Level 0: independent river
  }

  const parent = graph.splines[spline.parentId];
  if (!parent) {
    return 'tributary'; // Fallback if parent missing
  }

  if (parent.parentId === null) {
    return 'tributary'; // Level 1: child of river
  }

  return 'stream'; // Level 2: child of tributary
}

/**
 * Get the spline ID containing a node
 *
 * @param graph - River graph
 * @param nodeId - Node ID
 * @returns Spline ID or null if not found
 */
export function getNodeSplineId(graph: RiverGraphV2, nodeId: NodeId): SplineId | null {
  const entry = findSplinesContainingNode(graph, nodeId)[0];
  return entry ? (entry[0] as SplineId) : null;
}
