/**
 * Node kind classification and priority system
 *
 * Defines vertex types (Source, Mouth, Junction, Inner) and their merge priorities.
 * Higher priority nodes "absorb" lower priority ones during merge operations.
 *
 * @module core/graph/nodeKinds
 */

import type { RiverGraphV2, NodeId, NodeKind, SplineId } from './types';

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
 * Derives node kind based on current topology
 *
 * @param graph - River graph
 * @param nodeId - Node to classify
 * @returns Node kind classification
 *
 * @ue_equivalent
 * UFUNCTION(BlueprintCallable)
 * static ERiverNodeKind DeriveNodeKind(const FRiverGraph& Graph, FGuid NodeId);
 */
export function computeNodeKind(graph: RiverGraphV2, nodeId: NodeId): NodeKind {
  const node = graph.nodes[nodeId];
  if (!node) {
    return 'inner';
  }

  const containingSplines = findSplinesContainingNode(graph, nodeId);

  if (containingSplines.length === 0) {
    return 'inner';
  }

  if (containingSplines.length > 1) {
    return 'junction';
  }

  const [, spline] = containingSplines[0];
  const nodeIndex = spline.nodeIds.indexOf(nodeId as string);

  if (nodeIndex <= 0) {
    return 'source';
  }

  if (nodeIndex === spline.nodeIds.length - 1) {
    return 'mouth';
  }

  return 'inner';
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

  const [draggedSplineId] = draggedEntry;
  const [targetSplineId] = targetEntry;

  if (draggedSplineId === targetSplineId) {
    return false;
  }

  // REMOVED: Children blocking check
  // Rivers with tributaries CAN merge with other rivers
  // The children (tributaries) will be transferred to the surviving spline

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
 * Checks whether a dragged spline endpoint can attach as a tributary to the target node
 *
 * Conditions:
 * - Nodes must belong to different splines
 * - Dragged spline must be an independent river without children or parent
 * - Dragged node must be an endpoint (source or mouth)
 * - Target spline must be an independent river
 * - Target node must not be the source node and must not already be a junction
 * - Target spline must not be a descendant of dragged spline (prevents cycles)
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

  // Dragged spline cannot have children (would create nested tributaries)
  if (draggedSpline.children.length > 0) {
    return false;
  }

  // Dragged spline must be independent (not already a tributary)
  if (draggedSpline.parentId !== null) {
    return false;
  }

  // Dragged spline must be a river
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

  // Target spline must be independent (not a tributary itself)
  if (targetSpline.parentId !== null) {
    return false;
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

  // NEW: Prevent cycles - target spline cannot be a descendant of dragged spline
  // This prevents: river A → river B (tributary) → trying to attach A to B (cycle!)
  if (isDescendantOf(graph, draggedSplineId as SplineId, targetSplineId as SplineId)) {
    return false;
  }

  return true;
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
