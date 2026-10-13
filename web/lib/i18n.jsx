'use client';
import { createContext, useCallback, useContext, useEffect, useState } from 'react';

const dict = {
  ko: {
    'app.subtitle': 'Node.js · Redis · PostgreSQL 서버에 직접 트래픽을 걸고, 병목과 장애 대응을 실시간으로 관찰합니다.',
    'status.connected': '실시간 연결됨',
    'status.connecting': '연결 중…',
    'status.viewers': '접속자 {n}명',
    'status.running': '부하 진행 중 {s}s',

    'load.title': '트래픽 발생',
    'load.scenario': '시나리오',
    'load.targetRps': '목표 RPS',
    'load.duration': '지속 시간',
    'load.seconds': '{n}초',
    'load.adminToken': '관리자 토큰',
    'load.sqlHint': '읽기 전용 계정 · 2초 타임아웃으로 실행됩니다.',
    'load.start': '부하 시작',
    'load.apply': '설정 적용',
    'load.stop': '중지',
    'load.progress': '진행 중 · {s}초 남음 · 처리 대기 {n}건',

    'scenario.product': '상품 조회 (Redis 캐시)',
    'scenario.category': '카테고리 조회 (인덱스 O)',
    'scenario.search': '설명 검색 (인덱스 X, 풀스캔)',
    'scenario.slow': '느린 쿼리 (pg_sleep 200ms)',
    'scenario.mixed': '혼합 (조회70 / 카테고리20 / 검색10)',
    'scenario.custom': '커스텀 SQL (관리자)',

    'config.title': '서버 전략',
    'config.cache': 'Redis 캐시',
    'config.cacheDesc': '끄면 모든 조회가 DB로 직행',
    'config.singleFlight': 'Single-flight',
    'config.singleFlightDesc': '같은 키 동시 MISS를 쿼리 1번으로 합침',
    'config.breaker': 'Circuit Breaker',
    'config.breakerDesc': '장애 시 빠르게 실패하고 우회',
    'config.ttl': '캐시 TTL',
    'config.flush': '캐시 비우기',

    'chaos.title': '장애 주입',
    'chaos.mode.down': '연결 끊기',
    'chaos.mode.latency': '지연',
    'chaos.mode.up': '복구',
    'chaos.delayLabel': '지연 시간 (ms)',
    'chaos.apply': '적용',
    'chaos.invalidDelay': '지연 시간은 {min}~{max}ms 사이의 정수로 입력하세요.',
    'chaos.resetAll': '전체 복구',
    'proxy.unknown': '알 수 없음',
    'proxy.down': '연결 끊김',
    'proxy.latency': '지연 {ms}ms',
    'proxy.ok': '정상',

    'chart.throughput': '처리량 (req/s)',
    'chart.latency': '응답시간 (클라이언트 측)',
    'chart.cache': '캐시 (건/s)',
    'chart.pool': 'DB 커넥션 풀',
    'series.sent': '보낸 요청',
    'series.served': '서버 처리',
    'series.errors': '에러',
    'series.active': '사용 중',
    'series.idle': '유휴',
    'series.waiting': '대기',

    'kpi.throughput': '처리량',
    'kpi.target': '목표 {n} RPS',
    'kpi.p95': '응답시간 p95',
    'kpi.errorRate': '에러율',
    'kpi.hitRate': '캐시 히트율',
    'kpi.cacheOn': '캐시 켜짐',
    'kpi.cacheOff': '캐시 꺼짐',
    'kpi.pool': 'DB 커넥션 풀',
    'kpi.waiting': '대기 {n}건',

    'ct.title': 'Docker 컨테이너 자원',
    'ct.service': '컨테이너',
    'ct.cpu': 'CPU (100% = 1코어)',
    'ct.memory': '메모리',
    'ct.network': '네트워크 ↓ / ↑',
    'ct.pids': 'PID',
    'ct.state': '상태',
    'ct.core': '{n}코어',
    'ct.cores': '{n}코어',
    'ct.limit': '제한 {v}',
    'ct.unlimited': '제한 없음',
    'ct.unavailable': 'Docker 정보를 읽을 수 없습니다',
    'ct.note': 'docker stats와 같은 값입니다. 조회만 허용된 Docker 소켓 프록시를 통해 1초마다 수집합니다.',
    'role.api': '실험 대상 서버',
    'role.postgres': 'DB',
    'role.redis': '캐시',
    'role.toxiproxy': '장애 주입 프록시',
    'role.control': '부하 생성 · 수집',
    'role.web': '대시보드',
    'role.caddy': '리버스 프록시',
    'role.docker-proxy': '소켓 프록시',
    'chart.containerCpu': '컨테이너 CPU (%)',
    'chart.containerMem': '컨테이너 메모리 (MB)',

    'tip.calc': '측정 방식',
    'tip.watch': '이렇게 보세요',
    'tip.throughput.desc': 'API 서버가 1초 동안 실제로 처리해 응답한 요청 수입니다.',
    'tip.throughput.calc': 'API 서버 안에서 1초 단위로 집계합니다. 성공과 실패 응답을 모두 포함합니다.',
    'tip.throughput.watch': '목표 RPS를 올려도 이 값이 더 이상 따라 오르지 않는 지점이 서버의 처리 한계입니다.',
    'tip.p95.desc': '요청 100개를 빠른 순으로 줄 세웠을 때 95번째 응답시간입니다. 95%의 요청이 이 시간 안에 끝났다는 뜻입니다.',
    'tip.p95.calc': '트래픽 발생기(클라이언트)가 요청을 보낸 순간부터 응답을 받을 때까지 잽니다. 커넥션 풀 대기와 큐잉 시간까지 포함됩니다.',
    'tip.p95.watch': '평균은 일부 느린 요청을 가려 버립니다. 실무에서는 p95·p99로 목표(SLO)를 잡습니다. 아래의 p99는 100개 중 가장 느린 1개 수준입니다.',
    'tip.error.desc': '완료된 요청 중 실패한 요청의 비율입니다.',
    'tip.error.calc': 'HTTP 4xx·5xx 응답, 5초 타임아웃, 연결 실패를 모두 에러로 셉니다.',
    'tip.error.watch': '서킷 브레이커가 OPEN이면 요청을 503으로 즉시 거절합니다. 에러율은 오르지만 응답은 빠르게 유지되는, 의도된 "빠른 실패"입니다.',
    'tip.hit.desc': '상품 조회 요청 중 DB까지 가지 않고 Redis 캐시에서 바로 응답한 비율입니다.',
    'tip.hit.calc': '최근 1초의 HIT ÷ (HIT + MISS)입니다. 캐시는 상품 조회 시나리오에서만 사용합니다.',
    'tip.hit.watch': '히트율이 떨어진 만큼 요청이 DB로 몰립니다. TTL이 만료되거나 캐시를 비우면 순간적으로 급락합니다.',
    'tip.pool.desc': 'API 서버가 DB와 미리 맺어 두고 돌려 쓰는 커넥션 묶음입니다. "사용 중 / 최대 개수"로 표시합니다.',
    'tip.pool.calc': 'node-postgres Pool의 전체·유휴·대기 수를 1초마다 읽습니다.',
    'tip.pool.watch': '모든 커넥션이 사용 중이면 새 요청은 빈자리가 날 때까지 대기합니다. 대기가 쌓이면 응답시간이 급증하고, 2초를 넘기면 타임아웃 에러가 납니다.',

    'common.running': '실행 중',
    'common.noResponse': '응답 없음',

    'redis.memory': '메모리',
    'redis.keys': '키 개수',
    'redis.clients': '클라이언트',
    'redis.lifetimeHit': '누적 히트율',
    'redis.keysTitle': '캐시된 키와 남은 TTL',
    'redis.empty': '캐시가 비어 있습니다',

    'db.poolTitle': 'API 서버의 커넥션 풀 (max {n})',
    'db.inUse': '사용 중 {n}',
    'db.idle': '유휴 {n}',
    'db.waiting': '풀 대기 {n}건',
    'db.sessionsTitle': 'DB 서버 세션 (pg_stat_activity, max_connections {n})',

    'stream.title': '캐시 실시간 로그',
    'stream.hint': 'HIT 캐시 적중 · MISS 캐시 없음 → DB 조회 · SET 캐시 저장 · JOIN 진행 중인 DB 조회에 합류',
    'stream.empty': '트래픽을 발생시키면 여기에 흐름이 보입니다',

    'res.title': '장애 대응',
    'res.circuit': '{name} 서킷',
    'res.apiServer': 'API 서버',
    'res.fallback': 'DB 우회 /s',
    'res.rejected': '즉시 거절 /s',
    'res.redisErr': 'Redis 오류 /s',
    'res.dbErr': 'DB 오류 /s',
    'res.timeline': '타임라인',
    'res.empty': '아직 이벤트가 없습니다',

    'ev.breaker': '{target} 서킷 → {state}',
    'ev.redisFail': 'Redis 오류 ({msg}) → DB로 우회',
    'ev.dbFail': 'DB 오류: {msg}',
    'ev.config': '설정 변경: 캐시 {cache} · single-flight {sf} · 서킷 {cb} · TTL {ttl}s',
    'ev.LOAD_START': '부하 시작: {scenario}, {rps} RPS, {durationSec}초',
    'ev.LOAD_UPDATE': '부하 변경: {scenario}, {rps} RPS, {durationSec}초',
    'ev.LOAD_STOP': '부하 중지 ({reason})',
    'ev.CACHE_FLUSH': '캐시 전체 삭제 (FLUSHDB)',
    'ev.CHAOS_RESET': '모든 장애 복구',
    'ev.CHAOS_DOWN': '장애 주입: {target} 연결 끊김',
    'ev.CHAOS_LATENCY': '장애 주입: {target} 응답 지연 {latency}ms',
    'ev.CHAOS_UP': '{target} 복구',
    'reason.user': '사용자 중지',
    'reason.timeout': '시간 종료',

    'err.RATE_LIMITED': '요청이 너무 잦습니다. 잠시 후 다시 시도하세요.',
    'err.UNKNOWN_SCENARIO': '알 수 없는 시나리오입니다.',
    'err.ADMIN_REQUIRED': '커스텀 SQL은 관리자 토큰이 필요합니다.',
    'err.INVALID_SQL': 'SQL을 확인하세요 (최대 2000자).',
    'err.UNKNOWN_TARGET': '알 수 없는 대상입니다.',
    'err.UNKNOWN_ACTION': '알 수 없는 동작입니다.',
  },

  en: {
    'app.subtitle': 'Drive real traffic into a Node.js · Redis · PostgreSQL server and watch bottlenecks and failure handling live.',
    'status.connected': 'Live',
    'status.connecting': 'Connecting…',
    'status.viewers': '{n} viewers',
    'status.running': 'Load running {s}s',

    'load.title': 'Traffic generator',
    'load.scenario': 'Scenario',
    'load.targetRps': 'Target RPS',
    'load.duration': 'Duration',
    'load.seconds': '{n}s',
    'load.adminToken': 'Admin token',
    'load.sqlHint': 'Runs as a read-only user with a 2s timeout.',
    'load.start': 'Start load',
    'load.apply': 'Apply',
    'load.stop': 'Stop',
    'load.progress': 'Running · {s}s left · {n} in flight',

    'scenario.product': 'Product lookup (Redis cache)',
    'scenario.category': 'Category lookup (indexed)',
    'scenario.search': 'Description search (no index, full scan)',
    'scenario.slow': 'Slow query (pg_sleep 200ms)',
    'scenario.mixed': 'Mixed (lookup 70 / category 20 / search 10)',
    'scenario.custom': 'Custom SQL (admin)',

    'config.title': 'Server strategy',
    'config.cache': 'Redis cache',
    'config.cacheDesc': 'When off, every lookup hits the DB',
    'config.singleFlight': 'Single-flight',
    'config.singleFlightDesc': 'Concurrent misses on one key share a single query',
    'config.breaker': 'Circuit breaker',
    'config.breakerDesc': 'Fail fast and fall back during outages',
    'config.ttl': 'Cache TTL',
    'config.flush': 'Flush cache',

    'chaos.title': 'Fault injection',
    'chaos.mode.down': 'Disconnect',
    'chaos.mode.latency': 'Delay',
    'chaos.mode.up': 'Restore',
    'chaos.delayLabel': 'Delay (ms)',
    'chaos.apply': 'Apply',
    'chaos.invalidDelay': 'Enter a whole number between {min} and {max} ms.',
    'chaos.resetAll': 'Restore all',
    'proxy.unknown': 'Unknown',
    'proxy.down': 'Disconnected',
    'proxy.latency': '{ms}ms delay',
    'proxy.ok': 'Healthy',

    'chart.throughput': 'Throughput (req/s)',
    'chart.latency': 'Latency (client side)',
    'chart.cache': 'Cache (ops/s)',
    'chart.pool': 'DB connection pool',
    'series.sent': 'Sent',
    'series.served': 'Served',
    'series.errors': 'Errors',
    'series.active': 'Active',
    'series.idle': 'Idle',
    'series.waiting': 'Waiting',

    'kpi.throughput': 'Throughput',
    'kpi.target': 'Target {n} RPS',
    'kpi.p95': 'Latency p95',
    'kpi.errorRate': 'Error rate',
    'kpi.hitRate': 'Cache hit rate',
    'kpi.cacheOn': 'Cache on',
    'kpi.cacheOff': 'Cache off',
    'kpi.pool': 'DB connection pool',
    'kpi.waiting': '{n} waiting',

    'ct.title': 'Docker container resources',
    'ct.service': 'Container',
    'ct.cpu': 'CPU (100% = 1 core)',
    'ct.memory': 'Memory',
    'ct.network': 'Network ↓ / ↑',
    'ct.pids': 'PIDs',
    'ct.state': 'Status',
    'ct.core': '{n} core',
    'ct.cores': '{n} cores',
    'ct.limit': 'limit {v}',
    'ct.unlimited': 'no limit',
    'ct.unavailable': 'Cannot read Docker stats',
    'ct.note': 'Same numbers as docker stats, collected every second through a read-only Docker socket proxy.',
    'role.api': 'Target server',
    'role.postgres': 'Database',
    'role.redis': 'Cache',
    'role.toxiproxy': 'Fault proxy',
    'role.control': 'Load gen · metrics',
    'role.web': 'Dashboard',
    'role.caddy': 'Reverse proxy',
    'role.docker-proxy': 'Socket proxy',
    'chart.containerCpu': 'Container CPU (%)',
    'chart.containerMem': 'Container memory (MB)',

    'tip.calc': "How it's measured",
    'tip.watch': 'What to watch',
    'tip.throughput.desc': 'Requests the API server actually handled and answered in one second.',
    'tip.throughput.calc': 'Counted inside the API server per second, including both successful and failed responses.',
    'tip.throughput.watch': 'When raising the target RPS no longer raises this number, you have hit the server’s capacity.',
    'tip.p95.desc': 'Line up 100 requests from fastest to slowest: this is the 95th. 95% of requests finished within this time.',
    'tip.p95.calc': 'Measured by the load generator (client) from send to response, so it includes waiting for a pool connection and queueing.',
    'tip.p95.watch': 'Averages hide the slow tail. Real SLOs are set on p95/p99. The p99 below is roughly the slowest 1 in 100.',
    'tip.error.desc': 'Share of completed requests that failed.',
    'tip.error.calc': 'HTTP 4xx/5xx responses, 5-second timeouts and connection failures all count as errors.',
    'tip.error.watch': 'With the circuit OPEN, requests are rejected instantly with 503. The error rate rises but responses stay fast: an intentional "fail fast".',
    'tip.hit.desc': 'Share of product lookups answered straight from the Redis cache without touching the DB.',
    'tip.hit.calc': 'HIT ÷ (HIT + MISS) over the last second. Only the product lookup scenario uses the cache.',
    'tip.hit.watch': 'Every drop in hit rate sends that much more traffic to the DB. It plunges briefly when TTLs expire or the cache is flushed.',
    'tip.pool.desc': 'The set of DB connections the API server keeps open and reuses. Shown as "in use / max".',
    'tip.pool.calc': 'Reads the node-postgres Pool’s total, idle and waiting counts every second.',
    'tip.pool.watch': 'When every connection is busy, new requests wait for one to free up. As the queue grows latency spikes, and after 2 seconds requests time out.',

    'common.running': 'Running',
    'common.noResponse': 'No response',

    'redis.memory': 'Memory',
    'redis.keys': 'Keys',
    'redis.clients': 'Clients',
    'redis.lifetimeHit': 'Lifetime hit rate',
    'redis.keysTitle': 'Cached keys and remaining TTL',
    'redis.empty': 'Cache is empty',

    'db.poolTitle': 'API server connection pool (max {n})',
    'db.inUse': 'Active {n}',
    'db.idle': 'Idle {n}',
    'db.waiting': '{n} waiting for a connection',
    'db.sessionsTitle': 'DB server sessions (pg_stat_activity, max_connections {n})',

    'stream.title': 'Live cache log',
    'stream.hint': 'HIT served from cache · MISS not cached → DB query · SET stored in cache · JOIN joined an in-flight DB query',
    'stream.empty': 'Start some traffic to see the flow here',

    'res.title': 'Resilience',
    'res.circuit': '{name} circuit',
    'res.apiServer': 'API server',
    'res.fallback': 'DB fallback /s',
    'res.rejected': 'Fast-fail /s',
    'res.redisErr': 'Redis errors /s',
    'res.dbErr': 'DB errors /s',
    'res.timeline': 'Timeline',
    'res.empty': 'No events yet',

    'ev.breaker': '{target} circuit → {state}',
    'ev.redisFail': 'Redis error ({msg}) → falling back to DB',
    'ev.dbFail': 'DB error: {msg}',
    'ev.config': 'Config: cache {cache} · single-flight {sf} · circuit {cb} · TTL {ttl}s',
    'ev.LOAD_START': 'Load started: {scenario}, {rps} RPS, {durationSec}s',
    'ev.LOAD_UPDATE': 'Load changed: {scenario}, {rps} RPS, {durationSec}s',
    'ev.LOAD_STOP': 'Load stopped ({reason})',
    'ev.CACHE_FLUSH': 'Cache flushed (FLUSHDB)',
    'ev.CHAOS_RESET': 'All faults cleared',
    'ev.CHAOS_DOWN': 'Fault injected: {target} disconnected',
    'ev.CHAOS_LATENCY': 'Fault injected: {target} delayed {latency}ms',
    'ev.CHAOS_UP': '{target} restored',
    'reason.user': 'stopped by user',
    'reason.timeout': "time's up",

    'err.RATE_LIMITED': 'Too many requests. Please try again shortly.',
    'err.UNKNOWN_SCENARIO': 'Unknown scenario.',
    'err.ADMIN_REQUIRED': 'Custom SQL requires the admin token.',
    'err.INVALID_SQL': 'Check your SQL (max 2000 characters).',
    'err.UNKNOWN_TARGET': 'Unknown target.',
    'err.UNKNOWN_ACTION': 'Unknown action.',
  },
};

export const LANGS = ['ko', 'en'];

const LangContext = createContext(null);

export function LangProvider({ children }) {
  const [lang, setLang] = useState('ko');

  useEffect(() => {
    let saved = null;
    try {
      saved = localStorage.getItem('lang');
    } catch {}
    if (LANGS.includes(saved)) setLang(saved);
    else if (!navigator.language?.startsWith('ko')) setLang('en');
  }, []);

  const change = useCallback((next) => {
    setLang(next);
    try {
      localStorage.setItem('lang', next);
    } catch {}
  }, []);

  useEffect(() => {
    document.documentElement.lang = lang;
  }, [lang]);

  const t = useCallback(
    (key, params) => {
      const s = dict[lang][key] ?? dict.ko[key] ?? key;
      return params ? s.replace(/\{(\w+)\}/g, (_, k) => params[k] ?? '') : s;
    },
    [lang],
  );

  const time = useCallback((ts) => new Date(ts).toLocaleTimeString(lang === 'ko' ? 'ko-KR' : 'en-US', { hour12: false }), [lang]);

  return <LangContext.Provider value={{ lang, setLang: change, t, time }}>{children}</LangContext.Provider>;
}

export const useI18n = () => useContext(LangContext);
