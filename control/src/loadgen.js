import { Agent, request } from 'undici';
import { performance } from 'node:perf_hooks';

const TOTAL_PRODUCTS = 200_000;
const HOT_PRODUCTS = 200;
const MAX_INFLIGHT = 1000;

const rand = (n) => Math.floor(Math.random() * n);
const hex = (len) => Array.from({ length: len }, () => rand(16).toString(16)).join('');
// 요청의 90%는 인기 상품 200개에 몰린다 (현실적인 핫키 분포)
const productPath = () => `/products/${Math.random() < 0.9 ? 1 + rand(HOT_PRODUCTS) : 1 + rand(TOTAL_PRODUCTS)}`;

export const SCENARIOS = {
  product: { build: () => ({ path: productPath() }) },
  category: { build: () => ({ path: `/category/cat-${rand(50)}` }) },
  search: { build: () => ({ path: `/search?q=${hex(6)}` }) },
  slow: { build: () => ({ path: '/slow' }) },
  mixed: {
    // 조회 70 / 카테고리 20 / 검색 10
    build: () => {
      const r = Math.random();
      if (r < 0.7) return { path: productPath() };
      return r < 0.9 ? SCENARIOS.category.build() : SCENARIOS.search.build();
    },
  },
  custom: {
    build: (sql) => ({ method: 'POST', path: '/query/custom', body: JSON.stringify({ sql }) }),
  },
};

export class LoadGenerator {
  constructor(baseUrl, onEvent) {
    this.baseUrl = baseUrl;
    this.onEvent = onEvent;
    this.agent = new Agent({ connections: 256, keepAliveTimeout: 10_000 });
    this.running = false;
    this.opts = null;
    this.inflight = 0;
    this.win = this.newWindow();
  }

  newWindow() {
    return { start: Date.now(), sent: 0, ok: 0, err: 0, dropped: 0, lat: [] };
  }

  start(opts) {
    const wasRunning = this.running;
    this.opts = opts;
    this.endsAt = Date.now() + opts.durationSec * 1000;
    this.onEvent(wasRunning ? 'LOAD_UPDATE' : 'LOAD_START', { scenario: opts.scenario, rps: opts.rps, durationSec: opts.durationSec });
    if (wasRunning) return;

    this.running = true;
    this.budget = 0;
    let last = performance.now();
    this.timer = setInterval(() => {
      if (Date.now() >= this.endsAt) return this.stop('timeout');
      const now = performance.now();
      this.budget += (this.opts.rps * (now - last)) / 1000;
      last = now;
      while (this.budget >= 1) {
        this.budget -= 1;
        if (this.inflight >= MAX_INFLIGHT) this.win.dropped++; // 응답이 밀려 더 못 보냄
        else this.fire();
      }
    }, 10);
  }

  stop(reason = 'user') {
    if (!this.running) return;
    clearInterval(this.timer);
    this.running = false;
    this.onEvent('LOAD_STOP', { reason });
  }

  fire() {
    const { method = 'GET', path, body } = SCENARIOS[this.opts.scenario].build(this.opts.sql);
    const t0 = performance.now();
    this.inflight++;
    this.win.sent++;
    request(this.baseUrl + path, {
      method,
      body,
      headers: body ? { 'content-type': 'application/json' } : undefined,
      dispatcher: this.agent,
      headersTimeout: 5000,
      bodyTimeout: 5000,
    })
      .then(async (res) => {
        await res.body.dump();
        if (res.statusCode < 400) this.win.ok++;
        else this.win.err++;
      })
      .catch(() => {
        this.win.err++;
      })
      .finally(() => {
        this.inflight--;
        if (this.win.lat.length < 50_000) this.win.lat.push(performance.now() - t0);
      });
  }

  snapshot() {
    const w = this.win;
    this.win = this.newWindow();
    const sec = Math.max(1, Date.now() - w.start) / 1000;
    const lat = w.lat.sort((a, b) => a - b);
    const pct = (p) => (lat.length ? lat[Math.min(lat.length - 1, Math.floor(lat.length * p))] : 0);
    return {
      running: this.running,
      scenario: this.opts?.scenario ?? null,
      targetRps: this.running ? this.opts.rps : 0,
      durationSec: this.running ? this.opts.durationSec : 0,
      remainingSec: this.running ? Math.max(0, Math.ceil((this.endsAt - Date.now()) / 1000)) : 0,
      sentPerSec: w.sent / sec,
      okPerSec: w.ok / sec,
      errPerSec: w.err / sec,
      droppedPerSec: w.dropped / sec,
      inflight: this.inflight,
      latency: { p50: pct(0.5), p95: pct(0.95), p99: pct(0.99) },
    };
  }
}
