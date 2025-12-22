import { useCallback, useEffect, useRef } from "react";
import { useTVMode } from "./useTVMode";

interface UseKeyboardNavigationOptions {
  containerRef: React.RefObject<HTMLElement>;
  selector?: string;
  enabled?: boolean;
  onSelect?: (element: HTMLElement) => void;
  loop?: boolean;
}

export function useKeyboardNavigation({
  containerRef,
  selector = '[tabindex="0"], button:not([disabled]), a[href], input:not([disabled]), select:not([disabled])',
  enabled = true,
  onSelect,
  loop = false,
}: UseKeyboardNavigationOptions) {
  const { isTVMode } = useTVMode();
  const currentIndexRef = useRef(0);

  const getFocusableElements = useCallback(() => {
    if (!containerRef.current) return [];
    return Array.from(containerRef.current.querySelectorAll<HTMLElement>(selector)).filter(
      (el) => el.offsetParent !== null // Only visible elements
    );
  }, [containerRef, selector]);

  const getGridDimensions = useCallback((elements: HTMLElement[]) => {
    if (elements.length === 0) return { columns: 0, rows: 0 };
    
    // Group elements by their top position to determine columns
    const rows = new Map<number, HTMLElement[]>();
    elements.forEach((el) => {
      const rect = el.getBoundingClientRect();
      const top = Math.round(rect.top);
      if (!rows.has(top)) rows.set(top, []);
      rows.get(top)!.push(el);
    });
    
    const rowArray = Array.from(rows.values());
    const maxColumns = Math.max(...rowArray.map((r) => r.length));
    
    return { columns: maxColumns, rows: rowArray.length };
  }, []);

  const focusElement = useCallback((index: number, elements: HTMLElement[]) => {
    if (index >= 0 && index < elements.length) {
      elements[index].focus();
      currentIndexRef.current = index;
      
      // Scroll element into view smoothly
      elements[index].scrollIntoView({
        behavior: "smooth",
        block: "nearest",
        inline: "nearest",
      });
    }
  }, []);

  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (!enabled || !isTVMode) return;
      
      // Don't interfere with inputs
      const activeElement = document.activeElement;
      if (
        activeElement instanceof HTMLInputElement ||
        activeElement instanceof HTMLTextAreaElement ||
        activeElement instanceof HTMLSelectElement
      ) {
        return;
      }

      const elements = getFocusableElements();
      if (elements.length === 0) return;

      // Find current focused element index
      const currentIndex = elements.findIndex((el) => el === document.activeElement);
      if (currentIndex === -1 && !["ArrowDown", "ArrowUp", "ArrowLeft", "ArrowRight"].includes(e.key)) {
        return;
      }

      const { columns } = getGridDimensions(elements);
      let nextIndex = currentIndex === -1 ? 0 : currentIndex;

      switch (e.key) {
        case "ArrowRight":
          e.preventDefault();
          nextIndex = currentIndex + 1;
          if (nextIndex >= elements.length) {
            nextIndex = loop ? 0 : elements.length - 1;
          }
          focusElement(nextIndex, elements);
          break;

        case "ArrowLeft":
          e.preventDefault();
          nextIndex = currentIndex - 1;
          if (nextIndex < 0) {
            nextIndex = loop ? elements.length - 1 : 0;
          }
          focusElement(nextIndex, elements);
          break;

        case "ArrowDown":
          e.preventDefault();
          // Move down by the number of columns (for grid navigation)
          nextIndex = currentIndex + columns;
          if (nextIndex >= elements.length) {
            if (loop) {
              nextIndex = currentIndex % columns;
            } else {
              nextIndex = Math.min(currentIndex, elements.length - 1);
            }
          }
          focusElement(nextIndex, elements);
          break;

        case "ArrowUp":
          e.preventDefault();
          // Move up by the number of columns (for grid navigation)
          nextIndex = currentIndex - columns;
          if (nextIndex < 0) {
            if (loop) {
              const lastRowStart = Math.floor((elements.length - 1) / columns) * columns;
              nextIndex = Math.min(lastRowStart + (currentIndex % columns), elements.length - 1);
            } else {
              nextIndex = Math.max(0, currentIndex);
            }
          }
          focusElement(nextIndex, elements);
          break;

        case "Enter":
        case " ":
          if (activeElement && elements.includes(activeElement as HTMLElement)) {
            // Don't prevent default - let the element handle its own click
            if (onSelect) {
              onSelect(activeElement as HTMLElement);
            }
          }
          break;
      }
    },
    [enabled, isTVMode, getFocusableElements, getGridDimensions, focusElement, loop, onSelect]
  );

  useEffect(() => {
    if (!enabled || !isTVMode) return;

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [enabled, isTVMode, handleKeyDown]);

  // Focus first element when container becomes available
  const focusFirst = useCallback(() => {
    const elements = getFocusableElements();
    if (elements.length > 0) {
      focusElement(0, elements);
    }
  }, [getFocusableElements, focusElement]);

  return { focusFirst };
}

// Global keyboard navigation for sidebar
export function useGlobalKeyboardNavigation() {
  const { isTVMode } = useTVMode();

  useEffect(() => {
    if (!isTVMode) return;

    const handleGlobalKeyDown = (e: KeyboardEvent) => {
      // Escape key to focus sidebar
      if (e.key === "Escape") {
        const sidebar = document.querySelector('[data-sidebar="true"]');
        const firstLink = sidebar?.querySelector('a[href]') as HTMLElement;
        if (firstLink) {
          e.preventDefault();
          firstLink.focus();
        }
      }

      // Tab key handling - ensure natural flow
      if (e.key === "Tab") {
        // Let default tab behavior work, but ensure focus is visible
        return;
      }
    };

    window.addEventListener("keydown", handleGlobalKeyDown);
    return () => window.removeEventListener("keydown", handleGlobalKeyDown);
  }, [isTVMode]);
}
