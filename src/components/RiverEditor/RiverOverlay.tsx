/**
 * SVG overlay for interactive elements (points, hover states)
 */

import React from 'react';
import type { RiverGraph } from '@domain/models/types';
import { PointMarker } from './PointMarker';
import { isJunctionPoint } from '@domain/utils/riverValidation';

interface RiverOverlayProps {
  overlayRef: React.RefObject<SVGSVGElement>;
  width: number;
  height: number;
  riverGraph: RiverGraph;
  activeSplineId: string;
  selectedPointId: string | null;
  hoveredPointId: string | null;
  hoveredTributaryId: string | null;
  hoveredTributaryPointId: string | null;
  snapTargetPointId: string | null;
  insertPointPreview: { splineId: string; index: number; point: { x: number; y: number } } | null;
  // Pointer Events (instead of Mouse Events for better capture support)
  onPointerMove: (e: React.PointerEvent<SVGSVGElement>) => void;
  onPointerUp: (e: React.PointerEvent<SVGSVGElement>) => void;
  onPointerLeave: () => void;
  onBackgroundClick?: (e: React.MouseEvent<SVGSVGElement>) => void;
  onPointMouseDown: (pointId: string) => void;
  onPointClick: (e: React.MouseEvent, pointId: string) => void;
  onPointDoubleClick: (e: React.MouseEvent, pointId: string) => void;
  onTributaryPointMouseDown: (tributaryId: string, pointId: string, isMouth: boolean) => void;
  onTributaryPointClick: (e: React.MouseEvent, tributaryId: string, pointId: string) => void;
  onTributaryPointDoubleClick: (
    e: React.MouseEvent,
    tributaryId: string,
    pointId: string
  ) => void;
}

export const RiverOverlay: React.FC<RiverOverlayProps> = ({
  overlayRef,
  width,
  height,
  riverGraph,
  activeSplineId,
  selectedPointId,
  hoveredPointId,
  hoveredTributaryId,
  hoveredTributaryPointId,
  snapTargetPointId,
  insertPointPreview,
  onPointerMove,
  onPointerUp,
  onPointerLeave,
  onBackgroundClick,
  onPointMouseDown,
  onPointClick,
  onPointDoubleClick,
  onTributaryPointMouseDown,
  onTributaryPointClick,
  onTributaryPointDoubleClick,
}) => {
  // P0 BUGFIX: Pointer Capture for stable drag across all browsers
  const handlePointerDown = (e: React.PointerEvent<SVGSVGElement>) => {
    // Capture pointer to receive events even when cursor moves outside SVG
    e.currentTarget.setPointerCapture(e.pointerId);
  };

  const handlePointerUp = (e: React.PointerEvent<SVGSVGElement>) => {
    // Release pointer capture
    if (e.currentTarget.hasPointerCapture(e.pointerId)) {
      e.currentTarget.releasePointerCapture(e.pointerId);
    }
    onPointerUp(e);
  };

  return (
    <svg
      ref={overlayRef}
      width={width}
      height={height}
      style={{ position: 'absolute', top: 0, left: 0, pointerEvents: 'auto' }}
      onPointerDown={handlePointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={handlePointerUp}
      onPointerLeave={onPointerLeave}
      onClick={(event) => {
        if (event.target === event.currentTarget) {
          onBackgroundClick?.(event);
        }
      }}
    >
      {/* Insert point preview */}
      {insertPointPreview && (
        <g>
          <circle
            cx={insertPointPreview.point.x}
            cy={insertPointPreview.point.y}
            r={8}
            fill="rgba(255, 215, 0, 0.3)"
            stroke="rgba(255, 215, 0, 0.9)"
            strokeWidth={2}
            style={{ pointerEvents: 'none' }}
          />
          <circle
            cx={insertPointPreview.point.x}
            cy={insertPointPreview.point.y}
            r={3}
            fill="rgba(255, 215, 0, 0.9)"
            style={{ pointerEvents: 'none' }}
          />
        </g>
      )}

      {(() => {
        const tributaryEntries = Array.from(riverGraph.tributaries.entries());
        const independentEntries = tributaryEntries.filter(([, trib]) => trib.isIndependent);
        const childEntries = tributaryEntries.filter(([, trib]) => !trib.isIndependent);

        return (
          <>
            {/* Independent rivers (render like main) */}
            {independentEntries.map(([id, trib]) =>
              trib.points.map((p, idx) => {
                const isMouth = idx === trib.points.length - 1;
                const isJunction = isJunctionPoint(riverGraph, p.id);

                return (
                  <PointMarker
                    key={`${id}-${p.id}`}
                    point={p}
                    isHovered={hoveredTributaryId === id && hoveredTributaryPointId === p.id}
                    isSelected={selectedPointId === p.id}
                    isActive={activeSplineId === id}
                    isJunction={isJunction}
                    isDetached={false}
                    isSnapTarget={false}
                    onMouseDown={() => onTributaryPointMouseDown(id, p.id, isMouth)}
                    onClick={(e) => onTributaryPointClick(e, id, p.id)}
                    onDoubleClick={(e) => onTributaryPointDoubleClick(e, id, p.id)}
                  />
                );
              })
            )}

            {/* Attached / detached tributaries */}
            {childEntries.map(([id, trib]) =>
              trib.points.map((p, idx) => {
                const isMouth = idx === trib.points.length - 1;
                const hideAttachedMouth = isMouth && !trib.isDetached;
                if (hideAttachedMouth) return null;

                return (
                  <PointMarker
                    key={`${id}-${p.id}`}
                    point={p}
                    isHovered={hoveredTributaryId === id && hoveredTributaryPointId === p.id}
                    isSelected={selectedPointId === p.id}
                    isActive={activeSplineId === id}
                    isJunction={false}
                    isDetached={trib.isDetached}
                    isSnapTarget={false}
                    onMouseDown={() => onTributaryPointMouseDown(id, p.id, isMouth)}
                    onClick={(e) => onTributaryPointClick(e, id, p.id)}
                    onDoubleClick={(e) => onTributaryPointDoubleClick(e, id, p.id)}
                  />
                );
              })
            )}
          </>
        );
      })()}

      {/* Main river points */}
      {riverGraph.mainRiver.map((p) => {
        const isJunction = isJunctionPoint(riverGraph, p.id);
        const isSnapTarget = p.id === snapTargetPointId;

        return (
          <PointMarker
            key={p.id}
            point={p}
            isHovered={hoveredPointId === p.id}
            isSelected={selectedPointId === p.id}
            isActive={activeSplineId === 'main'}
            isJunction={isJunction}
            isDetached={false}
            isSnapTarget={isSnapTarget}
            onMouseDown={() => onPointMouseDown(p.id)}
            onClick={(e) => onPointClick(e, p.id)}
            onDoubleClick={(e) => onPointDoubleClick(e, p.id)}
          />
        );
      })}

      <style>
        {`
          @keyframes dash {
            to {
              stroke-dashoffset: -8;
            }
          }
        `}
      </style>
    </svg>
  );
};
