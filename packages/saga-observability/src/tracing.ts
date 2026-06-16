import { trace, SpanStatusCode, type Tracer } from "@opentelemetry/api";
import type { SagaHooks, SagaInstance } from "@sagaflow/core";

const TRACER_NAME = "sagaflow";

export function createTracingHooks<
  TContext extends Record<string, unknown>
>(): SagaHooks<TContext> {
  const tracer: Tracer = trace.getTracer(TRACER_NAME);

  return {
    onSagaStart(instance) {
      const span = tracer.startSpan(`saga.${instance.name}`, {
        attributes: {
          "saga.id": instance.id,
          "saga.name": instance.name,
          "saga.status": instance.status,
        },
      });
      span.end();
    },

    onStepStart(instance, step) {
      const span = tracer.startSpan(`saga.step.${step.name}`, {
        attributes: {
          "saga.id": instance.id,
          "saga.step.name": step.name,
        },
      });
      (instance as SagaInstance<TContext> & { _currentSpan?: ReturnType<Tracer["startSpan"]> })._currentSpan = span;
    },

    onStepComplete(instance, _step) {
      const span = (instance as SagaInstance<TContext> & { _currentSpan?: ReturnType<Tracer["startSpan"]> })._currentSpan;
      if (span) {
        span.setAttribute("saga.step.status", "completed");
        span.end();
      }
    },

    onStepFailed(instance, _step, error) {
      const span = (instance as SagaInstance<TContext> & { _currentSpan?: ReturnType<Tracer["startSpan"]> })._currentSpan;
      if (span) {
        span.recordException(error);
        span.setStatus({ code: SpanStatusCode.ERROR, message: error.message });
        span.end();
      }
    },

    onCompensationStart(instance) {
      tracer.startSpan(`saga.${instance.name}.compensation`, {
        attributes: { "saga.id": instance.id },
      }).end();
    },
  };
}

export { trace, TRACER_NAME };
