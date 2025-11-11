/**
 * Setup screen for configuring grid dimensions
 */

import React from 'react';
import { DEFAULT_GRID_SIZE } from '@domain/constants';

interface SetupScreenProps {
  cols: number;
  rows: number;
  onColsChange: (cols: number) => void;
  onRowsChange: (rows: number) => void;
  onComplete: () => void;
}

export const SetupScreen: React.FC<SetupScreenProps> = ({
  cols,
  rows,
  onColsChange,
  onRowsChange,
  onComplete,
}) => {
  return (
    <div
      style={{
        padding: '40px',
        fontFamily: 'Arial, sans-serif',
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'center',
        minHeight: '100vh',
        backgroundColor: '#f5f5f5',
      }}
    >
      <div
        style={{
          backgroundColor: 'white',
          padding: '40px',
          borderRadius: '12px',
          boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
          maxWidth: '500px',
          width: '100%',
        }}
      >
        <h1
          style={{
            fontSize: '2rem',
            fontWeight: 'bold',
            marginBottom: '10px',
            textAlign: 'center',
          }}
        >
          River System Setup
        </h1>
        <p style={{ color: '#666', textAlign: 'center', marginBottom: '30px' }}>
          Configure grid dimensions
        </p>

        <div style={{ marginBottom: '25px' }}>
          <label
            style={{
              display: 'block',
              marginBottom: '8px',
              fontWeight: 'bold',
              color: '#374151',
            }}
          >
            Columns: {cols}
          </label>
          <input
            type="range"
            min="10"
            max="40"
            value={cols}
            onChange={(e) => onColsChange(Number(e.target.value))}
            style={{ width: '100%' }}
          />
          <div style={{ fontSize: '12px', color: '#666', marginTop: '4px' }}>
            Width: {cols * DEFAULT_GRID_SIZE}px
          </div>
        </div>

        <div style={{ marginBottom: '30px' }}>
          <label
            style={{
              display: 'block',
              marginBottom: '8px',
              fontWeight: 'bold',
              color: '#374151',
            }}
          >
            Rows: {rows}
          </label>
          <input
            type="range"
            min="8"
            max="30"
            value={rows}
            onChange={(e) => onRowsChange(Number(e.target.value))}
            style={{ width: '100%' }}
          />
          <div style={{ fontSize: '12px', color: '#666', marginTop: '4px' }}>
            Height: {rows * DEFAULT_GRID_SIZE}px
          </div>
        </div>

        <button
          onClick={onComplete}
          style={{
            width: '100%',
            padding: '15px',
            fontSize: '18px',
            fontWeight: 'bold',
            color: 'white',
            backgroundColor: '#3b82f6',
            border: 'none',
            borderRadius: '8px',
            cursor: 'pointer',
          }}
        >
          Start
        </button>
      </div>
    </div>
  );
};
