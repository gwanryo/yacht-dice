import { useState, useEffect, useRef, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import Button from './Button';

interface Props {
  open: boolean;
  nickname: string;
  onSave: (nickname: string) => void;
  onClose: () => void;
}

const langs = [
  { code: 'ko', label: '한국어' },
  { code: 'en', label: 'English' },
  { code: 'ja', label: '日本語' },
];

export default function SettingsModal({ open, nickname, onSave, onClose }: Props) {
  const { t, i18n } = useTranslation();
  const [name, setName] = useState(nickname);
  const inputRef = useRef<HTMLInputElement>(null);
  const backdropRef = useRef<HTMLDivElement>(null);
  const nameRef = useRef(name);
  nameRef.current = name;

  useEffect(() => {
    if (open) {
      setName(nickname);
      const timer = setTimeout(() => inputRef.current?.select(), 80);
      return () => clearTimeout(timer);
    }
  }, [open, nickname]);

  const handleDone = useCallback(() => {
    const trimmed = nameRef.current.trim();
    if (trimmed && trimmed !== nickname) {
      onSave(trimmed);
    }
    onClose();
  }, [nickname, onSave, onClose]);

  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') handleDone();
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [open, handleDone]);

  if (!open) return null;

  return (
    <div
      ref={backdropRef}
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      onClick={e => { if (e.target === backdropRef.current) handleDone(); }}
      role="dialog"
      aria-modal="true"
      aria-label={t('lobby.settings')}
    >
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm animate-fade-in" />

      {/* Panel */}
      <div className="relative w-full max-w-xs animate-modal-enter overflow-hidden rounded-2xl border border-white/[0.08] bg-gradient-to-b from-gray-900/95 to-gray-950/95 shadow-2xl shadow-black/50 backdrop-blur-xl">
        {/* Header */}
        <div className="flex items-center justify-between px-5 pt-5 pb-2">
          <h2 className="font-display text-lg tracking-wide text-white/90">
            {t('lobby.settings')}
          </h2>
          <button
            onClick={handleDone}
            className="-mr-1.5 rounded-lg p-1.5 text-white/30 transition-colors hover:bg-white/5 hover:text-white/70"
            aria-label={t('lobby.done')}
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <path d="M18 6L6 18M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="space-y-4 px-5 pb-5">
          {/* Nickname */}
          <div className="space-y-1.5">
            <label
              htmlFor="settings-nickname"
              className="block text-xs font-medium uppercase tracking-wider text-white/40"
            >
              {t('lobby.nickname')}
            </label>
            <input
              ref={inputRef}
              id="settings-nickname"
              value={name}
              onChange={e => setName(e.target.value)}
              maxLength={20}
              spellCheck={false}
              autoComplete="username"
              className="w-full rounded-lg border border-white/[0.08] bg-white/[0.06] px-4 py-2.5 text-white outline-2 outline-transparent placeholder:text-white/20 focus-visible:ring-2 focus-visible:ring-amber-500/70"
              onKeyDown={e => { if (e.key === 'Enter') handleDone(); }}
            />
          </div>

          {/* Language */}
          <div className="space-y-1.5">
            <span className="block text-xs font-medium uppercase tracking-wider text-white/40">
              {t('lobby.language')}
            </span>
            <div className="flex gap-1.5" role="group" aria-label={t('lobby.languageSelect')}>
              {langs.map(l => (
                <button
                  key={l.code}
                  onClick={() => i18n.changeLanguage(l.code)}
                  aria-current={i18n.language === l.code ? 'true' : undefined}
                  className={`flex-1 rounded-lg border px-2 py-2 text-sm transition-[color,background-color,border-color] ${
                    i18n.language === l.code
                      ? 'border-amber-500/30 bg-amber-500/15 text-amber-300'
                      : 'border-transparent bg-white/[0.04] text-white/40 hover:bg-white/[0.08] hover:text-white/60'
                  }`}
                >
                  {l.label}
                </button>
              ))}
            </div>
          </div>

          {/* Done */}
          <Button onClick={handleDone} disabled={!name.trim()} size="sm" className="w-full">
            {t('lobby.done')}
          </Button>
        </div>
      </div>
    </div>
  );
}
