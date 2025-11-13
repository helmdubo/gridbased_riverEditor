/**
 * Action Logger - Echo Command system for river editor
 *
 * Logs all graph operations with full context for:
 * - Debugging (see what happened before error)
 * - Replay (reproduce sequence of operations)
 * - UE5 Blueprint generation (export command sequence)
 *
 * @module core/actions/logger
 */

import type { RiverGraphV2 } from '@/core/graph/types';
import { isValidGraph } from '@/core/graph/validation';
import type {
  RiverAction,
  RiverActionType,
  ActionPayload,
  GraphSnapshot,
  SnapshotOptions,
} from './types';

/**
 * Creates lightweight graph snapshot for logging
 *
 * Does NOT store full graph - only key metrics and IDs.
 * Full graph is in undo/redo history stack.
 */
export function createSnapshot(
  graph: RiverGraphV2,
  options: SnapshotOptions = {}
): GraphSnapshot {
  const nodeIds = Object.keys(graph.nodes);
  const splineIds = Object.keys(graph.splines);

  const snapshot: GraphSnapshot = {
    nodeCount: nodeIds.length,
    splineCount: splineIds.length,
    rootCount: graph.rootSplineIds.length,
    splineIds,
    nodeIds,
    isValid: true,
  };

  // Optional: validate graph (can be slow for large graphs)
  if (options.includeValidation) {
    const validation = isValidGraph(graph);
    snapshot.isValid = validation.valid;
    if (!validation.valid) {
      snapshot.validationError = validation.error;
    }
  }

  return snapshot;
}

/**
 * Generates human-readable description for action
 *
 * Format: "Operation on target with details"
 * Example: "Attach tributary t3 to river main at node n7"
 */
export function generateDescription(payload: ActionPayload): string {
  switch (payload.type) {
    case 'ADD_NODE':
      return `Add node ${payload.nodeId} at (${payload.x.toFixed(0)}, ${payload.y.toFixed(0)})`;

    case 'MOVE_NODE':
      return `Move node ${payload.nodeId} from (${payload.fromX.toFixed(0)}, ${payload.fromY.toFixed(0)}) to (${payload.toX.toFixed(0)}, ${payload.toY.toFixed(0)})`;

    case 'DELETE_NODE':
      return `Delete ${payload.wasKind} node ${payload.nodeId} (affected ${payload.connectedSplines.length} splines)`;

    case 'MERGE_NODES':
      return `Merge nodes ${payload.draggedNodeId} → ${payload.targetNodeId} (survivor: ${payload.survivorNodeId}) in spline ${payload.splineId}`;

    case 'CREATE_SPLINE':
      return `Create ${payload.kind} ${payload.splineId} with ${payload.nodeIds.length} nodes (width: ${payload.widthPx}px)`;

    case 'DELETE_SPLINE':
      return `Delete spline ${payload.splineId}${payload.hadChildren ? ` (had ${payload.childrenCount} tributaries)` : ''}`;

    case 'SPLIT_SPLINE':
      return `Split spline ${payload.splineId} at index ${payload.atIndex} (new node: ${payload.newNodeId})`;

    case 'REVERSE_SPLINE':
      return `Reverse spline ${payload.splineId} (flowSign: ${payload.oldFlowSign} → ${payload.newFlowSign})`;

    case 'UPDATE_SPLINE_WIDTH':
      return `Update width of ${payload.splineId}: ${payload.oldWidth.kind}(${payload.oldWidth.value}) → ${payload.newWidth.kind}(${payload.newWidth.value})`;

    case 'SET_SPLINE_MAIN':
      return `Set spline ${payload.splineId} as ${payload.isMain ? 'main' : 'non-main'}`;

    case 'EXTEND_UPSTREAM':
      return `Extend spline ${payload.splineId} upstream with node ${payload.newNodeId} at (${payload.x.toFixed(0)}, ${payload.y.toFixed(0)})`;

    case 'EXTEND_DOWNSTREAM':
      return `Extend spline ${payload.splineId} downstream with node ${payload.newNodeId} at (${payload.x.toFixed(0)}, ${payload.y.toFixed(0)})`;

    case 'INSERT_NODE_BETWEEN':
      return `Insert node ${payload.newNodeId} in spline ${payload.splineId} after index ${payload.afterIndex}`;

    case 'MERGE_SPLINES':
      return `Merge splines ${payload.draggedSplineId} → ${payload.targetSplineId} (survivor: ${payload.survivorSplineId})`;

    case 'ATTACH_TRIBUTARY':
      return `Attach tributary ${payload.childSplineId} to ${payload.parentSplineId} at junction ${payload.junctionNodeId}`;

    case 'DETACH_TRIBUTARY':
      return `Detach tributary ${payload.tribSplineId} from ${payload.parentSplineId}${payload.createdNewMouth ? ` (created new mouth: ${payload.newNodeId})` : ''}`;

    case 'ATTACH_AS_TRIBUTARY':
      return `Attach spline ${payload.draggedSplineId} as tributary to ${payload.targetSplineId} (nodes: ${payload.draggedNodeId} → ${payload.targetNodeId})`;

    case 'LOAD_GRAPH':
      return `Load graph from ${payload.source}`;

    case 'CLEAR_GRAPH':
      return 'Clear entire graph';

    case 'UNDO':
      return `Undo to action ${payload.targetActionId}`;

    case 'REDO':
      return `Redo to action ${payload.targetActionId}`;

    default:
      return `Unknown action: ${(payload as ActionPayload).type}`;
  }
}

/**
 * Action Logger singleton
 *
 * Manages circular buffer of actions with filtering and export capabilities.
 */
export class ActionLogger {
  private actions: RiverAction[] = [];
  private maxSize: number = 500; // Keep last 500 actions

  /**
   * Log an action with full context
   *
   * @param type - Action type
   * @param payload - Action payload
   * @param before - Graph state before action
   * @param after - Graph state after action (or same as before if failed)
   * @param duration - Execution time in ms
   * @param error - Error if action failed
   * @returns Created action record
   */
  log(
    type: RiverActionType,
    payload: ActionPayload,
    before: GraphSnapshot,
    after: GraphSnapshot,
    duration: number,
    error?: Error
  ): RiverAction {
    const action: RiverAction = {
      id: `action_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`,
      type,
      payload,
      timestamp: Date.now(),
      before,
      after,
      duration,
      error: error
        ? {
            message: error.message,
            stack: error.stack,
          }
        : undefined,
      description: generateDescription(payload),
    };

    this.actions.push(action);

    // Circular buffer: remove oldest if exceeds max size
    if (this.actions.length > this.maxSize) {
      this.actions.shift();
    }

    // Log to console for debugging (can be disabled in production)
    if (error) {
      console.error(`[Action] ❌ ${action.description}`, error);
    } else {
      console.log(`[Action] ✓ ${action.description} (${duration.toFixed(1)}ms)`);
    }

    return action;
  }

  /**
   * Get all actions
   */
  getActions(): RiverAction[] {
    return [...this.actions];
  }

  /**
   * Get actions filtered by type
   */
  getActionsByType(types: RiverActionType[]): RiverAction[] {
    const typeSet = new Set(types);
    return this.actions.filter((action) => typeSet.has(action.type));
  }

  /**
   * Get only failed actions
   */
  getErrors(): RiverAction[] {
    return this.actions.filter((action) => action.error !== undefined);
  }

  /**
   * Get actions in time range
   */
  getActionsInRange(startTime: number, endTime: number): RiverAction[] {
    return this.actions.filter(
      (action) => action.timestamp >= startTime && action.timestamp <= endTime
    );
  }

  /**
   * Find action by ID
   */
  getActionById(id: string): RiverAction | undefined {
    return this.actions.find((action) => action.id === id);
  }

  /**
   * Clear all actions
   */
  clear(): void {
    this.actions = [];
  }

  /**
   * Set maximum buffer size
   */
  setMaxSize(size: number): void {
    this.maxSize = size;
    while (this.actions.length > this.maxSize) {
      this.actions.shift();
    }
  }

  /**
   * Export actions as JSON (for debugging or replay)
   */
  exportToJSON(): string {
    return JSON.stringify(this.actions, null, 2);
  }

  /**
   * Export actions as Maya-style command script
   */
  exportAsCommands(): string {
    return this.actions
      .map((action) => {
        const timestamp = new Date(action.timestamp).toISOString();
        const status = action.error ? 'FAILED' : 'OK';
        return `// [${timestamp}] ${status} (${action.duration.toFixed(1)}ms)\n${action.description}`;
      })
      .join('\n\n');
  }

  /**
   * Get statistics
   */
  getStats(): {
    totalActions: number;
    totalErrors: number;
    averageDuration: number;
    actionsByType: Record<string, number>;
  } {
    const actionsByType: Record<string, number> = {};
    let totalDuration = 0;
    let errorCount = 0;

    for (const action of this.actions) {
      actionsByType[action.type] = (actionsByType[action.type] || 0) + 1;
      totalDuration += action.duration;
      if (action.error) errorCount++;
    }

    return {
      totalActions: this.actions.length,
      totalErrors: errorCount,
      averageDuration: this.actions.length > 0 ? totalDuration / this.actions.length : 0,
      actionsByType,
    };
  }
}

/**
 * Global logger instance (singleton)
 */
export const actionLogger = new ActionLogger();
