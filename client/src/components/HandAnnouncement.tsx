import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { Category } from '../types/game';
import { SPECIAL_HANDS } from '../utils/scoreCalculator';
import { CELEBRATION_COLORS } from '../utils/constants';

/** Tier determines visual intensity */
function getTier(cat: Category): 'epic' | 'legendary' | 'normal' {
  if (cat === 'yacht') return 'legendary';
  if (cat === 'largeStraight' || cat === 'fullHouse') return 'epic';
  return 'normal';
}

const PARTICLE_COUNT = 24;
const PARTICLES = Array.from({ length: PARTICLE_COUNT }, (_, i) => ({
  angle: (i / PARTICLE_COUNT) * Math.PI * 2,
  distance: 80 + Math.random() * 120,
  size: 4 + Math.random() * 6,
  delay: Math.random() * 0.3,
  color: CELEBRATION_COLORS[i % CELEBRATION_COLORS.length],
}));

interface Props {
  category: Category | null;
  score?: number;
  onDone: () => void;
}

export default function HandAnnouncement({ category, score, onDone }: Props) {
  const { t } = useTranslation();
  const [phase, setPhase] = useState<'enter' | 'hold' | 'exit' | 'done'>('enter');

  const isSpecial = category && SPECIAL_HANDS.includes(category);

  useEffect(() => {
    if (!isSpecial) {
      onDone();
      return;
    }
    setPhase('enter');
    const holdTimer = setTimeout(() => setPhase('hold'), 500);
    const exitTimer = setTimeout(() => setPhase('exit'), 3000);
    const doneTimer = setTimeout(() => {
      setPhase('done');
      onDone();
    }, 3600);
    return () => {
      clearTimeout(holdTimer);
      clearTimeout(exitTimer);
      clearTimeout(doneTimer);
    };
  }, [category, isSpecial, onDone]);

  if (!isSpecial || phase === 'done') return null;

  const tier = getTier(category);
  const label = t(`categories.${category}`);

  return (
    <div
      className="fixed inset-0 z-40 flex items-center justify-center pointer-events-none"
      aria-live="assertive"
      role="alert"
    >
      {/* Backdrop flash */}
      <div
        className={`absolute inset-0 transition-opacity duration-300 ${
          phase === 'exit' ? 'opacity-0' : 'opacity-100'
        }`}
        style={{
          background: tier === 'legendary'
            ? 'radial-gradient(ellipse at center, rgba(245,158,11,0.3) 0%, transparent 70%)'
            : tier === 'epic'
              ? 'radial-gradient(ellipse at center, rgba(139,92,246,0.2) 0%, transparent 70%)'
              : 'radial-gradient(ellipse at center, rgba(16,185,129,0.15) 0%, transparent 70%)',
        }}
      />

      {/* Burst particles — all tiers, normal uses fewer */}
      <div className="absolute inset-0 flex items-center justify-center">
        {PARTICLES.filter((_, i) => tier !== 'normal' || i % 3 === 0).map((p, i) => (
            <div
              key={i}
              className="absolute rounded-full"
              style={{
                width: p.size,
                height: p.size,
                backgroundColor: p.color,
                opacity: phase === 'exit' ? 0 : phase === 'enter' ? 0 : 1,
                transform: phase === 'hold'
                  ? `translate(${Math.cos(p.angle) * p.distance}px, ${Math.sin(p.angle) * p.distance}px) scale(1)`
                  : phase === 'enter'
                    ? 'translate(0, 0) scale(0)'
                    : `translate(${Math.cos(p.angle) * p.distance * 1.5}px, ${Math.sin(p.angle) * p.distance * 1.5}px) scale(0)`,
                transition: `all ${0.4 + p.delay}s cubic-bezier(0.22, 1, 0.36, 1)`,
                transitionDelay: `${p.delay}s`,
              }}
            />
          ))}
      </div>

      {/* Hand name with glassmorphism panel */}
      <div
        className={`relative text-center transition-[transform,opacity] duration-400 ${
          phase === 'enter' ? 'scale-[2] opacity-0' :
          phase === 'exit' ? 'scale-90 opacity-0 translate-y-4' :
          'scale-100 opacity-100'
        }`}
        style={{ transitionTimingFunction: 'cubic-bezier(0.22, 1, 0.36, 1)' }}
      >
        <div className="bg-black/40 backdrop-blur-xl rounded-2xl px-10 py-6 border border-white/20 shadow-2xl">
          <div
            className={`font-bold tracking-wider ${
              tier === 'legendary' ? 'text-6xl sm:text-7xl' :
              tier === 'epic' ? 'text-5xl sm:text-6xl' :
              'text-4xl sm:text-5xl'
            }`}
            style={{
              fontFamily: '"Outfit", system-ui, sans-serif',
              color: 'transparent',
              backgroundClip: 'text',
              WebkitBackgroundClip: 'text',
              backgroundImage: tier === 'legendary'
                ? 'linear-gradient(135deg, #fde68a, #f59e0b, #fde68a)'
                : tier === 'epic'
                  ? 'linear-gradient(135deg, #c4b5fd, #8b5cf6, #c4b5fd)'
                  : 'linear-gradient(135deg, #6ee7b7, #10b981, #6ee7b7)',
              filter: tier === 'legendary' ? 'drop-shadow(0 0 30px rgba(245,158,11,0.5))' : undefined,
            }}
          >
            {label}
          </div>
          {score !== undefined && score > 0 && (
            <div className={`mt-2 text-2xl font-bold tabular-nums ${
              tier === 'legendary' ? 'text-amber-300/90' :
              tier === 'epic' ? 'text-purple-300/90' :
              'text-emerald-300/90'
            }`}>
              +{score}
            </div>
          )}
          {tier === 'legendary' && (
            <div className="text-amber-300/70 text-lg mt-1 tracking-widest uppercase animate-pulse">
              YACHT!
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
