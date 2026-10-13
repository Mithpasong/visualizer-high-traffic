'use client';
import { useState } from 'react';
import { post } from '../lib/lab';
import { useI18n } from '../lib/i18n';

function useAction() {
  const { t } = useI18n();
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);
  const run = async (path, body) => {
    setBusy(true);
    setError(null);
    try {
      await post(path, body);
      return true;
    } catch (e) {
      setError(e.code ? t(`err.${e.code}`) : e.message);
      return false;
    } finally {
      setBusy(false);
    }
  };
  return { run, error, busy };
}

export function LoadPanel({ latest }) {
  const { t } = useI18n();
  const limits = latest?.limits;
  const load = latest?.load;
  const running = load?.running;
  const [scenario, setScenario] = useState('product');
  const [rps, setRps] = useState(100);
  const [duration, setDuration] = useState(30);
  const [sql, setSql] = useState('SELECT count(*) FROM products WHERE price > 50000');
  const [token, setToken] = useState('');
  const { run, error, busy } = useAction();

  const start = (override = {}) => run('/load/start', { scenario, rps, durationSec: duration, sql, token, ...override });

  return (
    <div className="card">
      <h2>{t('load.title')}</h2>
      <label className="field">
        {t('load.scenario')}
        <select value={scenario} onChange={(e) => setScenario(e.target.value)}>
          {limits?.scenarios.map((id) => (
            <option key={id} value={id} disabled={id === 'custom' && !limits.customSql}>
              {t(`scenario.${id}`)}
            </option>
          ))}
        </select>
      </label>
      <label className="field">
        <span>
          {t('load.targetRps')} <b>{rps.toLocaleString()}</b>
        </span>
        <input
          type="range"
          min={10}
          max={limits?.maxRps ?? 1000}
          step={10}
          value={rps}
          onChange={(e) => setRps(Number(e.target.value))}
          onPointerUp={(e) => running && start({ rps: Number(e.currentTarget.value) })}
        />
      </label>
      <label className="field">
        <span>
          {t('load.duration')} <b>{t('load.seconds', { n: duration })}</b>
        </span>
        <input
          type="range"
          min={5}
          max={limits?.maxDurationSec ?? 120}
          step={5}
          value={duration}
          onChange={(e) => setDuration(Number(e.target.value))}
        />
      </label>
      {scenario === 'custom' && (
        <>
          <textarea rows={3} value={sql} onChange={(e) => setSql(e.target.value)} spellCheck={false} />
          <input type="password" placeholder={t('load.adminToken')} value={token} onChange={(e) => setToken(e.target.value)} />
          <p className="hint">{t('load.sqlHint')}</p>
        </>
      )}
      <div className="row">
        <button className="primary" disabled={busy || !latest} onClick={() => start()}>
          {running ? t('load.apply') : t('load.start')}
        </button>
        <button disabled={!running || busy} onClick={() => run('/load/stop')}>
          {t('load.stop')}
        </button>
      </div>
      {running && <p className="hint">{t('load.progress', { s: load.remainingSec, n: load.inflight })}</p>}
      {error && <p className="error">{error}</p>}
    </div>
  );
}

function Toggle({ label, desc, on, onClick, disabled }) {
  return (
    <button className={`toggle ${on ? 'on' : ''}`} role="switch" aria-checked={!!on} onClick={onClick} disabled={disabled}>
      <span className="knob" />
      <span>
        <b>{label}</b>
        <small>{desc}</small>
      </span>
    </button>
  );
}

export function ConfigPanel({ latest }) {
  const { t } = useI18n();
  const cfg = latest?.api?.config;
  const { run, error } = useAction();
  const toggle = (k) => run('/config', { [k]: !cfg[k] });

  return (
    <div className="card">
      <h2>{t('config.title')}</h2>
      <Toggle label={t('config.cache')} desc={t('config.cacheDesc')} on={cfg?.cacheEnabled} disabled={!cfg} onClick={() => toggle('cacheEnabled')} />
      <Toggle label={t('config.singleFlight')} desc={t('config.singleFlightDesc')} on={cfg?.singleFlight} disabled={!cfg} onClick={() => toggle('singleFlight')} />
      <Toggle label={t('config.breaker')} desc={t('config.breakerDesc')} on={cfg?.breakerEnabled} disabled={!cfg} onClick={() => toggle('breakerEnabled')} />
      <div className="row">
        <label className="field inline">
          {t('config.ttl')}
          <select value={cfg?.cacheTtlSec ?? 30} disabled={!cfg} onChange={(e) => run('/config', { cacheTtlSec: Number(e.target.value) })}>
            {[5, 10, 30, 60, 300].map((s) => (
              <option key={s} value={s}>
                {t('load.seconds', { n: s })}
              </option>
            ))}
          </select>
        </label>
        <button onClick={() => run('/cache/flush')}>{t('config.flush')}</button>
      </div>
      {error && <p className="error">{error}</p>}
    </div>
  );
}

const CHAOS_MODES = ['down', 'latency', 'up'];
const MIN_DELAY = 50;
const MAX_DELAY = 5000;

function proxyMode(p) {
  if (!p) return null;
  if (!p.enabled) return 'down';
  return p.latencyMs ? 'latency' : 'up';
}

function proxyState(p, t) {
  if (!p) return [t('proxy.unknown'), ''];
  if (!p.enabled) return [t('proxy.down'), 'bad'];
  if (p.latencyMs) return [t('proxy.latency', { ms: p.latencyMs }), 'warn'];
  return [t('proxy.ok'), 'good'];
}

function ChaosTarget({ name, label, defaultDelay, proxy, run, busy }) {
  const { t } = useI18n();
  // 사용자가 고치는 중일 때만 draft가 있다. 없으면 서버의 현재 상태를 그대로 보여준다.
  const [draft, setDraft] = useState(null);
  const current = proxyMode(proxy);
  const mode = draft?.mode ?? current ?? 'up';
  const delay = draft?.delay ?? String(proxy?.latencyMs || defaultDelay);
  const delayMs = Number(delay);
  const delayValid = Number.isInteger(delayMs) && delayMs >= MIN_DELAY && delayMs <= MAX_DELAY;
  const changed = mode !== current || (mode === 'latency' && delayMs !== proxy?.latencyMs);
  const [state, tone] = proxyState(proxy, t);

  const apply = async () => {
    const body = mode === 'latency' ? { target: name, action: 'latency', ms: delayMs } : { target: name, action: mode };
    if (await run('/chaos', body)) setDraft(null);
  };

  return (
    <div className="chaos">
      <div className="chaos-head">
        <b>{label}</b>
        <span className={`badge ${tone}`}>{state}</span>
      </div>
      <div className="chaos-body">
        <div className="radios" role="radiogroup" aria-label={label}>
          {CHAOS_MODES.map((m) => (
            <label key={m} className={`radio ${mode === m ? 'on' : ''}`}>
              <input type="radio" name={`chaos-${name}`} value={m} checked={mode === m} onChange={() => setDraft({ mode: m, delay })} />
              {t(`chaos.mode.${m}`)}
              {m === 'latency' && (
                <span className="delay-input">
                  <input
                    type="number"
                    min={MIN_DELAY}
                    max={MAX_DELAY}
                    step={50}
                    value={delay}
                    disabled={mode !== 'latency'}
                    aria-label={t('chaos.delayLabel')}
                    onChange={(e) => setDraft({ mode: 'latency', delay: e.target.value })}
                  />
                  ms
                </span>
              )}
            </label>
          ))}
        </div>
        <button className="primary" disabled={busy || !changed || (mode === 'latency' && !delayValid)} onClick={apply}>
          {t('chaos.apply')}
        </button>
      </div>
      {mode === 'latency' && !delayValid && <p className="error">{t('chaos.invalidDelay', { min: MIN_DELAY, max: MAX_DELAY })}</p>}
    </div>
  );
}

export function ChaosPanel({ latest }) {
  const { t } = useI18n();
  const { run, error, busy } = useAction();
  return (
    <div className="card">
      <h2>{t('chaos.title')}</h2>
      <ChaosTarget name="redis" label="Redis" defaultDelay={800} proxy={latest?.proxies?.redis} run={run} busy={busy} />
      <ChaosTarget name="postgres" label="PostgreSQL" defaultDelay={500} proxy={latest?.proxies?.postgres} run={run} busy={busy} />
      <button className="wide" disabled={busy} onClick={() => run('/chaos', { action: 'reset' })}>
        {t('chaos.resetAll')}
      </button>
      {error && <p className="error">{error}</p>}
    </div>
  );
}
