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

  const [draggedSplineId] = draggedEntry;
  const [targetSplineId] = targetEntry;

  if (draggedSplineId !== targetSplineId) {
    return false;
  }

  const draggedKind = getNodeKind(graph, draggedNodeId);
  const targetKind = getNodeKind(graph, targetNodeId);

  if (draggedKind === 'inner' || targetKind === 'inner') {
    return true;
  }

  if (draggedKind === 'junction' && targetKind === 'junction') {
    return false;
  }

  if (draggedKind === 'source' && targetKind === 'source') {
    return false;
  }

  if (draggedKind === 'mouth' && targetKind === 'mouth') {
    return false;
  }

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

  const [draggedSplineId, draggedSpline] = draggedEntry;
  const [targetSplineId] = targetEntry;

  if (draggedSplineId === targetSplineId) {
    return false;
  }

  if (draggedSpline.children && draggedSpline.children.length > 0) {
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
 * Checks whether a dragged spline endpoint can attach as a tributary to the target node
 *
 * Conditions:
 * - Nodes must belong to different splines
 * - Dragged spline must be an independent river without children or parent
 * - Dragged node must be an endpoint (source or mouth)
 * - Target spline must be an independent river
 * - Target node must not be the source node and must not already be a junction
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

  if (draggedSplineId === targetSplineId) {
    return false;
  }

  if (draggedSpline.children.length > 0) {
    return false;
  }

  if (draggedSpline.parentId !== null) {
    return false;
  }

  if (draggedSpline.kind !== 'river') {
    return false;
  }

  const draggedIndex = draggedSpline.nodeIds.indexOf(draggedNodeId as string);
  if (draggedIndex === -1) {
    return false;
  }

  const draggedIsEndpoint =
    draggedIndex === 0 || draggedIndex === draggedSpline.nodeIds.length - 1;
  if (!draggedIsEndpoint) {
    return false;
  }

  if (targetSpline.parentId !== null) {
    return false;
  }

  const targetIndex = targetSpline.nodeIds.indexOf(targetNodeId as string);
  if (targetIndex < 1) {
    return false;
  }

  const targetNode = graph.nodes[targetNodeId];
  if (targetNode?.kind === 'junction') {
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
