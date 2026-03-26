import { lazy, Suspense, useEffect, useState, useCallback, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { useWebSocket } from './hooks/useWebSocket';
import { useGameState } from './hooks/useGameState';
import { useGameEvents } from './hooks/useGameEvents';
import ErrorBoundary from './components/ErrorBoundary';

const LobbyPage = lazy(() => import('./pages/LobbyPage'));
const RoomPage = lazy(() => import('./pages/RoomPage'));
const GamePage = lazy(() => import('./pages/GamePage'));
const ResultPage = lazy(() => import('./pages/ResultPage'));

function LoadingFallback() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-950 via-emerald-950 to-gray-950 flex items-center justify-center relative overflow-hidden">
      {/* Ambient glow */}
      <div className="absolute inset-0 pointer-events-none" aria-hidden="true"
        style={{ background: 'radial-gradient(ellipse at 50% 40%, rgba(5,150,105,0.1) 0%, transparent 60%)' }}
      />
      <div className="flex flex-col items-center gap-5 relative z-10">
        <div className="text-5xl font-display text-transparent bg-clip-text bg-gradient-to-r from-amber-400 via-yellow-300 to-amber-400 animate-pulse drop-shadow-lg">
          Yacht Dice
        </div>
        <div className="text-white/30 text-sm tracking-widest uppercase">Loading{'\u2026'}</div>
        <div className="flex gap-2">
          {[0, 1, 2, 3, 4].map(i => (
            <div
              key={i}
              className="w-2 h-2 rounded-full bg-emerald-400/70"
              style={{ animation: `pulse 1.4s ease-in-out ${i * 0.15}s infinite` }}
            />
          ))}
        </div>
      </div>
    </div>
  );
}

export default function App() {
  const { t } = useTranslation();
  const [state, dispatch] = useGameState();
  const ws = useWebSocket(state.nickname);
  const [error, setError] = useState<string | null>(null);
  const handleError = useCallback((msg: string | null) => setError(msg), []);

  useEffect(() => {
    if (!state.nickname) return;
    ws.connect();
    return () => ws.disconnect();
  }, [state.nickname, ws.connect, ws.disconnect]);

  // Reset to lobby if server restarted (new playerId = lost session)
  useEffect(() => {
    ws.onSessionReset(() => {
      dispatch({ type: 'RESET_GAME' });
    });
  }, [ws.onSessionReset, dispatch]);

  // Sync room code to URL for sharing
  useEffect(() => {
    const url = new URL(window.location.href);
    if (state.roomCode) {
      url.searchParams.set('room', state.roomCode);
    } else {
      url.searchParams.delete('room');
    }
    window.history.replaceState({}, '', url);
  }, [state.roomCode]);

  // Warn before closing tab during active game
  useEffect(() => {
    if (state.phase !== 'game' && state.phase !== 'room') return;
    const handler = (e: BeforeUnloadEvent) => {
      e.preventDefault();
    };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [state.phase]);

  const getPhase = useCallback(() => state.phase, [state.phase]);
  const getPlayerId = useCallback(() => ws.playerId, [ws.playerId]);
  useGameEvents(ws, dispatch, handleError, getPhase, getPlayerId);

  // Focus main content when phase changes
  const pageRef = useRef<HTMLDivElement>(null);
  const prevPhaseRef = useRef(state.phase);
  useEffect(() => {
    if (prevPhaseRef.current !== state.phase) {
      prevPhaseRef.current = state.phase;
      // Defer focus to after Suspense resolves
      requestAnimationFrame(() => {
        pageRef.current?.focus();
      });
    }
  }, [state.phase]);

  const page = (() => {
    switch (state.phase) {
      case 'lobby':
        return <LobbyPage state={state} dispatch={dispatch} send={ws.send} on={ws.on} playerId={ws.playerId} />;
      case 'room':
        return <RoomPage state={state} dispatch={dispatch} send={ws.send} playerId={ws.playerId} />;
      case 'game':
        return <GamePage state={state} dispatch={dispatch} send={ws.send} playerId={ws.playerId} />;
      case 'result':
        return <ResultPage state={state} dispatch={dispatch} send={ws.send} playerId={ws.playerId} />;
    }
  })();

  return (
    <ErrorBoundary>
      {!ws.connected && state.nickname && !ws.connectionFailed && (
        <div className="fixed top-0 inset-x-0 z-50 bg-red-600/90 text-white text-center py-2 text-sm font-body animate-slide-down" role="alert" aria-live="polite">
          {t('error.reconnecting')}
        </div>
      )}
      {ws.connectionFailed && (
        <div className="fixed top-0 inset-x-0 z-50 bg-red-800/90 text-white text-center py-2 text-sm font-body flex items-center justify-center gap-3 animate-slide-down" role="alert" aria-live="polite">
          <span>{t('error.connectionLost')}</span>
          <button
            onClick={ws.reconnect}
            className="px-3 py-1 bg-white/20 hover:bg-white/30 rounded text-sm transition-colors focus-visible:ring-2 focus-visible:ring-white"
          >
            {t('error.retry')}
          </button>
        </div>
      )}
      {error && (
        <div className="fixed top-0 inset-x-0 z-50 bg-amber-600/90 text-white text-center py-2 text-sm font-body animate-slide-down" role="alert" aria-live="polite">
          {error}
        </div>
      )}
      <Suspense fallback={<LoadingFallback />}>
        <div key={state.phase} ref={pageRef} tabIndex={-1} className="animate-fade-in outline-none">
          {page}
        </div>
      </Suspense>
    </ErrorBoundary>
  );
}
