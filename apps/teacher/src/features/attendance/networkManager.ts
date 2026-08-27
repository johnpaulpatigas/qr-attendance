import { Network } from '@capacitor/network';

type NetworkListener = (isOnline: boolean) => void;

let cachedOnlineStatus: boolean = typeof navigator !== 'undefined' ? navigator.onLine : true;
const listeners = new Set<NetworkListener>();

function notifyListeners(online: boolean) {
  cachedOnlineStatus = online;
  listeners.forEach((listener) => {
    try {
      listener(online);
    } catch (err) {
      console.warn('Error in network listener:', err);
    }
  });

  if (online && typeof window !== 'undefined') {
    // Automatically trigger offline queue synchronization upon reconnection
    import('./offlineQueueService')
      .then(({ syncOfflineQueue, getQueuedCount }) => {
        if (getQueuedCount() > 0) {
          syncOfflineQueue().catch((err) => {
            console.warn('Auto-sync on network reconnect notice:', err);
          });
        }
      })
      .catch(() => {});
  }
}

// Initialize Capacitor Network listener on module load
if (typeof window !== 'undefined') {
  try {
    Network.getStatus()
      .then((status) => {
        cachedOnlineStatus = status.connected;
        notifyListeners(status.connected);
      })
      .catch(() => {
        // Fallback to navigator
        cachedOnlineStatus = navigator.onLine;
        notifyListeners(navigator.onLine);
      });

    Network.addListener('networkStatusChange', (status) => {
      notifyListeners(status.connected);
    });

    window.addEventListener('online', () => {
      notifyListeners(true);
    });

    window.addEventListener('offline', () => {
      notifyListeners(false);
    });
  } catch (err) {
    console.warn('Could not initialize Network listener:', err);
  }
}

/**
 * Returns current online status synchronously.
 * Works seamlessly in Web, Capacitor Android, and iOS.
 */
export function isNetworkOnline(): boolean {
  return cachedOnlineStatus;
}

/**
 * Re-queries the native network status via Capacitor with fallback.
 */
export async function checkNetworkOnline(): Promise<boolean> {
  try {
    const statusPromise = Network.getStatus().then((s) => s.connected);
    const timeoutPromise = new Promise<boolean>((resolve) =>
      setTimeout(() => resolve(cachedOnlineStatus), 400)
    );
    const isOnline = await Promise.race([statusPromise, timeoutPromise]);
    cachedOnlineStatus = isOnline;
    return isOnline;
  } catch {
    return cachedOnlineStatus;
  }
}

/**
 * Subscribes to network status transitions.
 */
export function onNetworkStatusChange(listener: NetworkListener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
