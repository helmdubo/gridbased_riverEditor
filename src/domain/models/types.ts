/**
 * Domain Models - Core data structures for the river editor
 */

/** Basic 2D point */
export interface Point {
  x: number;
  y: number;
}

/**
 * @deprecated Legacy model - use RiverGraphV2 from @/core/graph/types
 */
export interface RiverPoint extends Point {
  id: string;
}

/**
 * @deprecated Legacy model - use RiverGraphV2 from @/core/graph/types
 */
export interface Tributary {
  id: string;
  parentPointId: string | null;  // null if detached
  points: RiverPoint[];
  widthPercent: number;  // Percentage relative to parent river (or fallback constant for independent)
  isDetached: boolean;   // Whether tributary is detached from main river
  isIndependent?: boolean; // True for независимых сплайнов без родителя
  resolvedWidthPx?: number; // Actual width in pixels after inheritance
  parentSplineId?: string | null; // Parent spline identifier (null for independent)
  widthKind?: 'px' | 'relative'; // Underlying width specification kind
}

/**
 * @deprecated Legacy model - use RiverGraphV2 from @/core/graph/types
 */
export interface RiverGraph {
  mainRiver: RiverPoint[];
  tributaries: Map<string, Tributary>;
}

/**
 * @deprecated Use GraphCache from @/core/geometry/cache
 */
export interface CurveCache {
  points: Point[];
  tangents: { vx: number; vy: number }[];
  normals: Point[];
  curvature: number[];
  segIndexAt: number[];  // Maps curve point index to original control point segment index
  arcLen: number[];      // Cumulative arc length at each point
}

/**
 * @deprecated Not used - legacy type
 */
export interface CurveCacheEntry {
  cache: CurveCache;
  width: number;
  isMain: boolean;
}

/**
 * @deprecated Use CurveData from @/services/RenderServiceV2
 */
export interface CurveData {
  curve: Point[];
  width: number;
  id: string;
  isMain: boolean;
}

/** Snap target information */
export interface SnapTargetInfo {
  pointId: string;
  point: Point;
}

/** Spline snap information */
export interface SplineSnapInfo {
  segmentIndex: number;
  t: number;
  point: Point;
}

/** Segment identifier */
export interface SegmentInfo {
  splineId: string;
  index: number;
}

/** Insert point preview */
export interface InsertPointPreview {
  splineId: string;
  index: number;
  point: Point;
}

/**
 * @deprecated Legacy UI state - will be removed with RiverOverlay migration
 */
export interface DraggingTributaryInfo {
  id: string;
  pointId: string;
  isMouth: boolean;
}

/** River type definitions */
export type RiverType = 'Стоячая вода' | 'Равнинная река' | 'Горная река' | 'Бурный поток';

/** Flow direction field */
export interface FlowDirection {
  vx: number;
  vy: number;
}
