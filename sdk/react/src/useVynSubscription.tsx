import { useEffect, useState, useCallback, useRef } from 'react';
import { useVynClient } from './index.jsx'; // Assume compiled extension or setup handles this

/**
 * useVynSubscription — A hook to subscribe to a VynRelay topic within a component.
 * It automatically manages the subscription lifecycle:
 * - Subscribes on mount
 * - Unsubscribes on unmount
 * 
 * @param topic The topic to subscribe to.
 * @param callback Optional callback for when a new message arrives.
 * @returns The last received data from this topic.
 */
export function useVynSubscription<T = any>(
  topic: string,
  callback?: (data: T) => void
) {
  const client = useVynClient();
  const [lastData, setLastData] = useState<T | null>(null);
  
  // Use a stable ref for the callback to avoid re-subscribing when callback changes
  const callbackRef = useRef(callback);
  callbackRef.current = callback;

  const handleMessage = useCallback((data: T) => {
    setLastData(data);
    if (callbackRef.current) {
      callbackRef.current(data);
    }
  }, []);

  useEffect(() => {
    // If no topic is provided (e.g. conditional subscription), do nothing
    if (!topic) return;

    // Subscribe
    client.subscribe(topic, handleMessage);

    // Unsubscribe on unmount
    return () => {
      client.unsubscribe(topic, handleMessage);
    };
  }, [client, topic, handleMessage]);

  return lastData;
}
