import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

// Comprehensive Web Interface Guidelines compliance tests.
// These tests read source files and check for anti-patterns and requirements.

const _dir = dirname(fileURLToPath(import.meta.url));
const CLIENT_ROOT = resolve(_dir, '../..');

function readFile(relativePath: string): string {
  return readFileSync(resolve(CLIENT_ROOT, relativePath), 'utf-8');
}

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

describe('Web Guidelines: Accessibility', () => {
  // A5: Canvas elements for interactive 3D need touch-action
  it('DiceScene canvas should have touch-action style for mobile', () => {
    const content = readFile('src/components/DiceScene.tsx');
    expect(
      content.includes('touch-action') || content.includes('touchAction'),
      'DiceScene canvas should set touch-action: none for mobile OrbitControls compatibility'
    ).toBe(true);
  });

  it('Interactive elements use <button> or <a>, not <div onClick>', () => {
    const files = [
      'src/components/ScoreBoard.tsx',
      'src/components/ReactionBar.tsx',
      'src/components/DiceTray.tsx',
      'src/pages/LobbyPage.tsx',
      'src/pages/RoomPage.tsx',
      'src/pages/GamePage.tsx',
      'src/pages/ResultPage.tsx',
    ];

    for (const file of files) {
      const content = readFile(file);
      const divOnClickPattern = /<div[^>]*onClick[^>]*>/g;
      const matches = content.match(divOnClickPattern) || [];

      for (const match of matches) {
        const isAriaHidden = match.includes('aria-hidden="true"') || match.includes("aria-hidden='true'");
        expect(
          isAriaHidden,
          `${file}: Found <div onClick> without aria-hidden — use <button> instead:\n  ${match}`
        ).toBe(true);
      }
    }
  });
});

describe('Web Guidelines: Animation', () => {
  it('CSS should honor prefers-reduced-motion', () => {
    const css = readFile('src/index.css');
    expect(
      css.includes('prefers-reduced-motion'),
      'index.css must include prefers-reduced-motion media query'
    ).toBe(true);
  });

  it('CSS should not use "transition: all"', () => {
    const css = readFile('src/index.css');
    expect(
      css.includes('transition: all'),
      'index.css must not use "transition: all" — list properties explicitly'
    ).toBe(false);
  });

  it('Components should not use Tailwind "transition-all" class', () => {
    const files = [
      'src/components/Button.tsx',
      'src/components/DiceTray.tsx',
      'src/components/ScoreBoard.tsx',
      'src/components/ReactionBar.tsx',
      'src/pages/GamePage.tsx',
    ];

    for (const file of files) {
      const content = readFile(file);
      const hasTransitionAll = / transition-all[ "'`\n]/.test(content) ||
        /'transition-all'/.test(content) ||
        /"transition-all"/.test(content);

      expect(
        hasTransitionAll,
        `${file}: Uses "transition-all" — use transition-[specific-properties] instead`
      ).toBe(false);
    }
  });
});

describe('Web Guidelines: Typography', () => {
  it('CSS should use text-wrap: balance on headings', () => {
    const css = readFile('src/index.css');
    expect(
      css.includes('text-wrap: balance') || css.includes('text-wrap:balance'),
      'Headings should use text-wrap: balance'
    ).toBe(true);
  });

  it('Number displays should use tabular-nums', () => {
    const scoreBoard = readFile('src/components/ScoreBoard.tsx');
    expect(scoreBoard.includes('tabular-nums')).toBe(true);
  });
});

describe('Web Guidelines: Dark Mode', () => {
  it('HTML should have color-scheme: dark', () => {
    const html = readFile('index.html');
    expect(html.includes('color-scheme: dark') || html.includes('color-scheme:dark')).toBe(true);
  });

  it('HTML should have <meta name="theme-color">', () => {
    const html = readFile('index.html');
    expect(html.includes('theme-color')).toBe(true);
  });
});

describe('Web Guidelines: Touch & Interaction', () => {
  it('body should have touch-action: manipulation', () => {
    const css = readFile('src/index.css');
    expect(
      css.includes('touch-action: manipulation') || css.includes('touch-action:manipulation')
    ).toBe(true);
  });

  it('body should have overscroll-behavior: contain', () => {
    const css = readFile('src/index.css');
    expect(
      css.includes('overscroll-behavior: contain') || css.includes('overscroll-behavior:contain')
    ).toBe(true);
  });
});

describe('Web Guidelines: Forms', () => {
  it('inputs should have autocomplete attributes', () => {
    const lobby = readFile('src/pages/LobbyPage.tsx');
    const inputPattern = /<input[^/]*?\/>/g;
    const inputs = lobby.match(inputPattern) || [];

    for (const input of inputs) {
      expect(
        input.includes('autoComplete') || input.includes('autocomplete'),
        `Input missing autocomplete:\n  ${input.substring(0, 80)}…`
      ).toBe(true);
    }
  });

  it('inputs should have name attributes', () => {
    const lobby = readFile('src/pages/LobbyPage.tsx');
    const inputPattern = /<input[^/]*?\/>/g;
    const inputs = lobby.match(inputPattern) || [];

    for (const input of inputs) {
      expect(
        input.includes('name='),
        `Input missing name attribute:\n  ${input.substring(0, 80)}…`
      ).toBe(true);
    }
  });
});

describe('Web Guidelines: Performance', () => {
  it('should preconnect to font CDN', () => {
    const html = readFile('index.html');
    expect(html.includes('preconnect') && html.includes('fonts.googleapis.com')).toBe(true);
  });

  it('fonts should use font-display: swap', () => {
    const html = readFile('index.html');
    expect(html.includes('display=swap')).toBe(true);
  });
});

describe('Web Guidelines: Navigation & State', () => {
  // A3: Destructive actions need confirmation
  it('ResultPage should confirm before leaving to lobby', () => {
    const content = readFile('src/pages/ResultPage.tsx');
    expect(
      content.includes('ConfirmDialog') || content.includes('confirmLeave') || content.includes('confirm'),
      'ResultPage "Back to Lobby" should have confirmation for destructive action'
    ).toBe(true);
  });
});

describe('Web Guidelines: Content', () => {
  it('loading states should use ellipsis (…) not three dots (...)', () => {
    const files = ['src/i18n/en.json', 'src/i18n/ko.json', 'src/i18n/ja.json'];

    for (const file of files) {
      const content = readFile(file);
      const parsed = JSON.parse(content) as Record<string, unknown>;
      const checkForThreeDots = (obj: Record<string, unknown>, path = '') => {
        for (const [key, value] of Object.entries(obj)) {
          const fullPath = path ? `${path}.${key}` : key;
          if (typeof value === 'string') {
            if (value.endsWith('...')) {
              expect.fail(`${file}:${fullPath} ends with "..." — should use "…" (U+2026)`);
            }
          } else if (typeof value === 'object' && value !== null) {
            checkForThreeDots(value as Record<string, unknown>, fullPath);
          }
        }
      };
      checkForThreeDots(parsed);
    }
  });
});

describe('Web Guidelines: Content — no raw unicode escapes in JSX text', () => {
  it('TSX files should not use \\uXXXX escapes in JSX text content (only in JS expressions)', () => {
    const files = collectTsx('src/components').concat(collectTsx('src/pages'));
    files.push('src/App.tsx');
    const violations: string[] = [];

    for (const file of files) {
      if (!file.endsWith('.tsx')) continue;
      const content = readFile(file);
      const lines = content.split('\n');
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        // Skip comments and imports
        if (line.trim().startsWith('//') || line.trim().startsWith('import') || line.trim().startsWith('*')) continue;
        // Match >...text with \uXXXX...< pattern (JSX text content, not inside {})
        // This detects unicode escapes between JSX tags that won't be interpreted
        if (/>[^<{]*\\u[0-9a-fA-F]{4}[^<]*</.test(line)) {
          violations.push(`${file}:${i + 1}: ${line.trim()}`);
        }
      }
    }

    expect(
      violations.length,
      `Found raw \\uXXXX escapes in JSX text (these render literally, not as Unicode):\n${violations.join('\n')}\n` +
      'Use the actual character or wrap in {\'\\uXXXX\'} JS expression instead.'
    ).toBe(0);
  });
});

describe('Web Guidelines: Accessibility — i18n aria-labels', () => {
  it('ReactionBar emoji labels should use i18n, not hardcoded English', () => {
    const content = readFile('src/components/ReactionBar.tsx');
    expect(
      content.includes('EMOJI_LABELS'),
      'ReactionBar should not use hardcoded EMOJI_LABELS — use i18n keys instead'
    ).toBe(false);
  });

  it('all i18n files should have emoji aria-label translations', () => {
    const emojiKeys = ['thumbsUp', 'clap', 'laugh', 'scream', 'fire', 'skull', 'party', 'cry'];
    const files = ['src/i18n/en.json', 'src/i18n/ko.json', 'src/i18n/ja.json'];

    for (const file of files) {
      const content = readFile(file);
      const parsed = JSON.parse(content);
      const ariaEmoji = parsed?.aria?.emoji;
      expect(ariaEmoji, `${file} must have aria.emoji section`).toBeDefined();

      for (const key of emojiKeys) {
        expect(
          ariaEmoji?.[key],
          `${file}: missing aria.emoji.${key} translation`
        ).toBeTruthy();
      }
    }
  });
});

describe('Web Guidelines: html lang attribute', () => {
  // A4: html lang should be dynamic based on detected language
  it('App should sync html lang attribute with i18n language', () => {
    const appContent = readFile('src/App.tsx');
    const i18nContent = readFile('src/i18n/index.ts');
    const mainContent = readFile('src/main.tsx');

    const setsLang = [appContent, i18nContent, mainContent].some(
      content => content.includes('documentElement.lang') || content.includes('.lang =')
    );

    expect(
      setsLang,
      'App should dynamically set <html lang="..."> to match the current i18n language'
    ).toBe(true);
  });
});
