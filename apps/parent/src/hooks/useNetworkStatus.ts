import { useState, useEffect } from 'react';
import { isNetworkOnline, onNetworkStatusChange } from '../features/attendance/networkManager';

export function useNetworkStatus(): boolean {
  const [isOnline, setIsOnline] = useState<boolean>(() => isNetworkOnline());

  useEffect(() => {
    setIsOnline(isNetworkOnline());

    const unsubscribe = onNetworkStatusChange((online) => {
      setIsOnline(online);
    });

    return () => {
      unsubscribe();
    };
  }, []);

  return isOnline;
}
