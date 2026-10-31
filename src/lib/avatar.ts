/** One of the theme's five chart colours, `--chart-1` to `--chart-5`. */
export type ChartColor = 1 | 2 | 3 | 4 | 5;

export interface MarbleBlob {
  cx: number;
  cy: number;
  r: number;
  color: ChartColor;
}

/** A person's avatar: three soft blobs over a background, turned as a whole. */
export interface Marble {
  background: ChartColor;
  blobs: MarbleBlob[];
  rotate: number;
}

/** The side of the square the shapes are drawn in, in SVG units. */
export const MARBLE_SIZE = 80;

/** The same seed always draws the same marble. The seed is an email or a
 * name, so case and surrounding space do not count. */
export function marble(seed: string): Marble {
  const next = numbers(hash(seed.trim().toLowerCase()));
  const colors = shuffledColors(next);
  return {
    background: colors[0],
    blobs: colors.slice(1, 4).map((color) => ({
      cx: next() % (MARBLE_SIZE + 1),
      cy: next() % (MARBLE_SIZE + 1),
      r: MARBLE_SIZE / 4 + (next() % (MARBLE_SIZE / 4)),
      color,
    })),
    rotate: next() % 360,
  };
}

/** FNV-1a, 32 bits. */
function hash(text: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/** A xorshift stream of unsigned 32-bit numbers. A zero state would stay
 * zero, so it is nudged off it. */
function numbers(seed: number): () => number {
  let state = seed || 0x9e3779b9;
  return () => {
    state ^= state << 13;
    state ^= state >>> 17;
    state ^= state << 5;
    state >>>= 0;
    return state;
  };
}

function shuffledColors(next: () => number): ChartColor[] {
  const colors: ChartColor[] = [1, 2, 3, 4, 5];
  for (let i = colors.length - 1; i > 0; i--) {
    const j = next() % (i + 1);
    [colors[i], colors[j]] = [colors[j], colors[i]];
  }
  return colors;
}
