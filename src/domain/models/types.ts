/**
 * Domain Models - Core data structures for the river editor
 */

/** Basic 2D point */
export interface Point {
  x: number;
  y: number;
}

/** River point with unique identifier */
export interface RiverPoint extends Point {
  id: string;
}

/** Tributary configuration */
export interface Tributary {
  id: string;
  parentPointId: string | null;  // null if detached
  points: RiverPoint[];
  widthPercent: number;  // Percentage of main river width
  isDetached: boolean;   // Whether tributary is detached from main river
  isIndependent?: boolean; // True for независимых сплайнов без родителя
}

/** Complete river graph structure */
export interface RiverGraph {
  mainRiver: RiverPoint[];
  tributaries: Map<string, Tributary>;
}

/** Curve cache for optimized rendering */
export interface CurveCache {
  points: Point[];
  tangents: { vx: number; vy: number }[];
  normals: Point[];
  curvature: number[];
  segIndexAt: number[];  // Maps curve point index to original control point segment index
  arcLen: number[];      // Cumulative arc length at each point
}

/** Cached curve with metadata */
export interface CurveCacheEntry {
  cache: CurveCache;
  width: number;
  isMain: boolean;
}

/** Curve data for rendering */
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

/** Dragging state for tributary */
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
