// Pure game model: config + input/rate/speed/physics. No DOM, so it runs in Node tests too.
// Loaded as a classic <script> (works from file:// without a server) and via require() in test.js.

const CONFIG = {
  // Selectable test durations (seconds). First entry is the default.
  durations: [10, 30, 60, 120, 300, 720],

  // The two alternating keys, by KeyboardEvent.code (physical key, layout-independent).
  keys: { left: 'KeyA', right: 'KeyD' },

  countdownSeconds: 3,

  // Bump whenever anything in BALANCING changes: scores are only comparable within one version,
  // so each version gets its own top lists.
  rulesVersion: 1,

  // Server-side plausibility checks for submitted runs (see validateRun).
  validation: {
    maxRate: 20,          // presses/sec sustained over any 1 s window; above this isn't human
    minPressesForCv: 40,  // only check regularity on runs with enough presses
    minIntervalCv: 0.03,  // interval std/mean below this = machine-perfect timing (bot)
    nameMaxLength: 20,
  },

  // Show debug overlay on start. Toggle in-game with the ` key, or add ?debug=1 to the URL.
  debug: false,

  // --- BALANCING (experimental, not a validated Cooper conversion) ---
  // Rolling window for measuring valid presses/sec. Shorter = more reactive, jumpier.
  rateWindowSeconds: 1.0,
  // Max presses remembered in the window; must exceed (max humanly possible rate * window).
  rateBufferSize: 64,

  // Target speed curve: speed = maxSpeed * (1 - exp(-(rate - deadzone) / softness))
  // Saturating curve: early presses give a lot, very fast mashing gives diminishing returns.
  // With these values: 2/s ≈ 6 km/h, 4/s ≈ 12, 6/s ≈ 16, 8/s ≈ 19, 12/s ≈ 23 km/h.
  speedCurve: {
    deadzone: 0.5,   // presses/sec below this → standing still
    maxSpeed: 7.5,   // m/s (27 km/h), asymptotic ceiling
    softness: 6.0,   // presses/sec; larger = need faster input to approach maxSpeed
  },

  acceleration: 2.5, // m/s² toward a higher target speed
  deceleration: 3.5, // m/s² toward a lower target speed

  // --- Rendering ---
  pixelsPerMeter: 40,
  hudUpdateHz: 10,          // DOM HUD refresh rate (canvas still renders every frame)
  anim: {
    walkBelow: 2.0,         // m/s; under this the runner walks (no flight phase, upright)
    cadenceBase: 1.4,       // steps/sec at minimal movement
    cadencePerMps: 0.22,    // extra steps/sec per m/s of speed
    maxLean: 0.25,          // radians of forward lean at max speed
  },
};

// Tracks key held state and decides which presses are valid alternations.
function createInput(keys) {
  const held = { [keys.left]: false, [keys.right]: false };
  const s = { rawPresses: 0, validPresses: 0, lastValidKey: null };
  return {
    stats: s,
    isGameKey: code => code in held,
    // Returns true if this keydown is a valid alternating press.
    down(code, repeat) {
      if (!(code in held) || repeat || held[code]) return false; // auto-repeat or already held
      held[code] = true;
      s.rawPresses++;
      if (code === s.lastValidKey) return false; // same key twice
      s.lastValidKey = code;
      s.validPresses++;
      return true;
    },
    up(code) { if (code in held) held[code] = false; },
    releaseAll() { for (const k in held) held[k] = false; },
    resetStats() { s.rawPresses = 0; s.validPresses = 0; s.lastValidKey = null; },
  };
}

// Rolling-window press counter. Fixed ring buffer → no allocations during play.
function createRateMeter(windowSec, size) {
  const times = new Float64Array(size);
  let head = 0, count = 0;
  return {
    add(t) { times[head] = t; head = (head + 1) % size; if (count < size) count++; },
    rate(now) {
      while (count && now - times[(head - count + size) % size] > windowSec) count--;
      return count / windowSec;
    },
    reset() { head = 0; count = 0; },
  };
}

function targetSpeed(rate, c = CONFIG.speedCurve) {
  if (rate <= c.deadzone) return 0;
  return c.maxSpeed * (1 - Math.exp(-(rate - c.deadzone) / c.softness));
}

// Moves speed toward target with limited accel/decel; returns distance covered (trapezoid).
function stepPhysics(p, target, dt, cfg = CONFIG) {
  const v0 = p.speed;
  const maxDelta = (target > v0 ? cfg.acceleration : cfg.deceleration) * dt;
  p.speed = Math.abs(target - v0) <= maxDelta ? target : v0 + Math.sign(target - v0) * maxDelta;
  const d = (v0 + p.speed) / 2 * dt;
  p.distance += d;
  if (p.speed > p.maxSpeed) p.maxSpeed = p.speed;
  return d;
}

// Official distance: replays valid press times (seconds from start) through the same model
// at a fixed step. Live play uses per-frame dt, so the on-screen distance can differ by a few cm.
const REPLAY_STEP = 1 / 120;
function replay(presses, duration, cfg = CONFIG) {
  const meter = createRateMeter(cfg.rateWindowSeconds, cfg.rateBufferSize);
  const p = { speed: 0, distance: 0, maxSpeed: 0 };
  const steps = Math.round(duration / REPLAY_STEP);
  let i = 0;
  for (let n = 1; n <= steps; n++) {
    const t = n * REPLAY_STEP;
    while (i < presses.length && presses[i] <= t) meter.add(presses[i++]);
    stepPhysics(p, targetSpeed(meter.rate(t), cfg.speedCurve), REPLAY_STEP, cfg);
  }
  return p;
}

// Returns an error string, or null if the run is plausible. Input comes from untrusted clients.
function validateRun(run, cfg = CONFIG) {
  const v = cfg.validation;
  if (!run || typeof run !== 'object') return 'bad body';
  const { duration, presses, name, rulesVersion } = run;
  if (rulesVersion !== cfg.rulesVersion) return 'outdated game version, reload the page';
  if (!cfg.durations.includes(duration)) return 'bad duration';
  if (typeof name !== 'string' || !/^[\p{L}\p{N} _.-]{1,}$/u.test(name.trim()) || name.trim().length > v.nameMaxLength) return 'bad name';
  if (!Array.isArray(presses) || presses.length > duration * v.maxRate + 1) return 'bad presses';
  let sum = 0, sumSq = 0;
  for (let i = 0; i < presses.length; i++) {
    const t = presses[i];
    if (typeof t !== 'number' || !(t >= 0 && t <= duration)) return 'bad press time';
    if (i === 0) continue;
    const d = t - presses[i - 1];
    if (d < 0) return 'presses out of order'; // tiny gaps are normal: fingers roll from one key to the other
    sum += d; sumSq += d * d;
    const w = Math.ceil(v.maxRate) + 1; // more than maxRate presses inside 1 s
    if (i >= w && t - presses[i - w] < 1) return 'rate too high';
  }
  const n = presses.length - 1;
  if (n + 1 >= v.minPressesForCv) {
    const mean = sum / n, sd = Math.sqrt(Math.max(0, sumSq / n - mean * mean));
    if (sd / mean < v.minIntervalCv) return 'timing too regular';
  }
  return null;
}

if (typeof module !== 'undefined') module.exports = { CONFIG, createInput, createRateMeter, targetSpeed, stepPhysics, replay, validateRun };
