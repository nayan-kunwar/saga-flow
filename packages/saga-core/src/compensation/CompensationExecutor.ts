import { CompensationFailedError } from "../errors/index.js";
import {
  defaultCompensationRetryPolicy,
  withRetry,
} from "../retry/RetryPolicy.js";
import { executeWithTimeout } from "../timeout/TimeoutExecutor.js";
import type {
  EventPublisher,
  RetryPolicy,
  SagaDefinition,
  SagaHooks,
  SagaInstance,
  SagaRepository,
  SagaStepContext,
  SagaStepDefinition,
} from "../types/index.js";

export interface CompensationExecutorOptions<TContext extends Record<string, unknown>> {
  repository: SagaRepository;
  eventPublisher?: EventPublisher;
  hooks?: SagaHooks<TContext>;
  defaultCompensationRetry?: RetryPolicy;
}

export class CompensationExecutor<TContext extends Record<string, unknown>> {
  constructor(private readonly options: CompensationExecutorOptions<TContext>) {}

  async compensate(
    instance: SagaInstance<TContext>,
    _definition: SagaDefinition<TContext>,
    completedSteps: SagaStepDefinition<TContext>[],
    originalError: Error
  ): Promise<void> {
    const { repository, eventPublisher, hooks } = this.options;

    await repository.updateSagaStatus(instance.id, "COMPENSATING");
    await hooks?.onCompensationStart?.(instance);
    await eventPublisher?.publish({
      type: "CompensationStarted",
      sagaId: instance.id,
      sagaName: instance.name,
      timestamp: new Date(),
      payload: { error: originalError.message },
    });

    const stepsToCompensate = [...completedSteps].reverse();

    for (const step of stepsToCompensate) {
      if (!step.compensate) continue;

      const stepCtx = this.buildStepContext(instance, step.name);
      const retryPolicy =
        step.options?.compensationRetry ??
        this.options.defaultCompensationRetry ??
        defaultCompensationRetryPolicy;

      try {
        const compensateFn = async () => {
          if (step.options?.timeout) {
            return executeWithTimeout(step.compensate!, stepCtx, step.options.timeout);
          }
          return step.compensate!(stepCtx);
        };

        const patch = await withRetry(compensateFn, retryPolicy);
        if (patch) {
          instance.context = { ...instance.context, ...patch };
          await repository.updateSagaContext(instance.id, instance.context);
        }

        const steps = await repository.getSteps(instance.id);
        const stepRecord = steps.find((s) => s.stepName === step.name);
        if (stepRecord) {
          await repository.updateStepStatus(stepRecord.id, "COMPENSATED");
        }
      } catch (error) {
        const compensationError =
          error instanceof Error ? error : new Error(String(error));

        await repository.updateSagaStatus(
          instance.id,
          "COMPENSATION_FAILED",
          `Compensation failed at step "${step.name}": ${compensationError.message}. Original error: ${originalError.message}`
        );

        await hooks?.onCompensationFailed?.(instance, step, compensationError);
        await eventPublisher?.publish({
          type: "CompensationFailed",
          sagaId: instance.id,
          sagaName: instance.name,
          timestamp: new Date(),
          payload: {
            stepName: step.name,
            error: compensationError.message,
            originalError: originalError.message,
          },
        });

        throw new CompensationFailedError(
          `Compensation failed at step "${step.name}"`,
          step.name,
          instance.id
        );
      }
    }

    await repository.updateSagaStatus(instance.id, "COMPENSATED");
    await hooks?.onCompensationComplete?.(instance);
    await eventPublisher?.publish({
      type: "CompensationCompleted",
      sagaId: instance.id,
      sagaName: instance.name,
      timestamp: new Date(),
      payload: {},
    });
  }

  private buildStepContext(
    instance: SagaInstance<TContext>,
    stepName: string
  ): SagaStepContext<TContext> {
    return {
      sagaId: instance.id,
      sagaName: instance.name,
      stepName,
      idempotencyKey: `${instance.id}:${stepName}`,
      data: instance.context,
    };
  }
}
