import type { SagaDefinition } from "../types/index.js";

export class DefaultSagaRegistry {
  private readonly definitions = new Map<string, SagaDefinition<Record<string, unknown>>>();

  register<TContext extends Record<string, unknown>>(
    definition: SagaDefinition<TContext>
  ): void {
    if (this.definitions.has(definition.name)) {
      throw new Error(`Saga definition "${definition.name}" is already registered`);
    }
    this.definitions.set(
      definition.name,
      definition as SagaDefinition<Record<string, unknown>>
    );
  }

  get(name: string): SagaDefinition<Record<string, unknown>> | undefined {
    return this.definitions.get(name);
  }

  has(name: string): boolean {
    return this.definitions.has(name);
  }
}
