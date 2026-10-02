// Run: node test.js
const assert = require('assert');
const { CONFIG, createInput, createRateMeter, targetSpeed, stepPhysics } = require('./src/logic.js');
const A = 'KeyA', D = 'KeyD';

// Alternation: A D A D all valid
let inp = createInput(CONFIG.keys);
const tap = k => { const v = inp.down(k, false); inp.up(k); return v; };
assert.deepStrictEqual([A, D, A, D].map(tap), [true, true, true, true]);

// Same key repeated is invalid: A A A D D A
inp = createInput(CONFIG.keys);
assert.deepStrictEqual([A, A, A, D, D, A].map(tap), [true, false, false, true, false, true]);
assert.strictEqual(inp.stats.rawPresses, 6);
assert.strictEqual(inp.stats.validPresses, 3);

// Holding A: auto-repeat (repeat flag) and repeated keydowns without keyup never count
inp = createInput(CONFIG.keys);
assert.strictEqual(inp.down(A, false), true);
for (let i = 0; i < 50; i++) assert.strictEqual(inp.down(A, true), false);
for (let i = 0; i < 50; i++) assert.strictEqual(inp.down(A, false), false); // repeat flag missing
assert.strictEqual(inp.stats.rawPresses, 1);

// Holding both keys: one valid each, then nothing
assert.strictEqual(inp.down(D, false), true);
for (let i = 0; i < 20; i++) { inp.down(A, true); inp.down(D, true); }
assert.strictEqual(inp.stats.validPresses, 2);

// Non-game keys ignored
assert.strictEqual(inp.down('KeyW', false), false);

// Rate meter: 8 presses/s for 2 s → ~8/s; then stop → 0 after window
const m = createRateMeter(1.0, 64);
for (let t = 0; t < 2; t += 0.125) m.add(t);
assert.ok(Math.abs(m.rate(1.9) - 8) <= 1, 'rate ' + m.rate(1.9));
assert.strictEqual(m.rate(3.0), 0);

// Speed curve: zero in deadzone, monotonic, saturating below max
assert.strictEqual(targetSpeed(0), 0);
assert.strictEqual(targetSpeed(CONFIG.speedCurve.deadzone), 0);
let prev = 0;
for (let r = 1; r <= 20; r++) { const v = targetSpeed(r); assert.ok(v > prev && v < CONFIG.speedCurve.maxSpeed); prev = v; }
console.log('curve (presses/s → km/h):', [2, 4, 6, 8, 10, 12, 15].map(r => `${r}→${(targetSpeed(r) * 3.6).toFixed(1)}`).join('  '));

// Physics is frame-rate independent: same distance at 30/60/120 fps and with a lag spike
function run(dts) { const p = { speed: 0, distance: 0, maxSpeed: 0 }; for (const dt of dts) stepPhysics(p, 4, dt); return p; }
const at = fps => run(Array(fps * 10).fill(1 / fps));
const d30 = at(30).distance, d60 = at(60).distance, d120 = at(120).distance;
const spiky = run([...Array(300).fill(1 / 60), 2.0, ...Array(180).fill(1 / 60)]).distance; // 5 s + 2 s spike + 3 s
for (const d of [d60, d120, spiky]) assert.ok(Math.abs(d - d30) < 1e-6, `${d} vs ${d30}`);
// Analytic: accel 0→4 m/s at 2.5 m/s² takes 1.6 s (3.2 m), then 8.4 s at 4 m/s (33.6 m) = 36.8 m
assert.ok(Math.abs(d60 - 36.8) < 1e-6, d60);

// Deceleration toward 0 and stays at 0
const p = { speed: 5, distance: 0, maxSpeed: 5 };
for (let i = 0; i < 600; i++) stepPhysics(p, 0, 1 / 60);
assert.strictEqual(p.speed, 0);
assert.ok(Math.abs(p.distance - 25 / (2 * CONFIG.deceleration)) < 0.01); // partial last step

console.log('all tests passed');

// --- Top-list server side ---
const { replay, validateRun } = require('./src/logic.js');
const fs = require('fs');
assert.strictEqual(fs.readFileSync('src/logic.js', 'utf8'), fs.readFileSync('api/logic.js', 'utf8'), 'api/logic.js out of sync: run make sync');

// Human-ish run: ~8/s with jitter for 30 s
let seed = 1; const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
const human = []; for (let t = 0.3; t < 30; t += 0.125 * (0.7 + 0.6 * rnd())) human.push(Math.round(t * 1000) / 1000);
const ok = { rulesVersion: CONFIG.rulesVersion, duration: 30, name: 'Runner 1', presses: human };
assert.strictEqual(validateRun(ok), null);
const r = replay(human, 30);
assert.ok(r.distance > 100 && r.distance < 30 * CONFIG.speedCurve.maxSpeed, 'replay distance ' + r.distance);
assert.strictEqual(replay([], 30).distance, 0);
assert.ok(replay(human.filter(t => t < 15), 30).distance < r.distance, 'stopping halfway runs less');

const bad = patch => validateRun({ ...ok, ...patch });
assert.match(bad({ rulesVersion: 0 }), /version/);
assert.match(bad({ duration: 31 }), /duration/);
assert.match(bad({ name: '' }), /name/);
assert.match(bad({ name: '<script>' }), /name/);
assert.match(bad({ name: 'x'.repeat(21) }), /name/);
assert.strictEqual(bad({ name: 'Säde_2' }), null);
assert.match(bad({ presses: 'x' }), /presses/);
assert.match(bad({ presses: [1, 'a'] }), /press time/);
assert.match(bad({ presses: [1, 31] }), /press time/);
assert.match(bad({ presses: [2, 1] }), /too fast/);         // unsorted
assert.match(bad({ presses: Array.from({ length: 200 }, (_, i) => i * 0.04) }), /rate too high/); // 25/s
assert.match(bad({ presses: Array.from({ length: 200 }, (_, i) => i * 0.1) }), /regular/);         // bot
assert.match(validateRun(null), /body/);

console.log('server checks passed');
