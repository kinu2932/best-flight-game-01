// The aeroplane: a small prop courier with an honest flight model —
// throttle sets the speed she wants, pitch trades speed for height, bank turns
// her, and below flying speed she sinks whether the pilot likes it or not.

import { PLANE, STEP } from './config.js';

const DEG = Math.PI / 180;
const GRAVITY = 9.81;

/** Fresh aeroplane state, parked at the south end of Home Reef's runway, nose north. */
export function makePlane() {
  return {
    x: -900,
    y: 8,
    z: -880,
    heading: 0, // degrees, 0 = north (-z), 90 = east (+x)
    pitch: 0, // degrees, nose up positive
    bank: 0, // degrees, right wing down positive
    speed: 0, // m/s along the nose
    throttle: 0, // 0..1
    verticalSpeed: 0, // m/s, for the HUD and the landing judge
    airborne: false,
    onGround: true,
  };
}

function clamp(v, lo, hi) {
  return v < lo ? lo : v > hi ? hi : v;
}

/**
 * One fixed step. `input` carries pitch (-1..1, pull up positive), roll
 * (-1..1, right positive), throttle (0..1) and `gust` (extra roll, m/s wind).
 * `ground` is the terrain height under the plane: on her wheels she cannot
 * sink through it, so the stall-sink is arrested while she rolls.
 * Returns nothing; the plane is stepped in place.
 */
export function stepPlane(plane, input, dt = STEP, ground = -Infinity) {
  plane.throttle = clamp(input.throttle ?? plane.throttle, 0, 1);

  // Speed chases what the throttle asks for; drag grows with the square.
  const target = PLANE.minSpeed + plane.throttle * (PLANE.maxSpeed - PLANE.minSpeed);
  const drag = 0.35 + (plane.speed * plane.speed) / (PLANE.maxSpeed * PLANE.maxSpeed);
  plane.speed += clamp(target - plane.speed, -PLANE.accel * drag * dt, PLANE.accel * dt);
  if (plane.speed < 0) plane.speed = 0;

  // Pitch and bank ease toward what the stick asks, so the plane feels heavy.
  const pitchTarget = (input.pitch ?? 0) * PLANE.maxPitchDeg * PLANE.climbAuthority;
  const bankTarget = (input.roll ?? 0) * PLANE.maxBankDeg + (input.gust ?? 0);
  plane.pitch += clamp(pitchTarget - plane.pitch, -55 * dt, 55 * dt);
  plane.bank += clamp(bankTarget - plane.bank, -70 * dt, 70 * dt);

  // A banked wing turns the nose: coordinated turn, no skid.
  const bankRad = plane.bank * DEG;
  const turnRate = (GRAVITY * Math.tan(bankRad)) / Math.max(plane.speed, 12);
  plane.heading += turnRate * PLANE.turnAuthority * (180 / Math.PI) * dt;
  plane.heading = ((plane.heading % 360) + 360) % 360;

  // Climb comes from pitch while she has flying speed; below it she sinks —
  // unless her wheels are on the ground, which holds her up.
  const pitchRad = plane.pitch * DEG;
  const lift = plane.speed >= PLANE.minSpeed ? 1 : plane.speed / PLANE.minSpeed;
  const climb = Math.sin(pitchRad) * plane.speed * lift;
  const sink = plane.speed < PLANE.minSpeed ? (PLANE.minSpeed - plane.speed) * 0.55 : 0;
  const onWheels = plane.y <= ground + 2.5 && plane.speed < PLANE.minSpeed;
  plane.verticalSpeed = onWheels ? Math.max(0, climb) : climb - sink;

  const headingRad = plane.heading * DEG;
  const forwardX = Math.sin(headingRad);
  const forwardZ = -Math.cos(headingRad);
  const level = Math.cos(pitchRad);
  plane.x += forwardX * level * plane.speed * dt;
  plane.z += forwardZ * level * plane.speed * dt;
  plane.y += plane.verticalSpeed * dt;

  plane.airborne = plane.y > 10;
  if (plane.y < 2) plane.y = 2;
}

/** Knots for the HUD (1 m/s is 1.94384 kt). */
export function knots(speed) {
  return Math.round(speed * 1.94384);
}

/** Feet for the HUD (1 m is 3.28084 ft). */
export function feet(altitude) {
  return Math.round(altitude * 3.28084);
}

/** Compass point for a heading, for the tape under the HUD. */
export function compassPoint(heading) {
  const points = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];
  return points[Math.round(heading / 45) % 8];
}
