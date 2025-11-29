"use client";

import { useState, useEffect, useCallback, useRef } from 'react';

export interface RealTimeUpdate {
  id: string;
  type: 'provider_update' | 'alert' | 'incident' | 'notification';
  data: any;
  timestamp: Date;
}

export interface RealTimeConfig {
  enabled: boolean;
  updateInterval: number; // in milliseconds
  maxRetries: number;
  retryDelay: number;
}

const DEFAULT_CONFIG: RealTimeConfig = {
  enabled: true,
  updateInterval: 30000, // 30 seconds
  maxRetries: 3,
  retryDelay: 5000, // 5 seconds
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

  const finalConfig = { ...DEFAULT_CONFIG, ...config };
  const wsRef = useRef<WebSocket | null>(null);
  const pollIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const retryTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const retryCountRef = useRef(0);

  const connectWebSocket = useCallback(() => {
    if (!finalConfig.enabled) return;

    try {
      // For demo purposes, we'll use polling since we don't have a WebSocket server
      // In production, replace with actual WebSocket URL
      const wsUrl = process.env.NEXT_PUBLIC_WS_URL || 'ws://localhost:3001';

      // Simulate WebSocket connection for now
      setIsConnected(true);
      setError(null);
      retryCountRef.current = 0;

      // Simulate receiving updates
      const simulateUpdate = () => {
        if (!isConnected) return;

        const mockUpdates: RealTimeUpdate[] = [
          {
            id: `update-${Date.now()}`,
            type: 'provider_update',
            data: { providerId: 'mock-provider', status: 'updated' },
            timestamp: new Date()
          }
        ];

        mockUpdates.forEach(update => {
          setUpdates(prev => [update, ...prev.slice(0, 49)]); // Keep last 50 updates
          setLastUpdate(update.timestamp);
          onUpdate?.(update);
        });
      };

      // Simulate periodic updates
      pollIntervalRef.current = setInterval(simulateUpdate, finalConfig.updateInterval);

    } catch (err) {
      console.error('WebSocket connection failed:', err);
      setError('Failed to connect to real-time updates');
      setIsConnected(false);
      handleRetry();
    }
  }, [finalConfig.enabled, finalConfig.updateInterval, onUpdate, isConnected]);

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

  const sendMessage = useCallback((message: any) => {
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify(message));
    }
  }, []);

  const clearUpdates = useCallback(() => {
    setUpdates([]);
  }, []);

  useEffect(() => {
    if (finalConfig.enabled) {
      connectWebSocket();
    }

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
    connect: connectWebSocket,
    disconnect,
    sendMessage,
    clearUpdates,
    config: finalConfig
  };
}

export function usePollingUpdates(
  fetchFunction: () => Promise<any>,
  interval: number = 30000,
  enabled: boolean = true
) {
  const [data, setData] = useState<any>(null);
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