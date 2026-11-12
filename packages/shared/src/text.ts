/** Text utilities: Vietnamese-aware normalisation and similarity. */

export function stripDiacritics(s: string): string {
  return s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'D');
}

export function normalizeText(s: string): string {
  return stripDiacritics(s.toLowerCase())
    .replace(/\$[^$]*\$/g, ' ') // drop inline math
    .replace(/[^a-z0-9.]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function shingles(s: string, k = 3): Set<string> {
  const words = normalizeText(s).split(' ').filter(Boolean);
  const out = new Set<string>();
  if (words.length < k) {
    if (words.length) out.add(words.join(' '));
    return out;
  }
  for (let i = 0; i <= words.length - k; i++) out.add(words.slice(i, i + k).join(' '));
  return out;
}

/** Jaccard similarity of word 3-shingles (0..1). */
export function textSimilarity(a: string, b: string): number {
  const A = shingles(a);
  const B = shingles(b);
  if (!A.size || !B.size) return 0;
  let inter = 0;
  for (const x of A) if (B.has(x)) inter++;
  return inter / (A.size + B.size - inter);
}

/** Deterministic PRNG (mulberry32) used for reproducible shuffles. */
export function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function shuffle<T>(arr: T[], rand: () => number = Math.random): T[] {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [a[i], a[j]] = [a[j]!, a[i]!];
  }
  return a;
}
