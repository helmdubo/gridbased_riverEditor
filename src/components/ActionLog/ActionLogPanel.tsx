/**
 * Action Log Panel - Echo Command window for debugging
 *
 * Displays all graph operations in chronological order
 * with filtering, export, and error tracking.
 *
 * Similar to Maya's Script Editor / Echo All Commands.
 */

import React, { useState, useEffect, useRef } from 'react';
import { actionLogger } from '@/core/actions';
import type { RiverAction, RiverActionType } from '@/core/actions/types';

interface ActionLogPanelProps {
  /** Show/hide panel */
  isOpen: boolean;

  /** Callback to close panel */
  onClose: () => void;

  /** Auto-scroll to bottom on new actions */
  autoScroll?: boolean;
}

export const ActionLogPanel: React.FC<ActionLogPanelProps> = ({
  isOpen,
  onClose,
  autoScroll = true,
}): JSX.Element | null => {
  const [actions, setActions] = useState<RiverAction[]>([]);
  const [filterTypes, setFilterTypes] = useState<Set<RiverActionType>>(new Set());
  const [showOnlyErrors, setShowOnlyErrors] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const logEndRef = useRef<HTMLDivElement>(null);

  // Poll for new actions (every 500ms)
  useEffect(() => {
    if (!isOpen) return;

    const interval = setInterval(() => {
      setActions(actionLogger.getActions());
    }, 500);

    // Initial load
    setActions(actionLogger.getActions());

    return () => clearInterval(interval);
  }, [isOpen]);

  // Auto-scroll to bottom
  useEffect(() => {
    if (autoScroll && logEndRef.current) {
      logEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [actions, autoScroll]);

  if (!isOpen) return null;

  // Filter actions
  let filteredActions = actions;

  if (showOnlyErrors) {
    filteredActions = filteredActions.filter((a) => a.error);
  }

  if (filterTypes.size > 0) {
    filteredActions = filteredActions.filter((a) => filterTypes.has(a.type));
  }

  if (searchTerm) {
    const term = searchTerm.toLowerCase();
    filteredActions = filteredActions.filter(
      (a) =>
        a.description.toLowerCase().includes(term) ||
        a.type.toLowerCase().includes(term) ||
        a.id.toLowerCase().includes(term)
    );
  }

  const stats = actionLogger.getStats();

  // Export handlers
  const handleExportJSON = () => {
    const json = actionLogger.exportToJSON();
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `river-actions-${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleExportCommands = () => {
    const commands = actionLogger.exportAsCommands();
    const blob = new Blob([commands], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `river-commands-${Date.now()}.txt`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleCopyCommand = (action: RiverAction) => {
    navigator.clipboard.writeText(action.description);
  };

  return (
    <div
      style={{
        position: 'fixed',
        bottom: 0,
        left: 0,
        right: 0,
        height: '300px',
        backgroundColor: '#1e1e1e',
        color: '#d4d4d4',
        fontFamily: 'monospace',
        fontSize: '12px',
        borderTop: '2px solid #333',
        display: 'flex',
        flexDirection: 'column',
        zIndex: 1000,
      }}
    >
      {/* Header */}
      <div
        style={{
          padding: '8px 12px',
          backgroundColor: '#252525',
          borderBottom: '1px solid #333',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
          <span style={{ fontWeight: 'bold' }}>Echo Log</span>
          <span style={{ color: '#888', fontSize: '11px' }}>
            {filteredActions.length} / {actions.length} actions
            {stats.totalErrors > 0 && (
              <span style={{ color: '#f48771', marginLeft: '8px' }}>
                ⚠ {stats.totalErrors} errors
              </span>
            )}
          </span>
        </div>

        <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
          {/* Search */}
          <input
            type="text"
            placeholder="Search..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            style={{
              padding: '4px 8px',
              backgroundColor: '#333',
              border: '1px solid #555',
              color: '#d4d4d4',
              borderRadius: '3px',
              fontSize: '11px',
            }}
          />

          {/* Show only errors */}
          <label style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '11px' }}>
            <input
              type="checkbox"
              checked={showOnlyErrors}
              onChange={(e) => setShowOnlyErrors(e.target.checked)}
            />
            Errors Only
          </label>

          {/* Export */}
          <button
            onClick={handleExportJSON}
            style={{
              padding: '4px 8px',
              backgroundColor: '#0e639c',
              border: 'none',
              color: 'white',
              borderRadius: '3px',
              cursor: 'pointer',
              fontSize: '11px',
            }}
          >
            Export JSON
          </button>

          <button
            onClick={handleExportCommands}
            style={{
              padding: '4px 8px',
              backgroundColor: '#0e639c',
              border: 'none',
              color: 'white',
              borderRadius: '3px',
              cursor: 'pointer',
              fontSize: '11px',
            }}
          >
            Export Commands
          </button>

          {/* Clear */}
          <button
            onClick={() => {
              actionLogger.clear();
              setActions([]);
            }}
            style={{
              padding: '4px 8px',
              backgroundColor: '#555',
              border: 'none',
              color: 'white',
              borderRadius: '3px',
              cursor: 'pointer',
              fontSize: '11px',
            }}
          >
            Clear
          </button>

          {/* Close */}
          <button
            onClick={onClose}
            style={{
              padding: '4px 8px',
              backgroundColor: 'transparent',
              border: 'none',
              color: '#d4d4d4',
              cursor: 'pointer',
              fontSize: '16px',
            }}
          >
            ✕
          </button>
        </div>
      </div>

      {/* Action list */}
      <div
        style={{
          flex: 1,
          overflowY: 'auto',
          padding: '8px',
        }}
      >
        {filteredActions.map((action, index) => {
          const time = new Date(action.timestamp).toLocaleTimeString();
          const statusIcon = action.error ? '❌' : '✓';
          const statusColor = action.error ? '#f48771' : '#89d185';

          return (
            <div
              key={action.id}
              style={{
                padding: '4px 8px',
                marginBottom: '2px',
                backgroundColor: index % 2 === 0 ? '#252525' : '#2a2a2a',
                borderLeft: action.error ? '3px solid #f48771' : '3px solid transparent',
                cursor: 'pointer',
              }}
              onClick={() => handleCopyCommand(action)}
              title="Click to copy command"
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span style={{ color: statusColor }}>{statusIcon}</span>
                <span style={{ color: '#888', minWidth: '70px' }}>{time}</span>
                <span style={{ color: '#569cd6', minWidth: '150px', fontSize: '11px' }}>
                  {action.type}
                </span>
                <span style={{ flex: 1 }}>{action.description}</span>
                <span style={{ color: '#888', fontSize: '10px' }}>
                  {action.duration.toFixed(1)}ms
                </span>
              </div>

              {/* Error details */}
              {action.error && (
                <div
                  style={{
                    marginTop: '4px',
                    marginLeft: '90px',
                    color: '#f48771',
                    fontSize: '11px',
                    whiteSpace: 'pre-wrap',
                  }}
                >
                  {action.error.message}
                </div>
              )}

              {/* Graph diff */}
              <div
                style={{
                  marginTop: '2px',
                  marginLeft: '90px',
                  color: '#888',
                  fontSize: '10px',
                }}
              >
                Nodes: {action.before.nodeCount} → {action.after.nodeCount} | Splines:{' '}
                {action.before.splineCount} → {action.after.splineCount}
                {!action.after.isValid && (
                  <span style={{ color: '#f48771', marginLeft: '8px' }}>
                    ⚠ Invalid: {action.after.validationError}
                  </span>
                )}
              </div>
            </div>
          );
        })}

        <div ref={logEndRef} />
      </div>

      {/* Stats footer */}
      <div
        style={{
          padding: '4px 12px',
          backgroundColor: '#252525',
          borderTop: '1px solid #333',
          fontSize: '10px',
          color: '#888',
        }}
      >
        Avg duration: {stats.averageDuration.toFixed(1)}ms | Total actions: {stats.totalActions} |
        Errors: {stats.totalErrors}
      </div>
    </div>
  );
};
