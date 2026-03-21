import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

// Comprehensive review tests — catches issues found via
// Vercel React Best Practices, Web Interface Guidelines, and Frontend Design audits.
// These tests complement existing audit tests with broader coverage.

const _dir = dirname(fileURLToPath(import.meta.url));
const CLIENT_ROOT = resolve(_dir, '../..');

function readFile(relativePath: string): string {
  return readFileSync(resolve(CLIENT_ROOT, relativePath), 'utf-8');
}

/** Recursively collect .tsx files from a directory */
function collectTsx(dir: string): string[] {
  const results: string[] = [];
  for (const entry of readdirSync(resolve(CLIENT_ROOT, dir), { withFileTypes: true })) {
    const rel = `${dir}/${entry.name}`;
    if (entry.isDirectory() && !entry.name.includes('test') && !entry.name.includes('audit')) {
      results.push(...collectTsx(rel));
    } else if (entry.name.endsWith('.tsx') && !entry.name.includes('.test.')) {
      results.push(rel);
    }
  }
  return results;
}

// ─── Web Guidelines: Animation ───────────────────────────────────────────────

describe('Web Guidelines: transition-all across ALL components', () => {
  it('no component file should use Tailwind "transition-all"', () => {
    const files = collectTsx('src/components').concat(collectTsx('src/pages'));
    const violations: string[] = [];

    for (const file of files) {
      const content = readFile(file);
      if (/\btransition-all\b/.test(content)) {
        violations.push(file);
      }
    }

    expect(
      violations,
      `transition-all found in: ${violations.join(', ')}. ` +
      'Use transition-[specific-properties] instead per Web Interface Guidelines.'
    ).toHaveLength(0);
  });
});

// ─── Vercel React: Re-render Optimization ────────────────────────────────────

describe('Vercel React: no useEffect for derived state', () => {
  it('ScoreBoard should not use useEffect to sync mobileExpanded from shouldAutoExpand', () => {
    const content = readFile('src/components/ScoreBoard.tsx');

    // Pattern: useEffect that just calls setState with a value computed from props/state.
    // This causes an extra render cycle — derive during render instead.
    const hasEffectForMobileExpanded =
      /useEffect\(\s*\(\)\s*=>\s*\{?\s*setMobileExpanded\(/.test(content);

    expect(
      hasEffectForMobileExpanded,
      'ScoreBoard uses useEffect to set mobileExpanded from shouldAutoExpand, ' +
      'causing an unnecessary re-render cycle. Derive state during render instead ' +
      '(rerender-derived-state-no-effect).'
    ).toBe(false);
  });
});

// ─── Vercel React: Constant Hoisting ─────────────────────────────────────────

describe('Vercel React: constants should not be created inside hooks', () => {
  it('GamePage should not create constant arrays inside useEffect', () => {
    const content = readFile('src/pages/GamePage.tsx');

    // Find all useEffect bodies and check for const [...] declarations
    // that look like constant arrays (string literals only)
    const effectBodies = content.match(/useEffect\(\(\)\s*=>\s*\{[\s\S]*?\n\s*\}, \[/g) || [];

    const violations: string[] = [];
    for (const body of effectBodies) {
      // Match: const VARNAME: type[] = ['literal', ...] inside effect
      const constArrays = body.match(/const\s+[A-Z_]+\s*:\s*\w+\[\]\s*=\s*\[/g) || [];
      violations.push(...constArrays);
    }

    expect(
      violations.length,
      `Found constant array(s) inside useEffect: ${violations.join('; ')}. ` +
      'Hoist constant arrays to module level to avoid re-creation on each effect run.'
    ).toBe(0);
  });
});

// ─── Web Guidelines: Accessibility — aria-expanded ───────────────────────────

describe('Web Guidelines: expandable controls need aria-expanded', () => {
  it('ScoreBoard mobile toggle button should have aria-expanded', () => {
    const content = readFile('src/components/ScoreBoard.tsx');

    // Find the mobile toggle button (it toggles mobileExpanded)
    const hasToggle = content.includes('setMobileExpanded');
    if (!hasToggle) return; // no toggle = no issue

    // The button that calls setMobileExpanded should have aria-expanded
    expect(
      content.includes('aria-expanded'),
      'ScoreBoard mobile toggle button must have aria-expanded attribute ' +
      'to communicate expanded/collapsed state to screen readers.'
    ).toBe(true);
  });
});

// ─── Web Guidelines: autoFocus desktop guard ─────────────────────────────────

describe('Web Guidelines: autoFocus should be desktop-only', () => {
  it('ConfirmDialog should guard autoFocus with pointer:fine media query', () => {
    const content = readFile('src/components/ConfirmDialog.tsx');

    // The guidelines say: "autoFocus sparingly—desktop only, single primary input; avoid on mobile"
    // Check that autoFocus is either:
    // 1. Not used at all, or
    // 2. Guarded by a desktop media query check (pointer: fine)
    const hasAutoFocus = /autoFocus/.test(content);
    if (!hasAutoFocus) return; // no autoFocus = no issue

    const hasDesktopGuard =
      content.includes('pointer: fine') ||
      content.includes('pointer:fine');

    expect(
      hasDesktopGuard,
      'ConfirmDialog uses autoFocus without a desktop-only guard. ' +
      'Use autoFocus={window.matchMedia("(pointer: fine)").matches} ' +
      'to avoid stealing focus on mobile devices.'
    ).toBe(true);
  });
});

// ─── Critical: Room join event handling ──────────────────────────────────────

describe('Critical: LobbyPage must handle room:joined event', () => {
  it('LobbyPage should register a handler for room:joined (not just room:created)', () => {
    const content = readFile('src/pages/LobbyPage.tsx');

    // The server sends "room:joined" when a player successfully joins an existing room.
    // Without handling this event, the client stays stuck in the lobby phase.
    const handlesRoomJoined =
      content.includes("'room:joined'") || content.includes('"room:joined"');

    expect(
      handlesRoomJoined,
      'LobbyPage must handle "room:joined" event from the server. ' +
      'Without this, players cannot join existing rooms because room:state is blocked in lobby phase.'
    ).toBe(true);
  });
});

// ─── Web Guidelines: Hover state contrast ────────────────────────────────────

describe('Web Guidelines: hover states must differ from rest states', () => {
  it('CSS theme hover colors should differ from their base colors', () => {
    const css = readFile('src/index.css');

    // Extract color pairs: --color-X and --color-X-hover
    const colorPattern = /--color-([\w-]+):\s*(#[0-9a-fA-F]{3,8}|rgba?\([^)]+\))/g;
    const colors = new Map<string, string>();
    let match: RegExpExecArray | null;
    while ((match = colorPattern.exec(css)) !== null) {
      colors.set(match[1], match[2].toLowerCase());
    }

    const violations: string[] = [];
    for (const [name, value] of colors) {
      if (name.endsWith('-hover')) {
        const baseName = name.replace(/-hover$/, '');
        const baseValue = colors.get(baseName);
        if (baseValue && baseValue === value) {
          violations.push(`--color-${baseName} (${baseValue}) === --color-${name} (${value})`);
        }
      }
    }

    expect(
      violations.length,
      `Hover colors identical to base colors: ${violations.join('; ')}. ` +
      'Hover states must increase contrast per Web Interface Guidelines.'
    ).toBe(0);
  });
});

// ─── Critical: WebSocket reconnection token ──────────────────────────────────

describe('Critical: WebSocket reconnection must use signed token', () => {
  it('useWebSocket should send "token" param (not "playerId") for reconnection', () => {
    const content = readFile('src/hooks/useWebSocket.ts');

    // The server expects a query param called "token" containing the signed token.
    // Sending "playerId" (raw ID) will fail server verification.
    const sendsToken = content.includes("params.set('token'") || content.includes('params.set("token"');
    const sendsPlayerId = content.includes("params.set('playerId'") || content.includes('params.set("playerId"');

    expect(
      sendsToken,
      'useWebSocket must send "token" query param for reconnection (server expects signed token)'
    ).toBe(true);

    expect(
      sendsPlayerId,
      'useWebSocket should NOT send "playerId" as reconnection param — server expects "token"'
    ).toBe(false);
  });

  it('useWebSocket should store the signed token from the server connected message', () => {
    const content = readFile('src/hooks/useWebSocket.ts');

    // The server sends { playerId, token } in the connected message.
    // The client must store the token for use in reconnection.
    const storesToken = content.includes('tokenRef') || content.includes('token');
    const extractsToken =
      /payload\.token|payload\s*as\s*\{[^}]*token/.test(content);

    expect(
      storesToken && extractsToken,
      'useWebSocket must extract and store the signed "token" from the connected message payload'
    ).toBe(true);
  });
});

// ─── Critical: Room entry must include player list ───────────────────────────

describe('Critical: Room entry handler must support player list', () => {
  it('LobbyPage room entry handler should dispatch SET_ROOM_STATE when players are present', () => {
    const content = readFile('src/pages/LobbyPage.tsx');

    // The server now includes players in room:joined/room:created responses.
    // The client must use SET_ROOM_STATE (not just SET_ROOM) to include the player list,
    // avoiding a timing bug where the subsequent room:state is blocked by a stale getPhase() closure.
    const handlesPlayers =
      content.includes('SET_ROOM_STATE') && content.includes('players');

    expect(
      handlesPlayers,
      'LobbyPage room entry handler must dispatch SET_ROOM_STATE with players when the server includes them. ' +
      'Using only SET_ROOM causes a timing bug where the subsequent room:state broadcast is blocked by the stale getPhase() closure.'
    ).toBe(true);
  });
});

// ─── React: Timer cleanup on unmount ─────────────────────────────────────────

describe('React: timers must be cleaned up on unmount', () => {
  it('GamePage should clean up hoverTimerRef on unmount', () => {
    const content = readFile('src/pages/GamePage.tsx');

    // If a component uses a timer ref, it should clear it in a cleanup effect
    const hasHoverTimer = content.includes('hoverTimerRef');
    if (!hasHoverTimer) return;

    // Look for a useEffect cleanup that clears the hover timer
    const hasCleanup =
      /useEffect\(\(\)\s*=>\s*\{?\s*return\s*\(\)\s*=>\s*clearTimeout\(hoverTimerRef/.test(content);

    expect(
      hasCleanup,
      'GamePage must clean up hoverTimerRef on unmount to prevent timer leaks'
    ).toBe(true);
  });
});

// ─── Bug regression: room:state should not force phase change ────────────────

describe('Critical: room:state must not override game/result phase', () => {
  it('useGameEvents room:state handler should only process in room phase', () => {
    const content = readFile('src/hooks/useGameEvents.ts');

    // room:state should ONLY be processed when phase is 'room'.
    const hasStrictGuard =
      /room:state[\s\S]*?getPhase\(\)\s*!==\s*['"]room['"]/.test(content);

    expect(
      hasStrictGuard,
      'useGameEvents room:state handler must check getPhase() !== "room". ' +
      'Processing room:state in result/game phase causes incorrect phase transitions.'
    ).toBe(true);
  });

  it('useGameEvents should handle rematch:start event', () => {
    const content = readFile('src/hooks/useGameEvents.ts');

    expect(
      content.includes("'rematch:start'") || content.includes('"rematch:start"'),
      'useGameEvents must handle rematch:start event for result→room transition'
    ).toBe(true);
  });
});

// ─── Bug regression: App.tsx connection strings must use i18n ────────────────

describe('Critical: App.tsx connection status must use i18n', () => {
  it('App.tsx should not have hardcoded English connection strings', () => {
    const content = readFile('src/App.tsx');

    const hardcoded = ['Reconnecting', 'Connection lost', '>Retry<'];
    for (const str of hardcoded) {
      expect(
        content.includes(str),
        `App.tsx contains hardcoded "${str}" — use t() from i18next instead`
      ).toBe(false);
    }
  });
});

// ─── Bug regression: Rematch must require 2+ players ─────────────────────────

describe('Critical: Server Rematch must require at least 2 players', () => {
  it('room.go Rematch() should guard against solo rematch', () => {
    const content = readFile('../server/room/room.go');

    expect(
      content.includes('len(r.players) >= 2'),
      'room.go Rematch() must check len(r.players) >= 2 to prevent solo rematch'
    ).toBe(true);
  });
});

// ─── Critical: Server restart must reset client to lobby ─────────────────────

describe('Critical: Client must handle server restart (session reset)', () => {
  it('useWebSocket should detect playerId change and expose onSessionReset', () => {
    const content = readFile('src/hooks/useWebSocket.ts');

    // When server restarts, signing key changes → token verification fails →
    // server creates new player → new playerId. Client must detect this.
    expect(
      content.includes('onSessionReset'),
      'useWebSocket must expose onSessionReset callback for server restart detection'
    ).toBe(true);

    expect(
      content.includes('idChanged') || content.includes('playerIdRef.current'),
      'useWebSocket must compare old and new playerId to detect session reset'
    ).toBe(true);
  });

  it('App.tsx should wire onSessionReset to RESET_GAME', () => {
    const content = readFile('src/App.tsx');

    expect(
      content.includes('onSessionReset') && content.includes('RESET_GAME'),
      'App.tsx must call onSessionReset to dispatch RESET_GAME on server restart'
    ).toBe(true);
  });
});

// ─── Emoji: client and server must be in sync ────────────────────────────────

describe('Critical: Client emojis must all be valid on server', () => {
  it('all client EMOJIS must exist in server validEmojis', () => {
    const clientContent = readFile('src/components/ReactionBar.tsx');
    const serverContent = readFile('../server/message/message.go');

    const clientEmojis = clientContent.match(/\\u\{[0-9A-Fa-f]+\}/g) || [];
    const serverEmojis = serverContent.match(/\\U[0-9A-Fa-f]{8}/g) || [];

    const clientCodes = [...new Set(clientEmojis.map(e => {
      const hex = e.replace(/\\u\{|\}/g, '').toUpperCase().padStart(8, '0');
      return `\\U${hex}`;
    }))];
    const serverSet = new Set(serverEmojis.map(e => e.toUpperCase()));
    const missing = clientCodes.filter(c => !serverSet.has(c));

    expect(
      missing.length,
      `Client emojis not in server: ${missing.join(', ')}`
    ).toBe(0);
  });
});

// ─── Hand announcement: triggers on dice settle ──────────────────────────────

describe('Critical: Hand announcement triggers on dice settle', () => {
  it('GamePage auto-detects special hands on settle', () => {
    const content = readFile('src/pages/GamePage.tsx');
    const hasSettleDetection =
      content.includes("rollPhase !== 'settled'") && content.includes('isSpecialHand');
    expect(hasSettleDetection, 'Must detect hands on rollPhase settled').toBe(true);
  });

  it('handleScore does NOT trigger announcement', () => {
    const content = readFile('src/pages/GamePage.tsx');
    const match = content.match(/const handleScore = useCallback\(\(category[^)]*\)\s*=>\s*\{([\s\S]*?)\},\s*\[/);
    if (match) {
      expect(match[1].includes('setAnnouncedHand'), 'handleScore must not call setAnnouncedHand').toBe(false);
    }
  });

  it('no duplicate announcement via lastScored effect', () => {
    const content = readFile('src/pages/GamePage.tsx');
    // The lastScored-based announcement effect should be removed to prevent double display
    const hasLastScoredEffect =
      /useEffect\(\(\)\s*=>\s*\{[\s\S]*?lastScored[\s\S]*?setAnnouncedHand/.test(content);
    expect(hasLastScoredEffect, 'lastScored effect must be removed to prevent double announcement').toBe(false);
  });

  it('SPECIAL_CATEGORIES ordered by score descending', () => {
    const content = readFile('src/pages/GamePage.tsx');
    const match = content.match(/const SPECIAL_CATEGORIES[^[]*\[([^\]]+)\]/);
    if (match) {
      const cats = match[1].replace(/'/g, '').split(',').map((s: string) => s.trim());
      const expectedOrder = ['yacht', 'largeStraight', 'smallStraight', 'fullHouse', 'fourOfAKind'];
      expect(cats, 'SPECIAL_CATEGORIES must be ordered yacht→fourOfAKind (score desc)').toEqual(expectedOrder);
    }
  });
});

// ─── Opponent status: shake/roll/idle distinction ────────────────────────────

describe('Critical: Opponent status shows shake/roll state', () => {
  it('GamePage has opponentShaking and opponentRolled', () => {
    const content = readFile('src/pages/GamePage.tsx');
    expect(content.includes('opponentShaking') && content.includes('opponentRolled')).toBe(true);
  });

  it('all i18n files have opponentShaking, opponentRolled, and opponentChoosing', () => {
    for (const file of ['src/i18n/en.json', 'src/i18n/ko.json', 'src/i18n/ja.json']) {
      const content = readFile(file);
      expect(content.includes('opponentShaking'), `${file} missing opponentShaking`).toBe(true);
      expect(content.includes('opponentRolled'), `${file} missing opponentRolled`).toBe(true);
      expect(content.includes('opponentChoosing'), `${file} missing opponentChoosing`).toBe(true);
    }
  });
});
