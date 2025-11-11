/**
 * Main controls for river width and basic actions
 */

import React from 'react';

interface MainControlsProps {
  activeSplineId: string;
  mainRiverbedWidth: number;
  tributaryWidthPercent: number;
  currentActiveTribWidth: number;
  mainRiverPointsCount: number;
  tributariesCount: number;
  onMainWidthChange: (width: number) => void;
  onTributaryWidthChange: (percent: number) => void;
  onClear: () => void;
}

export const MainControls: React.FC<MainControlsProps> = ({
  activeSplineId,
  mainRiverbedWidth,
  tributaryWidthPercent,
  currentActiveTribWidth,
  mainRiverPointsCount,
  tributariesCount,
  onMainWidthChange,
  onTributaryWidthChange,
  onClear,
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
      <button
        onClick={onClear}
        style={{
          padding: '6px 14px',
          backgroundColor: '#ef4444',
          color: 'white',
          border: 'none',
          borderRadius: '4px',
          cursor: 'pointer',
          fontWeight: 'bold',
          fontSize: '13px',
        }}
      >
        Clear
      </button>

      {activeSplineId === 'main' ? (
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          <label
            style={{
              whiteSpace: 'nowrap',
              color: '#374151',
              fontSize: '13px',
              fontWeight: 'bold',
            }}
          >
            River Width: {mainRiverbedWidth}px
          </label>
          <input
            type="range"
            min="20"
            max="150"
            value={mainRiverbedWidth}
            onChange={(e) => onMainWidthChange(Number(e.target.value))}
            style={{ width: '100px' }}
          />
        </div>
      ) : (
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          <label
            style={{
              whiteSpace: 'nowrap',
              color: '#0284c7',
              fontSize: '13px',
              fontWeight: 'bold',
            }}
          >
            Trib Width: {tributaryWidthPercent}% ({Math.round(currentActiveTribWidth)}px)
          </label>
          <input
            type="range"
            min="10"
            max="100"
            value={tributaryWidthPercent}
            onChange={(e) => onTributaryWidthChange(Number(e.target.value))}
            style={{ width: '100px' }}
          />
        </div>
      )}

      <span style={{ color: '#374151', fontSize: '13px' }}>
        Pts: {mainRiverPointsCount} | Tribs: {tributariesCount}
      </span>
    </div>
  );
};
