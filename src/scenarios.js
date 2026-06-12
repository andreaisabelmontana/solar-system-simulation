import { makeBody, circularSpeed } from "./physics.js";

// Real-ish semi-major axes (AU) and masses (M☉) for the eight planets.
const PLANETS = [
  { name: "Mercury", a: 0.387, m: 1.65e-7, color: "#b8b1a6", r: 2 },
  { name: "Venus",   a: 0.723, m: 2.45e-6, color: "#e6c98f", r: 3 },
  { name: "Earth",   a: 1.000, m: 3.00e-6, color: "#6ab7ff", r: 3.2 },
  { name: "Mars",    a: 1.524, m: 3.20e-7, color: "#e1714b", r: 2.6 },
  { name: "Jupiter", a: 5.203, m: 9.54e-4, color: "#d8b48c", r: 7 },
  { name: "Saturn",  a: 9.537, m: 2.86e-4, color: "#e6d3a3", r: 6 },
  { name: "Uranus",  a: 19.19, m: 4.37e-5, color: "#9fe5e5", r: 4.5 },
  { name: "Neptune", a: 30.07, m: 5.15e-5, color: "#5b7bff", r: 4.4 },
];

function sun(over = {}) {
  return makeBody({ name: "Sun", type: "star", m: 1, x: 0, y: 0, color: "#ffd24a", r: 12, ...over });
}

// Place a planet on a circular orbit at staggered starting angles.
function planet(def, M = 1, angle = 0, aOverride) {
  const a = aOverride || def.a;
  const v = circularSpeed(M, a);
  return makeBody({
    name: def.name, type: "planet", m: def.m, color: def.color, r: def.r,
    x: a * Math.cos(angle), y: a * Math.sin(angle),
    vx: -v * Math.sin(angle), vy: v * Math.cos(angle),
  });
}

function baseSystem(M = 1, skip = []) {
  const bodies = [sun({ m: M })];
  PLANETS.forEach((def, i) => {
    if (skip.includes(def.name)) return;
    bodies.push(planet(def, M, (i / PLANETS.length) * Math.PI * 2));
  });
  return bodies;
}

export const SCENARIOS = {
  solar: { label: "Solar System", build: () => baseSystem() },

  rogue: {
    label: "Rogue Planet",
    build: () => {
      const b = baseSystem();
      // a Jupiter-mass intruder falling in from the upper left
      b.push(makeBody({
        name: "Intruder", type: "giant", m: 9.5e-4, color: "#ff5d7a", r: 7,
        x: -45, y: 30, vx: 5.0, vy: -3.4,
      }));
      return b;
    },
  },

  nojupiter: { label: "No Jupiter", build: () => baseSystem(1, ["Jupiter"]) },

  binary: {
    label: "Binary Star",
    build: () => {
      const b = baseSystem();
      const a = 8, M = 1;
      const v = circularSpeed(M, a) * 0.7;
      b.push(makeBody({ name: "Companion", type: "star", m: 0.5, color: "#ff9d5c", r: 9, x: a, y: 0, vx: 0, vy: v }));
      return b;
    },
  },

  blackhole: {
    label: "Sun → Black Hole",
    build: () => {
      const b = baseSystem();
      b[0].type = "blackhole"; b[0].color = "#9b6bff"; b[0].r = 8; b[0].name = "Black Hole";
      return b; // same mass → orbits unchanged
    },
  },

  doublemass: { label: "Double-Mass Sun", build: () => baseSystem(2) },

  earthatmars: {
    label: "Earth at Mars",
    build: () => {
      const b = baseSystem(1, ["Earth"]);
      const def = PLANETS.find((p) => p.name === "Earth");
      b.push(planet(def, 1, 0.7, 1.524)); // Earth placed on Mars's orbit
      return b;
    },
  },

  heavyearth: {
    label: "Heavy Earth",
    build: () => {
      const b = baseSystem(1, ["Earth"]);
      const def = { ...PLANETS.find((p) => p.name === "Earth"), m: 9.5e-4, r: 6 };
      b.push(planet(def, 1, (2 / 8) * Math.PI * 2));
      b[b.length - 1].name = "Heavy Earth";
      return b;
    },
  },
};
