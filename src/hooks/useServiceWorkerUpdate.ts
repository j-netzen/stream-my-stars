import { useEffect, useCallback } from 'react';
import { toast } from 'sonner';

/**
 * Hook to handle service worker updates and clear stale caches
 * Automatically clears VideoPlayer chunks when a new version is detected
 */
export function useServiceWorkerUpdate() {
  const clearStaleCaches = useCallback(async () => {
    if (!('caches' in window)) return;
    
    try {
      const cacheNames = await caches.keys();
      
      for (const name of cacheNames) {
        // Clear JS chunks cache to ensure fresh modules
        if (name.includes('js-chunks') || name.includes('workbox')) {
          const cache = await caches.open(name);
          const keys = await cache.keys();
          
          for (const key of keys) {
            // Specifically target VideoPlayer and other lazy-loaded chunks
            if (key.url.includes('VideoPlayer') || 
                key.url.includes('video-player') ||
                key.url.includes('assets/') && key.url.endsWith('.js')) {
              await cache.delete(key);
              console.log('[SW Update] Cleared stale chunk:', key.url);
            }
          }
        }
      }
    } catch (error) {
      console.warn('[SW Update] Failed to clear caches:', error);
    }
  }, []);

  useEffect(() => {
    if (!('serviceWorker' in navigator)) return;

    const handleControllerChange = () => {
      console.log('[SW Update] New service worker activated');
      clearStaleCaches();
      
      // Notify user about the update
      toast.info('App updated!', {
        description: 'New version loaded. Enjoy the improvements!',
        duration: 3000,
      });
    };

    const handleUpdate = async (registration: ServiceWorkerRegistration) => {
      const waitingWorker = registration.waiting;
      
      if (waitingWorker) {
        console.log('[SW Update] New version available, activating...');
        
        // Clear caches before activating new SW
        await clearStaleCaches();
        
        // Tell the waiting SW to skip waiting and activate
        waitingWorker.postMessage({ type: 'SKIP_WAITING' });
      }
    };

    // Listen for new SW activation
    navigator.serviceWorker.addEventListener('controllerchange', handleControllerChange);

    // Check for updates on mount
    navigator.serviceWorker.ready.then((registration) => {
      // Check for updates periodically (every 30 minutes)
      const checkInterval = setInterval(() => {
        registration.update().catch(console.error);
      }, 30 * 60 * 1000);

      // Handle waiting SW
      if (registration.waiting) {
        handleUpdate(registration);
      }

      // Listen for new updates
      registration.addEventListener('updatefound', () => {
        const newWorker = registration.installing;
        
        if (newWorker) {
          newWorker.addEventListener('statechange', () => {
            if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
              handleUpdate(registration);
            }
          });
        }
      });

      return () => clearInterval(checkInterval);
    });

    return () => {
      navigator.serviceWorker.removeEventListener('controllerchange', handleControllerChange);
    };
  }, [clearStaleCaches]);
}
