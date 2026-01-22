import { useState, useCallback, useRef } from 'react';

export interface OptimisticAction<T> {
  id: string;
  type: string;
  data: T;
  timestamp: number;
  status: 'pending' | 'confirmed' | 'failed';
}

export interface UseOptimisticUIOptions<T> {
  onAction?: (action: OptimisticAction<T>) => Promise<void>;
  rollbackDelay?: number;
}

export function useOptimisticUI<T>(options?: UseOptimisticUIOptions<T>) {
  const [pendingActions, setPendingActions] = useState<Map<string, OptimisticAction<T>>>(new Map());
  const actionIdRef = useRef(0);

  // Create an optimistic action that updates UI immediately
  const executeOptimistic = useCallback(async (
    type: string,
    data: T,
    serverAction: () => Promise<void>
  ): Promise<{ success: boolean; rollback: () => void }> => {
    const actionId = `opt_${++actionIdRef.current}_${Date.now()}`;
    
    const action: OptimisticAction<T> = {
      id: actionId,
      type,
      data,
      timestamp: Date.now(),
      status: 'pending',
    };

    // Add to pending actions immediately
    setPendingActions(prev => new Map(prev).set(actionId, action));

    let rollbackFn: (() => void) | null = null;

    try {
      // Execute server action
      await serverAction();
      
      // Mark as confirmed
      setPendingActions(prev => {
        const next = new Map(prev);
        const existing = next.get(actionId);
        if (existing) {
          next.set(actionId, { ...existing, status: 'confirmed' });
        }
        return next;
      });

      // Clean up confirmed action after a delay
      setTimeout(() => {
        setPendingActions(prev => {
          const next = new Map(prev);
          next.delete(actionId);
          return next;
        });
      }, 1000);

      options?.onAction?.(action);

      return {
        success: true,
        rollback: () => {
          setPendingActions(prev => {
            const next = new Map(prev);
            next.delete(actionId);
            return next;
          });
        },
      };
    } catch (error) {
      // Mark as failed
      setPendingActions(prev => {
        const next = new Map(prev);
        const existing = next.get(actionId);
        if (existing) {
          next.set(actionId, { ...existing, status: 'failed' });
        }
        return next;
      });

      // Auto rollback after delay
      setTimeout(() => {
        setPendingActions(prev => {
          const next = new Map(prev);
          next.delete(actionId);
          return next;
        });
      }, options?.rollbackDelay ?? 3000);

      return {
        success: false,
        rollback: () => {
          setPendingActions(prev => {
            const next = new Map(prev);
            next.delete(actionId);
            return next;
          });
        },
      };
    }
  }, [options]);

  // Check if an action type is pending
  const isActionPending = useCallback((type: string): boolean => {
    for (const action of pendingActions.values()) {
      if (action.type === type && action.status === 'pending') {
        return true;
      }
    }
    return false;
  }, [pendingActions]);

  // Get all pending actions of a type
  const getPendingActions = useCallback((type?: string): OptimisticAction<T>[] => {
    const actions: OptimisticAction<T>[] = [];
    for (const action of pendingActions.values()) {
      if (!type || action.type === type) {
        actions.push(action);
      }
    }
    return actions;
  }, [pendingActions]);

  // Clear all pending actions
  const clearPending = useCallback(() => {
    setPendingActions(new Map());
  }, []);

  return {
    executeOptimistic,
    isActionPending,
    getPendingActions,
    clearPending,
    pendingCount: pendingActions.size,
  };
}

// Optimistic state wrapper for simpler use cases
export function useOptimisticState<T>(
  initialValue: T,
  serverSync?: (value: T) => Promise<void>
): [T, (value: T) => void, boolean] {
  const [value, setValue] = useState<T>(initialValue);
  const [isPending, setIsPending] = useState(false);
  const previousValueRef = useRef<T>(initialValue);

  const setOptimisticValue = useCallback(async (newValue: T) => {
    previousValueRef.current = value;
    setValue(newValue);
    
    if (serverSync) {
      setIsPending(true);
      try {
        await serverSync(newValue);
      } catch (error) {
        // Rollback on failure
        setValue(previousValueRef.current);
        console.warn('Optimistic update failed, rolling back:', error);
      } finally {
        setIsPending(false);
      }
    }
  }, [value, serverSync]);

  return [value, setOptimisticValue, isPending];
}

export default useOptimisticUI;
