import { makeBody, leapfrog, orbitalElements } from "./physics.js";
import { SCENARIOS } from "./scenarios.js";

const canvas = document.getElementById("stage");
const ctx = canvas.getContext("2d");

const DT = 0.001; // years per integration substep
const sim = {
  bodies: [],
  time: 0,
  speed: 2,        // years per second of wall-clock
  running: true,
  selected: null,
  pauseOnEvent: false,
  showTrails: true,
};
const cam = { scale: 26, cx: 0, cy: 0 }; // px per AU, center (AU)
let W, H;

function resize() {
  W = window.innerWidth; H = window.innerHeight;
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  canvas.width = W * dpr; canvas.height = H * dpr;
  canvas.style.width = W + "px"; canvas.style.height = H + "px";
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
}
resize();
window.addEventListener("resize", resize);

const toScreen = (x, y) => [W / 2 + (x - cam.cx) * cam.scale, H / 2 + (y - cam.cy) * cam.scale];
const toWorld = (sx, sy) => [(sx - W / 2) / cam.scale + cam.cx, (sy - H / 2) / cam.scale + cam.cy];

// ---- events ----
const log = [];
const logEl = document.getElementById("log");
function event(kind, text) {
  log.unshift({ t: sim.time, kind, text });
  if (log.length > 40) log.pop();
  renderLog();
  if (sim.pauseOnEvent) { sim.running = false; updatePlayBtn(); }
}
function renderLog() {
  logEl.innerHTML = log.length
    ? log.map((e) => `<li><span class="${e.kind}">${e.kind}</span> ${e.text} <em>· yr ${e.t.toFixed(1)}</em></li>`).join("")
    : '<li class="empty">No events yet.</li>';
}

const COLLIDE_R = { star: 0.06, blackhole: 0.02, giant: 0.02, planet: 0.008, comet: 0.006 };
function collideR(b) { return COLLIDE_R[b.type] ?? 0.01; }

function detectEvents() {
  const b = sim.bodies;
  for (let i = 0; i < b.length; i++) {
    for (let j = i + 1; j < b.length; j++) {
      const dx = b[j].x - b[i].x, dy = b[j].y - b[i].y;
      const d = Math.hypot(dx, dy);
      if (d < collideR(b[i]) + collideR(b[j])) { merge(i, j); return; }
      // close approach (skip the Sun as primary)
      const thresh = 0.5;
      if (d < thresh && b[i].type !== "star" && b[j].type !== "star") {
        const key = `${b[i].id}-${b[j].id}`;
        if (!closeCooldown.has(key)) {
          event("close", `${b[i].name} & ${b[j].name} passed within ${(d).toFixed(2)} AU`);
          closeCooldown.set(key, sim.time);
        }
      }
    }
    // ejection
    const dist = Math.hypot(b[i].x, b[i].y);
    if (dist > 150 && !b[i].ejected && b[i].type !== "star") {
      const el = orbitalElements(b[i], b[0]);
      if (!el.bound) { event("ejection", `${b[i].name} was ejected from the system`); b[i].ejected = true; }
    }
  }
  // expire close-approach cooldowns
  for (const [k, t] of closeCooldown) if (sim.time - t > 2) closeCooldown.delete(k);
}
const closeCooldown = new Map();

function merge(i, j) {
  const a = sim.bodies[i], b = sim.bodies[j];
  const keep = a.m >= b.m ? a : b;
  const gone = a.m >= b.m ? b : a;
  const M = a.m + b.m;
  keep.vx = (a.m * a.vx + b.m * b.vx) / M;
  keep.vy = (a.m * a.vy + b.m * b.vy) / M;
  keep.x = (a.m * a.x + b.m * b.x) / M;
  keep.y = (a.m * a.y + b.m * b.y) / M;
  keep.m = M;
  keep.r = Math.min(16, keep.r + gone.r * 0.4);
  sim.bodies = sim.bodies.filter((x) => x !== gone);
  if (sim.selected === gone) selectBody(null);
  event("collision", `${gone.name} merged into ${keep.name}`);
}

// ---- scenarios ----
function loadScenario(key) {
  sim.bodies = SCENARIOS[key].build();
  sim.time = 0;
  log.length = 0; renderLog();
  closeCooldown.clear();
  selectBody(null);
  // frame the system
  const maxR = Math.max(...sim.bodies.map((b) => Math.hypot(b.x, b.y)), 2);
  cam.cx = 0; cam.cy = 0;
  cam.scale = Math.min(W, H) * 0.42 / maxR;
}

// ---- step ----
function advance(years) {
  let remaining = years;
  let guard = 0;
  // cap protects against runaway; 4000 substeps = up to 4 yr per call, which
  // comfortably covers the fastest time-speed even on a slow frame.
  while (remaining > 1e-9 && guard < 4000) {
    const dt = Math.min(DT, remaining);
    leapfrog(sim.bodies, dt);
    sim.time += dt;
    remaining -= dt;
    guard++;
    if (sim.showTrails) pushTrails();
    detectEvents();
    if (!sim.running) break;
  }
}
let trailTick = 0;
function pushTrails() {
  trailTick++;
  if (trailTick % 6 !== 0) return;
  for (const b of sim.bodies) {
    b.trail.push(b.x, b.y);
    const max = b.type === "star" ? 0 : 220;
    while (b.trail.length > max * 2) b.trail.splice(0, 2);
  }
}

// ---- render ----
function render() {
  ctx.fillStyle = "#02030a";
  ctx.fillRect(0, 0, W, H);

  // trails
  if (sim.showTrails) {
    for (const b of sim.bodies) {
      if (b.trail.length < 4) continue;
      ctx.strokeStyle = b.color + "55";
      ctx.lineWidth = 1;
      ctx.beginPath();
      for (let k = 0; k < b.trail.length; k += 2) {
        const [sx, sy] = toScreen(b.trail[k], b.trail[k + 1]);
        k === 0 ? ctx.moveTo(sx, sy) : ctx.lineTo(sx, sy);
      }
      ctx.stroke();
    }
  }

  // bodies
  for (const b of sim.bodies) {
    const [sx, sy] = toScreen(b.x, b.y);
    const rad = Math.max(2, b.r * (b.type === "star" || b.type === "blackhole" ? 1 : 0.9));
    if (b.type === "blackhole") {
      ctx.beginPath(); ctx.arc(sx, sy, rad + 6, 0, Math.PI * 2);
      ctx.strokeStyle = "#9b6bff"; ctx.lineWidth = 2; ctx.stroke();
      ctx.fillStyle = "#000"; ctx.beginPath(); ctx.arc(sx, sy, rad, 0, Math.PI * 2); ctx.fill();
    } else {
      ctx.fillStyle = b.color;
      if (b.type === "star") { ctx.shadowColor = b.color; ctx.shadowBlur = 28; }
      ctx.beginPath(); ctx.arc(sx, sy, rad, 0, Math.PI * 2); ctx.fill();
      ctx.shadowBlur = 0;
    }
    if (b === sim.selected) {
      ctx.strokeStyle = "#fff"; ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.arc(sx, sy, rad + 6, 0, Math.PI * 2); ctx.stroke();
    }
    // label inner bodies when zoomed enough
    if (cam.scale > 10 && b.type !== "star") {
      ctx.fillStyle = "rgba(255,255,255,.55)";
      ctx.font = "11px -apple-system, sans-serif";
      ctx.fillText(b.name, sx + rad + 4, sy + 3);
    }
  }

  // velocity arrow while placing
  if (place && place.dragging) {
    const [sx, sy] = toScreen(place.x, place.y);
    ctx.strokeStyle = "#4cff9e"; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(sx, sy); ctx.lineTo(place.sx, place.sy); ctx.stroke();
    ctx.fillStyle = "#4cff9e"; ctx.beginPath(); ctx.arc(sx, sy, 4, 0, Math.PI * 2); ctx.fill();
  }

  // HUD time
  hud.textContent = `t = ${sim.time.toFixed(1)} yr · ${sim.bodies.length} bodies · ${cam.scale.toFixed(1)} px/AU`;
}
const hud = document.getElementById("clock");

let last = 0;
function frame(now) {
  const dt = Math.min(0.05, (now - (last || now)) / 1000);
  last = now;
  if (sim.running) advance(sim.speed * dt);
  if (sim.selected) updateInspector();
  render();
  requestAnimationFrame(frame);
}

// ---- selection / inspector ----
function selectBody(b) {
  sim.selected = b;
  const insp = document.getElementById("inspector");
  if (!b) { insp.classList.add("hidden"); return; }
  insp.classList.remove("hidden");
  document.getElementById("insp-name").textContent = b.name;
  updateInspector();
}
function updateInspector() {
  const b = sim.selected; if (!b) return;
  const el = orbitalElements(b, sim.bodies[0]);
  document.getElementById("insp-a").textContent = isFinite(el.a) ? el.a.toFixed(3) + " AU" : "—";
  document.getElementById("insp-e").textContent = el.e.toFixed(3);
  document.getElementById("insp-T").textContent = isFinite(el.period) && el.bound ? el.period.toFixed(2) + " yr" : "unbound";
  const ms = document.getElementById("insp-mass");
  if (document.activeElement !== ms) ms.value = Math.log10(b.m);
  document.getElementById("insp-massval").textContent = b.m.toExponential(2) + " M☉";
}

// ---- input ----
let place = null;     // active body placement
let panning = null;

function bodyAt(sx, sy) {
  for (const b of sim.bodies) {
    const [bx, by] = toScreen(b.x, b.y);
    if (Math.hypot(bx - sx, by - sy) < Math.max(8, b.r + 4)) return b;
  }
  return null;
}

const TYPE_DEFAULTS = {
  planet: { m: 3e-6, color: "#6ab7ff", r: 3.2 },
  giant: { m: 9.5e-4, color: "#d8b48c", r: 7 },
  star: { m: 0.5, color: "#ffd24a", r: 10 },
  blackhole: { m: 3, color: "#9b6bff", r: 7 },
  comet: { m: 1e-9, color: "#cfe8ff", r: 2 },
};

canvas.addEventListener("mousedown", (e) => {
  const addType = addSel.value;
  const hit = bodyAt(e.clientX, e.clientY);
  if (addType === "none") {
    if (hit) selectBody(hit);
    else { panning = { x: e.clientX, y: e.clientY }; selectBody(null); }
    return;
  }
  const [wx, wy] = toWorld(e.clientX, e.clientY);
  place = { type: addType, x: wx, y: wy, sx: e.clientX, sy: e.clientY, dragging: true };
});
window.addEventListener("mousemove", (e) => {
  if (panning) {
    cam.cx -= (e.clientX - panning.x) / cam.scale;
    cam.cy -= (e.clientY - panning.y) / cam.scale;
    panning = { x: e.clientX, y: e.clientY };
  } else if (place && place.dragging) {
    place.sx = e.clientX; place.sy = e.clientY;
  }
});
window.addEventListener("mouseup", (e) => {
  if (place && place.dragging) {
    // velocity from drag: screen px → AU/yr (scaled so a modest drag ≈ orbital speed)
    const vx = (place.sx - toScreen(place.x, place.y)[0]) / cam.scale * 1.2;
    const vy = (place.sy - toScreen(place.x, place.y)[1]) / cam.scale * 1.2;
    const d = TYPE_DEFAULTS[place.type];
    const b = makeBody({ name: cap(place.type), type: place.type, m: d.m, color: d.color, r: d.r, x: place.x, y: place.y, vx, vy });
    sim.bodies.push(b);
    event("spawn", `${b.name} added`);
    place = null;
  }
  panning = null;
});
function cap(s) { return s[0].toUpperCase() + s.slice(1); }

canvas.addEventListener("wheel", (e) => {
  e.preventDefault();
  const [wx, wy] = toWorld(e.clientX, e.clientY);
  cam.scale *= e.deltaY > 0 ? 0.88 : 1.13;
  // keep cursor point fixed
  const [nx, ny] = toWorld(e.clientX, e.clientY);
  cam.cx += wx - nx; cam.cy += wy - ny;
}, { passive: false });

window.addEventListener("keydown", (e) => {
  if ((e.key === "Delete" || e.key === "Backspace") && sim.selected && sim.selected.type !== "star" && sim.selected.type !== "blackhole") {
    const n = sim.selected.name;
    sim.bodies = sim.bodies.filter((b) => b !== sim.selected);
    event("removed", `${n} deleted`);
    selectBody(null);
  }
  if (e.key === " ") { e.preventDefault(); toggleRun(); }
});

// ---- UI wiring ----
const scenSel = document.getElementById("scenario");
for (const [key, s] of Object.entries(SCENARIOS)) {
  const o = document.createElement("option"); o.value = key; o.textContent = s.label; scenSel.appendChild(o);
}
scenSel.addEventListener("change", () => loadScenario(scenSel.value));

const addSel = document.getElementById("addtype");
const speed = document.getElementById("speed");
const speedOut = document.querySelector('[data-out="speed"]');
speed.addEventListener("input", () => { sim.speed = +speed.value; speedOut.textContent = (+speed.value).toFixed(1); });

const playBtn = document.getElementById("play");
function toggleRun() { sim.running = !sim.running; updatePlayBtn(); }
function updatePlayBtn() { playBtn.textContent = sim.running ? "⏸ Pause" : "▶ Play"; }
playBtn.addEventListener("click", toggleRun);
document.getElementById("reset").addEventListener("click", () => loadScenario(scenSel.value));

document.getElementById("trails").addEventListener("input", (e) => (sim.showTrails = e.target.checked));
document.getElementById("pauseonevent").addEventListener("input", (e) => (sim.pauseOnEvent = e.target.checked));

document.getElementById("insp-mass").addEventListener("input", (e) => {
  if (sim.selected) { sim.selected.m = Math.pow(10, +e.target.value); updateInspector(); }
});
document.getElementById("insp-del").addEventListener("click", () => {
  if (sim.selected) {
    const n = sim.selected.name;
    sim.bodies = sim.bodies.filter((b) => b !== sim.selected);
    event("removed", `${n} deleted`);
    selectBody(null);
  }
});
document.getElementById("collapse").addEventListener("click", () =>
  document.getElementById("panel").classList.toggle("hidden"));

loadScenario("solar");
renderLog();
requestAnimationFrame(frame);

window.__orrery = { sim, cam, loadScenario, advance, render, get bodyCount() { return sim.bodies.length; }, orbitalElements, get dims() { return { W, H }; }, resize };
