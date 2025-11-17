/**
 * Hook for managing river rendering with geometry cache (V2)
 *
 * This hook manages:
 * - Geometry cache for splines (curves + frames + segIndexAt)
 * - Direct rendering from RiverGraphV2 (no legacy adapter)
 * - Flow field computation
 * - Canvas rendering with devicePixelRatio (P0 BUGFIX!)
 */

import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import type { RiverGraphV2 } from '@/core/graph/types';
import type { GraphCache } from '@/core/geometry/cache';
import type { RiverType } from '@domain/models/types';
import { buildGraphCache, clearCache } from '@/core/geometry/cache';
import { RenderServiceV2, type RenderOptionsV2 } from '@services/RenderServiceV2';
import { FlowService } from '@services';
import type { FlowField } from '@services/FlowService';

export const useRiverRendererV2 = (
  riverGraph: RiverGraphV2,
  mainRiverbedWidth: number,
  gridCols: number,
  gridRows: number,
  gridSize: number,
  flowParams: {
    baseSpeed: number;
    curvWeight: number;
    curvScale: number;
    flowStrength: number;
  }
) => {
  // Canvas ref
  const canvasRef = useRef<HTMLCanvasElement>(null);

  // Geometry cache state
  const [geometryCache, setGeometryCache] = useState<GraphCache>(() => clearCache());

  // Flow field state
  const [flowField, setFlowField] = useState<FlowField | null>(null);

  // P0 BUGFIX: Setup canvas with devicePixelRatio for Retina displays
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const dpr = window.devicePixelRatio || 1;
    const width = gridCols * gridSize;
    const height = gridRows * gridSize;

    // Set canvas buffer size (with DPR scaling)
    canvas.width = width * dpr;
    canvas.height = height * dpr;

    // Set CSS display size (actual pixels on screen)
    canvas.style.width = `${width}px`;
    canvas.style.height = `${height}px`;

    // Scale context to match DPR
    const ctx = canvas.getContext('2d');
    if (ctx) {
      ctx.scale(dpr, dpr);
    }
  }, [gridCols, gridRows, gridSize]);

  // Rebuild geometry cache when graph changes
  useEffect(() => {
    const newCache = buildGraphCache(riverGraph);
    setGeometryCache(newCache);
  }, [riverGraph]);

  // Build curve data for rendering (uses GraphCache directly)
  const curveData = useMemo(
    () => RenderServiceV2.buildCurveData(riverGraph, geometryCache, mainRiverbedWidth),
    [riverGraph, geometryCache, mainRiverbedWidth]
  );

  // Compute flow field
  const computeFlowField = useCallback((riverType: RiverType) => {
    if (curveData.length === 0) {
      setFlowField(null);
      return null;
    }

    const field = FlowService.calculateFlowField(
      curveData,
      gridCols,
      gridRows,
      riverType,
      flowParams.curvWeight,
      flowParams.curvScale,
      true, // smoothSpeed
      gridSize
    );

    setFlowField(field);
    return field;
  }, [curveData, gridCols, gridRows, gridSize, flowParams]);

  // Render to canvas
  const render = useCallback(
    (options: RenderOptionsV2, riverType: RiverType = 'Равнинная река') => {
      const canvas = canvasRef.current;
      if (!canvas) return;

      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      console.log('🎨 Rendering V2:', {
        nodes: Object.keys(riverGraph.nodes).length,
        splines: Object.keys(riverGraph.splines).length,
        curveData: curveData.length,
      });

      // IMPORTANT: Clear canvas before rendering
      ctx.save();
      ctx.setTransform(1, 0, 0, 1, 0, 0); // Reset transform
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.restore();

      // OPTIMIZATION: Only use existing flowField, don't auto-compute
      // User must explicitly call computeFlowField() or press "Calculate Flow" button
      const field = (options.showFlowMap || options.showFlowArrows) ? flowField : null;

      // Render grid with flow map (V2)
      RenderServiceV2.renderGrid(
        ctx,
        gridCols,
        gridRows,
        gridSize,
        curveData,
        field,
        options
      );

      // Render splines (V2)
      RenderServiceV2.renderSplines(
        ctx,
        riverGraph,
        geometryCache,
        mainRiverbedWidth,
        options
      );

      console.log('✅ Render V2 complete');
    },
    [riverGraph, geometryCache, curveData, flowField, gridCols, gridRows, gridSize, mainRiverbedWidth]
  );

  // Auto-render when data changes
  useEffect(() => {
    // Will be triggered by parent component with render options
  }, [render]);

  return {
    canvasRef,
    geometryCache,
    curveData,
    flowField,
    computeFlowField,
    render,
  };
};
