CREATE TABLE IF NOT EXISTS accounts (
  account_id TEXT PRIMARY KEY,
  agent_id TEXT,
  mandate_id TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS account_keys (
  account_key_id TEXT PRIMARY KEY,
  account_id TEXT NOT NULL,
  policy_version TEXT,
  policy_hash TEXT,
  risk_assessment_id TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS session_keys (
  session_key_id TEXT PRIMARY KEY,
  account_id TEXT NOT NULL,
  agent_id TEXT NOT NULL,
  mandate_id TEXT NOT NULL,
  capability_ids JSONB NOT NULL,
  policy_version TEXT NOT NULL,
  policy_hash TEXT NOT NULL,
  risk_assessment_id TEXT,
  nonce_domain TEXT NOT NULL,
  valid_after TIMESTAMPTZ NOT NULL,
  valid_until TIMESTAMPTZ NOT NULL,
  revoked_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS capabilities (
  capability_id TEXT PRIMARY KEY,
  mandate_id TEXT NOT NULL,
  policy_version TEXT NOT NULL,
  policy_hash TEXT NOT NULL,
  allowed_chain_ids JSONB NOT NULL,
  allowed_contracts JSONB NOT NULL,
  allowed_function_selectors JSONB NOT NULL,
  allowed_assets JSONB NOT NULL,
  allowed_actions JSONB NOT NULL,
  per_tx_max_amount NUMERIC,
  cumulative_limit_max_amount NUMERIC,
  cumulative_limit_window_ms BIGINT,
  revoked_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS user_operations (
  user_operation_hash TEXT PRIMARY KEY,
  idempotency_key TEXT NOT NULL,
  replay_key TEXT NOT NULL,
  agent_id TEXT,
  mandate_id TEXT,
  capability_id TEXT,
  session_key_id TEXT,
  policy_version TEXT,
  policy_hash TEXT,
  risk_assessment_id TEXT,
  nonce_domain TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS user_operation_attempts (
  attempt_id TEXT PRIMARY KEY,
  user_operation_hash TEXT NOT NULL,
  agent_id TEXT,
  capability_id TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS paymaster_policies (
  policy_id TEXT PRIMARY KEY,
  policy_version TEXT NOT NULL,
  policy_hash TEXT NOT NULL,
  risk_assessment_id TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_accounts_agent_created_at ON accounts (agent_id, created_at);
CREATE INDEX IF NOT EXISTS idx_capabilities_mandate_created_at ON capabilities (mandate_id, created_at);
CREATE INDEX IF NOT EXISTS idx_session_keys_revoked_at ON session_keys (session_key_id, revoked_at);
CREATE INDEX IF NOT EXISTS idx_user_operations_hash ON user_operations (user_operation_hash);
CREATE UNIQUE INDEX IF NOT EXISTS idx_user_operations_replay_key ON user_operations (replay_key);
