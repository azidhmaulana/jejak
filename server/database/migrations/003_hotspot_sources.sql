CREATE TABLE hotspot_sources (
  id TEXT PRIMARY KEY,
  active BOOLEAN NOT NULL,
  secret TEXT NOT NULL DEFAULT '',
  updated_at BIGINT NOT NULL
);
