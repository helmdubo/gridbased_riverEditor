/**
 * Controls for river type selection
 */

import React from 'react';
import type { RiverType } from '@domain/models/types';
import { RIVER_TYPES } from '@domain/constants';

interface RiverTypeControlsProps {
  riverType: RiverType;
  onRiverTypeChange: (type: RiverType) => void;
}

export const RiverTypeControls: React.FC<RiverTypeControlsProps> = ({
  riverType,
  onRiverTypeChange,
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
      {(Object.keys(RIVER_TYPES) as Array<RiverType>).map((t) => (
        <label
          key={t}
          style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '12px' }}
        >
          <input
            type="radio"
            checked={riverType === t}
            onChange={() => onRiverTypeChange(t)}
          />
          {t}
        </label>
      ))}
    </div>
  );
};
