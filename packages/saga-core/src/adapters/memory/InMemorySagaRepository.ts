import { randomUUID } from "node:crypto";
import type {
  SagaEvent,
  SagaInstance,
  SagaRepository,
  SagaStatus,
  SagaStepRecord,
  StepStatus,
} from "../../types/index.js";

export class InMemoryEventPublisher {
  readonly events: SagaEvent[] = [];

  async publish(event: SagaEvent): Promise<void> {
    this.events.push({ ...event, timestamp: new Date(event.timestamp) });
  }

  clear(): void {
    this.events.length = 0;
  }
}

export class InMemorySagaRepository implements SagaRepository {
  private readonly sagas = new Map<string, SagaInstance<Record<string, unknown>>>();
  private readonly steps = new Map<string, SagaStepRecord[]>();
  private readonly outbox: Array<{ id: string; event: SagaEvent; published: boolean }> = [];

  async createSaga<TContext extends Record<string, unknown>>(
    name: string,
    context: TContext
  ): Promise<SagaInstance<TContext>> {
    const now = new Date();
    const instance: SagaInstance<TContext> = {
      id: randomUUID(),
      name,
      status: "PENDING",
      context,
      createdAt: now,
      updatedAt: now,
    };
    this.sagas.set(instance.id, instance as SagaInstance<Record<string, unknown>>);
    this.steps.set(instance.id, []);
    return instance;
  }

  async getSaga<TContext extends Record<string, unknown>>(
    sagaId: string
  ): Promise<SagaInstance<TContext> | null> {
    const saga = this.sagas.get(sagaId);
    return saga ? (saga as SagaInstance<TContext>) : null;
  }

  async updateSagaStatus(
    sagaId: string,
    status: SagaStatus,
    failureReason?: string
  ): Promise<void> {
    const saga = this.sagas.get(sagaId);
    if (!saga) throw new Error(`Saga ${sagaId} not found`);
    saga.status = status;
    saga.failureReason = failureReason;
    saga.updatedAt = new Date();
  }

  async updateSagaContext<TContext extends Record<string, unknown>>(
    sagaId: string,
    context: TContext
  ): Promise<void> {
    const saga = this.sagas.get(sagaId);
    if (!saga) throw new Error(`Saga ${sagaId} not found`);
    saga.context = context;
    saga.updatedAt = new Date();
  }

  async createStep(sagaId: string, stepName: string): Promise<SagaStepRecord> {
    const record: SagaStepRecord = {
      id: randomUUID(),
      sagaId,
      stepName,
      status: "PENDING",
      retries: 0,
    };
    const sagaSteps = this.steps.get(sagaId) ?? [];
    sagaSteps.push(record);
    this.steps.set(sagaId, sagaSteps);
    return record;
  }

  async updateStepStatus(
    stepId: string,
    status: StepStatus,
    retries?: number
  ): Promise<void> {
    for (const sagaSteps of this.steps.values()) {
      const step = sagaSteps.find((s) => s.id === stepId);
      if (step) {
        step.status = status;
        if (retries !== undefined) step.retries = retries;
        if (status === "RUNNING") step.startedAt = new Date();
        if (status === "COMPLETED" || status === "COMPENSATED" || status === "FAILED") {
          step.completedAt = new Date();
        }
        return;
      }
    }
    throw new Error(`Step ${stepId} not found`);
  }

  async getSteps(sagaId: string): Promise<SagaStepRecord[]> {
    return [...(this.steps.get(sagaId) ?? [])];
  }

  async findRunningSagas(): Promise<SagaInstance<Record<string, unknown>>[]> {
    const now = new Date();
    return [...this.sagas.values()].filter(
      (s) =>
        s.status === "RUNNING" ||
        (s.status === "COMPENSATING" && (!s.lockedUntil || s.lockedUntil < now))
    );
  }

  async claimOrphanedSagas(
    ownerId: string,
    leaseDurationMs: number,
    limit = 10
  ): Promise<SagaInstance<Record<string, unknown>>[]> {
    const now = new Date();
    const orphaned = [...this.sagas.values()]
      .filter(
        (s) =>
          (s.status === "RUNNING" || s.status === "COMPENSATING") &&
          (!s.lockedUntil || s.lockedUntil < now || s.ownerId === ownerId)
      )
      .slice(0, limit);

    for (const saga of orphaned) {
      saga.ownerId = ownerId;
      saga.lockedUntil = new Date(now.getTime() + leaseDurationMs);
      saga.heartbeatAt = now;
      saga.updatedAt = now;
    }

    return orphaned;
  }

  async claimSaga(
    sagaId: string,
    ownerId: string,
    leaseDurationMs: number
  ): Promise<boolean> {
    const saga = this.sagas.get(sagaId);
    if (!saga) return false;
    const now = new Date();
    if (saga.lockedUntil && saga.lockedUntil > now && saga.ownerId !== ownerId) {
      return false;
    }
    saga.ownerId = ownerId;
    saga.lockedUntil = new Date(now.getTime() + leaseDurationMs);
    saga.heartbeatAt = now;
    saga.updatedAt = now;
    return true;
  }

  async releaseSaga(sagaId: string, ownerId: string): Promise<void> {
    const saga = this.sagas.get(sagaId);
    if (!saga || saga.ownerId !== ownerId) return;
    saga.ownerId = undefined;
    saga.lockedUntil = undefined;
    saga.updatedAt = new Date();
  }

  async heartbeat(
    sagaId: string,
    ownerId: string,
    leaseDurationMs: number
  ): Promise<void> {
    const saga = this.sagas.get(sagaId);
    if (!saga || saga.ownerId !== ownerId) return;
    const now = new Date();
    saga.heartbeatAt = now;
    saga.lockedUntil = new Date(now.getTime() + leaseDurationMs);
    saga.updatedAt = now;
  }

  async appendOutboxEvent(event: SagaEvent): Promise<void> {
    this.outbox.push({ id: randomUUID(), event, published: false });
  }

  async getPendingOutboxEvents(limit = 100): Promise<Array<{ id: string; event: SagaEvent }>> {
    return this.outbox
      .filter((e) => !e.published)
      .slice(0, limit)
      .map((e) => ({ id: e.id, event: e.event }));
  }

  async markOutboxEventPublished(id: string): Promise<void> {
    const entry = this.outbox.find((e) => e.id === id);
    if (entry) entry.published = true;
  }

  getAllSagas(): SagaInstance<Record<string, unknown>>[] {
    return [...this.sagas.values()];
  }
}
