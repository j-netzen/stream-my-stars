import { useState, useRef, useCallback, useEffect, TouchEvent } from "react";

interface UsePullToRefreshOptions {
  onRefresh: () => Promise<void> | void;
  threshold?: number;
  maxPull?: number;
}

export function usePullToRefresh({
  onRefresh,
  threshold = 80,
  maxPull = 120,
}: UsePullToRefreshOptions) {
  const [pullDistance, setPullDistance] = useState(0);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isPulling, setIsPulling] = useState(false);
  const startY = useRef(0);
  const containerRef = useRef<HTMLDivElement>(null);

  const handleTouchStart = useCallback((e: TouchEvent<HTMLDivElement>) => {
    // Only start pull if at top of scroll
    const container = containerRef.current;
    if (!container || container.scrollTop > 0 || isRefreshing) return;
    
    startY.current = e.touches[0].clientY;
    setIsPulling(true);
  }, [isRefreshing]);

  const handleTouchMove = useCallback((e: TouchEvent<HTMLDivElement>) => {
    if (!isPulling || isRefreshing) return;
    
    const container = containerRef.current;
    if (!container || container.scrollTop > 0) {
      setPullDistance(0);
      return;
    }

    const currentY = e.touches[0].clientY;
    const diff = currentY - startY.current;

    if (diff > 0) {
      // Apply resistance - pull gets harder as you go
      const resistance = 0.5;
      const distance = Math.min(diff * resistance, maxPull);
      setPullDistance(distance);
      
      // Prevent default scroll when pulling
      if (distance > 10) {
        e.preventDefault();
      }
    }
  }, [isPulling, isRefreshing, maxPull]);

  const handleTouchEnd = useCallback(async () => {
    if (!isPulling) return;
    
    setIsPulling(false);

    if (pullDistance >= threshold && !isRefreshing) {
      setIsRefreshing(true);
      setPullDistance(threshold); // Hold at threshold during refresh
      
      try {
        await onRefresh();
      } catch (error) {
        console.error("Refresh failed:", error);
      }
      
      setIsRefreshing(false);
    }
    
    setPullDistance(0);
  }, [isPulling, pullDistance, threshold, isRefreshing, onRefresh]);

  // Reset on unmount
  useEffect(() => {
    return () => {
      setPullDistance(0);
      setIsRefreshing(false);
      setIsPulling(false);
    };
  }, []);

  const progress = Math.min(pullDistance / threshold, 1);
  const shouldTrigger = pullDistance >= threshold;

  return {
    containerRef,
    pullDistance,
    isRefreshing,
    isPulling,
    progress,
    shouldTrigger,
    handlers: {
      onTouchStart: handleTouchStart,
      onTouchMove: handleTouchMove,
      onTouchEnd: handleTouchEnd,
    },
  };
}