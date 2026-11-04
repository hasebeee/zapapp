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

ALTER TABLE devices ADD COLUMN IF NOT EXISTS environment TEXT NOT NULL DEFAULT 'production' CHECK (environment IN ('production', 'sandbox'));

-- Android (FCM) 対応のため platform に 'android' を許可する
ALTER TABLE devices DROP CONSTRAINT IF EXISTS devices_platform_check;
ALTER TABLE devices ADD CONSTRAINT devices_platform_check CHECK (platform IN ('ios', 'android'));

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

-- 同一owner/controllerペアの重複を防ぐ
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'relationships_owner_controller_unique'
  ) THEN
    -- 既存の重複を削除（最古のレコードを残す）
    DELETE FROM relationships WHERE id NOT IN (
      SELECT DISTINCT ON (owner_user_id, controller_user_id) id
      FROM relationships
      ORDER BY owner_user_id, controller_user_id, created_at ASC
    );
    ALTER TABLE relationships ADD CONSTRAINT relationships_owner_controller_unique
      UNIQUE (owner_user_id, controller_user_id);
  END IF;
END $$;

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
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS reminder_minutes INTEGER NOT NULL DEFAULT 5;
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS reminder_sent_at TIMESTAMPTZ;
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS zap_criteria TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS pavlok_peripheral_id TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS pavlok_token TEXT;

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

-- ──────────────────────────────────────────────
-- gifts
-- ──────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS gifts (
  id                    UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  owner_user_id         UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  controller_user_id    UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  message               TEXT NOT NULL DEFAULT '',
  status                TEXT NOT NULL CHECK (status IN ('pending', 'used')) DEFAULT 'pending',
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  used_at               TIMESTAMPTZ,
  task_id               UUID REFERENCES tasks(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_gifts_owner ON gifts(owner_user_id);
CREATE INDEX IF NOT EXISTS idx_gifts_controller ON gifts(controller_user_id);

-- ──────────────────────────────────────────────
-- routines (廃止。パッケージ機能に置き換え)
-- ──────────────────────────────────────────────
DROP TABLE IF EXISTS routines CASCADE;

-- ──────────────────────────────────────────────
-- packages
-- 複数タスク＋固定監視者＋固定時刻をまとめて作成できるショートカット
-- ──────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS packages (
  id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  owner_user_id       UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  controller_user_id  UUID REFERENCES users(id) ON DELETE SET NULL,
  title               TEXT NOT NULL,
  time_of_day         TIME NOT NULL,
  reminder_minutes    INTEGER NOT NULL DEFAULT 5,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_packages_owner ON packages(owner_user_id);

-- ──────────────────────────────────────────────
-- package_items
-- ──────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS package_items (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  package_id    UUID NOT NULL REFERENCES packages(id) ON DELETE CASCADE,
  title         TEXT NOT NULL,
  zap_criteria  TEXT,
  sort_order    INTEGER NOT NULL DEFAULT 0,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_package_items_package ON package_items(package_id);

-- ──────────────────────────────────────────────
-- location_rules
-- 指定の場所に一定時間滞在したら自動でZapする（iOSのジオフェンスで検知）
-- ──────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS location_rules (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  owner_user_id   UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title           TEXT NOT NULL,
  latitude        DOUBLE PRECISION NOT NULL CHECK (latitude BETWEEN -90 AND 90),
  longitude       DOUBLE PRECISION NOT NULL CHECK (longitude BETWEEN -180 AND 180),
  radius_meters   INTEGER NOT NULL CHECK (radius_meters BETWEEN 100 AND 1000),
  dwell_minutes   INTEGER NOT NULL CHECK (dwell_minutes BETWEEN 1 AND 720),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_location_rules_owner ON location_rules(owner_user_id);

-- ──────────────────────────────────────────────
-- location_presences
-- 1回の滞在（入ってから出るまで）。座標の履歴は保存せず、出入りの時刻のみ記録する
--   inside      : 滞在中（滞在時間をカウント中）
--   confirming  : 滞在時間に到達し、端末に現在地を確認中
--   zapped      : まだ中にいると確認できたのでZap済み
--   left        : 出た（退出通知 or 確認で外にいた）
--   unconfirmed : 確認に応答がなかった（離れた扱い）
-- ──────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS location_presences (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  rule_id         UUID NOT NULL REFERENCES location_rules(id) ON DELETE CASCADE,
  owner_user_id   UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  status          TEXT NOT NULL CHECK (status IN ('inside', 'confirming', 'zapped', 'left', 'unconfirmed')) DEFAULT 'inside',
  entered_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  check_sent_at   TIMESTAMPTZ,
  exited_at       TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_location_presences_rule ON location_presences(rule_id);
CREATE INDEX IF NOT EXISTS idx_location_presences_status ON location_presences(status);
