import { useRef, useEffect, useCallback } from "react";

interface UseHorizontalScrollOptions {
  scrollSpeed?: number;
}

export function useHorizontalScroll<T extends HTMLElement>(options?: UseHorizontalScrollOptions) {
  const scrollRef = useRef<T>(null);
  const isDragging = useRef(false);
  const startX = useRef(0);
  const scrollLeft = useRef(0);
  const velocity = useRef(0);
  const lastX = useRef(0);
  const lastTime = useRef(0);
  const animationFrame = useRef<number>();

  const { scrollSpeed = 1 } = options || {};

  // Mouse wheel horizontal scroll
  const handleWheel = useCallback((e: WheelEvent) => {
    if (!scrollRef.current) return;
    
    // Prevent default vertical scroll
    e.preventDefault();
    
    // Use deltaY for horizontal scroll (most common scroll direction)
    scrollRef.current.scrollLeft += e.deltaY * scrollSpeed;
  }, [scrollSpeed]);

  // Mouse drag start
  const handleMouseDown = useCallback((e: MouseEvent) => {
    if (!scrollRef.current) return;
    
    isDragging.current = true;
    startX.current = e.pageX - scrollRef.current.offsetLeft;
    scrollLeft.current = scrollRef.current.scrollLeft;
    velocity.current = 0;
    lastX.current = e.pageX;
    lastTime.current = Date.now();
    
    scrollRef.current.style.cursor = 'grabbing';
    scrollRef.current.style.userSelect = 'none';
    
    // Cancel any ongoing momentum animation
    if (animationFrame.current) {
      cancelAnimationFrame(animationFrame.current);
    }
  }, []);

  // Mouse drag move
  const handleMouseMove = useCallback((e: MouseEvent) => {
    if (!isDragging.current || !scrollRef.current) return;
    
    e.preventDefault();
    
    const x = e.pageX - scrollRef.current.offsetLeft;
    const walk = (x - startX.current) * 1.5; // Scroll speed multiplier
    scrollRef.current.scrollLeft = scrollLeft.current - walk;
    
    // Calculate velocity for momentum
    const now = Date.now();
    const dt = now - lastTime.current;
    if (dt > 0) {
      velocity.current = (e.pageX - lastX.current) / dt;
    }
    lastX.current = e.pageX;
    lastTime.current = now;
  }, []);

  // Mouse drag end with momentum
  const handleMouseUp = useCallback(() => {
    if (!scrollRef.current) return;
    
    isDragging.current = false;
    scrollRef.current.style.cursor = 'grab';
    scrollRef.current.style.userSelect = '';
    
    // Apply momentum scrolling
    const momentum = () => {
      if (!scrollRef.current || Math.abs(velocity.current) < 0.01) return;
      
      scrollRef.current.scrollLeft -= velocity.current * 16; // 16ms frame
      velocity.current *= 0.95; // Friction
      
      animationFrame.current = requestAnimationFrame(momentum);
    };
    
    momentum();
  }, []);

  // Touch start
  const handleTouchStart = useCallback((e: TouchEvent) => {
    if (!scrollRef.current || e.touches.length !== 1) return;
    
    isDragging.current = true;
    startX.current = e.touches[0].pageX - scrollRef.current.offsetLeft;
    scrollLeft.current = scrollRef.current.scrollLeft;
    velocity.current = 0;
    lastX.current = e.touches[0].pageX;
    lastTime.current = Date.now();
    
    if (animationFrame.current) {
      cancelAnimationFrame(animationFrame.current);
    }
  }, []);

  // Touch move
  const handleTouchMove = useCallback((e: TouchEvent) => {
    if (!isDragging.current || !scrollRef.current || e.touches.length !== 1) return;
    
    const x = e.touches[0].pageX - scrollRef.current.offsetLeft;
    const walk = (x - startX.current) * 1.2;
    scrollRef.current.scrollLeft = scrollLeft.current - walk;
    
    // Calculate velocity
    const now = Date.now();
    const dt = now - lastTime.current;
    if (dt > 0) {
      velocity.current = (e.touches[0].pageX - lastX.current) / dt;
    }
    lastX.current = e.touches[0].pageX;
    lastTime.current = now;
  }, []);

  // Touch end with momentum
  const handleTouchEnd = useCallback(() => {
    isDragging.current = false;
    
    // Apply momentum scrolling
    const momentum = () => {
      if (!scrollRef.current || Math.abs(velocity.current) < 0.01) return;
      
      scrollRef.current.scrollLeft -= velocity.current * 16;
      velocity.current *= 0.92; // Friction for touch (slightly less than mouse)
      
      animationFrame.current = requestAnimationFrame(momentum);
    };
    
    momentum();
  }, []);

  useEffect(() => {
    const element = scrollRef.current;
    if (!element) return;

    // Set initial cursor style
    element.style.cursor = 'grab';

    // Add event listeners
    element.addEventListener('wheel', handleWheel, { passive: false });
    element.addEventListener('mousedown', handleMouseDown);
    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
    element.addEventListener('touchstart', handleTouchStart, { passive: true });
    element.addEventListener('touchmove', handleTouchMove, { passive: true });
    element.addEventListener('touchend', handleTouchEnd);

    return () => {
      element.removeEventListener('wheel', handleWheel);
      element.removeEventListener('mousedown', handleMouseDown);
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
      element.removeEventListener('touchstart', handleTouchStart);
      element.removeEventListener('touchmove', handleTouchMove);
      element.removeEventListener('touchend', handleTouchEnd);
      
      if (animationFrame.current) {
        cancelAnimationFrame(animationFrame.current);
      }
    };
  }, [handleWheel, handleMouseDown, handleMouseMove, handleMouseUp, handleTouchStart, handleTouchMove, handleTouchEnd]);

  return scrollRef;
}
