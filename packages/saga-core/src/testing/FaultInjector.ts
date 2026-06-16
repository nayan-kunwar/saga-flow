export type FaultInjectionPoint =
  | "before_step_running"
  | "after_step_action"
  | "before_step_completed"
  | "before_compensation"
  | "after_compensation_step";

export interface FaultInjector {
  shouldCrashAt(point: FaultInjectionPoint, stepName?: string): boolean;
  onCrash?(point: FaultInjectionPoint, stepName?: string): void;
}

export class ConfigurableFaultInjector implements FaultInjector {
  private readonly crashPoints = new Set<string>();

  crashAt(point: FaultInjectionPoint, stepName?: string): this {
    this.crashPoints.add(this.key(point, stepName));
    return this;
  }

  shouldCrashAt(point: FaultInjectionPoint, stepName?: string): boolean {
    return (
      this.crashPoints.has(this.key(point, stepName)) ||
      this.crashPoints.has(this.key(point))
    );
  }

  private key(point: FaultInjectionPoint, stepName?: string): string {
    return stepName ? `${point}:${stepName}` : point;
  }
}
