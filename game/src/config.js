// Sky Courier: Island Run — every tunable number lives here, so the rest of the
// code reads like the rules of the game instead of a pile of magic constants.

export const VIEW = {
  width: 1280,
  height: 720,
  fov: 62, // vertical field of view in degrees, chase camera
};

export const WORLD = {
  half: 2000, // world spans -2000..2000 m on x and z, sea at y = 0
  seaLevel: 0,
  gridCells: 44, // terrain mesh resolution across the whole world
  drawDistance: 1900, // m ahead of the camera that terrain is drawn
};

// Seeded world layout: three islands, each with its own runway and character.
export const ISLANDS = [
  {
    name: 'Home Reef',
    cx: -900, cz: -700, radius: 620, peak: 150,
    runway: { cx: -900, cz: -700, heading: 90, length: 420, width: 34, elev: 6 },
    color: { sand: '#d9c27a', grass: '#5d9b4a', rock: '#7a6a58', snow: '#e8eef2' },
  },
  {
    name: 'Palm Cay',
    cx: 850, cz: -350, radius: 520, peak: 110,
    runway: { cx: 850, cz: -350, heading: 10, length: 380, width: 30, elev: 5 },
    color: { sand: '#e0c987', grass: '#63a854', rock: '#84705e', snow: '#e8eef2' },
  },
  {
    name: 'Storm Peak',
    cx: 300, cz: 1150, radius: 700, peak: 260,
    runway: { cx: 300, cz: 1150, heading: 160, length: 460, width: 36, elev: 8 },
    color: { sand: '#cbb478', grass: '#4e8f57', rock: '#6f6258', snow: '#eef3f6' },
  },
];

// The ring course for mission 1: rings hang in the air between the islands.
export const RING_COURSE = [
  { x: -650, y: 120, z: -650 },
  { x: -200, y: 150, z: -800 },
  { x: 250, y: 170, z: -650 },
  { x: 650, y: 140, z: -250 },
  { x: 750, y: 130, z: 100 },
  { x: 650, y: 190, z: 650 },
  { x: 350, y: 250, z: 950 },
  { x: 300, y: 300, z: 1150 },
];
export const RING_RADIUS = 42;

export const PLANE = {
  minSpeed: 28, // m/s — below this the wing stops flying and she sinks
  cruiseSpeed: 95,
  maxSpeed: 135,
  accel: 22, // m/s^2 toward the throttle's target speed
  maxPitchDeg: 24,
  maxBankDeg: 55,
  turnAuthority: 1.9, // turn rate multiplier from bank
  climbAuthority: 1.0,
  fuelCapacity: 100,
  fuelBurnIdle: 0.10, // units per second
  fuelBurnFull: 0.42, // units per second at full throttle
  startFuel: 100,
};

export const MISSIONS = [
  {
    id: 'rings',
    key: '1',
    name: 'RING RUN',
    short: 'Fly all 8 rings',
    brief: 'Thread every glowing ring in order. Fast and clean beats fast and sloppy: each ring adds time bonus, each miss costs fuel.',
  },
  {
    id: 'hop',
    key: '2',
    name: 'ISLAND HOP',
    short: 'Land on all 3 runways',
    brief: 'Touch down gently on Palm Cay and Storm Peak, then bring her home. A landing counts only when slow, level and on the strip.',
  },
  {
    id: 'storm',
    key: '3',
    name: 'STORM COURIER',
    short: 'Deliver the parcel in the storm',
    brief: 'One parcel, one tank, one storm. Reach Storm Peak before the fuel gauge does. Rain and gusts push you off course — fly the needles, not the panic.',
  },
];

export const SKY = {
  top: '#2f6fb8',
  mid: '#7fb2e0',
  horizon: '#cfe4f2',
  sunX: 0.72, // fraction across the screen
  sunY: 0.20,
};

export const SEA = {
  near: '#1d6f8f',
  far: '#3f8fb4',
  sparkle: 'rgba(255,255,255,0.35)',
};

export const STEP = 1 / 60; // fixed physics step, seconds
