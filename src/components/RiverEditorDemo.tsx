/**
 * River Editor Demo - Minimal implementation using V2 architecture
 *
 * This is a simplified version for testing the new Node-Spline architecture.
 * Uses useRiverGraphV2 and useRiverRendererV2 with all P0 bugfixes included.
 */

import React, { useEffect, useState, useRef, useCallback } from 'react';
import { useRiverGraphV2 } from '@hooks/useRiverGraphV2';
import { useRiverRendererV2 } from '@hooks/useRiverRendererV2';
import { RiverOverlay } from './RiverEditor/RiverOverlay';
import { DEFAULT_GRID_SIZE, DEFAULT_MAIN_RIVERBED_WIDTH, DEFAULT_RIVER_TYPE, SNAP_DISTANCE, SPLINE_SNAP_DISTANCE } from '@domain/constants';
import type { RiverType } from '@domain/models/types';
import GraphService from '@services/GraphService';
import type { NodeId, SplineId, Spline } from '@/core/graph/types';
import { makeNodeId } from '@/core/graph/types';
import { findTributarySnapTarget, type SnapTargetNode, type SplineSnapResult } from '@/core/graph/snapping';
import { canMergeNodes, getMergeSurvivor, canAttachAsTributary, canMergeSplines } from '@/core/graph/nodeKinds';

interface RiverEditorDemoProps {
  cols: number;
  rows: number;
}

export const RiverEditorDemo: React.FC<RiverEditorDemoProps> = ({ cols, rows }) => {
  const gridSize = DEFAULT_GRID_SIZE;
  const [riverType, setRiverType] = useState<RiverType>(DEFAULT_RIVER_TYPE);
  const [showFlowMap, setShowFlowMap] = useState(false);
  const [showFlowArrows, setShowFlowArrows] = useState(false);
  const [widthControlMode, setWidthControlMode] = useState<'px' | 'percent'>('px');
  const [widthControlValue, setWidthControlValue] = useState(DEFAULT_MAIN_RIVERBED_WIDTH);
  const [newTributaryWidthPercent, setNewTributaryWidthPercent] = useState(50);

  // Interaction state
  const [hoveredPointId, setHoveredPointId] = useState<string | null>(null);
  const [hoveredTributaryId, setHoveredTributaryId] = useState<string | null>(null);
  const [hoveredTributaryPointId, setHoveredTributaryPointId] = useState<string | null>(null);
  const [draggingPointId, setDraggingPointId] = useState<NodeId | null>(null);
  const [draggingTributaryInfo, setDraggingTributaryInfo] = useState<{ id: string; pointId: string; isMouth: boolean } | null>(null);
  const overlayRef = useRef<SVGSVGElement>(null);
  const [capturedPointerId, setCapturedPointerId] = useState<number | null>(null);
  const wasDraggingRef = useRef(false); // Track if we were dragging to prevent click after drag

  // Snapping state
  const [snapTargetNode, setSnapTargetNode] = useState<SnapTargetNode | null>(null);
  const [splineSnapInfo, setSplineSnapInfo] = useState<SplineSnapResult | null>(null);

  // P0 BUGFIX: Pointer capture for stable drag - capture ONLY when dragging starts
  useEffect(() => {
    const isDragging = draggingPointId !== null || draggingTributaryInfo !== null;
    const overlay = overlayRef.current;

    if (isDragging && overlay && capturedPointerId === null) {
      // Capture mouse pointer (ID = 1 for mouse, touch events have different IDs)
      // We'll capture in the actual pointerDown event
      console.log('🔒 Drag started - ready to capture pointer');
    } else if (!isDragging && overlay && capturedPointerId !== null) {
      // Release capture when drag ends
      try {
        if (overlay.hasPointerCapture(capturedPointerId)) {
          overlay.releasePointerCapture(capturedPointerId);
          console.log('🔓 Drag ended - pointer released');
        }
      } catch (e) {
        console.warn('Failed to release pointer capture:', e);
      }
      setCapturedPointerId(null);
    }
  }, [draggingPointId, draggingTributaryInfo, capturedPointerId]);

  // River graph state (V2)
  const {
    riverGraph,
    addPointToActiveSpline,
    selectedNodeId,
    selectNode,
    moveNode,
    deleteNode,
    beginNewSpline,
    activeSplineId,
    setActiveSpline,
    updateSplineWidth,
    activeSpline,
    mainSpline,
    mergeNodes,
    attachSplineAsTributary,
    mergeSplines,
  } = useRiverGraphV2();

  const computeWidthPx = useCallback(
    (spline: Spline | null | undefined) => {
      if (!spline) {
        return DEFAULT_MAIN_RIVERBED_WIDTH;
      }

      if (spline.width.kind === 'px') {
        return spline.width.value;
      }

      if (spline.parentId) {
        const parent = GraphService.getSpline(riverGraph, spline.parentId);
        if (parent && parent.width.kind === 'px' && parent.width.value > 0) {
          return (spline.width.value / 100) * parent.width.value;
        }
      }

      return (spline.width.value / 100) * DEFAULT_MAIN_RIVERBED_WIDTH;
    },
    [riverGraph]
  );

  const mainRiverWidthPx = Math.max(5, Math.round(computeWidthPx(mainSpline)));
  const sliderDisabled = !activeSpline;

  // Create new independent river
  const handleCreateNewRiver = () => {
    console.log('🆕 Creating new independent river');
    beginNewSpline(mainRiverWidthPx);
  };

  useEffect(() => {
    if (!activeSpline) {
      setWidthControlMode('px');
      setWidthControlValue(mainRiverWidthPx);
      return;
    }

    const isTributary = activeSpline.kind === 'tributary' || !!activeSpline.parentId;

    if (isTributary) {
      let percentValue: number | null = null;

      if (activeSpline.width.kind === 'relative') {
        percentValue = activeSpline.width.value;
      } else if (activeSpline.parentId) {
        const parent = GraphService.getSpline(riverGraph, activeSpline.parentId);
        if (parent && parent.width.kind === 'px' && parent.width.value > 0) {
          percentValue = (computeWidthPx(activeSpline) / parent.width.value) * 100;
        }
      }

      if (percentValue === null || !Number.isFinite(percentValue)) {
        percentValue = (computeWidthPx(activeSpline) / mainRiverWidthPx) * 100;
      }

      const clampedPercent = Math.min(100, Math.max(5, Math.round(percentValue)));
      setWidthControlMode('percent');
      setWidthControlValue(clampedPercent);
      setNewTributaryWidthPercent(clampedPercent);
      return;
    }

    const pxValue = Math.max(5, Math.round(computeWidthPx(activeSpline)));
    setWidthControlMode('px');
    setWidthControlValue(pxValue);
  }, [activeSpline, computeWidthPx, mainRiverWidthPx, riverGraph]);

  const handleWidthSliderChange = useCallback(
    (rawValue: number) => {
      if (!activeSpline) {
        return;
      }

      if (widthControlMode === 'px') {
        const pxValue = Math.max(5, Math.round(rawValue));
        setWidthControlValue(pxValue);
        updateSplineWidth(activeSpline.id, pxValue, true);
        return;
      }

      const percentValue = Math.min(100, Math.max(5, Math.round(rawValue)));
      setWidthControlValue(percentValue);
      setNewTributaryWidthPercent(percentValue);
      updateSplineWidth(activeSpline.id, percentValue, false);
    },
    [activeSpline, updateSplineWidth, widthControlMode]
  );

  // Get detailed info about selected node and its spline
  const getSelectedNodeInfo = () => {
    if (!selectedNodeId) return null;

    // Find which spline contains this node
    const splineWithNode = Object.values(riverGraph.splines).find((spline) =>
      spline.nodeIds.includes(selectedNodeId as string)
    );

    if (!splineWithNode) return null;

    const nodeIndex = splineWithNode.nodeIds.indexOf(selectedNodeId as string);
    const isSource = nodeIndex === 0;
    const isMouth = nodeIndex === splineWithNode.nodeIds.length - 1;
    const isJunction = GraphService.isJunctionNode(riverGraph, selectedNodeId);

    let nodeType = 'mid';
    if (isSource) nodeType = 'source';
    else if (isMouth) nodeType = 'mouth';
    if (isJunction) nodeType += '+junction';

    return {
      spline: splineWithNode,
      nodeIndex,
      nodeType,
      totalNodes: splineWithNode.nodeIds.length,
    };
  };

  // Renderer with geometry cache + P0 bugfixes
  const { canvasRef, geometryCache, render } = useRiverRendererV2(
    riverGraph,
    mainRiverWidthPx,
    cols,
    rows,
    gridSize,
    {
      baseSpeed: 1.0,
      curvWeight: 0.5,
      curvScale: 1.0,
      flowStrength: 1.0,
    }
  );

  // TEMPORARY: Convert V2 graph to legacy format for RiverOverlay
  // TODO: Update RiverOverlay to work with RiverGraphV2 directly
  const legacyGraphForOverlay = React.useMemo(() => {
    const mainRiver: Array<{ x: number; y: number; id: string }> = [];
    const tributaries = new Map<string, any>();

    const mainSplineId = riverGraph.mainSplineId;
    const mainSpline = mainSplineId ? riverGraph.splines[mainSplineId] : null;

    if (mainSpline) {
      for (const nodeId of mainSpline.nodeIds) {
        const node = riverGraph.nodes[nodeId];
        if (node) {
          mainRiver.push({ x: node.x, y: node.y, id: node.id });
        }
      }
    }

    for (const [splineId, spline] of Object.entries(riverGraph.splines)) {
      if (splineId === mainSplineId) continue;

      const points: Array<{ x: number; y: number; id: string }> = [];
      for (const nodeId of spline.nodeIds) {
        const node = riverGraph.nodes[nodeId];
        if (node) {
          points.push({ x: node.x, y: node.y, id: node.id });
        }
      }

      if (points.length > 0) {
        const isIndependent = spline.kind === 'river' && !spline.parentId;
        const isDetached = spline.kind === 'tributary' && spline.parentId === null;

        tributaries.set(splineId, {
          id: splineId,
          parentPointId: spline.parentJunction,
          points,
          widthPercent: spline.width.kind === 'relative' ? spline.width.value : 50,
          isDetached,
          isIndependent,
          resolvedWidthPx: computeWidthPx(spline),
          parentSplineId: spline.parentId,
          widthKind: spline.width.kind,
        });
      }
    }

    return { mainRiver, tributaries };
  }, [riverGraph, computeWidthPx]);

  // Render on changes
  useEffect(() => {
    // Convert V2 snap info to legacy format for RenderServiceV2
    const legacySplineSnap = splineSnapInfo ? {
      segmentIndex: splineSnapInfo.curveIndex,
      t: splineSnapInfo.t,
      point: splineSnapInfo.point,
    } : null;

    render({
      showFlowMap,
      showFlowArrows,
      showDebugZones: false,
      arrowSpacing: 1,
      flowStrength: 1.0,
      activeSplineId: activeSplineId ?? 'main',
      snapTargetPointId: snapTargetNode ? snapTargetNode.nodeId : null,
      splineSnapInfo: legacySplineSnap,
      hoveredSegment: null,
      insertPointPreview: null,
      mainRiverbedWidth: mainRiverWidthPx,
    }, riverType);
  }, [
    riverGraph,
    render,
    showFlowMap,
    showFlowArrows,
    riverType,
    mainRiverWidthPx,
    activeSplineId,
    snapTargetNode,
    splineSnapInfo,
  ]);

  const handleStageClick = useCallback((x: number, y: number) => {
    // Use snap coordinates if available
    let finalX = x;
    let finalY = y;

    if (snapTargetNode) {
      finalX = snapTargetNode.node.x;
      finalY = snapTargetNode.node.y;
      console.log('📍 Snapping to node:', snapTargetNode.nodeId);
    } else if (splineSnapInfo) {
      finalX = splineSnapInfo.point.x;
      finalY = splineSnapInfo.point.y;
      console.log('📍 Snapping to spline:', splineSnapInfo.splineId);
    }

    console.log('🖱️ Stage click:', { x: finalX, y: finalY });
    addPointToActiveSpline(finalX, finalY, newTributaryWidthPercent);
    console.log(
      '📊 Graph updated - nodes:',
      Object.keys(riverGraph.nodes).length,
      'splines:',
      Object.keys(riverGraph.splines).length
    );

    // Clear snap highlights after adding point
    setSnapTargetNode(null);
    setSplineSnapInfo(null);
  }, [addPointToActiveSpline, newTributaryWidthPercent, riverGraph, snapTargetNode, splineSnapInfo]);

  // Handle canvas click (fallback)
  const handleCanvasClick = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const rect = canvas.getBoundingClientRect();
    handleStageClick(e.clientX - rect.left, e.clientY - rect.top);
  };

  const handleOverlayBackgroundClick = useCallback((e: React.MouseEvent<SVGSVGElement>) => {
    // Don't create vertex if we just finished dragging
    if (wasDraggingRef.current) {
      console.log('🚫 Ignoring click after drag');
      return;
    }

    const rect = e.currentTarget.getBoundingClientRect();
    handleStageClick(e.clientX - rect.left, e.clientY - rect.top);
  }, [handleStageClick]);

  // Node interaction handlers
  const handlePointMouseDown = useCallback((pointId: string) => {
    console.log('🖱️ Point mouse down:', pointId);
    wasDraggingRef.current = false; // Reset flag when starting new interaction
    const nodeId = makeNodeId(pointId);
    setDraggingPointId(nodeId);
    selectNode(nodeId);
    setActiveSpline('main');
  }, [selectNode, setActiveSpline]);

  const handlePointClick = useCallback((e: React.MouseEvent, pointId: string) => {
    e.stopPropagation();
    console.log('🖱️ Point click:', pointId);
    selectNode(makeNodeId(pointId));
    setActiveSpline('main');
  }, [selectNode, setActiveSpline]);

  const handlePointDoubleClick = useCallback((e: React.MouseEvent, pointId: string) => {
    e.stopPropagation();
    console.log('🗑️ Delete node:', pointId);
    deleteNode(makeNodeId(pointId));
  }, [deleteNode]);

  // P0 BUGFIX: Use PointerEvent for better capture support
  const handleOverlayPointerMove = useCallback((e: React.PointerEvent<SVGSVGElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    // Capture pointer when drag starts
    const isDragging = draggingPointId !== null || draggingTributaryInfo !== null;
    if (isDragging && capturedPointerId === null && overlayRef.current) {
      try {
        overlayRef.current.setPointerCapture(e.pointerId);
        setCapturedPointerId(e.pointerId);
        console.log('🔒 Pointer captured:', e.pointerId);
      } catch (err) {
        console.warn('Failed to capture pointer:', err);
      }
    }

    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    // Update hover state when not dragging
    if (!isDragging) {
      let found = false;

      // Check main river points
      legacyGraphForOverlay.mainRiver.forEach((p) => {
        if (!found && Math.hypot(p.x - x, p.y - y) < 15) {
          setHoveredPointId(p.id);
          setHoveredTributaryId(null);
          setHoveredTributaryPointId(null);
          found = true;
        }
      });

      // Check tributary points
      if (!found) {
        legacyGraphForOverlay.tributaries.forEach((trib, id) => {
          trib.points.forEach((p) => {
            if (!found && Math.hypot(p.x - x, p.y - y) < 15) {
              setHoveredPointId(null);
              setHoveredTributaryId(id);
              setHoveredTributaryPointId(p.id);
              found = true;
            }
          });
        });
      }

      // Clear hover if nothing found
      if (!found) {
        setHoveredPointId(null);
        setHoveredTributaryId(null);
        setHoveredTributaryPointId(null);
      }
    }

    // Handle dragging main river point
    if (draggingPointId) {
      wasDraggingRef.current = true; // Mark that we're dragging
      const newX = Math.max(0, Math.min(cols * gridSize, x));
      const newY = Math.max(0, Math.min(rows * gridSize, y));
      moveNode(draggingPointId, newX, newY);
    }

    // Handle dragging tributary point
    if (draggingTributaryInfo) {
      wasDraggingRef.current = true; // Mark that we're dragging
      const newX = Math.max(0, Math.min(cols * gridSize, x));
      const newY = Math.max(0, Math.min(rows * gridSize, y));
      moveNode(makeNodeId(draggingTributaryInfo.pointId), newX, newY);
    }

    // Check for snapping ONLY when dragging (to show target highlights)
    if (isDragging) {
      let snapFound = false;

      // Priority 1: Check for same-spline node merge (if dragging a point)
      const actualDraggedId = draggingPointId || (draggingTributaryInfo ? makeNodeId(draggingTributaryInfo.pointId) : null);

      if (actualDraggedId) {
        // Find which spline contains the dragged node
        const draggedSplineEntry = Object.entries(riverGraph.splines).find(([, spline]) =>
          spline.nodeIds.includes(actualDraggedId as string)
        );

        if (draggedSplineEntry) {
          const [draggedSplineId, draggedSpline] = draggedSplineEntry;

          // Look for other nodes in the same spline within snap distance
          for (const nodeIdStr of draggedSpline.nodeIds) {
            const nodeId = makeNodeId(nodeIdStr);
            if (nodeId === actualDraggedId) continue; // Skip self

            const node = riverGraph.nodes[nodeIdStr];
            if (!node) continue;

            const dist = Math.hypot(node.x - x, node.y - y);
            if (dist < SNAP_DISTANCE) {
              // Check if merge is allowed
              if (canMergeNodes(riverGraph, actualDraggedId, nodeId)) {
                setSnapTargetNode({
                  nodeId,
                  node,
                  distance: dist,
                });
                setSplineSnapInfo(null);
                snapFound = true;
                break;
              }
            }
          }
        }

        // Priority 2: Check for spline merge (end-to-end connection) across different splines
        if (!snapFound && actualDraggedId) {
          for (const [splineId, spline] of Object.entries(riverGraph.splines)) {
            for (const nodeIdStr of spline.nodeIds) {
              const nodeId = makeNodeId(nodeIdStr);
              if (nodeId === actualDraggedId) continue; // Skip self

              const node = riverGraph.nodes[nodeIdStr];
              if (!node) continue;

              const dist = Math.hypot(node.x - x, node.y - y);
              if (dist < SNAP_DISTANCE) {
                // Check if spline merge is allowed (end-to-end connection)
                if (canMergeSplines(riverGraph, actualDraggedId, nodeId)) {
                  setSnapTargetNode({
                    nodeId,
                    node,
                    distance: dist,
                  });
                  setSplineSnapInfo(null);
                  snapFound = true;
                  break;
                }
                // Check if tributary attachment is allowed
                else if (canAttachAsTributary(riverGraph, actualDraggedId, nodeId)) {
                  setSnapTargetNode({
                    nodeId,
                    node,
                    distance: dist,
                  });
                  setSplineSnapInfo(null);
                  snapFound = true;
                  break;
                }
              }
            }
            if (snapFound) break;
          }
        }
      }

      // Priority 3: Check for spline snap (create junction on spline segment) (if no node target found)
      if (!snapFound) {
        const snapTarget = findTributarySnapTarget(
          riverGraph,
          geometryCache,
          x,
          y,
          SNAP_DISTANCE,
          SPLINE_SNAP_DISTANCE,
          mainRiverWidthPx
        );

        if (snapTarget) {
          if (snapTarget.type === 'node') {
            setSnapTargetNode(snapTarget.data);
            setSplineSnapInfo(null);
          } else {
            setSnapTargetNode(null);
            setSplineSnapInfo(snapTarget.data);
          }
          snapFound = true;
        }
      }

      // Clear if no snap target found
      if (!snapFound) {
        setSnapTargetNode(null);
        setSplineSnapInfo(null);
      }
    } else {
      // Clear snap highlights when not dragging
      setSnapTargetNode(null);
      setSplineSnapInfo(null);
    }
  }, [draggingPointId, draggingTributaryInfo, moveNode, legacyGraphForOverlay, cols, rows, gridSize, capturedPointerId, riverGraph, geometryCache, mainRiverWidthPx]);

  const handleOverlayPointerUp = useCallback((e: React.PointerEvent<SVGSVGElement>) => {
    if (draggingPointId || draggingTributaryInfo) {
      console.log('✅ Drag complete');

      // Check if we should perform an operation
      const actualDraggedId = draggingPointId || (draggingTributaryInfo ? makeNodeId(draggingTributaryInfo.pointId) : null);

      if (actualDraggedId && snapTargetNode) {
        const targetNodeId = snapTargetNode.nodeId;

        // Priority 1: Check for same-spline node merge
        if (canMergeNodes(riverGraph, actualDraggedId, targetNodeId)) {
          console.log('🔄 Merging nodes (same spline):', { draggedId: actualDraggedId, targetId: targetNodeId });

          // Determine survivor
          const survivorId = getMergeSurvivor(riverGraph, actualDraggedId, targetNodeId);
          console.log('✅ Survivor:', survivorId);

          // Perform merge
          mergeNodes(actualDraggedId, targetNodeId, survivorId);
        }
        // Priority 2: Check for spline merge (end-to-end connection for river extension)
        else if (canMergeSplines(riverGraph, actualDraggedId, targetNodeId)) {
          console.log('🔗 Merging splines (river extension):', { draggedId: actualDraggedId, targetId: targetNodeId });

          // Perform spline merge
          mergeSplines(actualDraggedId, targetNodeId);
        }
        // Priority 3: Check for tributary attachment
        else if (canAttachAsTributary(riverGraph, actualDraggedId, targetNodeId)) {
          console.log('🌿 Attaching spline as tributary:', { draggedId: actualDraggedId, targetId: targetNodeId });

          // Perform tributary attachment
          attachSplineAsTributary(actualDraggedId, targetNodeId);
        }
        else {
          console.log('🚫 Cannot perform any operation on these nodes');
        }
      }

      // Clear snap highlights
      setSnapTargetNode(null);
      setSplineSnapInfo(null);

      setDraggingPointId(null);
      setDraggingTributaryInfo(null);

      // Reset wasDragging flag after a short delay to prevent onClick from firing
      setTimeout(() => {
        wasDraggingRef.current = false;
      }, 50);
    }
  }, [draggingPointId, draggingTributaryInfo, snapTargetNode, riverGraph, mergeNodes, mergeSplines, attachSplineAsTributary]);

  const handleOverlayMouseLeave = useCallback(() => {
    if (draggingPointId || draggingTributaryInfo) {
      console.log('⚠️ Drag cancelled (mouse left canvas)');

      // Clear snap highlights
      setSnapTargetNode(null);
      setSplineSnapInfo(null);

      setDraggingPointId(null);
      setDraggingTributaryInfo(null);

      // Reset wasDragging flag
      setTimeout(() => {
        wasDraggingRef.current = false;
      }, 50);
    }
  }, [draggingPointId, draggingTributaryInfo]);

  // Tributary interaction
  const handleTributaryPointMouseDown = useCallback((id: string, pointId: string, isMouth: boolean) => {
    console.log('🖱️ Tributary point mouse down:', { id, pointId, isMouth });
    wasDraggingRef.current = false; // Reset flag when starting new interaction
    setDraggingTributaryInfo({ id, pointId, isMouth });
    selectNode(makeNodeId(pointId));
    setActiveSpline(id as SplineId);
  }, [selectNode, setActiveSpline]);

  const handleTributaryPointClick = useCallback((e: React.MouseEvent, id: string, pointId: string) => {
    e.stopPropagation();
    console.log('🖱️ Tributary point click:', { id, pointId });
    selectNode(makeNodeId(pointId));
    setActiveSpline(id as SplineId);
  }, [selectNode, setActiveSpline]);

  const handleTributaryPointDoubleClick = useCallback((e: React.MouseEvent, id: string, pointId: string) => {
    e.stopPropagation();
    console.log('🗑️ Delete tributary node:', { id, pointId });
    deleteNode(makeNodeId(pointId));
  }, [deleteNode]);

  return (
    <div style={{
      padding: '20px',
      display: 'flex',
      flexDirection: 'column',
      gap: '20px',
      backgroundColor: '#1a1a1a',
      minHeight: '100vh',
      color: '#fff',
    }}>
      {/* Header */}
      <div>
        <h1 style={{ margin: 0, fontSize: '24px' }}>
          River Editor V2 Demo - Node-Spline Architecture
        </h1>
        <p style={{ margin: '8px 0 0 0', color: '#888' }}>
          ✅ P0 Bugfixes: devicePixelRatio (DPR) | FlowSign | segIndexAt | Pointer Capture (coming)
        </p>
      </div>

      {/* Controls */}
      <div style={{
        display: 'flex',
        flexWrap: 'wrap',
        gap: '20px',
        padding: '15px',
        backgroundColor: '#2a2a2a',
        borderRadius: '8px',
      }}>
        <label style={{ flex: '0 0 auto' }}>
          Active Width: {widthControlValue}
          {widthControlMode === 'px' ? 'px' : '%'}
          <input
            type="range"
            min={widthControlMode === 'px' ? 20 : 5}
            max={widthControlMode === 'px' ? 180 : 100}
            step={1}
            value={widthControlValue}
            onChange={(e) => handleWidthSliderChange(Number(e.target.value))}
            disabled={sliderDisabled}
            style={{ display: 'block', width: '220px', opacity: sliderDisabled ? 0.5 : 1 }}
          />
          {!activeSpline && (
            <span style={{ display: 'block', marginTop: '4px', color: '#888', fontSize: '11px' }}>
              Select a river or tributary node to adjust its width
            </span>
          )}
        </label>

        <label>
          River Type:
          <select
            value={riverType}
            onChange={(e) => setRiverType(e.target.value as RiverType)}
            style={{
              display: 'block',
              padding: '5px',
              marginTop: '5px',
              backgroundColor: '#333',
              color: '#fff',
              border: '1px solid #555',
            }}
          >
            <option value="Стоячая вода">Стоячая вода</option>
            <option value="Равнинная река">Равнинная река</option>
            <option value="Горная река">Горная река</option>
            <option value="Бурный поток">Бурный поток</option>
          </select>
        </label>

        <label style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <input
            type="checkbox"
            checked={showFlowMap}
            onChange={(e) => setShowFlowMap(e.target.checked)}
          />
          Show Flow Map
        </label>

        <label style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <input
            type="checkbox"
            checked={showFlowArrows}
            onChange={(e) => setShowFlowArrows(e.target.checked)}
          />
          Show Flow Arrows
        </label>
      </div>

      {/* Info & Debugger */}
      <div style={{
        padding: '15px',
        backgroundColor: '#2a2a2a',
        borderRadius: '8px',
        fontSize: '13px',
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <div style={{ flex: 1 }}>
            <strong>Instructions:</strong>
            <ul style={{ margin: '5px 0 0 0', paddingLeft: '20px', fontSize: '12px' }}>
              <li>Click on canvas to add/extend nodes</li>
              <li>Drag nodes to reposition them</li>
              <li><strong>Double-click</strong> on node to delete it</li>
              <li>Select <strong>source/mouth</strong> node then click to <strong>extend</strong></li>
              <li>Select mid-node to <strong>insert</strong> or create <strong>tributary</strong></li>
            </ul>
          </div>

          <button
            onClick={handleCreateNewRiver}
            style={{
              padding: '8px 16px',
              backgroundColor: '#059669',
              color: 'white',
              border: 'none',
              borderRadius: '4px',
              cursor: 'pointer',
              fontSize: '13px',
              fontWeight: 'bold',
            }}
          >
            🆕 New River
          </button>
        </div>

        <div style={{
          marginTop: '15px',
          padding: '12px',
          backgroundColor: '#1a1a1a',
          borderRadius: '4px',
          fontFamily: 'monospace',
          fontSize: '12px',
          lineHeight: '1.6',
          minHeight: '240px',
          maxHeight: '260px',
          overflowY: 'auto',
        }}>
          <strong style={{ color: '#10b981' }}>Graph State:</strong>
          <div style={{ marginLeft: '10px', marginTop: '5px' }}>
            <div>Total Nodes: <span style={{ color: '#fbbf24' }}>{Object.keys(riverGraph.nodes).length}</span></div>
            <div>Total Splines: <span style={{ color: '#fbbf24' }}>{Object.keys(riverGraph.splines).length}</span></div>
            <div>Main River: <span style={{ color: '#fbbf24' }}>{riverGraph.mainSplineId ? 'Yes' : 'No'}</span></div>
          </div>

          {(() => {
            const info = getSelectedNodeInfo();
            if (!info) {
              return (
                <div style={{ marginTop: '10px', color: '#888' }}>
                  No node selected
                </div>
              );
            }

            const spline = info.spline;
            const isMainRiver = riverGraph.mainSplineId === spline.id;

            return (
              <div style={{ marginTop: '10px' }}>
                <strong style={{ color: '#3b82f6' }}>Selected Node:</strong>
                <div style={{ marginLeft: '10px', marginTop: '5px' }}>
                  <div>ID: <span style={{ color: '#a855f7' }}>{selectedNodeId?.slice(0, 8)}...</span></div>
                  <div>Type: <span style={{ color: '#ef4444' }}>{info.nodeType}</span></div>
                  <div>Position: <span style={{ color: '#fbbf24' }}>{info.nodeIndex + 1}/{info.totalNodes}</span></div>
                </div>

                <div style={{ marginTop: '8px' }}>
                  <strong style={{ color: '#3b82f6' }}>Spline (River):</strong>
                  <div style={{ marginLeft: '10px', marginTop: '5px' }}>
                    <div>ID: <span style={{ color: '#a855f7' }}>{spline.id.slice(0, 8)}...</span></div>
                    <div>Kind: <span style={{ color: '#10b981' }}>{spline.kind}</span> {isMainRiver && '(main)'}</div>
                    <div>Nodes: <span style={{ color: '#fbbf24' }}>{spline.nodeIds.length}</span></div>
                    <div>Width: <span style={{ color: '#fbbf24' }}>{spline.width.kind === 'px' ? `${spline.width.value}px` : `${spline.width.value}%`}</span></div>
                    {spline.parentId && (
                      <>
                        <div>Parent: <span style={{ color: '#a855f7' }}>{spline.parentId.slice(0, 8)}...</span></div>
                        <div>Junction: <span style={{ color: '#a855f7' }}>{spline.parentJunction?.slice(0, 8)}...</span></div>
                      </>
                    )}
                    {spline.children.length > 0 && (
                      <div>Children: <span style={{ color: '#10b981' }}>{spline.children.length} tributary(ies)</span></div>
                    )}
                  </div>
                </div>

                {spline.children.length > 0 && (
                  <div style={{ marginTop: '8px' }}>
                    <strong style={{ color: '#10b981' }}>Tributaries:</strong>
                    {spline.children.map((childId, idx) => {
                      const childSpline = riverGraph.splines[childId];
                      if (!childSpline) return null;
                      return (
                        <div key={childId} style={{ marginLeft: '10px', marginTop: '3px', color: '#888' }}>
                          {idx + 1}. {childId.slice(0, 8)}... ({childSpline.nodeIds.length} nodes)
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })()}
        </div>
      </div>

      {/* Canvas + Overlay */}
      <div style={{ position: 'relative', display: 'inline-block' }}>
        <canvas
          ref={canvasRef}
          onClick={handleCanvasClick}
          style={{
            border: '2px solid #333',
            cursor: (draggingPointId || draggingTributaryInfo)
              ? 'grabbing'
              : (hoveredPointId || hoveredTributaryPointId)
                ? 'grab'
                : 'crosshair',
            borderRadius: '4px',
            boxShadow: '0 4px 6px rgba(0,0,0,0.3)',
            display: 'block',
          }}
        />

        <RiverOverlay
          overlayRef={overlayRef}
          width={cols * gridSize}
          height={rows * gridSize}
          riverGraph={legacyGraphForOverlay}
          activeSplineId={activeSplineId ?? 'main'}
          selectedPointId={selectedNodeId}
          hoveredPointId={hoveredPointId}
          hoveredTributaryId={hoveredTributaryId}
          hoveredTributaryPointId={hoveredTributaryPointId}
          snapTargetPointId={null}
          insertPointPreview={null}
          onPointerMove={handleOverlayPointerMove}
          onPointerUp={handleOverlayPointerUp}
          onPointerLeave={handleOverlayMouseLeave}
          onBackgroundClick={handleOverlayBackgroundClick}
          onPointMouseDown={handlePointMouseDown}
          onPointClick={handlePointClick}
          onPointDoubleClick={handlePointDoubleClick}
          onTributaryPointMouseDown={handleTributaryPointMouseDown}
          onTributaryPointClick={handleTributaryPointClick}
          onTributaryPointDoubleClick={handleTributaryPointDoubleClick}
        />
      </div>
    </div>
  );
};
