# Phase 4: Kafka Events + Observability

## Deliverables

### `@sagaflow/kafka`

- **`KafkaPublisher`** — publishes saga lifecycle events to Kafka
- **`OutboxRelay`** — polls `saga_outbox` table and publishes to Kafka (at-least-once, avoids dual-write problem)

```ts
import { KafkaPublisher, OutboxRelay } from "@sagaflow/kafka";

const publisher = new KafkaPublisher({
  brokers: ["localhost:9092"],
  topic: "saga-events",
});

// Direct publish (in-memory mode)
await publisher.publish(event);

// Production: outbox relay
const relay = new OutboxRelay({
  repository,       // PostgresSagaRepository with outbox support
  publisher,
  pollIntervalMs: 2000,
});
relay.start();
```

### Events Published

| Event | When |
|-------|------|
| `SagaStarted` | Saga execution begins |
| `StepStarted` | Step enters RUNNING |
| `StepCompleted` | Step action succeeds |
| `SagaFailed` | Step action fails |
| `CompensationStarted` | Rollback begins |
| `CompensationCompleted` | All compensations succeed |
| `CompensationFailed` | A compensation step fails |
| `SagaCompleted` | All steps succeed |

### `@sagaflow/observability`

OpenTelemetry tracing hooks:

```ts
import { createTracingHooks } from "@sagaflow/observability";

await Saga.run(definition, ctx, {
  repository,
  hooks: createTracingHooks(),
});
```

Creates spans for saga start, each step, compensation, and records exceptions on failure.

## Architecture

```
SagaExecutor
     │
     ├──► saga_outbox (Postgres, same tx as state)
     │
OutboxRelay ──► KafkaPublisher ──► Kafka topic
     │
     └──► Observability systems / Dashboard
```
