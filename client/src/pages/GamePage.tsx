import { useState, useCallback, useEffect, useRef, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import DiceScene from '../components/DiceScene';
import type { DiceSceneAPI } from '../components/DiceScene';
import DiceTray from '../components/DiceTray';
import ScoreBoard from '../components/ScoreBoard';
import ReactionBar from '../components/ReactionBar';
import HandAnnouncement from '../components/HandAnnouncement';
import GamePausedOverlay from '../components/GamePausedOverlay';
import ConfirmDialog from '../components/ConfirmDialog';
import ErrorBoundary from '../components/ErrorBoundary';
import type { GameState, GameAction } from '../hooks/useGameState';
import type { Category } from '../types/game';
import { isSpecialHand, SPECIAL_HANDS } from '../utils/scoreCalculator';

const sceneFallback = (
  <div className="fixed inset-0 bg-gradient-to-br from-gray-950 via-emerald-950 to-gray-950" style={{ zIndex: 0 }} />
);

// Ordered by score descending so the highest-value hand is announced first
const SPECIAL_CATEGORIES_DESC = [...SPECIAL_HANDS].reverse();

interface Props {
  state: GameState;
  dispatch: React.Dispatch<GameAction>;
  send: (type: string, payload?: unknown) => void;
  playerId: string | null;
}

export default function GamePage({ state, dispatch, send, playerId }: Props) {
  const { t } = useTranslation();
  const isMyTurn = state.currentPlayer === playerId;
  const [rollPhase, setRollPhase] = useState<'idle' | 'shaking' | 'rolling' | 'settled'>('idle');
  const prevRollCountRef = useRef(state.rollCount);
  const prevPourRef = useRef(state.pourCount);
  const prevPlayerRef = useRef(state.currentPlayer);
  const sceneRef = useRef<DiceSceneAPI>(null);
  const diceRef = useRef(state.dice);
  diceRef.current = state.dice;
  const pendingShakeRef = useRef(false);

  const [confirmLeave, setConfirmLeave] = useState(false);

  const handleLeave = useCallback(() => {
    send('game:leave');
  }, [send]);

  // #6: Hand announcement state
  const [announcedHand, setAnnouncedHand] = useState<Category | null>(null);
  const [announcedScore, setAnnouncedScore] = useState<number | undefined>();

  const handleShake = () => {
    if (!isMyTurn || state.rollCount >= 3 || pendingShakeRef.current) return;
    pendingShakeRef.current = true;
    send('game:roll');
  };

  const handleRoll = () => {
    if (rollPhase !== 'shaking') return;
    const ok = sceneRef.current?.roll();
    if (ok) {
      setRollPhase('rolling');
      send('game:pour');
    }
  };

  // Unified dice scene synchronization
  useEffect(() => {
    const api = sceneRef.current;
    if (!api) return;

    // Turn changed → reset
    if (state.currentPlayer !== prevPlayerRef.current) {
      prevPlayerRef.current = state.currentPlayer;
      setRollPhase('idle');
      pendingShakeRef.current = false;
      prevRollCountRef.current = 0;
      prevPourRef.current = 0;
      setAnnouncedHand(null);
      setAnnouncedScore(undefined);
    }

    // Always sync held state
    api.setHeld(state.held);

    // Roll count incremented → start shake animation
    if (state.rollCount > prevRollCountRef.current && state.dice.length === 5) {
      pendingShakeRef.current = false;
      api.setValues(state.dice);
      api.shake();
      setRollPhase('shaking');
    }
    prevRollCountRef.current = state.rollCount;

    // Pour count incremented (remote player) → trigger roll
    if (state.pourCount > prevPourRef.current && !isMyTurn) {
      api.roll();
      setRollPhase('rolling');
    }
    prevPourRef.current = state.pourCount;
  }, [state.rollCount, state.pourCount, state.held, state.currentPlayer, isMyTurn, state.dice]);

  const handleSettled = useCallback(() => {
    setRollPhase('settled');
    setAnnouncedHand(null);
    setAnnouncedScore(undefined);
    const dice = diceRef.current;
    if (dice.length !== 5) return;
    for (const cat of SPECIAL_CATEGORIES_DESC) {
      const hand = isSpecialHand(dice, cat);
      if (hand) {
        queueMicrotask(() => {
          setAnnouncedHand(hand.category);
          setAnnouncedScore(hand.score);
        });
        return;
      }
    }
  }, []);

  useEffect(() => {
    sceneRef.current?.onResult(handleSettled);
  }, [handleSettled]);

  const handleScore = useCallback((category: Category) => {
    send('game:score', { category });
    setRollPhase('idle');
  }, [send]);

  const handleAnnouncementDone = useCallback(() => {
    setAnnouncedHand(null);
    setAnnouncedScore(undefined);
    dispatch({ type: 'CLEAR_LAST_SCORED' });
  }, [dispatch]);

  const handleHold = useCallback((index: number) => {
    send('game:hold', { index });
  }, [send]);

  const hoverTimerRef = useRef<ReturnType<typeof setTimeout>>(undefined);
  const handleHoverCategory = useCallback((category: string | null) => {
    clearTimeout(hoverTimerRef.current);
    if (category === null) {
      hoverTimerRef.current = setTimeout(() => {
        send('game:hover', { category: null });
      }, 50);
    } else {
      send('game:hover', { category });
    }
  }, [send]);

  useEffect(() => {
    return () => clearTimeout(hoverTimerRef.current);
  }, []);

  const handleReaction = useCallback((emoji: string) => {
    send('reaction:send', { emoji });
  }, [send]);

  const handleReactionExpire = useCallback((id: string) => {
    dispatch({ type: 'CLEAR_REACTION', id });
  }, [dispatch]);

  const currentNick = useMemo(
    () => state.players.find(p => p.id === state.currentPlayer)?.nickname ?? '',
    [state.players, state.currentPlayer],
  );

  return (
    <div className="fixed inset-0 overflow-hidden">
      {/* Accessible heading for screen readers */}
      <h1 className="sr-only">{t('app.title')} - {t('game.round')} {state.round}/12</h1>

      {/* 3D Scene — fullscreen background, isolated error boundary */}
      <ErrorBoundary fallback={sceneFallback}>
        <DiceScene ref={sceneRef} />
      </ErrorBoundary>

      {/* #6: Hand announcement overlay */}
      <HandAnnouncement category={announcedHand} score={announcedScore} onDone={handleAnnouncementDone} />

      {/* Pause overlay */}
      <GamePausedOverlay pausedFor={state.pausedFor} />

      {/* Toast notifications */}
      <div className="fixed top-16 left-1/2 -translate-x-1/2 z-50 flex flex-col gap-2 pointer-events-none">
        {state.toasts.map(toast => (
          <div key={toast.id} className="bg-black/80 backdrop-blur-md text-white text-sm px-4 py-2 rounded-xl border border-white/10 animate-fade-in">
            {toast.reason === 'voluntary'
              ? t('game.leave.toast.voluntary', { name: toast.nickname })
              : t('game.leave.toast.timeout', { name: toast.nickname })}
          </div>
        ))}
      </div>

      {/* Leave confirmation */}
      <ConfirmDialog
        open={confirmLeave}
        message={t('game.leave.confirm.body')}
        confirmLabel={t('game.leave.button')}
        cancelLabel={t('room.cancel')}
        variant="danger"
        onConfirm={handleLeave}
        onCancel={() => setConfirmLeave(false)}
      />

      {/* UI Overlay */}
      <main id="main-content" className="relative z-10 h-full flex flex-col pointer-events-none pl-[env(safe-area-inset-left)] pr-[env(safe-area-inset-right)]">
        {/* Top bar — turn indicator */}
        <header className={`pointer-events-auto flex justify-between items-center px-4 py-2.5 transition-[color,background-color,box-shadow] duration-300 ${
          isMyTurn
            ? 'bg-gradient-to-r from-yellow-600/80 via-amber-500/80 to-yellow-600/80 shadow-lg shadow-yellow-500/20'
            : 'bg-black/40 backdrop-blur-md'
        }`}>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setConfirmLeave(true)}
              className="text-white/60 hover:text-white transition-colors p-1 -ml-1"
              aria-label={t('game.leave.button')}
            >
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-5 h-5">
                <path fillRule="evenodd" d="M17 10a.75.75 0 01-.75.75H5.612l4.158 3.96a.75.75 0 11-1.04 1.08l-5.5-5.25a.75.75 0 010-1.08l5.5-5.25a.75.75 0 111.04 1.08L5.612 9.25H16.25A.75.75 0 0117 10z" clipRule="evenodd" />
              </svg>
            </button>
            <span className="text-white font-bold tabular-nums">
              {t('game.round')} {state.round}/12
            </span>
          </div>
          <span className={`text-sm font-bold ${isMyTurn ? 'text-white' : 'text-gray-300'}`} aria-live="polite">
            {isMyTurn ? t('game.yourTurn') : t('game.waitingTurn', { name: currentNick })}
          </span>
          <span className="text-white/70 text-sm tabular-nums">
            {t('game.rollsLeft')}: {3 - state.rollCount}
          </span>
        </header>

        {/* Main area */}
        <div className="flex-1 min-h-0 flex flex-col lg:flex-row">
          {/* Spacer for 3D scene */}
          <div className="flex-1" />

          {/* ScoreBoard — right sidebar on desktop, top overlay on mobile */}
          <div className="pointer-events-auto w-full lg:w-80 p-2 lg:p-4 order-first lg:order-last">
            <ScoreBoard
              players={state.players}
              scores={state.scores}
              currentPlayer={state.currentPlayer}
              myId={playerId}
              rollCount={state.rollCount}
              preview={rollPhase === 'settled' ? state.preview : {}}
              hoveredCategory={state.hoveredCategory}
              minimized={rollPhase === 'shaking' || rollPhase === 'rolling'}
              onSelectCategory={isMyTurn && state.rollCount > 0 ? handleScore : undefined}
              onHoverCategory={isMyTurn && state.rollCount > 0 ? handleHoverCategory : undefined}
              disconnectedPlayers={state.disconnectedPlayers}
            />
          </div>
        </div>

        {/* Bottom area — dice tray + action */}
        <div className="shrink-0 pointer-events-auto flex flex-col items-center gap-2 pb-[max(1rem,env(safe-area-inset-bottom))] px-2">
          <ReactionBar
            onSend={handleReaction}
            reactions={state.reactions}
            onExpire={handleReactionExpire}
            players={state.players}
          />
          <span className="sr-only" role="status" aria-live="polite">
            {rollPhase === 'shaking' ? t('game.rollDice') : rollPhase === 'rolling' ? t('game.rolling') : ''}
          </span>
          {/* Dice tray with integrated action */}
          <DiceTray
            dice={state.dice}
            held={state.held}
            rollCount={state.rollCount}
            isMyTurn={isMyTurn}
            settled={(rollPhase === 'settled' || rollPhase === 'idle') && !(state.rollCount > prevRollCountRef.current && state.dice.length === 5)}
            onHold={handleHold}
            action={
              !isMyTurn ? (
                <span className="dice-tray-label ghost">{'—'}</span>
              ) : rollPhase === 'shaking' ? (
                <button onClick={handleRoll} className="dice-tray-label active focus-visible:ring-2 focus-visible:ring-white rounded">
                  {t('game.rollDice')}
                </button>
              ) : rollPhase === 'rolling' ? (
                <span className="dice-tray-label ghost">{t('game.rollDice')}</span>
              ) : state.rollCount >= 3 ? (
                <span className="dice-tray-label ghost">{'—'}</span>
              ) : (
                <button onClick={handleShake} className="dice-tray-label active focus-visible:ring-2 focus-visible:ring-white rounded">
                  {t('game.shake')}{state.rollCount > 0 && <br />}{state.rollCount > 0 && `(${3 - state.rollCount})`}
                </button>
              )
            }
          />
          {/* Opponent status text */}
          {!isMyTurn && (
            <span className="text-xs text-white/40 min-h-[18px]" aria-live="polite">
              {rollPhase === 'shaking' ? t('game.opponentShaking') : rollPhase === 'rolling' ? t('game.opponentRolled') : rollPhase === 'settled' ? t('game.opponentChoosing') : t('game.opponentTurn')}
            </span>
          )}
        </div>
      </main>
    </div>
  );
}
