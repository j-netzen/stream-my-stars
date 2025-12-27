import { useCallback, useEffect, useRef } from "react";
import { useTVMode } from "./useTVMode";

interface FocusableSection {
  id: string;
  element: HTMLElement;
  priority: number;
}

/**
 * Enhanced TV navigation hook that provides comprehensive 
 * directional navigation for TV remotes
 */
export function useTVNavigation() {
  const { isTVMode } = useTVMode();
  const lastFocusedRef = useRef<HTMLElement | null>(null);

  // Get all focusable elements in a container
  const getFocusableElements = useCallback((container?: HTMLElement | null): HTMLElement[] => {
    const root = container || document.body;
    const selector = [
      'a[href]:not([disabled]):not([tabindex="-1"])',
      'button:not([disabled]):not([tabindex="-1"])',
      '[tabindex="0"]',
      'input:not([disabled]):not([tabindex="-1"])',
      'select:not([disabled]):not([tabindex="-1"])',
      'textarea:not([disabled]):not([tabindex="-1"])',
    ].join(', ');

    return Array.from(root.querySelectorAll<HTMLElement>(selector))
      .filter(el => {
        // Must be visible
        if (el.offsetParent === null && getComputedStyle(el).position !== 'fixed') return false;
        // Must have dimensions
        const rect = el.getBoundingClientRect();
        if (rect.width === 0 || rect.height === 0) return false;
        return true;
      });
  }, []);

  // Find the nearest focusable element in a given direction
  const findNearestInDirection = useCallback((
    current: HTMLElement,
    direction: 'up' | 'down' | 'left' | 'right',
    elements: HTMLElement[]
  ): HTMLElement | null => {
    const currentRect = current.getBoundingClientRect();
    const currentCenterX = currentRect.left + currentRect.width / 2;
    const currentCenterY = currentRect.top + currentRect.height / 2;

    let candidates: { element: HTMLElement; distance: number; alignment: number }[] = [];

    elements.forEach(el => {
      if (el === current) return;
      
      const rect = el.getBoundingClientRect();
      const centerX = rect.left + rect.width / 2;
      const centerY = rect.top + rect.height / 2;

      let isInDirection = false;
      let primaryDistance = 0;
      let alignment = 0;

      switch (direction) {
        case 'up':
          isInDirection = rect.bottom <= currentRect.top + 5;
          primaryDistance = currentRect.top - rect.bottom;
          alignment = Math.abs(centerX - currentCenterX);
          break;
        case 'down':
          isInDirection = rect.top >= currentRect.bottom - 5;
          primaryDistance = rect.top - currentRect.bottom;
          alignment = Math.abs(centerX - currentCenterX);
          break;
        case 'left':
          isInDirection = rect.right <= currentRect.left + 5;
          primaryDistance = currentRect.left - rect.right;
          alignment = Math.abs(centerY - currentCenterY);
          break;
        case 'right':
          isInDirection = rect.left >= currentRect.right - 5;
          primaryDistance = rect.left - currentRect.right;
          alignment = Math.abs(centerY - currentCenterY);
          break;
      }

      if (isInDirection && primaryDistance >= 0) {
        candidates.push({
          element: el,
          distance: primaryDistance,
          alignment
        });
      }
    });

    if (candidates.length === 0) return null;

    // Sort by alignment first (prefer elements more directly in line), then by distance
    candidates.sort((a, b) => {
      // Weight alignment more heavily for horizontal movement (rows)
      const alignmentWeight = direction === 'up' || direction === 'down' ? 0.3 : 0.5;
      const scoreA = a.distance + a.alignment * alignmentWeight;
      const scoreB = b.distance + b.alignment * alignmentWeight;
      return scoreA - scoreB;
    });

    return candidates[0]?.element || null;
  }, []);

  // Main navigation handler
  const handleNavigation = useCallback((e: KeyboardEvent) => {
    if (!isTVMode) return;

    // Don't handle if in an input
    const activeElement = document.activeElement as HTMLElement;
    if (
      activeElement instanceof HTMLInputElement ||
      activeElement instanceof HTMLTextAreaElement ||
      activeElement instanceof HTMLSelectElement
    ) {
      // Allow Enter/Escape in inputs
      if (e.key !== 'Enter' && e.key !== 'Escape') return;
    }

    const directionMap: Record<string, 'up' | 'down' | 'left' | 'right'> = {
      'ArrowUp': 'up',
      'ArrowDown': 'down',
      'ArrowLeft': 'left',
      'ArrowRight': 'right'
    };

    const direction = directionMap[e.key];
    
    if (direction) {
      const allFocusable = getFocusableElements();
      
      // If nothing focused, focus first element
      if (!activeElement || !allFocusable.includes(activeElement)) {
        if (allFocusable.length > 0) {
          e.preventDefault();
          allFocusable[0].focus();
          allFocusable[0].scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'nearest' });
        }
        return;
      }

      const nextElement = findNearestInDirection(activeElement, direction, allFocusable);
      
      if (nextElement) {
        e.preventDefault();
        nextElement.focus();
        nextElement.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'nearest' });
        lastFocusedRef.current = nextElement;
      }
    }

    // Enter key to activate
    if (e.key === 'Enter' || e.key === ' ') {
      if (activeElement && activeElement.click) {
        // Let the element handle it naturally for buttons/links
        // Only manually click for tabindex elements
        if (activeElement.getAttribute('tabindex') === '0' && 
            !(activeElement instanceof HTMLButtonElement) &&
            !(activeElement instanceof HTMLAnchorElement)) {
          e.preventDefault();
          activeElement.click();
        }
      }
    }

    // Escape to go back or close dialogs
    if (e.key === 'Escape') {
      // Check for open dialogs first
      const dialog = document.querySelector('[role="dialog"]');
      if (dialog) {
        // Find close button in dialog
        const closeButton = dialog.querySelector<HTMLElement>('[data-close], [aria-label="Close"], button:has(.lucide-x)');
        if (closeButton) {
          e.preventDefault();
          closeButton.click();
          return;
        }
      }

      // Focus sidebar if in main content
      const sidebar = document.querySelector('[data-sidebar="true"]');
      const isInSidebar = sidebar?.contains(activeElement);
      
      if (!isInSidebar && sidebar) {
        const activeNavLink = sidebar.querySelector<HTMLElement>('a.sidebar-active') ||
                             sidebar.querySelector<HTMLElement>('a[href]');
        if (activeNavLink) {
          e.preventDefault();
          activeNavLink.focus();
        }
      }
    }

    // Back button (common on TV remotes, mapped to Backspace)
    if (e.key === 'Backspace') {
      // Navigate back if not in input
      if (!(activeElement instanceof HTMLInputElement) &&
          !(activeElement instanceof HTMLTextAreaElement)) {
        e.preventDefault();
        window.history.back();
      }
    }
  }, [isTVMode, getFocusableElements, findNearestInDirection]);

  // Set up global listener
  useEffect(() => {
    if (!isTVMode) return;

    window.addEventListener('keydown', handleNavigation, true);
    return () => window.removeEventListener('keydown', handleNavigation, true);
  }, [isTVMode, handleNavigation]);

  // Focus restoration
  const restoreFocus = useCallback(() => {
    if (lastFocusedRef.current && document.body.contains(lastFocusedRef.current)) {
      lastFocusedRef.current.focus();
    } else {
      // Focus first focusable in main content
      const main = document.querySelector('main');
      const focusable = getFocusableElements(main as HTMLElement);
      if (focusable.length > 0) {
        focusable[0].focus();
      }
    }
  }, [getFocusableElements]);

  return {
    restoreFocus,
    getFocusableElements
  };
}

/**
 * Hook to make a container navigable with focus management
 */
export function useFocusContainer(containerRef: React.RefObject<HTMLElement>) {
  const { isTVMode } = useTVMode();

  useEffect(() => {
    if (!isTVMode || !containerRef.current) return;

    // Ensure container has proper focus management
    const container = containerRef.current;
    
    // Auto-focus first element when container becomes visible
    const observer = new IntersectionObserver((entries) => {
      entries.forEach(entry => {
        if (entry.isIntersecting) {
          const focusable = container.querySelector<HTMLElement>(
            'button:not([disabled]), [tabindex="0"], a[href]'
          );
          if (focusable && !document.activeElement?.closest('[role="dialog"]')) {
            // Only auto-focus if nothing in a dialog is focused
            const activeInContainer = container.contains(document.activeElement);
            if (!activeInContainer) {
              // Delay to ensure content is rendered
              setTimeout(() => focusable.focus(), 100);
            }
          }
        }
      });
    });

    observer.observe(container);
    return () => observer.disconnect();
  }, [isTVMode, containerRef]);
}
