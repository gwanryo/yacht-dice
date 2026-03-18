import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import type { GameAction } from '../hooks/useGameState';
import type { GameState } from '../hooks/useGameState';
import type { RoomListItem } from '../types/game';

interface Props {
  state: GameState;
  dispatch: React.Dispatch<GameAction>;
  send: (type: string, payload?: unknown) => void;
  on: (type: string, handler: (e: any) => void) => () => void;
  playerId: string | null;
}

export default function LobbyPage({ state, dispatch, send, on, playerId }: Props) {
  const { t, i18n } = useTranslation();
  const [nickname, setNickname] = useState(state.nickname);
  const [code, setCode] = useState('');
  const [password, setPassword] = useState('');
  const [createPassword, setCreatePassword] = useState('');
  const nicknameConfirmed = !!state.nickname;

  useEffect(() => {
    if (!nicknameConfirmed) return;
    const unsub1 = on('room:list', (env: any) => {
      dispatch({ type: 'SET_ROOM_LIST', list: env.payload as RoomListItem[] });
    });
    const unsub2 = on('room:created', (env: any) => {
      const p = env.payload as { roomCode: string };
      dispatch({ type: 'SET_ROOM', roomCode: p.roomCode });
    });
    const unsub3 = on('room:joined', () => {});
    const unsub4 = on('room:state', (env: any) => {
      const p = env.payload as { roomCode: string; players: any[] };
      dispatch({ type: 'SET_ROOM', roomCode: p.roomCode });
      dispatch({ type: 'SET_PLAYERS', players: p.players });
    });
    send('room:list');
    return () => { unsub1(); unsub2(); unsub3(); unsub4(); };
  }, [on, send, dispatch, nicknameConfirmed]);

  const handleNicknameSubmit = () => {
    if (!nickname) return;
    dispatch({ type: 'SET_NICKNAME', nickname });
    localStorage.setItem('yacht-nickname', nickname);
  };

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
      <div className="min-h-screen bg-gradient-to-br from-gray-900 via-purple-900 to-gray-900 flex items-center justify-center p-4">
        <div className="w-full max-w-md space-y-6">
          <div className="text-center">
            <h1 className="text-4xl font-bold text-white mb-2">{t('app.title')}</h1>
            <div className="flex justify-center gap-2">
              {langs.map(l => (
                <button key={l.code} onClick={() => i18n.changeLanguage(l.code)}
                  className={`px-3 py-1 rounded text-sm focus-visible:ring-2 focus-visible:ring-white ${i18n.language === l.code ? 'bg-white text-black' : 'bg-white/10 text-white'}`}>
                  {l.label}
                </button>
              ))}
            </div>
          </div>
          <form onSubmit={e => { e.preventDefault(); handleNicknameSubmit(); }} className="bg-black/30 backdrop-blur rounded-xl p-6 space-y-4">
            <label htmlFor="nickname" className="block text-gray-300 text-sm font-medium">{t('lobby.nickname')}</label>
            <input id="nickname" name="nickname" autoComplete="username" spellCheck={false} autoFocus
              value={nickname} onChange={e => setNickname(e.target.value.trim())}
              placeholder={t('lobby.nicknamePlaceholder')} maxLength={20}
              className="w-full bg-white/10 text-white rounded-lg px-4 py-3 outline-none focus:ring-2 focus:ring-purple-500 text-lg" />
            <button type="submit" disabled={!nickname}
              className="w-full bg-purple-600 hover:bg-purple-700 disabled:opacity-40 focus-visible:ring-2 focus-visible:ring-white text-white font-bold py-3 rounded-lg transition-colors text-lg">
              {t('lobby.join')}
            </button>
          </form>
        </div>
      </div>
    );
  }

  // Step 2: Room list / create / join
  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-900 via-purple-900 to-gray-900 flex items-center justify-center p-4">
      <div className="w-full max-w-lg space-y-6">
        <div className="text-center">
          <h1 className="text-4xl font-bold text-white mb-2">{t('app.title')}</h1>
          <p className="text-gray-400 text-sm">{nickname}</p>
        </div>

        <div className="bg-black/30 backdrop-blur rounded-xl p-4 space-y-3">
          <label className="sr-only" htmlFor="create-password">{t('lobby.passwordPlaceholder')}</label>
          <input id="create-password" name="create-password" autoComplete="off"
            value={createPassword} onChange={e => setCreatePassword(e.target.value)}
            placeholder={t('lobby.passwordPlaceholder')} type="password"
            className="w-full bg-white/10 text-white rounded-lg px-4 py-2 outline-none focus:ring-2 focus:ring-purple-500 text-sm" />
          <button onClick={handleCreate}
            className="w-full bg-purple-600 hover:bg-purple-700 focus-visible:ring-2 focus-visible:ring-white text-white font-bold py-3 rounded-lg transition-colors">
            {t('lobby.createRoom')}
          </button>
        </div>

        <div className="bg-black/30 backdrop-blur rounded-xl p-4 space-y-3">
          <div className="flex gap-2">
            <label className="sr-only" htmlFor="room-code">{t('lobby.codePlaceholder')}</label>
            <input id="room-code" name="room-code" autoComplete="off" spellCheck={false}
              value={code} onChange={e => setCode(e.target.value.toUpperCase())}
              placeholder={t('lobby.codePlaceholder')} maxLength={6}
              className="flex-1 bg-white/10 text-white rounded-lg px-4 py-2 outline-none focus:ring-2 focus:ring-purple-500 uppercase tracking-widest" />
            <label className="sr-only" htmlFor="join-password">{t('lobby.password')}</label>
            <input id="join-password" name="join-password" autoComplete="off"
              value={password} onChange={e => setPassword(e.target.value)}
              placeholder={t('lobby.password')} type="password"
              className="flex-1 bg-white/10 text-white rounded-lg px-4 py-2 outline-none focus:ring-2 focus:ring-purple-500 text-sm" />
          </div>
          <button onClick={() => handleJoin(code, password)} disabled={code.length < 6}
            className="w-full bg-green-600 hover:bg-green-700 focus-visible:ring-2 focus-visible:ring-white disabled:opacity-40 text-white font-bold py-3 rounded-lg transition-colors">
            {t('lobby.join')}
          </button>
        </div>

        <div className="bg-black/30 backdrop-blur rounded-xl p-4">
          <div className="flex justify-between items-center mb-3">
            <span className="text-gray-400 text-sm">{t('lobby.joinByCode')}</span>
            <button onClick={() => send('room:list')} className="text-sm text-purple-400 hover:text-purple-300 focus-visible:ring-2 focus-visible:ring-white rounded">
              {t('lobby.refresh')}
            </button>
          </div>
          {state.roomList.length === 0 ? (
            <p className="text-gray-500 text-center py-4">{t('lobby.noRooms')}</p>
          ) : (
            <div className="space-y-2">
              {state.roomList.map(r => (
                <button key={r.code}
                  onClick={() => {
                    if (r.status !== 'waiting') return;
                    if (r.hasPassword) {
                      const pw = prompt(t('lobby.enterPassword'));
                      if (pw != null) handleJoin(r.code, pw);
                    } else {
                      handleJoin(r.code);
                    }
                  }}
                  disabled={r.status !== 'waiting'}
                  className={`flex w-full justify-between items-center p-3 rounded-lg text-left ${r.status === 'waiting' ? 'bg-white/5 hover:bg-white/10' : 'bg-white/5 opacity-50'}`}>
                  <span className="text-white font-mono">{r.code}{r.hasPassword ? ' 🔒' : ''}</span>
                  <div className="flex items-center gap-3">
                    <span className="text-gray-400 text-sm">{r.playerCount}/4 {t('lobby.players')}</span>
                    <span className={`text-xs ${r.status === 'waiting' ? 'text-green-400' : 'text-orange-400'}`}>
                      {t(`lobby.${r.status}`)}
                    </span>
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
