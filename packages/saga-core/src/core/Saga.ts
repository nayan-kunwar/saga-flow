import { SagaBuilder } from "../builder/SagaBuilder.js";
import { InMemorySagaRepository } from "../adapters/memory/InMemorySagaRepository.js";
import { DefaultSagaRegistry } from "../registry/SagaRegistry.js";
import { SagaExecutor } from "./SagaExecutor.js";
import type {
  EventPublisher,
  SagaAction,
  SagaDefinition,
  SagaExecutionResult,
  SagaHooks,
  SagaRepository,
  SagaRegistry,
  SagaStepOptions,
} from "../types/index.js";

export interface SagaRunOptions<TContext extends Record<string, unknown>> {
  repository?: SagaRepository;
  registry?: SagaRegistry;
  eventPublisher?: EventPublisher;
  hooks?: SagaHooks<TContext>;
  ownerId?: string;
}

class SagaRunner<TContext extends Record<string, unknown>> {
  private readonly builder: SagaBuilder<TContext>;

  constructor(
    name: string,
    context: TContext,
    private readonly options: SagaRunOptions<TContext> = {}
  ) {
    this.builder = new SagaBuilder(name, context);
  }

  step(
    name: string,
    action: SagaAction<TContext>,
    compensate?: SagaAction<TContext>,
    options?: SagaStepOptions
  ): SagaRunner<TContext> {
    this.builder.step(name, action, compensate, options);
    return this;
  }

  async execute(): Promise<SagaExecutionResult<TContext>> {
    const definition = this.builder.build();
    const repository = this.options.repository ?? new InMemorySagaRepository();
    const executor = new SagaExecutor<TContext>({
      repository,
      registry: this.options.registry,
      eventPublisher: this.options.eventPublisher,
      hooks: this.options.hooks,
      ownerId: this.options.ownerId,
    });
    return executor.execute(definition, this.builder.getContext());
  }

  define(): SagaDefinition<TContext> {
    return this.builder.build();
  }
}

export class Saga {
  static create<TContext extends Record<string, unknown>>(
    name: string,
    context: TContext,
    options?: SagaRunOptions<TContext>
  ): SagaRunner<TContext> {
    return new SagaRunner(name, context, options);
  }

  static define<TContext extends Record<string, unknown>>(
    name: string,
    context: TContext
  ): SagaRunner<TContext> {
    return new SagaRunner(name, context);
  }

  static register<TContext extends Record<string, unknown>>(
    registry: SagaRegistry,
    definition: SagaDefinition<TContext>
  ): void {
    registry.register(definition);
  }

  static async run<TContext extends Record<string, unknown>>(
    definition: SagaDefinition<TContext>,
    context: TContext,
    options: SagaRunOptions<TContext> = {}
  ): Promise<SagaExecutionResult<TContext>> {
    const repository = options.repository ?? new InMemorySagaRepository();
    const executor = new SagaExecutor<TContext>({
      repository,
      registry: options.registry,
      eventPublisher: options.eventPublisher,
      hooks: options.hooks,
      ownerId: options.ownerId,
    });
    return executor.execute(definition, context);
  }
}

export { DefaultSagaRegistry };
