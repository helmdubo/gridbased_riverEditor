/**
 * Main river editor component
 */

import React, { useState, useEffect } from 'react';
import type { RiverType } from '@domain/models/types';
import { useRiverGraph, useRiverInteractions, useRiverRenderer } from '@hooks';
import {
  DEFAULT_MAIN_RIVERBED_WIDTH,
  DEFAULT_TRIBUTARY_WIDTH_PERCENT,
  DEFAULT_RIVER_TYPE,
  DEFAULT_CURV_WEIGHT,
  DEFAULT_CURV_SCALE,
  DEFAULT_ARROW_SPACING,
  DEFAULT_FLOW_STRENGTH,
  DEFAULT_GRID_SIZE,
  DEFAULT_CURVE_SEGMENTS,
} from '@domain/constants';
import { RiverCanvas } from './RiverCanvas';
import { RiverOverlay } from './RiverOverlay';
import { MainControls } from '../Controls/MainControls';
import { FlowControls } from '../Controls/FlowControls';
import { RiverTypeControls } from '../Controls/RiverTypeControls';
import { CurveControls } from '../Controls/CurveControls';
import { Instructions } from '../Instructions/Instructions';

interface RiverEditorProps {
  cols: number;
  rows: number;
  gridSize?: number;
}

export const RiverEditor: React.FC<RiverEditorProps> = ({
  cols,
  rows,
  gridSize = DEFAULT_GRID_SIZE,
}) => {
  // River graph state
  const {
    riverGraph,
    activeSplineId,
    selectedPointId,
    setActiveSplineId,
    setSelectedPointId,
    addPointToActiveSpline,
    deleteRiverPoint,
    deleteTributaryPoint,
    movePoint,
    snapTributaryToPoint,
    attachTributaryToSpline,
    splitSegment,
    updateTributaryWidth,
    clearAll,
  } = useRiverGraph();

  // Visual parameters
  const [mainRiverbedWidth, setMainRiverbedWidth] = useState(DEFAULT_MAIN_RIVERBED_WIDTH);
  const [tributaryWidthPercent, setTributaryWidthPercent] = useState(
    DEFAULT_TRIBUTARY_WIDTH_PERCENT
  );

  // Flow visualization
  const [showFlowArrows, setShowFlowArrows] = useState(false);
  const [showFlowMap, setShowFlowMap] = useState(true);
  const [arrowSpacing, setArrowSpacing] = useState(DEFAULT_ARROW_SPACING);
  const [flowStrength, setFlowStrength] = useState(DEFAULT_FLOW_STRENGTH);
  const [smoothSpeed, setSmoothSpeed] = useState(true);
  const [showDebugZones, setShowDebugZones] = useState(false);

  // River type and flow parameters
  const [riverType, setRiverType] = useState<RiverType>(DEFAULT_RIVER_TYPE);
  const [curvWeight, setCurvWeight] = useState(DEFAULT_CURV_WEIGHT);
  const [curvScale, setCurvScale] = useState(DEFAULT_CURV_SCALE);

  // Interaction state
  const {
    hoveredPointId,
    hoveredTributaryId,
    hoveredTributaryPointId,
    hoveredSegment,
    insertPointPreview,
    draggingPointId,
    draggingTributaryInfo,
    snapTargetPointId,
    splineSnapInfo,
    setDraggingPointId,
    setDraggingTributaryInfo,
    checkSplineSnap,
    updateHoverState,
    clearDragState,
  } = useRiverInteractions(riverGraph, mainRiverbedWidth);

  // Renderer
  const { canvasRef } = useRiverRenderer(riverGraph, {
    cols,
    rows,
    gridSize,
    mainRiverbedWidth,
    riverType,
    curvWeight,
    curvScale,
    smoothSpeed,
    showFlowMap,
    showFlowArrows,
    renderOptions: {
      showFlowMap,
      showFlowArrows,
      showDebugZones,
      arrowSpacing,
      flowStrength,
      activeSplineId,
      snapTargetPointId,
      splineSnapInfo,
      hoveredSegment,
      insertPointPreview,
    },
  });

  // Update tributary width when active spline changes
  useEffect(() => {
    if (activeSplineId !== 'main') {
      const trib = riverGraph.tributaries.get(activeSplineId);
      if (trib) {
        setTributaryWidthPercent(trib.widthPercent);
      }
    }
  }, [activeSplineId, riverGraph.tributaries]);

  // Calculate current active tributary width
  let currentActiveTribWidth = 0;
  if (activeSplineId !== 'main') {
    const trib = riverGraph.tributaries.get(activeSplineId);
    if (trib) {
      currentActiveTribWidth =
        typeof trib.resolvedWidthPx === 'number'
          ? trib.resolvedWidthPx
          : (trib.widthPercent / 100) * mainRiverbedWidth;
    }
  }

  // Event handlers
  const handleCanvasClick = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    // Check if we're clicking on an insert point preview
    if (insertPointPreview) {
      splitSegment(insertPointPreview.splineId, insertPointPreview.index);
      return;
    }

    addPointToActiveSpline(x, y, tributaryWidthPercent);
  };

  const handlePointClick = (e: React.MouseEvent, pointId: string) => {
    e.stopPropagation();
    setSelectedPointId(pointId);
    setActiveSplineId('main');
  };

  const handleTributaryPointClick = (
    e: React.MouseEvent,
    tributaryId: string,
    pointId: string
  ) => {
    e.stopPropagation();
    setActiveSplineId(tributaryId);
    setSelectedPointId(pointId);
  };

  const handlePointDoubleClick = (e: React.MouseEvent, pointId: string) => {
    e.stopPropagation();
    deleteRiverPoint(pointId);
  };

  const handleTributaryPointDoubleClick = (
    e: React.MouseEvent,
    tributaryId: string,
    pointId: string
  ) => {
    e.stopPropagation();
    deleteTributaryPoint(tributaryId, pointId);
  };

  const handleSvgMouseMove = (e: React.MouseEvent<SVGSVGElement>) => {
    const svg = e.currentTarget;
    const rect = svg.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    if (!draggingPointId && !draggingTributaryInfo) {
      updateHoverState(x, y, selectedPointId, activeSplineId);
    }

    if (draggingPointId) {
      if (activeSplineId !== 'main') {
        setActiveSplineId('main');
      }

      const newX = Math.max(0, Math.min(cols * gridSize, x));
      const newY = Math.max(0, Math.min(rows * gridSize, y));

      movePoint('main', draggingPointId, newX, newY);
    }

    if (draggingTributaryInfo) {
      const trib = riverGraph.tributaries.get(draggingTributaryInfo.id);
      if (!trib) return;

      if (activeSplineId !== draggingTributaryInfo.id) {
        setActiveSplineId(draggingTributaryInfo.id);
      }

      const newX = Math.max(0, Math.min(cols * gridSize, x));
      const newY = Math.max(0, Math.min(rows * gridSize, y));

      movePoint(draggingTributaryInfo.id, draggingTributaryInfo.pointId, newX, newY);

      if (draggingTributaryInfo.isMouth && trib.isDetached) {
        checkSplineSnap(newX, newY);
      }
    }
  };

  const handleMouseUp = () => {
    if (draggingTributaryInfo) {
      const trib = riverGraph.tributaries.get(draggingTributaryInfo.id);
      if (
        trib &&
        draggingTributaryInfo.isMouth &&
        trib.isDetached &&
        trib.points.length > 0
      ) {
        // Try point snapping first
        if (snapTargetPointId) {
          snapTributaryToPoint(draggingTributaryInfo.id, snapTargetPointId);
        }
        // Try spline snapping if no point snap
        else if (splineSnapInfo) {
          const controlPointIndex = Math.floor(
            splineSnapInfo.segmentIndex / DEFAULT_CURVE_SEGMENTS
          );
          attachTributaryToSpline(
            draggingTributaryInfo.id,
            controlPointIndex,
            splineSnapInfo.point
          );
        }
      }
    }

    clearDragState();
  };

  const handleTributaryWidthChange = (percent: number) => {
    setTributaryWidthPercent(percent);

    if (activeSplineId !== 'main') {
      updateTributaryWidth(activeSplineId, percent);
    }
  };

  return (
    <div style={{ padding: '20px', fontFamily: 'Arial, sans-serif' }}>
      <div style={{ textAlign: 'center', marginBottom: '15px' }}>
        <h1 style={{ fontSize: '1.8rem', fontWeight: 'bold' }}>
          River System with Tributaries
        </h1>
        <p style={{ color: '#666', fontSize: '13px' }}>
          Grid: {cols}×{rows} | Active:{' '}
          {activeSplineId === 'main' ? 'Main River' : 'Tributary'}
        </p>
      </div>

      <MainControls
        activeSplineId={activeSplineId}
        mainRiverbedWidth={mainRiverbedWidth}
        tributaryWidthPercent={tributaryWidthPercent}
        currentActiveTribWidth={currentActiveTribWidth}
        mainRiverPointsCount={riverGraph.mainRiver.length}
        tributariesCount={riverGraph.tributaries.size}
        onMainWidthChange={setMainRiverbedWidth}
        onTributaryWidthChange={handleTributaryWidthChange}
        onClear={clearAll}
      />

      <FlowControls
        showFlowMap={showFlowMap}
        showFlowArrows={showFlowArrows}
        smoothSpeed={smoothSpeed}
        showDebugZones={showDebugZones}
        arrowSpacing={arrowSpacing}
        flowStrength={flowStrength}
        onShowFlowMapChange={setShowFlowMap}
        onShowFlowArrowsChange={setShowFlowArrows}
        onSmoothSpeedChange={setSmoothSpeed}
        onShowDebugZonesChange={setShowDebugZones}
        onArrowSpacingChange={setArrowSpacing}
        onFlowStrengthChange={setFlowStrength}
      />

      <RiverTypeControls riverType={riverType} onRiverTypeChange={setRiverType} />

      <CurveControls
        curvWeight={curvWeight}
        curvScale={curvScale}
        onCurvWeightChange={setCurvWeight}
        onCurvScaleChange={setCurvScale}
      />

      <div style={{ position: 'relative', display: 'inline-block' }}>
        <RiverCanvas canvasRef={canvasRef} onClick={handleCanvasClick} />
        <RiverOverlay
          overlayRef={React.createRef()}
          width={cols * gridSize}
          height={rows * gridSize}
          riverGraph={riverGraph}
          activeSplineId={activeSplineId}
          selectedPointId={selectedPointId}
          hoveredPointId={hoveredPointId}
          hoveredTributaryId={hoveredTributaryId}
          hoveredTributaryPointId={hoveredTributaryPointId}
          snapTargetPointId={snapTargetPointId}
          insertPointPreview={insertPointPreview}
          onMouseMove={handleSvgMouseMove}
          onMouseUp={handleMouseUp}
          onMouseLeave={handleMouseUp}
          onPointMouseDown={setDraggingPointId}
          onPointClick={handlePointClick}
          onPointDoubleClick={handlePointDoubleClick}
          onTributaryPointMouseDown={(id, pointId, isMouth) =>
            setDraggingTributaryInfo({ id, pointId, isMouth })
          }
          onTributaryPointClick={handleTributaryPointClick}
          onTributaryPointDoubleClick={handleTributaryPointDoubleClick}
        />
      </div>

      <Instructions />
    </div>
  );
};
