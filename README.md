# Orrery Lab

An interactive **N-body solar system simulator** that runs entirely in the browser — no install, no backend, just gravity. Load a "what if?" scenario, build your own system, and watch real orbital dynamics play out.

**▶ Live:** https://andreaisabelmontana.github.io/orrery-lab/

## What you can do

- **Run a what-if scenario** — Rogue Planet, No Jupiter, Binary Star, Sun → Black Hole, Double-Mass Sun, Earth at Mars, Heavy Earth
- **Build your own** — pick a body type, click to drop it, and drag to set its velocity vector
- **Inspect any body** — click it for live orbital elements (semi-major axis, eccentricity, period) and a mass slider you can move while the sim runs; press *Delete* to remove it
- **Watch events** — collisions (with momentum-conserving merges), ejections, and close approaches are detected and logged; enable *pause-on-event* to freeze the moment something interesting happens

## The physics

A full **N-body** model — every body pulls on every other body, every step. No Keplerian shortcuts.

- **Integrator:** Leapfrog (kick–drift–kick), a *symplectic* method that conserves orbital energy over long runs instead of spiralling like Euler.
- **Units:** AU, solar masses, years — which makes **G = 4π²**, so a 1 M☉ star gives Earth a 2π AU/yr circular speed and a 1-year period. Every quantity stays near 1.0.
- **Softening:** an ε² term keeps the 1/r² force finite during very close passes (standard computational-astrophysics practice).

## Tech

Vanilla JS + Canvas 2D. No build step, no dependencies.

```
index.html
styles.css
src/physics.js     # G=4π² gravity, leapfrog integrator, orbital elements
src/scenarios.js   # planet data + the seven what-if setups
src/main.js        # camera, render, events, inspector, controls
```

## License

MIT — see [LICENSE](LICENSE).
