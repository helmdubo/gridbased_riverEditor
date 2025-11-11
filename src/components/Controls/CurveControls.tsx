/**
 * Controls for curve parameters
 */

import React from 'react';

interface CurveControlsProps {
  curvWeight: number;
  curvScale: number;
  onCurvWeightChange: (weight: number) => void;
  onCurvScaleChange: (scale: number) => void;
}

export const CurveControls: React.FC<CurveControlsProps> = ({
  curvWeight,
  curvScale,
  onCurvWeightChange,
  onCurvScaleChange,
}) => {
  return (
    <div
      style={{
        marginBottom: '12px',
        display: 'flex',
        flexWrap: 'wrap',
        gap: '8px',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '8px',
        backgroundColor: 'white',
        borderRadius: '6px',
        boxShadow: '0 2px 4px rgba(0,0,0,0.1)',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
        <label style={{ fontSize: '13px' }}>Curve Weight: {curvWeight.toFixed(2)}</label>
        <input
          type="range"
          min={0}
          max={1}
          step={0.1}
          value={curvWeight}
          onChange={(e) => onCurvWeightChange(Number(e.target.value))}
          style={{ width: '80px' }}
        />
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
        <label style={{ fontSize: '13px' }}>Curve Scale: {curvScale.toFixed(1)}</label>
        <input
          type="range"
          min={0.5}
          max={2}
          step={0.1}
          value={curvScale}
          onChange={(e) => onCurvScaleChange(Number(e.target.value))}
          style={{ width: '80px' }}
        />
      </div>
    </div>
  );
};
