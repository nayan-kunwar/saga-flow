export const MIGRATION_SQL = `
CREATE TABLE IF NOT EXISTS saga_instances (
  id UUID PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  status VARCHAR(50) NOT NULL,
  context JSONB NOT NULL DEFAULT '{}',
  failure_reason TEXT,
  owner_id VARCHAR(255),
  locked_until TIMESTAMPTZ,
  heartbeat_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_saga_instances_status ON saga_instances(status);
CREATE INDEX IF NOT EXISTS idx_saga_instances_locked_until ON saga_instances(locked_until);

CREATE TABLE IF NOT EXISTS saga_steps (
  id UUID PRIMARY KEY,
  saga_id UUID NOT NULL REFERENCES saga_instances(id) ON DELETE CASCADE,
  step_name VARCHAR(255) NOT NULL,
  status VARCHAR(50) NOT NULL,
  retries INTEGER NOT NULL DEFAULT 0,
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  UNIQUE(saga_id, step_name)
);

CREATE INDEX IF NOT EXISTS idx_saga_steps_saga_id ON saga_steps(saga_id);

CREATE TABLE IF NOT EXISTS saga_outbox (
  id UUID PRIMARY KEY,
  saga_id UUID NOT NULL,
  event_type VARCHAR(100) NOT NULL,
  payload JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  published_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_saga_outbox_unpublished ON saga_outbox(published_at) WHERE published_at IS NULL;
`;
