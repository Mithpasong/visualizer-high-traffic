# Traffic Lab

Node.js 서버에 직접 트래픽을 걸고 **캐시, DB 커넥션 풀, 장애 대응**이 어떻게 동작하는지 브라우저에서 실시간으로 관찰하는 실험실입니다.

## 구성

```
브라우저 ──▶ Caddy (HTTPS)
              ├─ /          → web      Next.js 대시보드
              └─ /control/* → control  부하 생성기 · 지표 수집 · 장애 주입 · WebSocket
                                 │ HTTP 부하
                                 ▼
                               api      실험 대상 서버 (Fastify, CPU 1코어/512MB 제한)
                                 │
                             toxiproxy  ← 장애 주입 지점 (지연/단절)
                              ├─ redis     캐시 (128MB, allkeys-lru)
                              └─ postgres  상품 20만 건 (CPU 1코어 제한)
```

| 서비스 | 역할 |
|---|---|
| `api` | 캐시 어사이드, single-flight, opossum 서킷 브레이커, pg 커넥션 풀(기본 10) |
| `control` | 목표 RPS로 요청 생성(undici), 1초마다 api·Redis·PG·toxiproxy 상태를 모아 WebSocket으로 브로드캐스트 |
| `web` | 조작 패널 + 실시간 차트 |

## 시나리오

| 시나리오 | 관찰 포인트 |
|---|---|
| 상품 조회 (캐시) | 요청 90%가 인기 상품 200개에 몰림 → 히트율, TTL 만료 |
| 카테고리 조회 | 복합 인덱스를 타는 빠른 쿼리 |
| 설명 검색 | 인덱스 없는 `LIKE '%..%'` 풀스캔 → DB CPU 병목 |
| 느린 쿼리 | `pg_sleep(0.2)` → 커넥션 풀 고갈, 대기열 증가 |
| 커스텀 SQL | `ADMIN_TOKEN` 설정 시에만 활성화, 읽기 전용 계정 + 2초 타임아웃 |

## 로컬 실행

```bash
docker compose up -d --build
# http://localhost
```

## 배포 (VM 1대)

1. VM 준비 (Ubuntu, 2vCPU/4GB 이상 권장) 후 Docker 설치
2. 도메인 A 레코드를 VM IP로 연결, 방화벽에서 80/443 개방
3. 실행
   ```bash
   git clone <repo> && cd high-traffic
   cp .env.example .env   # SITE_ADDRESS=lab.example.com, ADMIN_TOKEN 설정
   docker compose up -d --build
   ```
   Caddy가 HTTPS 인증서를 자동 발급합니다.

## 공개 데모 안전장치

- RPS 상한(`MAX_RPS`), 최대 지속 시간(`MAX_DURATION_SEC`), 부하는 서버 전체에서 한 번에 하나
- IP당 조작 요청 300ms 간격 제한
- 커스텀 SQL은 관리자 토큰 필요, 읽기 전용 role, `statement_timeout 2s`
- api·DB·Redis·toxiproxy 포트는 외부에 노출하지 않음 (Caddy 80/443만 공개)
- 컨테이너 자원은 Docker 소켓을 직접 마운트하지 않고 `docker-socket-proxy`(컨테이너 조회 GET만 허용)를 통해 수집

> 부하 생성기와 대상 서버가 같은 VM에 있으므로 절대 수치는 참고용입니다. 정확한 측정이 필요하면 control을 별도 VM으로 분리하세요.
