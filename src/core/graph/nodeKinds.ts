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
