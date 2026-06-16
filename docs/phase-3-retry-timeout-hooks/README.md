# Phase 3: Retry, Timeout, and Hooks

## Deliverables

All implemented in `@sagaflow/core`:

### Retry Policies

```ts
import { retry, exponentialBackoff, fixedDelay, exponentialBackoffWithJitter } from "@sagaflow/core";

.step("charge-payment", charge, refund, {
  retry: retry({
    attempts: 5,
    strategy: exponentialBackoff({ initialDelayMs: 1000 }),
  }),
  compensationRetry: retry({
    attempts: 5,
    strategy: exponentialBackoffWithJitter({ initialDelayMs: 500 }),
  }),
})
```

**Strategies:**
- `fixedDelay(ms)` — constant delay between attempts
- `exponentialBackoff({ initialDelayMs, multiplier?, maxDelayMs? })`
- `exponentialBackoffWithJitter(...)` — randomized backoff to prevent thundering herd

### Non-Retryable Errors

```ts
import { NonRetryableError } from "@sagaflow/core";

async function charge(ctx) {
  if (invalidCard) throw new NonRetryableError("Invalid card");
}
```

Non-retryable errors skip remaining retry attempts and trigger compensation immediately.

### Timeouts

```ts
.step("charge", charge, refund, { timeout: 30_000 })
```

Uses `Promise.race` with `AbortSignal` passed to the action. A timed-out step is treated as failed and triggers compensation. Note: the underlying action may still complete — compensations must be idempotent.

### Lifecycle Hooks

```ts
await Saga.create("order-saga", ctx, {
  hooks: {
    onSagaStart(instance) {},
    onSagaComplete(instance) {},
    onSagaFailed(instance, error) {},
    onStepStart(instance, step) {},
    onStepComplete(instance, step) {},
    onStepFailed(instance, step, error) {},
    onCompensationStart(instance) {},
    onCompensationComplete(instance) {},
    onCompensationFailed(instance, step, error) {},
  },
})
```

## Tests

4 additional tests for retry strategies and timeout behavior.

Run: `pnpm --filter @sagaflow/core test`
