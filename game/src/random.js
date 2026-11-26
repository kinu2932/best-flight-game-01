// Deterministic randomness: one seeded generator per world, so a staged
// screenshot and a replayed flight always see the same islands, clouds and gusts.

/** mulberry32 — small, fast, and good enough for terrain and weather. */
export function makeRng(seed) {
  let a = seed >>> 0;
  return function next() {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Value noise in 2D from a hash of integer lattice points (no tables to ship). */
export function hash2(ix, iz, seed) {
  let h = (ix * 374761393 + iz * 668265263 + seed * 974634211) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return (((h ^ (h >>> 16)) >>> 0) % 10000) / 10000;
}

function smooth(t) {
  return t * t * (3 - 2 * t);
}

/** Smooth 2D value noise in [0, 1], deterministic for a given seed. */
export function noise2(x, z, seed) {
  const ix = Math.floor(x);
  const iz = Math.floor(z);
  const fx = smooth(x - ix);
  const fz = smooth(z - iz);
  const a = hash2(ix, iz, seed);
  const b = hash2(ix + 1, iz, seed);
  const c = hash2(ix, iz + 1, seed);
  const d = hash2(ix + 1, iz + 1, seed);
  return a + (b - a) * fx + (c - a) * fz + (a - b - c + d) * fx * fz;
}

/** Fractal noise: three octaves, still in [0, 1]. */
export function fbm2(x, z, seed) {
  return (
    noise2(x, z, seed) * 0.55 +
    noise2(x * 2.13 + 7.7, z * 2.13 + 3.1, seed + 11) * 0.3 +
    noise2(x * 4.31 + 13.7, z * 4.31 + 9.4, seed + 23) * 0.15
  );
}
