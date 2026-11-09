CREATE EXTENSION IF NOT EXISTS btree_gist;

CREATE TABLE IF NOT EXISTS roles (
  id        SMALLSERIAL PRIMARY KEY,
  role_name VARCHAR(20) NOT NULL UNIQUE CHECK (role_name IN ('admin','cr_rl','student'))
);
INSERT INTO roles (role_name) VALUES ('admin'),('cr_rl'),('student') ON CONFLICT DO NOTHING;

CREATE TABLE IF NOT EXISTS users (
  id                   SERIAL PRIMARY KEY,
  full_name            VARCHAR(120) NOT NULL,
  email                VARCHAR(255) NOT NULL UNIQUE CHECK (email = lower(email)),
  password_hash        TEXT NOT NULL,
  role_id              SMALLINT NOT NULL REFERENCES roles(id),
  is_active            BOOLEAN NOT NULL DEFAULT TRUE,
  booking_access       BOOLEAN NOT NULL DEFAULT FALSE,  -- set by admin approval (CR/RL only)
  must_change_password BOOLEAN NOT NULL DEFAULT FALSE,
  created_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at           TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS grounds (
  id          SERIAL PRIMARY KEY,
  name        VARCHAR(60) NOT NULL UNIQUE,
  ground_type VARCHAR(20) NOT NULL CHECK (ground_type IN ('football','basketball','volleyball')),
  is_active   BOOLEAN NOT NULL DEFAULT TRUE
);
INSERT INTO grounds (name, ground_type) VALUES
  ('Football Ground','football'),
  ('Basketball Court','basketball'),
  ('Volleyball Court','volleyball')
ON CONFLICT (name) DO NOTHING;

CREATE TABLE IF NOT EXISTS access_requests (
  id            SERIAL PRIMARY KEY,
  user_id       INTEGER NOT NULL REFERENCES users(id),
  note          VARCHAR(500),
  status        VARCHAR(10) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','rejected')),
  requested_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  decided_by    INTEGER REFERENCES users(id),
  decided_at    TIMESTAMPTZ,
  decision_note VARCHAR(500)
);
CREATE UNIQUE INDEX IF NOT EXISTS one_pending_request_per_user
  ON access_requests (user_id) WHERE status = 'pending';

CREATE TABLE IF NOT EXISTS schedules (
  id         SERIAL PRIMARY KEY,
  ground_id  INTEGER NOT NULL REFERENCES grounds(id),
  start_time TIMESTAMPTZ NOT NULL,
  end_time   TIMESTAMPTZ NOT NULL,
  status     VARCHAR(10) NOT NULL DEFAULT 'open' CHECK (status IN ('open','closed')),
  created_by INTEGER NOT NULL REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at TIMESTAMPTZ,                 -- set when the admin deletes it (row kept for booking history)
  CONSTRAINT schedules_time_order CHECK (end_time > start_time),
  CONSTRAINT schedules_no_overlap EXCLUDE USING gist (
    ground_id WITH =,
    tstzrange(start_time, end_time, '[)') WITH &&
  ) WHERE (status = 'open')
);

CREATE TABLE IF NOT EXISTS bookings (
  id              SERIAL PRIMARY KEY,
  ground_id       INTEGER NOT NULL REFERENCES grounds(id),
  schedule_id     INTEGER REFERENCES schedules(id),
  booked_by       INTEGER REFERENCES users(id),
  source_type     VARCHAR(10) NOT NULL CHECK (source_type IN ('cr_rl','staff','outsider')),
  booker_name     VARCHAR(120) NOT NULL,
  booker_contact  VARCHAR(120),
  start_time      TIMESTAMPTZ NOT NULL,
  end_time        TIMESTAMPTZ NOT NULL,
  status          VARCHAR(10) NOT NULL DEFAULT 'confirmed',
  created_by      INTEGER NOT NULL REFERENCES users(id),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  cancelled_by    INTEGER REFERENCES users(id),
  cancelled_at    TIMESTAMPTZ,
  cancel_reason   VARCHAR(300),
  decided_by      INTEGER REFERENCES users(id),   -- admin who approved/rejected a request
  decided_at      TIMESTAMPTZ,
  decision_note   VARCHAR(300),
  CONSTRAINT bookings_status_check CHECK (status IN ('pending','confirmed','cancelled','rejected')),
  CONSTRAINT bookings_exactly_90_minutes CHECK (end_time = start_time + INTERVAL '90 minutes'),
  CONSTRAINT bookings_source_rules CHECK (
    (source_type = 'cr_rl' AND booked_by IS NOT NULL AND schedule_id IS NOT NULL)
    OR (source_type IN ('staff','outsider'))
  ),
  CONSTRAINT bookings_no_overlap EXCLUDE USING gist (
    ground_id WITH =,
    tstzrange(start_time, end_time, '[)') WITH &&
  ) WHERE (status IN ('pending','confirmed'))
);

ALTER TABLE schedules ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS decided_by INTEGER REFERENCES users(id);
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS decided_at TIMESTAMPTZ;
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS decision_note VARCHAR(300);
ALTER TABLE bookings DROP CONSTRAINT IF EXISTS bookings_status_check;
ALTER TABLE bookings ADD CONSTRAINT bookings_status_check CHECK (status IN ('pending','confirmed','cancelled','rejected'));
ALTER TABLE bookings DROP CONSTRAINT IF EXISTS bookings_no_overlap;
ALTER TABLE bookings ADD CONSTRAINT bookings_no_overlap EXCLUDE USING gist (
  ground_id WITH =,
  tstzrange(start_time, end_time, '[)') WITH &&
) WHERE (status IN ('pending','confirmed'));
CREATE INDEX IF NOT EXISTS bookings_user_idx ON bookings (booked_by);
CREATE INDEX IF NOT EXISTS bookings_start_idx ON bookings (start_time);

CREATE TABLE IF NOT EXISTS audit_logs (
  id          BIGSERIAL PRIMARY KEY,
  actor_id    INTEGER REFERENCES users(id),
  action      VARCHAR(60) NOT NULL,
  entity_type VARCHAR(40) NOT NULL,
  entity_id   INTEGER,
  details     JSONB,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
