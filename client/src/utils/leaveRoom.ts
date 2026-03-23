import type { GameAction } from '../hooks/useGameState';

export function leaveRoom(
  send: (type: string, payload?: unknown) => void,
  dispatch: React.Dispatch<GameAction>,
) {
  send('room:leave');
  const url = new URL(window.location.href);
  url.searchParams.delete('room');
  window.history.replaceState({}, '', url);
  dispatch({ type: 'RESET_GAME' });
}
