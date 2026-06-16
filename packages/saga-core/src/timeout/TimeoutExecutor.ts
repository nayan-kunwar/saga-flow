import { SagaTimeoutError } from "../errors/index.js";
import type { SagaAction, SagaStepContext } from "../types/index.js";

export async function executeWithTimeout<TContext extends Record<string, unknown>>(
  action: SagaAction<TContext>,
  ctx: SagaStepContext<TContext>,
  timeoutMs: number
): Promise<Partial<TContext> | void> {
  const controller = new AbortController();
  const ctxWithSignal: SagaStepContext<TContext> = {
    ...ctx,
    signal: controller.signal,
  };

  let timeoutId: ReturnType<typeof setTimeout> | undefined;

  const timeoutPromise = new Promise<never>((_, reject) => {
    timeoutId = setTimeout(() => {
      controller.abort();
      reject(
        new SagaTimeoutError(
          `Step "${ctx.stepName}" timed out after ${timeoutMs}ms`,
          ctx.sagaId,
          ctx.stepName
        )
      );
    }, timeoutMs);
  });

  try {
    return await Promise.race([
      action(ctxWithSignal),
      timeoutPromise,
    ]);
  } finally {
    if (timeoutId) clearTimeout(timeoutId);
  }
}
