'use client';
import { CHART_SERVICES, useLab } from '../lib/lab';
import { LANGS, LangProvider, useI18n } from '../lib/i18n';
import { LineChart } from '../components/LineChart';
import { ChaosPanel, ConfigPanel, GuidePanel, LoadPanel } from '../components/Controls';
import { CacheStream, ContainersPanel, DbPanel, Kpis, RedisPanel, ResiliencePanel } from '../components/Panels';

const C = {
  blue: '#5b9cff',
  green: '#3ecf8e',
  amber: '#f5b041',
  red: '#ff6b6b',
  purple: '#b18cff',
  gray: '#8a94a6',
};

const SERVICE_COLOR = { api: C.amber, postgres: C.blue, redis: C.red, control: C.gray };

const LANG_LABEL = { ko: '한국어', en: 'English' };

function LangSwitch() {
  const { lang, setLang } = useI18n();
  return (
    <div className="lang" role="group" aria-label="Language">
      {LANGS.map((l) => (
        <button key={l} className={l === lang ? 'active' : ''} aria-pressed={l === lang} onClick={() => setLang(l)}>
          {LANG_LABEL[l]}
        </button>
      ))}
    </div>
  );
}

function Dashboard() {
  const { t } = useI18n();
  const { connected, latest, history, cacheEvents, timeline } = useLab();
  const load = latest?.load;

  return (
    <main>
      <header className="top">
        <div>
          <h1>Traffic Lab</h1>
          <p className="muted">{t('app.subtitle')}</p>
        </div>
        <div className="status">
          <span className={`dot ${connected ? 'on' : ''}`} />
          {connected ? t('status.connected') : t('status.connecting')}
          {latest && <span className="muted">· {t('status.viewers', { n: latest.viewers })}</span>}
          {load?.running && <span className="badge warn">{t('status.running', { s: load.remainingSec })}</span>}
          <LangSwitch />
        </div>
      </header>

      <div className="layout">
        <aside>
          <LoadPanel latest={latest} />
          <ConfigPanel latest={latest} />
          <ChaosPanel latest={latest} />
          <GuidePanel />
        </aside>

        <section className="content">
          <Kpis latest={latest} />
          <ContainersPanel latest={latest} />

          <div className="charts">
            <LineChart
              title={t('chart.throughput')}
              data={history}
              series={[
                { key: 'sent', label: t('series.sent'), color: C.gray },
                { key: 'rps', label: t('series.served'), color: C.blue },
                { key: 'err', label: t('series.errors'), color: C.red },
              ]}
            />
            <LineChart
              title={t('chart.latency')}
              unit="ms"
              data={history}
              series={[
                { key: 'p50', label: 'p50', color: C.green },
                { key: 'p95', label: 'p95', color: C.amber },
                { key: 'p99', label: 'p99', color: C.red },
              ]}
            />
            <LineChart
              title={t('chart.cache')}
              data={history}
              series={[
                { key: 'hit', label: 'HIT', color: C.green },
                { key: 'miss', label: 'MISS', color: C.amber },
                { key: 'coalesced', label: 'JOIN', color: C.purple },
              ]}
            />
            <LineChart
              title={t('chart.pool')}
              data={history}
              series={[
                { key: 'poolActive', label: t('series.active'), color: C.blue },
                { key: 'poolIdle', label: t('series.idle'), color: C.gray },
                { key: 'poolWaiting', label: t('series.waiting'), color: C.red },
              ]}
            />
            <LineChart
              title={t('chart.containerCpu')}
              unit="%"
              data={history}
              series={CHART_SERVICES.map((svc) => ({ key: `cpu_${svc}`, label: svc, color: SERVICE_COLOR[svc] }))}
            />
            <LineChart
              title={t('chart.containerMem')}
              data={history}
              series={CHART_SERVICES.map((svc) => ({ key: `mem_${svc}`, label: svc, color: SERVICE_COLOR[svc] }))}
            />
          </div>

          <div className="panels">
            <RedisPanel latest={latest} />
            <DbPanel latest={latest} />
            <CacheStream events={cacheEvents} />
            <ResiliencePanel latest={latest} timeline={timeline} />
          </div>
        </section>
      </div>
    </main>
  );
}

export default function Page() {
  return (
    <LangProvider>
      <Dashboard />
    </LangProvider>
  );
}
