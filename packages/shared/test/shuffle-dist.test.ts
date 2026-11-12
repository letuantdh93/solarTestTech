import { it, expect } from 'vitest';
import { rng, shuffle } from '../src/text';
it('uniform', () => {
  const counts = [0, 0, 0, 0];
  for (let s = 0; s < 4000; s++) { const r = rng(s * 2654435761); for (let k = 0; k < 7; k++) { const a = shuffle([0, 1, 2, 3], r); counts[a.indexOf(0)]++; } }
  console.log(counts);
  for (const c of counts) expect(Math.abs(c / 28000 - 0.25)).toBeLessThan(0.02);
});
