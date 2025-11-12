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
import { DEFAULT_GRID_SIZE, DEFAULT_MAIN_RIVERBED_WIDTH, DEFAULT_RIVER_TYPE } from '@domain/constants';
import type { RiverType } from '@domain/models/types';
import GraphService from '@services/GraphService';
import type { NodeId } from '@/core/graph/types';
import { makeNodeId } from '@/core/graph/types';

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
  const [hoveredTributaryId, setHoveredTributaryId] = useState<string | null>(null);
  const [hoveredTributaryPointId, setHoveredTributaryPointId] = useState<string | null>(null);
  const [draggingPointId, setDraggingPointId] = useState<NodeId | null>(null);
  const [draggingTributaryInfo, setDraggingTributaryInfo] = useState<{ id: string; pointId: string; isMouth: boolean } | null>(null);
  const overlayRef = useRef<SVGSVGElement>(null);

  // River graph state (V2)
  const {
    riverGraph,
    addPointToActiveSpline,
    selectedNodeId,
    selectNode,
    moveNode,
    deleteNode,
    beginNewSpline,
  } = useRiverGraphV2();

  // Create new independent river
  const handleCreateNewRiver = () => {
    console.log('🆕 Creating new independent river');
    beginNewSpline(mainRiverbedWidth);
  };

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
    addPointToActiveSpline(x, y, tributaryWidthPercent);
    console.log('📊 Graph updated - nodes:', Object.keys(riverGraph.nodes).length, 'splines:', Object.keys(riverGraph.splines).length);
  };

  // Node interaction handlers
  const handlePointMouseDown = useCallback((pointId: string) => {
    console.log('🖱️ Point mouse down:', pointId);
    const nodeId = makeNodeId(pointId);
    setDraggingPointId(nodeId);
    selectNode(nodeId);
  }, [selectNode]);

  const handlePointClick = useCallback((e: React.MouseEvent, pointId: string) => {
    e.stopPropagation();
    console.log('🖱️ Point click:', pointId);
    selectNode(makeNodeId(pointId));
  }, [selectNode]);

  const handlePointDoubleClick = useCallback((e: React.MouseEvent, pointId: string) => {
    e.stopPropagation();
    console.log('🗑️ Delete node:', pointId);
    deleteNode(makeNodeId(pointId));
  }, [deleteNode]);

  const handleOverlayMouseMove = useCallback((e: React.MouseEvent<SVGSVGElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    // Update hover state when not dragging
    if (!draggingPointId && !draggingTributaryInfo) {
      let found = false;

      // Check main river points
      legacyGraph.mainRiver.forEach((p) => {
        if (!found && Math.hypot(p.x - x, p.y - y) < 15) {
          setHoveredPointId(p.id);
          setHoveredTributaryId(null);
          setHoveredTributaryPointId(null);
          found = true;
        }
      });

      // Check tributary points
      if (!found) {
        legacyGraph.tributaries.forEach((trib, id) => {
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
      const newX = Math.max(0, Math.min(cols * gridSize, x));
      const newY = Math.max(0, Math.min(rows * gridSize, y));
      moveNode(draggingPointId, newX, newY);
    }

    // Handle dragging tributary point
    if (draggingTributaryInfo) {
      const newX = Math.max(0, Math.min(cols * gridSize, x));
      const newY = Math.max(0, Math.min(rows * gridSize, y));
      // TODO: Move tributary node (need to implement in useRiverGraphV2)
      console.log('🔄 Dragging tributary node:', draggingTributaryInfo, 'to', { x: newX, y: newY });
    }
  }, [draggingPointId, draggingTributaryInfo, moveNode, legacyGraph, cols, gridSize]);

  const handleOverlayMouseUp = useCallback(() => {
    if (draggingPointId || draggingTributaryInfo) {
      console.log('✅ Drag complete');
      setDraggingPointId(null);
      setDraggingTributaryInfo(null);
    }
  }, [draggingPointId, draggingTributaryInfo]);

  const handleOverlayMouseLeave = useCallback(() => {
    if (draggingPointId || draggingTributaryInfo) {
      console.log('⚠️ Drag cancelled (mouse left canvas)');
      setDraggingPointId(null);
      setDraggingTributaryInfo(null);
    }
  }, [draggingPointId, draggingTributaryInfo]);

  // Tributary interaction
  const handleTributaryPointMouseDown = useCallback((id: string, pointId: string, isMouth: boolean) => {
    console.log('🖱️ Tributary point mouse down:', { id, pointId, isMouth });
    setDraggingTributaryInfo({ id, pointId, isMouth });
    selectNode(makeNodeId(pointId));
  }, [selectNode]);

  const handleTributaryPointClick = useCallback((e: React.MouseEvent, id: string, pointId: string) => {
    e.stopPropagation();
    console.log('🖱️ Tributary point click:', { id, pointId });
    selectNode(makeNodeId(pointId));
  }, [selectNode]);

  const handleTributaryPointDoubleClick = useCallback((e: React.MouseEvent, id: string, pointId: string) => {
    e.stopPropagation();
    console.log('🗑️ Delete tributary node:', { id, pointId });
    // TODO: Implement deleteTributaryNode in useRiverGraphV2
    // deleteTributaryNode(id, pointId);
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
          riverGraph={legacyGraph}
          activeSplineId="main"
          selectedPointId={selectedNodeId}
          hoveredPointId={hoveredPointId}
          hoveredTributaryId={hoveredTributaryId}
          hoveredTributaryPointId={hoveredTributaryPointId}
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
