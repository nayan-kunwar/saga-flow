import { CompensationExecutor } from "../compensation/CompensationExecutor.js";
import { isNonRetryableError } from "../errors/index.js";
import {
  defaultCompensationRetryPolicy,
  defaultRetryPolicy,
  withRetry,
} from "../retry/RetryPolicy.js";
import { executeWithTimeout } from "../timeout/TimeoutExecutor.js";
import type {
  SagaDefinition,
  SagaExecutionResult,
  SagaExecutorOptions,
  SagaInstance,
  SagaStepContext,
  SagaStepDefinition,
} from "../types/index.js";

export class SagaExecutor<TContext extends Record<string, unknown>> {
  private readonly compensationExecutor: CompensationExecutor<TContext>;

  constructor(private readonly options: SagaExecutorOptions<TContext>) {
    this.compensationExecutor = new CompensationExecutor(options);
  }

  async execute(
    definition: SagaDefinition<TContext>,
    context: TContext,
    existingSagaId?: string
  ): Promise<SagaExecutionResult<TContext>> {
    const { repository, eventPublisher, hooks } = this.options;

    let instance: SagaInstance<TContext>;

    if (existingSagaId) {
      const existing = await repository.getSaga<TContext>(existingSagaId);
      if (!existing) {
        throw new Error(`Saga ${existingSagaId} not found for resume`);
      }
      instance = existing;
      if (instance.name !== definition.name) {
        throw new Error(
          `Saga name mismatch: expected "${definition.name}", got "${instance.name}"`
        );
      }
    } else {
      instance = await repository.createSaga(definition.name, context);
    }

    await repository.updateSagaStatus(instance.id, "RUNNING");
    await hooks?.onSagaStart?.(instance);
    await this.publishEvent(eventPublisher, {
      type: "SagaStarted",
      sagaId: instance.id,
      sagaName: instance.name,
      timestamp: new Date(),
      payload: { context: instance.context },
    });
    await this.appendOutbox(repository, {
      type: "SagaStarted",
      sagaId: instance.id,
      sagaName: instance.name,
      timestamp: new Date(),
      payload: { context: instance.context },
    });

    const completedSteps: SagaStepDefinition<TContext>[] = [];
    const existingSteps = await repository.getSteps(instance.id);
    const completedStepNames = new Set(
      existingSteps
        .filter((s) => s.status === "COMPLETED" || s.status === "COMPENSATED")
        .map((s) => s.stepName)
    );

    for (const step of definition.steps) {
      if (completedStepNames.has(step.name)) {
        completedSteps.push(step);
        continue;
      }

      const runningStep = existingSteps.find(
        (s) => s.stepName === step.name && s.status === "RUNNING"
      );
      const stepRecord = runningStep ?? (await repository.createStep(instance.id, step.name));

      await repository.updateStepStatus(stepRecord.id, "RUNNING");
      await hooks?.onStepStart?.(instance, step);
      await this.publishEvent(eventPublisher, {
        type: "StepStarted",
        sagaId: instance.id,
        sagaName: instance.name,
        timestamp: new Date(),
        payload: { stepName: step.name },
      });
      await this.appendOutbox(repository, {
        type: "StepStarted",
        sagaId: instance.id,
        sagaName: instance.name,
        timestamp: new Date(),
        payload: { stepName: step.name },
      });

      try {
        const patch = await this.executeStep(instance, step);
        if (patch) {
          instance.context = { ...instance.context, ...patch };
          await repository.updateSagaContext(instance.id, instance.context);
        }

        await repository.updateStepStatus(stepRecord.id, "COMPLETED");
        completedSteps.push(step);

        await hooks?.onStepComplete?.(instance, step);
        await this.publishEvent(eventPublisher, {
          type: "StepCompleted",
          sagaId: instance.id,
          sagaName: instance.name,
          timestamp: new Date(),
          payload: { stepName: step.name },
        });
        await this.appendOutbox(repository, {
          type: "StepCompleted",
          sagaId: instance.id,
          sagaName: instance.name,
          timestamp: new Date(),
          payload: { stepName: step.name },
        });
      } catch (error) {
        const stepError = error instanceof Error ? error : new Error(String(error));

        await repository.updateStepStatus(stepRecord.id, "FAILED");
        await repository.updateSagaStatus(instance.id, "FAILED", stepError.message);
        await hooks?.onStepFailed?.(instance, step, stepError);
        await this.publishEvent(eventPublisher, {
          type: "SagaFailed",
          sagaId: instance.id,
          sagaName: instance.name,
          timestamp: new Date(),
          payload: { stepName: step.name, error: stepError.message },
        });
        await this.appendOutbox(repository, {
          type: "SagaFailed",
          sagaId: instance.id,
          sagaName: instance.name,
          timestamp: new Date(),
          payload: { stepName: step.name, error: stepError.message },
        });

        try {
          await this.compensationExecutor.compensate(
            instance,
            definition,
            completedSteps,
            stepError
          );
        } catch (compError) {
          const updated = await repository.getSaga<TContext>(instance.id);
          return {
            sagaId: instance.id,
            status: updated?.status ?? "COMPENSATION_FAILED",
            context: updated?.context ?? instance.context,
            failureReason: updated?.failureReason ?? stepError.message,
          };
        }

        const updated = await repository.getSaga<TContext>(instance.id);
        return {
          sagaId: instance.id,
          status: updated?.status ?? "COMPENSATED",
          context: updated?.context ?? instance.context,
          failureReason: updated?.failureReason ?? stepError.message,
        };
      }
    }

    await repository.updateSagaStatus(instance.id, "COMPLETED");
    await hooks?.onSagaComplete?.(instance);
    await this.publishEvent(eventPublisher, {
      type: "SagaCompleted",
      sagaId: instance.id,
      sagaName: instance.name,
      timestamp: new Date(),
      payload: {},
    });
    await this.appendOutbox(repository, {
      type: "SagaCompleted",
      sagaId: instance.id,
      sagaName: instance.name,
      timestamp: new Date(),
      payload: {},
    });

    return {
      sagaId: instance.id,
      status: "COMPLETED",
      context: instance.context,
    };
  }

  async resume(
    sagaId: string,
    definition: SagaDefinition<TContext>
  ): Promise<SagaExecutionResult<TContext>> {
    const instance = await this.options.repository.getSaga<TContext>(sagaId);
    if (!instance) {
      throw new Error(`Saga ${sagaId} not found`);
    }
    return this.execute(definition, instance.context, sagaId);
  }

  private async executeStep(
    instance: SagaInstance<TContext>,
    step: SagaStepDefinition<TContext>
  ): Promise<Partial<TContext> | void> {
    const stepCtx = this.buildStepContext(instance, step.name);
    const retryPolicy =
      step.options?.retry ??
      this.options.defaultRetry ??
      defaultRetryPolicy;

    const runAction = async () => {
      if (step.options?.timeout) {
        return executeWithTimeout(step.action, stepCtx, step.options.timeout);
      }
      return step.action(stepCtx);
    };

    return withRetry(runAction, retryPolicy, (error) => !isNonRetryableError(error));
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

  private async publishEvent(
    publisher: SagaExecutorOptions<TContext>["eventPublisher"],
    event: Parameters<NonNullable<SagaExecutorOptions<TContext>["eventPublisher"]>["publish"]>[0]
  ): Promise<void> {
    if (publisher) await publisher.publish(event);
  }

  private async appendOutbox(
    repository: SagaExecutorOptions<TContext>["repository"],
    event: Parameters<NonNullable<SagaExecutorOptions<TContext>["repository"]["appendOutboxEvent"]>>[0]
  ): Promise<void> {
    if (repository.appendOutboxEvent) {
      await repository.appendOutboxEvent(event);
    }
  }
}

export { defaultRetryPolicy, defaultCompensationRetryPolicy };
