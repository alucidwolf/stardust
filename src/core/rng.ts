/**
 * Deterministic pseudo-randomness.
 *
 * The whole sector derives from one seed, so the same seed always rebuilds the
 * same stars, the same debris and the same landmarks. Regions additionally hash
 * their own coordinates, which means a region regenerates identically whether
 * you reach it after ten seconds or ten minutes, from any direction.
 *
 * Carried over from Currents unchanged. It is the one part of that codebase
 * that has nothing to do with water.
 */

export type Rng = () => number;

/** Small, fast, well-distributed 32-bit PRNG. */
export function mulberry32(seed: number): Rng {
  let a = seed >>> 0;
  return function next(): number {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Mix three integers into one well-scattered 32-bit seed. */
export function hash3(a: number, b: number, c: number): number {
  let h = 2166136261 >>> 0;
  h = Math.imul(h ^ (a | 0), 16777619);
  h = Math.imul(h ^ (b | 0), 16777619);
  h = Math.imul(h ^ (c | 0), 16777619);
  h ^= h >>> 13;
  h = Math.imul(h, 0x5bd1e995);
  h ^= h >>> 15;
  return h >>> 0;
}

/** A generator scoped to one region of one sector. */
export function regionRng(sectorSeed: number, rx: number, rz: number, salt = 0): Rng {
  return mulberry32(hash3(sectorSeed ^ salt, rx, rz));
}

export function randRange(rng: Rng, min: number, max: number): number {
  return min + rng() * (max - min);
}

export function pick<T>(rng: Rng, items: readonly T[]): T {
  return items[Math.floor(rng() * items.length) % items.length]!;
}

/** The seed named by `#seed=` in the URL, if there is a usable one. */
export function seedFromHash(hash: string = location.hash): number | null {
  const match = /(?:^|[#&])seed=([0-9a-zA-Z]+)/.exec(hash);
  if (!match) return null;
  const parsed = Number.parseInt(match[1]!, 36);
  return Number.isFinite(parsed) && parsed >>> 0 !== 0 ? parsed >>> 0 : null;
}

/**
 * Resolve this session's sector seed.
 *
 * `#seed=12345` in the URL reproduces a previous sector exactly and always
 * wins. Without one, the sector the page remembers carries on. With neither, a
 * fresh one is minted from the clock, so no two first visits match.
 */
export function resolveSectorSeed(
  hash: string = location.hash,
  remembered: number | null = null,
): number {
  return (
    seedFromHash(hash) ??
    remembered ??
    ((Date.now() ^ Math.floor(Math.random() * 0xffffffff)) >>> 0 || 1)
  );
}

/** Render a seed as the short string used in the URL and the readout. */
export function formatSeed(seed: number): string {
  return seed.toString(36);
}

/**
 * The sector designation shown in the readout, derived from the seed.
 *
 * The design system asks for uppercase system codes in the shape `7G-19`, and
 * a code that does not follow from the seed would be decoration pretending to
 * be information. This one is the seed, written differently.
 */
export function sectorCode(seed: number): string {
  const letters = "ABCDEFGHJKLMNPQRSTVWXYZ";
  const a = seed % 10;
  const b = letters[(seed >>> 4) % letters.length];
  const c = ((seed >>> 9) % 89) + 10;
  return `${a}${b}-${c}`;
}
