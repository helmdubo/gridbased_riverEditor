/**
 * River Editor Demo - Minimal implementation using V2 architecture
 *
 * This is a simplified version for testing the new Node-Edge architecture.
 * Uses useRiverGraphV2 and useRiverRendererV2 with all P0 bugfixes included.
 */

import React, { useEffect, useState } from 'react';
import { useRiverGraphV2 } from '@hooks/useRiverGraphV2';
import { useRiverRendererV2 } from '@hooks/useRiverRendererV2';
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

  // River graph state (V2)
  const {
    riverGraph,
    addPointToActiveEdge,
    selectedNodeId,
  } = useRiverGraphV2();

  // Renderer with geometry cache + P0 bugfixes
  const { canvasRef, render } = useRiverRendererV2(
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
  }, [render, showFlowMap, showFlowArrows, riverType, mainRiverbedWidth]);

  // Handle canvas click
  const handleCanvasClick = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    addPointToActiveEdge(x, y, tributaryWidthPercent);
  };

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

      {/* Canvas */}
      <canvas
        ref={canvasRef}
        onClick={handleCanvasClick}
        style={{
          border: '2px solid #333',
          cursor: 'crosshair',
          borderRadius: '4px',
          boxShadow: '0 4px 6px rgba(0,0,0,0.3)',
        }}
      />
    </div>
  );
};
