// N-body gravity in "astronomer's units": astronomical units (AU), solar masses
// (M☉) and years. In this system the gravitational constant is exactly
//   G = 4π²
// which makes a 1 M☉ star give Earth (a = 1 AU) a circular speed of 2π AU/yr
// and an orbital period of exactly 1 year — so every number stays near 1.0.

export const G = 4 * Math.PI * Math.PI;
const SOFTENING2 = 1e-6; // ε² avoids the 1/r² singularity on close passes

let nextId = 1;

export function makeBody(o) {
  return {
    id: nextId++,
    name: o.name || "body",
    type: o.type || "planet",
    m: o.m,
    x: o.x, y: o.y,
    vx: o.vx || 0, vy: o.vy || 0,
    color: o.color || "#bbb",
    r: o.r || 3,          // display radius (px, scaled a little by zoom)
    fixed: !!o.fixed,
    trail: [],
  };
}

// Acceleration on every body from every other body. O(n²), fine for the few
// dozen bodies a solar system needs.
export function accelerations(bodies) {
  const n = bodies.length;
  const ax = new Float64Array(n), ay = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      const dx = bodies[j].x - bodies[i].x;
      const dy = bodies[j].y - bodies[i].y;
      const d2 = dx * dx + dy * dy + SOFTENING2;
      const invD = 1 / Math.sqrt(d2);
      const invD3 = invD / d2;
      const s = G * invD3;
      ax[i] += s * bodies[j].m * dx; ay[i] += s * bodies[j].m * dy;
      ax[j] -= s * bodies[i].m * dx; ay[j] -= s * bodies[i].m * dy;
    }
  }
  return { ax, ay };
}

// Leapfrog (kick–drift–kick), a symplectic integrator: it conserves orbital
// energy over arbitrarily long runs instead of spiralling in/out like Euler.
export function leapfrog(bodies, dt) {
  let { ax, ay } = accelerations(bodies);
  for (let i = 0; i < bodies.length; i++) {
    const b = bodies[i];
    if (b.fixed) continue;
    b.vx += 0.5 * dt * ax[i];
    b.vy += 0.5 * dt * ay[i];
  }
  for (const b of bodies) {
    if (b.fixed) continue;
    b.x += dt * b.vx;
    b.y += dt * b.vy;
  }
  ({ ax, ay } = accelerations(bodies));
  for (let i = 0; i < bodies.length; i++) {
    const b = bodies[i];
    if (b.fixed) continue;
    b.vx += 0.5 * dt * ax[i];
    b.vy += 0.5 * dt * ay[i];
  }
}

// Keplerian orbital elements of `body` relative to `primary` (usually the Sun).
export function orbitalElements(body, primary) {
  const mu = G * (primary.m + body.m);
  const dx = body.x - primary.x, dy = body.y - primary.y;
  const dvx = body.vx - primary.vx, dvy = body.vy - primary.vy;
  const r = Math.hypot(dx, dy);
  const v2 = dvx * dvx + dvy * dvy;
  const energy = v2 / 2 - mu / r;
  const a = -mu / (2 * energy);              // semi-major axis (AU)
  // eccentricity vector
  const h = dx * dvy - dy * dvx;             // specific angular momentum (2D scalar)
  const ex = (dvy * h) / mu - dx / r;
  const ey = (-dvx * h) / mu - dy / r;
  const e = Math.hypot(ex, ey);
  const period = a > 0 ? Math.sqrt((a * a * a) / (primary.m + body.m)) : Infinity;
  return { a, e, period, r, bound: energy < 0 };
}

// Circular-orbit velocity magnitude at radius a around mass M (G = 4π²).
export function circularSpeed(M, a) {
  return Math.sqrt(G * M / a);
}
