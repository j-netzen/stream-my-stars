import { useEffect, useCallback, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";

interface UseRemoteNavigationOptions {
  containerRef: React.RefObject<HTMLElement>;
  selector?: string;
  onSelect?: (element: HTMLElement) => void;
  enabled?: boolean;
}

export function useRemoteNavigation({
  containerRef,
  selector = "[data-focusable]",
  onSelect,
  enabled = true,
}: UseRemoteNavigationOptions) {
  const currentIndexRef = useRef<number>(-1);

  const getFocusableElements = useCallback(() => {
    if (!containerRef.current) return [];
    return Array.from(containerRef.current.querySelectorAll<HTMLElement>(selector));
  }, [containerRef, selector]);

  const focusElement = useCallback((index: number) => {
    const elements = getFocusableElements();
    if (elements.length === 0) return;

    // Clamp index
    const newIndex = Math.max(0, Math.min(index, elements.length - 1));
    currentIndexRef.current = newIndex;

    const element = elements[newIndex];
    if (element) {
      element.focus();
      element.scrollIntoView({ behavior: "smooth", block: "nearest", inline: "center" });
    }
  }, [getFocusableElements]);

  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    if (!enabled) return;

    const elements = getFocusableElements();
    if (elements.length === 0) return;

    // Find currently focused element index
    const activeElement = document.activeElement as HTMLElement;
    const currentIndex = elements.indexOf(activeElement);
    
    if (currentIndex !== -1) {
      currentIndexRef.current = currentIndex;
    }

    // Calculate grid dimensions (approximate based on visible elements)
    const firstElement = elements[0];
    const containerWidth = containerRef.current?.clientWidth || window.innerWidth;
    const elementWidth = firstElement?.offsetWidth || 200;
    const itemsPerRow = Math.floor(containerWidth / elementWidth) || 1;

    switch (e.key) {
      case "ArrowRight":
        e.preventDefault();
        focusElement(currentIndexRef.current + 1);
        break;
      case "ArrowLeft":
        e.preventDefault();
        focusElement(currentIndexRef.current - 1);
        break;
      case "ArrowDown":
        e.preventDefault();
        focusElement(currentIndexRef.current + itemsPerRow);
        break;
      case "ArrowUp":
        e.preventDefault();
        focusElement(currentIndexRef.current - itemsPerRow);
        break;
      case "Enter":
      case " ":
        if (activeElement && elements.includes(activeElement)) {
          e.preventDefault();
          onSelect?.(activeElement);
          activeElement.click();
        }
        break;
    }
  }, [enabled, getFocusableElements, focusElement, containerRef, onSelect]);

  useEffect(() => {
    if (!enabled) return;

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [enabled, handleKeyDown]);

  // Focus first element on mount
  const focusFirst = useCallback(() => {
    focusElement(0);
  }, [focusElement]);

  return { focusFirst, focusElement };
}

// Global navigation hook for page-level navigation
export function useGlobalRemoteNavigation() {
  const navigate = useNavigate();

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Handle Back button (Escape or Backspace)
      if (e.key === "Escape" || e.key === "Backspace") {
        // Don't interfere with inputs
        const activeElement = document.activeElement as HTMLElement;
        if (activeElement.tagName === "INPUT" || activeElement.tagName === "TEXTAREA") {
          return;
        }
        
        // Check if there's an open dialog/modal - close it first
        const openDialog = document.querySelector('[role="dialog"][data-state="open"]');
        if (openDialog) {
          // Let the dialog handle the escape key
          return;
        }
        
        e.preventDefault();
        navigate(-1);
        return;
      }

      const focusableSelector = "[data-focusable], button:not([disabled]), [tabindex]:not([tabindex='-1']), a[href], input:not([disabled]), select:not([disabled])";
      const focusableElements = Array.from(document.querySelectorAll<HTMLElement>(focusableSelector))
        .filter(el => {
          const style = window.getComputedStyle(el);
          return style.display !== "none" && style.visibility !== "hidden" && el.offsetParent !== null;
        });

      if (focusableElements.length === 0) return;

      const activeElement = document.activeElement as HTMLElement;
      const currentIndex = focusableElements.indexOf(activeElement);

      // Get element positions for spatial navigation
      const getElementCenter = (el: HTMLElement) => {
        const rect = el.getBoundingClientRect();
        return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
      };

      const findClosestElement = (
        current: HTMLElement,
        direction: "up" | "down" | "left" | "right"
      ) => {
        const currentCenter = getElementCenter(current);
        let closest: HTMLElement | null = null;
        let closestDistance = Infinity;

        for (const el of focusableElements) {
          if (el === current) continue;

          const elCenter = getElementCenter(el);
          const dx = elCenter.x - currentCenter.x;
          const dy = elCenter.y - currentCenter.y;

          // Check if element is in the correct direction
          let isInDirection = false;
          switch (direction) {
            case "up":
              isInDirection = dy < -10;
              break;
            case "down":
              isInDirection = dy > 10;
              break;
            case "left":
              isInDirection = dx < -10;
              break;
            case "right":
              isInDirection = dx > 10;
              break;
          }

          if (!isInDirection) continue;

          // Calculate distance with preference for elements in primary direction
          const primaryWeight = direction === "up" || direction === "down" ? Math.abs(dy) : Math.abs(dx);
          const secondaryWeight = direction === "up" || direction === "down" ? Math.abs(dx) : Math.abs(dy);
          const distance = primaryWeight + secondaryWeight * 0.5;

          if (distance < closestDistance) {
            closestDistance = distance;
            closest = el;
          }
        }

        return closest;
      };

      switch (e.key) {
        case "ArrowRight":
        case "ArrowLeft":
        case "ArrowDown":
        case "ArrowUp": {
          // Don't interfere with inputs
          if (activeElement.tagName === "INPUT" || activeElement.tagName === "TEXTAREA") {
            return;
          }

          e.preventDefault();

          const direction = e.key.replace("Arrow", "").toLowerCase() as "up" | "down" | "left" | "right";
          
          if (currentIndex === -1) {
            // No element focused, focus first
            focusableElements[0]?.focus();
          } else {
            const nextElement = findClosestElement(activeElement, direction);
            if (nextElement) {
              nextElement.focus();
              nextElement.scrollIntoView({ behavior: "smooth", block: "nearest", inline: "center" });
            }
          }
          break;
        }
      }
    };

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [navigate]);
}

// Hook to track focused element info for indicator
export function useFocusIndicator() {
  const [focusedInfo, setFocusedInfo] = useState<{
    label: string;
    hint: string;
  } | null>(null);

  useEffect(() => {
    const handleFocus = (e: FocusEvent) => {
      const target = e.target as HTMLElement;
      
      // Get label from aria-label, data-label, or text content
      const label = target.getAttribute("aria-label") 
        || target.getAttribute("data-label")
        || target.closest("[data-focusable]")?.getAttribute("aria-label")
        || target.textContent?.trim().slice(0, 50)
        || "";
      
      if (label && (target.hasAttribute("data-focusable") || target.closest("[data-focusable]"))) {
        setFocusedInfo({
          label,
          hint: "Press Enter to select"
        });
      }
    };

    const handleBlur = () => {
      // Small delay to check if focus moved to another element
      setTimeout(() => {
        const activeEl = document.activeElement;
        if (!activeEl || activeEl === document.body) {
          setFocusedInfo(null);
        }
      }, 100);
    };

    document.addEventListener("focusin", handleFocus);
    document.addEventListener("focusout", handleBlur);
    
    return () => {
      document.removeEventListener("focusin", handleFocus);
      document.removeEventListener("focusout", handleBlur);
    };
  }, []);

  return focusedInfo;
}
