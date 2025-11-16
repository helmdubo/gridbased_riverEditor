/**
 * Hook for managing Action Log panel state
 *
 * Provides simple show/hide control for ActionLogPanel component.
 *
 * @module hooks/useActionLog
 */

import { useState, useCallback } from 'react';

export interface UseActionLogResult {
  /** Whether the log panel is visible */
  isOpen: boolean;

  /** Show the log panel */
  open: () => void;

  /** Hide the log panel */
  close: () => void;

  /** Toggle log panel visibility */
  toggle: () => void;
}

/**
 * Hook for managing Action Log panel visibility
 *
 * @param initialOpen - Whether panel should be open initially (default: false)
 * @returns Object with panel state and control functions
 *
 * @example
 * ```tsx
 * const actionLog = useActionLog();
 *
 * return (
 *   <>
 *     <button onClick={actionLog.toggle}>
 *       {actionLog.isOpen ? 'Hide' : 'Show'} Echo Log
 *     </button>
 *     <ActionLogPanel
 *       isOpen={actionLog.isOpen}
 *       onClose={actionLog.close}
 *     />
 *   </>
 * );
 * ```
 */
export const useActionLog = (initialOpen: boolean = false): UseActionLogResult => {
  const [isOpen, setIsOpen] = useState(initialOpen);

  const open = useCallback(() => {
    setIsOpen(true);
  }, []);

  const close = useCallback(() => {
    setIsOpen(false);
  }, []);

  const toggle = useCallback(() => {
    setIsOpen((prev) => !prev);
  }, []);

  return {
    isOpen,
    open,
    close,
    toggle,
  };
};
