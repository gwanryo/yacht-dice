import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// B4: mkDie should share a single BoxGeometry across all dice instances.
// Creating 5 identical geometries wastes memory.

// Mock canvas for pipTex
const mockCtx = {
  fillStyle: '',
  fillRect: vi.fn(),
  getImageData: vi.fn(() => ({
    data: new Uint8ClampedArray(256 * 256 * 4),
  })),
  putImageData: vi.fn(),
  beginPath: vi.fn(),
  arc: vi.fn(),
  fill: vi.fn(),
};

const origCreateElement = document.createElement.bind(document);

beforeEach(() => {
  vi.spyOn(document, 'createElement').mockImplementation((tag: string) => {
    const el = origCreateElement(tag);
    if (tag === 'canvas') {
      (el as HTMLCanvasElement).getContext = (() => mockCtx) as HTMLCanvasElement['getContext'];
    }
    return el;
  });
});

afterEach(() => {
  vi.restoreAllMocks();
});

const mockGeo = { dispose: vi.fn() };
let roundedBoxCallCount = 0;

vi.mock('three/examples/jsm/geometries/RoundedBoxGeometry.js', () => ({
  RoundedBoxGeometry: vi.fn().mockImplementation(function () {
    roundedBoxCallCount++;
    return mockGeo;
  }),
}));

vi.mock('three', () => {
  return {
    BoxGeometry: vi.fn().mockReturnValue(mockGeo),
    Mesh: vi.fn().mockImplementation(function (this: Record<string, unknown>) {
      this.castShadow = false;
      this.receiveShadow = false;
    }),
    MeshStandardMaterial: vi.fn().mockImplementation(function () {
      return { dispose: vi.fn() };
    }),
    Vector3: vi.fn().mockImplementation(function (this: Record<string, unknown>, x = 0, y = 0, z = 0) {
      this.x = x; this.y = y; this.z = z;
      this.copy = vi.fn().mockReturnThis();
      this.applyQuaternion = vi.fn().mockReturnThis();
      this.dot = vi.fn().mockReturnValue(0);
    }),
    Quaternion: vi.fn().mockImplementation(function (this: Record<string, unknown>) {
      this.setFromUnitVectors = vi.fn().mockReturnThis();
      this.multiply = vi.fn().mockReturnThis();
    }),
    CanvasTexture: vi.fn().mockImplementation(function (this: Record<string, unknown>) {
      this.wrapS = 0;
      this.wrapT = 0;
      this.colorSpace = '';
      this.repeat = { set: vi.fn() };
    }),
    RepeatWrapping: 1000,
    SRGBColorSpace: 'srgb',
  };
});

describe('Dice geometry sharing (B4)', () => {
  beforeEach(() => {
    roundedBoxCallCount = 0;
    vi.resetModules();
  });

  it('mkDie should share geometry across multiple calls', async () => {
    const { mkDie } = await import('./dice');

    mkDie();
    mkDie();
    mkDie();
    mkDie();
    mkDie();

    // RoundedBoxGeometry should only be instantiated once (shared across all dice)
    expect(
      roundedBoxCallCount,
      'RoundedBoxGeometry should be shared across all dice — only 1 instance needed'
    ).toBe(1);
  });
});

describe('Dice constants', () => {
  it('FACE_MAP should contain all values 1-6', async () => {
    const { FACE_MAP } = await import('./dice');
    const sorted = [...FACE_MAP].sort();
    expect(sorted).toEqual([1, 2, 3, 4, 5, 6]);
  });

  it('PIP_AXES should have entries for faces 1-6', async () => {
    const { PIP_AXES } = await import('./dice');
    for (let v = 1; v <= 6; v++) {
      expect(PIP_AXES[v]).toBeDefined();
    }
  });
});
