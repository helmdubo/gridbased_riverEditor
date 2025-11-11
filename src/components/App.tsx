/**
 * Main application component
 */

import React, { useState } from 'react';
import { SetupScreen } from './SetupScreen/SetupScreen';
import { RiverEditor } from './RiverEditor/RiverEditor';
import { DEFAULT_COLS, DEFAULT_ROWS } from '@domain/constants';

export const App: React.FC = () => {
  const [isSetupComplete, setIsSetupComplete] = useState(false);
  const [cols, setCols] = useState(DEFAULT_COLS);
  const [rows, setRows] = useState(DEFAULT_ROWS);

  if (!isSetupComplete) {
    return (
      <SetupScreen
        cols={cols}
        rows={rows}
        onColsChange={setCols}
        onRowsChange={setRows}
        onComplete={() => setIsSetupComplete(true)}
      />
    );
  }

  return <RiverEditor cols={cols} rows={rows} />;
};
