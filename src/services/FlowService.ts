/**
 * Service for calculating water flow fields
 */

import type { Point, FlowDirection, CurveData, RiverType } from '@domain/models/types';
import {
  distanceToCurve,
  nearestCurveIndex,
  clamp01,
} from '@domain/utils';
import { computeCurveFrames } from '@domain/utils/curves';
import { EPS, RIVER_TYPES, DEFAULT_GRID_SIZE } from '@domain/constants';

export interface FlowField {
  dirField: FlowDirection[][];
  speedField: number[][];
  waterMask: boolean[][];
}

export class FlowService {
  /**
   * Calculate width along normal direction
   */
  private static widthAlongNormal(
    allCurves: CurveData[],
    cellCenter: Point,
    normal: Point,
    gridSize: number,
    maxWidth: number
  ): number {
    const step = gridSize * 0.1;
    const maxDist = maxWidth * 3;
    let wPos = 0;

    for (let t = 0; t < maxDist; t += step) {
      const testPoint = { x: cellCenter.x + normal.x * t, y: cellCenter.y + normal.y * t };
      let isWater = false;
      for (const { curve, width } of allCurves) {
        if (distanceToCurve(testPoint.x, testPoint.y, curve) <= width / 2) {
          isWater = true;
          break;
        }
      }
      if (!isWater) break;
      wPos = t;
    }

    let wNeg = 0;
    for (let t = 0; t < maxDist; t += step) {
      const testPoint = { x: cellCenter.x - normal.x * t, y: cellCenter.y - normal.y * t };
      let isWater = false;
      for (const { curve, width } of allCurves) {
        if (distanceToCurve(testPoint.x, testPoint.y, curve) <= width / 2) {
          isWater = true;
          break;
        }
      }
      if (!isWater) break;
      wNeg = t;
    }

    return wPos + wNeg;
  }

  /**
   * Blur speed field for smoother visualization
   */
  private static blurField(field: number[][], mask: boolean[][]): number[][] {
    const rows = field.length;
    const cols = field[0].length;
    const out: number[][] = Array.from({ length: rows }, () => Array(cols).fill(0));
    const neighbors = [
      [1, 0],
      [-1, 0],
      [0, 1],
      [0, -1],
      [1, 1],
      [1, -1],
      [-1, 1],
      [-1, -1],
    ];

    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        if (!mask[r][c]) {
          out[r][c] = 0;
          continue;
        }

        let acc = 0,
          w = 0;
        for (const [dx, dy] of neighbors) {
          const nc = c + dx,
            nr = r + dy;
          if (nc < 0 || nc >= cols || nr < 0 || nr >= rows || !mask[nr][nc]) continue;
          acc += field[nr][nc];
          w++;
        }
        out[r][c] = w > 0 ? acc / w : field[r][c];
      }
    }

    return out;
  }

  /**
   * Calculate flow field for the river system
   */
  static calculateFlowField(
    allCurves: CurveData[],
    cols: number,
    rows: number,
    riverType: RiverType,
    curvWeight: number,
    curvScale: number,
    smoothSpeed: boolean,
    gridSize: number = DEFAULT_GRID_SIZE
  ): FlowField {
    // Initialize fields
    const dirField = Array.from({ length: rows }, () =>
      Array.from({ length: cols }, () => ({ vx: 0, vy: 0 }))
    );
    const speedField = Array.from({ length: rows }, () => Array(cols).fill(0));
    const waterMask = Array.from({ length: rows }, () => Array(cols).fill(false));

    if (allCurves.length === 0) {
      return { dirField, speedField, waterMask };
    }

    // Build water mask
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const cx = c * gridSize + gridSize / 2;
        const cy = r * gridSize + gridSize / 2;
        for (const { curve, width } of allCurves) {
          if (distanceToCurve(cx, cy, curve) <= width / 2) {
            waterMask[r][c] = true;
            break;
          }
        }
      }
    }

    // Calculate average width
    let totalWidth = 0;
    let waterCellCount = 0;

    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        if (!waterMask[r][c]) continue;
        waterCellCount++;
        const cx = c * gridSize + gridSize / 2;
        const cy = r * gridSize + gridSize / 2;

        let closestCurve = allCurves[0];
        let closestDist = Infinity;
        for (const curveData of allCurves) {
          const dist = distanceToCurve(cx, cy, curveData.curve);
          if (dist < closestDist) {
            closestDist = dist;
            closestCurve = curveData;
          }
        }

        const idx = nearestCurveIndex(closestCurve.curve, cx, cy);
        const frames = computeCurveFrames(closestCurve.curve);

        // Set flow direction
        // Main river: tangent already points downstream (source to mouth), so use +1
        // Tributary: drawn from mouth to source, so invert (-1) to flow towards mouth
        const flowSign = closestCurve.isMain ? 1 : -1;
        dirField[r][c] = {
          vx: flowSign * frames.tangents[idx].vx,
          vy: flowSign * frames.tangents[idx].vy,
        };

        const normal = frames.normals[idx];
        totalWidth += this.widthAlongNormal(allCurves, { x: cx, y: cy }, normal, gridSize, closestCurve.width);
      }
    }

    const avgWidth = waterCellCount > 0 ? totalWidth / waterCellCount : 1;
    let maxSpeed = -EPS;
    let minSpeed = Infinity;
    const baseSpeedMS = RIVER_TYPES[riverType];

    // Calculate speed field
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        if (!waterMask[r][c]) continue;

        const cx = c * gridSize + gridSize / 2;
        const cy = r * gridSize + gridSize / 2;

        let closestCurve = allCurves[0];
        let closestDist = Infinity;
        for (const curveData of allCurves) {
          const dist = distanceToCurve(cx, cy, curveData.curve);
          if (dist < closestDist) {
            closestDist = dist;
            closestCurve = curveData;
          }
        }

        const idx = nearestCurveIndex(closestCurve.curve, cx, cy);
        const frames = computeCurveFrames(closestCurve.curve);
        const normal = frames.normals[idx];

        const localWidth = this.widthAlongNormal(allCurves, { x: cx, y: cy }, normal, gridSize, closestCurve.width);
        const constrictionFactor = localWidth > EPS ? avgWidth / localWidth : 1;

        const dx = cx - closestCurve.curve[idx].x;
        const dy = cy - closestCurve.curve[idx].y;
        const lateralPos = dx * normal.x + dy * normal.y;
        const halfWidth = localWidth / 2;
        const channelFactor = halfWidth > EPS ? Math.max(0, 1 - (lateralPos / halfWidth) ** 2) : 0;

        const kSigned = frames.curvature[idx];
        const kMag = Math.min(1, Math.abs(kSigned) * curvScale * gridSize);
        const side = Math.sign(lateralPos);
        const outerSign = -(Math.sign(kSigned) * side);
        const lateralFrac = halfWidth > EPS ? clamp01(Math.abs(lateralPos) / halfWidth) : 0;
        const curvFactor = 1 + curvWeight * kMag * outerSign * lateralFrac;

        const rawSpeed = baseSpeedMS * constrictionFactor * channelFactor * curvFactor;
        speedField[r][c] = rawSpeed;
        minSpeed = Math.min(minSpeed, rawSpeed);
        maxSpeed = Math.max(maxSpeed, rawSpeed);
      }
    }

    // Normalize speed field
    const speedDenom = Math.max(EPS, maxSpeed - minSpeed);
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        if (waterMask[r][c]) {
          speedField[r][c] = clamp01((speedField[r][c] - minSpeed) / speedDenom);
        }
      }
    }

    // Blur if requested
    const finalSpeed = smoothSpeed ? this.blurField(speedField, waterMask) : speedField;

    return {
      dirField,
      speedField: finalSpeed,
      waterMask,
    };
  }
}
