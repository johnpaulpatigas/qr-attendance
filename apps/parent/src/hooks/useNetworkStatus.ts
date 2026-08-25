import { useState, useEffect } from 'react';
import { Network } from '@capacitor/network';

export function useNetworkStatus(): boolean {
  const [isOnline, setIsOnline] = useState<boolean>(
    typeof navigator !== 'undefined' ? navigator.onLine : true
  );

  useEffect(() => {
    // 1. Initial Capacitor network check
    Network.getStatus()
      .then((status) => {
        setIsOnline(status.connected);
      })
      .catch(() => {
        setIsOnline(typeof navigator !== 'undefined' ? navigator.onLine : true);
      });

    // 2. Listen to Capacitor native network changes (instant on Android)
    const handlerPromise = Network.addListener('networkStatusChange', (status) => {
      setIsOnline(status.connected);
    });

    // 3. Browser event fallback
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      handlerPromise.then((h) => h.remove?.()).catch(() => {});
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  return isOnline;
}
