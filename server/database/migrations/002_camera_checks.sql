CREATE TABLE camera_check_jobs (
  id TEXT PRIMARY KEY,
  status TEXT NOT NULL,
  updated_at BIGINT NOT NULL,
  summary JSONB NOT NULL
);
CREATE UNIQUE INDEX camera_check_one_running ON camera_check_jobs(status) WHERE status='running';
CREATE TABLE camera_stream_overrides (
  camera_id TEXT PRIMARY KEY,
  stream_url TEXT NOT NULL,
  updated_at BIGINT NOT NULL
);
CREATE TABLE camera_stream_history (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  camera_id TEXT NOT NULL,
  old_url TEXT NOT NULL,
  new_url TEXT NOT NULL,
  job_id TEXT NOT NULL REFERENCES camera_check_jobs(id),
  changed_at BIGINT NOT NULL
);
