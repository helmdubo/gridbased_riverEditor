/**
 * Snapping utilities for RiverGraphV2
 *
 * Provides functions for:
 * - Point snapping (finding nearest node within snap radius)
 * - Spline snapping (finding nearest point on spline curve)
 * - Forbidden zone validation (junction nodes)
 *
 * @module core/graph/snapping
 */

import type { RiverGraphV2, NodeId, SplineId, Node } from './types';
import type { GraphCache } from '@/core/geometry/cache';
import type { Point } from '@/core/geometry/geometry';
import GraphService from '@services/GraphService';

/**
 * Snap target result for node snapping
 */
export interface SnapTargetNode {
  nodeId: NodeId;
  node: Node;
  distance: number;
}

/**
 * Snap target result for spline snapping
 */
export interface SplineSnapResult {
  splineId: SplineId;
  /** Index in curvePoints array */
  curveIndex: number;
  /** Snapped point coordinates */
  point: Point;
  /** Distance from cursor to snapped point */
  distance: number;
  /** Parameter t along the segment (0-1) */
  t: number;
}

/**
 * Find closest node within snap distance
 *
 * Searches all nodes in the graph and returns the closest one within snapDistance.
 * Optionally filters nodes using a predicate function.
 *
 * @param graph - River graph
 * @param x - Target x coordinate
 * @param y - Target y coordinate
 * @param snapDistance - Maximum distance for snapping (pixels)
 * @param filter - Optional filter predicate (e.g., exclude junction nodes)
 * @returns Snap target or null if no node within distance
 *
 * @ue_equivalent
 * UFUNCTION(BlueprintCallable)
 * static FSnapTargetNode FindSnapTargetNode(const FRiverGraph& Graph,
 *                                            FVector2D Target,
 *                                            float SnapDistance,
 *                                            TFunction<bool(FGuid)> Filter);
 */
export function findSnapTargetNode(
  graph: RiverGraphV2,
  x: number,
  y: number,
  snapDistance: number,
  filter?: (nodeId: NodeId, node: Node) => boolean
): SnapTargetNode | null {
  let closestNode: SnapTargetNode | null = null;
  let closestDist = snapDistance;

  for (const [nodeId, node] of Object.entries(graph.nodes)) {
    // Apply filter if provided
    if (filter && !filter(nodeId as NodeId, node)) {
      continue;
    }

    const dist = Math.hypot(node.x - x, node.y - y);
    if (dist < closestDist) {
      closestDist = dist;
      closestNode = {
        nodeId: nodeId as NodeId,
        node,
        distance: dist,
      };
    }
  }

  return closestNode;
}

/**
 * Find closest point on any spline curve
 *
 * Searches all splines in the graph and returns the closest point on any curve
 * within snapDistance.
 *
 * @param graph - River graph
 * @param cache - Geometry cache with curve points
 * @param x - Target x coordinate
 * @param y - Target y coordinate
 * @param snapDistance - Maximum distance for snapping (pixels)
 * @param filter - Optional filter predicate (e.g., only specific spline)
 * @returns Spline snap result or null if no curve within distance
 *
 * @ue_equivalent
 * UFUNCTION(BlueprintCallable)
 * static FSplineSnapResult FindSplineSnapPoint(const FRiverGraph& Graph,
 *                                               const TMap<FGuid, FEdgeCache>& Cache,
 *                                               FVector2D Target,
 *                                               float SnapDistance,
 *                                               TFunction<bool(FGuid)> Filter);
 */
export function findSplineSnapPoint(
  graph: RiverGraphV2,
  cache: GraphCache,
  x: number,
  y: number,
  snapDistance: number,
  filter?: (splineId: SplineId) => boolean
): SplineSnapResult | null {
  let closestSnap: SplineSnapResult | null = null;
  let closestDist = snapDistance;

  for (const [splineId] of Object.entries(graph.splines)) {
    // Apply filter if provided
    if (filter && !filter(splineId as SplineId)) {
      continue;
    }

    const edgeCache = cache[splineId];
    if (!edgeCache || edgeCache.curvePoints.length < 2) {
      continue;
    }

    // Check each segment of the curve
    const curvePoints = edgeCache.curvePoints;
    for (let i = 0; i < curvePoints.length - 1; i++) {
      const p1 = curvePoints[i];
      const p2 = curvePoints[i + 1];

      // Find closest point on this segment
      const result = closestPointOnSegment(p1, p2, { x, y });

      if (result.distance < closestDist) {
        closestDist = result.distance;
        closestSnap = {
          splineId: splineId as SplineId,
          curveIndex: i,
          point: result.point,
          distance: result.distance,
          t: result.t,
        };
      }
    }
  }

  return closestSnap;
}

/**
 * Helper: Find closest point on a line segment
 *
 * Projects point onto line segment and returns closest point + distance.
 *
 * @param segStart - Segment start point
 * @param segEnd - Segment end point
 * @param target - Target point
 * @returns Closest point, distance, and parameter t (0-1)
 */
function closestPointOnSegment(
  segStart: Point,
  segEnd: Point,
  target: Point
): { point: Point; distance: number; t: number } {
  const dx = segEnd.x - segStart.x;
  const dy = segEnd.y - segStart.y;
  const lengthSq = dx * dx + dy * dy;

  // Degenerate segment (single point)
  if (lengthSq === 0) {
    const dist = Math.hypot(target.x - segStart.x, target.y - segStart.y);
    return {
      point: { x: segStart.x, y: segStart.y },
      distance: dist,
      t: 0,
    };
  }

  // Project target onto line (unclamped)
  let t = ((target.x - segStart.x) * dx + (target.y - segStart.y) * dy) / lengthSq;

  // Clamp to segment [0, 1]
  t = Math.max(0, Math.min(1, t));

  // Calculate closest point
  const px = segStart.x + t * dx;
  const py = segStart.y + t * dy;
  const dist = Math.hypot(target.x - px, target.y - py);

  return {
    point: { x: px, y: py },
    distance: dist,
    t,
  };
}

/**
 * Check if coordinates are in forbidden zone around junction nodes
 *
 * Junction nodes are nodes that have tributary splines attached.
 * Forbidden zone radius is typically equal to the main river width.
 *
 * @param graph - River graph
 * @param x - Target x coordinate
 * @param y - Target y coordinate
 * @param forbiddenRadius - Forbidden zone radius (pixels)
 * @returns True if in forbidden zone
 *
 * @ue_equivalent
 * UFUNCTION(BlueprintCallable)
 * static bool IsInForbiddenZone(const FRiverGraph& Graph,
 *                                FVector2D Target,
 *                                float ForbiddenRadius);
 */
export function isInForbiddenZone(
  graph: RiverGraphV2,
  x: number,
  y: number,
  forbiddenRadius: number
): boolean {
  for (const [nodeId, node] of Object.entries(graph.nodes)) {
    // Check if this node is a junction (has children tributaries)
    if (GraphService.isJunctionNode(graph, nodeId as NodeId)) {
      const dist = Math.hypot(node.x - x, node.y - y);
      if (dist < forbiddenRadius) {
        return true;
      }
    }
  }

  return false;
}

/**
 * Check if a node can have tributaries attached
 *
 * Rules:
 * - Cannot attach to junction nodes (already have tributary)
 * - Cannot attach to source node (first node in spline)
 * - Can attach to any other node
 *
 * @param graph - River graph
 * @param nodeId - Node ID to check
 * @returns True if tributaries can attach to this node
 *
 * @ue_equivalent
 * UFUNCTION(BlueprintCallable)
 * static bool CanAttachTributary(const FRiverGraph& Graph, FGuid NodeId);
 */
export function canAttachTributary(
  graph: RiverGraphV2,
  nodeId: NodeId
): boolean {
  // Cannot attach to junction nodes
  if (GraphService.isJunctionNode(graph, nodeId)) {
    return false;
  }

  // Find which spline contains this node
  const splineWithNode = Object.values(graph.splines).find((spline) =>
    spline.nodeIds.includes(nodeId as string)
  );

  if (!splineWithNode) {
    return false;
  }

  // Cannot attach to source node (first node in spline)
  const nodeIndex = splineWithNode.nodeIds.indexOf(nodeId as string);
  if (nodeIndex === 0) {
    return false;
  }

  return true;
}

/**
 * Find valid snap targets for tributary attachment
 *
 * Combines point and spline snapping with forbidden zone checks.
 * Returns the best snap target based on distance priority:
 * 1. Valid node within point snap distance
 * 2. Valid spline point within spline snap distance
 * 3. null (no valid snap)
 *
 * @param graph - River graph
 * @param cache - Geometry cache
 * @param x - Target x coordinate
 * @param y - Target y coordinate
 * @param pointSnapDist - Point snap distance (default 25px)
 * @param splineSnapDist - Spline snap distance (default 30px)
 * @param forbiddenRadius - Forbidden zone radius (default mainRiverWidth)
 * @returns Best snap target or null
 */
export function findTributarySnapTarget(
  graph: RiverGraphV2,
  cache: GraphCache,
  x: number,
  y: number,
  pointSnapDist: number,
  splineSnapDist: number,
  forbiddenRadius: number
): { type: 'node'; data: SnapTargetNode } | { type: 'spline'; data: SplineSnapResult } | null {
  // Check forbidden zone first
  if (isInForbiddenZone(graph, x, y, forbiddenRadius)) {
    return null;
  }

  // Try point snapping first (higher priority)
  const nodeSnap = findSnapTargetNode(
    graph,
    x,
    y,
    pointSnapDist,
    (nodeId) => canAttachTributary(graph, nodeId)
  );

  if (nodeSnap) {
    return { type: 'node', data: nodeSnap };
  }

  // Try spline snapping
  const splineSnap = findSplineSnapPoint(
    graph,
    cache,
    x,
    y,
    splineSnapDist,
    // Only snap to main river or independent rivers (not tributaries)
    (splineId) => {
      const spline = graph.splines[splineId];
      return spline && spline.parentId === null;
    }
  );

  if (splineSnap) {
    return { type: 'spline', data: splineSnap };
  }

  return null;
}
