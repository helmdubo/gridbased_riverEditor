/**
 * Controls for flow visualization
 */

import React from 'react';

interface FlowControlsProps {
  showFlowMap: boolean;
  showFlowArrows: boolean;
  smoothSpeed: boolean;
  showDebugZones: boolean;
  arrowSpacing: number;
  flowStrength: number;
  onShowFlowMapChange: (show: boolean) => void;
  onShowFlowArrowsChange: (show: boolean) => void;
  onSmoothSpeedChange: (smooth: boolean) => void;
  onShowDebugZonesChange: (show: boolean) => void;
  onArrowSpacingChange: (spacing: number) => void;
  onFlowStrengthChange: (strength: number) => void;
}

export const FlowControls: React.FC<FlowControlsProps> = ({
  showFlowMap,
  showFlowArrows,
  smoothSpeed,
  showDebugZones,
  arrowSpacing,
  flowStrength,
  onShowFlowMapChange,
  onShowFlowArrowsChange,
  onSmoothSpeedChange,
  onShowDebugZonesChange,
  onArrowSpacingChange,
  onFlowStrengthChange,
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
      <label style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: '13px' }}>
        <input
          type="checkbox"
          checked={showFlowMap}
          onChange={(e) => onShowFlowMapChange(e.target.checked)}
        />{' '}
        Flow Map
      </label>

      <label style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: '13px' }}>
        <input
          type="checkbox"
          checked={showFlowArrows}
          onChange={(e) => onShowFlowArrowsChange(e.target.checked)}
        />{' '}
        Flow Arrows
      </label>

      <label style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: '13px' }}>
        <input
          type="checkbox"
          checked={smoothSpeed}
          onChange={(e) => onSmoothSpeedChange(e.target.checked)}
        />{' '}
        Smooth Speed
      </label>

      <label style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: '13px' }}>
        <input
          type="checkbox"
          checked={showDebugZones}
          onChange={(e) => onShowDebugZonesChange(e.target.checked)}
        />{' '}
        Debug Zones
      </label>

      <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
        <label style={{ fontSize: '13px' }}>Spacing: {arrowSpacing}</label>
        <input
          type="range"
          min={1}
          max={3}
          value={arrowSpacing}
          onChange={(e) => onArrowSpacingChange(Number(e.target.value))}
          style={{ width: '60px' }}
        />
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
        <label style={{ fontSize: '13px' }}>Strength: {flowStrength.toFixed(1)}</label>
        <input
          type="range"
          min={0.2}
          max={2}
          step={0.1}
          value={flowStrength}
          onChange={(e) => onFlowStrengthChange(Number(e.target.value))}
          style={{ width: '60px' }}
        />
      </div>
    </div>
  );
};
