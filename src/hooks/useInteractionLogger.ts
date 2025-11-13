/**
 * Hook for logging user interactions
 *
 * Helps debug complex interaction flows by recording all user actions
 * with timestamps and context.
 */

import { useCallback, useRef } from 'react';

export interface InteractionLog {
  timestamp: number;
  time: string;
  action: string;
  details: Record<string, any>;
}

export const useInteractionLogger = (enabled: boolean = true) => {
  const logsRef = useRef<InteractionLog[]>([]);
  const sessionStartTime = useRef(Date.now());

  const log = useCallback((action: string, details: Record<string, any> = {}) => {
    if (!enabled) return;

    const now = Date.now();
    const elapsed = now - sessionStartTime.current;
    const timestamp = now;
    const time = new Date(now).toISOString().split('T')[1].split('.')[0];

    const logEntry: InteractionLog = {
      timestamp,
      time,
      action,
      details,
    };

    logsRef.current.push(logEntry);

    // Console output with formatting
    const prefix = `🔍 [${time}] [+${(elapsed / 1000).toFixed(2)}s]`;
    console.group(`${prefix} ${action}`);

    if (Object.keys(details).length > 0) {
      Object.entries(details).forEach(([key, value]) => {
        console.log(`  ${key}:`, value);
      });
    }

    console.groupEnd();

    // Keep only last 100 logs to avoid memory issues
    if (logsRef.current.length > 100) {
      logsRef.current = logsRef.current.slice(-100);
    }
  }, [enabled]);

  const getLogs = useCallback(() => {
    return [...logsRef.current];
  }, []);

  const clearLogs = useCallback(() => {
    logsRef.current = [];
    sessionStartTime.current = Date.now();
    console.clear();
    console.log('🔍 Interaction logs cleared');
  }, []);

  const printSummary = useCallback(() => {
    console.group('📊 Interaction Summary');
    console.log(`Total interactions: ${logsRef.current.length}`);

    const actionCounts = logsRef.current.reduce((acc, log) => {
      acc[log.action] = (acc[log.action] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);

    console.table(actionCounts);
    console.groupEnd();
  }, []);

  const exportLogs = useCallback(() => {
    const data = JSON.stringify(logsRef.current, null, 2);
    console.log('📋 Exported logs (copy from console):');
    console.log(data);
    return data;
  }, []);

  return {
    log,
    getLogs,
    clearLogs,
    printSummary,
    exportLogs,
  };
};
