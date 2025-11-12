/**
 * GraphAdapter - Converts RiverGraphV2 to legacy RiverGraph format
 *
 * This adapter allows the new Node-Spline architecture to work with
 * existing RenderService and FlowService without rewriting them.
 *
 * This is a temporary bridge layer. Eventually, services should be
 * refactored to work directly with RiverGraphV2 + GeometryCache.
 */

import type { RiverGraphV2, Width, Spline } from '@/core/graph/types';
import type { RiverGraph, RiverPoint, Tributary } from '@domain/models/types';
import { isWidthRelative } from '@/core/graph/types';
import { DEFAULT_MAIN_RIVERBED_WIDTH } from '@domain/constants';

const clampPercent = (value: number) => Math.max(5, Math.min(100, value));

function resolveSplineWidthPx(
  graph: RiverGraphV2,
  spline: Spline,
  visited: Set<string> = new Set()
): number {
  if (visited.has(spline.id)) {
    return DEFAULT_MAIN_RIVERBED_WIDTH;
  }
  visited.add(spline.id);

  if (spline.width.kind === 'px') {
    return spline.width.value;
  }

  if (spline.parentId) {
    const parent = graph.splines[spline.parentId];
    if (parent) {
      const parentWidth = resolveSplineWidthPx(graph, parent, visited);
      return (spline.width.value / 100) * parentWidth;
    }
  }

  return (spline.width.value / 100) * DEFAULT_MAIN_RIVERBED_WIDTH;
}

/**
 * Converts RiverGraphV2 to legacy RiverGraph format
 *
 * @param graphV2 - New Node-Spline graph
 * @returns Legacy RiverGraph format
 */
export function convertToLegacyFormat(
  graphV2: RiverGraphV2
): RiverGraph {
  const mainRiver: RiverPoint[] = [];
  const tributaries = new Map<string, Tributary>();

  console.log('🔄 Converting GraphV2:', {
    nodes: Object.keys(graphV2.nodes).length,
    splines: Object.keys(graphV2.splines).length,
    mainSplineId: graphV2.mainSplineId,
  });

  // Convert main river
  const mainSpline = graphV2.mainSplineId ? graphV2.splines[graphV2.mainSplineId] : null;
  if (mainSpline) {
    console.log('📍 Main spline found:', {
      id: mainSpline.id,
      nodeIds: mainSpline.nodeIds.length,
    });

    // Get control points for main river
    for (const nodeId of mainSpline.nodeIds) {
      const node = graphV2.nodes[nodeId];
      if (node) {
        mainRiver.push({
          x: node.x,
          y: node.y,
          id: node.id,
        });
      }
    }
  } else {
    console.log('⚠️ No main spline found');
  }

  const serializeSplinePoints = (nodeIds: string[]) => {
    const points: RiverPoint[] = [];
    for (const nodeId of nodeIds) {
      const node = graphV2.nodes[nodeId];
      if (node) {
        points.push({
          x: node.x,
          y: node.y,
          id: node.id,
        });
      }
    }
    return points;
  };

  const computeWidthPercent = (widthValue: Width, fallbackPx = DEFAULT_MAIN_RIVERBED_WIDTH) => {
    if (isWidthRelative(widthValue)) {
      return clampPercent(widthValue.value);
    }
    return clampPercent((widthValue.value / fallbackPx) * 100);
  };

  // Convert tributaries and независимые реки
  for (const [splineId, spline] of Object.entries(graphV2.splines)) {
    const isMain = mainSpline && splineId === mainSpline.id;
    if (isMain) continue;

    const points = serializeSplinePoints(spline.nodeIds);
    if (points.length === 0) continue;

    const resolvedWidthPx = resolveSplineWidthPx(graphV2, spline);
    const isIndependent = spline.kind === 'river';
    const widthPercent = computeWidthPercent(
      spline.width,
      isIndependent ? DEFAULT_MAIN_RIVERBED_WIDTH : resolvedWidthPx
    );
    const isDetached = spline.kind === 'tributary' && spline.parentId === null;

    tributaries.set(splineId, {
      id: splineId,
      parentPointId: spline.parentJunction,
      points,
      widthPercent,
      isDetached,
      isIndependent,
      resolvedWidthPx,
      parentSplineId: spline.parentId,
      widthKind: spline.width.kind,
    });
  }

  console.log('✅ Converted to legacy format:', {
    mainRiverPoints: mainRiver.length,
    tributariesCount: tributaries.size,
  });

  return {
    mainRiver,
    tributaries,
  };
}

/**
 * Gets point ID from node ID
 * In legacy format, point IDs are the same as node IDs
 */
export function nodeIdToPointId(nodeId: string): string {
  return nodeId;
}

/**
 * Gets spline ID from spline ID
 * Main spline → "main", tributary spline → spline ID
 */
export function edgeIdToSplineId(graphV2: RiverGraphV2, splineId: string): string {
  if (splineId === graphV2.mainSplineId) {
    return 'main';
  }
  return splineId;
}

/**
 * Gets spline ID from spline ID
 * "main" → main spline ID, otherwise → spline ID
 */
export function splineIdToEdgeId(graphV2: RiverGraphV2, splineId: string): string | null {
  if (splineId === 'main') {
    return graphV2.mainSplineId;
  }
  // Check if it's a valid tributary
  if (graphV2.splines[splineId]) {
    return splineId;
  }
  return null;
}
