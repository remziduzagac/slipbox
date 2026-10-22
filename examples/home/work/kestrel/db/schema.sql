-- Kestrel's Postgres schema. Migrations in api/migrations/ apply on top of this.
CREATE EXTENSION IF NOT EXISTS "pgcrypto";
CREATE EXTENSION IF NOT EXISTS postgis;

CREATE TABLE accounts (
    id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    email       text NOT NULL UNIQUE,
    display_name text NOT NULL,
    created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE routes (
    id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    owner_id    uuid NOT NULL REFERENCES accounts (id) ON DELETE CASCADE,
    name        text NOT NULL,
    geometry    geography(LineString, 4326) NOT NULL,
    distance_m  integer NOT NULL CHECK (distance_m >= 0),
    updated_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX routes_owner_idx ON routes (owner_id);
CREATE INDEX routes_geometry_idx ON routes USING gist (geometry);

CREATE TABLE shares (
    id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    route_id    uuid NOT NULL REFERENCES routes (id) ON DELETE CASCADE,
    signature   text NOT NULL,
    expires_at  timestamptz NOT NULL,
    revoked_at  timestamptz
);

CREATE TABLE sync_ops (
    id          bigserial PRIMARY KEY,
    account_id  uuid NOT NULL REFERENCES accounts (id),
    device_id   text NOT NULL,
    op          jsonb NOT NULL,
    status      text NOT NULL DEFAULT 'pending',  -- pending | applied | parked
    attempts    integer NOT NULL DEFAULT 0
);

CREATE FUNCTION touch_updated_at() RETURNS trigger AS $$
BEGIN
    NEW.updated_at := now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER routes_touch BEFORE UPDATE ON routes
    FOR EACH ROW EXECUTE FUNCTION touch_updated_at();

COMMENT ON TABLE sync_ops IS 'The server side of the op log.
A device appends ops; the server applies them in order.
An op that cannot be applied is parked, never retried forever (ADR 4).';
