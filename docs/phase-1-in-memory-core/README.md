# Phase 1: In-Memory Core

## Deliverables

- **pnpm monorepo** scaffolded with Turborepo, tsup, Vitest, and Changesets
- **`@sagaflow/core`** package with zero runtime dependencies
- `SagaBuilder` — fluent API to define saga steps
- `SagaDefinition` — immutable named definition (define vs run separation)
- `SagaExecutor` — forward execution with write-ahead step persistence
- `CompensationExecutor` — reverse-order rollback on failure
- `InMemorySagaRepository` — in-memory persistence adapter
- `DefaultSagaRegistry` — named saga definition registry
- Full status model including `COMPENSATION_FAILED`
- Idempotency keys injected into every step context (`${sagaId}:${stepName}`)
- `ConfigurableFaultInjector` for fault-injection testing

## Public API

```ts
import { Saga } from "@sagaflow/core";

const result = await Saga.create("order-saga", { orderId: "123" })
  .step("reserve-inventory", reserve, release)
  .step("charge-payment", charge, refund)
  .step("book-shipping", ship, cancelShipment)
  .execute();
```

### Define vs Run

```ts
// Define (for durable/recovery mode)
const definition = Saga.define("order-saga", { orderId: "123" })
  .step("reserve-inventory", reserve, release)
  .define();

// Register for recovery worker
Saga.register(registry, definition);

// Run
await Saga.run(definition, { orderId: "123" }, { repository });
```

## Step Context

Every action/compensate receives:

```ts
interface SagaStepContext<TContext> {
  sagaId: string;
  sagaName: string;
  stepName: string;
  idempotencyKey: string;  // `${sagaId}:${stepName}`
  data: TContext;
  signal?: AbortSignal;
}
```

Actions may return `Partial<TContext>` patches that are merged and persisted.

## Tests

13 unit tests covering:
- Successful forward execution
- Reverse compensation on failure
- `COMPENSATION_FAILED` terminal state
- Write-ahead persistence (step RUNNING before action)
- Saga resume skipping completed steps
- Definition registry
- Retry and non-retryable errors
- Lifecycle hooks
- Timeout handling

Run: `pnpm --filter @sagaflow/core test`
