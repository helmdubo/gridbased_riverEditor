/**
 * Action Log Panel - Maya-style Echo Command viewer
 *
 * Displays all graph operations with timestamps and graph state changes.
 */

import React, { useRef, useEffect } from 'react';
import type { RiverAction } from '@/hooks/useActionLogger';

interface ActionLogPanelProps {
  logs: RiverAction[];
  onClear?: () => void;
  onExport?: (format: 'json' | 'text') => string;
}

export const ActionLogPanel: React.FC<ActionLogPanelProps> = ({ logs, onClear, onExport }) => {
  const logEndRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to bottom when new logs appear
  useEffect(() => {
    logEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [logs.length]);

  const getActionColor = (type: string): string => {
    const colorMap: Record<string, string> = {
      ADD_NODE: '#10b981',
      MOVE_NODE: '#3b82f6',
      DELETE_NODE: '#ef4444',
      CREATE_SPLINE: '#8b5cf6',
      ATTACH_TRIBUTARY: '#14b8a6',
      DETACH_TRIBUTARY: '#f59e0b',
      MERGE_NODES: '#06b6d4',
      MERGE_SPLINES: '#06b6d4',
      EXTEND_UPSTREAM: '#a855f7',
      EXTEND_DOWNSTREAM: '#a855f7',
      INSERT_NODE: '#22c55e',
      BEGIN_NEW_RIVER: '#059669',
    };
    return colorMap[type] || '#888';
  };

  const getSnapshotDiff = (before: any, after: any): string => {
    const parts: string[] = [];

    if (before.totalNodes !== after.totalNodes) {
      parts.push(`Nodes: ${before.totalNodes} → ${after.totalNodes}`);
    }

    if (before.totalSplines !== after.totalSplines) {
      parts.push(`Splines: ${before.totalSplines} → ${after.totalSplines}`);
    }

    if (before.rootSplines !== after.rootSplines) {
      parts.push(`Roots: ${before.rootSplines} → ${after.rootSplines}`);
    }

    return parts.length > 0 ? parts.join(' | ') : 'No changes';
  };

  const handleCopyCommand = (log: RiverAction) => {
    const text = `[${log.time}] ${log.type}: ${log.description}`;
    navigator.clipboard.writeText(text);
  };

  const handleExportJSON = () => {
    if (onExport) {
      const data = onExport('json');
      const blob = new Blob([data], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `river-actions-${Date.now()}.json`;
      a.click();
      URL.revokeObjectURL(url);
    }
  };

  const handleExportText = () => {
    if (onExport) {
      const data = onExport('text');
      const blob = new Blob([data], { type: 'text/plain' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `river-actions-${Date.now()}.txt`;
      a.click();
      URL.revokeObjectURL(url);
    }
  };

  return (
    <div style={{
      position: 'fixed',
      bottom: '20px',
      left: '20px',
      right: '20px',
      height: '300px',
      backgroundColor: 'rgba(26, 26, 26, 0.95)',
      backdropFilter: 'blur(10px)',
      borderRadius: '8px',
      border: '1px solid rgba(255, 255, 255, 0.1)',
      boxShadow: '0 8px 32px rgba(0, 0, 0, 0.4)',
      zIndex: 999,
      display: 'flex',
      flexDirection: 'column',
      overflow: 'hidden',
    }}>
      {/* Header */}
      <div style={{
        padding: '12px 16px',
        borderBottom: '1px solid rgba(255, 255, 255, 0.1)',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <strong style={{ color: '#10b981', fontSize: '14px' }}>📋 Echo Log</strong>
          <span style={{ color: '#888', fontSize: '12px' }}>
            {logs.length} action{logs.length !== 1 ? 's' : ''}
          </span>
        </div>

        <div style={{ display: 'flex', gap: '8px' }}>
          {onExport && (
            <>
              <button
                onClick={handleExportJSON}
                style={{
                  padding: '4px 8px',
                  backgroundColor: '#374151',
                  color: '#fff',
                  border: 'none',
                  borderRadius: '4px',
                  cursor: 'pointer',
                  fontSize: '11px',
                }}
              >
                Export JSON
              </button>
              <button
                onClick={handleExportText}
                style={{
                  padding: '4px 8px',
                  backgroundColor: '#374151',
                  color: '#fff',
                  border: 'none',
                  borderRadius: '4px',
                  cursor: 'pointer',
                  fontSize: '11px',
                }}
              >
                Export Text
              </button>
            </>
          )}
          {onClear && (
            <button
              onClick={onClear}
              style={{
                padding: '4px 8px',
                backgroundColor: '#ef4444',
                color: '#fff',
                border: 'none',
                borderRadius: '4px',
                cursor: 'pointer',
                fontSize: '11px',
              }}
            >
              Clear
            </button>
          )}
        </div>
      </div>

      {/* Log entries */}
      <div style={{
        flex: 1,
        overflowY: 'auto',
        padding: '8px',
        fontFamily: 'monospace',
        fontSize: '12px',
        lineHeight: '1.6',
      }}>
        {logs.length === 0 ? (
          <div style={{ color: '#888', padding: '20px', textAlign: 'center' }}>
            No actions yet. Start editing to see logs.
          </div>
        ) : (
          logs.map((log) => (
            <div
              key={log.id}
              onClick={() => handleCopyCommand(log)}
              style={{
                padding: '8px',
                marginBottom: '4px',
                backgroundColor: log.error ? 'rgba(239, 68, 68, 0.1)' : 'rgba(255, 255, 255, 0.02)',
                borderLeft: `3px solid ${getActionColor(log.type)}`,
                borderRadius: '4px',
                cursor: 'pointer',
                transition: 'background-color 0.2s',
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.backgroundColor = 'rgba(255, 255, 255, 0.05)';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.backgroundColor = log.error ? 'rgba(239, 68, 68, 0.1)' : 'rgba(255, 255, 255, 0.02)';
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
                <span style={{ color: '#888', fontSize: '11px' }}>[{log.time}]</span>
                <span style={{ color: getActionColor(log.type), fontWeight: 'bold' }}>
                  {log.type}
                </span>
              </div>

              <div style={{ color: '#ddd', marginLeft: '16px' }}>
                {log.description}
              </div>

              <div style={{ color: '#888', fontSize: '11px', marginLeft: '16px', marginTop: '4px' }}>
                {getSnapshotDiff(log.graphBefore, log.graphAfter)}
              </div>

              {log.error && (
                <div style={{
                  color: '#ef4444',
                  fontSize: '11px',
                  marginLeft: '16px',
                  marginTop: '4px',
                  fontFamily: 'monospace',
                }}>
                  ⚠️ Error: {log.error}
                </div>
              )}
            </div>
          ))
        )}
        <div ref={logEndRef} />
      </div>

      {/* Footer with stats */}
      <div style={{
        padding: '8px 16px',
        borderTop: '1px solid rgba(255, 255, 255, 0.1)',
        color: '#888',
        fontSize: '11px',
        display: 'flex',
        justifyContent: 'space-between',
      }}>
        <span>Click any log to copy to clipboard</span>
        <span>{logs.filter(l => l.error).length} error{logs.filter(l => l.error).length !== 1 ? 's' : ''}</span>
      </div>
    </div>
  );
};
