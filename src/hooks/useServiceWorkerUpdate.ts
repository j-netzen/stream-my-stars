import { useEffect, useCallback, useState } from 'react';
import { toast } from 'sonner';

interface UpdateCheckResult {
  hasUpdate: boolean;
  message: string;
}

/**
 * Hook to handle service worker updates and clear stale caches
 * Automatically clears VideoPlayer chunks when a new version is detected
 */
export function useServiceWorkerUpdate() {
  const [isChecking, setIsChecking] = useState(false);
  const [lastChecked, setLastChecked] = useState<Date | null>(null);

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

  /**
   * Manually check for service worker updates
   * Returns a result indicating whether an update was found
   */
  const checkForUpdates = useCallback(async (): Promise<UpdateCheckResult> => {
    if (!('serviceWorker' in navigator)) {
      return { hasUpdate: false, message: 'Service workers not supported' };
    }

    setIsChecking(true);
    
    try {
      const registration = await navigator.serviceWorker.ready;
      
      // Trigger an update check
      await registration.update();
      setLastChecked(new Date());
      
      // Check if there's a waiting worker (new version available)
      if (registration.waiting) {
        console.log('[SW Update] New version found, activating...');
        
        // Clear stale caches before activating
        await clearStaleCaches();
        
        // Tell the waiting SW to skip waiting and activate
        registration.waiting.postMessage({ type: 'SKIP_WAITING' });
        
        setIsChecking(false);
        return { hasUpdate: true, message: 'New version installed! Reloading...' };
      }
      
      // Check if there's an installing worker
      if (registration.installing) {
        console.log('[SW Update] Update installing...');
        setIsChecking(false);
        return { hasUpdate: true, message: 'Update is being installed...' };
      }
      
      setIsChecking(false);
      return { hasUpdate: false, message: 'You have the latest version' };
      
    } catch (error) {
      console.error('[SW Update] Check failed:', error);
      setIsChecking(false);
      return { hasUpdate: false, message: 'Failed to check for updates' };
    }
  }, [clearStaleCaches]);

  /**
   * Force clear all caches and reload
   */
  const forceRefresh = useCallback(async () => {
    try {
      // Clear all caches
      if ('caches' in window) {
        const cacheNames = await caches.keys();
        await Promise.all(cacheNames.map(name => caches.delete(name)));
        console.log('[SW Update] Cleared all caches');
      }
      
      // Unregister service worker to force fresh install
      if ('serviceWorker' in navigator) {
        const registrations = await navigator.serviceWorker.getRegistrations();
        await Promise.all(registrations.map(reg => reg.unregister()));
        console.log('[SW Update] Unregistered service workers');
      }
      
      // Reload the page
      window.location.reload();
    } catch (error) {
      console.error('[SW Update] Force refresh failed:', error);
      // Still try to reload
      window.location.reload();
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

  return {
    checkForUpdates,
    forceRefresh,
    isChecking,
    lastChecked,
  };
}
