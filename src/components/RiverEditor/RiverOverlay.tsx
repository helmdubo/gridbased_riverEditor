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
  onMouseMove: (e: React.MouseEvent<SVGSVGElement>) => void;
  onMouseUp: () => void;
  onMouseLeave: () => void;
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
  onMouseMove,
  onMouseUp,
  onMouseLeave,
  onBackgroundClick,
  onPointMouseDown,
  onPointClick,
  onPointDoubleClick,
  onTributaryPointMouseDown,
  onTributaryPointClick,
  onTributaryPointDoubleClick,
}) => {
  return (
    <svg
      ref={overlayRef}
      width={width}
      height={height}
      style={{ position: 'absolute', top: 0, left: 0, pointerEvents: 'auto' }}
      onMouseMove={onMouseMove}
      onMouseUp={onMouseUp}
      onMouseLeave={onMouseLeave}
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

      {/* Tributary points */}
      {Array.from(riverGraph.tributaries.values()).map((trib) =>
        trib.points.map((p, idx) => {
          const isIndependent = !!trib.isIndependent;
          const isMouth = idx === 0;
          const hideAttachedMouth = isMouth && !trib.isDetached && !isIndependent;
          if (hideAttachedMouth) return null;

          return (
            <PointMarker
              key={`${trib.id}-${p.id}`}
              point={p}
              isHovered={hoveredTributaryId === trib.id && hoveredTributaryPointId === p.id}
              isActive={activeSplineId === trib.id}
              isJunction={false}
              isDetached={trib.isDetached && !isIndependent}
              isSnapTarget={false}
              onMouseDown={() => onTributaryPointMouseDown(trib.id, p.id, isMouth)}
              onClick={(e) => onTributaryPointClick(e, trib.id, p.id)}
              onDoubleClick={(e) => onTributaryPointDoubleClick(e, trib.id, p.id)}
            />
          );
        })
      )}

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
