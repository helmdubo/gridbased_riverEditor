/**
 * Core Node-Spline graph types for river system
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
 * Unique identifier for a spline (entire river polyline)
 * @ue_equivalent FGuid or FName in UE5
 */
export type SplineId = string & { readonly __brand: 'SplineId' };

/**
 * Spline kind - distinguishes independent rivers from tributaries
 * 'river' = independent watercourse (may be main via mainSplineId or separate)
 * 'tributary' = child watercourse attached to parent river
 *
 * @ue_equivalent UENUM() in C++
 */
export type SplineKind = 'river' | 'tributary';

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
 * River node role within the topological graph
 *
 * - `source`: upstream endpoint of a spline
 * - `mouth`: downstream endpoint of a spline
 * - `junction`: shared node between two or more splines
 * - `inner`: interior control point on a spline (default)
 *
 * @ue_equivalent
 * UENUM(BlueprintType)
 * enum class ERiverNodeKind : uint8 {
 *   Source,
 *   Mouth,
 *   Junction,
 *   Inner
 * };
 */
export type NodeKind = 'source' | 'mouth' | 'junction' | 'inner';

/**
 * Graph node representing a point in 2D space and its topological role
 *
 * @ue_equivalent
 * USTRUCT(BlueprintType)
 * struct FRiverNode {
 *   UPROPERTY() FGuid Id;
 *   UPROPERTY() FVector2D Position; // x, y
 *   UPROPERTY() ERiverNodeKind Kind;
 * };
 */
export interface Node {
  id: NodeId;
  x: number;
  y: number;
  kind: NodeKind;
}

/**
 * Graph spline representing a river (independent river or tributary)
 *
 * A spline is defined by an ordered list of nodes it passes through.
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
 * struct FRiverSpline {
 *   UPROPERTY() FGuid Id;
 *   UPROPERTY() ERiverSplineKind Kind;
 *   UPROPERTY() TArray<FGuid> NodeIds;
 *   UPROPERTY() FGuid ParentId;           // null for independent rivers
 *   UPROPERTY() FGuid ParentJunction;     // NodeId where tributary joins parent
 *   UPROPERTY() FRiverWidth Width;
 *   UPROPERTY() TArray<FGuid> Children;   // SplineIds of attached tributaries
 * };
 */
export interface Spline {
  /** Unique spline identifier */
  id: SplineId;

  /** Spline type: 'river' for independent, 'tributary' for attached child */
  kind: SplineKind;

  /**
   * Ordered list of node IDs defining the spline path (downstream direction)
   * nodeIds[0] = source (upstream), nodeIds[last] = mouth (downstream)
   * Stored as strings for easier serialization and Record key matching
   */
  nodeIds: string[];

  /**
   * Parent river SplineId (null for independent rivers)
   * When attached as tributary, this points to the parent river spline
   */
  parentId: SplineId | null;

  /**
   * NodeId where this tributary joins the parent river (null if not attached)
   * Must be in parent.nodeIds[1..last] (can attach to mouth, not to source)
   */
  parentJunction: NodeId | null;

  /** Width specification (absolute px or relative to parent) */
  width: Width;

  /**
   * SplineIds of tributaries attached to this river (empty array for tributaries)
   * Invariant: children.length > 0 ⇒ parentId === null
   */
  children: SplineId[];
}

/**
 * Complete river graph representation (Node-Spline model)
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
 *   UPROPERTY() TMap<FGuid, FRiverSpline> Splines;
 *   UPROPERTY() FGuid MainSplineId;
 * };
 */
export interface RiverGraphV2 {
  /** All nodes in the graph, indexed by ID */
  nodes: Record<string, Node>;

  /** All splines in the graph, indexed by ID */
  splines: Record<string, Spline>;

  /** ID of the main river spline (null if no main river exists yet) */
  mainSplineId: SplineId | null;
}

/**
 * Type guard to check if a value is a valid NodeId
 */
export function isNodeId(value: unknown): value is NodeId {
  return typeof value === 'string' && value.length > 0;
}

/**
 * Type guard to check if a value is a valid SplineId
 */
export function isSplineId(value: unknown): value is SplineId {
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
 * Helper to create a SplineId from a string (with type safety)
 * @ue_equivalent FGuid::NewGuid() in UE5
 */
export function makeSplineId(id: string): SplineId {
  return id as SplineId;
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
