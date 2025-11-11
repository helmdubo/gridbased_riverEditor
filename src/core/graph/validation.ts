/**
 * Graph validation functions
 *
 * This module provides pure functions for validating river graph topology
 * and checking invariants. All functions are stateless and side-effect free.
 *
 * @module core/graph/validation
 */

import type { RiverGraphV2, NodeId, EdgeId, Edge } from './types';

/**
 * Validation result with optional error message
 */
export interface ValidationResult {
  valid: boolean;
  error?: string;
}

/**
 * Validates a single edge for structural correctness
 *
 * Checks:
 * - Edge has at least 2 nodes (a segment needs start and end)
 * - All referenced nodes exist in the graph
 * - Node IDs are unique within the edge
 *
 * @ue_equivalent
 * UFUNCTION(BlueprintPure)
 * static bool ValidateEdge(const FRiverGraph& Graph, const FRiverEdge& Edge, FString& OutError);
 */
export function validateEdge(graph: RiverGraphV2, edge: Edge): ValidationResult {
  // Check minimum node count
  if (edge.nodeIds.length < 2) {
    return {
      valid: false,
      error: `Edge ${edge.id} must have at least 2 nodes, has ${edge.nodeIds.length}`,
    };
  }

  // Check all nodes exist
  for (const nodeId of edge.nodeIds) {
    if (!graph.nodes[nodeId]) {
      return {
        valid: false,
        error: `Edge ${edge.id} references non-existent node ${nodeId}`,
      };
    }
  }

  // Check for duplicate nodes in edge
  const uniqueNodes = new Set(edge.nodeIds);
  if (uniqueNodes.size !== edge.nodeIds.length) {
    return {
      valid: false,
      error: `Edge ${edge.id} contains duplicate node IDs`,
    };
  }

  return { valid: true };
}

/**
 * Validates the entire graph for structural correctness
 *
 * Checks:
 * - All edges are valid (via validateEdge)
 * - Main edge exists if mainEdgeId is set
 * - Main edge has kind='main'
 * - No orphaned nodes (nodes not referenced by any edge)
 * - Tributary parent junctions exist and are valid
 * - Detached tributaries have parentJunction=null
 *
 * @ue_equivalent
 * UFUNCTION(BlueprintPure)
 * static bool IsValidGraph(const FRiverGraph& Graph, FString& OutError);
 */
export function isValidGraph(graph: RiverGraphV2): ValidationResult {
  // Check main edge
  if (graph.mainEdgeId !== null) {
    const mainEdge = graph.edges[graph.mainEdgeId];
    if (!mainEdge) {
      return {
        valid: false,
        error: `Main edge ${graph.mainEdgeId} does not exist`,
      };
    }
    if (mainEdge.kind !== 'main') {
      return {
        valid: false,
        error: `Main edge ${graph.mainEdgeId} has wrong kind: ${mainEdge.kind}`,
      };
    }
  }

  // Validate all edges
  for (const edge of Object.values(graph.edges)) {
    const edgeValidation = validateEdge(graph, edge);
    if (!edgeValidation.valid) {
      return edgeValidation;
    }

    // Check tributary-specific constraints
    if (edge.kind === 'tributary') {
      if (!edge.isDetached && edge.parentJunction === null) {
        return {
          valid: false,
          error: `Attached tributary ${edge.id} must have parentJunction`,
        };
      }
      if (edge.isDetached && edge.parentJunction !== null) {
        return {
          valid: false,
          error: `Detached tributary ${edge.id} must have parentJunction=null`,
        };
      }
      if (edge.parentJunction !== null && !graph.nodes[edge.parentJunction]) {
        return {
          valid: false,
          error: `Tributary ${edge.id} references non-existent junction ${edge.parentJunction}`,
        };
      }
    }

    // Check main edge constraints
    if (edge.kind === 'main') {
      if (edge.parentJunction !== null) {
        return {
          valid: false,
          error: `Main edge ${edge.id} must have parentJunction=null`,
        };
      }
      if (edge.isDetached) {
        return {
          valid: false,
          error: `Main edge ${edge.id} cannot be detached`,
        };
      }
    }
  }

  // Check for orphaned nodes (nodes not used by any edge)
  const usedNodes = new Set<string>();
  for (const edge of Object.values(graph.edges)) {
    edge.nodeIds.forEach((nodeId) => usedNodes.add(nodeId));
  }

  for (const nodeId of Object.keys(graph.nodes)) {
    if (!usedNodes.has(nodeId)) {
      return {
        valid: false,
        error: `Orphaned node ${nodeId} is not referenced by any edge`,
      };
    }
  }

  return { valid: true };
}

/**
 * Checks if a node is a junction (connected to 2+ edges)
 *
 * Junction nodes are where tributaries meet the main river,
 * or where multiple tributaries meet.
 *
 * @ue_equivalent
 * UFUNCTION(BlueprintPure)
 * static bool IsJunctionNode(const FRiverGraph& Graph, const FGuid& NodeId);
 */
export function isJunctionNode(graph: RiverGraphV2, nodeId: NodeId): boolean {
  let edgeCount = 0;

  for (const edge of Object.values(graph.edges)) {
    if (edge.nodeIds.includes(nodeId as string)) {
      edgeCount++;
      if (edgeCount >= 2) {
        return true;
      }
    }
  }

  return false;
}

/**
 * Finds all junction nodes in the graph
 *
 * Returns an array of NodeIds that are shared by 2+ edges.
 *
 * @ue_equivalent
 * UFUNCTION(BlueprintPure)
 * static TArray<FGuid> FindJunctionNodes(const FRiverGraph& Graph);
 */
export function findJunctionNodes(graph: RiverGraphV2): NodeId[] {
  const nodeCounts = new Map<string, number>();

  // Count edge references for each node
  for (const edge of Object.values(graph.edges)) {
    for (const nodeId of edge.nodeIds) {
      nodeCounts.set(nodeId as string, (nodeCounts.get(nodeId as string) || 0) + 1);
    }
  }

  // Filter nodes with 2+ references
  const junctions: NodeId[] = [];
  for (const [nodeId, count] of nodeCounts.entries()) {
    if (count >= 2) {
      junctions.push(nodeId as NodeId);
    }
  }

  return junctions;
}

/**
 * Checks if a tributary can be attached to a specific node
 *
 * Rules:
 * - Node must exist in the graph
 * - Node must be part of the main river (or already a junction)
 * - For main river nodes:
 *   - Cannot attach to endpoints (first/last node) unless already a junction
 *   - Can attach to any internal node
 *
 * @ue_equivalent
 * UFUNCTION(BlueprintPure)
 * static bool CanAttachToNode(const FRiverGraph& Graph, const FGuid& NodeId, FString& OutReason);
 */
export function canAttachToNode(
  graph: RiverGraphV2,
  nodeId: NodeId
): ValidationResult {
  // Check node exists
  if (!graph.nodes[nodeId]) {
    return {
      valid: false,
      error: `Node ${nodeId} does not exist`,
    };
  }

  // If already a junction, always allowed
  if (isJunctionNode(graph, nodeId)) {
    return { valid: true };
  }

  // Check if node is part of main river
  if (graph.mainEdgeId === null) {
    return {
      valid: false,
      error: 'Cannot attach tributary: no main river exists',
    };
  }

  const mainEdge = graph.edges[graph.mainEdgeId];
  if (!mainEdge) {
    return {
      valid: false,
      error: 'Cannot attach tributary: main edge not found',
    };
  }

  const nodeIndex = mainEdge.nodeIds.indexOf(nodeId as string);
  if (nodeIndex === -1) {
    return {
      valid: false,
      error: `Node ${nodeId} is not part of the main river`,
    };
  }

  // Cannot attach to endpoints (first or last node) of main river
  if (nodeIndex === 0 || nodeIndex === mainEdge.nodeIds.length - 1) {
    return {
      valid: false,
      error: 'Cannot attach to river endpoints (mouth or source)',
    };
  }

  return { valid: true };
}

/**
 * Gets all edges connected to a node
 *
 * @ue_equivalent
 * UFUNCTION(BlueprintPure)
 * static TArray<FGuid> GetConnectedEdges(const FRiverGraph& Graph, const FGuid& NodeId);
 */
export function getConnectedEdges(graph: RiverGraphV2, nodeId: NodeId): EdgeId[] {
  const connectedEdges: EdgeId[] = [];

  for (const edge of Object.values(graph.edges)) {
    if (edge.nodeIds.includes(nodeId as string)) {
      connectedEdges.push(edge.id);
    }
  }

  return connectedEdges;
}

/**
 * Checks if a node is an endpoint (first or last) of an edge
 *
 * @ue_equivalent
 * UFUNCTION(BlueprintPure)
 * static bool IsEndpoint(const FRiverEdge& Edge, const FGuid& NodeId);
 */
export function isEndpoint(edge: Edge, nodeId: NodeId): boolean {
  if (edge.nodeIds.length === 0) return false;
  return (
    edge.nodeIds[0] === nodeId ||
    edge.nodeIds[edge.nodeIds.length - 1] === nodeId
  );
}

/**
 * Gets the index of a node within an edge's nodeIds array
 *
 * @returns Index of node in edge, or -1 if not found
 * @ue_equivalent
 * UFUNCTION(BlueprintPure)
 * static int32 GetNodeIndexInEdge(const FRiverEdge& Edge, const FGuid& NodeId);
 */
export function getNodeIndexInEdge(edge: Edge, nodeId: NodeId): number {
  return edge.nodeIds.indexOf(nodeId as string);
}
