import type {
  SagaAction,
  SagaDefinition,
  SagaStepDefinition,
  SagaStepOptions,
} from "../types/index.js";

export class SagaBuilder<TContext extends Record<string, unknown>> {
  private readonly steps: SagaStepDefinition<TContext>[] = [];

  constructor(
    private readonly name: string,
    private readonly initialContext: TContext
  ) {}

  step(
    name: string,
    action: SagaAction<TContext>,
    compensate?: SagaAction<TContext>,
    options?: SagaStepOptions
  ): SagaBuilder<TContext> {
    this.steps.push({
      name,
      action,
      compensate,
      options,
    });
    return this;
  }

  build(): SagaDefinition<TContext> {
    if (this.steps.length === 0) {
      throw new Error(`Saga "${this.name}" must have at least one step`);
    }
    return {
      name: this.name,
      steps: [...this.steps],
    };
  }

  getContext(): TContext {
    return { ...this.initialContext };
  }

  getName(): string {
    return this.name;
  }
}
