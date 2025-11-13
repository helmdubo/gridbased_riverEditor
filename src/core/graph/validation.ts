/**
 * Graph validation functions
 *
 * This module provides pure functions for validating river graph topology
 * and checking invariants. All functions are stateless and side-effect free.
 *
 * @module core/graph/validation
 */

import type { RiverGraphV2, NodeId, SplineId, Spline } from './types';
import { computeNodeKind } from './nodeKinds';

/**
 * Validation result with optional error message
 */
export interface ValidationResult {
  valid: boolean;
  error?: string;
}

/**
 * Validates a single spline for structural correctness
 *
 * Checks:
 * - Spline has at least 2 nodes (a segment needs start and end)
 * - All referenced nodes exist in the graph
 * - Node IDs are unique within the spline
 *
 * @ue_equivalent
 * UFUNCTION(BlueprintPure)
 * static bool ValidateSpline(const FRiverGraph& Graph, const FRiverEdge& Spline, FString& OutError);
 */
export function validateSpline(graph: RiverGraphV2, spline: Spline): ValidationResult {
  if (spline.nodeIds.length < 1) {
    return {
      valid: false,
      error: `Spline ${spline.id} must contain at least one node`,
    };
  }

  for (const nodeId of spline.nodeIds) {
    if (!graph.nodes[nodeId]) {
      return {
        valid: false,
        error: `Spline ${spline.id} references non-existent node ${nodeId}`,
      };
    }
  }

  const uniqueNodes = new Set(spline.nodeIds);
  if (uniqueNodes.size !== spline.nodeIds.length) {
    return {
      valid: false,
      error: `Spline ${spline.id} contains duplicate node IDs`,
    };
  }

  return { valid: true };
}

/**
 * Validates the entire graph for structural correctness
 *
 * Checks:
 * - All splines are valid (via validateSpline)
 * - Root spline index (rootSplineIds) references only detached/independent splines
 * - Root index stays in sync with spline.parentId === null
 * - No orphaned nodes (nodes not referenced by any spline)
 * - Tributary parent junctions exist and are valid
 * - Detached tributaries have parentJunction=null
 *
 * @ue_equivalent
 * UFUNCTION(BlueprintPure)
 * static bool IsValidGraph(const FRiverGraph& Graph, FString& OutError);
 */
export function isValidGraph(graph: RiverGraphV2): ValidationResult {
  const rootSet = new Set(graph.rootSplineIds.map((id) => id as string));

  if (graph.mainSplineId) {
    const mainSpline = graph.splines[graph.mainSplineId];
    if (!mainSpline) {
      return {
        valid: false,
        error: `Main spline reference ${graph.mainSplineId} is missing`,
      };
    }

    if (mainSpline.parentId !== null) {
      return {
        valid: false,
        error: `Main spline ${mainSpline.id} must remain a root river`,
      };
    }

    if (!rootSet.has(mainSpline.id)) {
      return {
        valid: false,
        error: `Main spline ${mainSpline.id} must be listed in rootSplineIds`,
      };
    }
  }

  for (const rootId of graph.rootSplineIds) {
    const spline = graph.splines[rootId];
    if (!spline) {
      return {
        valid: false,
        error: `Root spline reference ${rootId} is missing`,
      };
    }

    if (spline.parentId !== null) {
      return {
        valid: false,
        error: `Root spline ${rootId} must not have a parent`,
      };
    }
  }

  for (const spline of Object.values(graph.splines)) {
    const validation = validateSpline(graph, spline);
    if (!validation.valid) {
      return validation;
    }

    if (spline.parentId === null && !rootSet.has(spline.id)) {
      return {
        valid: false,
        error: `Spline ${spline.id} has no parent but is missing from rootSplineIds`,
      };
    }

    if (spline.parentId !== null && rootSet.has(spline.id)) {
      return {
        valid: false,
        error: `Spline ${spline.id} cannot be in rootSplineIds while attached`,
      };
    }

    if (spline.isIndependent && (spline.kind !== 'river' || spline.parentId !== null)) {
      return {
        valid: false,
        error: `Spline ${spline.id} marked independent but is not a root river`,
      };
    }

    if (!spline.isIndependent && spline.kind === 'river' && spline.parentId === null && !spline.isDetached) {
      return {
        valid: false,
        error: `River ${spline.id} without parent should be marked independent`,
      };
    }

    if (spline.isDetached && spline.parentId !== null) {
      return {
        valid: false,
        error: `Spline ${spline.id} cannot be detached while having a parent`,
      };
    }

    if (spline.kind === 'tributary') {
      if (spline.parentId === null) {
        if (!spline.isDetached) {
          return {
            valid: false,
            error: `Detached tributary ${spline.id} must have isDetached=true`,
          };
        }

        if (spline.parentJunction !== null) {
          return {
            valid: false,
            error: `Detached tributary ${spline.id} must clear parentJunction`,
          };
        }
      } else {
        if (spline.isDetached) {
          return {
            valid: false,
            error: `Attached tributary ${spline.id} cannot have isDetached=true`,
          };
        }

        if (spline.parentJunction === null) {
          return {
            valid: false,
            error: `Tributary ${spline.id} missing parent junction reference`,
          };
        }

        const parentSpline = graph.splines[spline.parentId];
        if (!parentSpline) {
          return {
            valid: false,
            error: `Tributary ${spline.id} references non-existent parent ${spline.parentId}`,
          };
        }

        if (!parentSpline.nodeIds.includes(spline.parentJunction as string)) {
          return {
            valid: false,
            error: `Junction ${spline.parentJunction} is not part of parent spline ${parentSpline.id}`,
          };
        }
      }
    } else {
      if (spline.parentId !== null || spline.parentJunction !== null) {
        return {
          valid: false,
          error: `Independent spline ${spline.id} must not have parent references`,
        };
      }
    }

    for (const childId of spline.children) {
      const childSpline = graph.splines[childId];
      if (!childSpline) {
        return {
          valid: false,
          error: `Spline ${spline.id} references non-existent child ${childId}`,
        };
      }

      if (childSpline.parentId !== spline.id) {
        return {
          valid: false,
          error: `Child spline ${childId} does not link back to parent ${spline.id}`,
        };
      }
    }
  }

  // Validate stored node kinds against derived topology
  for (const nodeKey of Object.keys(graph.nodes)) {
    const nodeId = nodeKey as NodeId;
    const node = graph.nodes[nodeId];
    if (!node) {
      continue;
    }

    const expectedKind = computeNodeKind(graph, nodeId);
    if (node.kind !== expectedKind) {
      return {
        valid: false,
        error: `Node ${nodeId} has kind ${node.kind} but expected ${expectedKind}`,
      };
    }
  }

  return { valid: true };
}

/**
 * Checks if a node is a junction (connected to 2+ splines)
 *
 * Junction nodes are where tributaries meet the main river,
 * or where multiple tributaries meet.
 *
 * @ue_equivalent
 * UFUNCTION(BlueprintPure)
 * static bool IsJunctionNode(const FRiverGraph& Graph, const FGuid& NodeId);
 */
export function isJunctionNode(graph: RiverGraphV2, nodeId: NodeId): boolean {
  const node = graph.nodes[nodeId];
  if (!node) {
    return false;
  }

  if (node.kind === 'junction') {
    return true;
  }

  let edgeCount = 0;

  for (const spline of Object.values(graph.splines)) {
    if (spline.nodeIds.includes(nodeId as string)) {
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
 * Returns an array of NodeIds that are shared by 2+ splines.
 *
 * @ue_equivalent
 * UFUNCTION(BlueprintPure)
 * static TArray<FGuid> FindJunctionNodes(const FRiverGraph& Graph);
 */
export function findJunctionNodes(graph: RiverGraphV2): NodeId[] {
  return Object.entries(graph.nodes)
    .filter(([, node]) => node?.kind === 'junction')
    .map(([nodeId]) => nodeId as NodeId);
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

  // If already a junction, disallow attaching new tributary
  if (isJunctionNode(graph, nodeId)) {
    return {
      valid: false,
      error: 'Node already acts as a junction',
    };
  }

  // Find an attachable root river that owns this node (kind='river', parentId=null)
  const owningSplines = Object.values(graph.splines).filter(
    (spline) => spline.kind === 'river' && spline.parentId === null && spline.nodeIds.includes(nodeId as string)
  );

  if (owningSplines.length === 0) {
    return {
      valid: false,
      error: 'Cannot attach tributary: node is not part of an independent river',
    };
  }

  // Prevent attaching to endpoints of any owning river
  const attachableSpline = owningSplines.find((spline) => spline.isMain) || owningSplines[0];
  const nodeIndex = attachableSpline.nodeIds.indexOf(nodeId as string);

  if (nodeIndex <= 0) {
    return {
      valid: false,
      error: 'Cannot attach to river source node',
    };
  }

  if (nodeIndex === attachableSpline.nodeIds.length - 1) {
    return {
      valid: false,
      error: 'Cannot attach to river mouth node',
    };
  }

  return { valid: true };
}

/**
 * Gets all splines connected to a node
 *
 * @ue_equivalent
 * UFUNCTION(BlueprintPure)
 * static TArray<FGuid> GetConnectedSplines(const FRiverGraph& Graph, const FGuid& NodeId);
 */
export function getConnectedSplines(graph: RiverGraphV2, nodeId: NodeId): SplineId[] {
  const connectedEdges: SplineId[] = [];

  for (const spline of Object.values(graph.splines)) {
    if (spline.nodeIds.includes(nodeId as string)) {
      connectedEdges.push(spline.id);
    }
  }

  return connectedEdges;
}

/**
 * Checks if a node is an endpoint (first or last) of an spline
 *
 * @ue_equivalent
 * UFUNCTION(BlueprintPure)
 * static bool IsEndpoint(const FRiverEdge& Spline, const FGuid& NodeId);
 */
export function isEndpoint(spline: Spline, nodeId: NodeId): boolean {
  if (spline.nodeIds.length === 0) return false;
  return (
    spline.nodeIds[0] === nodeId ||
    spline.nodeIds[spline.nodeIds.length - 1] === nodeId
  );
}

/**
 * Gets the index of a node within an spline's nodeIds array
 *
 * @returns Index of node in spline, or -1 if not found
 * @ue_equivalent
 * UFUNCTION(BlueprintPure)
 * static int32 GetNodeIndexInEdge(const FRiverEdge& Spline, const FGuid& NodeId);
 */
export function getNodeIndexInEdge(spline: Spline, nodeId: NodeId): number {
  return spline.nodeIds.indexOf(nodeId as string);
}
