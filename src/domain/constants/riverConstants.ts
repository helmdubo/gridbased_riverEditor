/**
 * Constants for river editor
 */

import type { RiverType } from '../models/types';

/** Epsilon value for floating point comparisons */
export const EPS = 1e-6;

/** Distance for point snapping (in pixels) */
export const SNAP_DISTANCE = 25;

/** Distance for spline snapping (in pixels) */
export const SPLINE_SNAP_DISTANCE = 30;

/** Default grid size (in pixels) */
export const DEFAULT_GRID_SIZE = 50;

/** Default number of segments for curve interpolation */
export const DEFAULT_CURVE_SEGMENTS = 50;

/** Default main riverbed width (in pixels) */
export const DEFAULT_MAIN_RIVERBED_WIDTH = 60;

/** Default tributary width (as percentage of main river) */
export const DEFAULT_TRIBUTARY_WIDTH_PERCENT = 50;

/** Default grid dimensions */
export const DEFAULT_COLS = 20;
export const DEFAULT_ROWS = 12;

/** River types with their base speed (m/s) */
export const RIVER_TYPES: Record<RiverType, number> = {
  'Стоячая вода': 0.1,
  'Равнинная река': 0.5,
  'Горная река': 2.0,
  'Бурный поток': 5.0,
};

/** Default river type */
export const DEFAULT_RIVER_TYPE: RiverType = 'Равнинная река';

/** Default curvature weight for flow calculation */
export const DEFAULT_CURV_WEIGHT = 0.5;

/** Default curvature scale for flow calculation */
export const DEFAULT_CURV_SCALE = 1.0;

/** Default arrow spacing for flow visualization */
export const DEFAULT_ARROW_SPACING = 1;

/** Default flow strength multiplier */
export const DEFAULT_FLOW_STRENGTH = 1.0;

/** Catmull-Rom spline tension */
export const SPLINE_TENSION = 0.5;

/** Grid and canvas colors */
export const COLORS = {
  BACKGROUND: '#1a1a1a',
  GRID_LINE: '#333',
  WATER_FULL: 'rgba(64, 164, 223, 0.25)',
  LAND_FULL: 'rgba(139, 90, 43, 0.3)',
  MIXED: 'rgba(104, 131, 62, 0.35)',
  CONTOUR: '#ffffff',
  MAIN_RIVER_ACTIVE: 'rgba(255, 100, 0, 0.8)',
  MAIN_RIVER_INACTIVE: 'rgba(255, 0, 0, 0.5)',
  TRIBUTARY_ACTIVE: 'rgba(0, 150, 255, 0.8)',
  TRIBUTARY_INACTIVE: 'rgba(0, 100, 255, 0.5)',
  TRIBUTARY_DETACHED: 'rgba(255, 165, 0, 0.7)',
  SNAP_HIGHLIGHT: 'rgba(255, 215, 0, 0.9)',
  JUNCTION_POINT: '#10b981',
  SELECTED_POINT: '#fbbf24',
  DEBUG_ZONE: 'rgba(255, 0, 0, 0.5)',
};
