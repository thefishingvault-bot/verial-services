"use client";

import { useState, useEffect } from 'react';
import { Wifi, WifiOff, RefreshCw, Clock } from 'lucide-react';

interface LiveActivityIndicatorProps {
  isConnected: boolean;
  lastUpdate: Date | null;
  isRetrying?: boolean;
  onRefresh?: () => void;
  updateInterval?: number;
}

export function LiveActivityIndicator({
  isConnected,
  lastUpdate,
  isRetrying = false,
  onRefresh,
  updateInterval = 30000
}: LiveActivityIndicatorProps) {
  const [timeSinceUpdate, setTimeSinceUpdate] = useState<number>(0);
  const [isStale, setIsStale] = useState(false);

  useEffect(() => {
    if (!lastUpdate) return;

    const interval = setInterval(() => {
      const now = Date.now();
      const updateTime = lastUpdate.getTime();
      const diff = now - updateTime;
      setTimeSinceUpdate(diff);

      // Consider data stale if more than 2x the update interval
      setIsStale(diff > updateInterval * 2);
    }, 1000);

    return () => clearInterval(interval);
  }, [lastUpdate, updateInterval]);

  const formatTime = (ms: number) => {
    const seconds = Math.floor(ms / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);

    if (hours > 0) return `${hours}h ${minutes % 60}m ago`;
    if (minutes > 0) return `${minutes}m ${seconds % 60}s ago`;
    return `${seconds}s ago`;
  };

  const getStatusColor = () => {
    if (!isConnected) return 'text-red-500';
    if (isRetrying) return 'text-yellow-500';
    if (isStale) return 'text-orange-500';
    return 'text-green-500';
  };

  const getStatusText = () => {
    if (!isConnected) return 'Disconnected';
    if (isRetrying) return 'Reconnecting...';
    if (isStale) return 'Data may be stale';
    return 'Live';
  };

  return (
    <div className="flex items-center space-x-2 text-sm">
      <div className={`flex items-center space-x-1 ${getStatusColor()}`}>
        {isConnected && !isRetrying ? (
          <Wifi className="w-4 h-4" />
        ) : isRetrying ? (
          <RefreshCw className="w-4 h-4 animate-spin" />
        ) : (
          <WifiOff className="w-4 h-4" />
        )}
        <span className="font-medium">{getStatusText()}</span>
      </div>

      {lastUpdate && (
        <div className="flex items-center space-x-1 text-gray-500">
          <Clock className="w-3 h-3" />
          <span>Updated {formatTime(timeSinceUpdate)}</span>
        </div>
      )}

      {onRefresh && (
        <button
          onClick={onRefresh}
          className="flex items-center space-x-1 text-blue-600 hover:text-blue-900 transition-colors"
          title="Refresh data"
        >
          <RefreshCw className="w-3 h-3" />
          <span>Refresh</span>
        </button>
      )}
    </div>
  );
}

interface AutoRefreshToggleProps {
  enabled: boolean;
  onToggle: (enabled: boolean) => void;
  interval: number;
  onIntervalChange: (interval: number) => void;
}

export function AutoRefreshToggle({
  enabled,
  onToggle,
  interval,
  onIntervalChange
}: AutoRefreshToggleProps) {
  const intervals = [
    { value: 15000, label: '15s' },
    { value: 30000, label: '30s' },
    { value: 60000, label: '1m' },
    { value: 300000, label: '5m' },
  ];

  return (
    <div className="flex items-center space-x-3">
      <label className="flex items-center space-x-2 text-sm">
        <input
          type="checkbox"
          checked={enabled}
          onChange={(e) => onToggle(e.target.checked)}
          className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
        />
        <span>Auto-refresh</span>
      </label>

      {enabled && (
        <select
          value={interval}
          onChange={(e) => onIntervalChange(parseInt(e.target.value))}
          className="text-sm border border-gray-300 rounded px-2 py-1 focus:ring-blue-500 focus:border-blue-500"
        >
          {intervals.map(({ value, label }) => (
            <option key={value} value={value}>Every {label}</option>
          ))}
        </select>
      )}
    </div>
  );
}