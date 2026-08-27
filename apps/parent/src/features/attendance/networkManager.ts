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
      console.warn('Error in parent network listener:', err);
    }
  });
}

if (typeof window !== 'undefined') {
  try {
    Network.getStatus()
      .then((status) => {
        cachedOnlineStatus = status.connected;
        notifyListeners(status.connected);
      })
      .catch(() => {
        cachedOnlineStatus = navigator.onLine;
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
    console.warn('Could not initialize Network listener in parent app:', err);
  }
}

export function isNetworkOnline(): boolean {
  return cachedOnlineStatus;
}

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

export function onNetworkStatusChange(listener: NetworkListener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
