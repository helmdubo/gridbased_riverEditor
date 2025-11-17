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
import { buildGraphCache, clearCache, updateCacheForNodeMove } from '@/core/geometry/cache';
import { RenderServiceV2, type RenderOptionsV2 } from '@services/RenderServiceV2';
import { FlowService } from '@services';
import type { FlowField } from '@services/FlowService';
import { SMALL_CELLS_PER_MIDDLE, SMALL_CELL_SIZE } from '@domain/constants';

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

  // OPTIMIZATION: Drag cache for incremental updates during node drag
  // This cache is used temporarily during drag operations to avoid full graph rebuilds
  const [dragCache, setDragCache] = useState<GraphCache | null>(null);

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

  // OPTIMIZATION: Update drag cache for a single node move (incremental)
  // This only rebuilds affected splines, not the entire graph
  const updateDragCache = useCallback((nodeId: string, x: number, y: number) => {
    const baseCache = dragCache ?? geometryCache;
    const updatedCache = updateCacheForNodeMove(baseCache, riverGraph, nodeId, x, y);
    setDragCache(updatedCache);
  }, [riverGraph, geometryCache, dragCache]);

  // Clear drag cache (call on drag end)
  const clearDragCache = useCallback(() => {
    setDragCache(null);
  }, []);

  // Use drag cache if available, otherwise use regular cache
  const activeCache = dragCache ?? geometryCache;

  // Build curve data for rendering (uses active cache - dragCache during drag, geometryCache otherwise)
  const curveData = useMemo(
    () => RenderServiceV2.buildCurveData(riverGraph, activeCache, mainRiverbedWidth),
    [riverGraph, activeCache, mainRiverbedWidth]
  );

  // Compute flow field (OPTIMIZATION: Using small cell grid 16px for higher precision)
  const computeFlowField = useCallback((riverType: RiverType) => {
    if (curveData.length === 0) {
      setFlowField(null);
      return null;
    }

    // OPTIMIZATION: Calculate FlowField on small cell grid (16px) instead of middle cells (48px)
    // This provides 3x3 = 9x higher resolution for flow calculations
    const smallCols = gridCols * SMALL_CELLS_PER_MIDDLE;
    const smallRows = gridRows * SMALL_CELLS_PER_MIDDLE;

    const field = FlowService.calculateFlowField(
      curveData,
      smallCols,
      smallRows,
      riverType,
      flowParams.curvWeight,
      flowParams.curvScale,
      true, // smoothSpeed
      SMALL_CELL_SIZE
    );

    setFlowField(field);
    return field;
  }, [curveData, gridCols, gridRows, flowParams]);

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

      // Render splines (V2) - uses activeCache (dragCache during drag, geometryCache otherwise)
      RenderServiceV2.renderSplines(
        ctx,
        riverGraph,
        activeCache,
        mainRiverbedWidth,
        options
      );

      console.log('✅ Render V2 complete');
    },
    [riverGraph, activeCache, curveData, flowField, gridCols, gridRows, gridSize, mainRiverbedWidth]
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
    // OPTIMIZATION: Drag cache functions for incremental updates
    updateDragCache,
    clearDragCache,
  };
};
