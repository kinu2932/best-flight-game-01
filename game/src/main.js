// Boot and the frame loop: screens, the fixed-step simulation, sound cues,
// and the ?shot= scenes the screenshots are taken from. The game never asks
// the network for anything; every pixel is drawn from this code.

import { VIEW, STEP, MISSIONS } from './config.js';
import {
  makeWorld,
  stepWorld,
  noteBest,
  SCREEN_TITLE,
  SCREEN_PLAY,
  SCREEN_PAUSED,
  SCREEN_LANDED,
  SCREEN_CRASHED,
  SCREEN_COMPLETE,
  EVENT_RING,
  EVENT_LANDED,
  EVENT_CRASHED,
} from './world.js';
import { makeInput, bindInput, pollInput, wasPressed, clearPressed } from './input.js';
import { makeSound, unlockSound, updateEngine, ringChime, touchdownThud, crashBuzz } from './sound.js';
import { render, renderWorld, drawTitleOverlay } from './render.js';
import { stageShot } from './shots.js';

const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');
const statusEl = document.getElementById('status');

function resize() {
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  canvas.width = Math.round(window.innerWidth * dpr);
  canvas.height = Math.round(window.innerHeight * dpr);
  ctx.setTransform(canvas.width / VIEW.width, 0, 0, canvas.height / VIEW.height, 0, 0);
}
window.addEventListener('resize', resize);
resize();

const params = new URLSearchParams(window.location.search);
const shotName = params.get('shot');
const input = makeInput();
bindInput(input, canvas);
const sound = makeSound();

let world = makeWorld('rings');
world.missionList = MISSIONS;

// The title screen flies its own scenic backdrop: the courier cruising over
// Home Reef on the ring course, so the first thing a player sees is the game
// itself, already flying.
function makeTitleWorld() {
  const t = makeWorld('rings');
  t.missionList = MISSIONS;
  t.screen = SCREEN_PLAY;
  t.plane.x = -100;
  t.plane.y = 170;
  t.plane.z = -750;
  t.plane.heading = 120;
  t.plane.speed = 95;
  t.plane.throttle = 0.62;
  return t;
}
let titleWorld = makeTitleWorld();

function announce(text) {
  if (statusEl) statusEl.textContent = text;
}

function startMission(missionId) {
  const best = world.best;
  world = makeWorld(missionId);
  world.missionList = MISSIONS;
  world.best = best;
  world.screen = SCREEN_TITLE;
  announce(`${world.mission.name}. Press Enter to fly.`);
}

function beginFlight() {
  world.screen = SCREEN_PLAY;
  world.plane.throttle = 0.55;
  unlockSound(sound);
  announce(`${world.mission.name} — fly!`);
}

function takeOffAgain() {
  // Back on the strip, not in the air: she is parked on her wheels at
  // flying speed minus the stall, so she rolls and rotates like a normal
  // takeoff instead of sinking out of the sky at 20 m/s.
  world.screen = SCREEN_PLAY;
  world.plane.onGround = true;
  world.plane.throttle = 0.6;
  world.plane.speed = 20;
  announce('Airborne again.');
}

let last = performance.now();
let accumulator = 0;

function frame(now) {
  const dt = Math.min(0.1, (now - last) / 1000);
  last = now;

  // One-shot keys, by screen.
  if (world.screen === SCREEN_TITLE) {
    if (wasPressed(input, 'Digit1')) startMission('rings');
    if (wasPressed(input, 'Digit2')) startMission('hop');
    if (wasPressed(input, 'Digit3')) startMission('storm');
    if (wasPressed(input, 'Enter') || wasPressed(input, 'Space')) beginFlight();
  } else if (world.screen === SCREEN_PLAY) {
    if (wasPressed(input, 'KeyP') || wasPressed(input, 'Escape')) {
      world.screen = SCREEN_PAUSED;
      announce('Paused.');
    }
  } else if (world.screen === SCREEN_PAUSED) {
    if (wasPressed(input, 'KeyP') || wasPressed(input, 'Escape') || wasPressed(input, 'Enter')) {
      world.screen = SCREEN_PLAY;
      announce('Flying.');
    }
  } else if (world.screen === SCREEN_LANDED) {
    if (wasPressed(input, 'Enter') || wasPressed(input, 'Space')) takeOffAgain();
  }
  if (wasPressed(input, 'KeyR')) {
    const missionId = world.mission.id;
    const best = world.best;
    world = makeWorld(missionId);
    world.missionList = MISSIONS;
    world.best = best;
    world.screen = SCREEN_PLAY;
    world.plane.throttle = 0.55;
    announce('New sortie — fly!');
  }
  if (wasPressed(input, 'KeyM')) {
    sound.enabled = !sound.enabled;
  }
  clearPressed(input);

  // Fixed-step simulation, so a flight replays the same way every time.
  if (world.screen === SCREEN_TITLE) {
    // The backdrop keeps flying while the player chooses a mission; if the
    // scenic flight ever ends (a hillside, an empty tank), restart the loop.
    if (titleWorld.screen !== SCREEN_PLAY) titleWorld = makeTitleWorld();
    accumulator += dt;
    let guard = 0;
    while (accumulator >= STEP && guard < 5) {
      stepWorld(titleWorld, { pitch: 0, roll: 0, throttle: 0.62 }, STEP);
      accumulator -= STEP;
      guard += 1;
    }
    if (guard >= 5) accumulator = 0;
  }
  if (world.screen === SCREEN_PLAY) {
    accumulator += dt;
    let guard = 0;
    while (accumulator >= STEP && guard < 5) {
      const controls = pollInput(input);
      const events = stepWorld(world, controls, STEP);
      if (events & EVENT_RING) ringChime(sound);
      if (events & EVENT_LANDED) touchdownThud(sound);
      if (events & EVENT_CRASHED) crashBuzz(sound);
      if (world.screen === SCREEN_CRASHED || world.screen === SCREEN_COMPLETE) noteBest(world);
      accumulator -= STEP;
      guard += 1;
    }
    if (guard >= 5) accumulator = 0;
    updateEngine(sound, world.plane.throttle, world.plane.speed, world.plane.airborne);
  }

  if (world.screen === SCREEN_TITLE) {
    renderWorld(ctx, VIEW.width, VIEW.height, titleWorld, now / 1000);
    drawTitleOverlay(ctx, VIEW.width, VIEW.height, world);
  } else {
    render(ctx, VIEW.width, VIEW.height, world, now / 1000);
  }
  requestAnimationFrame(frame);
}

// A staged scene (?shot=cover|rings|landing|storm) renders one frozen frame
// of a real flight — the same code path the screenshots are taken from.
if (shotName) {
  const sceneWorld = makeWorld('rings');
  sceneWorld.missionList = MISSIONS;
  stageShot(shotName, sceneWorld);
  render(ctx, VIEW.width, VIEW.height, sceneWorld, 3.2);
  announce(`Sky Courier screenshot scene: ${shotName}.`);
} else {
  announce('Sky Courier: Island Run. Press 1, 2 or 3 to choose a mission, Enter to fly.');
  requestAnimationFrame(frame);
}
