import type { RetryPolicy, RetryStrategy } from "../types/index.js";

export function fixedDelay(delayMs: number): RetryStrategy {
  return { type: "fixed", delayMs };
}

export function exponentialBackoff(options: {
  initialDelayMs: number;
  multiplier?: number;
  maxDelayMs?: number;
}): RetryStrategy {
  return {
    type: "exponential",
    initialDelayMs: options.initialDelayMs,
    multiplier: options.multiplier,
    maxDelayMs: options.maxDelayMs,
  };
}

export function exponentialBackoffWithJitter(options: {
  initialDelayMs: number;
  multiplier?: number;
  maxDelayMs?: number;
}): RetryStrategy {
  return {
    type: "exponential-jitter",
    initialDelayMs: options.initialDelayMs,
    multiplier: options.multiplier,
    maxDelayMs: options.maxDelayMs,
  };
}

export function retry(policy: Partial<RetryPolicy> & { strategy: RetryStrategy }): RetryPolicy {
  return {
    attempts: policy.attempts ?? 3,
    strategy: policy.strategy,
  };
}
