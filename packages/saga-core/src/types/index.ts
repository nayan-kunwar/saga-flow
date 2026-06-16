export type SagaStatus =
  | "PENDING"
  | "RUNNING"
  | "COMPLETED"
  | "FAILED"
  | "COMPENSATING"
  | "COMPENSATED"
  | "COMPENSATION_FAILED";

export type StepStatus =
  | "PENDING"
  | "RUNNING"
  | "COMPLETED"
  | "FAILED"
  | "COMPENSATED";

export interface SagaStepContext<TContext extends Record<string, unknown>> {
  sagaId: string;
  sagaName: string;
  stepName: string;
  idempotencyKey: string;
  data: TContext;
  signal?: AbortSignal;
}

export type SagaAction<TContext extends Record<string, unknown>> = (
  ctx: SagaStepContext<TContext>
) => Promise<Partial<TContext> | void>;

export interface SagaStepOptions {
  timeout?: number;
  retry?: RetryPolicy;
  compensationRetry?: RetryPolicy;
}

export interface RetryPolicy {
  attempts: number;
  strategy: RetryStrategy;
}

export type RetryStrategy =
  | { type: "fixed"; delayMs: number }
  | { type: "exponential"; initialDelayMs: number; multiplier?: number; maxDelayMs?: number }
  | { type: "exponential-jitter"; initialDelayMs: number; multiplier?: number; maxDelayMs?: number };

export interface SagaStepDefinition<TContext extends Record<string, unknown>> {
  name: string;
  action: SagaAction<TContext>;
  compensate?: SagaAction<TContext>;
  options?: SagaStepOptions;
}

export interface SagaDefinition<TContext extends Record<string, unknown>> {
  name: string;
  steps: SagaStepDefinition<TContext>[];
}

export interface SagaInstance<TContext extends Record<string, unknown>> {
  id: string;
  name: string;
  status: SagaStatus;
  context: TContext;
  failureReason?: string;
  ownerId?: string;
  lockedUntil?: Date;
  heartbeatAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

export interface SagaStepRecord {
  id: string;
  sagaId: string;
  stepName: string;
  status: StepStatus;
  retries: number;
  startedAt?: Date;
  completedAt?: Date;
}

export interface SagaHooks<TContext extends Record<string, unknown>> {
  onSagaStart?: (instance: SagaInstance<TContext>) => Promise<void> | void;
  onSagaComplete?: (instance: SagaInstance<TContext>) => Promise<void> | void;
  onSagaFailed?: (instance: SagaInstance<TContext>, error: Error) => Promise<void> | void;
  onStepStart?: (instance: SagaInstance<TContext>, step: SagaStepDefinition<TContext>) => Promise<void> | void;
  onStepComplete?: (instance: SagaInstance<TContext>, step: SagaStepDefinition<TContext>) => Promise<void> | void;
  onStepFailed?: (instance: SagaInstance<TContext>, step: SagaStepDefinition<TContext>, error: Error) => Promise<void> | void;
  onCompensationStart?: (instance: SagaInstance<TContext>) => Promise<void> | void;
  onCompensationComplete?: (instance: SagaInstance<TContext>) => Promise<void> | void;
  onCompensationFailed?: (instance: SagaInstance<TContext>, step: SagaStepDefinition<TContext>, error: Error) => Promise<void> | void;
}

export interface SagaExecutionResult<TContext extends Record<string, unknown>> {
  sagaId: string;
  status: SagaStatus;
  context: TContext;
  failureReason?: string;
}

export interface SagaEvent {
  type:
    | "SagaStarted"
    | "StepStarted"
    | "StepCompleted"
    | "SagaFailed"
    | "CompensationStarted"
    | "CompensationCompleted"
    | "SagaCompleted"
    | "CompensationFailed";
  sagaId: string;
  sagaName: string;
  timestamp: Date;
  payload: Record<string, unknown>;
}

export interface EventPublisher {
  publish(event: SagaEvent): Promise<void>;
}

export interface SagaRepository {
  createSaga<TContext extends Record<string, unknown>>(
    name: string,
    context: TContext
  ): Promise<SagaInstance<TContext>>;

  getSaga<TContext extends Record<string, unknown>>(
    sagaId: string
  ): Promise<SagaInstance<TContext> | null>;

  updateSagaStatus(
    sagaId: string,
    status: SagaStatus,
    failureReason?: string
  ): Promise<void>;

  updateSagaContext<TContext extends Record<string, unknown>>(
    sagaId: string,
    context: TContext
  ): Promise<void>;

  createStep(
    sagaId: string,
    stepName: string
  ): Promise<SagaStepRecord>;

  updateStepStatus(
    stepId: string,
    status: StepStatus,
    retries?: number
  ): Promise<void>;

  getSteps(sagaId: string): Promise<SagaStepRecord[]>;

  findRunningSagas(limit?: number): Promise<SagaInstance<Record<string, unknown>>[]>;

  claimSaga?(
    sagaId: string,
    ownerId: string,
    leaseDurationMs: number
  ): Promise<boolean>;

  releaseSaga?(sagaId: string, ownerId: string): Promise<void>;

  heartbeat?(sagaId: string, ownerId: string, leaseDurationMs: number): Promise<void>;

  appendOutboxEvent?(event: SagaEvent): Promise<void>;

  getPendingOutboxEvents?(limit?: number): Promise<Array<{ id: string; event: SagaEvent }>>;

  markOutboxEventPublished?(id: string): Promise<void>;
}

export interface SagaExecutorOptions<TContext extends Record<string, unknown>> {
  repository: SagaRepository;
  registry?: SagaRegistry;
  eventPublisher?: EventPublisher;
  hooks?: SagaHooks<TContext>;
  ownerId?: string;
  defaultRetry?: RetryPolicy;
  defaultCompensationRetry?: RetryPolicy;
}

export interface SagaRegistry {
  register<TContext extends Record<string, unknown>>(
    definition: SagaDefinition<TContext>
  ): void;
  get(name: string): SagaDefinition<Record<string, unknown>> | undefined;
  has(name: string): boolean;
}
