// Sound, synthesized live with the Web Audio API — no audio files to ship.
// A low engine hum that follows the throttle, a chime when a ring is flown,
// and a soft thud when the wheels kiss the strip.

/** Fresh sound state; nothing plays until the player first interacts. */
export function makeSound() {
  return {
    ctx: null,
    engine: null,
    engineGain: null,
    enabled: true,
    started: false,
  };
}

/** Create the audio context on the first user gesture (browsers demand it). */
export function unlockSound(sound) {
  if (sound.started || !sound.enabled) return;
  try {
    const Ctx = window.AudioContext ?? window.webkitAudioContext;
    if (!Ctx) return;
    sound.ctx = new Ctx();
    const osc = sound.ctx.createOscillator();
    osc.type = 'sawtooth';
    osc.frequency.value = 55;
    const filter = sound.ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 320;
    const gain = sound.ctx.createGain();
    gain.gain.value = 0.0;
    osc.connect(filter);
    filter.connect(gain);
    gain.connect(sound.ctx.destination);
    osc.start();
    sound.engine = osc;
    sound.engineGain = gain;
    sound.started = true;
  } catch {
    sound.enabled = false;
  }
}

/** Engine hum follows throttle and speed; call every frame while flying. */
export function updateEngine(sound, throttle, speed, flying) {
  if (!sound.started || !sound.engine) return;
  const t = sound.ctx.currentTime;
  sound.engine.frequency.setTargetAtTime(48 + throttle * 55 + speed * 0.12, t, 0.08);
  const level = flying ? 0.028 + throttle * 0.035 : 0.012;
  sound.engineGain.gain.setTargetAtTime(level, t, 0.1);
}

/** A short two-note chime, one for each ring flown. */
export function ringChime(sound) {
  if (!sound.started) return;
  blip(sound, 880, 0.09, 0.05);
  window.setTimeout(() => blip(sound, 1318, 0.12, 0.05), 90);
}

/** A soft thud for a touchdown. */
export function touchdownThud(sound) {
  if (!sound.started) return;
  blip(sound, 120, 0.18, 0.09);
}

/** A low buzz for a crash — brief, then silence. */
export function crashBuzz(sound) {
  if (!sound.started) return;
  blip(sound, 70, 0.4, 0.12);
}

function blip(sound, freq, seconds, level) {
  try {
    const osc = sound.ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.value = freq;
    const gain = sound.ctx.createGain();
    gain.gain.value = level;
    gain.gain.exponentialRampToValueAtTime(0.0001, sound.ctx.currentTime + seconds);
    osc.connect(gain);
    gain.connect(sound.ctx.destination);
    osc.start();
    osc.stop(sound.ctx.currentTime + seconds + 0.02);
  } catch {
    // Silence is better than a thrown error mid-flight.
  }
}
