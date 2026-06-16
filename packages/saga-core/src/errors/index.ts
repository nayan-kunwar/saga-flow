export class SagaError extends Error {
  constructor(
    message: string,
    public readonly sagaId?: string,
    public readonly stepName?: string
  ) {
    super(message);
    this.name = "SagaError";
  }
}

export class NonRetryableError extends SagaError {
  constructor(
    message: string,
    sagaId?: string,
    stepName?: string
  ) {
    super(message, sagaId, stepName);
    this.name = "NonRetryableError";
  }
}

export class CompensationFailedError extends SagaError {
  constructor(
    message: string,
    public readonly failedStepName: string,
    sagaId?: string
  ) {
    super(message, sagaId, failedStepName);
    this.name = "CompensationFailedError";
  }
}

export class SagaTimeoutError extends SagaError {
  constructor(
    message: string,
    sagaId?: string,
    stepName?: string
  ) {
    super(message, sagaId, stepName);
    this.name = "SagaTimeoutError";
  }
}

export function isNonRetryableError(error: unknown): boolean {
  return error instanceof NonRetryableError;
}
