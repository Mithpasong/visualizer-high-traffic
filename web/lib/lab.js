'use client';
import { useEffect, useState } from 'react';

export const CONTROL = process.env.NEXT_PUBLIC_CONTROL_URL || '/control';

const CACHE_TYPES = new Set(['HIT', 'MISS', 'SET', 'COALESCED']);

function wsUrl() {
  const u = new URL(CONTROL, window.location.href);
  u.protocol = u.protocol === 'https:' ? 'wss:' : 'ws:';
  u.pathname = `${u.pathname.replace(/\/$/, '')}/ws`;
  return u.toString();
}

export const CHART_SERVICES = ['api', 'postgres', 'redis', 'control'];

// 컨테이너별 CPU/메모리를 cpu_api, mem_api 같은 키로 펼친다
function containerPoint(list) {
  const point = {};
  for (const c of list) {
    if (!CHART_SERVICES.includes(c.service)) continue;
    point[`cpu_${c.service}`] = c.cpu ?? 0;
    point[`mem_${c.service}`] = (c.memUsed ?? 0) / 1048576;
  }
  return point;
}

// 스냅샷 하나를 차트용 포인트로 평탄화
function toPoint(d) {
  const a = d.api?.up ? d.api : null;
  return {
    sent: d.load.sentPerSec,
    rps: a?.rps ?? 0,
    err: d.load.errPerSec,
    p50: d.load.latency.p50,
    p95: d.load.latency.p95,
    p99: d.load.latency.p99,
    hit: a?.cache.hit ?? 0,
    miss: a?.cache.miss ?? 0,
    coalesced: a?.cache.coalesced ?? 0,
    poolActive: a ? a.pool.total - a.pool.idle : 0,
    poolIdle: a?.pool.idle ?? 0,
    poolWaiting: a?.pool.waiting ?? 0,
    ...containerPoint(d.containers?.list ?? []),
  };
}

export function useLab() {
  const [connected, setConnected] = useState(false);
  const [latest, setLatest] = useState(null);
  const [history, setHistory] = useState([]);
  const [cacheEvents, setCacheEvents] = useState([]);
  const [timeline, setTimeline] = useState([]);

  useEffect(() => {
    let ws;
    let timer;
    let closed = false;
    const connect = () => {
      ws = new WebSocket(wsUrl());
      ws.onopen = () => setConnected(true);
      ws.onclose = () => {
        setConnected(false);
        if (!closed) timer = setTimeout(connect, 1500);
      };
      ws.onmessage = (m) => {
        const { type, data } = JSON.parse(m.data);
        if (type !== 'snapshot') return;
        setLatest(data);
        setHistory((h) => [...h.slice(-59), toPoint(data)]);
        const cache = data.events.filter((e) => CACHE_TYPES.has(e.type)).reverse();
        const other = data.events.filter((e) => !CACHE_TYPES.has(e.type)).reverse();
        if (cache.length) setCacheEvents((c) => [...cache, ...c].slice(0, 40));
        if (other.length) setTimeline((t) => [...other, ...t].slice(0, 80));
      };
    };
    connect();
    return () => {
      closed = true;
      clearTimeout(timer);
      ws?.close();
    };
  }, []);

  return { connected, latest, history, cacheEvents, timeline };
}

export async function post(path, body) {
  const r = await fetch(`${CONTROL}${path}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body ?? {}),
  });
  const json = await r.json().catch(() => ({}));
  if (!r.ok) {
    const err = new Error(json.error || r.statusText);
    err.code = json.code; // 프론트에서 번역할 에러 코드
    throw err;
  }
  return json;
}

export const num = (v, d = 0) =>
  v == null || Number.isNaN(v) ? '-' : Number(v).toLocaleString('ko-KR', { maximumFractionDigits: d });
export const ms = (v) => (v == null ? '-' : `${num(v, v < 10 ? 1 : 0)}ms`);
export const gb = (b) => (b == null || Number.isNaN(b) ? '-' : `${num(b / 1073741824, 1)}GB`);
export const kb = (b) => (b == null || Number.isNaN(b) ? '-' : b < 1048576 ? `${num(b / 1024, 1)}KB` : `${num(b / 1048576, 1)}MB`);
export const mb = (b) => (b == null || Number.isNaN(b) ? '-' : `${num(b / 1048576, 1)}MB`);
