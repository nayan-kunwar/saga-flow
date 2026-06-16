# Phase 5: Dashboard + Metrics

## Deliverables

### `@sagaflow/dashboard-api` (NestJS)

Read-only REST API over PostgreSQL:

| Endpoint | Description |
|----------|-------------|
| `GET /api/sagas` | List saga instances |
| `GET /api/sagas/:id` | Saga detail with steps and context |
| `GET /metrics` | Prometheus metrics |

**Displayed fields:** Saga ID, name, status, current step, execution time, retries, failure reason.

**Prometheus metrics:**
- `sagaflow_sagas_total` — total saga count
- `sagaflow_sagas_by_status{status}` — count per status
- Default Node.js metrics via `prom-client`

```bash
# Start API
cd packages/saga-dashboard/api
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/sagaflow pnpm start
```

### `@sagaflow/dashboard-web` (Next.js)

Web UI showing saga instances in a table with status badges, plus a detail page per saga.

```bash
# Start dashboard
cd packages/saga-dashboard/web
NEXT_PUBLIC_API_URL=http://localhost:3001 pnpm dev
```

Open http://localhost:3000

## Architecture

```
Saga Library ──► PostgreSQL ──► NestJS API ──► Next.js Dashboard
                                    │
                                    └──► /metrics (Prometheus)
```
