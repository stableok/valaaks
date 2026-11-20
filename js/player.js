// movement and collision (used by both player and bot)
export const RUN = 6.75, WALK_MUL = 0.55, CROUCH_MUL = 0.45;
export const ACCEL = 60, AIR_ACCEL = 12, JUMP_V = 4.6, GRAVITY = 12.5;
export const RADIUS = 0.34, HEIGHT = 1.8;

export function makeBody(x = 0, z = 0) {
  return { x, y: 0, z, vx: 0, vy: 0, vz: 0, ground: true, crouch: 0 };
}

export function steer(b, tvx, tvz, dt) {
  const acc = (b.ground ? ACCEL : AIR_ACCEL) * dt;
  const ex = tvx - b.vx, ez = tvz - b.vz, el = Math.hypot(ex, ez);
  if (el <= acc) { b.vx = tvx; b.vz = tvz; } else { b.vx += ex / el * acc; b.vz += ez / el * acc; }
}

export function jump(b) { if (b.ground) { b.vy = JUMP_V; b.ground = false; } }

// move + collide with walls/pillars
export function integrate(world, b, dt) {
  b.vy -= GRAVITY * dt;
  b.y += b.vy * dt;
  // split into small steps so you cant go through walls
  const dist = Math.hypot(b.vx, b.vz) * dt;
  const steps = Math.max(1, Math.ceil(dist / 0.12));
  for (let i = 0; i < steps; i++) {
    b.x += b.vx * dt / steps; b.z += b.vz * dt / steps;
    resolve(world, b);
  }
  // find the ground under us
  let gy = 0;
  for (const box of world.solids()) {
    const top = box.c[1] + box.h[1];
    if (top > b.y + 0.35 || top <= gy) continue;
    if (insideFootprint(box, b.x, b.z, RADIUS * 0.6)) gy = top;
  }
  if (b.y <= gy) { b.y = gy; if (b.vy < 0) b.vy = 0; b.ground = true; }
  else b.ground = b.y - gy < 0.02;
}

function insideFootprint(box, x, z, pad) {
  const dx = x - box.c[0], dz = z - box.c[2];
  const lx = dx * box.cos - dz * box.sin, lz = dx * box.sin + dz * box.cos;
  return Math.abs(lx) <= box.h[0] + pad && Math.abs(lz) <= box.h[2] + pad;
}

function resolve(world, b) {
  for (const box of world.solids()) {
    const top = box.c[1] + box.h[1], bottom = box.c[1] - box.h[1];
    if (b.y >= top - 0.3 || b.y + HEIGHT <= bottom) continue;
    const dx = b.x - box.c[0], dz = b.z - box.c[2];
    const lx = dx * box.cos - dz * box.sin, lz = dx * box.sin + dz * box.cos;
    const hx = box.h[0], hz = box.h[2];
    const cx = Math.max(-hx, Math.min(hx, lx)), cz = Math.max(-hz, Math.min(hz, lz));
    let px = lx - cx, pz = lz - cz, d = Math.hypot(px, pz);
    if (d >= RADIUS) continue;
    let nx, nz, push;
    if (d > 1e-6) { nx = px / d; nz = pz / d; push = RADIUS - d; }
    else { // if were inside the box push out the closest side
      const ox = hx - Math.abs(lx), oz = hz - Math.abs(lz);
      if (ox < oz) { nx = Math.sign(lx) || 1; nz = 0; push = ox + RADIUS; } else { nx = 0; nz = Math.sign(lz) || 1; push = oz + RADIUS; }
    }
    const wx = nx * box.cos + nz * box.sin, wz = -nx * box.sin + nz * box.cos;
    b.x += wx * push; b.z += wz * push;
    const vn = b.vx * wx + b.vz * wz;
    if (vn < 0) { b.vx -= vn * wx; b.vz -= vn * wz; }
  }
}
