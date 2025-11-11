/**
 * Hook for managing river rendering
 */

import { useCallback, useRef, useEffect } from 'react';
import type { RiverGraph, RiverType } from '@domain/models/types';
import { RenderService, FlowService } from '@services';
import type { RenderOptions } from '@services/RenderService';
import { DEFAULT_GRID_SIZE, DEFAULT_CURVE_SEGMENTS } from '@domain/constants';

interface UseRiverRendererOptions {
  cols: number;
  rows: number;
  gridSize?: number;
  mainRiverbedWidth: number;
  riverType: RiverType;
  curvWeight: number;
  curvScale: number;
  smoothSpeed: boolean;
  showFlowMap: boolean;
  showFlowArrows: boolean;
  renderOptions: Omit<RenderOptions, 'mainRiverbedWidth'>;
}

export const useRiverRenderer = (riverGraph: RiverGraph, options: UseRiverRendererOptions) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const flowFieldCache = useRef<ReturnType<typeof FlowService.calculateFlowField> | null>(null);

  const drawGrid = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const gridSize = options.gridSize || DEFAULT_GRID_SIZE;

    // Build curve data
    const allCurves = RenderService.buildCurveData(riverGraph, options.mainRiverbedWidth);

    // Calculate flow field if needed
    let flowField = null;
    if (options.showFlowMap || options.showFlowArrows) {
      if (allCurves.length > 0) {
        flowField = FlowService.calculateFlowField(
          allCurves,
          options.cols,
          options.rows,
          options.riverType,
          options.curvWeight,
          options.curvScale,
          options.smoothSpeed,
          gridSize
        );
        flowFieldCache.current = flowField;
      }
    }

    // Render grid
    RenderService.renderGrid(
      ctx,
      options.cols,
      options.rows,
      gridSize,
      allCurves,
      flowField,
      {
        ...options.renderOptions,
        mainRiverbedWidth: options.mainRiverbedWidth,
      }
    );

    // Render splines
    RenderService.renderSplines(ctx, riverGraph, options.mainRiverbedWidth, {
      ...options.renderOptions,
      mainRiverbedWidth: options.mainRiverbedWidth,
    });
  }, [riverGraph, options]);

  // Update canvas size when dimensions change
  useEffect(() => {
    const canvas = canvasRef.current;
    if (canvas) {
      const gridSize = options.gridSize || DEFAULT_GRID_SIZE;
      canvas.width = options.cols * gridSize;
      canvas.height = options.rows * gridSize;
    }
  }, [options.cols, options.rows, options.gridSize]);

  // Redraw when anything changes
  useEffect(() => {
    drawGrid();
  }, [drawGrid]);

  return {
    canvasRef,
    drawGrid,
  };
};
