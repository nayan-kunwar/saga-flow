import { describe, it, expect } from "vitest";
import {
  Saga,
  DefaultSagaRegistry,
  InMemorySagaRepository,
  SagaExecutor,
} from "@sagaflow/core";
import { RecoveryWorker } from "../src/RecoveryWorker.js";

interface Ctx extends Record<string, unknown> {
  orderId: string;
  step?: number;
}

describe("RecoveryWorker", () => {
  it("resumes orphaned running sagas", async () => {
    const repository = new InMemorySagaRepository();
    const registry = new DefaultSagaRegistry();

    const definition = Saga.define<Ctx>("resume-saga", { orderId: "r1" })
      .step("step-1", async (ctx) => ({ step: 1 }))
      .step("step-2", async (ctx) => ({ step: 2 }))
      .define();

    Saga.register(registry, definition);

    const instance = await repository.createSaga("resume-saga", { orderId: "r1" });
    await repository.updateSagaStatus(instance.id, "RUNNING");
    await repository.createStep(instance.id, "step-1");
    const steps = await repository.getSteps(instance.id);
    await repository.updateStepStatus(steps[0]!.id, "COMPLETED");

    const worker = new RecoveryWorker({
      repository,
      registry,
      ownerId: "worker-1",
      leaseDurationMs: 30_000,
    });

    const recovered = await worker.recoverOnce();
    expect(recovered).toBe(1);

    const saga = await repository.getSaga(instance.id);
    expect(saga?.status).toBe("COMPLETED");
    expect((saga?.context as Ctx).step).toBe(2);
  });
});
