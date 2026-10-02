// Browser side: states, loop, input wiring, rendering, UI. Model lives in logic.js.
(() => {
const $ = id => document.getElementById(id);
const canvas = $('c'), ctx = canvas.getContext('2d');
const ui = {
  hud: $('hud'), menu: $('menu'), countdown: $('countdown'), cd: $('cd'), results: $('results'), debug: $('debug'),
  rem: $('h-rem'), el: $('h-el'), dist: $('h-dist'), spd: $('h-spd'), rate: $('h-rate'),
};

const input = createInput(CONFIG.keys);
const meter = createRateMeter(CONFIG.rateWindowSeconds, CONFIG.rateBufferSize);
const phys = { speed: 0, distance: 0, maxSpeed: 0 };
const anim = { phase: 0 };

let state = 'MENU';            // MENU | COUNTDOWN | RUNNING | FINISHED
let duration = CONFIG.durations[0];
let stateStart = 0;            // performance.now() ms when current state began
let elapsed = 0;               // seconds of RUNNING
let rate = 0, target = 0;
let debug = CONFIG.debug || new URLSearchParams(location.search).has('debug');
let lastFrame = performance.now(), fps = 0, lastHud = 0;
// Valid press times (s from run start) for server replay. Preallocated for the longest test.
const pressTimes = new Float64Array(Math.max(...CONFIG.durations) * CONFIG.validation.maxRate * 2);
let pressCount = 0;

// ---------- formatting ----------
const kmh = v => (v * 3.6).toFixed(1) + ' km/h';
const mmss = s => { s = Math.max(0, s); const m = Math.floor(s / 60); return m + ':' + (s % 60).toFixed(1).padStart(4, '0'); };
const durLabel = d => d < 60 ? d + ' s' : d / 60 + ' min';
const keyName = code => code.replace(/^Key|^Digit/, '');

// ---------- menu ----------
$('m-keys').textContent = keyName(CONFIG.keys.left) + ' / ' + keyName(CONFIG.keys.right);
const durBox = $('durations');
for (const d of CONFIG.durations) {
  const b = document.createElement('button');
  b.textContent = durLabel(d);
  b.onclick = () => { duration = d; markDuration(); };
  b.dataset.d = d;
  durBox.appendChild(b);
}
function markDuration() { for (const b of durBox.children) b.classList.toggle('sel', +b.dataset.d === duration); loadTop(); }
$('start').onclick = $('restart').onclick = () => setState('COUNTDOWN');
$('to-menu').onclick = () => setState('MENU');

// ---------- state ----------
function setState(s) {
  state = s;
  stateStart = performance.now();
  ui.menu.hidden = s !== 'MENU';
  ui.countdown.hidden = s !== 'COUNTDOWN';
  ui.results.hidden = s !== 'FINISHED';
  ui.hud.hidden = s !== 'RUNNING' && s !== 'COUNTDOWN';
  if (s === 'COUNTDOWN' || s === 'MENU') {
    input.resetStats(); meter.reset();
    phys.speed = phys.distance = phys.maxSpeed = 0;
    elapsed = rate = target = 0; pressCount = 0;
  }
  if (s === 'MENU') markDuration();
  if (s === 'COUNTDOWN') ui.cd.textContent = CONFIG.countdownSeconds;
  if (s === 'FINISHED') showResults();
  document.activeElement?.blur(); // keep Enter/Space from re-clicking buttons
  updateHud();
}

function showResults() {
  const s = input.stats;
  const rows = [
    ['Distance', Math.round(phys.distance) + ' m', 'primary'],
    ['Test duration', mmss(duration)],
    ['Average speed', kmh(phys.distance / duration)],
    ['Maximum speed', kmh(phys.maxSpeed)],
    ['Valid keypresses', s.validPresses],
    ['Avg valid presses/s', (s.validPresses / duration).toFixed(2)],
    ['Raw keypresses', s.rawPresses],
  ];
  submitted = false; $('submit-msg').textContent = ''; $('submit-form').hidden = false;
  $('r-table').innerHTML = rows.map(([k, v, c]) => `<tr class="${c || ''}"><td>${k}</td><td>${v}</td></tr>`).join('');
}

// ---------- top lists ----------
const esc = s => String(s).replace(/[&<>"']/g, c => '&#' + c.charCodeAt(0) + ';');
let topReq = 0;
async function loadTop() {
  const req = ++topReq;
  $('top-title').textContent = durLabel(duration);
  $('top-table').innerHTML = ''; $('top-msg').textContent = 'Loading…';
  try {
    const res = await fetch('/api/scores?duration=' + duration);
    if (!res.ok) throw new Error();
    const list = await res.json();
    if (req !== topReq) return; // a newer request superseded this one
    $('top-table').innerHTML = list.map((e, i) => `<tr><td>${i + 1}.</td><td>${esc(e.name)}</td><td>${esc(Math.round(e.distance))} m</td></tr>`).join('');
    $('top-msg').textContent = list.length ? '' : 'No results yet.';
  } catch { if (req === topReq) $('top-msg').textContent = 'Top list unavailable offline.'; }
}

let submitted = false;
$('submit-form').onsubmit = async e => {
  e.preventDefault();
  if (submitted) return;
  submitted = true;
  const msg = $('submit-msg');
  msg.textContent = 'Submitting…';
  try {
    const res = await fetch('/api/scores', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ rulesVersion: CONFIG.rulesVersion, duration, name: $('name').value.trim(),
        presses: Array.from(pressTimes.subarray(0, pressCount), t => Math.round(t * 1000) / 1000) }),
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(body.error || 'HTTP ' + res.status);
    msg.textContent = `Saved! Official distance ${Math.round(body.distance)} m.`;
    $('submit-form').hidden = true;
  } catch (err) { submitted = false; msg.textContent = 'Submit failed: ' + (err.message === 'Failed to fetch' ? 'offline' : err.message); }
};

// ---------- input ----------
addEventListener('keydown', e => {
  if (e.target.tagName === 'INPUT') return; // typing a name, not playing
  if (input.isGameKey(e.code)) {
    e.preventDefault();
    // Held-state is tracked in every state so a key held through "GO!" can't count as a fresh press.
    const valid = input.down(e.code, e.repeat);
    if (state !== 'RUNNING') { if (state !== 'FINISHED') input.resetStats(); return; }
    if (valid) {
      const now = performance.now();
      meter.add(now / 1000);
      if (pressCount < pressTimes.length) pressTimes[pressCount++] = (now - stateStart) / 1000;
    }
    return;
  }
  if (e.code === 'Backquote') { debug = !debug; ui.debug.hidden = !debug; return; }
  if (e.code === 'Space') e.preventDefault();
  if (e.code === 'Enter' && (state === 'MENU' || state === 'FINISHED')) { e.preventDefault(); setState('COUNTDOWN'); }
  if (e.code === 'Escape' && state !== 'MENU') setState('MENU');
});
addEventListener('keyup', e => input.up(e.code));
addEventListener('blur', () => input.releaseAll()); // missed keyups while unfocused

// ---------- loop ----------
function frame(nowMs) {
  const dt = Math.min((nowMs - lastFrame) / 1000, 1); // cap only affects visuals; timing uses absolute time
  lastFrame = nowMs;
  if (dt > 0) fps += (1 / dt - fps) * 0.1;

  if (state === 'COUNTDOWN') {
    const left = CONFIG.countdownSeconds - (nowMs - stateStart) / 1000;
    if (left <= 0) { setState('RUNNING'); ui.countdown.hidden = false; ui.cd.textContent = 'GO!'; }
    else ui.cd.textContent = Math.ceil(left);
  } else if (state === 'RUNNING') {
    // Timer from absolute start time, clamped so the last step ends exactly at `duration`.
    const newElapsed = Math.min((nowMs - stateStart) / 1000, duration);
    const step = newElapsed - elapsed;
    elapsed = newElapsed;
    rate = meter.rate(nowMs / 1000);
    target = targetSpeed(rate);
    stepPhysics(phys, target, step);
    if (elapsed > 0.6) ui.countdown.hidden = true;
    if (elapsed >= duration) { phys.speed = 0; setState('FINISHED'); }
  }

  updateAnim(dt);
  render();
  if (nowMs - lastHud > 1000 / CONFIG.hudUpdateHz) { lastHud = nowMs; updateHud(); }
  requestAnimationFrame(frame);
}

function updateAnim(dt) {
  const a = CONFIG.anim, v = phys.speed;
  if (v < 0.05) { anim.phase *= Math.max(0, 1 - dt * 8); return; } // settle to standing pose
  const stepsPerSec = a.cadenceBase + a.cadencePerMps * v;
  anim.phase = (anim.phase + Math.PI * stepsPerSec * dt) % (Math.PI * 2); // 2 steps per cycle
}

let hudCache = '';
function updateHud() {
  const txt = [mmss(duration - elapsed), mmss(elapsed), phys.distance.toFixed(1) + ' m', kmh(phys.speed), rate.toFixed(1)];
  const key = txt.join('|');
  if (key !== hudCache) {
    hudCache = key;
    ui.rem.textContent = txt[0]; ui.el.textContent = txt[1]; ui.dist.textContent = txt[2];
    ui.spd.textContent = txt[3]; ui.rate.textContent = txt[4];
  }
  ui.debug.hidden = !debug;
  if (debug) {
    const s = input.stats;
    ui.debug.textContent =
      `state      ${state}\nfps        ${fps.toFixed(0)}\nelapsed    ${elapsed.toFixed(3)} s\n` +
      `raw press  ${s.rawPresses}\nvalid      ${s.validPresses}\nrate       ${rate.toFixed(2)} /s\n` +
      `target     ${target.toFixed(2)} m/s (${kmh(target)})\nspeed      ${phys.speed.toFixed(2)} m/s\n` +
      `distance   ${phys.distance.toFixed(2)} m`;
  }
}

// ---------- render ----------
let W = 0, H = 0;
function resize() {
  const dpr = devicePixelRatio || 1;
  W = innerWidth; H = innerHeight;
  canvas.width = W * dpr; canvas.height = H * dpr;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
}
addEventListener('resize', resize);
resize();

function render() {
  const ppm = CONFIG.pixelsPerMeter;
  const ground = H * 0.7;
  const scroll = phys.distance * ppm; // world offset derived from physics distance, never the reverse

  ctx.fillStyle = '#1d2733'; ctx.fillRect(0, 0, W, ground);
  // far hills, parallax
  ctx.fillStyle = '#26364a';
  const hillW = 400, hOff = (scroll * 0.2) % hillW;
  for (let x = -hOff - hillW; x < W + hillW; x += hillW) {
    ctx.beginPath(); ctx.ellipse(x, ground, hillW * 0.6, H * 0.15, 0, Math.PI, 0); ctx.fill();
  }
  // track
  ctx.fillStyle = '#a5472f'; ctx.fillRect(0, ground, W, H - ground);
  ctx.strokeStyle = '#eee'; ctx.lineWidth = 2;
  ctx.beginPath(); ctx.moveTo(0, ground); ctx.lineTo(W, ground); ctx.moveTo(0, ground + 60); ctx.lineTo(W, ground + 60); ctx.stroke();
  // 1 m ticks and 10 m markers
  const cx = W / 2;
  const firstM = Math.floor(phys.distance - cx / ppm);
  ctx.fillStyle = '#eee'; ctx.font = '14px system-ui'; ctx.textAlign = 'center';
  for (let m = firstM; m * ppm - scroll + cx < W + ppm; m++) {
    if (m < 0) continue;
    const x = m * ppm - scroll + cx;
    if (m % 10 === 0) { ctx.fillRect(x - 1, ground, 3, 60); ctx.fillText(m + ' m', x, ground + 80); }
    else ctx.fillRect(x, ground + 52, 2, 8);
  }
  drawRunner(cx, ground);
}

function drawRunner(x, groundY) {
  const a = CONFIG.anim, v = phys.speed;
  const running = v >= a.walkBelow;
  const intensity = Math.min(1, v / CONFIG.speedCurve.maxSpeed);
  const swing = v < 0.05 ? 0 : running ? 0.5 + 0.4 * intensity : 0.25 + 0.15 * (v / a.walkBelow);
  const p = anim.phase, s = Math.sin(p);
  const lean = a.maxLean * intensity;
  const bounce = running ? Math.abs(Math.cos(p)) * 6 * intensity : 0;
  const L = 34; // limb segment length (px)
  const hipY = groundY - 2 * L - 4 - bounce;

  ctx.strokeStyle = '#ffd34d'; ctx.lineWidth = 7; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  const leg = (ph) => {
    const th = swing * Math.sin(ph);
    const knee = (running ? 0.4 + 0.9 * intensity : 0.2) * Math.max(0, -Math.cos(ph)) + 0.05;
    const kx = x + Math.sin(th) * L, ky = hipY + Math.cos(th) * L;
    ctx.beginPath(); ctx.moveTo(x, hipY); ctx.lineTo(kx, ky);
    ctx.lineTo(kx + Math.sin(th - knee) * L, ky + Math.cos(th - knee) * L); ctx.stroke();
  };
  const shX = x + Math.sin(lean) * 50, shY = hipY - Math.cos(lean) * 50;
  const arm = (ph) => {
    const th = -swing * 1.1 * Math.sin(ph);
    const elbow = running ? 1.4 : 0.3;
    const ex = shX + Math.sin(th) * 26, ey = shY + Math.cos(th) * 26;
    ctx.beginPath(); ctx.moveTo(shX, shY); ctx.lineTo(ex, ey);
    ctx.lineTo(ex + Math.sin(th + elbow) * 24, ey + Math.cos(th + elbow) * 24); ctx.stroke();
  };
  ctx.globalAlpha = 0.6; leg(p + Math.PI); arm(p + Math.PI); ctx.globalAlpha = 1; // far side
  ctx.beginPath(); ctx.moveTo(x, hipY); ctx.lineTo(shX, shY); ctx.stroke();
  leg(p); arm(p);
  ctx.fillStyle = '#ffd34d';
  ctx.beginPath(); ctx.arc(shX + Math.sin(lean) * 16, shY - 16, 12, 0, Math.PI * 2); ctx.fill();
}

setState('MENU');
ui.debug.hidden = !debug;
requestAnimationFrame(frame);
})();
