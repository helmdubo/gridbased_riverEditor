/**
 * River Network Invariants Validator
 *
 * This module defines and validates the invariants that must hold true
 * for a valid RiverGraphV2 structure to maintain DAG (Directed Acyclic Graph) properties.
 *
 * Key Invariants:
 * I1: parentId is either null or a valid SplineId
 * I2: The graph is acyclic (no spline can be its own ancestor)
 * I3: parentId !== null ⇒ this.id ∈ parent.children (bidirectional consistency)
 * I4: parentJunction ∈ parent.nodeIds[1..last] (not source, valid junction)
 * I5: Tree depth ≤ 2 (River → Tributary → Stream hierarchy)
 *
 * Hierarchy:
 * - Level 0 (River): parentId === null, can have children
 * - Level 1 (Tributary): parentId !== null, can have children
 * - Level 2 (Stream): parentId !== null, cannot have children (must be leaf)
 */

import type { RiverGraphV2, SplineId, Spline } from './types';
import { getTreeDepth } from './nodeKinds';

export interface ValidationError {
  type: 'INVALID_PARENT_ID' | 'CYCLE_DETECTED' | 'PARENT_CHILD_MISMATCH' | 'INVALID_JUNCTION' | 'TREE_TOO_DEEP' | 'ORPHANED_NODE' | 'INVALID_NODE_REF';
  splineId: SplineId;
  message: string;
  details?: Record<string, unknown>;
}

/**
 * Validate all invariants for the river network
 */
export function validateNetwork(graph: RiverGraphV2): ValidationError[] {
  const errors: ValidationError[] = [];

  for (const [splineId, spline] of Object.entries(graph.splines)) {
    // I1: parentId is either null or valid
    if (spline.parentId !== null && !graph.splines[spline.parentId]) {
      errors.push({
        type: 'INVALID_PARENT_ID',
        splineId: splineId as SplineId,
        message: `Spline ${splineId} has invalid parentId: ${spline.parentId}`,
        details: { parentId: spline.parentId }
      });
    }

    // I2: No cycles (this spline is not its own ancestor)
    if (spline.parentId !== null) {
      const ancestors = new Set<string>();
      let currentId: string | null = spline.parentId;

      while (currentId !== null) {
        if (currentId === splineId) {
          errors.push({
            type: 'CYCLE_DETECTED',
            splineId: splineId as SplineId,
            message: `Cycle detected: spline ${splineId} is its own ancestor`,
            details: { ancestors: Array.from(ancestors) }
          });
          break;
        }

        if (ancestors.has(currentId)) {
          // Cycle in ancestor chain (not involving this spline directly)
          break;
        }

        ancestors.add(currentId);
        const parentSpline: Spline | undefined = graph.splines[currentId] as Spline | undefined;
        currentId = parentSpline?.parentId ?? null;
      }
    }

    // I3: Bidirectional consistency (parent.children includes this.id)
    if (spline.parentId !== null) {
      const parent = graph.splines[spline.parentId] as Spline | undefined;
      if (parent && !parent.children.includes(splineId as SplineId)) {
        errors.push({
          type: 'PARENT_CHILD_MISMATCH',
          splineId: splineId as SplineId,
          message: `Spline ${splineId} has parentId ${spline.parentId}, but parent's children array doesn't include ${splineId}`,
          details: { parentId: spline.parentId, parentChildren: parent.children }
        });
      }
    }

    // I3 reverse: children entries are valid and point back to this spline
    for (const childId of spline.children) {
      const child = graph.splines[childId];
      if (!child) {
        errors.push({
          type: 'INVALID_PARENT_ID',
          splineId: splineId as SplineId,
          message: `Spline ${splineId} has invalid child reference: ${childId}`,
          details: { childId }
        });
      } else if (child.parentId !== splineId) {
        errors.push({
          type: 'PARENT_CHILD_MISMATCH',
          splineId: splineId as SplineId,
          message: `Spline ${splineId} lists ${childId} as child, but child's parentId is ${child.parentId}`,
          details: { childId, childParentId: child.parentId }
        });
      }
    }

    // I4: parentJunction must be valid and not the source node
    if (spline.parentId !== null && spline.parentJunction !== null) {
      const parent = graph.splines[spline.parentId];
      if (parent) {
        const junctionIndex = parent.nodeIds.indexOf(spline.parentJunction);

        if (junctionIndex === -1) {
          errors.push({
            type: 'INVALID_JUNCTION',
            splineId: splineId as SplineId,
            message: `Spline ${splineId} has parentJunction ${spline.parentJunction} which is not in parent's nodeIds`,
            details: { parentId: spline.parentId, parentJunction: spline.parentJunction, parentNodeIds: parent.nodeIds }
          });
        } else if (junctionIndex === 0) {
          errors.push({
            type: 'INVALID_JUNCTION',
            splineId: splineId as SplineId,
            message: `Spline ${splineId} is attached to parent's source node (index 0)`,
            details: { parentId: spline.parentId, parentJunction: spline.parentJunction }
          });
        }
      }
    }

    // I5: Tree depth ≤ 2 (River → Tributary → Stream hierarchy)
    // Only check depth from root nodes (parentId === null)
    if (spline.parentId === null && spline.children.length > 0) {
      const depth = getTreeDepth(graph, splineId as SplineId);
      if (depth > 2) {
        errors.push({
          type: 'TREE_TOO_DEEP',
          splineId: splineId as SplineId,
          message: `River ${splineId} has tree depth ${depth}, but maximum allowed is 2 (River → Tributary → Stream)`,
          details: { depth, maxAllowed: 2, children: spline.children }
        });
      }
    }

    // Validate node references
    for (const nodeId of spline.nodeIds) {
      if (!graph.nodes[nodeId]) {
        errors.push({
          type: 'INVALID_NODE_REF',
          splineId: splineId as SplineId,
          message: `Spline ${splineId} references non-existent node ${nodeId}`,
          details: { nodeId }
        });
      }
    }
  }

  // Check for orphaned nodes (nodes not referenced by any spline)
  const referencedNodes = new Set<string>();
  for (const spline of Object.values(graph.splines)) {
    for (const nodeId of (spline as Spline).nodeIds) {
      referencedNodes.add(nodeId);
    }
  }

  for (const nodeId of Object.keys(graph.nodes)) {
    if (!referencedNodes.has(nodeId)) {
      errors.push({
        type: 'ORPHANED_NODE',
        splineId: 'NONE' as SplineId,
        message: `Node ${nodeId} exists but is not referenced by any spline`,
        details: { nodeId }
      });
    }
  }

  return errors;
}

/**
 * Assert that network is valid
 * In development, logs errors to console
 */
export function assertNetworkValid(graph: RiverGraphV2, operation: string = 'unknown'): void {
  const errors = validateNetwork(graph);
  if (errors.length > 0) {
    console.error(`❌ Invariant violations after ${operation}:`, errors);
    console.error(formatValidationErrors(errors));
    // In dev mode, also trigger console.assert for better debugging
    console.assert(false, `Network validation failed after ${operation}`);
  }
}

/**
 * Get a human-readable summary of validation errors
 */
export function formatValidationErrors(errors: ValidationError[]): string {
  if (errors.length === 0) {
    return '✅ No validation errors';
  }

  const grouped = errors.reduce((acc, err) => {
    if (!acc[err.type]) {
      acc[err.type] = [];
    }
    acc[err.type].push(err);
    return acc;
  }, {} as Record<string, ValidationError[]>);

  let result = `❌ Found ${errors.length} validation error(s):\n\n`;

  for (const [type, errs] of Object.entries(grouped)) {
    result += `${type} (${errs.length}):\n`;
    for (const err of errs) {
      result += `  - ${err.message}\n`;
    }
    result += '\n';
  }

  return result;
}
