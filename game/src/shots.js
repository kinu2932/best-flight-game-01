// Staged screenshots: each scene plays the real rules forward from a fresh
// world for a fixed number of steps, steered by a simple autopilot (point the
// nose at the next objective, hold a sensible throttle, flare over the strip),
// so every frame is what a short real flight looks like — and the same scene
// always gives the same frame.

import { STEP } from './config.js';
import { makeWorld, stepWorld, SCREEN_PLAY } from './world.js';
import { nextTarget } from './world.js';

const SAMPLE = STEP;

/** Steer toward the next objective: bank to the bearing, pitch to the height. */
function autopilot(world) {
  const plane = world.plane;
  const target = nextTarget(world);
  if (!target) return { pitch: 0, roll: 0, throttle: 0.55 };
  const dx = target.x - plane.x;
  const dz = target.z - plane.z;
  const wantHeading = (Math.atan2(dx, -dz) * 180) / Math.PI;
  let diff = ((wantHeading - plane.heading + 540) % 360) - 180;
  const roll = Math.max(-1, Math.min(1, diff / 25));
  const wantAlt = target.y;
  const altErr = wantAlt - plane.y;
  const pitch = Math.max(-0.7, Math.min(0.7, altErr / 60));
  let throttle = 0.62;
  if (plane.speed < 60) throttle = 0.85;
  if (world.mission.id === 'rings') {
    // Slow down for the gate: a fast plane turns too wide to thread a ring.
    const d = Math.hypot(target.x - plane.x, target.y - plane.y, target.z - plane.z);
    if (d < 400) throttle = 0.45;
  }
  if (world.mission.id === 'hop') {
    // Final approach: gentle power, level wings, let the strip come to her.
    throttle = plane.speed < 50 ? 0.6 : 0.38;
  }
  if (world.mission.id === 'storm' && plane.y > 240) throttle = 0.7;
  return { pitch, roll, throttle };
}

/** Run the world forward `seconds` under the autopilot; stop on a screen change. */
function flyForward(world, seconds) {
  const steps = Math.round(seconds / SAMPLE);
  for (let i = 0; i < steps; i += 1) {
    stepWorld(world, autopilot(world), SAMPLE);
    if (world.screen !== SCREEN_PLAY) break;
  }
  return world;
}

function stageCover(world) {
  // Ring Run, mid-course: three rings flown, the fourth glowing ahead, the
  // runway of Palm Cay below and the sea all around.
  world.screen = SCREEN_PLAY;
  world.ringIndex = 0;
  world.rings.forEach((r, i) => {
    if (i < 3) {
      r.flown = true;
      world.ringIndex = 3;
      world.score += 250;
    }
  });
  world.plane.x = -50;
  world.plane.y = 160;
  world.plane.z = -680;
  world.plane.heading = 120;
  world.plane.speed = 95;
  world.plane.throttle = 0.62;
  flyForward(world, 6);
  return { screen: SCREEN_PLAY };
}

function stageRings(world) {
  // Tight on the first ring: lined up on the course, so the wings stay level
  // and the ring fills the frame ahead.
  world.screen = SCREEN_PLAY;
  world.plane.x = -850;
  world.plane.y = 130;
  world.plane.z = -900;
  world.plane.heading = 140;
  world.plane.speed = 100;
  world.plane.throttle = 0.66;
  flyForward(world, 2.2);
  return { screen: SCREEN_PLAY };
}

function stageLanding(world) {
  // Island Hop, final approach to Palm Cay: lined up on the runway's extended
  // centreline, low over the water, strip ahead, wings level — the landing
  // reads before it happens.
  world.mission = world.missionList.find((m) => m.id === 'hop');
  world.screen = SCREEN_PLAY;
  world.plane.x = 259;
  world.plane.y = 55;
  world.plane.z = -246;
  world.plane.heading = 80; // Palm Cay's strip runs heading 10 in runway terms = 80 in compass terms
  world.plane.speed = 58;
  world.plane.throttle = 0.38;
  world.plane.pitch = -2;
  flyForward(world, 5);
  return { screen: SCREEN_PLAY };
}

function stageStorm(world) {
  // Storm Courier in the weather: dark sky, rain on the glass, Storm Peak
  // looming ahead through the murk, gusts shoving the wings.
  world.mission = world.missionList.find((m) => m.id === 'storm');
  world.storm = true;
  world.screen = SCREEN_PLAY;
  world.plane.x = 350;
  world.plane.y = 320;
  world.plane.z = 300;
  world.plane.heading = 175;
  world.plane.speed = 105;
  world.plane.throttle = 0.7;
  flyForward(world, 4);
  return { screen: SCREEN_PLAY };
}

const STAGES = { cover: stageCover, rings: stageRings, landing: stageLanding, storm: stageStorm };

/**
 * Set `world` to the named scene (cover, rings, landing, storm; anything else
 * is the cover) and return the screen to draw over it.
 */
export function stageShot(name, world) {
  const stage = STAGES[name] ?? STAGES.cover;
  return stage(world);
}
