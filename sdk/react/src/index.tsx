import React, { createContext, useContext, useEffect, useMemo, useRef } from 'react';
import { VynClient, type VynClientOptions } from '@vynelix/vynrelay-sdk';

interface VynContextValue {
  client: VynClient;
}

const VynContext = createContext<VynContextValue | null>(null);

export interface VynProviderProps {
  options: VynClientOptions;
  children: React.ReactNode;
}

/**
 * VynProvider — The root container for VynRelay React applications.
 * It initializes a single instance of VynClient and keeps it alive
 * across the entire component tree.
 */
export const VynProvider: React.FC<VynProviderProps> = ({ options, children }) => {
  // Use a ref to ensure we only create the client once
  const clientRef = useRef<VynClient | null>(null);

  if (!clientRef.current) {
    clientRef.current = new VynClient(options);
  }

  // Memoize context value
  const value = useMemo(() => ({
    client: clientRef.current!
  }), []);

  useEffect(() => {
    // Automatically connect on mount
    clientRef.current?.connect();

    // No automatic disconnect on unmount by default, 
    // as we want to keep the connection alive between page navigations.
    // Explicit disconnect can be called via useVynClient().client.disconnect()
  }, []);

  return (
    <VynContext.Provider value={value}>
      {children}
    </VynContext.Provider>
  );
};

export const useVynClient = () => {
  const context = useContext(VynContext);
  if (!context) {
    throw new Error('useVynClient must be used within a VynProvider');
  }
  return context.client;
};

export * from './useVynSubscription.jsx';
