/**
 * Enhanced Action Logger for River Editor
 *
 * Logs all graph operations with detailed context for debugging.
 * Inspired by Maya's Echo Command system.
 */

import { useCallback, useRef } from 'react';
import type { RiverGraphV2 } from '@/core/graph/types';

export type ActionType =
  | 'ADD_NODE'
  | 'MOVE_NODE'
  | 'DELETE_NODE'
  | 'CREATE_SPLINE'
  | 'DELETE_SPLINE'
  | 'ATTACH_TRIBUTARY'
  | 'DETACH_TRIBUTARY'
  | 'MERGE_NODES'
  | 'MERGE_SPLINES'
  | 'SPLIT_SPLINE'
  | 'UPDATE_WIDTH'
  | 'EXTEND_UPSTREAM'
  | 'EXTEND_DOWNSTREAM'
  | 'INSERT_NODE'
  | 'BEGIN_NEW_RIVER';

export interface GraphSnapshot {
  totalNodes: number;
  totalSplines: number;
  rootSplines: number;
}

export interface RiverAction {
  id: string;
  type: ActionType;
  timestamp: number;
  time: string;
  description: string;
  details: Record<string, any>;
  graphBefore: GraphSnapshot;
  graphAfter: GraphSnapshot;
  duration?: number;
  error?: string;
}

const MAX_LOGS = 500;

export const useActionLogger = (enabled: boolean = true) => {
  const logsRef = useRef<RiverAction[]>([]);
  const actionIdCounter = useRef(0);
  const lastMoveTimestamp = useRef<number>(0);
  const MOVE_DEBOUNCE_MS = 100; // Log moves at most every 100ms

  const createSnapshot = useCallback((graph: RiverGraphV2): GraphSnapshot => {
    return {
      totalNodes: Object.keys(graph.nodes).length,
      totalSplines: Object.keys(graph.splines).length,
      rootSplines: Object.values(graph.splines).filter(s => !s.parentId).length,
    };
  }, []);

  const formatTime = useCallback((timestamp: number): string => {
    const date = new Date(timestamp);
    return date.toLocaleTimeString('en-US', { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' });
  }, []);

  const log = useCallback((
    type: ActionType,
    description: string,
    graphBefore: RiverGraphV2,
    graphAfter: RiverGraphV2,
    details: Record<string, any> = {},
    error?: string
  ) => {
    if (!enabled) return;

    // Debounce MOVE_NODE actions
    if (type === 'MOVE_NODE') {
      const now = Date.now();
      if (now - lastMoveTimestamp.current < MOVE_DEBOUNCE_MS) {
        return; // Skip this log
      }
      lastMoveTimestamp.current = now;
    }

    const timestamp = Date.now();
    const id = `action_${++actionIdCounter.current}`;

    const action: RiverAction = {
      id,
      type,
      timestamp,
      time: formatTime(timestamp),
      description,
      details,
      graphBefore: createSnapshot(graphBefore),
      graphAfter: createSnapshot(graphAfter),
      error,
    };

    logsRef.current.push(action);

    // Trim to max logs
    if (logsRef.current.length > MAX_LOGS) {
      logsRef.current = logsRef.current.slice(-MAX_LOGS);
    }

    // Console output
    const emoji = getActionEmoji(type);
    const snapshotDiff = getSnapshotDiff(action.graphBefore, action.graphAfter);

    console.group(`${emoji} [${action.time}] ${type}: ${description}`);
    if (Object.keys(details).length > 0) {
      console.log('Details:', details);
    }
    console.log('Graph:', snapshotDiff);
    if (error) {
      console.error('Error:', error);
    }
    console.groupEnd();
  }, [enabled, createSnapshot, formatTime]);

  const getLogs = useCallback(() => {
    return [...logsRef.current];
  }, []);

  const clearLogs = useCallback(() => {
    logsRef.current = [];
    actionIdCounter.current = 0;
    console.clear();
    console.log('🧹 Action logs cleared');
  }, []);

  const getStats = useCallback(() => {
    const actionCounts = logsRef.current.reduce((acc: Record<string, number>, action: RiverAction) => {
      acc[action.type] = (acc[action.type] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);

    const errors = logsRef.current.filter((a: RiverAction) => a.error).length;

    return {
      total: logsRef.current.length,
      byType: actionCounts,
      errors,
    };
  }, []);

  const exportLogs = useCallback((format: 'json' | 'text' = 'json') => {
    if (format === 'json') {
      return JSON.stringify(logsRef.current, null, 2);
    }

    // Text format (Maya-style commands)
    return logsRef.current.map((action: RiverAction) => {
      const diff = getSnapshotDiff(action.graphBefore, action.graphAfter);
      return `[${action.time}] ${action.type} - ${action.description} | ${diff}`;
    }).join('\n');
  }, []);

  return {
    log,
    getLogs,
    clearLogs,
    getStats,
    exportLogs,
  };
};

// Helper functions
function getActionEmoji(type: ActionType): string {
  const emojiMap: Record<ActionType, string> = {
    ADD_NODE: '➕',
    MOVE_NODE: '🔄',
    DELETE_NODE: '🗑️',
    CREATE_SPLINE: '🆕',
    DELETE_SPLINE: '❌',
    ATTACH_TRIBUTARY: '🔗',
    DETACH_TRIBUTARY: '🔓',
    MERGE_NODES: '🔀',
    MERGE_SPLINES: '🔗',
    SPLIT_SPLINE: '✂️',
    UPDATE_WIDTH: '📏',
    EXTEND_UPSTREAM: '⬆️',
    EXTEND_DOWNSTREAM: '⬇️',
    INSERT_NODE: '📌',
    BEGIN_NEW_RIVER: '🌊',
  };
  return emojiMap[type] || '🔍';
}

function getSnapshotDiff(before: GraphSnapshot, after: GraphSnapshot): string {
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
}
