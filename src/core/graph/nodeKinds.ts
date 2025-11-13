/**
 * Node kind classification and priority system
 *
 * Defines vertex types (Source, Mouth, Junction, Mid) and their merge priorities.
 * Higher priority nodes "absorb" lower priority ones during merge operations.
 *
 * @module core/graph/nodeKinds
 */

import type { RiverGraphV2, NodeId, SplineId } from './types';
import GraphService from '@services/GraphService';

/**
 * Node kind based on topology
 *
 * - Source: First node in a spline (upstream end)
 * - Mouth: Last node in a spline (downstream end)
 * - Junction: Node with child tributaries attached
 * - Mid: Any other node in the spline
 *
 * @ue_equivalent
 * UENUM(BlueprintType)
 * enum class ERiverNodeKind : uint8 {
 *   Source,
 *   Mouth,
 *   Junction,
 *   Mid
 * };
 */
export type NodeKind = 'source' | 'mouth' | 'junction' | 'mid';

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
 * 3. Mid (priority 1) - merges with everything
 */
const NODE_KIND_PRIORITY: Record<NodeKind, number> = {
  junction: 3,
  source: 2,
  mouth: 2,
  mid: 1,
};

/**
 * Determine node kind based on topology
 *
 * @param graph - River graph
 * @param nodeId - Node to classify
 * @returns Node kind classification
 *
 * @ue_equivalent
 * UFUNCTION(BlueprintCallable)
 * static ERiverNodeKind GetNodeKind(const FRiverGraph& Graph, FGuid NodeId);
 */
export function getNodeKind(graph: RiverGraphV2, nodeId: NodeId): NodeKind {
  // Check if junction (has children tributaries)
  if (GraphService.isJunctionNode(graph, nodeId)) {
    return 'junction';
  }

  // Find which spline contains this node
  const splineEntry = Object.entries(graph.splines).find(([, spline]) =>
    spline.nodeIds.includes(nodeId as string)
  );

  if (!splineEntry) {
    // Orphan node (shouldn't happen in valid graph)
    return 'mid';
  }

  const [, spline] = splineEntry;
  const nodeIndex = spline.nodeIds.indexOf(nodeId as string);

  // Check if source (first node)
  if (nodeIndex === 0) {
    return 'source';
  }

  // Check if mouth (last node)
  if (nodeIndex === spline.nodeIds.length - 1) {
    return 'mouth';
  }

  // Otherwise it's a mid node
  return 'mid';
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
 * - Mid → anything: allowed (Mid is absorbed)
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
  // Cannot merge node with itself
  if (draggedNodeId === targetNodeId) {
    return false;
  }

  // Find splines containing each node
  const draggedSplineEntry = Object.entries(graph.splines).find(([, spline]) =>
    spline.nodeIds.includes(draggedNodeId as string)
  );
  const targetSplineEntry = Object.entries(graph.splines).find(([, spline]) =>
    spline.nodeIds.includes(targetNodeId as string)
  );

  if (!draggedSplineEntry || !targetSplineEntry) {
    return false;
  }

  const [draggedSplineId] = draggedSplineEntry;
  const [targetSplineId] = targetSplineEntry;

  // Must be in same spline
  if (draggedSplineId !== targetSplineId) {
    return false;
  }

  const draggedKind = getNodeKind(graph, draggedNodeId);
  const targetKind = getNodeKind(graph, targetNodeId);

  // Mid can always be absorbed
  if (draggedKind === 'mid') {
    return true;
  }

  // Target Mid can absorb anything (but dragged takes priority if higher)
  if (targetKind === 'mid') {
    return true;
  }

  // Junction → Junction: forbidden
  if (draggedKind === 'junction' && targetKind === 'junction') {
    return false;
  }

  // Source → Source: forbidden
  if (draggedKind === 'source' && targetKind === 'source') {
    return false;
  }

  // Mouth → Mouth: forbidden
  if (draggedKind === 'mouth' && targetKind === 'mouth') {
    return false;
  }

  // Source ↔ Mouth: forbidden (would collapse entire spline)
  if (
    (draggedKind === 'source' && targetKind === 'mouth') ||
    (draggedKind === 'mouth' && targetKind === 'source')
  ) {
    return false;
  }

  // All other combinations allowed
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

  // Higher priority wins
  if (draggedPriority > targetPriority) {
    return draggedNodeId;
  }

  // Target wins on equal or higher priority
  return targetNodeId;
}

/**
 * Check if a spline can be attached as tributary to another spline
 *
 * Rules:
 * - Dragged spline must not have children (no nested tributaries)
 * - Dragged node must be source or mouth (endpoint)
 * - Target must be in a different spline
 * - Target must be Mid point (default point, not source/mouth)
 * - Target must NOT already be a junction (one tributary per node)
 *
 * @param graph - River graph
 * @param draggedNodeId - Node being dragged (must be source/mouth)
 * @param targetNodeId - Target node for attachment (must be mid point)
 * @returns True if attachment is allowed
 *
 * @ue_equivalent
 * UFUNCTION(BlueprintCallable)
 * static bool CanAttachAsTributary(const FRiverGraph& Graph, FGuid DraggedNode, FGuid TargetNode);
 */
export function canAttachAsTributary(
  graph: RiverGraphV2,
  draggedNodeId: NodeId,
  targetNodeId: NodeId
): boolean {
  // Cannot attach node to itself
  if (draggedNodeId === targetNodeId) {
    return false;
  }

  // Find splines containing each node
  const draggedSplineEntry = Object.entries(graph.splines).find(([, spline]) =>
    spline.nodeIds.includes(draggedNodeId as string)
  );
  const targetSplineEntry = Object.entries(graph.splines).find(([, spline]) =>
    spline.nodeIds.includes(targetNodeId as string)
  );

  if (!draggedSplineEntry || !targetSplineEntry) {
    return false;
  }

  const [draggedSplineId, draggedSpline] = draggedSplineEntry;
  const [targetSplineId, targetSpline] = targetSplineEntry;

  // Must be different splines
  if (draggedSplineId === targetSplineId) {
    return false;
  }

  // Dragged spline must not have children
  if (draggedSpline.children && draggedSpline.children.length > 0) {
    return false;
  }

  // Dragged node must be source or mouth (endpoint)
  const draggedKind = getNodeKind(graph, draggedNodeId);
  if (draggedKind !== 'source' && draggedKind !== 'mouth') {
    return false;
  }

  // Get target node kind
  const targetKind = getNodeKind(graph, targetNodeId);

  // Target must NOT already be a junction (one tributary per node)
  if (targetKind === 'junction') {
    return false;
  }

  // Target must be Mid point (not source/mouth - only mid points can become junctions)
  if (targetKind !== 'mid') {
    return false;
  }

  return true;
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
  // Cannot merge node with itself
  if (draggedNodeId === targetNodeId) {
    return false;
  }

  // Find splines containing each node
  const draggedSplineEntry = Object.entries(graph.splines).find(([, spline]) =>
    spline.nodeIds.includes(draggedNodeId as string)
  );
  const targetSplineEntry = Object.entries(graph.splines).find(([, spline]) =>
    spline.nodeIds.includes(targetNodeId as string)
  );

  if (!draggedSplineEntry || !targetSplineEntry) {
    return false;
  }

  const [draggedSplineId, draggedSpline] = draggedSplineEntry;
  const [targetSplineId, targetSpline] = targetSplineEntry;

  // Must be different splines
  if (draggedSplineId === targetSplineId) {
    return false;
  }

  // Get node kinds
  const draggedKind = getNodeKind(graph, draggedNodeId);
  const targetKind = getNodeKind(graph, targetNodeId);

  // One must be source, other must be mouth (end-to-start connection)
  const isValidConnection =
    (draggedKind === 'mouth' && targetKind === 'source') ||
    (draggedKind === 'source' && targetKind === 'mouth');

  if (!isValidConnection) {
    return false;
  }

  // Both must be endpoints (already checked above implicitly)
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
  const entry = Object.entries(graph.splines).find(([, spline]) =>
    spline.nodeIds.includes(nodeId as string)
  );
  return entry ? (entry[0] as SplineId) : null;
}
