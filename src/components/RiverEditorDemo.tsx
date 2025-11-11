/**
 * River Editor Demo - Minimal implementation using V2 architecture
 *
 * This is a simplified version for testing the new Node-Edge architecture.
 * Uses useRiverGraphV2 and useRiverRendererV2 with all P0 bugfixes included.
 */

import React, { useEffect, useState, useRef, useCallback } from 'react';
import { useRiverGraphV2 } from '@hooks/useRiverGraphV2';
import { useRiverRendererV2 } from '@hooks/useRiverRendererV2';
import { RiverOverlay } from './RiverEditor/RiverOverlay';
import { DEFAULT_GRID_SIZE, DEFAULT_MAIN_RIVERBED_WIDTH, DEFAULT_RIVER_TYPE } from '@domain/constants';
import type { RiverType } from '@domain/models/types';

interface RiverEditorDemoProps {
  cols: number;
  rows: number;
}

export const RiverEditorDemo: React.FC<RiverEditorDemoProps> = ({ cols, rows }) => {
  const gridSize = DEFAULT_GRID_SIZE;
  const [mainRiverbedWidth, setMainRiverbedWidth] = useState(DEFAULT_MAIN_RIVERBED_WIDTH);
  const [riverType, setRiverType] = useState<RiverType>(DEFAULT_RIVER_TYPE);
  const [showFlowMap, setShowFlowMap] = useState(false);
  const [showFlowArrows, setShowFlowArrows] = useState(false);
  const [tributaryWidthPercent, setTributaryWidthPercent] = useState(50);

  // Interaction state
  const [hoveredPointId, setHoveredPointId] = useState<string | null>(null);
  const [draggingPointId, setDraggingPointId] = useState<string | null>(null);
  const overlayRef = useRef<SVGSVGElement>(null);

  // River graph state (V2)
  const {
    riverGraph,
    addPointToActiveEdge,
    selectedNodeId,
    selectNode,
    moveNode,
  } = useRiverGraphV2();

  // Renderer with geometry cache + P0 bugfixes
  const { canvasRef, legacyGraph, render } = useRiverRendererV2(
    riverGraph,
    mainRiverbedWidth,
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

  // Render on changes
  useEffect(() => {
    render({
      showFlowMap,
      showFlowArrows,
      showDebugZones: false,
      arrowSpacing: 1,
      flowStrength: 1.0,
      activeSplineId: 'main',
      snapTargetPointId: null,
      splineSnapInfo: null,
      hoveredSegment: null,
      insertPointPreview: null,
      mainRiverbedWidth,
    }, riverType);
  }, [riverGraph, render, showFlowMap, showFlowArrows, riverType, mainRiverbedWidth]);

  // Handle canvas click
  const handleCanvasClick = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    console.log('🖱️ Canvas click:', { x, y });
    addPointToActiveEdge(x, y, tributaryWidthPercent);
    console.log('📊 Graph updated - nodes:', Object.keys(riverGraph.nodes).length, 'edges:', Object.keys(riverGraph.edges).length);
  };

  // Node interaction handlers
  const handlePointMouseDown = useCallback((pointId: string) => {
    console.log('🖱️ Point mouse down:', pointId);
    setDraggingPointId(pointId);
    selectNode(pointId);
  }, [selectNode]);

  const handlePointClick = useCallback((e: React.MouseEvent, pointId: string) => {
    e.stopPropagation();
    console.log('🖱️ Point click:', pointId);
    selectNode(pointId);
  }, [selectNode]);

  const handlePointDoubleClick = useCallback((e: React.MouseEvent, pointId: string) => {
    e.stopPropagation();
    console.log('🖱️ Point double click:', pointId);
    // TODO: Delete node or other action
  }, []);

  const handleOverlayMouseMove = useCallback((e: React.MouseEvent<SVGSVGElement>) => {
    if (!draggingPointId) return;

    const canvas = canvasRef.current;
    if (!canvas) return;

    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    console.log('🔄 Dragging node:', draggingPointId, 'to', { x, y });
    moveNode(draggingPointId, x, y);
  }, [draggingPointId, moveNode]);

  const handleOverlayMouseUp = useCallback(() => {
    if (draggingPointId) {
      console.log('✅ Drag complete:', draggingPointId);
      setDraggingPointId(null);
    }
  }, [draggingPointId]);

  const handleOverlayMouseLeave = useCallback(() => {
    if (draggingPointId) {
      console.log('⚠️ Drag cancelled (mouse left canvas)');
      setDraggingPointId(null);
    }
  }, [draggingPointId]);

  // Tributary interaction (simplified for demo - not implemented yet)
  const handleTributaryPointMouseDown = useCallback((_: string, __: string, ___: boolean) => {
    // TODO: Implement tributary interaction
  }, []);

  const handleTributaryPointClick = useCallback((_e: React.MouseEvent, __: string, ___: string) => {
    // TODO: Implement tributary interaction
  }, []);

  const handleTributaryPointDoubleClick = useCallback((_e: React.MouseEvent, __: string, ___: string) => {
    // TODO: Implement tributary interaction
  }, []);

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
          River Editor V2 Demo - Node-Edge Architecture
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
        <label>
          Main Width: {mainRiverbedWidth}px
          <input
            type="range"
            min="20"
            max="150"
            value={mainRiverbedWidth}
            onChange={(e) => setMainRiverbedWidth(Number(e.target.value))}
            style={{ display: 'block', width: '200px' }}
          />
        </label>

        <label>
          Tributary Width: {tributaryWidthPercent}%
          <input
            type="range"
            min="20"
            max="100"
            value={tributaryWidthPercent}
            onChange={(e) => setTributaryWidthPercent(Number(e.target.value))}
            style={{ display: 'block', width: '200px' }}
          />
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

      {/* Info */}
      <div style={{
        padding: '15px',
        backgroundColor: '#2a2a2a',
        borderRadius: '8px',
        fontSize: '14px',
      }}>
        <strong>Instructions:</strong>
        <ul style={{ margin: '10px 0 0 0', paddingLeft: '20px' }}>
          <li>Click on canvas to add points to main river</li>
          <li>Click on existing junction points to create tributaries</li>
          <li>Selected node: {selectedNodeId || 'none'}</li>
          <li>Nodes: {Object.keys(riverGraph.nodes).length} | Edges: {Object.keys(riverGraph.edges).length}</li>
        </ul>
      </div>

      {/* Canvas + Overlay */}
      <div style={{ position: 'relative', display: 'inline-block' }}>
        <canvas
          ref={canvasRef}
          onClick={handleCanvasClick}
          style={{
            border: '2px solid #333',
            cursor: draggingPointId ? 'grabbing' : 'crosshair',
            borderRadius: '4px',
            boxShadow: '0 4px 6px rgba(0,0,0,0.3)',
            display: 'block',
          }}
        />

        <RiverOverlay
          overlayRef={overlayRef}
          width={cols * gridSize}
          height={rows * gridSize}
          riverGraph={legacyGraph}
          activeSplineId="main"
          selectedPointId={selectedNodeId}
          hoveredPointId={hoveredPointId}
          hoveredTributaryId={null}
          hoveredTributaryPointId={null}
          snapTargetPointId={null}
          insertPointPreview={null}
          onMouseMove={handleOverlayMouseMove}
          onMouseUp={handleOverlayMouseUp}
          onMouseLeave={handleOverlayMouseLeave}
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
