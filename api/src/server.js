import Fastify from 'fastify';
import Redis from 'ioredis';
import pg from 'pg';
import CircuitBreaker from 'opossum';
import { monitorEventLoopDelay, performance } from 'node:perf_hooks';

const env = process.env;

// 대시보드에서 실시간으로 바꾸는 실험 설정
const config = {
  cacheEnabled: true,
  cacheTtlSec: 30,
  singleFlight: true,
  breakerEnabled: true,
};

// ---- 연결: Redis/Postgres 모두 toxiproxy를 거친다 (장애 주입용)
const redis = new Redis({
  host: env.REDIS_HOST ?? 'toxiproxy',
  port: Number(env.REDIS_PORT ?? 16379),
  enableOfflineQueue: false, // 끊기면 명령을 쌓아두지 않고 즉시 실패
  maxRetriesPerRequest: 0,
  connectTimeout: 1000,
  commandTimeout: 500,
  retryStrategy: () => 500,
});
redis.on('error', () => {});

const dbBase = {
  host: env.DB_HOST ?? 'toxiproxy',
  port: Number(env.DB_PORT ?? 15432),
  database: env.DB_NAME ?? 'lab',
  connectionTimeoutMillis: 2000, // 풀에서 커넥션을 기다리는 최대 시간
};
const pool = new pg.Pool({
  ...dbBase,
  user: env.DB_USER ?? 'lab',
  password: env.DB_PASSWORD ?? 'lab',
  max: Number(env.DB_POOL_MAX ?? 10),
  statement_timeout: 5000,
});
const roPool = new pg.Pool({
  ...dbBase,
  user: 'readonly',
  password: env.DB_READONLY_PASSWORD ?? 'readonly',
  max: 3,
  statement_timeout: 2000,
});
pool.on('error', () => {});
roPool.on('error', () => {});

// ---- 이벤트 스트림 (대시보드의 캐시 로그/장애 타임라인)
let seq = 0;
const events = [];
function emit(type, detail = {}) {
  events.push({ seq: ++seq, t: Date.now(), type, ...detail });
  if (events.length > 300) events.shift();
}
const lastEmit = {};
function emitThrottled(type, detail) {
  const now = Date.now();
  if (now - (lastEmit[type] ?? 0) < 1000) return;
  lastEmit[type] = now;
  emit(type, detail);
}

// ---- 1초 단위 지표 윈도우 (control이 /internal/stats로 읽어가면서 초기화)
const newWindow = () => ({
  start: Date.now(),
  cpu: process.cpuUsage(),
  req: 0, err: 0,
  hit: 0, miss: 0, coalesced: 0,
  redisErr: 0, dbErr: 0, fallback: 0, rejected: 0,
  lat: [],
});
let win = newWindow();
const loopDelay = monitorEventLoopDelay({ resolution: 20 });
loopDelay.enable();

// ---- 서킷 브레이커
const breakerOpts = { errorThresholdPercentage: 50, resetTimeout: 5000, volumeThreshold: 10, rollingCountTimeout: 5000 };
const redisBreaker = new CircuitBreaker((op, ...args) => redis[op](...args), { ...breakerOpts, timeout: 500 });
const dbBreaker = new CircuitBreaker((text, params) => pool.query(text, params), { ...breakerOpts, timeout: 3000 });
for (const [target, b] of [['redis', redisBreaker], ['db', dbBreaker]]) {
  b.on('open', () => emit('BREAKER', { target, state: 'OPEN' }));
  b.on('halfOpen', () => emit('BREAKER', { target, state: 'HALF_OPEN' }));
  b.on('close', () => emit('BREAKER', { target, state: 'CLOSED' }));
}
const breakerState = (b) => (b.opened ? 'OPEN' : b.halfOpen ? 'HALF_OPEN' : 'CLOSED');

const redisCall = (op, ...args) => (config.breakerEnabled ? redisBreaker.fire(op, ...args) : redis[op](...args));
const dbQuery = (text, params) => (config.breakerEnabled ? dbBreaker.fire(text, params) : pool.query(text, params));

// ---- 캐시 어사이드 + single-flight
const inflight = new Map();

async function loadProduct(id) {
  const { rows } = await dbQuery('SELECT id, name, category, price, description FROM products WHERE id = $1', [id]);
  return rows[0] ?? null;
}

async function getProduct(id) {
  const key = `product:${id}`;
  if (!config.cacheEnabled) return { source: 'db', data: await loadProduct(id) };

  try {
    const cached = await redisCall('get', key);
    if (cached) {
      win.hit++;
      emit('HIT', { key });
      return { source: 'cache', data: JSON.parse(cached) };
    }
    win.miss++;
    emit('MISS', { key });
  } catch (e) {
    // Redis 장애 → DB로 우회
    if (e?.code !== 'EOPENBREAKER') {
      win.redisErr++;
      emitThrottled('REDIS_FAIL', { msg: e?.code ?? e?.message });
    }
    win.fallback++;
    return { source: 'db-fallback', data: await loadProduct(id) };
  }

  if (config.singleFlight) {
    const pending = inflight.get(key);
    if (pending) {
      win.coalesced++;
      emit('COALESCED', { key });
      return { source: 'db-shared', data: await pending };
    }
  }

  const ttl = config.cacheTtlSec;
  const p = loadProduct(id).then((data) => {
    if (data) {
      redisCall('set', key, JSON.stringify(data), 'EX', ttl)
        .then(() => emit('SET', { key, ttl }))
        .catch(() => {});
    }
    return data;
  });
  if (config.singleFlight) {
    inflight.set(key, p);
    p.finally(() => inflight.delete(key)).catch(() => {});
  }
  return { source: 'db', data: await p };
}

// ---- HTTP
const app = Fastify({ logger: false });
app.decorateRequest('t0', 0);

app.addHook('onRequest', async (req) => {
  req.t0 = performance.now();
});
app.addHook('onResponse', async (req, reply) => {
  if (req.url.startsWith('/internal')) return;
  win.req++;
  if (reply.statusCode >= 500) win.err++;
  if (win.lat.length < 50_000) win.lat.push(performance.now() - req.t0);
});

function dbFail(reply, e) {
  if (e?.code === 'EOPENBREAKER') {
    win.rejected++; // 서킷이 열려 DB에 가지도 않고 즉시 거절
    return reply.code(503).send({ error: 'db circuit open', fastFail: true });
  }
  win.dbErr++;
  emitThrottled('DB_FAIL', { msg: e?.code ?? e?.message });
  return reply.code(500).send({ error: e?.message ?? 'db error' });
}

app.get('/products/:id', async (req, reply) => {
  try {
    const result = await getProduct(Number(req.params.id));
    if (!result.data) return reply.code(404).send({ error: 'not found' });
    return result;
  } catch (e) {
    return dbFail(reply, e);
  }
});

app.get('/category/:category', async (req, reply) => {
  try {
    const { rows } = await dbQuery(
      'SELECT id, name, price FROM products WHERE category = $1 ORDER BY price DESC LIMIT 20',
      [req.params.category],
    );
    return { rows };
  } catch (e) {
    return dbFail(reply, e);
  }
});

app.get('/search', async (req, reply) => {
  try {
    const { rows } = await dbQuery('SELECT id, name FROM products WHERE description LIKE $1 LIMIT 20', [
      `%${String(req.query.q ?? '')}%`,
    ]);
    return { rows };
  } catch (e) {
    return dbFail(reply, e);
  }
});

app.get('/slow', async (req, reply) => {
  try {
    await dbQuery('SELECT pg_sleep(0.2)');
    return { ok: true };
  } catch (e) {
    return dbFail(reply, e);
  }
});

// 커스텀 SQL: 읽기 전용 계정 + 2초 타임아웃. (control에서 관리자 토큰 검사 후에만 호출됨)
app.post('/query/custom', async (req, reply) => {
  try {
    const r = await roPool.query(String(req.body?.sql ?? ''));
    return { rowCount: r.rowCount ?? null };
  } catch (e) {
    win.dbErr++;
    emitThrottled('DB_FAIL', { msg: e?.message });
    return reply.code(500).send({ error: e?.message });
  }
});

// ---- 내부용 (Caddy로 노출되지 않음, control만 호출)
app.get('/internal/stats', async (req) => {
  const since = Number(req.query.since ?? 0);
  const now = Date.now();
  const elapsedMs = Math.max(1, now - win.start);
  const perSec = (n) => (n * 1000) / elapsedMs;
  const cpu = process.cpuUsage(win.cpu);
  const lat = win.lat.sort((a, b) => a - b);
  const pct = (p) => (lat.length ? lat[Math.min(lat.length - 1, Math.floor(lat.length * p))] : 0);
  const mem = process.memoryUsage();

  const stats = {
    rps: perSec(win.req),
    errorsPerSec: perSec(win.err),
    cache: { hit: perSec(win.hit), miss: perSec(win.miss), coalesced: perSec(win.coalesced) },
    failures: {
      redisErr: perSec(win.redisErr),
      dbErr: perSec(win.dbErr),
      fallback: perSec(win.fallback),
      rejected: perSec(win.rejected),
    },
    latency: { p50: pct(0.5), p95: pct(0.95), p99: pct(0.99) },
    cpu: ((cpu.user + cpu.system) / 1000 / elapsedMs) * 100,
    memory: { rss: mem.rss, heapUsed: mem.heapUsed },
    // 측정값에는 샘플링 간격(20ms)이 포함되어 있으므로 빼준다
    eventLoopLagMs: Number.isFinite(loopDelay.mean) ? Math.max(0, loopDelay.mean / 1e6 - 20) : 0,
    pool: { max: pool.options.max, total: pool.totalCount, idle: pool.idleCount, waiting: pool.waitingCount },
    breakers: { redis: breakerState(redisBreaker), db: breakerState(dbBreaker) },
    redisConnection: redis.status,
    config,
    seq,
    events: events.filter((e) => e.seq > since).slice(-80),
  };
  win = newWindow();
  loopDelay.reset();
  return stats;
});

app.post('/internal/config', async (req) => {
  const body = req.body ?? {};
  for (const k of ['cacheEnabled', 'singleFlight', 'breakerEnabled']) {
    if (typeof body[k] === 'boolean') config[k] = body[k];
  }
  if (Number.isFinite(body.cacheTtlSec)) config.cacheTtlSec = Math.min(3600, Math.max(1, Math.round(body.cacheTtlSec)));
  emit('CONFIG', { ...config });
  return config;
});

await app.listen({ host: '0.0.0.0', port: Number(env.PORT ?? 3001) });
console.log('api listening');
