# SagaFlow

TypeScript Saga Orchestrator library for managing distributed transactions across microservices.

## Packages

| Package | Description |
|---------|-------------|
| `@sagaflow/core` | Saga builder, executor, compensation engine |
| `@sagaflow/persistence` | Persistence interfaces and SQL migrations |
| `@sagaflow/postgres` | PostgreSQL adapter with leasing and outbox |
| `@sagaflow/recovery` | Recovery worker for orphaned sagas |
| `@sagaflow/kafka` | Kafka publisher and outbox relay |
| `@sagaflow/observability` | OpenTelemetry tracing hooks |
| `@sagaflow/dashboard-api` | NestJS read API |
| `@sagaflow/dashboard-web` | Next.js dashboard UI |

## Quick Start

```bash
pnpm install
pnpm build
pnpm --filter @sagaflow/core test
pnpm --filter @sagaflow/examples start
```

## Usage

```ts
import { Saga } from "@sagaflow/core";

const result = await Saga.create({ orderId: "123" })
  .step("reserve-inventory", reserve, release)
  .step("charge-payment", charge, refund)
  .step("book-shipping", ship, cancelShipment)
  .execute();
```

## Documentation

See [docs/saga-orchestrator/README.md](docs/saga-orchestrator/README.md) for full phase-by-phase documentation.
