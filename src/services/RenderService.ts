/**
 * Service for rendering river system to canvas
 */

import type {
  RiverGraph,
  CurveData,
  Point,
  SplineSnapInfo,
  SegmentInfo,
  InsertPointPreview,
} from '@domain/models/types';
import type { FlowField } from './FlowService';
import { getCurvePoints } from '@domain/utils/curves';
import { isJunctionPoint } from '@domain/utils/riverValidation';
import { MARCHING_SQUARES_CASES, COLORS } from '@domain/constants';
import { distanceToCurve } from '@domain/utils';

export interface RenderOptions {
  showFlowMap: boolean;
  showFlowArrows: boolean;
  showDebugZones: boolean;
  arrowSpacing: number;
  flowStrength: number;
  activeSplineId: string;
  snapTargetPointId: string | null;
  splineSnapInfo: SplineSnapInfo | null;
  hoveredSegment: SegmentInfo | null;
  insertPointPreview: InsertPointPreview | null;
  mainRiverbedWidth: number;
}

export class RenderService {
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
   * Build curve data for all rivers
   */
  static buildCurveData(
    riverGraph: RiverGraph,
    mainRiverbedWidth: number
  ): CurveData[] {
    const allCurves: CurveData[] = [];

    const mainCurve = getCurvePoints(riverGraph.mainRiver);
    if (mainCurve.length > 0) {
      allCurves.push({
        curve: mainCurve,
        width: mainRiverbedWidth,
        id: 'main',
        isMain: true,
      });
    }

    riverGraph.tributaries.forEach((trib, id) => {
      const tribWidth = (trib.widthPercent / 100) * mainRiverbedWidth;
      const tribCurve = getCurvePoints(trib.points);
      if (tribCurve.length > 0) {
        allCurves.push({
          curve: tribCurve,
          width: tribWidth,
          id,
          isMain: false,
        });
      }
    });

    return allCurves;
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
    options: RenderOptions
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
    options: RenderOptions
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
   * Render contours with marching squares
   */
  private static renderContours(
    ctx: CanvasRenderingContext2D,
    cols: number,
    rows: number,
    gridSize: number,
    allCurves: CurveData[]
  ): void {
    for (let row = 0; row < rows; row++) {
      for (let col = 0; col < cols; col++) {
        const x = col * gridSize;
        const y = row * gridSize;

        // Draw grid lines
        ctx.strokeStyle = COLORS.GRID_LINE;
        ctx.lineWidth = 1;
        ctx.strokeRect(x, y, gridSize, gridSize);

        if (allCurves.length === 0) continue;

        // Draw contours
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
   * Render splines (rivers)
   */
  static renderSplines(
    ctx: CanvasRenderingContext2D,
    riverGraph: RiverGraph,
    mainRiverbedWidth: number,
    options: RenderOptions
  ): void {
    const mainCurve = getCurvePoints(riverGraph.mainRiver);

    // Draw debug zones for junctions
    if (options.showDebugZones) {
      ctx.strokeStyle = COLORS.DEBUG_ZONE;
      ctx.lineWidth = 2;
      ctx.setLineDash([5, 5]);
      riverGraph.mainRiver.forEach((point) => {
        if (isJunctionPoint(riverGraph, point.id)) {
          ctx.beginPath();
          ctx.arc(point.x, point.y, mainRiverbedWidth, 0, Math.PI * 2);
          ctx.stroke();
        }
      });
      ctx.setLineDash([]);
    }

    // Draw segment highlight for insert point preview
    if (options.insertPointPreview && options.hoveredSegment) {
      this.renderSegmentHighlight(ctx, riverGraph, options.hoveredSegment);
    }

    // Draw spline snap highlight
    if (options.splineSnapInfo && mainCurve.length > 1) {
      this.renderSplineSnapHighlight(ctx, mainCurve, options.splineSnapInfo);
    }

    // Draw main river
    if (mainCurve.length > 1) {
      ctx.strokeStyle =
        options.activeSplineId === 'main' ? COLORS.MAIN_RIVER_ACTIVE : COLORS.MAIN_RIVER_INACTIVE;
      ctx.lineWidth = options.activeSplineId === 'main' ? 4 : 3;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.beginPath();
      ctx.moveTo(mainCurve[0].x, mainCurve[0].y);
      for (let i = 1; i < mainCurve.length; i++) {
        ctx.lineTo(mainCurve[i].x, mainCurve[i].y);
      }
      ctx.stroke();
    }

    // Draw tributaries
    riverGraph.tributaries.forEach((trib, id) => {
      const tribCurve = getCurvePoints(trib.points);
      if (tribCurve.length > 1) {
        const isActive = options.activeSplineId === id;
        const isDetached = trib.isDetached;

        ctx.strokeStyle = isDetached
          ? COLORS.TRIBUTARY_DETACHED
          : isActive
          ? COLORS.TRIBUTARY_ACTIVE
          : COLORS.TRIBUTARY_INACTIVE;
        ctx.lineWidth = isActive ? 3 : 2;
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        if (isDetached) ctx.setLineDash([5, 5]);

        ctx.beginPath();
        ctx.moveTo(tribCurve[0].x, tribCurve[0].y);
        for (let i = 1; i < tribCurve.length; i++) {
          ctx.lineTo(tribCurve[i].x, tribCurve[i].y);
        }
        ctx.stroke();
        ctx.setLineDash([]);
      }
    });
  }

  /**
   * Render segment highlight
   */
  private static renderSegmentHighlight(
    ctx: CanvasRenderingContext2D,
    riverGraph: RiverGraph,
    segment: SegmentInfo
  ): void {
    let p1: Point | undefined, p2: Point | undefined;

    if (segment.splineId === 'main') {
      p1 = riverGraph.mainRiver[segment.index];
      p2 = riverGraph.mainRiver[segment.index + 1];
    } else {
      const trib = riverGraph.tributaries.get(segment.splineId);
      if (trib) {
        p1 = trib.points[segment.index];
        p2 = trib.points[segment.index + 1];
      }
    }

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
    mainCurve: Point[],
    snapInfo: SplineSnapInfo
  ): void {
    const segStart = mainCurve[snapInfo.segmentIndex];
    const segEnd = mainCurve[Math.min(snapInfo.segmentIndex + 1, mainCurve.length - 1)];

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
}
