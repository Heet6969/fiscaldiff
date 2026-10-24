/**
 * Small seeded PRNG (mulberry32).
 *
 * Committed in-repo and used instead of Math.random so the demonstration
 * dataset is identical on every run, on every machine. A demo whose numbers
 * move between runs cannot be checked by hand.
 */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return function next(): number {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Integer in [min, max], inclusive. */
export function intBetween(rand: () => number, min: number, max: number): number {
  return min + Math.floor(rand() * (max - min + 1));
}

/** Value rounded to `places` decimals, in [min, max]. */
export function numberBetween(
  rand: () => number,
  min: number,
  max: number,
  places = 2,
): number {
  const factor = 10 ** places;
  return Math.round((min + rand() * (max - min)) * factor) / factor;
}
