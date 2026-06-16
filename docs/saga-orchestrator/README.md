# SagaFlow Orchestrator

A TypeScript saga-orchestration library for managing distributed transactions across microservices — a focused mini-Temporal for Node.js.

## Monorepo Structure

```
packages/
  saga-core/           @sagaflow/core         — builder, executor, compensation
  saga-persistence/    @sagaflow/persistence  — interfaces + SQL migrations
  saga-postgres/       @sagaflow/postgres     — PostgreSQL adapter
  saga-recovery/       @sagaflow/recovery    — recovery worker
  saga-kafka/          @sagaflow/kafka        — Kafka publisher + outbox relay
  saga-observability/  @sagaflow/observability — OpenTelemetry hooks
  saga-dashboard/
    api/               @sagaflow/dashboard-api — NestJS read API
    web/               @sagaflow/dashboard-web — Next.js UI
  examples/            @sagaflow/examples     — order-saga demo
```

**Tooling:** pnpm workspaces, Turborepo, tsup, Vitest, Changesets

## Phase Documentation

| Phase | Folder | Summary |
|-------|--------|---------|
| 1 | [phase-1-in-memory-core](../phase-1-in-memory-core/README.md) | SagaBuilder, Executor, Compensation, in-memory persistence |
| 2 | [phase-2-postgres-recovery](../phase-2-postgres-recovery/README.md) | Postgres adapter, outbox, leasing, recovery worker |
| 3 | [phase-3-retry-timeout-hooks](../phase-3-retry-timeout-hooks/README.md) | Retry policies, timeouts, lifecycle hooks |
| 4 | [phase-4-kafka-observability](../phase-4-kafka-observability/README.md) | Kafka publisher, outbox relay, OpenTelemetry |
| 5 | [phase-5-dashboard-metrics](../phase-5-dashboard-metrics/README.md) | NestJS API, Next.js dashboard, Prometheus |

## Quick Start

```bash
pnpm install
pnpm build
pnpm --filter @sagaflow/core test
pnpm --filter @sagaflow/examples start
```

## Core Usage

```ts
import { Saga } from "@sagaflow/core";

const result = await Saga.create("order-saga", { orderId: "ORD-001" })
  .step("reserve-inventory", reserve, release)
  .step("charge-payment", charge, refund)
  .step("book-shipping", ship, cancelShipment)
  .execute();

// result.status: COMPLETED | COMPENSATED | COMPENSATION_FAILED
```

## Guiding Principles

1. **`saga-core` has zero runtime deps** — adapters are separate packages
2. **Define vs run are separated** — durable sagas are named + registered
3. **Idempotency is first-class** — every step gets `${sagaId}:${stepName}` key
4. **Write-ahead persistence** — step RUNNING before side effect
5. **Transactional outbox** — events in Postgres, relayed to Kafka
6. **Leasing** — `SKIP LOCKED` prevents duplicate recovery

## Test Results

- `@sagaflow/core`: 13 tests passing
- `@sagaflow/recovery`: 1 test passing
