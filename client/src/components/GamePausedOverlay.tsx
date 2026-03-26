import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';

interface PausedFor {
  playerId: string;
  nickname: string;
  expiresAt: number;
}

interface Props {
  pausedFor: PausedFor | null;
}

export default function GamePausedOverlay({ pausedFor }: Props) {
  const { t } = useTranslation();
  const [remaining, setRemaining] = useState(0);

  useEffect(() => {
    if (!pausedFor) return;
    const update = () => {
      const left = Math.max(0, Math.ceil((pausedFor.expiresAt - Date.now()) / 1000));
      setRemaining(left);
    };
    update();
    const interval = setInterval(update, 1000);
    return () => clearInterval(interval);
  }, [pausedFor]);

  if (!pausedFor) return null;

  const total = 60;
  const progress = Math.min(1, remaining / total);

  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center" role="alert">
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" />
      <div className="relative bg-black/80 backdrop-blur-md border border-white/10 rounded-2xl p-8 max-w-sm w-full mx-4 shadow-2xl text-center space-y-4">
        <div className="text-yellow-400 text-4xl" aria-hidden="true">&#9888;</div>
        <h2 className="text-white text-lg font-bold">
          {t('game.paused.title', { name: pausedFor.nickname })}
        </h2>
        <p className="text-gray-400 text-sm">
          {t('game.paused.subtitle')}
        </p>
        <p className="text-white text-2xl font-bold tabular-nums">
          {t('game.paused.remaining', { seconds: remaining })}
        </p>
        <div className="w-full bg-white/10 rounded-full h-2 overflow-hidden">
          <div
            className="h-full bg-yellow-500 rounded-full transition-[width] duration-1000 ease-linear"
            style={{ width: `${progress * 100}%` }}
          />
        </div>
      </div>
    </div>
  );
}
