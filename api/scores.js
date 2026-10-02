// GET  /api/scores?duration=120  → top list for that stage (current rulesVersion)
// POST /api/scores {duration, name, presses[], rulesVersion} → server replays the run and stores it
const { app } = require('@azure/functions');
const { TableClient } = require('@azure/data-tables');
const { CONFIG, replay, validateRun } = require('./logic.js');

const TOP_N = 100;
const MAX_DISTANCE_CM = 1e9; // row key inversion base; far above any possible run
const SUBMITS_PER_MINUTE = 5;

let table;
async function getTable() {
  if (!table) {
    const t = TableClient.fromConnectionString(process.env.SCORES_CONNECTION, 'scores', { allowInsecureConnection: true });
    await t.createTable(); // no-op if it exists
    table = t;
  }
  return table;
}

// Each stage+rules version is its own partition. Row keys sort ascending, so inverting the
// distance makes the first rows of a partition the best results (ties: earlier submit wins).
const partition = d => `v${CONFIG.rulesVersion}-${d}`;
const rowKey = cm => String(MAX_DISTANCE_CM - cm).padStart(10, '0') + '-' + Date.now() + '-' + Math.random().toString(36).slice(2, 6);

// ponytail: in-memory per instance, resets on cold start and isn't shared across instances.
// Move to a Table-backed counter or Azure Front Door rate limiting if abuse shows up.
// IPs are never stored.
const recent = new Map();
function rateLimited(ip) {
  const now = Date.now(), list = (recent.get(ip) || []).filter(t => now - t < 60000);
  if (recent.size > 10000) recent.clear();
  list.push(now); recent.set(ip, list);
  return list.length > SUBMITS_PER_MINUTE;
}

const json = (status, body) => ({ status, jsonBody: body });

app.http('scores', {
  methods: ['GET', 'POST'],
  authLevel: 'anonymous',
  handler: async (req, ctx) => {
    try {
      if (req.method === 'GET') {
        const duration = Number(req.query.get('duration'));
        if (!CONFIG.durations.includes(duration)) return json(400, { error: 'bad duration' });
        const t = await getTable();
        const pages = t.listEntities({ queryOptions: { filter: `PartitionKey eq '${partition(duration)}'` } }).byPage({ maxPageSize: TOP_N });
        const first = (await pages.next()).value || [];
        return json(200, first.slice(0, TOP_N).map(e => ({ name: e.name, distance: e.distance, maxSpeed: e.maxSpeed, presses: e.presses, date: e.date })));
      }

      const ip = (req.headers.get('x-forwarded-for') || '').split(',')[0].trim().replace(/^([\d.]+):\d+$/, '$1'); // strip IPv4 port
      if (rateLimited(ip)) return json(429, { error: 'too many submissions, wait a minute' });
      let run;
      try { run = await req.json(); } catch { return json(400, { error: 'bad json' }); }
      const err = validateRun(run);
      if (err) return json(400, { error: err });

      const r = replay(run.presses, run.duration);
      const cm = Math.round(r.distance * 100);
      const entity = {
        partitionKey: partition(run.duration), rowKey: rowKey(cm),
        name: run.name.trim(), distance: cm / 100, maxSpeed: Math.round(r.maxSpeed * 100) / 100,
        presses: run.presses.length, date: new Date().toISOString(),
      };
      await (await getTable()).createEntity(entity);
      return json(201, { distance: entity.distance });
    } catch (e) {
      ctx.error(e);
      return json(500, { error: 'server error' });
    }
  },
});
