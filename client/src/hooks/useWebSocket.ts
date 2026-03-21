import { useCallback, useEffect, useRef, useState } from 'react';
import type { Envelope } from '../types/game';

type MessageHandler = (env: Envelope) => void;
type SessionResetHandler = () => void;

export function useWebSocket(nickname: string) {
  const wsRef = useRef<WebSocket | null>(null);
  const [connected, setConnected] = useState(false);
  const [connectionFailed, setConnectionFailed] = useState(false);
  const [playerId, setPlayerId] = useState<string | null>(null);
  const playerIdRef = useRef<string | null>(null);
  const tokenRef = useRef<string | null>(null);
  const nicknameRef = useRef(nickname);
  const handlersRef = useRef<Map<string, MessageHandler[]>>(new Map());
  const queueRef = useRef<string[]>([]);
  const retriesRef = useRef(0);
  const connectRef = useRef<(() => void) | null>(null);
  const onSessionResetRef = useRef<SessionResetHandler | null>(null);
  const maxRetries = 5;

  useEffect(() => { nicknameRef.current = nickname; }, [nickname]);
  useEffect(() => { playerIdRef.current = playerId; }, [playerId]);

  const connect = useCallback(() => {
    // Close existing connection before creating a new one
    if (wsRef.current) {
      wsRef.current.onclose = null;
      wsRef.current.close();
      wsRef.current = null;
    }

    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const host = window.location.host;
    const params = new URLSearchParams({ nickname: nicknameRef.current });
    if (tokenRef.current) params.set('token', tokenRef.current);
    const url = `${protocol}//${host}/ws?${params}`;

    const ws = new WebSocket(url);
    wsRef.current = ws;

    // Connection timeout: if not open within 10s, treat as failed
    const connectTimeout = setTimeout(() => {
      if (ws.readyState !== WebSocket.OPEN) {
        ws.close();
      }
    }, 10000);

    ws.onopen = () => {
      clearTimeout(connectTimeout);
      setConnected(true);
      setConnectionFailed(false);
      retriesRef.current = 0;
      while (queueRef.current.length > 0) {
        const msg = queueRef.current.shift()!;
        ws.send(msg);
      }
    };

    ws.onclose = () => {
      clearTimeout(connectTimeout);
      setConnected(false);
      if (retriesRef.current < maxRetries) {
        retriesRef.current++;
        setTimeout(() => connectRef.current?.(), 3000);
      } else {
        setConnectionFailed(true);
      }
    };

    ws.onerror = () => {
      clearTimeout(connectTimeout);
    };

    ws.onmessage = (event) => {
      try {
        const envelope: Envelope = JSON.parse(event.data);
        if (envelope.type === 'connected') {
          const payload = envelope.payload as { playerId: string; token: string };
          // Detect server restart: if we had a playerId and the new one differs,
          // the server lost our session. Reset the client to lobby.
          const hadPreviousSession = playerIdRef.current !== null;
          const idChanged = hadPreviousSession && payload.playerId !== playerIdRef.current;
          setPlayerId(payload.playerId);
          playerIdRef.current = payload.playerId;
          tokenRef.current = payload.token;
          if (idChanged && onSessionResetRef.current) {
            onSessionResetRef.current();
          }
        }
        const handlers = handlersRef.current.get(envelope.type);
        if (handlers) {
          handlers.forEach(h => h(envelope));
        }
        const wildcards = handlersRef.current.get('*');
        if (wildcards) {
          wildcards.forEach(h => h(envelope));
        }
      } catch (err) {
        if (import.meta.env.DEV) console.warn('[WS] Failed to parse message:', err);
      }
    };
  }, []);

  useEffect(() => { connectRef.current = connect; }, [connect]);

  const send = useCallback((type: string, payload?: unknown) => {
    const msg = JSON.stringify({ type, payload });
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(msg);
    } else {
      if (queueRef.current.length >= 50) {
        queueRef.current.shift();
      }
      queueRef.current.push(msg);
    }
  }, []);

  const on = useCallback((type: string, handler: MessageHandler) => {
    if (!handlersRef.current.has(type)) {
      handlersRef.current.set(type, []);
    }
    handlersRef.current.get(type)!.push(handler);
    return () => {
      const handlers = handlersRef.current.get(type);
      if (handlers) {
        const idx = handlers.indexOf(handler);
        if (idx >= 0) handlers.splice(idx, 1);
      }
    };
  }, []);

  const disconnect = useCallback(() => {
    retriesRef.current = maxRetries;
    wsRef.current?.close();
  }, []);

  const reconnect = useCallback(() => {
    retriesRef.current = 0;
    setConnectionFailed(false);
    connect();
  }, [connect]);

  const onSessionReset = useCallback((handler: SessionResetHandler) => {
    onSessionResetRef.current = handler;
  }, []);

  return { connect, disconnect, reconnect, send, on, connected, connectionFailed, playerId, onSessionReset };
}
