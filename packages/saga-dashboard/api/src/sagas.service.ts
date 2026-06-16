import { Inject, Injectable } from "@nestjs/common";
import { Pool } from "pg";

export interface SagaListItem {
  id: string;
  name: string;
  status: string;
  failureReason?: string;
  createdAt: string;
  updatedAt: string;
  currentStep?: string;
  executionTimeMs?: number;
  totalRetries: number;
}

export interface SagaDetail extends SagaListItem {
  context: Record<string, unknown>;
  steps: Array<{
    id: string;
    stepName: string;
    status: string;
    retries: number;
    startedAt?: string;
    completedAt?: string;
  }>;
}

@Injectable()
export class SagasService {
  constructor(@Inject(Pool) private readonly pool: Pool) {}

  async listSagas(limit = 50): Promise<SagaListItem[]> {
    const result = await this.pool.query(
      `SELECT si.*,
        (SELECT step_name FROM saga_steps ss
         WHERE ss.saga_id = si.id AND ss.status = 'RUNNING' LIMIT 1) as current_step,
        (SELECT COALESCE(SUM(retries), 0) FROM saga_steps ss WHERE ss.saga_id = si.id) as total_retries
       FROM saga_instances si
       ORDER BY si.updated_at DESC
       LIMIT $1`,
      [limit]
    );

    return result.rows.map((row: Record<string, unknown>) => ({
      id: row.id as string,
      name: row.name as string,
      status: row.status as string,
      failureReason: (row.failure_reason as string | null) ?? undefined,
      createdAt: (row.created_at as Date).toISOString(),
      updatedAt: (row.updated_at as Date).toISOString(),
      currentStep: (row.current_step as string | null) ?? undefined,
      executionTimeMs:
        (row.updated_at as Date).getTime() - (row.created_at as Date).getTime(),
      totalRetries: Number(row.total_retries),
    }));
  }

  async getSaga(id: string): Promise<SagaDetail | null> {
    const sagaResult = await this.pool.query(
      `SELECT * FROM saga_instances WHERE id = $1`,
      [id]
    );
    const saga = sagaResult.rows[0];
    if (!saga) return null;

    const stepsResult = await this.pool.query(
      `SELECT * FROM saga_steps WHERE saga_id = $1 ORDER BY started_at NULLS LAST`,
      [id]
    );

    const currentStep = stepsResult.rows.find(
      (s: { status: string }) => s.status === "RUNNING"
    );

    return {
      id: saga.id,
      name: saga.name,
      status: saga.status,
      failureReason: saga.failure_reason ?? undefined,
      createdAt: saga.created_at.toISOString(),
      updatedAt: saga.updated_at.toISOString(),
      currentStep: currentStep?.step_name,
      executionTimeMs: saga.updated_at.getTime() - saga.created_at.getTime(),
      totalRetries: stepsResult.rows.reduce(
        (sum: number, s: { retries: number }) => sum + s.retries,
        0
      ),
      context:
        typeof saga.context === "string" ? JSON.parse(saga.context) : saga.context,
      steps: stepsResult.rows.map((s: Record<string, unknown>) => ({
        id: s.id as string,
        stepName: s.step_name as string,
        status: s.status as string,
        retries: s.retries as number,
        startedAt: (s.started_at as Date | null)?.toISOString(),
        completedAt: (s.completed_at as Date | null)?.toISOString(),
      })),
    };
  }
}
