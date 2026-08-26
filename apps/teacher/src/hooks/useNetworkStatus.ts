import { useState, useEffect } from 'react';
import { Network } from '@capacitor/network';
import { getQueuedCount, onQueueChange } from '../features/attendance/offlineQueueService';

export interface NetworkStatus {
  isOnline: boolean;
  queuedCount: number;
}

export function useNetworkStatus(): NetworkStatus {
  const [isOnline, setIsOnline] = useState<boolean>(
    typeof navigator !== 'undefined' ? navigator.onLine : true
  );
  const [queuedCount, setQueuedCount] = useState<number>(() => getQueuedCount());

  useEffect(() => {
    Network.getStatus()
      .then((status) => {
        setIsOnline(status.connected);
      })
      .catch(() => {
        setIsOnline(typeof navigator !== 'undefined' ? navigator.onLine : true);
      });

    const handlerPromise = Network.addListener('networkStatusChange', (status) => {
      setIsOnline(status.connected);
    });

    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    const unsubscribeQueue = onQueueChange((count) => {
      setQueuedCount(count);
    });

    return () => {
      handlerPromise.then((h) => h.remove?.()).catch(() => {});
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
      unsubscribeQueue();
    };
  }, []);

  return { isOnline, queuedCount };
}
