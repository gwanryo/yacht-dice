import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import PageLayout from '../components/PageLayout';
import Button from '../components/Button';
import ConfirmDialog from '../components/ConfirmDialog';
import { copyToClipboard } from '../utils/clipboard';
import type { GameState, GameAction } from '../hooks/useGameState';

interface Props {
  state: GameState;
  dispatch: React.Dispatch<GameAction>;
  send: (type: string, payload?: unknown) => void;
  playerId: string | null;
}

export default function RoomPage({ state, dispatch, send, playerId }: Props) {
  const { t } = useTranslation();
  const [copied, setCopied] = useState(false);
  const [confirmLeave, setConfirmLeave] = useState(false);
  const me = state.players.find(p => p.id === playerId);
  const isHost = me?.isHost ?? false;
  const isReady = me?.isReady ?? false;
  const allOthersReady = state.players.filter(p => p.id !== playerId).every(p => p.isReady || p.isHost);

  const preloadDiceScene = () => {
    import('../components/dice-scene/createDiceScene');
  };

  const handleLeave = () => setConfirmLeave(true);
  const doLeave = () => {
    send('room:leave');
    const url = new URL(window.location.href);
    url.searchParams.delete('room');
    window.history.replaceState({}, '', url);
    dispatch({ type: 'RESET_GAME' });
  };

  return (
    <PageLayout phase="room">
      <div className="w-full max-w-md space-y-6">
        <div className="text-center">
          <h1 className="text-3xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-emerald-300 via-teal-200 to-emerald-300 mb-1">{t('app.title')}</h1>
          <div className="flex items-center justify-center gap-2">
            <span className="text-gray-400">{t('room.code')}:</span>
            <span className="font-mono text-white text-xl tracking-widest">{state.roomCode}</span>
            <button
              onClick={async () => {
                const ok = await copyToClipboard(state.roomCode ?? '');
                if (ok) {
                  setCopied(true);
                  setTimeout(() => setCopied(false), 2000);
                } else {
                  alert(t('room.copyFailed'));
                }
              }}
              className="text-gray-400 hover:text-white transition-colors p-1 rounded focus-visible:ring-2 focus-visible:ring-white"
              aria-label={t('aria.copyRoomCode')}
            >
              {copied ? (
                <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-green-400" aria-hidden="true"><polyline points="20 6 9 17 4 12"/></svg>
              ) : (
                <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>
              )}
            </button>
          </div>
        </div>

        <div className="bg-black/40 backdrop-blur-md rounded-xl p-4 space-y-3 border border-white/10 shadow-2xl shadow-emerald-900/30">
          {state.players.map(p => (
            <div key={p.id} className="flex justify-between items-center p-3 bg-white/5 rounded-lg">
              <div className="flex items-center gap-2 min-w-0">
                <span className="text-white font-medium truncate max-w-[10rem]">{p.nickname}</span>
                {p.isHost && <span className="text-xs bg-amber-500 text-black px-2 py-0.5 rounded shrink-0">{t('room.host')}</span>}
                {p.id === playerId && <span className="text-xs text-emerald-400 shrink-0">{t('game.me')}</span>}
              </div>
              {!p.isHost && (
                <span className={`text-sm shrink-0 ${p.isReady ? 'text-green-400' : 'text-gray-500'}`}>
                  {p.isReady ? '\u2713 ' + t('room.ready') : '\u2026'}
                </span>
              )}
            </div>
          ))}
          {state.players.length < 2 && (
            <p className="text-center text-gray-500 text-sm py-2">{t('room.waitingForPlayers')}</p>
          )}
        </div>

        <div className="flex gap-3">
          <Button variant="danger" onClick={handleLeave} className="flex-1">
            {t('room.leave')}
          </Button>
          {isHost ? (
            <Button onClick={() => send('room:start')}
              onMouseEnter={preloadDiceScene}
              onFocus={preloadDiceScene}
              disabled={state.players.length < 2 || !allOthersReady}
              className="flex-1">
              {t('room.start')}
            </Button>
          ) : (
            <Button
              variant={isReady ? 'ghost' : 'primary'}
              onClick={() => send('room:ready')}
              aria-pressed={isReady}
              className="flex-1">
              {isReady ? t('room.cancel') : t('room.ready')}
            </Button>
          )}
        </div>
      </div>
      <ConfirmDialog
        open={confirmLeave}
        message={t('lobby.leaveConfirm')}
        confirmLabel={t('room.leave')}
        cancelLabel={t('room.cancel')}
        variant="danger"
        onConfirm={doLeave}
        onCancel={() => setConfirmLeave(false)}
      />
    </PageLayout>
  );
}
