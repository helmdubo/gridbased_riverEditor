/**
 * RenderServiceV2 - Direct rendering from RiverGraphV2 without legacy adapter
 *
 * This service replaces the old RenderService by working directly with:
 * - RiverGraphV2 (Node-Spline model)
 * - GraphCache (precomputed geometry)
 *
 * Key improvements:
 * - No GraphAdapter conversion (performance)
 * - Single source of truth (GraphCache)
 * - UE-Ready architecture
 *
 * @module services/RenderServiceV2
 */

import type { RiverGraphV2, Spline } from '@/core/graph/types';
import type { GraphCache } from '@/core/geometry/cache';
import type { Point } from '@/core/geometry/geometry';
import type { FlowField } from './FlowService';
import type { SplineSnapInfo, SegmentInfo, InsertPointPreview } from '@domain/models/types';
import { distanceToCurve } from '@domain/utils';
import {
  MARCHING_SQUARES_CASES,
  COLORS,
  DEFAULT_MAIN_RIVERBED_WIDTH
} from '@domain/constants';

export interface RenderOptionsV2 {
  showFlowMap: boolean;
  showFlowArrows: boolean;
  showDebugZones: boolean;
  arrowSpacing: number;
  flowStrength: number;
  activeSplineId: string | null;
  snapTargetPointId: string | null;
  splineSnapInfo: SplineSnapInfo | null;
  hoveredSegment: SegmentInfo | null;
  insertPointPreview: InsertPointPreview | null;
  mainRiverbedWidth: number;
}

/**
 * Curve data for rendering (updated to use flowSign)
 */
export interface CurveData {
  curve: Point[];
  width: number;
  id: string;
  isMain: boolean;
  flowSign: 1 | -1;  // Flow direction: 1 = downstream, -1 = reversed
}

/**
 * Resolves spline width to absolute pixels
 *
 * Handles recursive resolution for relative widths:
 * - Absolute 'px' width: returns value directly
 * - Relative width with parent: resolves parent width recursively
 * - Relative width without parent: uses DEFAULT_MAIN_RIVERBED_WIDTH
 *
 * @param graph - River graph
 * @param spline - Spline to resolve width for
 * @param visited - Set of visited spline IDs (prevents infinite recursion)
 * @returns Width in pixels
 */
function resolveSplineWidthPx(
  graph: RiverGraphV2,
  spline: Spline,
  visited: Set<string> = new Set()
): number {
  // Prevent infinite recursion
  if (visited.has(spline.id)) {
    return DEFAULT_MAIN_RIVERBED_WIDTH;
  }
  visited.add(spline.id);

  // Direct pixel width
  if (spline.attributes.width.kind === 'px') {
    return spline.attributes.width.value;
  }

  // Relative width - resolve parent
  if (spline.parentId) {
    const parent = graph.splines[spline.parentId];
    if (parent) {
      const parentWidth = resolveSplineWidthPx(graph, parent, visited);
      return (spline.attributes.width.value / 100) * parentWidth;
    }
  }

  // No parent - use default base width
  return (spline.attributes.width.value / 100) * DEFAULT_MAIN_RIVERBED_WIDTH;
}

export class RenderServiceV2 {
  /**
   * Build curve data for all splines in the graph
   *
   * Uses precomputed geometry from GraphCache instead of recalculating curves.
   *
   * @param graph - River graph (Node-Spline model)
   * @param cache - Precomputed geometry cache
   * @param mainRiverbedWidth - Width of main river in pixels
   * @returns Array of curve data for rendering
   */
  static buildCurveData(
    graph: RiverGraphV2,
    cache: GraphCache,
    mainRiverbedWidth: number
  ): CurveData[] {
    const allCurves: CurveData[] = [];

    for (const [splineId, spline] of Object.entries(graph.splines)) {
      const edgeCache = cache[splineId];
      if (!edgeCache || edgeCache.curvePoints.length === 0) {
        continue;
      }

      // Determine if this is the main river
      const isMain = spline.isMain;

      // Resolve width to pixels
      let widthPx: number;
      if (isMain) {
        // Main river uses the explicit mainRiverbedWidth parameter
        widthPx = mainRiverbedWidth;
      } else {
        // Other splines (tributaries and independent rivers) resolve their own width
        widthPx = resolveSplineWidthPx(graph, spline);
      }

      allCurves.push({
        curve: edgeCache.curvePoints,
        width: widthPx,
        id: splineId,
        isMain,
        flowSign: spline.flowSign,  // Use explicit flow direction from spline
      });
    }

    return allCurves;
  }

  /**
   * Get marching squares case for a cell
   */
  private static getMarchingSquaresCase(
    col: number,
    row: number,
    gridSize: number,
    allCurves: CurveData[]
  ): number {
    const cellX = col * gridSize;
    const cellY = row * gridSize;
    const corners = [
      { x: cellX, y: cellY },
      { x: cellX + gridSize, y: cellY },
      { x: cellX + gridSize, y: cellY + gridSize },
      { x: cellX, y: cellY + gridSize },
    ];

    let caseIndex = 0;
    corners.forEach((corner, i) => {
      let isWater = false;
      for (const { curve, width } of allCurves) {
        if (distanceToCurve(corner.x, corner.y, curve) <= width / 2) {
          isWater = true;
          break;
        }
      }
      if (!isWater) caseIndex |= 1 << i;
    });

    return caseIndex;
  }

  /**
   * Render grid with marching squares
   */
  static renderGrid(
    ctx: CanvasRenderingContext2D,
    cols: number,
    rows: number,
    gridSize: number,
    allCurves: CurveData[],
    flowField: FlowField | null,
    options: RenderOptionsV2
  ): void {
    // Clear canvas
    ctx.clearRect(0, 0, cols * gridSize, rows * gridSize);
    ctx.fillStyle = COLORS.BACKGROUND;
    ctx.fillRect(0, 0, cols * gridSize, rows * gridSize);

    // Draw cells with terrain types
    for (let row = 0; row < rows; row++) {
      for (let col = 0; col < cols; col++) {
        const x = col * gridSize;
        const y = row * gridSize;

        if (allCurves.length === 0) continue;

        const caseIndex = this.getMarchingSquaresCase(col, row, gridSize, allCurves);
        const landBits =
          ((caseIndex >> 0) & 1) + ((caseIndex >> 1) & 1) + ((caseIndex >> 2) & 1) + ((caseIndex >> 3) & 1);
        const waterBits = 4 - landBits;

        let fillColor = 'transparent';
        const isWaterCell = flowField ? flowField.waterMask[row][col] : false;

        if (waterBits > 0 && !(options.showFlowMap && isWaterCell)) {
          if (waterBits === 4) fillColor = COLORS.WATER_FULL;
          else if (landBits === 4) fillColor = COLORS.LAND_FULL;
          else fillColor = COLORS.MIXED;
        } else if (landBits === 4) {
          fillColor = COLORS.LAND_FULL;
        }

        if (fillColor !== 'transparent') {
          ctx.fillStyle = fillColor;
          ctx.fillRect(x, y, gridSize, gridSize);
        }
      }
    }

    // Draw flow map
    if (options.showFlowMap && flowField) {
      this.renderFlowMap(ctx, flowField, gridSize);
    }

    // Draw flow arrows
    if (options.showFlowArrows && flowField) {
      this.renderFlowArrows(ctx, flowField, gridSize, options);
    }

    // Draw grid lines and contours
    this.renderContours(ctx, cols, rows, gridSize, allCurves);

    // Draw flow map legend
    if (options.showFlowMap) {
      this.renderFlowMapLegend(ctx, rows, gridSize);
    }
  }

  /**
   * Render flow map colors
   */
  private static renderFlowMap(
    ctx: CanvasRenderingContext2D,
    flowField: FlowField,
    gridSize: number
  ): void {
    const { dirField, speedField, waterMask } = flowField;
    const rows = waterMask.length;
    const cols = waterMask[0].length;

    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        if (!waterMask[r][c]) continue;

        const x = c * gridSize;
        const y = r * gridSize;
        const dir = dirField[r][c];
        const sp = speedField[r][c];

        const R = Math.round((dir.vx * 0.5 + 0.5) * 255);
        const G = Math.round((dir.vy * 0.5 + 0.5) * 255);
        const B = Math.round(sp * 255);

        ctx.fillStyle = `rgb(${R},${G},${B})`;
        ctx.fillRect(x, y, gridSize, gridSize);
      }
    }
  }

  /**
   * Render flow arrows
   */
  private static renderFlowArrows(
    ctx: CanvasRenderingContext2D,
    flowField: FlowField,
    gridSize: number,
    options: RenderOptionsV2
  ): void {
    const { dirField, speedField, waterMask } = flowField;
    const rows = waterMask.length;
    const cols = waterMask[0].length;

    ctx.save();
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    for (let r = 0; r < rows; r += Math.max(1, options.arrowSpacing)) {
      for (let c = 0; c < cols; c += Math.max(1, options.arrowSpacing)) {
        if (!waterMask[r][c]) continue;

        const dir = dirField[r][c];
        const sp = speedField[r][c];
        if (sp <= 0.01) continue;

        const cx = c * gridSize + gridSize / 2;
        const cy = r * gridSize + gridSize / 2;
        const len = gridSize * 0.35 * (0.3 + 0.7 * sp * options.flowStrength);
        const vx = dir.vx * len;
        const vy = dir.vy * len;

        ctx.strokeStyle = options.showFlowMap
          ? 'rgba(255,255,255,0.7)'
          : 'rgba(255,255,255,0.9)';
        ctx.lineWidth = 1.5;

        ctx.beginPath();
        ctx.moveTo(cx - vx * 0.2, cy - vy * 0.2);
        ctx.lineTo(cx + vx, cy + vy);
        ctx.stroke();

        const angle = Math.atan2(vy, vx);
        const ah = Math.max(5, gridSize * 0.15 * (0.3 + 0.7 * sp));
        const a1 = angle + Math.PI * 0.8;
        const a2 = angle - Math.PI * 0.8;
        const ex = cx + vx;
        const ey = cy + vy;

        ctx.beginPath();
        ctx.moveTo(ex, ey);
        ctx.lineTo(ex + Math.cos(a1) * ah, ey + Math.sin(a1) * ah);
        ctx.moveTo(ex, ey);
        ctx.lineTo(ex + Math.cos(a2) * ah, ey + Math.sin(a2) * ah);
        ctx.stroke();
      }
    }

    ctx.restore();
  }

  /**
   * Render contours with marching squares and two-level grid (middle + small cells)
   */
  private static renderContours(
    ctx: CanvasRenderingContext2D,
    cols: number,
    rows: number,
    gridSize: number,
    allCurves: CurveData[]
  ): void {
    // First pass: Draw small cell grid lines (thin, subtle)
    ctx.strokeStyle = COLORS.GRID_LINE_SMALL;
    ctx.lineWidth = 1;

    for (let row = 0; row <= rows; row++) {
      const y = row * gridSize;
      // Skip every 3rd line (will be drawn as middle cell)
      if (row % 3 !== 0) {
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(cols * gridSize, y);
        ctx.stroke();
      }
    }

    for (let col = 0; col <= cols; col++) {
      const x = col * gridSize;
      // Skip every 3rd line (will be drawn as middle cell)
      if (col % 3 !== 0) {
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x, rows * gridSize);
        ctx.stroke();
      }
    }

    // Second pass: Draw middle cell grid lines (thicker, more visible)
    ctx.strokeStyle = COLORS.GRID_LINE_MIDDLE;
    ctx.lineWidth = 2;

    for (let row = 0; row <= rows; row += 3) {
      const y = row * gridSize;
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(cols * gridSize, y);
      ctx.stroke();
    }

    for (let col = 0; col <= cols; col += 3) {
      const x = col * gridSize;
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, rows * gridSize);
      ctx.stroke();
    }

    // Third pass: Draw contours with marching squares
    for (let row = 0; row < rows; row++) {
      for (let col = 0; col < cols; col++) {
        if (allCurves.length === 0) continue;

        const x = col * gridSize;
        const y = row * gridSize;
        const caseIndex = this.getMarchingSquaresCase(col, row, gridSize, allCurves);
        const contourSegments = MARCHING_SQUARES_CASES[caseIndex];

        if (contourSegments && contourSegments.length > 0) {
          ctx.strokeStyle = COLORS.CONTOUR;
          ctx.lineWidth = 2.5;
          ctx.lineCap = 'round';

          contourSegments.forEach((segment) => {
            const [start, end] = segment;
            ctx.beginPath();
            ctx.moveTo(x + start[0] * gridSize, y + start[1] * gridSize);
            ctx.lineTo(x + end[0] * gridSize, y + end[1] * gridSize);
            ctx.stroke();
          });
        }
      }
    }
  }

  /**
   * Render flow map legend
   */
  private static renderFlowMapLegend(
    ctx: CanvasRenderingContext2D,
    rows: number,
    gridSize: number
  ): void {
    const lx = 10;
    const ly = rows * gridSize - 70;

    ctx.fillStyle = 'rgba(0,0,0,0.6)';
    ctx.fillRect(lx - 6, ly - 6, 210, 62);

    ctx.fillStyle = '#fff';
    ctx.font = '12px monospace';
    ctx.fillText('Flow: R=Vx, G=Vy, B=Speed', lx, ly);

    for (let i = 0; i < 200; i++) {
      const t = i / 199;
      ctx.fillStyle = `rgb(128,128,${Math.round(t * 255)})`;
      ctx.fillRect(lx + i, ly + 10, 1, 10);
    }

    ctx.fillStyle = '#fff';
    ctx.fillText('0', lx, ly + 34);
    ctx.fillText('1', lx + 192, ly + 34);
  }

  /**
   * Check if node is a junction (has children tributaries)
   */
  private static isJunctionNode(
    graph: RiverGraphV2,
    nodeId: string
  ): boolean {
    // Find all splines that have this node as parentJunction
    for (const spline of Object.values(graph.splines)) {
      if (spline.parentJunction === nodeId) {
        return true;
      }
    }
    return false;
  }

  /**
   * Render splines (rivers and tributaries)
   */
  static renderSplines(
    ctx: CanvasRenderingContext2D,
    graph: RiverGraphV2,
    cache: GraphCache,
    mainRiverbedWidth: number,
    options: RenderOptionsV2
  ): void {
    const mainSpline = Object.values(graph.splines).find((spline) => spline.isMain) || null;
    const mainCache = mainSpline ? cache[mainSpline.id] : null;

    // Draw debug zones for junctions
    if (options.showDebugZones && mainSpline) {
      ctx.strokeStyle = COLORS.DEBUG_ZONE;
      ctx.lineWidth = 2;
      ctx.setLineDash([5, 5]);

      for (const nodeId of mainSpline.nodeIds) {
        const node = graph.nodes[nodeId];
        if (node && this.isJunctionNode(graph, nodeId)) {
          ctx.beginPath();
          ctx.arc(node.x, node.y, mainRiverbedWidth, 0, Math.PI * 2);
          ctx.stroke();
        }
      }
      ctx.setLineDash([]);
    }

    // Draw segment highlight for insert point preview
    if (options.insertPointPreview && options.hoveredSegment) {
      this.renderSegmentHighlight(ctx, graph, options.hoveredSegment);
    }

    // Draw spline snap highlight
    if (options.splineSnapInfo && mainCache && mainCache.curvePoints.length > 1) {
      this.renderSplineSnapHighlight(ctx, mainCache.curvePoints, options.splineSnapInfo);
    }

    // Draw point snap highlight
    if (options.snapTargetPointId) {
      const node = graph.nodes[options.snapTargetPointId];
      if (node) {
        this.renderPointSnapHighlight(ctx, node.x, node.y);
      }
    }

    // Draw all splines
    for (const [splineId, spline] of Object.entries(graph.splines)) {
      const edgeCache = cache[splineId];
      if (!edgeCache || edgeCache.curvePoints.length < 2) {
        continue;
      }

      const isMain = spline.isMain;
      const isActive = options.activeSplineId === splineId;
      const isIndependent = spline.isIndependent;
      const isDetached = spline.isDetached;

      // Determine stroke color
      const strokeColor = (() => {
        if (isDetached) return COLORS.TRIBUTARY_DETACHED;
        if (isMain || isIndependent) {
          return isActive ? COLORS.MAIN_RIVER_ACTIVE : COLORS.MAIN_RIVER_INACTIVE;
        }
        return isActive ? COLORS.TRIBUTARY_ACTIVE : COLORS.TRIBUTARY_INACTIVE;
      })();

      // Determine line width
      const lineWidth = (isMain || isIndependent) ? (isActive ? 4 : 3) : (isActive ? 3 : 2);

      // Draw spline
      ctx.strokeStyle = strokeColor;
      ctx.lineWidth = lineWidth;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      if (isDetached) ctx.setLineDash([5, 5]);

      ctx.beginPath();
      const curve = edgeCache.curvePoints;
      ctx.moveTo(curve[0].x, curve[0].y);
      for (let i = 1; i < curve.length; i++) {
        ctx.lineTo(curve[i].x, curve[i].y);
      }
      ctx.stroke();
      ctx.setLineDash([]);
    }
  }

  /**
   * Render segment highlight
   */
  private static renderSegmentHighlight(
    ctx: CanvasRenderingContext2D,
    graph: RiverGraphV2,
    segment: SegmentInfo
  ): void {
    const spline = graph.splines[segment.splineId];
    if (!spline || segment.index >= spline.nodeIds.length - 1) {
      return;
    }

    const nodeId1 = spline.nodeIds[segment.index];
    const nodeId2 = spline.nodeIds[segment.index + 1];
    const p1 = graph.nodes[nodeId1];
    const p2 = graph.nodes[nodeId2];

    if (p1 && p2) {
      ctx.strokeStyle = COLORS.SNAP_HIGHLIGHT;
      ctx.lineWidth = 6;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(p1.x, p1.y);
      ctx.lineTo(p2.x, p2.y);
      ctx.stroke();
    }
  }

  /**
   * Render spline snap highlight
   */
  private static renderSplineSnapHighlight(
    ctx: CanvasRenderingContext2D,
    curvePoints: Point[],
    snapInfo: SplineSnapInfo
  ): void {
    const segStart = curvePoints[snapInfo.segmentIndex];
    const segEnd = curvePoints[Math.min(snapInfo.segmentIndex + 1, curvePoints.length - 1)];

    ctx.strokeStyle = COLORS.SNAP_HIGHLIGHT;
    ctx.lineWidth = 6;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(segStart.x, segStart.y);
    ctx.lineTo(segEnd.x, segEnd.y);
    ctx.stroke();

    // Draw attachment point
    ctx.fillStyle = COLORS.SNAP_HIGHLIGHT;
    ctx.beginPath();
    ctx.arc(snapInfo.point.x, snapInfo.point.y, 8, 0, Math.PI * 2);
    ctx.fill();
  }

  /**
   * Render point snap highlight
   */
  private static renderPointSnapHighlight(
    ctx: CanvasRenderingContext2D,
    x: number,
    y: number
  ): void {
    // Draw pulsing circle around snap target node
    ctx.strokeStyle = COLORS.SNAP_HIGHLIGHT;
    ctx.fillStyle = COLORS.SNAP_HIGHLIGHT;
    ctx.lineWidth = 3;

    // Outer ring
    ctx.beginPath();
    ctx.arc(x, y, 12, 0, Math.PI * 2);
    ctx.stroke();

    // Inner dot
    ctx.beginPath();
    ctx.arc(x, y, 6, 0, Math.PI * 2);
    ctx.fill();
  }
}
