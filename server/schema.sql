-- CockroachDB-compatible schema (no Prisma)
CREATE TABLE IF NOT EXISTS users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  username STRING UNIQUE NOT NULL,
  name STRING NOT NULL,
  password_hash STRING NOT NULL,
  role STRING NOT NULL DEFAULT 'USER',
  last_login_at TIMESTAMPTZ NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS sleep_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  date STRING NOT NULL,
  start STRING NOT NULL,
  "end" STRING NOT NULL,
  fatigue INT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_sleep_user_date ON sleep_logs(user_id, date);

CREATE TABLE IF NOT EXISTS schedule_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  date STRING NOT NULL,
  start STRING NOT NULL,
  "end" STRING NOT NULL,
  title STRING NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_sched_user_date ON schedule_items(user_id, date);
