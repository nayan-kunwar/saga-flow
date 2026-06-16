import { describe, it, expect } from "vitest";
import {
  fixedDelay,
  exponentialBackoff,
  exponentialBackoffWithJitter,
  calculateDelay,
  SagaTimeoutError,
  Saga,
  InMemorySagaRepository,
} from "../index.js";

describe("Retry strategies", () => {
  it("calculates fixed delay", () => {
    expect(calculateDelay(fixedDelay(500), 1)).toBe(500);
    expect(calculateDelay(fixedDelay(500), 3)).toBe(500);
  });

  it("calculates exponential backoff", () => {
    const strategy = exponentialBackoff({ initialDelayMs: 1000, multiplier: 2 });
    expect(calculateDelay(strategy, 1)).toBe(1000);
    expect(calculateDelay(strategy, 2)).toBe(2000);
    expect(calculateDelay(strategy, 3)).toBe(4000);
  });

  it("calculates exponential jitter within bounds", () => {
    const strategy = exponentialBackoffWithJitter({ initialDelayMs: 1000 });
    const delay = calculateDelay(strategy, 2);
    expect(delay).toBeGreaterThanOrEqual(0);
    expect(delay).toBeLessThanOrEqual(2000);
  });
});

describe("Timeout", () => {
  it("times out slow steps", async () => {
    const repository = new InMemorySagaRepository();

    const result = await Saga.create<{ orderId: string }>(
      "timeout-saga",
      { orderId: "t1" },
      { repository }
    )
      .step(
        "slow-step",
        async (ctx) => {
          await new Promise((r) => setTimeout(r, 200));
          return {};
        },
        undefined,
        { timeout: 50 }
      )
      .execute();

    expect(result.status).toBe("COMPENSATED");
  }, 10_000);
});
