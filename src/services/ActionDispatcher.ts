/**
 * Action Dispatcher - Middleware between UI and GraphService
 *
 * Wraps all graph operations with:
 * - Timing measurement
 * - Before/after snapshots
 * - Error tracking
 * - Echo logging
 *
 * @module services/ActionDispatcher
 */

import type { RiverGraphV2, NodeId, SplineId, Width, NodeKind } from '@/core/graph/types';
import { actionLogger, createSnapshot } from '@/core/actions';
import type { ActionPayload } from '@/core/actions/types';
import GraphService from './GraphService';

/**
 * Result of dispatched action
 */
export interface DispatchResult {
  /** Updated graph (or original if failed) */
  graph: RiverGraphV2;

  /** Action ID for undo/redo linkage */
  actionId: string;

  /** Whether action succeeded */
  success: boolean;

  /** Error if failed */
  error?: Error;
}

/**
 * Action Dispatcher
 *
 * All graph mutations should go through this dispatcher for proper logging.
 */
export class ActionDispatcher {
  /**
   * Execute action with full logging and error handling
   *
   * Pattern:
   * 1. Snapshot before
   * 2. Start timer
   * 3. Execute operation
   * 4. Snapshot after
   * 5. Log action
   * 6. Return result
   */
  private static dispatch<T extends ActionPayload>(
    graph: RiverGraphV2,
    payload: T,
    executor: (graph: RiverGraphV2) => RiverGraphV2 | { graph: RiverGraphV2; [key: string]: any }
  ): DispatchResult {
    const startTime = performance.now();
    const before = createSnapshot(graph, { includeValidation: false });

    let resultGraph = graph;
    let error: Error | undefined;

    try {
      const result = executor(graph);
      resultGraph = 'graph' in result ? result.graph : result;
    } catch (err) {
      error = err instanceof Error ? err : new Error(String(err));
      // Keep original graph on error
      resultGraph = graph;
    }

    const duration = performance.now() - startTime;
    const after = createSnapshot(resultGraph, { includeValidation: true });

    const action = actionLogger.log(payload.type, payload, before, after, duration, error);

    return {
      graph: resultGraph,
      actionId: action.id,
      success: !error,
      error,
    };
  }

  // ==================== NODE OPERATIONS ====================

  static addNode(graph: RiverGraphV2, x: number, y: number): DispatchResult & { nodeId?: NodeId } {
    let capturedNodeId: NodeId | undefined;

    const result = this.dispatch(
      graph,
      { type: 'ADD_NODE', nodeId: '' as NodeId, x, y }, // nodeId will be updated
      (g) => {
        const res = GraphService.addNode(g, x, y);
        capturedNodeId = res.nodeId;
        return res;
      }
    );

    // Update payload with actual nodeId
    if (capturedNodeId) {
      const action = actionLogger.getActionById(result.actionId);
      if (action) {
        (action.payload as ActionPayload & { nodeId: NodeId }).nodeId = capturedNodeId;
      }
    }

    return { ...result, nodeId: capturedNodeId };
  }

  static moveNode(
    graph: RiverGraphV2,
    nodeId: NodeId,
    toX: number,
    toY: number
  ): DispatchResult {
    const node = graph.nodes[nodeId];
    const fromX = node?.x || 0;
    const fromY = node?.y || 0;

    return this.dispatch(
      graph,
      { type: 'MOVE_NODE', nodeId, fromX, fromY, toX, toY },
      (g) => GraphService.moveNode(g, nodeId, toX, toY)
    );
  }

  static deleteNode(graph: RiverGraphV2, nodeId: NodeId): DispatchResult {
    const node = graph.nodes[nodeId];
    const wasKind: NodeKind = node?.kind || 'inner';
    const connectedSplines = Object.values(graph.splines)
      .filter((s) => s.nodeIds.includes(nodeId as string))
      .map((s) => s.id);

    return this.dispatch(
      graph,
      { type: 'DELETE_NODE', nodeId, wasKind, connectedSplines },
      (g) => GraphService.deleteNode(g, nodeId)
    );
  }

  static mergeNodes(
    graph: RiverGraphV2,
    draggedNodeId: NodeId,
    targetNodeId: NodeId,
    survivorNodeId: NodeId
  ): DispatchResult {
    // Find spline containing these nodes
    let splineId: SplineId = '' as SplineId;
    for (const [sid, spline] of Object.entries(graph.splines)) {
      if (
        spline.nodeIds.includes(draggedNodeId as string) &&
        spline.nodeIds.includes(targetNodeId as string)
      ) {
        splineId = sid as SplineId;
        break;
      }
    }

    return this.dispatch(
      graph,
      { type: 'MERGE_NODES', draggedNodeId, targetNodeId, survivorNodeId, splineId },
      (g) => GraphService.mergeNodes(g, draggedNodeId, targetNodeId, survivorNodeId)
    );
  }

  // ==================== SPLINE OPERATIONS ====================

  static createSpline(
    graph: RiverGraphV2,
    kind: 'river' | 'tributary',
    nodeIds: NodeId[],
    width: Width
  ): DispatchResult & { splineId?: SplineId } {
    let capturedSplineId: SplineId | undefined;

    const result = this.dispatch(
      graph,
      {
        type: 'CREATE_SPLINE',
        splineId: '' as SplineId,
        kind,
        nodeIds: nodeIds as string[],
        widthPx: width.kind === 'px' ? width.value : 0,
      },
      (g) => {
        const res = GraphService.createSpline(g, kind, nodeIds, width);
        capturedSplineId = res.splineId;
        return res;
      }
    );

    if (capturedSplineId) {
      const action = actionLogger.getActionById(result.actionId);
      if (action) {
        (action.payload as ActionPayload & { splineId: SplineId }).splineId = capturedSplineId;
      }
    }

    return { ...result, splineId: capturedSplineId };
  }

  static deleteSpline(graph: RiverGraphV2, splineId: SplineId): DispatchResult {
    const spline = graph.splines[splineId];
    const hadChildren = spline?.children?.length > 0;
    const childrenCount = spline?.children?.length || 0;

    return this.dispatch(
      graph,
      { type: 'DELETE_SPLINE', splineId, hadChildren, childrenCount },
      (g) => GraphService.deleteSpline(g, splineId)
    );
  }

  static reverseSpline(graph: RiverGraphV2, splineId: SplineId): DispatchResult {
    const spline = graph.splines[splineId];
    const oldFlowSign = spline?.flowSign || 1;
    const newFlowSign = (oldFlowSign === 1 ? -1 : 1) as 1 | -1;

    return this.dispatch(
      graph,
      { type: 'REVERSE_SPLINE', splineId, oldFlowSign, newFlowSign },
      (g) => GraphService.reverseSpline(g, splineId)
    );
  }

  static updateSplineWidth(
    graph: RiverGraphV2,
    splineId: SplineId,
    newWidth: Width
  ): DispatchResult {
    const spline = graph.splines[splineId];
    const oldWidth = spline?.attributes?.width || { kind: 'px' as const, value: 0 };

    return this.dispatch(
      graph,
      { type: 'UPDATE_SPLINE_WIDTH', splineId, oldWidth, newWidth },
      (g) => GraphService.updateSplineWidth(g, splineId, newWidth)
    );
  }

  // ==================== TRIBUTARY OPERATIONS ====================

  static attachTributary(
    graph: RiverGraphV2,
    childSplineId: SplineId,
    parentSplineId: SplineId,
    junctionNodeId: NodeId
  ): DispatchResult {
    return this.dispatch(
      graph,
      { type: 'ATTACH_TRIBUTARY', childSplineId, parentSplineId, junctionNodeId },
      (g) => GraphService.attachTributary(g, childSplineId, parentSplineId, junctionNodeId)
    );
  }

  static detachTributary(
    graph: RiverGraphV2,
    tribSplineId: SplineId,
    createNewMouthNode: boolean = false
  ): DispatchResult & { newNodeId?: NodeId } {
    const spline = graph.splines[tribSplineId];
    const parentSplineId = spline?.parentId || ('' as SplineId);
    let capturedNewNodeId: NodeId | undefined;

    const result = this.dispatch(
      graph,
      {
        type: 'DETACH_TRIBUTARY',
        tribSplineId,
        parentSplineId,
        createdNewMouth: createNewMouthNode,
      },
      (g) => {
        const res = GraphService.detachTributary(g, tribSplineId, createNewMouthNode);
        capturedNewNodeId = res.nodeId;
        return res;
      }
    );

    if (capturedNewNodeId) {
      const action = actionLogger.getActionById(result.actionId);
      if (action) {
        (action.payload as any).newNodeId = capturedNewNodeId;
      }
    }

    return { ...result, newNodeId: capturedNewNodeId };
  }

  // ==================== MERGE/EXTEND OPERATIONS ====================

  static mergeSplines(
    graph: RiverGraphV2,
    draggedNodeId: NodeId,
    targetNodeId: NodeId
  ): DispatchResult {
    // Find splines
    let draggedSplineId: SplineId = '' as SplineId;
    let targetSplineId: SplineId = '' as SplineId;

    for (const [sid, spline] of Object.entries(graph.splines)) {
      if (spline.nodeIds.includes(draggedNodeId as string)) {
        draggedSplineId = sid as SplineId;
      }
      if (spline.nodeIds.includes(targetNodeId as string)) {
        targetSplineId = sid as SplineId;
      }
    }

    const survivorSplineId = targetSplineId; // Target always survives

    return this.dispatch(
      graph,
      {
        type: 'MERGE_SPLINES',
        draggedSplineId,
        targetSplineId,
        survivorSplineId,
        draggedNodeId,
        targetNodeId,
      },
      (g) => GraphService.mergeSplines(g, draggedNodeId, targetNodeId)
    );
  }

  static attachSplineAsTributary(
    graph: RiverGraphV2,
    draggedNodeId: NodeId,
    targetNodeId: NodeId
  ): DispatchResult {
    let draggedSplineId: SplineId = '' as SplineId;
    let targetSplineId: SplineId = '' as SplineId;

    for (const [sid, spline] of Object.entries(graph.splines)) {
      if (spline.nodeIds.includes(draggedNodeId as string)) {
        draggedSplineId = sid as SplineId;
      }
      if (spline.nodeIds.includes(targetNodeId as string)) {
        targetSplineId = sid as SplineId;
      }
    }

    return this.dispatch(
      graph,
      {
        type: 'ATTACH_AS_TRIBUTARY',
        draggedSplineId,
        targetSplineId,
        draggedNodeId,
        targetNodeId,
      },
      (g) => GraphService.attachSplineAsTributary(g, draggedNodeId, targetNodeId)
    );
  }

  // ==================== GRAPH-LEVEL OPERATIONS ====================

  static clearGraph(graph: RiverGraphV2): DispatchResult {
    return this.dispatch(graph, { type: 'CLEAR_GRAPH' }, () => GraphService.createEmpty());
  }
}

export default ActionDispatcher;
