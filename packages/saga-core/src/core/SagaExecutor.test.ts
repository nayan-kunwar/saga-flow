import { describe, it, expect, vi } from "vitest";
import {
  Saga,
  InMemorySagaRepository,
  InMemoryEventPublisher,
  CompensationFailedError,
  NonRetryableError,
  DefaultSagaRegistry,
} from "../index.js";

interface OrderContext extends Record<string, unknown> {
  orderId: string;
  inventoryReserved?: boolean;
  paymentCharged?: boolean;
  shipped?: boolean;
}

describe("SagaExecutor", () => {
  it("executes all steps successfully", async () => {
    const repository = new InMemorySagaRepository();
    const events: string[] = [];
    const publisher = new InMemoryEventPublisher();

    const result = await Saga.create<OrderContext>(
      "order-saga",
      { orderId: "order-1" },
      { repository, eventPublisher: publisher }
    )
      .step("reserve-inventory", async (ctx) => {
        expect(ctx.idempotencyKey).toMatch(/^[^:]+:reserve-inventory$/);
        return { inventoryReserved: true };
      })
      .step("charge-payment", async () => ({ paymentCharged: true }))
      .step("book-shipping", async () => ({ shipped: true }))
      .execute();

    expect(result.status).toBe("COMPLETED");
    expect(result.context.inventoryReserved).toBe(true);
    expect(result.context.paymentCharged).toBe(true);
    expect(result.context.shipped).toBe(true);

    const saga = await repository.getSaga(result.sagaId);
    expect(saga?.status).toBe("COMPLETED");
  });

  it("compensates in reverse order on failure", async () => {
    const repository = new InMemorySagaRepository();
    const compensationOrder: string[] = [];

    const result = await Saga.create<OrderContext>(
      "order-saga",
      { orderId: "order-2" },
      { repository }
    )
      .step("reserve-inventory", async () => ({ inventoryReserved: true }), async () => {
        compensationOrder.push("release-inventory");
      })
      .step("charge-payment", async () => ({ paymentCharged: true }), async () => {
        compensationOrder.push("refund-payment");
      })
      .step("book-shipping", async () => {
        throw new Error("Shipping failed");
      }, async () => {
        compensationOrder.push("cancel-shipping");
      })
      .execute();

    expect(result.status).toBe("COMPENSATED");
    expect(compensationOrder).toEqual(["refund-payment", "release-inventory"]);
  });

  it("sets COMPENSATION_FAILED when compensation fails", async () => {
    const repository = new InMemorySagaRepository();
    const noRetry = { attempts: 1, strategy: { type: "fixed" as const, delayMs: 0 } };

    const result = await Saga.create<OrderContext>(
      "order-saga",
      { orderId: "order-3" },
      { repository }
    )
      .step(
        "reserve-inventory",
        async () => ({ inventoryReserved: true }),
        async () => {
          throw new Error("Release failed");
        },
        { compensationRetry: noRetry }
      )
      .step("charge-payment", async () => {
        throw new Error("Payment failed");
      })
      .execute();

    expect(result.status).toBe("COMPENSATION_FAILED");
    expect(result.failureReason).toContain("Release failed");
  });

  it("persists step RUNNING before action (write-ahead)", async () => {
    const repository = new InMemorySagaRepository();
    let stepStatusDuringAction: string | undefined;

    await Saga.create<OrderContext>("order-saga", { orderId: "order-4" }, { repository })
      .step("reserve-inventory", async () => {
        const sagas = repository.getAllSagas();
        const steps = await repository.getSteps(sagas[0]!.id);
        stepStatusDuringAction = steps[0]?.status;
        return { inventoryReserved: true };
      })
      .execute();

    expect(stepStatusDuringAction).toBe("RUNNING");
  });

  it("resumes from existing saga skipping completed steps", async () => {
    const repository = new InMemorySagaRepository();
    const definition = Saga.define<OrderContext>("order-saga", { orderId: "order-5" })
      .step("reserve-inventory", async () => ({ inventoryReserved: true }))
      .step("charge-payment", async () => ({ paymentCharged: true }))
      .define();

    const first = await Saga.run(definition, { orderId: "order-5" }, { repository });
    expect(first.status).toBe("COMPLETED");

    const executor = new (await import("./SagaExecutor.js")).SagaExecutor<OrderContext>({
      repository,
    });

    const resumed = await executor.resume(first.sagaId, definition);
    expect(resumed.status).toBe("COMPLETED");
  });

  it("registers and retrieves saga definitions", () => {
    const registry = new DefaultSagaRegistry();
    const definition = Saga.define<OrderContext>("order-saga", { orderId: "x" })
      .step("step-1", async () => {})
      .define();

    Saga.register(registry, definition);
    expect(registry.has("order-saga")).toBe(true);
    expect(registry.get("order-saga")?.steps).toHaveLength(1);
  });
});

describe("Retry and errors", () => {
  it("retries transient failures", async () => {
    const repository = new InMemorySagaRepository();
    let attempts = 0;

    const result = await Saga.create<OrderContext>("retry-saga", { orderId: "r1" }, { repository })
      .step(
        "flaky-step",
        async () => {
          attempts++;
          if (attempts < 3) throw new Error("Transient");
          return { inventoryReserved: true };
        },
        undefined,
        { retry: { attempts: 5, strategy: { type: "fixed", delayMs: 10 } } }
      )
      .execute();

    expect(result.status).toBe("COMPLETED");
    expect(attempts).toBe(3);
  });

  it("does not retry NonRetryableError", async () => {
    const repository = new InMemorySagaRepository();
    let attempts = 0;

    const result = await Saga.create<OrderContext>("retry-saga", { orderId: "r2" }, { repository })
      .step(
        "permanent-fail",
        async () => {
          attempts++;
          throw new NonRetryableError("Invalid card");
        },
        undefined,
        { retry: { attempts: 5, strategy: { type: "fixed", delayMs: 10 } } }
      )
      .execute();

    expect(result.status).toBe("COMPENSATED");
    expect(attempts).toBe(1);
  });
});

describe("Hooks", () => {
  it("invokes lifecycle hooks", async () => {
    const repository = new InMemorySagaRepository();
    const onSagaStart = vi.fn();
    const onStepComplete = vi.fn();
    const onSagaComplete = vi.fn();

    await Saga.create<OrderContext>(
      "hook-saga",
      { orderId: "h1" },
      {
        repository,
        hooks: { onSagaStart, onStepComplete, onSagaComplete },
      }
    )
      .step("step-1", async () => {})
      .execute();

    expect(onSagaStart).toHaveBeenCalledOnce();
    expect(onStepComplete).toHaveBeenCalledOnce();
    expect(onSagaComplete).toHaveBeenCalledOnce();
  });
});
