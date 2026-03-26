import { useEffect, useState, useCallback, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import PageLayout from '../components/PageLayout';
import Button from '../components/Button';
import ConfirmDialog from '../components/ConfirmDialog';
import { saveHighScore } from '../utils/highScore';
import { leaveRoom } from '../utils/leaveRoom';
import { CELEBRATION_COLORS } from '../utils/constants';
import { UPPER_CATEGORIES, LOWER_CATEGORIES } from '../types/game';
import type { GameState, GameAction } from '../hooks/useGameState';

const CONFETTI_DATA = Array.from({ length: 60 }, (_, i) => ({
  left: `${Math.random() * 100}%`,
  delay: `${Math.random() * 2}s`,
  duration: `${2.5 + Math.random() * 2}s`,
  color: CELEBRATION_COLORS[i % CELEBRATION_COLORS.length],
  rotation: `rotate(${Math.random() * 360}deg)`,
}));

function ConfettiParticles() {
  return (
    <div className="fixed inset-0 z-50 pointer-events-none overflow-hidden" aria-hidden="true">
      {CONFETTI_DATA.map((c, i) => (
        <div
          key={i}
          className="absolute animate-confetti-fall"
          style={{ left: c.left, animationDelay: c.delay, animationDuration: c.duration }}
        >
          <div
            className="w-2.5 h-2.5 rounded-sm"
            style={{ backgroundColor: c.color, transform: c.rotation }}
          />
        </div>
      ))}
    </div>
  );
}

function upperSum(ps: Record<string, number>): number {
  return UPPER_CATEGORIES.reduce((s, c) => s + (ps[c] ?? 0), 0);
}

function totalScore(ps: Record<string, number>): number {
  const sum = Object.values(ps).reduce((a, b) => a + b, 0);
  return sum + (upperSum(ps) >= 63 ? 35 : 0);
}

interface Props {
  state: GameState;
  dispatch: React.Dispatch<GameAction>;
  send: (type: string, payload?: unknown) => void;
  playerId: string | null;
}

export default function ResultPage({ state, dispatch, send, playerId }: Props) {
  const { t, i18n } = useTranslation();
  const formatRank = useCallback((rank: number) => {
    if (i18n.language === 'en') {
      const s = ['th', 'st', 'nd', 'rd'];
      const v = rank % 100;
      return `${rank}${s[(v - 20) % 10] || s[v] || s[0]}`;
    }
    return `${rank}`;
  }, [i18n.language]);
  const medals = ['\uD83E\uDD47', '\uD83E\uDD48', '\uD83E\uDD49', ''];
  const [revealed, setRevealed] = useState<number>(0);
  const [showConfetti, setShowConfetti] = useState(false);
  const [announced, setAnnounced] = useState('');

  const isSolo = state.players.length === 1;

  // useMemo (not useEffect): saveHighScore must run synchronously so the
  // stagger-reveal effect on the same render already has the result.
  // useEffect would leave highScoreResult null for one frame, breaking confetti timing.
  const highScoreResult = useMemo(() => {
    if (!isSolo || state.rankings.length === 0) return null;
    return saveHighScore(state.rankings[0].score);
  }, [isSolo, state.rankings]);

  // Stagger ranking reveals
  useEffect(() => {
    if (isSolo) {
      // Solo: reveal immediately
      setRevealed(1);
      const timer = setTimeout(() => setShowConfetti(highScoreResult?.isNewBest ?? false), 400);
      return () => clearTimeout(timer);
    }
    if (revealed < state.rankings.length) {
      const timer = setTimeout(() => {
        setRevealed(prev => prev + 1);
        const r = state.rankings[revealed];
        if (r) setAnnounced(prev => prev + `${formatRank(r.rank)}: ${r.nickname} - ${r.score}. `);
      }, 400);
      return () => clearTimeout(timer);
    } else if (revealed === state.rankings.length && state.rankings.length > 0) {
      // Show confetti after all revealed
      const timer = setTimeout(() => setShowConfetti(true), 200);
      return () => clearTimeout(timer);
    }
  }, [revealed, state.rankings.length, state.rankings, formatRank, isSolo, highScoreResult]);

  const myVoted = playerId ? state.rematchVotes.includes(playerId) : false;

  const [confirmLeave, setConfirmLeave] = useState(false);

  const handleLeave = () => leaveRoom(send, dispatch);

  const soloScore = isSolo && state.rankings.length > 0 ? state.rankings[0].score : 0;

  return (
    <PageLayout phase="result" className="relative overflow-hidden">
      {/* Confetti particles */}
      {showConfetti && <ConfettiParticles />}

      <div className="sr-only" aria-live="polite" role="status">{announced}</div>

      <div className="w-full max-w-lg space-y-3 relative z-10">
        <h1 className="text-3xl font-display text-transparent bg-clip-text bg-gradient-to-r from-yellow-300 via-amber-200 to-yellow-300 text-center drop-shadow-lg">
          {t('result.title')}
        </h1>

        {/* Solo score banner — compact, aligned columns */}
        {isSolo && (
          <div className={`flex items-baseline justify-center gap-6 px-4 py-2.5 rounded-xl border transition-[opacity,transform] duration-500 ${
            revealed > 0 ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4'
          } bg-gradient-to-r from-amber-500/20 to-yellow-500/10 border-amber-500/50 ring-1 ring-amber-400/20`}>
            <div className="flex items-baseline gap-2">
              <span className="text-gray-400 text-sm">{t('result.soloScore')}</span>
              <span className="text-2xl font-bold text-amber-300 tabular-nums">{soloScore}</span>
            </div>
            {highScoreResult?.isNewBest ? (
              <div className="flex items-baseline gap-2">
                <span className="text-sm font-bold text-yellow-300 animate-pulse">
                  {t('result.newPersonalBest')}
                </span>
              </div>
            ) : highScoreResult?.previous ? (
              <div className="flex items-baseline gap-2">
                <span className="text-gray-400 text-sm">{t('result.personalBest')}</span>
                <span className="text-2xl font-bold text-white/60 tabular-nums">{highScoreResult.previous.score}</span>
              </div>
            ) : null}
          </div>
        )}

        {/* Multiplayer compact ranking bar */}
        {!isSolo && (
          <div className="flex flex-wrap gap-2 justify-center">
            {state.rankings.map((r, i) => (
              <div
                key={r.playerId}
                className={`flex items-center gap-2 px-3 py-2.5 rounded-xl border transition-[opacity,transform] duration-500 ${
                  i < revealed ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4'
                } ${
                  i === 0
                    ? 'bg-gradient-to-r from-amber-500/20 to-yellow-500/10 border-amber-500/50 ring-1 ring-amber-400/20'
                    : 'bg-black/30 border-white/10'
                }`}
                style={{ transitionDelay: `${i * 400}ms` }}
              >
                <span className="text-lg">{medals[i] ?? ''}</span>
                <span className={`text-base font-bold truncate max-w-[6rem] ${i === 0 ? 'text-amber-200' : 'text-white'}`}>{r.nickname}</span>
                <span className={`font-bold tabular-nums ${i === 0 ? 'text-amber-300' : 'text-white'}`}>{r.score}</span>
                {r.leftEarly && <span className="text-gray-500 text-xs">({t('game.result.leftEarly')})</span>}
              </div>
            ))}
          </div>
        )}

        {/* Full scorecard table */}
        <div className="bg-black/50 backdrop-blur-md rounded-xl p-3 overflow-auto max-h-[65vh] border border-white/5">
          <table className="w-full border-collapse" aria-label={t('game.score')}>
            <thead>
              <tr>
                <th className="px-2 py-1 text-left text-xs text-gray-500">{t('game.score')}</th>
                {state.rankings.map((r, i) => (
                  <th key={r.playerId} className={`px-2 py-1 text-center text-xs min-w-0 max-w-[5rem] ${
                    i === 0 ? 'text-amber-300 font-bold' : 'text-gray-500'
                  }`}>
                    <span className="block truncate">{r.nickname}</span>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {UPPER_CATEGORIES.map(cat => (
                <tr key={cat}>
                  <td className="px-2 py-1 text-sm text-gray-400">{t(`categories.${cat}`)}</td>
                  {state.rankings.map((r, i) => {
                    const v = state.scores[r.playerId]?.[cat];
                    return (
                      <td key={r.playerId} className={`px-2 py-1 text-center text-sm tabular-nums ${
                        v === undefined ? 'text-gray-600' : v === 0 ? (i === 0 ? 'text-white/30' : 'text-gray-600') : (i === 0 ? 'text-white' : 'text-gray-400')
                      }`}>
                        {v ?? '-'}
                      </td>
                    );
                  })}
                </tr>
              ))}
              <tr className="border-t border-white/10">
                <td className="px-2 py-1 text-xs text-gray-500">{t('categories.upperBonus')}</td>
                {state.rankings.map(r => {
                  const uSum = upperSum(state.scores[r.playerId] ?? {});
                  return (
                    <td key={r.playerId} className="px-2 py-1 text-center text-xs text-gray-500 tabular-nums">
                      {uSum >= 63 ? '+35' : `${uSum}/63`}
                    </td>
                  );
                })}
              </tr>
              <tr className="border-t border-white/10">
                <td colSpan={state.rankings.length + 1} className="h-1" />
              </tr>
              {LOWER_CATEGORIES.map(cat => (
                <tr key={cat}>
                  <td className="px-2 py-1 text-sm text-gray-400">{t(`categories.${cat}`)}</td>
                  {state.rankings.map((r, i) => {
                    const v = state.scores[r.playerId]?.[cat];
                    return (
                      <td key={r.playerId} className={`px-2 py-1 text-center text-sm tabular-nums ${
                        v === undefined ? 'text-gray-600' : v === 0 ? (i === 0 ? 'text-white/30' : 'text-gray-600') : (i === 0 ? 'text-white' : 'text-gray-400')
                      }`}>
                        {v ?? '-'}
                      </td>
                    );
                  })}
                </tr>
              ))}
              <tr className="border-t border-white/10">
                <td className="px-2 py-1 text-sm font-bold text-white">{t('categories.total')}</td>
                {state.rankings.map((r, i) => (
                  <td key={r.playerId} className={`px-2 py-1 text-center text-sm font-bold tabular-nums ${
                    i === 0 ? 'text-amber-300' : 'text-white'
                  }`}>
                    {totalScore(state.scores[r.playerId] ?? {})}
                  </td>
                ))}
              </tr>
            </tbody>
          </table>
        </div>

        <div className="flex gap-3 pt-1">
          <Button
            onClick={() => { send('game:rematch'); }}
            // canRematch: 플레이어가 0명이면 리매치 불가 — 상대 전원 퇴장 시
            // 버튼이 무반응 no-op이 되는 것을 방지
            disabled={myVoted || state.players.length < 1}
            className="flex-1"
          >
            {state.players.length < 1
              ? t('result.opponentLeft')
              : myVoted
                ? `${t('result.rematch')} (${state.rematchVotes.length}/${state.players.length})`
                : isSolo
                  ? t('result.playAgain')
                  : t('result.rematch')
            }
          </Button>
          <Button variant="ghost" onClick={() => setConfirmLeave(true)} className="flex-1">
            {t('result.backToLobby')}
          </Button>
        </div>
      </div>
      <ConfirmDialog
        open={confirmLeave}
        message={t('lobby.leaveConfirm')}
        confirmLabel={t('result.backToLobby')}
        cancelLabel={t('room.cancel')}
        onConfirm={handleLeave}
        onCancel={() => setConfirmLeave(false)}
      />
    </PageLayout>
  );
}
