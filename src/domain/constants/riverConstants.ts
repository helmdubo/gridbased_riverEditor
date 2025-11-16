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

/** Grid hierarchy: Small cells (finest level) */
export const SMALL_CELL_SIZE = 16; // Size of one small cell in pixels
export const SMALL_COLS = 60; // Total small cells horizontally (20 middle × 3)
export const SMALL_ROWS = 36; // Total small cells vertically (12 middle × 3)

/** Grid hierarchy: Middle cells (3x3 small cells) */
export const MIDDLE_CELL_SIZE = 48; // Size of one middle cell in pixels (3 × 16)
export const MIDDLE_COLS = 20; // Number of middle cells horizontally
export const MIDDLE_ROWS = 12; // Number of middle cells vertically

/** Default grid size (backward compatibility) */
export const DEFAULT_GRID_SIZE = SMALL_CELL_SIZE;
export const DEFAULT_COLS = SMALL_COLS;
export const DEFAULT_ROWS = SMALL_ROWS;

/** Default number of segments for curve interpolation */
export const DEFAULT_CURVE_SEGMENTS = 50;

/** Default main riverbed width (in pixels) */
export const DEFAULT_MAIN_RIVERBED_WIDTH = 60;

/** Default tributary width (as percentage of main river) */
export const DEFAULT_TRIBUTARY_WIDTH_PERCENT = 50;

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
  GRID_LINE_SMALL: '#333', // Small cell grid lines
  GRID_LINE_MIDDLE: '#555', // Middle cell grid lines (more visible)
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
