/**
 * Action types for Echo Log system
 *
 * Inspired by Maya's Echo Command - logs all graph operations
 * for debugging, replay, and UE5 Blueprint generation.
 *
 * @module core/actions/types
 */

import type { NodeId, SplineId, Width, NodeKind } from '@/core/graph/types';

/**
 * All possible action types in the river editor
 *
 * Granularity: Domain operations only, not input events.
 * Example: MOVE_NODE (after mouse up), not MOUSE_MOVE events.
 */
export type RiverActionType =
  // Node operations
  | 'ADD_NODE'
  | 'MOVE_NODE'
  | 'DELETE_NODE'
  | 'MERGE_NODES'

  // Spline operations
  | 'CREATE_SPLINE'
  | 'DELETE_SPLINE'
  | 'SPLIT_SPLINE'
  | 'REVERSE_SPLINE'
  | 'UPDATE_SPLINE_WIDTH'
  | 'SET_SPLINE_MAIN'

  // River extension
  | 'EXTEND_UPSTREAM'
  | 'EXTEND_DOWNSTREAM'
  | 'INSERT_NODE_BETWEEN'
  | 'MERGE_SPLINES'

  // Tributary operations
  | 'ATTACH_TRIBUTARY'
  | 'DETACH_TRIBUTARY'
  | 'ATTACH_AS_TRIBUTARY'

  // Graph-level
  | 'LOAD_GRAPH'
  | 'CLEAR_GRAPH'
  | 'UNDO'
  | 'REDO';

/**
 * Graph state snapshot (lightweight)
 *
 * Instead of storing full graph, store key metrics for debugging.
 * Full graph is in undo/redo stack.
 */
export interface GraphSnapshot {
  /** Number of nodes in graph */
  nodeCount: number;

  /** Number of splines in graph */
  splineCount: number;

  /** Number of root (independent) splines */
  rootCount: number;

  /** IDs of all splines (for quick diff) */
  splineIds: string[];

  /** IDs of all nodes (for quick diff) */
  nodeIds: string[];

  /** Is graph valid according to invariants V1-V8 */
  isValid: boolean;

  /** Validation error if isValid = false */
  validationError?: string;
}

/**
 * Payload for specific action types
 *
 * Design: Store enough context to reproduce and debug,
 * but not the entire graph (that's in history stack).
 */
export type ActionPayload =
  | { type: 'ADD_NODE'; nodeId: NodeId; x: number; y: number }
  | { type: 'MOVE_NODE'; nodeId: NodeId; fromX: number; fromY: number; toX: number; toY: number }
  | { type: 'DELETE_NODE'; nodeId: NodeId; wasKind: NodeKind; connectedSplines: string[] }
  | { type: 'MERGE_NODES'; draggedNodeId: NodeId; targetNodeId: NodeId; survivorNodeId: NodeId; splineId: SplineId }

  | { type: 'CREATE_SPLINE'; splineId: SplineId; kind: 'river' | 'tributary'; nodeIds: string[]; widthPx: number }
  | { type: 'DELETE_SPLINE'; splineId: SplineId; hadChildren: boolean; childrenCount: number }
  | { type: 'SPLIT_SPLINE'; splineId: SplineId; newNodeId: NodeId; atIndex: number }
  | { type: 'REVERSE_SPLINE'; splineId: SplineId; oldFlowSign: 1 | -1; newFlowSign: 1 | -1 }
  | { type: 'UPDATE_SPLINE_WIDTH'; splineId: SplineId; oldWidth: Width; newWidth: Width }
  | { type: 'SET_SPLINE_MAIN'; splineId: SplineId; isMain: boolean }

  | { type: 'EXTEND_UPSTREAM'; splineId: SplineId; newNodeId: NodeId; x: number; y: number }
  | { type: 'EXTEND_DOWNSTREAM'; splineId: SplineId; newNodeId: NodeId; x: number; y: number }
  | { type: 'INSERT_NODE_BETWEEN'; splineId: SplineId; newNodeId: NodeId; afterIndex: number; x: number; y: number }
  | { type: 'MERGE_SPLINES'; draggedSplineId: SplineId; targetSplineId: SplineId; survivorSplineId: SplineId; draggedNodeId: NodeId; targetNodeId: NodeId }

  | { type: 'ATTACH_TRIBUTARY'; childSplineId: SplineId; parentSplineId: SplineId; junctionNodeId: NodeId }
  | { type: 'DETACH_TRIBUTARY'; tribSplineId: SplineId; parentSplineId: SplineId; createdNewMouth: boolean; newNodeId?: NodeId }
  | { type: 'ATTACH_AS_TRIBUTARY'; draggedSplineId: SplineId; targetSplineId: SplineId; draggedNodeId: NodeId; targetNodeId: NodeId }

  | { type: 'LOAD_GRAPH'; source: string }
  | { type: 'CLEAR_GRAPH' }
  | { type: 'UNDO'; targetActionId: string }
  | { type: 'REDO'; targetActionId: string };

/**
 * Complete action record for Echo Log
 *
 * Each action creates one log entry with full context for debugging.
 */
export interface RiverAction {
  /** Unique action ID (for undo/redo linkage) */
  id: string;

  /** Action type */
  type: RiverActionType;

  /** Action-specific payload with context */
  payload: ActionPayload;

  /** Timestamp when action was executed */
  timestamp: number;

  /** Graph state before action (lightweight snapshot) */
  before: GraphSnapshot;

  /** Graph state after action (lightweight snapshot) */
  after: GraphSnapshot;

  /** Execution duration in milliseconds */
  duration: number;

  /** Error if action failed */
  error?: {
    message: string;
    stack?: string;
  };

  /** User-facing description (for UI) */
  description: string;
}

/**
 * Action log state
 */
export interface ActionLogState {
  /** All actions in chronological order */
  actions: RiverAction[];

  /** Maximum number of actions to keep (circular buffer) */
  maxSize: number;

  /** Filter by action types (empty = show all) */
  filterTypes: Set<RiverActionType>;

  /** Show only errors */
  showOnlyErrors: boolean;
}

/**
 * Helper to create graph snapshot from RiverGraphV2
 */
export interface SnapshotOptions {
  includeValidation?: boolean;
}
