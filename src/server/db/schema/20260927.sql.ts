export default /* sql */ `
CREATE TABLE objects (
  bucket TEXT NOT NULL,
  key TEXT NOT NULL,
  etag TEXT,
  size INTEGER,
  content_type TEXT,
  last_modified TEXT,
  status TEXT NOT NULL DEFAULT 'pending',
  status_updated_at TEXT,
  reviewer TEXT,
  indexed_at TEXT NOT NULL,
  PRIMARY KEY (bucket, key)
) WITHOUT ROWID;
CREATE INDEX objects_status ON objects (bucket, status);

CREATE TABLE comments (
  ulid TEXT PRIMARY KEY,
  bucket TEXT NOT NULL,
  key TEXT NOT NULL,
  author_email TEXT NOT NULL,
  author_name TEXT,
  body TEXT NOT NULL,
  selector TEXT,
  created_at TEXT NOT NULL
);
CREATE INDEX comments_object ON comments (bucket, key, ulid);

CREATE TABLE webhooks (
  id TEXT PRIMARY KEY,
  url TEXT NOT NULL,
  events TEXT NOT NULL,
  secret TEXT NOT NULL,
  active INTEGER NOT NULL DEFAULT 1,
  description TEXT NOT NULL DEFAULT '',
  created_by TEXT NOT NULL,
  created_at TEXT NOT NULL,
  indexed_at TEXT NOT NULL
);

CREATE TABLE webhook_deliveries (
  id TEXT PRIMARY KEY,
  webhook_id TEXT NOT NULL,
  event_type TEXT NOT NULL,
  payload TEXT NOT NULL,
  attempts INTEGER NOT NULL DEFAULT 0,
  next_attempt_at TEXT,
  last_status INTEGER,
  last_error TEXT,
  delivered_at TEXT,
  dead_at TEXT,
  created_at TEXT NOT NULL
);
CREATE INDEX webhook_deliveries_due ON webhook_deliveries (next_attempt_at) WHERE delivered_at IS NULL AND dead_at IS NULL;
CREATE INDEX webhook_deliveries_webhook ON webhook_deliveries (webhook_id, created_at);

CREATE TABLE index_runs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  started_at TEXT NOT NULL,
  finished_at TEXT,
  objects INTEGER,
  comments INTEGER,
  webhooks INTEGER,
  removed INTEGER,
  error TEXT
);`;
