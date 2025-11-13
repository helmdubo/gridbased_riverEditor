/**
 * Point marker component for river points
 */

import React from 'react';
import type { Point } from '@domain/models/types';

interface PointMarkerProps {
  point: Point;
  isHovered?: boolean;
  isSelected?: boolean;
  isActive?: boolean;
  isJunction?: boolean;
  isDetached?: boolean;
  isSnapTarget?: boolean;
  onMouseDown: () => void;
  onClick: (e: React.MouseEvent) => void;
  onDoubleClick: (e: React.MouseEvent) => void;
}

export const PointMarker: React.FC<PointMarkerProps> = ({
  point,
  isHovered = false,
  isSelected = false,
  isActive = false,
  isJunction = false,
  isDetached = false,
  isSnapTarget = false,
  onMouseDown,
  onClick,
  onDoubleClick,
}) => {
  const radius = isHovered || isSelected || isSnapTarget ? 8 : 6;
  const hitRadius = 15;

  let fillColor = 'white';
  if (isJunction) {
    fillColor = '#10b981';
  } else if (isDetached) {
    fillColor = '#ff9800';
  } else if (isActive) {
    fillColor = '#0ea5e9';
  }

  let strokeColor = '#ef4444';
  if (isSelected || isSnapTarget) {
    strokeColor = '#fbbf24';
  } else if (isJunction) {
    strokeColor = '#059669';
  } else if (isDetached) {
    strokeColor = '#e65100';
  } else if (isActive) {
    strokeColor = '#0284c7';
  }

  const strokeWidth = isHovered || isSelected || isSnapTarget ? 3 : 2;

  return (
    <g style={{ pointerEvents: 'auto' }}>
      {/* Hit area */}
      <circle
        cx={point.x}
        cy={point.y}
        r={hitRadius}
        fill="transparent"
        style={{ cursor: 'grab', pointerEvents: 'all' }}
        onMouseDown={(e) => {
          e.stopPropagation();
          onMouseDown();
        }}
        onClick={(e) => {
          e.stopPropagation();
          onClick(e);
        }}
        onDoubleClick={(e) => {
          e.stopPropagation();
          onDoubleClick(e);
        }}
      />

      {/* Visual marker */}
      <circle
        cx={point.x}
        cy={point.y}
        r={radius}
        fill={fillColor}
        stroke={strokeColor}
        strokeWidth={strokeWidth}
        style={{ pointerEvents: 'none' }}
      />

      {/* Snap target indicator */}
      {isSnapTarget && (
        <circle
          cx={point.x}
          cy={point.y}
          r={12}
          fill="none"
          stroke="#fbbf24"
          strokeWidth={2}
          strokeDasharray="4,4"
          style={{
            pointerEvents: 'none',
            animation: 'dash 1s linear infinite',
          }}
        />
      )}
    </g>
  );
};
