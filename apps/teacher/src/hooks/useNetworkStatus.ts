import { useState, useEffect } from 'react';
import { isNetworkOnline, onNetworkStatusChange } from '../features/attendance/networkManager';
import { getQueuedCount, onQueueChange } from '../features/attendance/offlineQueueService';

export interface NetworkStatus {
  isOnline: boolean;
  queuedCount: number;
}

export function useNetworkStatus(): NetworkStatus {
  const [isOnline, setIsOnline] = useState<boolean>(() => isNetworkOnline());
  const [queuedCount, setQueuedCount] = useState<number>(() => getQueuedCount());

  useEffect(() => {
    setIsOnline(isNetworkOnline());

    const unsubscribeNetwork = onNetworkStatusChange((online) => {
      setIsOnline(online);
    });

    const unsubscribeQueue = onQueueChange((count) => {
      setQueuedCount(count);
    });

    return () => {
      unsubscribeNetwork();
      unsubscribeQueue();
    };
  }, []);

  return { isOnline, queuedCount };
}
