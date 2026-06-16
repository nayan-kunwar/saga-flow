import { randomUUID } from "node:crypto";
import type { Pool, PoolClient } from "pg";
import type {
  SagaEvent,
  SagaInstance,
  SagaRepository,
  SagaStatus,
  SagaStepRecord,
  StepStatus,
} from "@sagaflow/core";

export interface PostgresSagaRepositoryOptions {
  pool: Pool;
}

interface SagaRow {
  id: string;
  name: string;
  status: SagaStatus;
  context: Record<string, unknown>;
  failure_reason: string | null;
  owner_id: string | null;
  locked_until: Date | null;
  heartbeat_at: Date | null;
  created_at: Date;
  updated_at: Date;
}

interface StepRow {
  id: string;
  saga_id: string;
  step_name: string;
  status: StepStatus;
  retries: number;
  started_at: Date | null;
  completed_at: Date | null;
}

export class PostgresSagaRepository implements SagaRepository {
  constructor(private readonly options: PostgresSagaRepositoryOptions) {}

  get pool(): Pool {
    return this.options.pool;
  }

  async createSaga<TContext extends Record<string, unknown>>(
    name: string,
    context: TContext
  ): Promise<SagaInstance<TContext>> {
    const id = randomUUID();
    const now = new Date();
    await this.pool.query(
      `INSERT INTO saga_instances (id, name, status, context, created_at, updated_at)
       VALUES ($1, $2, 'PENDING', $3, $4, $4)`,
      [id, name, JSON.stringify(context), now]
    );
    return {
      id,
      name,
      status: "PENDING",
      context,
      createdAt: now,
      updatedAt: now,
    };
  }

  async getSaga<TContext extends Record<string, unknown>>(
    sagaId: string
  ): Promise<SagaInstance<TContext> | null> {
    const result = await this.pool.query<SagaRow>(
      `SELECT * FROM saga_instances WHERE id = $1`,
      [sagaId]
    );
    const row = result.rows[0];
    return row ? this.mapSagaRow<TContext>(row) : null;
  }

  async updateSagaStatus(
    sagaId: string,
    status: SagaStatus,
    failureReason?: string
  ): Promise<void> {
    await this.pool.query(
      `UPDATE saga_instances SET status = $2, failure_reason = $3, updated_at = NOW() WHERE id = $1`,
      [sagaId, status, failureReason ?? null]
    );
  }

  async updateSagaContext<TContext extends Record<string, unknown>>(
    sagaId: string,
    context: TContext
  ): Promise<void> {
    await this.pool.query(
      `UPDATE saga_instances SET context = $2, updated_at = NOW() WHERE id = $1`,
      [sagaId, JSON.stringify(context)]
    );
  }

  async createStep(sagaId: string, stepName: string): Promise<SagaStepRecord> {
    const id = randomUUID();
    await this.pool.query(
      `INSERT INTO saga_steps (id, saga_id, step_name, status, retries)
       VALUES ($1, $2, $3, 'PENDING', 0)
       ON CONFLICT (saga_id, step_name) DO NOTHING`,
      [id, sagaId, stepName]
    );

    const existing = await this.pool.query<StepRow>(
      `SELECT * FROM saga_steps WHERE saga_id = $1 AND step_name = $2`,
      [sagaId, stepName]
    );
    const row = existing.rows[0]!;
    return this.mapStepRow(row);
  }

  async updateStepStatus(
    stepId: string,
    status: StepStatus,
    retries?: number
  ): Promise<void> {
    const startedAt = status === "RUNNING" ? new Date() : null;
    const completedAt =
      status === "COMPLETED" || status === "FAILED" || status === "COMPENSATED"
        ? new Date()
        : null;

    if (retries !== undefined) {
      await this.pool.query(
        `UPDATE saga_steps SET status = $2, retries = $3,
         started_at = COALESCE(started_at, $4),
         completed_at = COALESCE($5, completed_at)
         WHERE id = $1`,
        [stepId, status, retries, startedAt, completedAt]
      );
    } else {
      await this.pool.query(
        `UPDATE saga_steps SET status = $2,
         started_at = COALESCE(started_at, $3),
         completed_at = COALESCE($4, completed_at)
         WHERE id = $1`,
        [stepId, status, startedAt, completedAt]
      );
    }
  }

  async getSteps(sagaId: string): Promise<SagaStepRecord[]> {
    const result = await this.pool.query<StepRow>(
      `SELECT * FROM saga_steps WHERE saga_id = $1 ORDER BY started_at NULLS LAST`,
      [sagaId]
    );
    return result.rows.map((row) => this.mapStepRow(row));
  }

  async findRunningSagas(limit = 100): Promise<SagaInstance<Record<string, unknown>>[]> {
    const result = await this.pool.query<SagaRow>(
      `SELECT * FROM saga_instances
       WHERE status = 'RUNNING'
          OR (status IN ('RUNNING', 'COMPENSATING') AND locked_until < NOW())
       ORDER BY updated_at ASC
       LIMIT $1`,
      [limit]
    );
    return result.rows.map((row) => this.mapSagaRow(row));
  }

  async claimSaga(
    sagaId: string,
    ownerId: string,
    leaseDurationMs: number
  ): Promise<boolean> {
    const lockedUntil = new Date(Date.now() + leaseDurationMs);
    const result = await this.pool.query(
      `UPDATE saga_instances
       SET owner_id = $2, locked_until = $3, heartbeat_at = NOW(), updated_at = NOW()
       WHERE id = $1
         AND (locked_until IS NULL OR locked_until < NOW() OR owner_id = $2)
       RETURNING id`,
      [sagaId, ownerId, lockedUntil]
    );
    return (result.rowCount ?? 0) > 0;
  }

  async releaseSaga(sagaId: string, ownerId: string): Promise<void> {
    await this.pool.query(
      `UPDATE saga_instances
       SET owner_id = NULL, locked_until = NULL, updated_at = NOW()
       WHERE id = $1 AND owner_id = $2`,
      [sagaId, ownerId]
    );
  }

  async heartbeat(
    sagaId: string,
    ownerId: string,
    leaseDurationMs: number
  ): Promise<void> {
    const lockedUntil = new Date(Date.now() + leaseDurationMs);
    await this.pool.query(
      `UPDATE saga_instances
       SET heartbeat_at = NOW(), locked_until = $3, updated_at = NOW()
       WHERE id = $1 AND owner_id = $2`,
      [sagaId, ownerId, lockedUntil]
    );
  }

  async appendOutboxEvent(event: SagaEvent): Promise<void> {
    await this.pool.query(
      `INSERT INTO saga_outbox (id, saga_id, event_type, payload, created_at)
       VALUES ($1, $2, $3, $4, NOW())`,
      [
        randomUUID(),
        event.sagaId,
        event.type,
        JSON.stringify({
          sagaName: event.sagaName,
          timestamp: event.timestamp,
          payload: event.payload,
        }),
      ]
    );
  }

  async getPendingOutboxEvents(limit = 100): Promise<Array<{ id: string; event: SagaEvent }>> {
    const result = await this.pool.query<{
      id: string;
      saga_id: string;
      event_type: string;
      payload: {
        sagaName: string;
        timestamp: string;
        payload: Record<string, unknown>;
      };
    }>(
      `SELECT id, saga_id, event_type, payload FROM saga_outbox
       WHERE published_at IS NULL
       ORDER BY created_at ASC
       LIMIT $1`,
      [limit]
    );

    return result.rows.map((row) => ({
      id: row.id,
      event: {
        type: row.event_type as SagaEvent["type"],
        sagaId: row.saga_id,
        sagaName: row.payload.sagaName,
        timestamp: new Date(row.payload.timestamp),
        payload: row.payload.payload,
      },
    }));
  }

  async markOutboxEventPublished(id: string): Promise<void> {
    await this.pool.query(
      `UPDATE saga_outbox SET published_at = NOW() WHERE id = $1`,
      [id]
    );
  }

  async claimOrphanedSagas(
    ownerId: string,
    leaseDurationMs: number,
    limit = 10
  ): Promise<SagaInstance<Record<string, unknown>>[]> {
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      const result = await client.query<SagaRow>(
        `SELECT * FROM saga_instances
         WHERE status IN ('RUNNING', 'COMPENSATING')
           AND (locked_until IS NULL OR locked_until < NOW())
         ORDER BY updated_at ASC
         LIMIT $1
         FOR UPDATE SKIP LOCKED`,
        [limit]
      );

      const claimed: SagaInstance<Record<string, unknown>>[] = [];
      const lockedUntil = new Date(Date.now() + leaseDurationMs);

      for (const row of result.rows) {
        await client.query(
          `UPDATE saga_instances
           SET owner_id = $2, locked_until = $3, heartbeat_at = NOW(), updated_at = NOW()
           WHERE id = $1`,
          [row.id, ownerId, lockedUntil]
        );
        claimed.push(this.mapSagaRow(row));
      }

      await client.query("COMMIT");
      return claimed;
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }

  async withTransaction<T>(fn: (client: PoolClient) => Promise<T>): Promise<T> {
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      const result = await fn(client);
      await client.query("COMMIT");
      return result;
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }

  private mapSagaRow<TContext extends Record<string, unknown>>(
    row: SagaRow
  ): SagaInstance<TContext> {
    return {
      id: row.id,
      name: row.name,
      status: row.status,
      context: (typeof row.context === "string"
        ? JSON.parse(row.context)
        : row.context) as TContext,
      failureReason: row.failure_reason ?? undefined,
      ownerId: row.owner_id ?? undefined,
      lockedUntil: row.locked_until ?? undefined,
      heartbeatAt: row.heartbeat_at ?? undefined,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }

  private mapStepRow(row: StepRow): SagaStepRecord {
    return {
      id: row.id,
      sagaId: row.saga_id,
      stepName: row.step_name,
      status: row.status,
      retries: row.retries,
      startedAt: row.started_at ?? undefined,
      completedAt: row.completed_at ?? undefined,
    };
  }
}

export async function runMigrations(pool: Pool): Promise<void> {
  const { MIGRATION_SQL } = await import("@sagaflow/persistence");
  await pool.query(MIGRATION_SQL);
}
