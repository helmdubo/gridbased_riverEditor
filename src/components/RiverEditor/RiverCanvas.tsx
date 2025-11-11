/**
 * Canvas component for rendering river system
 */

import React from 'react';

interface RiverCanvasProps {
  canvasRef: React.RefObject<HTMLCanvasElement>;
  onClick: (e: React.MouseEvent<HTMLCanvasElement>) => void;
  style?: React.CSSProperties;
}

export const RiverCanvas: React.FC<RiverCanvasProps> = ({ canvasRef, onClick, style }) => {
  return (
    <canvas
      ref={canvasRef}
      onClick={onClick}
      style={{
        border: '2px solid #333',
        cursor: 'crosshair',
        display: 'block',
        borderRadius: '4px',
        boxShadow: '0 4px 6px rgba(0,0,0,0.1)',
        ...style,
      }}
    />
  );
};
