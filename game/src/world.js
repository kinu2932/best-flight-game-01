// The sortie: mission state, fuel and damage, ring passes, landings, crashes
// and the score. The plane flies in plane.js; this file decides what the
// flight means.

import { PLANE, MISSIONS, STEP } from './config.js';
import { makePlane, stepPlane } from './plane.js';
import { heightAt, runwayAt, makeRings, ISLANDS } from './terrain.js';
import { makeRng } from './random.js';

export const SCREEN_TITLE = 'title';
export const SCREEN_PLAY = 'play';
export const SCREEN_PAUSED = 'paused';
export const SCREEN_LANDED = 'landed';
export const SCREEN_CRASHED = 'crashed';
export const SCREEN_COMPLETE = 'complete';

export const EVENT_NONE = 0;
export const EVENT_RING = 1;
export const EVENT_LANDED = 2;
export const EVENT_CRASHED = 4;
export const EVENT_COMPLETE = 8;
export const EVENT_FUEL_EMPTY = 16;

/** A fresh sortie on the named mission (rings | hop | storm). */
export function makeWorld(missionId = 'rings') {
  const mission = MISSIONS.find((m) => m.id === missionId) ?? MISSIONS[0];
  const rng = makeRng(20261126 + missionId.length * 7919);
  return {
    mission,
    screen: SCREEN_TITLE,
    plane: makePlane(),
    rings: makeRings(),
    ringIndex: 0,
    ringPrevAlong: null, // signed distance along the current ring's normal
    landings: [], // island names touched down on, in order
    nextLanding: 0, // index into the hop order [Palm Cay, Storm Peak, Home Reef]
    hopOrder: ['Palm Cay', 'Storm Peak', 'Home Reef'],
    fuel: PLANE.startFuel,
    damage: 0,
    score: 0,
    time: 0,
    message: '',
    messageUntil: 0,
    best: 0,
    storm: missionId === 'storm',
    gust: 0,
    rng,
    events: EVENT_NONE,
    crashReason: '',
    delivered: false,
    hitTerrain: false,
    hasFlown: false, // true once she has left the ground this sortie
    missionList: MISSIONS,
  };
}

function say(world, text, seconds = 3) {
  world.message = text;
  world.messageUntil = world.time + seconds;
}

/** Storm gusts: slow wandering push on the wings, stronger inside the storm. */
function updateGust(world, dt) {
  if (!world.storm) {
    world.gust = 0;
    return;
  }
  const t = world.time;
  world.gust =
    Math.sin(t * 0.31) * 9 +
    Math.sin(t * 0.83 + 1.7) * 6 +
    Math.sin(t * 1.7 + 0.4) * 3;
}

function burnFuel(world, dt) {
  const rate =
    PLANE.fuelBurnIdle + world.plane.throttle * (PLANE.fuelBurnFull - PLANE.fuelBurnIdle);
  world.fuel -= rate * dt;
  if (world.fuel <= 0) {
    world.fuel = 0;
    world.events |= EVENT_FUEL_EMPTY;
  }
}

function checkRings(world) {
  if (world.mission.id !== 'rings') return;
  const ring = world.rings[world.ringIndex];
  if (!ring || ring.flown) return;
  const p = world.plane;
  // A ring is a gate, not a bullseye: she flies it when she crosses its
  // plane inside the circle. The signed distance along the course tells us
  // the crossing; the sideways distance tells us whether she was inside.
  const nx = ring.normal.x;
  const ny = ring.normal.y;
  const nz = ring.normal.z;
  const along = (p.x - ring.x) * nx + (p.y - ring.y) * ny + (p.z - ring.z) * nz;
  const side = Math.hypot(
    p.x - ring.x - along * nx,
    p.y - ring.y - along * ny,
    p.z - ring.z - along * nz,
  );
  const crossed = world.ringPrevAlong !== null && world.ringPrevAlong < 0 && along >= 0;
  const close = Math.hypot(p.x - ring.x, p.y - ring.y, p.z - ring.z) < ring.radius * 0.9;
  world.ringPrevAlong = along;
  if ((crossed && side < ring.radius) || close) {
    ring.flown = true;
    world.ringIndex += 1;
    world.ringPrevAlong = null;
    world.score += 250;
    world.events |= EVENT_RING;
    if (world.ringIndex >= world.rings.length) {
      world.score += 1000;
      world.screen = SCREEN_COMPLETE;
      world.events |= EVENT_COMPLETE;
      say(world, 'COURSE CLEAR — all 8 rings flown!', 6);
    } else {
      say(world, `Ring ${world.ringIndex} of 8 — next ring ahead`, 2.5);
    }
  }
}

function checkLanding(world) {
  const p = world.plane;
  // A landing only counts when she has actually flown: parked on the strip
  // at the start of a sortie is not a landing.
  if (!world.hasFlown && p.speed <= 30) return false;
  const spot = runwayAt(p.x, p.z);
  if (!spot) return false;
  const ground = heightAt(p.x, p.z);
  const low = p.y - ground < 4;
  const gentle = p.verticalSpeed > -9;
  const slow = p.speed < 62;
  const level = Math.abs(p.pitch) < 12 && Math.abs(p.bank) < 18;
  if (!(low && gentle && slow && level)) return false;
  // Touchdown: she is on the strip.
  p.y = ground + 2;
  world.hitTerrain = false; // a landing is not a crash, however firm
  p.speed *= 0.94;
  if (p.speed < 8) {
    p.speed = 0;
    p.onGround = true;
    world.events |= EVENT_LANDED;
    const name = spot.island.name;
    if (world.mission.id === 'hop') {
      const want = world.hopOrder[world.nextLanding];
      if (name === want) {
        world.landings.push(name);
        world.nextLanding += 1;
        world.score += 400;
        world.fuel = PLANE.fuelCapacity; // ground crew refuels her
        if (world.nextLanding >= world.hopOrder.length) {
          world.screen = SCREEN_COMPLETE;
          world.events |= EVENT_COMPLETE;
          say(world, 'ISLAND HOP COMPLETE — every runway kissed!', 6);
        } else {
          world.screen = SCREEN_LANDED;
          say(world, `Down safe on ${name} — refuelled. Next: ${world.hopOrder[world.nextLanding]}`, 5);
        }
      } else {
        world.screen = SCREEN_LANDED;
        say(world, `Down on ${name} — but the hop wants ${want} next`, 5);
      }
    } else if (world.mission.id === 'storm') {
      if (name === 'Storm Peak' && !world.delivered) {
        world.delivered = true;
        world.score += 1500;
        world.screen = SCREEN_COMPLETE;
        world.events |= EVENT_COMPLETE;
        say(world, 'PARCEL DELIVERED — Storm Peak thanks you!', 6);
      } else {
        world.screen = SCREEN_LANDED;
        say(world, `Down safe on ${name} — refuelled, back in the air`, 4);
        world.fuel = PLANE.fuelCapacity;
      }
    } else {
      world.screen = SCREEN_LANDED;
      say(world, `Down safe on ${name} — throttle up to go again`, 4);
    }
    return true;
  }
  return false;
}

function checkCrash(world) {
  const p = world.plane;
  const ground = heightAt(p.x, p.z);
  if (world.hitTerrain) {
    world.damage = 100;
    world.screen = SCREEN_CRASHED;
    world.events |= EVENT_CRASHED;
    world.crashReason = 'Flew into the hillside';
    return true;
  }
  if (p.y <= 2.2 && ground <= 0.5 && p.speed > 10 && !p.onGround) {
    world.damage = 100;
    world.screen = SCREEN_CRASHED;
    world.events |= EVENT_CRASHED;
    world.crashReason = 'Ditched in the sea';
    return true;
  }
  return false;
}

/**
 * Advance the sortie one fixed step. Returns the events raised this step
 * (EVENT_RING, EVENT_LANDED, EVENT_CRASHED, EVENT_COMPLETE, EVENT_FUEL_EMPTY).
 * Input is { pitch, roll, throttle } in the plane's own units.
 */
export function stepWorld(world, input, dt = STEP) {
  world.events = EVENT_NONE;
  if (world.screen !== SCREEN_PLAY) return world.events;
  world.time += dt;
  updateGust(world, dt);
  const p = world.plane;
  stepPlane(p, { ...input, gust: world.gust }, dt, heightAt(p.x, p.z));
  if (p.airborne) world.hasFlown = true;
  // The surface is a floor, not a suggestion: she cannot sink through it.
  // Meeting it fast, or slamming into it, is a crash — unless the landing
  // check below calls it a touchdown first. Rolling along it is taxiing.
  const ground = heightAt(p.x, p.z);
  world.hitTerrain = false;
  if (p.y < ground + 2) {
    if (p.speed > 40 || p.verticalSpeed < -9) world.hitTerrain = true;
    p.y = ground + 2;
    if (p.verticalSpeed < 0) p.verticalSpeed = 0;
  }
  // On the ground only when actually touching it and slow — the moment she
  // rolls fast or lifts off, the hillside can hurt her again.
  p.onGround = p.y - ground < 3 && p.speed < 25;
  burnFuel(world, dt);

  // Keep her inside the charted sea; the edge turns her gently home.
  if (Math.abs(p.x) > 1950 || Math.abs(p.z) > 1950) {
    say(world, 'Edge of the chart — turning back', 2);
    p.heading = (Math.atan2(-p.x, p.z) * 180) / Math.PI;
  }

  if (world.fuel <= 0 && p.y > 12) {
    // Out of fuel she glides: throttle dies, speed bleeds away.
    p.throttle = 0;
  }
  if (world.fuel <= 0 && p.onGround) {
    say(world, 'Tank dry — ground crew is on the way', 4);
    world.fuel = PLANE.fuelCapacity;
  }

  checkRings(world);
  if (world.screen === SCREEN_PLAY) {
    if (checkLanding(world)) return world.events;
    checkCrash(world);
  }
  if (world.screen === SCREEN_PLAY && world.fuel <= 0 && p.speed < PLANE.minSpeed && p.y < 14) {
    // She settles onto the sea with an empty tank: a soft ditch, not a smash.
    if (heightAt(p.x, p.z) <= 0.5) {
      world.screen = SCREEN_CRASHED;
      world.events |= EVENT_CRASHED;
      world.crashReason = 'Ran out of fuel over the sea';
    }
  }
  return world.events;
}

/** Score shown on the title screen: best of this session. */
export function noteBest(world) {
  if (world.score > world.best) world.best = world.score;
}

/** Where the next objective is, for the HUD arrow and the autopilot. */
export function nextTarget(world) {
  if (world.mission.id === 'rings') {
    return world.rings[world.ringIndex] ?? null;
  }
  if (world.mission.id === 'hop') {
    const name = world.hopOrder[world.nextLanding];
    if (!name) return null;
    const island = ISLANDS.find((i) => i.name === name);
    return island ? { x: island.runway.cx, y: 40, z: island.runway.cz, radius: 120 } : null;
  }
  const island = ISLANDS.find((i) => i.name === 'Storm Peak');
  return island ? { x: island.runway.cx, y: 200, z: island.runway.cz, radius: 150 } : null;
}
