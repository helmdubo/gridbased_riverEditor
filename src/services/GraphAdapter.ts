/**
 * GraphAdapter - Converts RiverGraphV2 to legacy RiverGraph format
 *
 * This adapter allows the new Node-Edge architecture to work with
 * existing RenderService and FlowService without rewriting them.
 *
 * This is a temporary bridge layer. Eventually, services should be
 * refactored to work directly with RiverGraphV2 + GeometryCache.
 */

import type { RiverGraphV2 } from '@/core/graph/types';
import type { RiverGraph, RiverPoint, Tributary } from '@domain/models/types';
import { isWidthRel } from '@/core/graph/types';

/**
 * Converts RiverGraphV2 to legacy RiverGraph format
 *
 * @param graphV2 - New Node-Edge graph
 * @returns Legacy RiverGraph format
 */
export function convertToLegacyFormat(
  graphV2: RiverGraphV2
): RiverGraph {
  const mainRiver: RiverPoint[] = [];
  const tributaries = new Map<string, Tributary>();

  console.log('🔄 Converting GraphV2:', {
    nodes: Object.keys(graphV2.nodes).length,
    edges: Object.keys(graphV2.edges).length,
    mainEdgeId: graphV2.mainEdgeId,
  });

  // Convert main river
  const mainEdge = graphV2.mainEdgeId ? graphV2.edges[graphV2.mainEdgeId] : null;
  if (mainEdge) {
    console.log('📍 Main edge found:', {
      id: mainEdge.id,
      nodeIds: mainEdge.nodeIds.length,
    });

    // Get control points for main river
    for (const nodeId of mainEdge.nodeIds) {
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
    console.log('⚠️ No main edge found');
  }

  // Convert tributaries
  for (const [edgeId, edge] of Object.entries(graphV2.edges)) {
    if (edge.kind !== 'tributary') continue;

    const points: RiverPoint[] = [];
    for (const nodeId of edge.nodeIds) {
      const node = graphV2.nodes[nodeId];
      if (node) {
        points.push({
          x: node.x,
          y: node.y,
          id: node.id,
        });
      }
    }

    // Get width as percentage
    let widthPercent = 50; // Default
    if (isWidthRel(edge.width)) {
      widthPercent = edge.width.percent;
    } else {
      // If absolute width, convert to rough percentage (assume main river = 60px)
      widthPercent = (edge.width.value / 60) * 100;
    }

    tributaries.set(edgeId, {
      id: edgeId,
      parentPointId: edge.parentJunction,
      points,
      widthPercent,
      isDetached: edge.isDetached,
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
 * Gets spline ID from edge ID
 * Main edge → "main", tributary edge → edge ID
 */
export function edgeIdToSplineId(graphV2: RiverGraphV2, edgeId: string): string {
  if (edgeId === graphV2.mainEdgeId) {
    return 'main';
  }
  return edgeId;
}

/**
 * Gets edge ID from spline ID
 * "main" → main edge ID, otherwise → spline ID
 */
export function splineIdToEdgeId(graphV2: RiverGraphV2, splineId: string): string | null {
  if (splineId === 'main') {
    return graphV2.mainEdgeId;
  }
  // Check if it's a valid tributary
  if (graphV2.edges[splineId]) {
    return splineId;
  }
  return null;
}
