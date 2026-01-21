import { useCallback, useEffect, useRef } from "react";
import { useTVMode, InputMode } from "./useTVMode";
import { useNavigate, useLocation } from "react-router-dom";

interface FocusableSection {
  id: string;
  element: HTMLElement;
  priority: number;
}

/**
 * Enhanced TV navigation hook for Android TV (10-foot experience)
 * Provides:
 * - Spatial D-pad navigation (arrow keys)
 * - Enter key triggers click on focused elements
 * - Back button (Escape/Backspace) navigates back or closes modals
 * - Focus management with visible focus rings
 */
export function useTVNavigation() {
  const { isTVMode, inputMode } = useTVMode();
  const lastFocusedRef = useRef<HTMLElement | null>(null);
  const navigate = useNavigate();
  const location = useLocation();
  
  // Only enable keyboard navigation in D-pad mode
  const isKeyboardNavEnabled = isTVMode && inputMode === "dpad";

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

  // Close any open dialog
  const closeDialog = useCallback((): boolean => {
    // Check for Radix dialogs
    const dialogOverlay = document.querySelector('[data-radix-dialog-overlay]');
    if (dialogOverlay) {
      const closeButton = document.querySelector<HTMLElement>(
        '[data-radix-dialog-content] [data-close], ' +
        '[data-radix-dialog-content] button[aria-label="Close"], ' +
        '[data-radix-dialog-content] button:has(.lucide-x)'
      );
      if (closeButton) {
        closeButton.click();
        return true;
      }
      // Try pressing escape on the overlay
      dialogOverlay.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
      return true;
    }

    // Check for role="dialog" elements
    const dialog = document.querySelector('[role="dialog"]');
    if (dialog) {
      const closeButton = dialog.querySelector<HTMLElement>(
        '[data-close], [aria-label="Close"], button:has(.lucide-x)'
      );
      if (closeButton) {
        closeButton.click();
        return true;
      }
    }

    return false;
  }, []);

  // Main navigation handler
  const handleNavigation = useCallback((e: KeyboardEvent) => {
    // Only handle keyboard navigation when D-pad mode is active
    if (!isKeyboardNavEnabled) return;

    // Don't handle if a Radix select/dropdown is open - let it handle its own navigation
    const openSelect = document.querySelector('[data-radix-select-content]');
    const openDropdown = document.querySelector('[data-radix-dropdown-menu-content]');
    const openPopover = document.querySelector('[data-radix-popover-content]');
    const openRadixContent = openSelect || openDropdown || openPopover;
    
    if (openRadixContent) {
      // Handle PageUp/PageDown for faster navigation in dropdowns
      if (e.key === 'PageUp' || e.key === 'PageDown') {
        e.preventDefault();
        const items = openRadixContent.querySelectorAll<HTMLElement>('[data-radix-collection-item]');
        if (items.length === 0) return;
        
        const itemsArray = Array.from(items);
        const currentIndex = itemsArray.findIndex(item => 
          item.getAttribute('data-highlighted') === '' || 
          item.getAttribute('data-state') === 'checked' ||
          item === document.activeElement
        );
        
        const jumpAmount = 5;
        let newIndex: number;
        
        if (e.key === 'PageUp') {
          newIndex = Math.max(0, currentIndex - jumpAmount);
        } else {
          newIndex = Math.min(itemsArray.length - 1, currentIndex + jumpAmount);
        }
        
        const targetItem = itemsArray[newIndex];
        if (targetItem) {
          // Simulate arrow key presses to properly highlight the item
          const arrowKey = e.key === 'PageUp' ? 'ArrowUp' : 'ArrowDown';
          const stepsToMove = Math.abs(newIndex - currentIndex);
          
          for (let i = 0; i < stepsToMove; i++) {
            const arrowEvent = new KeyboardEvent('keydown', {
              key: arrowKey,
              bubbles: true,
              cancelable: true
            });
            openRadixContent.dispatchEvent(arrowEvent);
          }
          
          targetItem.scrollIntoView({ block: 'nearest' });
        }
        return;
      }
      
      // Only allow Escape to close the popup, let the component handle arrow keys
      if (e.key !== 'Escape' && e.key !== 'Backspace') return;
    }

    const activeElement = document.activeElement as HTMLElement;
    
    // Check if we're in an input field
    const isInInput = 
      activeElement instanceof HTMLInputElement ||
      activeElement instanceof HTMLTextAreaElement ||
      activeElement instanceof HTMLSelectElement;

    // Handle Back button (keyCode 8 = Backspace, keyCode 27 = Escape)
    // These should navigate back or close modals
    if (e.key === 'Escape' || e.key === 'Backspace' || e.keyCode === 8 || e.keyCode === 27) {
      // Don't intercept Backspace in input fields
      if (e.key === 'Backspace' && isInInput) return;
      
      e.preventDefault();
      
      // First try to close any open dialogs/modals
      if (closeDialog()) {
        return;
      }

      // Check for open popover/dropdown and close it
      if (openRadixContent) {
        const closeEvent = new KeyboardEvent('keydown', { key: 'Escape', bubbles: true });
        openRadixContent.dispatchEvent(closeEvent);
        return;
      }

      // Focus sidebar if in main content
      const sidebar = document.querySelector('[data-sidebar="true"]');
      const isInSidebar = sidebar?.contains(activeElement);
      
      if (!isInSidebar && sidebar) {
        const activeNavLink = sidebar.querySelector<HTMLElement>('a.sidebar-active') ||
                             sidebar.querySelector<HTMLElement>('a[href]');
        if (activeNavLink) {
          activeNavLink.focus();
          return;
        }
      }

      // Navigate back in history
      if (location.pathname !== '/') {
        navigate(-1);
      }
      return;
    }

    // Don't handle arrow keys in inputs
    if (isInInput) {
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

    // Enter key (keyCode 13) triggers click on focused element
    if (e.key === 'Enter' || e.keyCode === 13) {
      if (activeElement && activeElement.click) {
        // For tabindex elements that aren't naturally clickable, manually trigger click
        const isNativeClickable = 
          activeElement instanceof HTMLButtonElement ||
          activeElement instanceof HTMLAnchorElement ||
          activeElement instanceof HTMLInputElement;
        
        if (!isNativeClickable && activeElement.getAttribute('tabindex') === '0') {
          e.preventDefault();
          activeElement.click();
        }
        // Native elements handle Enter naturally - let them do their thing
      }
    }

    // Space key also activates (common for buttons)
    if (e.key === ' ' && !isInInput) {
      if (activeElement && activeElement.getAttribute('tabindex') === '0') {
        e.preventDefault();
        activeElement.click();
      }
    }
  }, [isKeyboardNavEnabled, getFocusableElements, findNearestInDirection, closeDialog, navigate, location.pathname]);

  // Set up global listener - only when D-pad mode is active
  useEffect(() => {
    if (!isKeyboardNavEnabled) return;

    window.addEventListener('keydown', handleNavigation, true);
    return () => window.removeEventListener('keydown', handleNavigation, true);
  }, [isKeyboardNavEnabled, handleNavigation]);

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
  const { isTVMode, inputMode } = useTVMode();
  const isKeyboardNavEnabled = isTVMode && inputMode === "dpad";

  useEffect(() => {
    if (!isKeyboardNavEnabled || !containerRef.current) return;

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
  }, [isKeyboardNavEnabled, containerRef]);
}
