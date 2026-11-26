// The world itself: three islands rising out of the sea, each with a flat
// runway strip carved into it, plus the ring course that hangs between them.

import { WORLD, ISLANDS, RING_COURSE, RING_RADIUS } from './config.js';
import { fbm2 } from './random.js';

const SEED = 20261126;

/** Height of the ground at (x, z) in metres; 0 or below means open sea. */
export function heightAt(x, z) {
  let h = -18; // sea floor, well below the waterline
  for (const island of ISLANDS) {
    const dx = x - island.cx;
    const dz = z - island.cz;
    const d = Math.sqrt(dx * dx + dz * dz);
    if (d >= island.radius) continue;
    const falloff = Math.cos((d / island.radius) * Math.PI * 0.5);
    const bump = falloff * falloff;
    const detail = fbm2(x / 260, z / 260, SEED) * 0.55 + 0.45;
    h = Math.max(h, bump * island.peak * detail);
  }
  return flattenRunways(x, z, h);
}

/** Carve every runway flat so a landing reads as a landing, not a bounce. */
function flattenRunways(x, z, h) {
  for (const island of ISLANDS) {
    const r = island.runway;
    const rad = (r.heading * Math.PI) / 180;
    const ux = Math.cos(rad);
    const uz = -Math.sin(rad);
    const vx = -uz;
    const vz = ux;
    const dx = x - r.cx;
    const dz = z - r.cz;
    const along = dx * ux + dz * uz;
    const across = dx * vx + dz * vz;
    // 1. On the strip itself: perfectly flat, so wheels stay on the ground.
    if (Math.abs(along) <= r.length / 2 + 0.5 && Math.abs(across) <= r.width / 2 + 0.5) {
      h = r.elev;
      continue;
    }
    // 2. Around it, a clear approach corridor: the lane slopes down to the
    // strip and fades back into the island 600 m out, so a plane on final
    // — or climbing out — never meets a hillside. A normal 3-degree
    // approach stays above the lane all the way in. Never raise the sea.
    if (h <= r.elev) continue;
    const reach = r.length / 2 + 600;
    const halfW = r.width / 2 + 60;
    if (Math.abs(along) > reach || Math.abs(across) > halfW) continue;
    const tAlong = 1 - Math.max(0, (Math.abs(along) - r.length / 2) / 600);
    const tAcross = 1 - Math.max(0, (Math.abs(across) - r.width / 2) / 60);
    const t = tAlong * tAcross;
    h = h + (r.elev - h) * t;
  }
  return h;
}

/** True when (x, z) is dry land rather than sea. */
export function isLand(x, z) {
  return heightAt(x, z) > 0.5;
}

/** The runway a plane is over right now, or null when it is not over one. */
export function runwayAt(x, z) {
  for (const island of ISLANDS) {
    const r = island.runway;
    const rad = (r.heading * Math.PI) / 180;
    const ux = Math.cos(rad);
    const uz = -Math.sin(rad);
    const vx = -uz;
    const vz = ux;
    const dx = x - r.cx;
    const dz = z - r.cz;
    const along = dx * ux + dz * uz;
    const across = dx * vx + dz * vz;
    if (Math.abs(along) <= r.length / 2 && Math.abs(across) <= r.width / 2) {
      return { island, runway: r, along, across };
    }
  }
  return null;
}

/** Ring course as live objects: position, radius, course normal, flown or not. */
export function makeRings() {
  return RING_COURSE.map((p, i) => {
    const prev = RING_COURSE[Math.max(0, i - 1)];
    const next = RING_COURSE[Math.min(RING_COURSE.length - 1, i + 1)];
    const nx = next.x - prev.x;
    const ny = next.y - prev.y;
    const nz = next.z - prev.z;
    const len = Math.hypot(nx, ny, nz) || 1;
    return {
      index: i,
      x: p.x,
      y: p.y,
      z: p.z,
      radius: RING_RADIUS,
      normal: { x: nx / len, y: ny / len, z: nz / len },
      flown: false,
    };
  });
}

/** Colour of terrain at a height, blended by island palette. */
export function terrainColor(x, z, h) {
  let island = ISLANDS[0];
  let best = Infinity;
  for (const cand of ISLANDS) {
    const d = Math.hypot(x - cand.cx, z - cand.cz);
    if (d < best) {
      best = d;
      island = cand;
    }
  }
  const c = island.color;
  if (h < 3) return c.sand;
  if (h < island.peak * 0.45) return c.grass;
  if (h < island.peak * 0.8) return c.rock;
  return c.snow;
}

export { WORLD, ISLANDS };
