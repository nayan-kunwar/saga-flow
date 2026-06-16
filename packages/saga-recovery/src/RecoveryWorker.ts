import {
  SagaExecutor,
  type SagaDefinition,
  type SagaRegistry,
  type SagaRepository,
} from "@sagaflow/core";

export interface RecoveryWorkerOptions {
  repository: SagaRepository & {
    claimOrphanedSagas(
      ownerId: string,
      leaseDurationMs: number,
      limit?: number
    ): Promise<import("@sagaflow/core").SagaInstance<Record<string, unknown>>[]>;
  };
  registry: SagaRegistry;
  ownerId: string;
  leaseDurationMs?: number;
  pollIntervalMs?: number;
  batchSize?: number;
}

export class RecoveryWorker {
  private timer?: ReturnType<typeof setInterval>;
  private running = false;

  constructor(private readonly options: RecoveryWorkerOptions) {}

  async recoverOnce(): Promise<number> {
    const {
      repository,
      registry,
      ownerId,
      leaseDurationMs = 30_000,
      batchSize = 10,
    } = this.options;

    const orphaned = await repository.claimOrphanedSagas(
      ownerId,
      leaseDurationMs,
      batchSize
    );

    const executor = new SagaExecutor({
      repository,
      registry,
      ownerId,
    });

    let recovered = 0;

    for (const saga of orphaned) {
      const definition = registry.get(saga.name);
      if (!definition) {
        console.warn(`No registered definition for saga "${saga.name}" (${saga.id})`);
        continue;
      }

      try {
        await executor.resume(
          saga.id,
          definition as SagaDefinition<Record<string, unknown>>
        );
        recovered++;
      } catch (error) {
        console.error(`Failed to recover saga ${saga.id}:`, error);
      } finally {
        if (repository.releaseSaga) {
          await repository.releaseSaga(saga.id, ownerId);
        }
      }
    }

    return recovered;
  }

  start(): void {
    if (this.running) return;
    this.running = true;
    const interval = this.options.pollIntervalMs ?? 5_000;

    this.timer = setInterval(() => {
      this.recoverOnce().catch((err) => {
        console.error("Recovery poll failed:", err);
      });
    }, interval);
  }

  stop(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = undefined;
    }
    this.running = false;
  }
}
