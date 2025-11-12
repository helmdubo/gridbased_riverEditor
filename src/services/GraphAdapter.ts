/**
 * GraphAdapter - Converts RiverGraphV2 to legacy RiverGraph format
 *
 * This adapter allows the new Node-Spline architecture to work with
 * existing RenderService and FlowService without rewriting them.
 *
 * This is a temporary bridge layer. Eventually, services should be
 * refactored to work directly with RiverGraphV2 + GeometryCache.
 */

import type { RiverGraphV2, Width } from '@/core/graph/types';
import type { RiverGraph, RiverPoint, Tributary } from '@domain/models/types';
import { isWidthRelative } from '@/core/graph/types';

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

  const computeWidthPercent = (widthValue: Width, fallbackPx = 60) => {
    if (isWidthRelative(widthValue)) {
      return widthValue.value;
    }
    return (widthValue.value / fallbackPx) * 100;
  };

  // Convert tributaries and независимые реки
  for (const [splineId, spline] of Object.entries(graphV2.splines)) {
    const isMain = mainSpline && splineId === mainSpline.id;
    if (isMain) continue;

    const points = serializeSplinePoints(spline.nodeIds);
    if (points.length === 0) continue;

    const widthPercent = computeWidthPercent(spline.width);
    const isIndependent = spline.kind === 'river';
    const isDetached = spline.parentId === null;

    tributaries.set(splineId, {
      id: splineId,
      parentPointId: spline.parentJunction,
      points,
      widthPercent,
      isDetached,
      isIndependent,
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
