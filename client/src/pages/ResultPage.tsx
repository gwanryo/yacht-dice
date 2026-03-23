import { useEffect, useState, useCallback, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import PageLayout from '../components/PageLayout';
import Button from '../components/Button';
import ConfirmDialog from '../components/ConfirmDialog';
import { saveHighScore } from '../utils/highScore';
import { leaveRoom } from '../utils/leaveRoom';
import { CELEBRATION_COLORS } from '../utils/constants';
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

      <div className="w-full max-w-md space-y-6 relative z-10">
        <h1 className="text-5xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-yellow-300 via-amber-200 to-yellow-300 text-center drop-shadow-lg" style={{ fontFamily: '"Outfit", system-ui, sans-serif' }}>
          {t('result.title')}
        </h1>

        {isSolo ? (
          /* Solo result view */
          <div className="space-y-4">
            <div className={`text-center p-6 rounded-xl border transition-[opacity,transform] duration-500 ${
              revealed > 0 ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4'
            } bg-gradient-to-r from-amber-500/20 to-yellow-500/10 border-amber-500/50 ring-1 ring-amber-400/20`}>
              <p className="text-gray-400 text-sm mb-1">{t('result.soloScore')}</p>
              <p className="text-5xl font-bold text-amber-300 tabular-nums">{soloScore}</p>
              {highScoreResult?.isNewBest ? (
                <p className="mt-3 text-lg font-bold text-yellow-300 animate-pulse">
                  {t('result.newPersonalBest')}
                </p>
              ) : highScoreResult?.previous ? (
                <p className="mt-3 text-sm text-gray-400">
                  {t('result.personalBest')}: <span className="text-white font-bold">{highScoreResult.previous.score}</span>
                </p>
              ) : null}
            </div>
          </div>
        ) : (
          /* Multiplayer ranking view */
          <div className="space-y-3">
            {state.rankings.map((r, i) => (
              <div
                key={r.playerId}
                className={`flex items-center justify-between p-4 rounded-xl border transition-[opacity,transform] duration-500 ${
                  i < revealed
                    ? 'opacity-100 translate-y-0'
                    : 'opacity-0 translate-y-4'
                } ${
                  i === 0
                    ? 'bg-gradient-to-r from-amber-500/20 to-yellow-500/10 border-amber-500/50 animate-winner-glow scale-[1.02] ring-1 ring-amber-400/20'
                    : i === 1
                      ? 'bg-gradient-to-r from-gray-400/10 to-gray-300/5 border-gray-400/20'
                      : i === 2
                        ? 'bg-gradient-to-r from-orange-700/10 to-orange-600/5 border-orange-700/20'
                        : 'bg-black/30 border-white/5'
                }`}
                style={{ transitionDelay: `${i * 400}ms` }}
              >
                <div className="flex items-center gap-3 min-w-0">
                  <span className={`shrink-0 ${i === 0 ? 'text-3xl' : 'text-2xl'}`}>{medals[i] ?? ''}</span>
                  <div className="min-w-0">
                    <p className={`font-bold truncate ${i === 0 ? 'text-amber-200 text-lg' : 'text-white'}`}>{r.nickname}</p>
                    <p className="text-gray-400 text-sm">{t('result.rankLabel', { rank: formatRank(r.rank) })}</p>
                  </div>
                </div>
                <span className={`font-bold tabular-nums shrink-0 ${i === 0 ? 'text-3xl text-amber-300' : 'text-2xl text-white'}`}>{r.score}</span>
              </div>
            ))}
          </div>
        )}

        <div className="flex gap-3">
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
