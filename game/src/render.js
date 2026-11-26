// Everything the eye sees: sky, sea and island mesh in a chase camera, the
// courier herself banking through it, the rings and runways ahead, and a full
// instrument panel — altitude, speed, heading, throttle, fuel and an
// artificial horizon — drawn lit, as if flown.

import { VIEW, WORLD, ISLANDS, SKY, SEA, PLANE } from './config.js';
import { heightAt, terrainColor, runwayAt } from './terrain.js';
import { knots, feet, compassPoint } from './plane.js';
import { nextTarget } from './world.js';
import { makeRng } from './random.js';

const DEG = Math.PI / 180;
const CHASE_DIST = 30;
const CHASE_HEIGHT = 8;

/** Camera and projection state, rebuilt every frame from the plane. */
function makeCamera(plane, width, height) {
  const heading = plane.heading * DEG;
  const pitch = Math.max(-0.25, Math.min(0.35, plane.pitch * DEG * 0.45));
  const forward = {
    x: Math.sin(heading) * Math.cos(pitch),
    y: Math.sin(pitch),
    z: -Math.cos(heading) * Math.cos(pitch),
  };
  const pos = {
    x: plane.x - forward.x * CHASE_DIST,
    y: Math.max(plane.y - forward.y * CHASE_DIST + CHASE_HEIGHT, 4),
    z: plane.z - forward.z * CHASE_DIST,
  };
  const right = { x: -forward.z, y: 0, z: forward.x };
  const rl = Math.hypot(right.x, right.z) || 1;
  right.x /= rl;
  right.z /= rl;
  const up = {
    x: right.y * forward.z - right.z * forward.y,
    y: right.z * forward.x - right.x * forward.z,
    z: right.x * forward.y - right.y * forward.x,
  };
  const focal = height / 2 / Math.tan((VIEW.fov / 2) * DEG);
  return { pos, forward, right, up, focal, pitch };
}

function project(cam, width, height, x, y, z) {
  const dx = x - cam.pos.x;
  const dy = y - cam.pos.y;
  const dz = z - cam.pos.z;
  const cz = dx * cam.forward.x + dy * cam.forward.y + dz * cam.forward.z;
  if (cz < 2) return null;
  const cx = dx * cam.right.x + dy * cam.right.y + dz * cam.right.z;
  const cy = dx * cam.up.x + dy * cam.up.y + dz * cam.up.z;
  return {
    x: width / 2 + (cx * cam.focal) / cz,
    y: height / 2 - (cy * cam.focal) / cz,
    depth: cz,
  };
}

function horizonY(cam, height) {
  return height / 2 - Math.tan(cam.pitch) * cam.focal;
}

// --- sky, sun, clouds, sea -----------------------------------------------

const cloudRng = makeRng(777);
const CLOUDS = [];
for (let i = 0; i < 26; i += 1) {
  CLOUDS.push({
    x: (cloudRng() - 0.5) * 3800,
    y: 260 + cloudRng() * 260,
    z: (cloudRng() - 0.5) * 3800,
    r: 90 + cloudRng() * 160,
  });
}

function drawSky(ctx, width, height, cam, storm) {
  const hy = horizonY(cam, height);
  const grad = ctx.createLinearGradient(0, 0, 0, Math.max(hy, 1));
  if (storm) {
    grad.addColorStop(0, '#3a4552');
    grad.addColorStop(0.6, '#5d6b7a');
    grad.addColorStop(1, '#8b98a5');
  } else {
    grad.addColorStop(0, SKY.top);
    grad.addColorStop(0.55, SKY.mid);
    grad.addColorStop(1, SKY.horizon);
  }
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, width, Math.max(hy + 2, 0));
  // Sun, low and warm, so the terrain has a direction of light.
  if (!storm) {
    const sx = width * SKY.sunX;
    const sy = height * SKY.sunY;
    const glow = ctx.createRadialGradient(sx, sy, 4, sx, sy, 90);
    glow.addColorStop(0, 'rgba(255,244,200,0.95)');
    glow.addColorStop(0.35, 'rgba(255,226,150,0.55)');
    glow.addColorStop(1, 'rgba(255,226,150,0)');
    ctx.fillStyle = glow;
    ctx.fillRect(sx - 95, sy - 95, 190, 190);
    ctx.fillStyle = '#fff6cf';
    ctx.beginPath();
    ctx.arc(sx, sy, 22, 0, Math.PI * 2);
    ctx.fill();
  }
  // Sea fills everything below the horizon.
  const sea = ctx.createLinearGradient(0, hy, 0, height);
  sea.addColorStop(0, SEA.far);
  sea.addColorStop(1, SEA.near);
  ctx.fillStyle = sea;
  ctx.fillRect(0, Math.max(hy, 0), width, height - Math.max(hy, 0));
  // Clouds, as soft white puffs drifting far above the water.
  for (const cloud of CLOUDS) {
    const p = project(cam, width, height, cloud.x, cloud.y, cloud.z);
    if (!p || p.depth > 3800) continue;
    const r = (cloud.r * cam.focal) / p.depth;
    if (r < 2) continue;
    ctx.fillStyle = storm ? 'rgba(52,60,70,0.85)' : 'rgba(255,255,255,0.88)';
    ctx.beginPath();
    ctx.ellipse(p.x, p.y, r, r * 0.36, 0, 0, Math.PI * 2);
    ctx.ellipse(p.x - r * 0.5, p.y + r * 0.08, r * 0.6, r * 0.28, 0, 0, Math.PI * 2);
    ctx.ellipse(p.x + r * 0.5, p.y + r * 0.06, r * 0.62, r * 0.3, 0, 0, Math.PI * 2);
    ctx.fill();
  }
}

// --- terrain mesh ---------------------------------------------------------

function shade(base, factor) {
  const r = parseInt(base.slice(1, 3), 16);
  const g = parseInt(base.slice(3, 5), 16);
  const b = parseInt(base.slice(5, 7), 16);
  const f = Math.max(0.55, Math.min(1.15, factor));
  return `rgb(${Math.round(r * f)},${Math.round(g * f)},${Math.round(b * f)})`;
}

function drawTerrain(ctx, width, height, cam, storm) {
  const cells = WORLD.gridCells;
  const size = (WORLD.half * 2) / cells;
  const quads = [];
  const camX = cam.pos.x;
  const camZ = cam.pos.z;
  for (let i = 0; i < cells; i += 1) {
    for (let j = 0; j < cells; j += 1) {
      const x0 = -WORLD.half + i * size;
      const z0 = -WORLD.half + j * size;
      const cx = x0 + size / 2;
      const cz = z0 + size / 2;
      const dx = cx - camX;
      const dz = cz - camZ;
      const dist = Math.hypot(dx, dz);
      if (dist > WORLD.drawDistance) continue;
      const ahead = dx * cam.forward.x + dz * cam.forward.z;
      if (ahead < -80) continue;
      const h00 = heightAt(x0, z0);
      const h10 = heightAt(x0 + size, z0);
      const h01 = heightAt(x0, z0 + size);
      const h11 = heightAt(x0 + size, z0 + size);
      const hMax = Math.max(h00, h10, h01, h11);
      if (hMax <= 0.4) continue; // open sea: the sea gradient already covers it
      const p00 = project(cam, width, height, x0, h00, z0);
      const p10 = project(cam, width, height, x0 + size, h10, z0);
      const p11 = project(cam, width, height, x0 + size, h11, z0 + size);
      const p01 = project(cam, width, height, x0, h01, z0 + size);
      if (!p00 || !p10 || !p11 || !p01) continue;
      const hAvg = (h00 + h10 + h01 + h11) / 4;
      // Simple slope shading: hillsides facing the sun read brighter.
      const slope = Math.abs(h10 - h00) + Math.abs(h01 - h00);
      const light = storm ? 0.92 : 1.06 - Math.min(0.35, slope / size * 0.9);
      quads.push({ p00, p10, p11, p01, depth: ahead, color: shade(terrainColor(cx, cz, hAvg), light) });
    }
  }
  quads.sort((a, b) => b.depth - a.depth);
  for (const q of quads) {
    ctx.fillStyle = q.color;
    ctx.beginPath();
    ctx.moveTo(q.p00.x, q.p00.y);
    ctx.lineTo(q.p10.x, q.p10.y);
    ctx.lineTo(q.p11.x, q.p11.y);
    ctx.lineTo(q.p01.x, q.p01.y);
    ctx.closePath();
    ctx.fill();
  }
}

// --- runways and rings ------------------------------------------------------

function runwayCorners(r) {
  const rad = (r.heading * Math.PI) / 180;
  const ux = Math.cos(rad);
  const uz = -Math.sin(rad);
  const vx = -uz;
  const vz = ux;
  const hl = r.length / 2;
  const hw = r.width / 2;
  return [
    [r.cx - ux * hl - vx * hw, r.elev, r.cz - uz * hl - vz * hw],
    [r.cx + ux * hl - vx * hw, r.elev, r.cz + uz * hl - vz * hw],
    [r.cx + ux * hl + vx * hw, r.elev, r.cz + uz * hl + vz * hw],
    [r.cx - ux * hl + vx * hw, r.elev, r.cz - uz * hl + vz * hw],
  ];
}

function drawRunways(ctx, width, height, cam) {
  for (const island of ISLANDS) {
    const r = island.runway;
    const corners = runwayCorners(r).map(([x, y, z]) => project(cam, width, height, x, y, z));
    if (corners.some((p) => !p)) continue;
    ctx.fillStyle = '#3c4148';
    ctx.beginPath();
    ctx.moveTo(corners[0].x, corners[0].y);
    for (let i = 1; i < 4; i += 1) ctx.lineTo(corners[i].x, corners[i].y);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,0.85)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo((corners[0].x + corners[3].x) / 2, (corners[0].y + corners[3].y) / 2);
    ctx.lineTo((corners[1].x + corners[2].x) / 2, (corners[1].y + corners[2].y) / 2);
    ctx.setLineDash([14, 12]);
    ctx.stroke();
    ctx.setLineDash([]);
    // Threshold bars at both ends, so the strip reads as a runway, not a road.
    ctx.fillStyle = 'rgba(255,255,255,0.9)';
    for (const [a, b] of [[corners[0], corners[3]], [corners[1], corners[2]]]) {
      ctx.beginPath();
      ctx.moveTo(a.x, a.y);
      ctx.lineTo(b.x, b.y);
      ctx.lineTo(b.x + (a.x - b.x) * 0.06, b.y + (a.y - b.y) * 0.06);
      ctx.lineTo(a.x + (b.x - a.x) * 0.06, a.y + (b.y - a.y) * 0.06);
      ctx.closePath();
      ctx.fill();
    }
  }
}

function drawRings(ctx, width, height, cam, world, time) {
  const next = world.ringIndex;
  for (const ring of world.rings) {
    if (ring.flown) continue;
    const p = project(cam, width, height, ring.x, ring.y, ring.z);
    if (!p || p.depth < 4 || p.depth > WORLD.drawDistance) continue;
    const radius = (ring.radius * cam.focal) / p.depth;
    if (radius < 3) continue;
    const isNext = ring.index === next;
    const pulse = 0.75 + 0.25 * Math.sin(time * 4 + ring.index);
    ctx.save();
    ctx.lineWidth = isNext ? 7 : 4;
    ctx.strokeStyle = isNext
      ? `rgba(255,176,32,${pulse})`
      : 'rgba(120,220,255,0.75)';
    ctx.shadowColor = isNext ? '#ffb020' : '#78dcff';
    ctx.shadowBlur = isNext ? 22 : 10;
    ctx.beginPath();
    ctx.ellipse(p.x, p.y, radius, radius * 0.94, 0, 0, Math.PI * 2);
    ctx.stroke();
    ctx.shadowBlur = 0;
    ctx.lineWidth = 2;
    ctx.strokeStyle = 'rgba(255,255,255,0.85)';
    ctx.beginPath();
    ctx.ellipse(p.x, p.y, radius * 0.82, radius * 0.78, 0, 0, Math.PI * 2);
    ctx.stroke();
    if (isNext && radius > 26) {
      ctx.fillStyle = '#fff';
      ctx.font = 'bold 15px system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(`RING ${ring.index + 1} · ${Math.round(p.depth)} m`, p.x, p.y + radius + 22);
    }
    ctx.restore();
  }
}

// --- the courier ------------------------------------------------------------

function drawPlane(ctx, width, height, plane, time) {
  ctx.save();
  ctx.translate(width / 2, height * 0.56 + plane.pitch * 0.4);
  ctx.rotate(-plane.bank * DEG);
  // Prop blur: a translucent disc at the nose, spinning.
  const propSpin = (time * 40) % (Math.PI * 2);
  ctx.save();
  ctx.translate(0, -118);
  ctx.rotate(propSpin * 0.15);
  ctx.fillStyle = 'rgba(200,210,220,0.28)';
  ctx.beginPath();
  ctx.ellipse(0, 0, 46, 10, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
  // Main wings, teal with orange tips.
  ctx.fillStyle = '#0f7a6d';
  ctx.beginPath();
  ctx.moveTo(-150, 6);
  ctx.quadraticCurveTo(-150, -16, -128, -18);
  ctx.lineTo(-14, -10);
  ctx.lineTo(-14, 10);
  ctx.lineTo(-128, 14);
  ctx.quadraticCurveTo(-150, 14, -150, 6);
  ctx.fill();
  ctx.beginPath();
  ctx.moveTo(150, 6);
  ctx.quadraticCurveTo(150, -16, 128, -18);
  ctx.lineTo(14, -10);
  ctx.lineTo(14, 10);
  ctx.lineTo(128, 14);
  ctx.quadraticCurveTo(150, 14, 150, 6);
  ctx.fill();
  ctx.fillStyle = '#ff8c1a';
  ctx.fillRect(-150, -8, 16, 20);
  ctx.fillRect(134, -8, 16, 20);
  // Fuselage: cream body, teal stripe, glass canopy.
  ctx.fillStyle = '#f4efe4';
  ctx.beginPath();
  ctx.moveTo(0, -132);
  ctx.quadraticCurveTo(16, -100, 15, -40);
  ctx.lineTo(13, 62);
  ctx.quadraticCurveTo(12, 84, 0, 88);
  ctx.quadraticCurveTo(-12, 84, -13, 62);
  ctx.lineTo(-15, -40);
  ctx.quadraticCurveTo(-16, -100, 0, -132);
  ctx.fill();
  ctx.fillStyle = '#0f7a6d';
  ctx.fillRect(-15, -58, 30, 10);
  ctx.fillStyle = '#1c4d6e';
  ctx.beginPath();
  ctx.ellipse(0, -86, 9, 22, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = 'rgba(255,255,255,0.75)';
  ctx.beginPath();
  ctx.ellipse(-3, -92, 3, 9, -0.2, 0, Math.PI * 2);
  ctx.fill();
  // Tail: horizontal stabiliser and fin.
  ctx.fillStyle = '#0f7a6d';
  ctx.beginPath();
  ctx.moveTo(-52, 66);
  ctx.lineTo(-10, 58);
  ctx.lineTo(-10, 74);
  ctx.lineTo(-52, 82);
  ctx.closePath();
  ctx.fill();
  ctx.beginPath();
  ctx.moveTo(52, 66);
  ctx.lineTo(10, 58);
  ctx.lineTo(10, 74);
  ctx.lineTo(52, 82);
  ctx.closePath();
  ctx.fill();
  ctx.beginPath();
  ctx.moveTo(0, 58);
  ctx.lineTo(-4, 92);
  ctx.lineTo(4, 92);
  ctx.closePath();
  ctx.fill();
  // Registration and nav lights.
  ctx.fillStyle = '#233';
  ctx.font = 'bold 11px system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText('SKY-01', 0, 34);
  ctx.fillStyle = '#ff2d2d';
  ctx.beginPath();
  ctx.arc(-150, 2, 4, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#22dd55';
  ctx.beginPath();
  ctx.arc(150, 2, 4, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

// --- HUD and instruments ------------------------------------------------------

function panel(ctx, x, y, w, h, alpha = 0.72) {
  ctx.fillStyle = `rgba(8,18,28,${alpha})`;
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, 8);
  ctx.fill();
  ctx.strokeStyle = 'rgba(140,220,255,0.35)';
  ctx.lineWidth = 1;
  ctx.stroke();
}

function drawCompass(ctx, width, heading) {
  const cx = width / 2;
  const y = 14;
  panel(ctx, cx - 190, y, 380, 62);
  ctx.save();
  ctx.beginPath();
  ctx.rect(cx - 186, y + 2, 372, 58);
  ctx.clip();
  ctx.fillStyle = '#bfe8ff';
  ctx.font = 'bold 13px system-ui, sans-serif';
  ctx.textAlign = 'center';
  for (let d = -60; d <= 60; d += 5) {
    const h = ((Math.round(heading) + d) % 360 + 360) % 360;
    const x = cx + d * 3;
    const major = h % 30 === 0;
    ctx.strokeStyle = major ? '#eaf7ff' : 'rgba(190,232,255,0.5)';
    ctx.lineWidth = major ? 2 : 1;
    ctx.beginPath();
    ctx.moveTo(x, y + 30);
    ctx.lineTo(x, y + (major ? 16 : 22));
    ctx.stroke();
    if (major) {
      const label = h % 90 === 0 ? ['N', 'E', 'S', 'W'][Math.round(h / 90) % 4] : String(h).padStart(3, '0');
      ctx.fillText(label, x, y + 13);
    }
  }
  ctx.restore();
  // Lubber line.
  ctx.fillStyle = '#ffb020';
  ctx.beginPath();
  ctx.moveTo(cx, y + 32);
  ctx.lineTo(cx - 6, y + 42);
  ctx.lineTo(cx + 6, y + 42);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = '#eaf7ff';
  ctx.font = 'bold 12px system-ui, sans-serif';
  ctx.fillText(`${String(Math.round(heading)).padStart(3, '0')}° ${compassPoint(heading)}`, cx, y + 56);
}

function drawReadout(ctx, x, y, label, value, unit) {
  panel(ctx, x, y, 118, 52);
  ctx.fillStyle = '#8fd8ff';
  ctx.font = '11px system-ui, sans-serif';
  ctx.textAlign = 'left';
  ctx.fillText(label, x + 10, y + 16);
  ctx.fillStyle = '#ffffff';
  ctx.font = 'bold 22px system-ui, sans-serif';
  ctx.fillText(value, x + 10, y + 42);
  ctx.fillStyle = '#8fd8ff';
  ctx.font = '11px system-ui, sans-serif';
  ctx.fillText(unit, x + 92, y + 42);
}

function drawVerticalGauge(ctx, x, y, h, fraction, label, color) {
  panel(ctx, x - 32, y - 18, 64, h + 56);
  ctx.fillStyle = '#8fd8ff';
  ctx.font = '11px system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText(label, x, y - 6);
  ctx.fillStyle = 'rgba(255,255,255,0.14)';
  ctx.fillRect(x - 9, y, 18, h);
  const fh = Math.max(0, Math.min(1, fraction)) * h;
  ctx.fillStyle = color;
  ctx.fillRect(x - 9, y + h - fh, 18, fh);
  ctx.strokeStyle = 'rgba(255,255,255,0.5)';
  ctx.strokeRect(x - 9, y, 18, h);
  ctx.fillStyle = '#fff';
  ctx.font = 'bold 12px system-ui, sans-serif';
  ctx.fillText(`${Math.round(fraction * 100)}%`, x, y + h + 16);
}

function drawArtificialHorizon(ctx, x, y, r, pitch, bank) {
  ctx.save();
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.clip();
  ctx.translate(x, y);
  ctx.rotate(-bank * DEG);
  const offset = Math.max(-r, Math.min(r, pitch * 1.1));
  ctx.fillStyle = '#3f8fd0';
  ctx.fillRect(-r, -r - offset, r * 2, r + offset);
  ctx.fillStyle = '#7a5a34';
  ctx.fillRect(-r, -offset, r * 2, r + offset);
  ctx.fillStyle = '#fff';
  ctx.fillRect(-r, -offset - 1, r * 2, 2);
  ctx.rotate(bank * DEG);
  ctx.strokeStyle = '#fff';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(-r * 0.55, 0);
  ctx.lineTo(-r * 0.12, 0);
  ctx.moveTo(r * 0.12, 0);
  ctx.lineTo(r * 0.55, 0);
  ctx.stroke();
  ctx.fillStyle = '#ffb020';
  ctx.beginPath();
  ctx.arc(0, 0, 3, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
  ctx.strokeStyle = 'rgba(180,230,255,0.8)';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.stroke();
  ctx.fillStyle = '#8fd8ff';
  ctx.font = '10px system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText('ATTITUDE', x, y + r + 14);
}

function drawTargetArrow(ctx, width, height, cam, target) {
  if (!target) return;
  const p = project(cam, width, height, target.x, target.y, target.z);
  if (p && p.x > 40 && p.x < width - 40 && p.y > 80 && p.y < height - 120) return;
  // Off-screen or behind: point at the screen edge toward it.
  const dx = target.x - cam.pos.x;
  const dz = target.z - cam.pos.z;
  const ang = Math.atan2(dx * cam.right.x + dz * cam.right.z, dx * cam.forward.x + dz * cam.forward.z);
  const ex = width / 2 + Math.sin(ang) * (width / 2 - 70);
  const ey = height / 2 - Math.cos(ang) * (height / 2 - 110);
  ctx.save();
  ctx.translate(Math.max(50, Math.min(width - 50, ex)), Math.max(80, Math.min(height - 90, ey)));
  ctx.rotate(Math.atan2(Math.sin(ang), -Math.cos(ang)) + Math.PI);
  ctx.fillStyle = '#ffb020';
  ctx.beginPath();
  ctx.moveTo(0, -16);
  ctx.lineTo(12, 10);
  ctx.lineTo(-12, 10);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}

function drawHUD(ctx, width, height, world, time) {
  const plane = world.plane;
  drawCompass(ctx, width, plane.heading);
  drawReadout(ctx, width - 140, 14, 'ALTITUDE', String(feet(plane.y)), 'ft');
  drawReadout(ctx, width - 140, 74, 'AIRSPEED', String(knots(plane.speed)), 'kt');
  drawReadout(ctx, width - 140, 134, 'VERT SPEED', `${plane.verticalSpeed >= 0 ? '+' : ''}${Math.round(plane.verticalSpeed * 196.85)}`, 'fpm');
  drawVerticalGauge(ctx, 46, 150, 220, plane.throttle, 'THROTTLE', '#ffb020');
  const fuelColor = world.fuel > 30 ? '#37c978' : world.fuel > 12 ? '#ffb020' : '#ff4545';
  drawVerticalGauge(ctx, width - 34, 260, 160, world.fuel / PLANE.fuelCapacity, 'FUEL', fuelColor);
  drawArtificialHorizon(ctx, width - 84, height - 84, 56, plane.pitch, plane.bank);

  // Mission card, top left: what the sortie asks of the pilot.
  panel(ctx, 14, 14, 320, 74);
  ctx.fillStyle = '#ffb020';
  ctx.font = 'bold 14px system-ui, sans-serif';
  ctx.textAlign = 'left';
  ctx.fillText(world.mission.name, 26, 36);
  ctx.fillStyle = '#eaf7ff';
  ctx.font = '13px system-ui, sans-serif';
  let objective = '';
  if (world.mission.id === 'rings') objective = `Rings flown ${world.ringIndex} / ${world.rings.length}`;
  if (world.mission.id === 'hop') {
    objective = world.nextLanding < world.hopOrder.length
      ? `Land next: ${world.hopOrder[world.nextLanding]}`
      : 'All runways visited';
  }
  if (world.mission.id === 'storm') objective = world.delivered ? 'Parcel delivered!' : 'Deliver to Storm Peak';
  ctx.fillText(objective, 26, 56);
  ctx.fillStyle = '#8fd8ff';
  ctx.font = '12px system-ui, sans-serif';
  ctx.fillText(`SCORE ${world.score}   TIME ${Math.floor(world.time / 60)}:${String(Math.floor(world.time % 60)).padStart(2, '0')}`, 26, 76);

  // Centre flight-path marker and next-target distance.
  const target = nextTarget(world);
  if (target && world.screen === 'play') {
    const cam = makeCamera(plane, width, height);
    const p = project(cam, width, height, target.x, target.y, target.z);
    ctx.strokeStyle = 'rgba(255,255,255,0.9)';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.arc(width / 2, height / 2 - 30, 9, 0, Math.PI * 2);
    ctx.moveTo(width / 2, height / 2 - 44);
    ctx.lineTo(width / 2, height / 2 - 52);
    ctx.stroke();
    if (p) {
      ctx.fillStyle = '#fff';
      ctx.font = 'bold 13px system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(`NEXT ${Math.round(p.depth)} m`, width / 2, 150);
    }
    drawTargetArrow(ctx, width, height, cam, target);
  }

  // Storm rain: fast diagonal streaks across the glass.
  if (world.storm && world.screen === 'play') {
    ctx.strokeStyle = 'rgba(200,220,235,0.35)';
    ctx.lineWidth = 1;
    const rng = makeRng(Math.floor(time * 24));
    for (let i = 0; i < 60; i += 1) {
      const x = rng() * width;
      const y = rng() * height;
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(x - 8, y + 22);
      ctx.stroke();
    }
  }

  // Transient message banner.
  if (world.message && time < world.messageUntil) {
    ctx.font = 'bold 17px system-ui, sans-serif';
    const tw = ctx.measureText(world.message).width;
    panel(ctx, width / 2 - tw / 2 - 18, 78, tw + 36, 34, 0.8);
    ctx.fillStyle = '#fff';
    ctx.textAlign = 'center';
    ctx.fillText(world.message, width / 2, 101);
  }

  // Controls hint, bottom left, quiet.
  ctx.fillStyle = 'rgba(230,245,255,0.85)';
  ctx.font = '12px system-ui, sans-serif';
  ctx.textAlign = 'left';
  ctx.fillText('Arrows / WASD fly · Shift/Ctrl throttle · Mouse steers · P pause · R restart', 14, height - 14);
}

// --- screens -----------------------------------------------------------------

function overlayPanel(ctx, width, height, title, lines, accent = '#ffb020') {
  ctx.fillStyle = 'rgba(6,14,22,0.66)';
  ctx.fillRect(0, 0, width, height);
  const w = 620;
  const h = 150 + lines.length * 30;
  const x = (width - w) / 2;
  const y = (height - h) / 2;
  panel(ctx, x, y, w, h, 0.92);
  ctx.fillStyle = accent;
  ctx.font = 'bold 30px system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText(title, width / 2, y + 52);
  ctx.fillStyle = '#eaf7ff';
  ctx.font = '16px system-ui, sans-serif';
  lines.forEach((line, i) => {
    ctx.fillText(line, width / 2, y + 92 + i * 30);
  });
}

function drawTitle(ctx, width, height, world) {
  // The world flies on behind the title: a slow orbit over Home Reef.
  ctx.fillStyle = 'rgba(6,14,22,0.45)';
  ctx.fillRect(0, 0, width, height);
  ctx.fillStyle = '#fff';
  ctx.font = 'bold 64px system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText('SKY COURIER', width / 2, 150);
  ctx.fillStyle = '#ffb020';
  ctx.font = 'bold 26px system-ui, sans-serif';
  ctx.fillText('— I S L A N D   R U N —', width / 2, 192);
  ctx.fillStyle = '#eaf7ff';
  ctx.font = '16px system-ui, sans-serif';
  ctx.fillText('One little prop plane, three islands, and a sky full of decisions.', width / 2, 226);
  const cardW = 340;
  const gap = 24;
  const total = cardW * 3 + gap * 2;
  const x0 = (width - total) / 2;
  world.missionList.forEach((m, i) => {
    const x = x0 + i * (cardW + gap);
    const y = 280;
    const selected = world.mission.id === m.id;
    panel(ctx, x, y, cardW, 190, selected ? 0.95 : 0.7);
    if (selected) {
      ctx.strokeStyle = '#ffb020';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.roundRect(x, y, cardW, 190, 8);
      ctx.stroke();
    }
    ctx.fillStyle = '#ffb020';
    ctx.font = 'bold 20px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(`${m.key} · ${m.name}`, width / 2 + (x + cardW / 2 - width / 2), y + 38);
    ctx.fillStyle = '#eaf7ff';
    ctx.font = '15px system-ui, sans-serif';
    ctx.fillText(m.short, x + cardW / 2, y + 66);
    ctx.font = '13px system-ui, sans-serif';
    ctx.fillStyle = '#bcd8e8';
    wrapText(ctx, m.brief, x + cardW / 2, y + 92, cardW - 32, 20);
  });
  ctx.fillStyle = '#fff';
  ctx.font = 'bold 17px system-ui, sans-serif';
  ctx.fillText('Press 1, 2 or 3 to choose a mission — then ENTER to fly', width / 2, 540);
  ctx.fillStyle = '#bcd8e8';
  ctx.font = '14px system-ui, sans-serif';
  ctx.fillText('Arrows / WASD fly · Shift / Ctrl throttle · Mouse steers · P pause · R restart', width / 2, 570);
  if (world.best > 0) {
    ctx.fillStyle = '#ffb020';
    ctx.font = 'bold 15px system-ui, sans-serif';
    ctx.fillText(`Best score this session: ${world.best}`, width / 2, 606);
  }
}

function wrapText(ctx, text, cx, y, maxWidth, lineHeight) {
  const words = text.split(' ');
  const lines = [];
  let line = '';
  for (const word of words) {
    const test = line ? `${line} ${word}` : word;
    if (ctx.measureText(test).width > maxWidth && line) {
      lines.push(line);
      line = word;
    } else {
      line = test;
    }
  }
  if (line) lines.push(line);
  lines.forEach((l, i) => ctx.fillText(l, cx, y + i * lineHeight));
}

/** The 3D world alone — sky, terrain, runways, rings and the plane — with no
 * HUD and no screen overlay, so the title screen can fly its own backdrop. */
export function renderWorld(ctx, width, height, world, time) {
  const plane = world.plane;
  const cam = makeCamera(plane, width, height);
  drawSky(ctx, width, height, cam, world.storm);
  drawTerrain(ctx, width, height, cam, world.storm);
  drawRunways(ctx, width, height, cam);
  if (world.mission.id === 'rings') drawRings(ctx, width, height, cam, world, time);
  drawPlane(ctx, width, height, plane, time);
}

/** The title screen overlay, drawn over any world backdrop. */
export function drawTitleOverlay(ctx, width, height, world) {
  drawTitle(ctx, width, height, world);
}

/** Draw one frame: the world, the plane, the HUD, and any screen overlay. */
export function render(ctx, width, height, world, time) {
  renderWorld(ctx, width, height, world, time);
  if (world.screen === 'title') {
    drawTitle(ctx, width, height, world);
    return;
  }
  drawHUD(ctx, width, height, world, time);
  if (world.screen === 'paused') {
    overlayPanel(ctx, width, height, 'PAUSED', [
      'The sky will wait. The fuel will not — well, actually, it will.',
      'Press P to keep flying, or R to start this sortie over.',
    ]);
  }
  if (world.screen === 'landed') {
    overlayPanel(ctx, width, height, 'WHEELS DOWN', [
      world.message || 'A landing you can walk away from.',
      `Score ${world.score} · Fuel refilled · Press ENTER to take off again`,
    ], '#37c978');
  }
  if (world.screen === 'crashed') {
    overlayPanel(ctx, width, height, 'DOWN IN THE DRINK', [
      world.crashReason || 'She came down hard.',
      `Score ${world.score} · Press R to fly again`,
    ], '#ff4545');
  }
  if (world.screen === 'complete') {
    overlayPanel(ctx, width, height, 'SORTIE COMPLETE', [
      `${world.mission.name} — flown and finished.`,
      `Score ${world.score} · Time ${Math.floor(world.time / 60)}:${String(Math.floor(world.time % 60)).padStart(2, '0')}`,
      'Press R for another sortie, or 1 / 2 / 3 for a different mission.',
    ], '#37c978');
  }
}
