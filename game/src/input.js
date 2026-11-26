// Keyboard and mouse, read the same way every frame: the stick (pitch and
// roll), the throttle, and the one-shot keys the screens listen for.

/** Fresh input state: stick centred, throttle idle, no key pressed. */
export function makeInput() {
  return {
    pitch: 0, // -1 (nose down) .. 1 (nose up)
    roll: 0, // -1 (left) .. 1 (right)
    throttle: 0.55, // cruise-ish when the flight starts
    mouseSteer: false,
    pressed: new Set(), // keys pressed since the last frame was read
    held: new Set(), // keys held down right now
  };
}

const KEYMAP = {
  ArrowUp: 'up',
  KeyW: 'up',
  ArrowDown: 'down',
  KeyS: 'down',
  ArrowLeft: 'left',
  KeyA: 'left',
  ArrowRight: 'right',
  KeyD: 'right',
};

/** Bind listeners on the window; call once at boot. */
export function bindInput(input, canvas) {
  window.addEventListener('keydown', (event) => {
    if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space'].includes(event.code)) {
      event.preventDefault();
    }
    if (!event.repeat) input.pressed.add(event.code);
    input.held.add(event.code);
  });
  window.addEventListener('keyup', (event) => {
    input.held.delete(event.code);
  });
  window.addEventListener('blur', () => {
    input.held.clear();
  });
  canvas.addEventListener('mousemove', (event) => {
    const rect = canvas.getBoundingClientRect();
    const x = (event.clientX - rect.left) / rect.width - 0.5; // -0.5..0.5
    const y = (event.clientY - rect.top) / rect.height - 0.5;
    input.mouseX = x;
    input.mouseY = y;
    input.mouseSteer = true;
  });
  canvas.addEventListener('mouseleave', () => {
    input.mouseSteer = false;
  });
  canvas.addEventListener('wheel', (event) => {
    event.preventDefault();
    input.throttle = Math.max(0, Math.min(1, input.throttle + (event.deltaY < 0 ? 0.06 : -0.06)));
  }, { passive: false });
}

/** Fold the held keys (and the mouse, when it is steering) into the stick. */
export function pollInput(input) {
  const held = input.held;
  let pitch = 0;
  let roll = 0;
  if (held.has('ArrowUp') || held.has('KeyW')) pitch += 1;
  if (held.has('ArrowDown') || held.has('KeyS')) pitch -= 1;
  if (held.has('ArrowLeft') || held.has('KeyA')) roll -= 1;
  if (held.has('ArrowRight') || held.has('KeyD')) roll += 1;
  if (held.has('ShiftLeft') || held.has('ShiftRight')) {
    input.throttle = Math.min(1, input.throttle + 0.012);
  }
  if (held.has('ControlLeft') || held.has('ControlRight')) {
    input.throttle = Math.max(0, input.throttle - 0.012);
  }
  if (input.mouseSteer && roll === 0 && pitch === 0) {
    roll = Math.max(-1, Math.min(1, (input.mouseX ?? 0) * 2.4));
    pitch = Math.max(-1, Math.min(1, -(input.mouseY ?? 0) * 2.0));
  }
  input.pitch = pitch;
  input.roll = roll;
  return { pitch, roll, throttle: input.throttle };
}

/** True once for a key pressed since the last frame; the press is consumed. */
export function wasPressed(input, code) {
  if (input.pressed.has(code)) {
    input.pressed.delete(code);
    return true;
  }
  return false;
}

/** Drop every pending press (used when a screen changes). */
export function clearPressed(input) {
  input.pressed.clear();
}
