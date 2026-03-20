import { useState, useEffect, useCallback, useRef } from 'react';
import type { WatcherEvent } from '../lib/api';

const MAX_EVENTS = 100;

export interface WatchEvent extends WatcherEvent {
  timestamp: number;
  id: number;
}

export function useWatchEvents(enabled: boolean) {
  const [events, setEvents] = useState<WatchEvent[]>([]);
  const [isConnected, setIsConnected] = useState(false);
  const wsRef = useRef<WebSocket | null>(null);
  const idRef = useRef(0);
  const retryRef = useRef(1000);

  const clearEvents = useCallback(() => setEvents([]), []);

  useEffect(() => {
    if (!enabled) {
      if (wsRef.current) {
        wsRef.current.close();
        wsRef.current = null;
      }
      setIsConnected(false);
      return;
    }

    let mounted = true;
    let retryTimer: ReturnType<typeof setTimeout>;

    function connect() {
      if (!mounted) return;
      const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      const ws = new WebSocket(`${protocol}//${window.location.host}/ws/watch`);
      wsRef.current = ws;

      ws.onopen = () => {
        if (!mounted) return;
        setIsConnected(true);
        retryRef.current = 1000;
      };

      ws.onmessage = (msg) => {
        if (!mounted) return;
        try {
          const event = JSON.parse(msg.data) as WatcherEvent;
          const watchEvent: WatchEvent = {
            ...event,
            timestamp: Date.now(),
            id: ++idRef.current,
          };
          setEvents((prev) => [watchEvent, ...prev].slice(0, MAX_EVENTS));
        } catch { /* ignore parse errors */ }
      };

      ws.onclose = () => {
        if (!mounted) return;
        setIsConnected(false);
        wsRef.current = null;
        // Auto-reconnect with backoff
        retryTimer = setTimeout(() => {
          retryRef.current = Math.min(retryRef.current * 2, 30000);
          connect();
        }, retryRef.current);
      };

      ws.onerror = () => {
        ws.close();
      };
    }

    connect();

    return () => {
      mounted = false;
      clearTimeout(retryTimer);
      if (wsRef.current) {
        wsRef.current.close();
        wsRef.current = null;
      }
    };
  }, [enabled]);

  return { events, isConnected, clearEvents };
}
