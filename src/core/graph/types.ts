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
 * Edge kind - distinguishes independent rivers from tributaries
 * 'river' = independent watercourse (may be main via mainEdgeId or separate)
 * 'tributary' = child watercourse attached to parent river
 *
 * @ue_equivalent UENUM() in C++
 */
export type EdgeKind = 'river' | 'tributary';

/**
 * Width specification - either absolute pixels or relative to parent
 *
 * @ue_equivalent
 * USTRUCT(BlueprintType)
 * struct FRiverWidth {
 *   UPROPERTY() ERiverWidthKind Kind; // enum: Px, Relative
 *   UPROPERTY() float Value;
 * };
 */
export interface Width {
  /** 'px' = absolute pixels, 'relative' = percentage of parent width */
  kind: 'px' | 'relative';
  /** Width value (pixels if 'px', 0-100 if 'relative') */
  value: number;
}

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
 * Graph edge representing a river segment (independent river or tributary)
 *
 * An edge is defined by an ordered list of nodes it passes through.
 * The order of nodeIds defines downstream flow: nodeIds[0] = source, nodeIds[last] = mouth.
 *
 * Invariants:
 * - V1: nodeIds order is always downstream (source → mouth)
 * - V2: kind === 'tributary' ⇔ parentId !== null && parentJunction !== null
 * - V3: children.length > 0 ⇒ parentId === null (rivers with tributaries cannot be tributaries)
 * - V4: parentId === null ⇒ parentJunction === null
 * - V5: parentJunction ∈ parent.nodeIds[1..last] (cannot attach to source, can attach to mouth)
 * - V6: parentId is unique (one parent only)
 * - V7: width constraints enforced on attach/detach
 *
 * @ue_equivalent
 * USTRUCT(BlueprintType)
 * struct FRiverEdge {
 *   UPROPERTY() FGuid Id;
 *   UPROPERTY() ERiverEdgeKind Kind;
 *   UPROPERTY() TArray<FGuid> NodeIds;
 *   UPROPERTY() FGuid ParentId;           // null for independent rivers
 *   UPROPERTY() FGuid ParentJunction;     // NodeId where tributary joins parent
 *   UPROPERTY() FRiverWidth Width;
 *   UPROPERTY() TArray<FGuid> Children;   // EdgeIds of attached tributaries
 * };
 */
export interface Edge {
  /** Unique edge identifier */
  id: EdgeId;

  /** Edge type: 'river' for independent, 'tributary' for attached child */
  kind: EdgeKind;

  /**
   * Ordered list of node IDs defining the edge path (downstream direction)
   * nodeIds[0] = source (upstream), nodeIds[last] = mouth (downstream)
   * Stored as strings for easier serialization and Record key matching
   */
  nodeIds: string[];

  /**
   * Parent river EdgeId (null for independent rivers)
   * When attached as tributary, this points to the parent river edge
   */
  parentId: EdgeId | null;

  /**
   * NodeId where this tributary joins the parent river (null if not attached)
   * Must be in parent.nodeIds[1..last] (can attach to mouth, not to source)
   */
  parentJunction: NodeId | null;

  /** Width specification (absolute px or relative to parent) */
  width: Width;

  /**
   * EdgeIds of tributaries attached to this river (empty array for tributaries)
   * Invariant: children.length > 0 ⇒ parentId === null
   */
  children: EdgeId[];
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
 * Type guard to check if width is in pixels
 */
export function isWidthPx(width: Width): boolean {
  return width.kind === 'px';
}

/**
 * Type guard to check if width is relative
 */
export function isWidthRelative(width: Width): boolean {
  return width.kind === 'relative';
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
 * Helper to create absolute width in pixels
 */
export function makeWidthPx(value: number): Width {
  return { kind: 'px', value };
}

/**
 * Helper to create relative width (percentage 0-100)
 */
export function makeWidthRelative(value: number): Width {
  return { kind: 'relative', value };
}
