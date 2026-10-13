import { kb, mb, ms, num } from '../lib/lab';
import { useI18n } from '../lib/i18n';
import { ServiceIcon } from './ServiceIcon';

const TARGET = { redis: 'Redis', postgres: 'PostgreSQL', db: 'DB' };

function Kpi({ id, label, value, sub, tone = '' }) {
  const { t } = useI18n();
  const tipId = `kpi-tip-${id}`;
  return (
    <div className={`card kpi ${tone}`} tabIndex={0} aria-describedby={tipId}>
      <span className="muted kpi-label">
        {label}
        <span className="info" aria-hidden="true">?</span>
      </span>
      <strong>{value}</strong>
      <small className="muted">{sub}</small>
      <div className="tip" role="tooltip" id={tipId}>
        <p>{t(`tip.${id}.desc`)}</p>
        <h4>{t('tip.calc')}</h4>
        <p>{t(`tip.${id}.calc`)}</p>
        <h4>{t('tip.watch')}</h4>
        <p>{t(`tip.${id}.watch`)}</p>
      </div>
    </div>
  );
}

export function Kpis({ latest }) {
  const { t } = useI18n();
  const l = latest?.load;
  const a = latest?.api?.up ? latest.api : null;
  const hit = a?.cache.hit ?? 0;
  const miss = a?.cache.miss ?? 0;
  const hitRate = hit + miss ? (hit / (hit + miss)) * 100 : null;
  const done = (l?.okPerSec ?? 0) + (l?.errPerSec ?? 0);
  const errRate = done ? (l.errPerSec / done) * 100 : null;
  const active = a ? a.pool.total - a.pool.idle : 0;

  return (
    <div className="kpis">
      <Kpi id="throughput" label={t('kpi.throughput')} value={`${num(a?.rps)} /s`} sub={t('kpi.target', { n: num(l?.targetRps) })} />
      <Kpi id="p95" label={t('kpi.p95')} value={ms(l?.latency.p95)} sub={`p99 ${ms(l?.latency.p99)}`} tone={l?.latency.p95 > 500 ? 'warn' : ''} />
      <Kpi id="error" label={t('kpi.errorRate')} value={errRate == null ? '-' : `${num(errRate, 1)}%`} sub={`${num(l?.errPerSec)} /s`} tone={errRate > 1 ? 'bad' : ''} />
      <Kpi
        id="hit"
        label={t('kpi.hitRate')}
        value={hitRate == null ? '-' : `${num(hitRate, 1)}%`}
        sub={a?.config.cacheEnabled ? t('kpi.cacheOn') : t('kpi.cacheOff')}
      />
      <Kpi
        id="pool"
        label={t('kpi.pool')}
        value={a ? `${active} / ${a.pool.max}` : '-'}
        sub={t('kpi.waiting', { n: num(a?.pool.waiting) })}
        tone={a?.pool.waiting > 0 ? 'warn' : ''}
      />
    </div>
  );
}

function Meter({ label, value, pct, tone }) {
  const p = Math.max(0, Math.min(100, pct ?? 0));
  return (
    <div className="meter">
      <div className="meter-head">
        <span className="muted">{label}</span>
        <b>{value}</b>
      </div>
      <div className={`bar ${tone ?? (p > 85 ? 'bad' : p > 60 ? 'warn' : '')}`}>
        <span style={{ width: `${p}%` }} />
      </div>
    </div>
  );
}

const STATE_TONE = { running: 'good', restarting: 'warn', paused: 'warn' };

export function ContainersPanel({ latest }) {
  const { t } = useI18n();
  const ct = latest?.containers;

  return (
    <div className="card">
      <div className="chart-head">
        <h2>{t('ct.title')}</h2>
        {ct && !ct.up && <span className="badge bad">{t('ct.unavailable')}</span>}
      </div>
      <div className="table-wrap">
        <table className="containers">
          <thead>
            <tr>
              <th>{t('ct.service')}</th>
              <th>{t('ct.state')}</th>
              <th>{t('ct.cpu')}</th>
              <th>{t('ct.memory')}</th>
              <th>{t('ct.network')}</th>
              <th className="num">{t('ct.pids')}</th>
            </tr>
          </thead>
          <tbody>
            {ct?.list.map((c) => {
              const cpuCap = (c.cpuLimit ?? c.hostCores ?? 1) * 100;
              const memPct = c.memMax ? (c.memUsed / c.memMax) * 100 : 0;
              const cores = c.cpuLimit && t(c.cpuLimit === 1 ? 'ct.core' : 'ct.cores', { n: num(c.cpuLimit, 1) });
              return (
                <tr key={c.service}>
                  <td>
                    <div className="svc">
                      <ServiceIcon service={c.service} />
                      <div>
                        <b>{c.service}</b>
                        <small className="muted">{t(`role.${c.service}`)}</small>
                      </div>
                    </div>
                  </td>
                  <td>
                    <span className={`badge ${STATE_TONE[c.state] ?? 'bad'}`}>{c.state}</span>
                  </td>
                  <td>
                    <Meter
                      value={c.cpu == null ? '-' : `${num(c.cpu, 1)}%`}
                      label={cores ? t('ct.limit', { v: cores }) : t('ct.unlimited')}
                      pct={c.cpu == null ? 0 : (c.cpu / cpuCap) * 100}
                    />
                  </td>
                  <td>
                    <Meter
                      value={c.memUsed == null ? '-' : mb(c.memUsed)}
                      label={c.memLimit ? t('ct.limit', { v: mb(c.memLimit) }) : t('ct.unlimited')}
                      pct={memPct}
                    />
                  </td>
                  <td className="net">
                    {c.rxPerSec == null ? (
                      '-'
                    ) : (
                      <>
                        <span className="muted">↓</span> {kb(c.rxPerSec)}/s
                        <br />
                        <span className="muted">↑</span> {kb(c.txPerSec)}/s
                      </>
                    )}
                  </td>
                  <td className="num">{c.pids ?? '-'}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <p className="hint">{t('ct.note')}</p>
    </div>
  );
}

export function RedisPanel({ latest }) {
  const { t } = useI18n();
  const r = latest?.redis;
  const ttlMax = latest?.api?.config?.cacheTtlSec ?? 30;
  const lifetimeHit = r?.up && r.hits + r.misses ? (r.hits / (r.hits + r.misses)) * 100 : null;

  return (
    <div className="card">
      <div className="chart-head">
        <h2>Redis</h2>
        <span className={`badge ${r?.up ? 'good' : 'bad'}`}>{r?.up ? t('common.running') : t('common.noResponse')}</span>
      </div>
      <dl className="stats">
        <div><dt>{t('redis.memory')}</dt><dd>{mb(r?.usedMemory)}</dd></div>
        <div><dt>ops/s</dt><dd>{num(r?.opsPerSec)}</dd></div>
        <div><dt>{t('redis.keys')}</dt><dd>{num(r?.keys)}</dd></div>
        <div><dt>{t('redis.clients')}</dt><dd>{num(r?.clients)}</dd></div>
        <div><dt>{t('redis.lifetimeHit')}</dt><dd>{lifetimeHit == null ? '-' : `${num(lifetimeHit, 1)}%`}</dd></div>
        <div><dt>eviction</dt><dd>{num(r?.evicted)}</dd></div>
      </dl>
      <h3>{t('redis.keysTitle')}</h3>
      <ul className="keys">
        {r?.sampleKeys?.length ? (
          r.sampleKeys.map((k) => (
            <li key={k.key}>
              <code>{k.key}</code>
              <span className="bar">
                <span style={{ width: `${Math.max(0, Math.min(100, (k.ttl / ttlMax) * 100))}%` }} />
              </span>
              <span className="muted">{k.ttl}s</span>
            </li>
          ))
        ) : (
          <li className="muted">{t('redis.empty')}</li>
        )}
      </ul>
    </div>
  );
}

export function DbPanel({ latest }) {
  const { t } = useI18n();
  const a = latest?.api?.up ? latest.api : null;
  const d = latest?.db;
  const max = a?.pool.max ?? 10;
  const active = a ? a.pool.total - a.pool.idle : 0;
  const total = a?.pool.total ?? 0;
  const waiting = a?.pool.waiting ?? 0;

  return (
    <div className="card">
      <div className="chart-head">
        <h2>PostgreSQL</h2>
        <span className={`badge ${d?.up ? 'good' : 'bad'}`}>{d?.up ? t('common.running') : t('common.noResponse')}</span>
      </div>
      <h3>{t('db.poolTitle', { n: max })}</h3>
      <div className="slots">
        {Array.from({ length: max }, (_, i) => (
          <span key={i} className={i < active ? 'slot active' : i < total ? 'slot idle' : 'slot'} />
        ))}
      </div>
      <p className="legend-row">
        <span><i className="slot active" /> {t('db.inUse', { n: active })}</span>
        <span><i className="slot idle" /> {t('db.idle', { n: total - active })}</span>
        <span className={waiting ? 'warn-text' : 'muted'}>{t('db.waiting', { n: num(waiting) })}</span>
      </p>
      <div className="queue">
        {Array.from({ length: Math.min(waiting, 60) }, (_, i) => (
          <span key={i} />
        ))}
        {waiting > 60 && <small>+{waiting - 60}</small>}
      </div>
      <h3>{t('db.sessionsTitle', { n: num(d?.maxConnections) })}</h3>
      <table className="sessions">
        <tbody>
          {d?.sessions?.map((s) => (
            <tr key={`${s.user}-${s.state}`}>
              <td>{s.user ?? '(system)'}</td>
              <td>{s.state}</td>
              <td className="num">{s.n}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

const CACHE_LABEL = { HIT: 'HIT', MISS: 'MISS', SET: 'SET', COALESCED: 'JOIN' };

export function CacheStream({ events }) {
  const { t, time } = useI18n();
  return (
    <div className="card">
      <h2>{t('stream.title')}</h2>
      <p className="hint">{t('stream.hint')}</p>
      <ul className="stream">
        {events.map((e, i) => (
          <li key={`${e.seq}-${i}`} className={`ev ${e.type}`}>
            <span className="tag">{CACHE_LABEL[e.type]}</span>
            <code>{e.key}</code>
            {e.ttl && <span className="muted">TTL {e.ttl}s</span>}
            <span className="muted time">{time(e.t)}</span>
          </li>
        ))}
        {!events.length && <li className="muted">{t('stream.empty')}</li>}
      </ul>
    </div>
  );
}

function describe(e, t) {
  const onOff = (v) => (v ? 'ON' : 'OFF');
  switch (e.type) {
    case 'BREAKER':
      return t('ev.breaker', { target: TARGET[e.target], state: e.state });
    case 'REDIS_FAIL':
      return t('ev.redisFail', { msg: e.msg });
    case 'DB_FAIL':
      return t('ev.dbFail', { msg: e.msg });
    case 'CONFIG':
      return t('ev.config', {
        cache: onOff(e.cacheEnabled),
        sf: onOff(e.singleFlight),
        cb: onOff(e.breakerEnabled),
        ttl: e.cacheTtlSec,
      });
    case 'ACTION':
      return t(`ev.${e.code}`, {
        ...e,
        target: TARGET[e.target],
        scenario: e.scenario && t(`scenario.${e.scenario}`),
        reason: e.reason && t(`reason.${e.reason}`),
      });
    default:
      return e.msg ?? e.type;
  }
}

const BREAKER_TONE = { CLOSED: 'good', HALF_OPEN: 'warn', OPEN: 'bad' };

export function ResiliencePanel({ latest, timeline }) {
  const { t, time } = useI18n();
  const a = latest?.api?.up ? latest.api : null;
  const f = a?.failures;
  return (
    <div className="card">
      <h2>{t('res.title')}</h2>
      <div className="breakers">
        {['redis', 'db'].map((k) => (
          <div key={k} className="breaker">
            <span>{t('res.circuit', { name: TARGET[k] })}</span>
            <span className={`badge ${BREAKER_TONE[a?.breakers[k]] ?? ''}`}>{a?.breakers[k] ?? '-'}</span>
          </div>
        ))}
        <div className="breaker">
          <span>{t('res.apiServer')}</span>
          <span className={`badge ${a ? 'good' : 'bad'}`}>{a ? 'UP' : 'DOWN'}</span>
        </div>
      </div>
      <dl className="stats">
        <div><dt>{t('res.fallback')}</dt><dd>{num(f?.fallback, 1)}</dd></div>
        <div><dt>{t('res.rejected')}</dt><dd>{num(f?.rejected, 1)}</dd></div>
        <div><dt>{t('res.redisErr')}</dt><dd>{num(f?.redisErr, 1)}</dd></div>
        <div><dt>{t('res.dbErr')}</dt><dd>{num(f?.dbErr, 1)}</dd></div>
      </dl>
      <h3>{t('res.timeline')}</h3>
      <ul className="timeline">
        {timeline.map((e, i) => (
          <li key={`${e.t}-${i}`} className={`ev ${e.type}`}>
            <span className="muted time">{time(e.t)}</span>
            <span>{describe(e, t)}</span>
          </li>
        ))}
        {!timeline.length && <li className="muted">{t('res.empty')}</li>}
      </ul>
    </div>
  );
}
