/**
 * Core Node-Edge graph types for river system
 *
 * This module defines the fundamental data model for the river editor.
 * All types are designed to be easily portable to UE5.6 Blueprints/C++.
 *
 * @module core/graph/types
 */

/**
 * Unique identifier for a node
 * @ue_equivalent FGuid or FName in UE5
 */
export type NodeId = string & { readonly __brand: 'NodeId' };

/**
 * Unique identifier for an edge
 * @ue_equivalent FGuid or FName in UE5
 */
export type EdgeId = string & { readonly __brand: 'EdgeId' };

/**
 * Flow direction sign
 * 1 = downstream (mouth to source)
 * -1 = upstream (source to mouth)
 *
 * @ue_equivalent int32 or enum in UE5
 */
export type FlowSign = 1 | -1;

/**
 * Edge kind - distinguishes main river from tributaries
 * @ue_equivalent UENUM() in C++
 */
export type EdgeKind = 'main' | 'tributary';

/**
 * Width mode discriminator
 * @ue_equivalent UENUM() in C++
 */
export type WidthMode = 'absolute' | 'relative';

/**
 * Absolute width in pixels
 * @ue_equivalent float in UE5 (world units)
 */
export interface WidthAbs {
  mode: 'absolute';
  value: number;
}

/**
 * Relative width as percentage of main riverbed width
 * @ue_equivalent float in UE5 (0.0 to 1.0)
 */
export interface WidthRel {
  mode: 'relative';
  percent: number;
}

/**
 * Width specification - either absolute or relative
 * @ue_equivalent Tagged union (discriminated struct in UE5)
 */
export type Width = WidthAbs | WidthRel;

/**
 * Graph node representing a point in 2D space
 *
 * @ue_equivalent
 * USTRUCT(BlueprintType)
 * struct FRiverNode {
 *   UPROPERTY() FGuid Id;
 *   UPROPERTY() FVector2D Position; // x, y
 * };
 */
export interface Node {
  id: NodeId;
  x: number;
  y: number;
}

/**
 * Graph edge representing a river segment (main river or tributary)
 *
 * An edge is defined by an ordered list of nodes it passes through.
 * The first node is the "mouth" (downstream end), the last is the "source" (upstream end).
 *
 * @ue_equivalent
 * USTRUCT(BlueprintType)
 * struct FRiverEdge {
 *   UPROPERTY() FGuid Id;
 *   UPROPERTY() ERiverEdgeKind Kind;
 *   UPROPERTY() TArray<FGuid> NodeIds;
 *   UPROPERTY() FRiverWidth Width;
 *   UPROPERTY() int32 FlowSign;
 *   UPROPERTY() FGuid ParentJunction; // NodeId where tributary joins
 *   UPROPERTY() bool bIsDetached;
 * };
 */
export interface Edge {
  /** Unique edge identifier */
  id: EdgeId;

  /** Edge type: main river or tributary */
  kind: EdgeKind;

  /**
   * Ordered list of node IDs defining the edge path
   * nodeIds[0] = mouth (downstream), nodeIds[n-1] = source (upstream)
   * Stored as strings for easier serialization and Record key matching
   */
  nodeIds: string[];

  /** Width specification */
  width: Width;

  /**
   * Flow direction multiplier
   * 1 = standard downstream flow
   * -1 = reversed flow (rare, but possible for special cases)
   */
  flowSign: FlowSign;

  /**
   * For tributaries: NodeId where this edge joins the main river
   * For main edge: null
   * Stored as string for easier serialization
   */
  parentJunction: string | null;

  /**
   * Whether this tributary is detached (not yet attached to main river)
   * Always false for main edge
   */
  isDetached: boolean;
}

/**
 * Complete river graph representation (Node-Edge model)
 *
 * This is the core data structure that replaces the old point-based model.
 * Advantages:
 * - Explicit node sharing (no duplicate coordinates)
 * - Easier topology validation
 * - Direct mapping to UE5's EdGraph architecture
 *
 * @ue_equivalent
 * USTRUCT(BlueprintType)
 * struct FRiverGraph {
 *   UPROPERTY() TMap<FGuid, FRiverNode> Nodes;
 *   UPROPERTY() TMap<FGuid, FRiverEdge> Edges;
 *   UPROPERTY() FGuid MainEdgeId;
 * };
 */
export interface RiverGraphV2 {
  /** All nodes in the graph, indexed by ID */
  nodes: Record<string, Node>;

  /** All edges in the graph, indexed by ID */
  edges: Record<string, Edge>;

  /** ID of the main river edge (null if no main river exists yet) */
  mainEdgeId: EdgeId | null;
}

/**
 * Type guard to check if a value is a valid NodeId
 */
export function isNodeId(value: unknown): value is NodeId {
  return typeof value === 'string' && value.length > 0;
}

/**
 * Type guard to check if a value is a valid EdgeId
 */
export function isEdgeId(value: unknown): value is EdgeId {
  return typeof value === 'string' && value.length > 0;
}

/**
 * Type guard to check if width is absolute
 */
export function isWidthAbs(width: Width): width is WidthAbs {
  return width.mode === 'absolute';
}

/**
 * Type guard to check if width is relative
 */
export function isWidthRel(width: Width): width is WidthRel {
  return width.mode === 'relative';
}

/**
 * Helper to create a NodeId from a string (with type safety)
 * @ue_equivalent FGuid::NewGuid() in UE5
 */
export function makeNodeId(id: string): NodeId {
  return id as NodeId;
}

/**
 * Helper to create an EdgeId from a string (with type safety)
 * @ue_equivalent FGuid::NewGuid() in UE5
 */
export function makeEdgeId(id: string): EdgeId {
  return id as EdgeId;
}

/**
 * Helper to create absolute width
 */
export function makeWidthAbs(value: number): WidthAbs {
  return { mode: 'absolute', value };
}

/**
 * Helper to create relative width
 */
export function makeWidthRel(percent: number): WidthRel {
  return { mode: 'relative', percent };
}
