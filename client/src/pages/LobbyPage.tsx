import { useState, useEffect, useRef, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import PageLayout from '../components/PageLayout';
import Button from '../components/Button';
import { extractRoomCode } from '../utils/extractRoomCode';
import { NICKNAME_STORAGE_KEY, STORAGE_VERSION_KEY, STORAGE_VERSION, type GameAction, type GameState } from '../hooks/useGameState';
import type { Envelope, PlayerInfo } from '../types/game';

interface Props {
  state: GameState;
  dispatch: React.Dispatch<GameAction>;
  send: (type: string, payload?: unknown) => void;
  on: (type: string, handler: (e: Envelope) => void) => () => void;
  playerId: string | null;
}

export default function LobbyPage({ state, dispatch, send, on }: Props) {
  const { t, i18n } = useTranslation();
  const [nickname, setNickname] = useState(state.nickname);
  const [code, setCode] = useState(() => {
    try {
      const params = new URLSearchParams(window.location.search);
      return params.get('room')?.toUpperCase() || '';
    } catch { return ''; }
  });
  const [password, setPassword] = useState('');
  const [createPassword, setCreatePassword] = useState('');
  const nicknameConfirmed = !!state.nickname;
  const urlRoomCode = useRef(() => {
    try {
      return new URLSearchParams(window.location.search).get('room')?.toUpperCase() || '';
    } catch { return ''; }
  });
  const autoJoinSent = useRef(false);

  useEffect(() => {
    if (!nicknameConfirmed) return;
    const handleRoomEntry = (env: Envelope) => {
      const p = env.payload as { roomCode: string; players?: PlayerInfo[] };
      if (p.players && p.players.length > 0) {
        dispatch({ type: 'SET_ROOM_STATE', roomCode: p.roomCode, players: p.players });
      } else {
        dispatch({ type: 'SET_ROOM', roomCode: p.roomCode });
      }
    };
    const unsubs = [
      on('room:created', handleRoomEntry),
      on('room:joined', handleRoomEntry),
    ];
    return () => unsubs.forEach(u => u());
  }, [on, dispatch, nicknameConfirmed]);

  // Auto-join room if URL contains ?room=XXXXX after nickname is confirmed
  useEffect(() => {
    if (!nicknameConfirmed || autoJoinSent.current) return;
    const roomFromUrl = urlRoomCode.current();
    if (roomFromUrl && roomFromUrl.length >= 4) {
      autoJoinSent.current = true;
      send('room:join', { roomCode: roomFromUrl });
    }
  }, [nicknameConfirmed, send]);

  const handleNicknameSubmit = () => {
    const trimmed = nickname.trim();
    if (!trimmed) return;
    dispatch({ type: 'SET_NICKNAME', nickname: trimmed });
    try {
      localStorage.setItem(NICKNAME_STORAGE_KEY, trimmed);
      localStorage.setItem(STORAGE_VERSION_KEY, String(STORAGE_VERSION));
    } catch { /* quota exceeded or private browsing */ }
  };

  const handleCodePaste = useCallback((e: React.ClipboardEvent<HTMLInputElement>) => {
    const pasted = e.clipboardData.getData('text');
    const extracted = extractRoomCode(pasted);
    if (extracted && extracted !== pasted.toUpperCase()) {
      e.preventDefault();
      setCode(extracted);
    }
  }, []);

  const handleCreate = () => {
    send('room:create', { password: createPassword || undefined });
  };

  const handleJoin = (roomCode: string, pw?: string) => {
    send('room:join', { roomCode, password: pw || undefined });
  };

  const langs = [
    { code: 'ko', label: '\uD55C\uAD6D\uC5B4' },
    { code: 'en', label: 'English' },
    { code: 'ja', label: '\u65E5\u672C\u8A9E' },
  ];

  // Step 1: Nickname input
  if (!nicknameConfirmed) {
    return (
      <PageLayout phase="lobby">
        <div className="w-full max-w-md space-y-6">
          <div className="text-center">
            <h1 className="text-4xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-amber-400 via-yellow-300 to-amber-400 mb-2 drop-shadow-lg">{t('app.title')}</h1>
            <div className="flex justify-center gap-2" role="group" aria-label={t('lobby.languageSelect', 'Language')}>
              {langs.map(l => (
                <button key={l.code} onClick={() => i18n.changeLanguage(l.code)}
                  aria-current={i18n.language === l.code ? 'true' : undefined}
                  className={`px-3 py-1 rounded text-sm focus-visible:ring-2 focus-visible:ring-white transition-colors ${i18n.language === l.code ? 'bg-amber-500 text-black font-semibold' : 'bg-white/10 text-white/70 hover:bg-white/20'}`}>
                  {l.label}
                </button>
              ))}
            </div>
          </div>
          <form onSubmit={e => { e.preventDefault(); handleNicknameSubmit(); }} className="bg-black/40 backdrop-blur-md rounded-xl p-6 space-y-4 border border-white/10 shadow-2xl shadow-emerald-900/30">
            <label htmlFor="nickname" className="block text-gray-300 text-sm font-medium">{t('lobby.nickname')}</label>
            <input id="nickname" name="nickname" autoComplete="username" spellCheck={false} autoFocus={window.matchMedia('(pointer: fine)').matches}
              value={nickname} onChange={e => setNickname(e.target.value)}
              placeholder={t('lobby.nicknamePlaceholder')} maxLength={20}
              className="w-full bg-white/10 text-white rounded-lg px-4 py-3 focus-visible:ring-2 focus-visible:ring-amber-500 text-lg border border-white/10 placeholder:text-white/30 outline-2 outline-transparent" />
            <Button type="submit" disabled={!nickname.trim()} className="w-full text-lg">
              {t('lobby.join')}
            </Button>
          </form>
        </div>
      </PageLayout>
    );
  }

  // Step 2: Room list / create / join
  return (
    <PageLayout phase="lobby">
      <div className="w-full max-w-lg space-y-6">
        <div className="text-center">
          <h1 className="text-4xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-amber-400 via-yellow-300 to-amber-400 mb-2 drop-shadow-lg">{t('app.title')}</h1>
          <div className="flex items-center justify-center gap-2">
            <p className="text-gray-400 text-sm">{nickname}</p>
            <button
              onClick={() => dispatch({ type: 'CLEAR_NICKNAME' })}
              className="text-xs text-white/40 hover:text-white/70 transition-colors focus-visible:ring-2 focus-visible:ring-white rounded px-1.5 py-0.5"
            >
              {t('lobby.changeNickname')}
            </button>
          </div>
        </div>

        <div className="bg-black/40 backdrop-blur-md rounded-xl p-4 space-y-3 border border-white/10 shadow-2xl shadow-emerald-900/30">
          <h2 className="sr-only">{t('lobby.createRoom')}</h2>
          <label className="sr-only" htmlFor="create-password">{t('lobby.passwordPlaceholder')}</label>
          <input id="create-password" name="create-password" autoComplete="new-password" type="password"
            value={createPassword} onChange={e => setCreatePassword(e.target.value)}
            placeholder={t('lobby.passwordPlaceholder')}
            className="w-full bg-white/10 text-white rounded-lg px-4 py-2 focus-visible:ring-2 focus-visible:ring-amber-500 text-sm border border-white/10 placeholder:text-white/30 outline-2 outline-transparent" />
          <Button onClick={handleCreate} className="w-full">
            {t('lobby.createRoom')}
          </Button>
        </div>

        <form onSubmit={e => { e.preventDefault(); handleJoin(code, password); }} className="bg-black/40 backdrop-blur-md rounded-xl p-4 space-y-3 border border-white/10 shadow-2xl shadow-emerald-900/30">
          <h2 className="sr-only">{t('lobby.joinByCode')}</h2>
          <div className="flex gap-2">
            <label className="sr-only" htmlFor="room-code">{t('lobby.codePlaceholder')}</label>
            <input id="room-code" name="room-code" autoComplete="off" spellCheck={false} inputMode="text" autoCapitalize="characters"
              value={code} onChange={e => setCode(e.target.value.toUpperCase())}
              onPaste={handleCodePaste}
              placeholder={t('lobby.codePlaceholder')} maxLength={6}
              className="flex-1 min-w-0 bg-white/10 text-white rounded-lg px-4 py-2 focus-visible:ring-2 focus-visible:ring-amber-500 uppercase tracking-widest border border-white/10 placeholder:text-white/30 outline-2 outline-transparent" />
            <label className="sr-only" htmlFor="join-password">{t('lobby.password')}</label>
            <input id="join-password" name="join-password" autoComplete="current-password" type="password"
              value={password} onChange={e => setPassword(e.target.value)}
              placeholder={t('lobby.password')}
              className="flex-1 min-w-0 bg-white/10 text-white rounded-lg px-4 py-2 focus-visible:ring-2 focus-visible:ring-amber-500 text-sm border border-white/10 placeholder:text-white/30 outline-2 outline-transparent" />
          </div>
          <Button type="submit" variant="secondary" disabled={code.length < 6} className="w-full">
            {t('lobby.join')}
          </Button>
        </form>

      </div>
    </PageLayout>
  );
}
