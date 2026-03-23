import { memo, useMemo, useState, useCallback, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { UPPER_CATEGORIES, LOWER_CATEGORIES, type Category, type PlayerInfo } from '../types/game';

function usePrevious<T>(value: T): T | undefined {
  const ref = useRef<T | undefined>(undefined);
  const prev = ref.current;
  ref.current = value;
  return prev;
}

interface Props {
  players: PlayerInfo[];
  scores: Record<string, Record<string, number>>;
  currentPlayer: string | null;
  myId: string | null;
  rollCount: number;
  preview: Record<string, number>;
  hoveredCategory: { category: string | null; playerId: string } | null;
  minimized?: boolean;
  onSelectCategory?: (category: Category) => void;
  onHoverCategory?: (category: string | null) => void;
}

function upperSum(playerScores: Record<string, number>): number {
  return UPPER_CATEGORIES.reduce((sum, cat) => sum + (playerScores[cat] ?? 0), 0);
}

function total(playerScores: Record<string, number>): number {
  const sum = Object.values(playerScores).reduce((a, b) => a + b, 0);
  const bonus = upperSum(playerScores) >= 63 ? 35 : 0;
  return sum + bonus;
}

export default memo(function ScoreBoard({
  players, scores, currentPlayer, myId, rollCount,
  preview, hoveredCategory, minimized, onSelectCategory, onHoverCategory,
}: Props) {
  const { t } = useTranslation();
  const isMyTurn = currentPlayer === myId;
  const myScores = myId ? (scores[myId] ?? {}) : {};

  const [localHover, setLocalHover] = useState<string | null>(null);

  // 렌더 중 동기 실행 (useEffect 아님): useEffect로 옮기면 브라우저 페인트 후
  // 실행되어 턴 전환 시 1프레임 동안 이전 호버 하이라이트가 잔존함.
  const prevRollCount = usePrevious(rollCount);
  if (prevRollCount !== undefined && prevRollCount > 0 && rollCount === 0) {
    if (localHover !== null) setLocalHover(null);
  }

  const handleRowEnter = useCallback((cat: string) => {
    setLocalHover(cat);
    onHoverCategory?.(cat);
  }, [onHoverCategory]);

  const handleRowLeave = useCallback(() => {
    setLocalHover(null);
    onHoverCategory?.(null);
  }, [onHoverCategory]);

  // #11: Mobile collapsible — auto-expand when dice results ready
  const shouldAutoExpand = rollCount > 0 && !minimized;
  const [mobileOverride, setMobileOverride] = useState<boolean | null>(null);
  const mobileExpanded = mobileOverride ?? shouldAutoExpand;

  // Cache per-player computed values to avoid redundant calculation
  const playerStats = useMemo(() => {
    return players.map(p => {
      const ps = scores[p.id] ?? {};
      const uSum = upperSum(ps);
      return { id: p.id, upperSum: uSum, total: total(ps), bonusDisplay: uSum >= 63 ? '+35' : `${uSum}/63` };
    });
  }, [players, scores]);

  // #1: Full row click handler (defined before JSX that uses it)
  const handleRowClick = (cat: Category) => {
    if (isMyTurn && rollCount > 0 && myScores[cat] === undefined) {
      onSelectCategory?.(cat);
    }
  };

  const renderRow = (cat: Category) => {
    const canSelect = isMyTurn && rollCount > 0 && myScores[cat] === undefined;
    const previewScore = preview[cat];
    const isHovered = hoveredCategory?.category === cat;
    const isOtherHover = isHovered && hoveredCategory?.playerId !== myId;
    // Use localHover exclusively for own hover (avoids dual-highlight from stale server echo)
    const isMyHover = localHover === cat;

    return (
      <tr
        key={cat}
        onClick={() => handleRowClick(cat)}
        className={`transition-colors duration-150 ${
          isMyHover ? 'bg-yellow-500/20' :
          isOtherHover ? 'bg-blue-500/10' :
          canSelect ? 'cursor-pointer' : ''
        }`}
        onMouseEnter={() => canSelect && handleRowEnter(cat)}
        onMouseLeave={() => canSelect && handleRowLeave()}
      >
        {/* #1: entire row is clickable via tr onClick, button kept for a11y */}
        <td className={`px-2 py-1.5 text-sm font-medium ${
          canSelect ? 'text-yellow-300 font-semibold' : 'text-gray-400'
        }`}>
          {canSelect ? (
            <button
              type="button"
              tabIndex={0}
              onClick={(e) => { e.stopPropagation(); onSelectCategory?.(cat); }}
              onFocus={() => handleRowEnter(cat)}
              onBlur={() => handleRowLeave()}
              className="w-full text-left focus-visible:outline-2 focus-visible:outline-yellow-400 focus-visible:outline-offset-[-2px] rounded-sm active:bg-yellow-500/30"
            >
              {t(`categories.${cat}`)}
            </button>
          ) : (
            t(`categories.${cat}`)
          )}
        </td>
        {players.map(p => {
          const scored = scores[p.id]?.[cat];
          const isPreview = scored === undefined && p.id === currentPlayer && previewScore !== undefined;
          return (
            <td
              key={p.id}
              className={`px-2 py-1.5 text-center text-sm tabular-nums ${
                scored !== undefined
                  ? p.id === currentPlayer ? 'text-white font-bold' : 'text-gray-400'
                  : isPreview
                    ? previewScore === 0
                      ? isMyHover ? 'text-yellow-500/50 italic' : 'text-yellow-500/30 italic'
                      : isMyHover ? 'text-yellow-300 italic font-bold' : 'text-yellow-400/70 italic font-semibold'
                    : 'text-gray-600'
              }`}
            >
              {scored !== undefined ? scored : isPreview ? previewScore : '-'}
            </td>
          );
        })}
      </tr>
    );
  };

  // Desktop minimized pill — always rendered, crossfade via opacity/transform
  const minimizedPill = (
    <div
      className={`bg-black/50 backdrop-blur-md rounded-full px-5 py-2.5 border border-white/10 mx-auto w-fit
        transition-[opacity,transform] duration-300 ease-in-out
        ${minimized ? 'opacity-100 scale-100' : 'opacity-0 scale-95 pointer-events-none absolute'}`}
      role="region" aria-label={t('game.score')}
    >
      <div className="flex gap-6 items-center">
        {players.map((p, idx) => {
          const isCurrent = p.id === currentPlayer;
          return (
            <div key={p.id} className={`flex items-center gap-2 transition-[opacity,transform] duration-300 ${isCurrent ? 'scale-110' : 'opacity-70'}`}>
              <span className={`text-xs truncate max-w-[4rem] ${isCurrent ? 'text-yellow-300 font-semibold' : 'text-gray-400'}`}>
                {p.nickname}{p.id === myId ? ` ${t('game.me')}` : ''}
              </span>
              <span className={`font-bold tabular-nums text-lg ${isCurrent ? 'text-white' : 'text-gray-300'}`}>
                {playerStats[idx]?.total ?? 0}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );

  // #11: Mobile — minimized pill with toggle, auto-expand when results ready
  const mobileMinimizedPill = (
    <div className="lg:hidden">
      <button
        type="button"
        onClick={() => setMobileOverride(prev => !(prev ?? shouldAutoExpand))}
        aria-expanded={mobileExpanded}
        className="w-full bg-black/50 backdrop-blur-md rounded-xl px-4 py-2.5 border border-white/10 flex items-center justify-between"
      >
        <div className="flex gap-4 items-center">
          {players.map((p, idx) => {
            const isCurrent = p.id === currentPlayer;
            return (
              <div key={p.id} className={`flex items-center gap-1.5 ${isCurrent ? '' : 'opacity-60'}`}>
                <span className={`text-xs truncate max-w-[4rem] ${isCurrent ? 'text-yellow-300 font-semibold' : 'text-gray-400'}`}>
                  {p.nickname}
                </span>
                <span className={`font-bold tabular-nums ${isCurrent ? 'text-white' : 'text-gray-300'}`}>
                  {playerStats[idx]?.total ?? 0}
                </span>
              </div>
            );
          })}
        </div>
        <svg
          className={`w-4 h-4 text-gray-400 transition-transform duration-200 ${mobileExpanded ? 'rotate-180' : ''}`}
          fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
        </svg>
      </button>
    </div>
  );

  // Full table view — always rendered, crossfade via opacity/transform
  const fullTable = (
    <div className={`transition-[opacity,transform] duration-300 ease-in-out
      ${minimized ? 'opacity-0 scale-95 pointer-events-none' : 'opacity-100 scale-100'}`}
    >
      {mobileMinimizedPill}
      <div
        className={`
          lg:block transition-[grid-template-rows,opacity] duration-300 ease-in-out
          ${mobileExpanded ? 'grid grid-rows-[1fr] opacity-100' : 'hidden lg:block'}
        `}
      >
        <div className="overflow-hidden">
          <div className="bg-black/50 backdrop-blur-md rounded-xl p-3 overflow-auto max-h-[80vh] border border-white/5 mt-2 lg:mt-0 animate-fade-in">
            <table className="w-full border-collapse" aria-label={t('game.score')}>
              <thead>
                <tr>
                  <th className="px-2 py-1 text-left text-xs text-gray-500">{t('game.score')}</th>
                  {players.map(p => (
                    <th key={p.id} className={`px-2 py-1 text-center text-xs transition-colors min-w-0 max-w-[5rem] ${
                      p.id === currentPlayer ? 'text-yellow-300 font-bold' : 'text-gray-500'
                    }`}>
                      <span className="block truncate">{p.nickname}{p.id === myId ? ` ${t('game.me')}` : ''}</span>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {UPPER_CATEGORIES.map(renderRow)}
                <tr className="border-t border-white/10">
                  <td className="px-2 py-1 text-xs text-gray-500">{t('categories.upperBonus')}</td>
                  {playerStats.map(ps => (
                    <td key={ps.id} className="px-2 py-1 text-center text-xs text-gray-500 tabular-nums">
                      {ps.bonusDisplay}
                    </td>
                  ))}
                </tr>
                <tr aria-hidden="true"><td colSpan={players.length + 1} className="h-2" /></tr>
                {LOWER_CATEGORIES.map(renderRow)}
                <tr className="border-t border-white/20">
                  <td className="px-2 py-1 text-sm font-bold text-white">{t('categories.total')}</td>
                  {playerStats.map(ps => (
                    <td key={ps.id} className="px-2 py-1 text-center text-sm font-bold text-white tabular-nums">
                      {ps.total}
                    </td>
                  ))}
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );

  return (
    <div className="relative">
      {minimizedPill}
      {fullTable}
    </div>
  );
});
