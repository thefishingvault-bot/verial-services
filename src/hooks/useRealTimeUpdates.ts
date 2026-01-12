"use client";

import { useState, useEffect, useCallback, useRef } from 'react';

export interface RealTimeUpdate {
  id: string;
  type: 'provider_update' | 'alert' | 'incident' | 'notification';
  data: Record<string, unknown>;
  timestamp: Date;
}

export interface RealTimeConfig {
  enabled: boolean;
  updateInterval: number; // in milliseconds
  maxRetries: number;
  retryDelay: number;
  /**
   * When true, injects simulated events on an interval.
   * This must never be treated as real-time production data.
   */
  simulate: boolean;
}

const DEFAULT_CONFIG: RealTimeConfig = {
  enabled: true,
  updateInterval: 30000, // 30 seconds
  maxRetries: 3,
  retryDelay: 5000, // 5 seconds
  simulate: false,
};

export function useRealTimeUpdates(
  config: Partial<RealTimeConfig> = {},
  onUpdate?: (update: RealTimeUpdate) => void
) {
  const [isConnected, setIsConnected] = useState(false);
  const [lastUpdate, setLastUpdate] = useState<Date | null>(null);
  const [updates, setUpdates] = useState<RealTimeUpdate[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [isRetrying, setIsRetrying] = useState(false);

  const envSimulate = typeof process !== 'undefined' && process.env?.NEXT_PUBLIC_SIMULATE_REALTIME_UPDATES === 'true';
  const finalConfig = { ...DEFAULT_CONFIG, ...config, simulate: config.simulate ?? envSimulate };
  const wsRef = useRef<WebSocket | null>(null);
  const isConnectedRef = useRef(false);
  const pollIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const retryTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const retryCountRef = useRef(0);

  const connectWebSocket = useCallback(() => {
    if (!finalConfig.enabled) return;

    // Real-time transport is not implemented. We only ever simulate when explicitly enabled.
    if (!finalConfig.simulate) {
      setIsConnected(false);
      isConnectedRef.current = false;
      setError(null);
      return;
    }

    try {
      setIsConnected(true);
      isConnectedRef.current = true;
      setError(null);
      retryCountRef.current = 0;

      const simulateUpdate = () => {
        if (!isConnectedRef.current) return;

        const update: RealTimeUpdate = {
          id: `sim-${Date.now()}`,
          type: 'provider_update',
          data: { providerId: 'simulated-provider', status: 'updated', simulated: true },
          timestamp: new Date(),
        };

        setUpdates((prev) => [update, ...prev.slice(0, 49)]);
        setLastUpdate(update.timestamp);
        onUpdate?.(update);
      };

      pollIntervalRef.current = setInterval(simulateUpdate, finalConfig.updateInterval);
    } catch (err) {
      console.error('WebSocket connection failed:', err);
      setError('Failed to connect to real-time updates');
      setIsConnected(false);
    }
  }, [finalConfig.enabled, finalConfig.simulate, finalConfig.updateInterval, onUpdate]);

  const handleRetry = useCallback(() => {
    if (retryCountRef.current >= finalConfig.maxRetries) {
      setError('Max retries exceeded. Real-time updates disabled.');
      return;
    }

    setIsRetrying(true);
    retryCountRef.current += 1;

    retryTimeoutRef.current = setTimeout(() => {
      setIsRetrying(false);
      connectWebSocket();
    }, finalConfig.retryDelay);
  }, [finalConfig.maxRetries, finalConfig.retryDelay, connectWebSocket]);

  const disconnect = useCallback(() => {
    setIsConnected(false);
    isConnectedRef.current = false;
    if (wsRef.current) {
      wsRef.current.close();
      wsRef.current = null;
    }
    if (pollIntervalRef.current) {
      clearInterval(pollIntervalRef.current);
      pollIntervalRef.current = null;
    }
    if (retryTimeoutRef.current) {
      clearTimeout(retryTimeoutRef.current);
      retryTimeoutRef.current = null;
    }
  }, []);

  const sendMessage = useCallback((message: Record<string, unknown>) => {
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify(message));
    }
  }, []);

  const clearUpdates = useCallback(() => {
    setUpdates([]);
  }, []);

  useEffect(() => {
    if (!finalConfig.enabled) return;

    // Start connection (simulation only, unless a real transport is implemented later).
    connectWebSocket();

    return () => {
      disconnect();
    };
  }, [finalConfig.enabled, connectWebSocket, disconnect]);

  return {
    isConnected,
    lastUpdate,
    updates,
    error,
    isRetrying,
    isSimulated: finalConfig.simulate,
    connect: connectWebSocket,
    disconnect,
    sendMessage,
    clearUpdates,
    retry: handleRetry,
    config: finalConfig
  };
}

export function usePollingUpdates<T = unknown>(
  fetchFunction: () => Promise<T>,
  interval: number = 30000,
  enabled: boolean = true
) {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastFetch, setLastFetch] = useState<Date | null>(null);

  const fetchData = useCallback(async () => {
    if (!enabled) return;

    setLoading(true);
    setError(null);

    try {
      const result = await fetchFunction();
      setData(result);
      setLastFetch(new Date());
    } catch (err) {
      console.error('Polling fetch failed:', err);
      setError('Failed to fetch latest data');
    } finally {
      setLoading(false);
    }
  }, [fetchFunction, enabled]);

  useEffect(() => {
    if (enabled) {
      fetchData(); // Initial fetch

      const intervalId = setInterval(fetchData, interval);
      return () => clearInterval(intervalId);
    }
  }, [fetchData, interval, enabled]);

  return {
    data,
    loading,
    error,
    lastFetch,
    refetch: fetchData
  };
}