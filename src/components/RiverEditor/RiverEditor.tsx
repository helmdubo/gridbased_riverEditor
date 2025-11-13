/**
 * Legacy-compatible RiverEditor wrapper using the new V2 demo implementation.
 *
 * This keeps the old public API (cols/rows/gridSize) so that existing imports
 * from other parts of the app can continue to render the upgraded editor
 * without manual migration.
 */

import React from 'react';
import { RiverEditorDemo } from '../RiverEditorDemo';

interface RiverEditorProps {
  cols: number;
  rows: number;
  gridSize?: number;
}

export const RiverEditor: React.FC<RiverEditorProps> = ({ cols, rows, gridSize }) => {
  return <RiverEditorDemo cols={cols} rows={rows} gridSize={gridSize} />;
};
