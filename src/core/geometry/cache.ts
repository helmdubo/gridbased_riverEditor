/**
 * Geometry caching for splines
 *
 * This module provides caching functionality for spline geometry.
 * Instead of recomputing curve interpolation and frames on every render,
 * we cache them and only recompute when the graph changes.
 *
 * Cache invalidation is simple: rebuild cache when graph changes.
 *
 * @module core/geometry/cache
 */

import type { RiverGraphV2, SplineId } from '../graph/types';
import type { Point } from './geometry';
import type { CurveFrames } from './frames';
import { getCurvePoints } from './curves';
import { computeFrames } from './frames';

/**
 * Cached geometry for a single spline
 *
 * Contains all precomputed geometric data needed for rendering and interaction.
 */
export interface EdgeCache {
  /** Original control point node IDs */
  controlNodeIds: string[];

  /** Interpolated curve points */
  curvePoints: Point[];

  /**
   * Maps each curve sample to its source control segment
   * Critical for correct snap behavior (P0 bugfix)
   */
  segIndexAt: number[];

  /** Frenet frames (tangents, normals, curvature) */
  frames: CurveFrames;

  /** Total arc length of curve */
  arcLength: number;
}

/**
 * Complete geometry cache for all splines in the graph
 */
export type GraphCache = Record<string, EdgeCache>;

/**
 * Builds cache for a single spline
 *
 * @param controlPoints - Control points defining the spline
 * @param controlNodeIds - Node IDs corresponding to control points
 * @param segments - Number of samples per control segment
 * @returns Cached geometry for the spline
 *
 * @ue_equivalent
 * UFUNCTION(BlueprintCallable)
 * static FEdgeCache BuildEdgeCache(const TArray<FVector2D>& ControlPoints,
 *                                   const TArray<FGuid>& NodeIds,
 *                                   int32 SegmentsPerEdge);
 */
export function buildEdgeCache(
  controlPoints: Point[],
  controlNodeIds: string[],
  segments?: number
): EdgeCache {
  // Generate curve points with segIndexAt
  const { points, segIndexAt } = getCurvePoints(controlPoints, segments);

  // Compute Frenet frames
  const frames = computeFrames(points);

  // Calculate arc length
  let arcLength = 0;
  for (let i = 1; i < points.length; i++) {
    const dx = points[i].x - points[i - 1].x;
    const dy = points[i].y - points[i - 1].y;
    arcLength += Math.sqrt(dx * dx + dy * dy);
  }

  return {
    controlNodeIds: [...controlNodeIds],
    curvePoints: points,
    segIndexAt,
    frames,
    arcLength,
  };
}

/**
 * Builds geometry cache for all splines in a graph
 *
 * This is the main entry point for cache generation.
 * Call this whenever the graph structure changes (nodes added/moved/deleted).
 *
 * @param graph - River graph
 * @param segments - Number of samples per control segment (optional)
 * @returns Cache mapping SplineId → EdgeCache
 *
 * @ue_equivalent
 * UFUNCTION(BlueprintCallable)
 * static void BuildGraphCache(const FRiverGraph& Graph, int32 SegmentsPerEdge,
 *                              TMap<FGuid, FEdgeCache>& OutCache);
 */
export function buildGraphCache(
  graph: RiverGraphV2,
  segments?: number
): GraphCache {
  const cache: GraphCache = {};

  for (const [splineId, spline] of Object.entries(graph.splines)) {
    // Convert node IDs to Point array
    const controlPoints: Point[] = spline.nodeIds.map((nodeId) => {
      const node = graph.nodes[nodeId];
      if (!node) {
        console.warn(`Node ${nodeId} not found for spline ${splineId}`);
        return { x: 0, y: 0 };
      }
      return { x: node.x, y: node.y };
    });

    // Skip splines with less than 2 points
    if (controlPoints.length < 2) {
      console.warn(`Spline ${splineId} has less than 2 control points, skipping cache`);
      continue;
    }

    // Build cache for this spline
    cache[splineId] = buildEdgeCache(controlPoints, spline.nodeIds, segments);
  }

  return cache;
}

/**
 * Gets cached geometry for a specific spline
 *
 * @param cache - Graph cache
 * @param splineId - Spline ID to lookup
 * @returns Cached geometry or null if not found
 */
export function getEdgeCache(cache: GraphCache, splineId: SplineId): EdgeCache | null {
  return cache[splineId] || null;
}

/**
 * Checks if an spline needs cache rebuild
 *
 * An spline needs rebuild if:
 * - Cache doesn't exist for this spline
 * - Number of control points changed
 * - Any control point position changed (checked via node IDs)
 *
 * @param cache - Graph cache
 * @param splineId - Spline ID
 * @param graph - Current graph
 * @returns True if cache needs rebuild
 */
export function needsCacheRebuild(
  cache: GraphCache,
  splineId: SplineId,
  graph: RiverGraphV2
): boolean {
  const edgeCache = cache[splineId];
  if (!edgeCache) return true;

  const spline = graph.splines[splineId];
  if (!spline) return true;

  // Check if node IDs changed
  if (edgeCache.controlNodeIds.length !== spline.nodeIds.length) {
    return true;
  }

  for (let i = 0; i < spline.nodeIds.length; i++) {
    if (edgeCache.controlNodeIds[i] !== spline.nodeIds[i]) {
      return true;
    }
  }

  // Note: We don't check node positions here because:
  // - That would require comparing all coordinates
  // - Caller should invalidate cache when nodes move
  // - It's cheaper to just rebuild than to check every coordinate

  return false;
}

/**
 * Invalidates (removes) cache entries for specific splines
 *
 * @param cache - Graph cache
 * @param splineIds - Spline IDs to invalidate
 * @returns Updated cache with specified splines removed
 */
export function invalidateEdges(cache: GraphCache, splineIds: SplineId[]): GraphCache {
  const newCache = { ...cache };
  for (const splineId of splineIds) {
    delete newCache[splineId];
  }
  return newCache;
}

/**
 * Clears the entire cache
 *
 * @returns Empty cache
 */
export function clearCache(): GraphCache {
  return {};
}

/**
 * Updates cache for a node move (incremental update during drag)
 *
 * This is an optimization for drag operations. Instead of rebuilding
 * the entire cache, we only update splines that contain the moved node.
 *
 * @param cache - Current geometry cache
 * @param graph - River graph (with old node positions)
 * @param nodeId - Node being moved
 * @param newX - New X position
 * @param newY - New Y position
 * @param segments - Number of samples per control segment (optional)
 * @returns Updated cache with only affected splines rebuilt
 *
 * @performance
 * - Only rebuilds affected splines (typically 1-2)
 * - Leaves untouched splines as-is (no recomputation)
 * - Perfect for real-time drag feedback
 */
export function updateCacheForNodeMove(
  cache: GraphCache,
  graph: RiverGraphV2,
  nodeId: string,
  newX: number,
  newY: number,
  segments?: number
): GraphCache {
  // Find all splines that contain this node
  const affectedSplineIds: string[] = [];
  for (const [splineId, spline] of Object.entries(graph.splines)) {
    if (spline.nodeIds.includes(nodeId)) {
      affectedSplineIds.push(splineId);
    }
  }

  if (affectedSplineIds.length === 0) {
    return cache; // No changes needed
  }

  // Clone cache (shallow copy is enough - we replace affected entries entirely)
  const newCache = { ...cache };

  // Rebuild cache only for affected splines
  for (const splineId of affectedSplineIds) {
    const spline = graph.splines[splineId];
    if (!spline) continue;

    // Build control points with updated position for the moved node
    const controlPoints: Point[] = spline.nodeIds.map((nid) => {
      if (nid === nodeId) {
        return { x: newX, y: newY };
      }
      const node = graph.nodes[nid];
      return node ? { x: node.x, y: node.y } : { x: 0, y: 0 };
    });

    if (controlPoints.length < 2) continue;

    // Rebuild cache for this spline only
    newCache[splineId] = buildEdgeCache(controlPoints, spline.nodeIds, segments);
  }

  return newCache;
}
