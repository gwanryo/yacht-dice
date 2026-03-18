import { useState, useCallback, useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import DiceScene from '../components/DiceScene';
import type { DiceSceneAPI } from '../components/DiceScene';
import DiceTray from '../components/DiceTray';
import ScoreBoard from '../components/ScoreBoard';
import ReactionBar from '../components/ReactionBar';
import type { GameState, GameAction } from '../hooks/useGameState';
import type { Category } from '../types/game';

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
  const sceneRef = useRef<DiceSceneAPI>(null);

  const handleShake = () => {
    if (!isMyTurn || state.rollCount >= 3) return;
    setRollPhase('shaking');
    send('game:roll');
  };

  const handleRoll = () => {
    if (rollPhase !== 'shaking') return;
    setRollPhase('rolling');
  };

  // Trigger animation when dice values arrive
  useEffect(() => {
    if (state.rollCount > prevRollCountRef.current && state.dice.length === 5) {
      const api = sceneRef.current;
      if (api) {
        api.setHeld(state.held);
        api.setValues(state.dice);
        if (isMyTurn) {
          api.shake();
          setRollPhase('shaking');
        } else {
          api.shake();
          setTimeout(() => {
            api.roll();
            setRollPhase('rolling');
          }, 1200);
        }
      }
    }
    prevRollCountRef.current = state.rollCount;
  }, [state.rollCount, state.dice, state.held, isMyTurn]);

  // Handle roll phase: when rolling -> tell scene to roll
  useEffect(() => {
    if (rollPhase === 'rolling') {
      sceneRef.current?.roll();
    }
  }, [rollPhase]);

  // Reset rollPhase when turn changes
  useEffect(() => {
    setRollPhase('idle');
    prevRollCountRef.current = 0;
  }, [state.currentPlayer]);

  const handleSettled = useCallback(() => {
    setRollPhase('settled');
  }, []);

  // Register onResult callback
  useEffect(() => {
    sceneRef.current?.onResult(() => {
      handleSettled();
    });
  }, [handleSettled]);

  const handleScore = (category: Category) => {
    send('game:score', { category });
    setRollPhase('idle');
  };

  const handleHold = (index: number) => {
    send('game:hold', { index });
  };

  const handleHoverCategory = (category: string | null) => {
    send('game:hover', { category });
  };

  const handleReaction = (emoji: string) => {
    send('reaction:send', { emoji });
  };

  const currentNick = state.players.find(p => p.id === state.currentPlayer)?.nickname ?? '';

  return (
    <div className="fixed inset-0 overflow-hidden">
      {/* 3D Scene — fullscreen background */}
      <DiceScene ref={sceneRef} />

      {/* UI Overlay */}
      <div className="relative z-10 h-full flex flex-col pointer-events-none">
        {/* Top bar — turn indicator */}
        <div className={`pointer-events-auto flex justify-between items-center px-4 py-2.5 transition-all ${
          isMyTurn
            ? 'bg-gradient-to-r from-yellow-600/80 via-amber-500/80 to-yellow-600/80 shadow-lg shadow-yellow-500/20'
            : 'bg-black/40 backdrop-blur-sm'
        }`}>
          <span className="text-white font-bold tabular-nums">
            {t('game.round')} {state.round}/12
          </span>
          <span className={`text-sm font-bold ${isMyTurn ? 'text-white' : 'text-gray-300'}`} aria-live="polite">
            {isMyTurn ? t('game.yourTurn') : currentNick + t('game.waitingTurn')}
          </span>
          <span className="text-white/70 text-sm tabular-nums">
            {t('game.rollsLeft')}: {3 - state.rollCount}
          </span>
        </div>

        {/* Main area */}
        <div className="flex-1 flex">
          {/* Spacer for 3D scene */}
          <div className="flex-1" />

          {/* ScoreBoard — right sidebar */}
          <div className="pointer-events-auto lg:w-80 p-4">
            <ScoreBoard
              players={state.players}
              scores={state.scores}
              currentPlayer={state.currentPlayer}
              myId={playerId}
              rollCount={state.rollCount}
              preview={state.preview}
              hoveredCategory={state.hoveredCategory}
              onSelectCategory={isMyTurn && state.rollCount > 0 ? handleScore : undefined}
              onHoverCategory={isMyTurn && state.rollCount > 0 ? handleHoverCategory : undefined}
            />
          </div>
        </div>

        {/* Bottom area — dice tray + buttons */}
        <div className="pointer-events-auto flex flex-col items-center gap-3 pb-4">
          <DiceTray
            dice={state.dice}
            held={state.held}
            rollCount={state.rollCount}
            isMyTurn={isMyTurn}
            onHold={handleHold}
          />
          <div className="flex gap-4">
            {rollPhase === 'shaking' && isMyTurn && (
              <button onClick={handleRoll}
                className="px-8 py-3 bg-green-600 hover:bg-green-700 text-white font-bold rounded-xl text-lg transition-colors focus-visible:ring-2 focus-visible:ring-white shadow-lg">
                Roll!
              </button>
            )}
            {rollPhase !== 'shaking' && rollPhase !== 'rolling' && (
              <button onClick={handleShake}
                disabled={!isMyTurn || state.rollCount >= 3}
                className="px-8 py-3 bg-orange-500 hover:bg-orange-600 disabled:opacity-40 text-white font-bold rounded-xl text-lg transition-colors focus-visible:ring-2 focus-visible:ring-white shadow-lg">
                {t('game.shake')}
                {state.rollCount > 0 && ` (${3 - state.rollCount})`}
              </button>
            )}
          </div>
          <ReactionBar
            onSend={handleReaction}
            reactions={state.reactions}
            onExpire={(id) => dispatch({ type: 'CLEAR_REACTION', id })}
            players={state.players}
          />
        </div>
      </div>
    </div>
  );
}
