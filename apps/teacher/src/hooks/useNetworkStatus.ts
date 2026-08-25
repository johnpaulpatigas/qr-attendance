import { useState, useEffect } from "react";
import { getQueuedCount, onQueueChange } from "../features/attendance/offlineQueueService";

export interface NetworkStatus {
  isOnline: boolean;
  queuedCount: number;
}

export function useNetworkStatus(): NetworkStatus {
  const [isOnline, setIsOnline] = useState<boolean>(
    typeof navigator !== "undefined" ? navigator.onLine : true
  );
  const [queuedCount, setQueuedCount] = useState<number>(() => getQueuedCount());

  useEffect(() => {
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);

    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);

    const unsubscribe = onQueueChange((count) => {
      setQueuedCount(count);
    });

    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
      unsubscribe();
    };
  }, []);

  return { isOnline, queuedCount };
}
