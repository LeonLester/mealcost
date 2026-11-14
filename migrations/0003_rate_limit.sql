-- Fixed-window request counters. Old rows are swept as the limiter runs.
CREATE TABLE IF NOT EXISTS rl (
  k TEXT NOT NULL,
  w INTEGER NOT NULL,
  n INTEGER NOT NULL,
  exp INTEGER NOT NULL,
  PRIMARY KEY (k, w)
);
CREATE INDEX IF NOT EXISTS rl_exp ON rl(exp);
