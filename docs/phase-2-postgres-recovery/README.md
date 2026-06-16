# Phase 2: Postgres Durability + Recovery

## Deliverables

- **`@sagaflow/persistence`** — shared interfaces and SQL migration schema
- **`@sagaflow/postgres`** — PostgreSQL adapter with:
  - `saga_instances` table (status, context JSONB, leasing columns)
  - `saga_steps` table (per-step status, retries, timestamps)
  - `saga_outbox` table (transactional outbox for events)
  - `SELECT ... FOR UPDATE SKIP LOCKED` for orphan claiming
  - Leasing via `owner_id`, `locked_until`, `heartbeat_at`
- **`@sagaflow/recovery`** — `RecoveryWorker` that claims and resumes orphaned sagas

## Database Schema

```sql
-- saga_instances: id, name, status, context, failure_reason, owner_id, locked_until, heartbeat_at
-- saga_steps: id, saga_id, step_name, status, retries, started_at, completed_at
-- saga_outbox: id, saga_id, event_type, payload, published_at
```

Run migrations:

```ts
import { Pool } from "pg";
import { runMigrations } from "@sagaflow/postgres";

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
await runMigrations(pool);
```

## Usage

```ts
import { Pool } from "pg";
import { PostgresSagaRepository } from "@sagaflow/postgres";
import { Saga, DefaultSagaRegistry } from "@sagaflow/core";
import { RecoveryWorker } from "@sagaflow/recovery";

const pool = new Pool({ connectionString: "postgresql://..." });
const repository = new PostgresSagaRepository({ pool });
const registry = new DefaultSagaRegistry();

// Register definition (required for recovery)
const definition = Saga.define("order-saga", { orderId: "123" })
  .step("reserve-inventory", reserve, release)
  .define();
Saga.register(registry, definition);

// Execute durably
await Saga.run(definition, { orderId: "123" }, { repository });

// Start recovery worker
const worker = new RecoveryWorker({
  repository,
  registry,
  ownerId: "worker-1",
  leaseDurationMs: 30_000,
});
worker.start();
```

## Key Design Decisions

- **Write-ahead**: step persisted as `RUNNING` before action executes
- **Transactional outbox**: events written to `saga_outbox` in same persistence flow
- **Named + registered definitions**: recovery worker looks up saga by `name` to get step functions
- **Leasing**: prevents two workers from resuming the same saga

## Tests

Recovery worker test verifies orphaned `RUNNING` sagas are resumed to `COMPLETED`.

Run: `pnpm --filter @sagaflow/recovery test`
