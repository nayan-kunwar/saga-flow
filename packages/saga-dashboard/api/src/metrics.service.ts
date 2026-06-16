import { Inject, Injectable, OnModuleInit } from "@nestjs/common";
import { Pool } from "pg";
import { Counter, Gauge, Registry, collectDefaultMetrics } from "prom-client";

@Injectable()
export class MetricsService implements OnModuleInit {
  readonly registry = new Registry();
  private readonly sagaTotal!: Gauge<string>;
  private readonly sagaByStatus!: Gauge<string>;

  constructor(@Inject(Pool) private readonly pool: Pool) {
    collectDefaultMetrics({ register: this.registry });

    this.sagaTotal = new Gauge({
      name: "sagaflow_sagas_total",
      help: "Total number of saga instances",
      registers: [this.registry],
    });

    this.sagaByStatus = new Gauge({
      name: "sagaflow_sagas_by_status",
      help: "Saga instances grouped by status",
      labelNames: ["status"],
      registers: [this.registry],
    });

    new Counter({
      name: "sagaflow_saga_executions_total",
      help: "Total saga executions observed",
      registers: [this.registry],
    });
  }

  async onModuleInit() {
    await this.refreshMetrics();
    setInterval(() => this.refreshMetrics().catch(console.error), 10_000);
  }

  async refreshMetrics(): Promise<void> {
    const result = await this.pool.query(
      `SELECT status, COUNT(*)::int as count FROM saga_instances GROUP BY status`
    );

    const total = result.rows.reduce(
      (sum: number, r: { count: number }) => sum + r.count,
      0
    );
    this.sagaTotal.set(total);

    for (const row of result.rows) {
      this.sagaByStatus.set({ status: row.status }, row.count);
    }
  }

  async getMetrics(): Promise<string> {
    await this.refreshMetrics();
    return this.registry.metrics();
  }
}
