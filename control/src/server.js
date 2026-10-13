import Fastify from 'fastify';
import { WebSocketServer } from 'ws';
import Redis from 'ioredis';
import pg from 'pg';
import os from 'node:os';
import { LoadGenerator, SCENARIOS } from './loadgen.js';

const env = process.env;
const API_URL = env.API_URL ?? 'http://api:3001';
const TOXI_URL = env.TOXIPROXY_URL ?? 'http://toxiproxy:8474';
const MAX_RPS = Number(env.MAX_RPS ?? 1000);
const MAX_DURATION_SEC = Number(env.MAX_DURATION_SEC ?? 120);
const ADMIN_TOKEN = env.ADMIN_TOKEN ?? '';

const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, Number(v) || lo));

// 모니터링은 toxiproxy를 거치지 않고 직접 붙는다 → 장애 주입 중에도 실제 상태가 보인다
const redis = new Redis({
  host: env.REDIS_HOST ?? 'redis',
  port: 6379,
  enableOfflineQueue: false,
  maxRetriesPerRequest: 0,
  commandTimeout: 800,
  retryStrategy: () => 1000,
});
redis.on('error', () => {});
const db = new pg.Pool({
  host: env.DB_HOST ?? 'postgres',
  port: 5432,
  user: 'lab',
  password: env.DB_PASSWORD ?? 'lab',
  database: 'lab',
  max: 1,
  connectionTimeoutMillis: 800,
});
db.on('error', () => {});

// 다음 스냅샷에 실어 보낼 이벤트. 문구는 프론트에서 code로 번역한다.
let pending = [];
const logAction = (code, params = {}) => pending.push({ t: Date.now(), type: 'ACTION', code, ...params });

const loadgen = new LoadGenerator(API_URL, logAction);

// ---- 수집기
let lastApiSeq = 0;
async function apiStats() {
  try {
    const r = await fetch(`${API_URL}/internal/stats?since=${lastApiSeq}`, { signal: AbortSignal.timeout(800) });
    const { events, ...stats } = await r.json();
    if (stats.seq >= lastApiSeq) pending.push(...events);
    lastApiSeq = stats.seq; // api가 재시작되면 seq가 줄어든다
    return { up: true, ...stats };
  } catch {
    return { up: false };
  }
}

function parseInfo(info) {
  const kv = {};
  for (const line of info.split('\r\n')) {
    const i = line.indexOf(':');
    if (i > 0 && !line.startsWith('#')) kv[line.slice(0, i)] = line.slice(i + 1);
  }
  return kv;
}

async function redisSnapshot() {
  try {
    const kv = parseInfo(await redis.info());
    const keys = await redis.dbsize();
    const [, found] = await redis.scan(0, 'MATCH', 'product:*', 'COUNT', 1000);
    const sample = found.slice(0, 16);
    const ttls = sample.length ? await redis.pipeline(sample.map((k) => ['ttl', k])).exec() : [];
    return {
      up: true,
      usedMemory: Number(kv.used_memory),
      maxMemory: Number(kv.maxmemory),
      clients: Number(kv.connected_clients),
      opsPerSec: Number(kv.instantaneous_ops_per_sec),
      hits: Number(kv.keyspace_hits),
      misses: Number(kv.keyspace_misses),
      evicted: Number(kv.evicted_keys),
      keys,
      sampleKeys: sample.map((key, i) => ({ key, ttl: ttls[i]?.[1] ?? -2 })).sort((a, b) => b.ttl - a.ttl),
    };
  } catch {
    return { up: false };
  }
}

let maxConnections = null;
async function dbSnapshot() {
  try {
    if (maxConnections == null) maxConnections = Number((await db.query('SHOW max_connections')).rows[0].max_connections);
    const { rows } = await db.query(`
      SELECT usename AS user, coalesce(state, 'unknown') AS state, count(*)::int AS n
      FROM pg_stat_activity
      WHERE datname = current_database() AND pid <> pg_backend_pid()
      GROUP BY 1, 2 ORDER BY 1, 2`);
    return { up: true, maxConnections, sessions: rows };
  } catch {
    return { up: false };
  }
}

async function toxi(path, init = {}) {
  const r = await fetch(TOXI_URL + path, {
    ...init,
    headers: { 'content-type': 'application/json' },
    signal: AbortSignal.timeout(1500),
  });
  if (r.status === 404 || r.status === 204) return null;
  if (!r.ok) throw new Error(`toxiproxy ${r.status}: ${await r.text()}`);
  return r.json();
}

async function proxySnapshot() {
  try {
    const all = await toxi('/proxies');
    return Object.fromEntries(
      Object.values(all).map((p) => [
        p.name,
        { enabled: p.enabled, latencyMs: p.toxics.find((t) => t.type === 'latency')?.attributes.latency ?? 0 },
      ]),
    );
  } catch {
    return null;
  }
}

// ---- Docker 컨테이너 자원 (docker stats와 같은 계산)
const DOCKER_URL = env.DOCKER_URL ?? 'http://docker-proxy:2375';
const SERVICE_ORDER = ['api', 'postgres', 'redis', 'toxiproxy', 'control', 'web', 'caddy', 'docker-proxy'];
const limitsCache = new Map();
const prevStats = new Map();
let project = null;

async function docker(path) {
  const r = await fetch(DOCKER_URL + path, { signal: AbortSignal.timeout(900) });
  if (!r.ok) throw new Error(`docker ${r.status}`);
  return r.json();
}

async function containerStats(c) {
  const service = c.Labels['com.docker.compose.service'];
  const base = { service, state: c.State };
  if (c.State !== 'running') return base;

  if (!limitsCache.has(c.Id)) {
    const { HostConfig } = await docker(`/containers/${c.Id}/json`);
    limitsCache.set(c.Id, {
      cpuLimit: HostConfig.NanoCpus ? HostConfig.NanoCpus / 1e9 : null,
      memLimit: HostConfig.Memory || null,
    });
  }
  const s = await docker(`/containers/${c.Id}/stats?stream=false&one-shot=true`);
  const cpuTotal = s.cpu_stats.cpu_usage.total_usage;
  const system = s.cpu_stats.system_cpu_usage ?? 0;
  const hostCores = s.cpu_stats.online_cpus ?? 1;
  const net = Object.values(s.networks ?? {}).reduce((a, n) => ({ rx: a.rx + n.rx_bytes, tx: a.tx + n.tx_bytes }), { rx: 0, tx: 0 });
  const now = Date.now();

  // one-shot은 이전 샘플이 없으므로 직전 틱 값과 비교해 사용률을 계산한다
  const prev = prevStats.get(c.Id);
  prevStats.set(c.Id, { cpuTotal, system, ...net, t: now });
  let cpu = null;
  let rxPerSec = null;
  let txPerSec = null;
  if (prev && system > prev.system) {
    cpu = ((cpuTotal - prev.cpuTotal) / (system - prev.system)) * hostCores * 100; // 100% = 1코어
    const sec = (now - prev.t) / 1000;
    rxPerSec = (net.rx - prev.rx) / sec;
    txPerSec = (net.tx - prev.tx) / sec;
  }
  const mem = s.memory_stats ?? {};
  return {
    ...base,
    ...limitsCache.get(c.Id),
    hostCores,
    cpu,
    memUsed: (mem.usage ?? 0) - (mem.stats?.inactive_file ?? 0),
    memMax: mem.limit ?? null,
    rxPerSec,
    txPerSec,
    pids: s.pids_stats?.current ?? null,
  };
}

async function containersSnapshot() {
  try {
    // 자기 자신의 compose 프로젝트 이름으로 이 데모의 컨테이너만 고른다
    project ??= (await docker(`/containers/${os.hostname()}/json`)).Config.Labels['com.docker.compose.project'];
    const filters = encodeURIComponent(JSON.stringify({ label: [`com.docker.compose.project=${project}`] }));
    const list = await docker(`/containers/json?all=true&filters=${filters}`);
    const rows = await Promise.all(list.map((c) => containerStats(c).catch(() => ({ service: c.Labels['com.docker.compose.service'], state: c.State }))));
    const rank = (r) => (SERVICE_ORDER.includes(r.service) ? SERVICE_ORDER.indexOf(r.service) : 99);
    return { up: true, list: rows.sort((a, b) => rank(a) - rank(b)) };
  } catch {
    return { up: false, list: [] };
  }
}

// ---- 1초마다 스냅샷을 만들어 모든 접속자에게 브로드캐스트
const limits = {
  maxRps: MAX_RPS,
  maxDurationSec: MAX_DURATION_SEC,
  customSql: Boolean(ADMIN_TOKEN),
  scenarios: Object.keys(SCENARIOS),
};
let latest = null;
let ticking = false;
let wss;

async function tick() {
  if (ticking) return;
  ticking = true;
  try {
    const [api, redisS, dbS, proxies, containers] = await Promise.all([
      apiStats(),
      redisSnapshot(),
      dbSnapshot(),
      proxySnapshot(),
      containersSnapshot(),
    ]);
    const events = pending;
    pending = [];
    latest = {
      t: Date.now(),
      load: loadgen.snapshot(),
      containers,
      api,
      redis: redisS,
      db: dbS,
      proxies,
      limits,
      viewers: wss?.clients.size ?? 0,
      events,
    };
    const msg = JSON.stringify({ type: 'snapshot', data: latest });
    for (const c of wss?.clients ?? []) if (c.readyState === 1) c.send(msg);
  } finally {
    ticking = false;
  }
}
setInterval(tick, 1000);

// ---- HTTP API (Caddy가 /control/* 로 노출)
const app = Fastify({ logger: false, trustProxy: true });

// 공개 데모용: IP당 조작 요청 간격 제한
const lastHit = new Map();
app.addHook('preHandler', async (req, reply) => {
  if (req.method !== 'POST') return;
  const now = Date.now();
  if (now - (lastHit.get(req.ip) ?? 0) < 300) return reply.code(429).send({ code: 'RATE_LIMITED', error: 'Too many requests' });
  if (lastHit.size > 10_000) lastHit.clear();
  lastHit.set(req.ip, now);
});

app.get('/health', async () => ({ ok: true }));
app.get('/state', async () => latest);

app.post('/load/start', async (req, reply) => {
  const { scenario = 'product', rps, durationSec, sql, token } = req.body ?? {};
  if (!SCENARIOS[scenario]) return reply.code(400).send({ code: 'UNKNOWN_SCENARIO', error: 'Unknown scenario' });
  if (scenario === 'custom') {
    if (!ADMIN_TOKEN || token !== ADMIN_TOKEN) return reply.code(403).send({ code: 'ADMIN_REQUIRED', error: 'Admin token required' });
    if (typeof sql !== 'string' || !sql.trim() || sql.length > 2000) return reply.code(400).send({ code: 'INVALID_SQL', error: 'Invalid SQL' });
  }
  loadgen.start({
    scenario,
    rps: clamp(rps, 1, MAX_RPS),
    durationSec: clamp(durationSec, 5, MAX_DURATION_SEC),
    sql,
  });
  return { ok: true };
});

app.post('/load/stop', async () => {
  loadgen.stop();
  return { ok: true };
});

app.post('/config', async (req) => {
  const r = await fetch(`${API_URL}/internal/config`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(req.body ?? {}),
  });
  return r.json();
});

app.post('/cache/flush', async () => {
  await redis.flushdb();
  logAction('CACHE_FLUSH');
  return { ok: true };
});

const CHAOS_TARGETS = ['redis', 'postgres'];
app.post('/chaos', async (req, reply) => {
  const { target, action, ms } = req.body ?? {};
  if (action === 'reset') {
    await toxi('/reset', { method: 'POST' });
    logAction('CHAOS_RESET');
    return { ok: true };
  }
  if (!CHAOS_TARGETS.includes(target)) return reply.code(400).send({ code: 'UNKNOWN_TARGET', error: 'Unknown target' });

  if (action === 'down') {
    await toxi(`/proxies/${target}`, { method: 'POST', body: JSON.stringify({ enabled: false }) });
    logAction('CHAOS_DOWN', { target });
  } else if (action === 'latency') {
    const latency = clamp(ms, 50, 5000);
    await toxi(`/proxies/${target}/toxics/latency`, { method: 'DELETE' });
    await toxi(`/proxies/${target}/toxics`, {
      method: 'POST',
      body: JSON.stringify({
        name: 'latency',
        type: 'latency',
        stream: 'downstream',
        toxicity: 1,
        attributes: { latency, jitter: Math.round(latency / 10) },
      }),
    });
    logAction('CHAOS_LATENCY', { target, latency });
  } else if (action === 'up') {
    await toxi(`/proxies/${target}`, { method: 'POST', body: JSON.stringify({ enabled: true }) });
    await toxi(`/proxies/${target}/toxics/latency`, { method: 'DELETE' });
    logAction('CHAOS_UP', { target });
  } else {
    return reply.code(400).send({ code: 'UNKNOWN_ACTION', error: 'Unknown action' });
  }
  return { ok: true };
});

await app.listen({ host: '0.0.0.0', port: Number(env.PORT ?? 4000) });
wss = new WebSocketServer({ server: app.server, path: '/ws' });
wss.on('connection', (ws) => {
  if (latest) ws.send(JSON.stringify({ type: 'snapshot', data: { ...latest, events: [] } }));
});
console.log('control listening');
