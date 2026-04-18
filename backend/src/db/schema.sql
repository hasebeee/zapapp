-- ZapApp Database Schema

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ──────────────────────────────────────────────
-- users
-- ──────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS users (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  email           TEXT NOT NULL UNIQUE,
  display_name    TEXT NOT NULL DEFAULT '',
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_login_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ──────────────────────────────────────────────
-- devices
-- ──────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS devices (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id       UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  platform      TEXT NOT NULL CHECK (platform = 'ios'),
  push_token    TEXT NOT NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_seen_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_devices_user_id ON devices(user_id);

-- ──────────────────────────────────────────────
-- relationships
-- ──────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS relationships (
  id                    UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  owner_user_id         UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  controller_user_id    UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  status                TEXT NOT NULL CHECK (status IN ('active', 'blocked')) DEFAULT 'active',
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  blocked_at            TIMESTAMPTZ,
  blocked_by_user_id    UUID REFERENCES users(id)
);

CREATE INDEX IF NOT EXISTS idx_relationships_owner ON relationships(owner_user_id);
CREATE INDEX IF NOT EXISTS idx_relationships_controller ON relationships(controller_user_id);

-- ──────────────────────────────────────────────
-- invites
-- ──────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS invites (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  owner_user_id   UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  invitee_email   TEXT NOT NULL,
  token           TEXT NOT NULL UNIQUE,
  status          TEXT NOT NULL CHECK (status IN ('pending', 'accepted', 'expired', 'revoked')) DEFAULT 'pending',
  expires_at      TIMESTAMPTZ NOT NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  accepted_at     TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_invites_owner ON invites(owner_user_id);
CREATE INDEX IF NOT EXISTS idx_invites_token ON invites(token);

-- ──────────────────────────────────────────────
-- tasks
-- ──────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS tasks (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  owner_user_id   UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title           TEXT NOT NULL,
  due_at          TIMESTAMPTZ NOT NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  closed_at       TIMESTAMPTZ,
  status          TEXT NOT NULL CHECK (status IN ('scheduled', 'readyToZap', 'waitingAck', 'readyToReZap', 'closed')) DEFAULT 'scheduled'
);

ALTER TABLE tasks ADD COLUMN IF NOT EXISTS controller_user_id UUID REFERENCES users(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_tasks_owner ON tasks(owner_user_id);
CREATE INDEX IF NOT EXISTS idx_tasks_status ON tasks(status);
CREATE INDEX IF NOT EXISTS idx_tasks_controller ON tasks(controller_user_id);

-- ──────────────────────────────────────────────
-- zap_requests
-- ──────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS zap_requests (
  id                    UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  task_id               UUID NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  owner_user_id         UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  controller_user_id    UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  ack_deadline_at       TIMESTAMPTZ NOT NULL,
  status                TEXT NOT NULL CHECK (status IN ('created', 'executed', 'not_started', 'acknowledged', 'expired')) DEFAULT 'created',
  attempted_zaps        INTEGER NOT NULL DEFAULT 0,
  succeeded_zaps        INTEGER NOT NULL DEFAULT 0,
  last_error_code       TEXT CHECK (last_error_code IN ('BLE_NOT_CONNECTED', 'BLE_TIMEOUT', 'PUSH_NOT_DELIVERED', 'DEVICE_OFFLINE', 'UNKNOWN')),
  last_error_message    TEXT
);

CREATE INDEX IF NOT EXISTS idx_zap_requests_task ON zap_requests(task_id);
CREATE INDEX IF NOT EXISTS idx_zap_requests_owner ON zap_requests(owner_user_id);
CREATE INDEX IF NOT EXISTS idx_zap_requests_status ON zap_requests(status);

-- ──────────────────────────────────────────────
-- ack_events
-- ──────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS ack_events (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  zap_request_id  UUID NOT NULL REFERENCES zap_requests(id) ON DELETE CASCADE,
  owner_user_id   UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ack_events_zap_request ON ack_events(zap_request_id);
