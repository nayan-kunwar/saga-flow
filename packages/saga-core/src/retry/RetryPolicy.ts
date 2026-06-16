import type { RetryPolicy, RetryStrategy } from "../types/index.js";

export function calculateDelay(strategy: RetryStrategy, attempt: number): number {
  switch (strategy.type) {
    case "fixed":
      return strategy.delayMs;
    case "exponential": {
      const multiplier = strategy.multiplier ?? 2;
      const maxDelay = strategy.maxDelayMs ?? 60_000;
      const delay = strategy.initialDelayMs * Math.pow(multiplier, attempt - 1);
      return Math.min(delay, maxDelay);
    }
    case "exponential-jitter": {
      const multiplier = strategy.multiplier ?? 2;
      const maxDelay = strategy.maxDelayMs ?? 60_000;
      const base = strategy.initialDelayMs * Math.pow(multiplier, attempt - 1);
      const capped = Math.min(base, maxDelay);
      return Math.floor(Math.random() * capped);
    }
    default:
      return 1000;
  }
}

export async function withRetry<T>(
  fn: () => Promise<T>,
  policy: RetryPolicy,
  shouldRetry: (error: unknown, attempt: number) => boolean = () => true
): Promise<T> {
  let lastError: unknown;

  for (let attempt = 1; attempt <= policy.attempts; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;
      if (attempt >= policy.attempts || !shouldRetry(error, attempt)) {
        throw error;
      }
      const delay = calculateDelay(policy.strategy, attempt);
      await sleep(delay);
    }
  }

  throw lastError;
}

export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export const defaultRetryPolicy: RetryPolicy = {
  attempts: 3,
  strategy: { type: "exponential", initialDelayMs: 1000 },
};

export const defaultCompensationRetryPolicy: RetryPolicy = {
  attempts: 5,
  strategy: { type: "exponential-jitter", initialDelayMs: 500 },
};
