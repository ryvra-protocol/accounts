export interface OwnershipTableColumn {
  name: string;
  type: string;
  nullable?: boolean;
}

export interface OwnershipTableIndex {
  name: string;
  columns: string[];
  unique?: boolean;
}

export interface OwnershipTableSchema {
  table: string;
  columns: OwnershipTableColumn[];
  indexes: OwnershipTableIndex[];
}

export const ownershipModelTables: OwnershipTableSchema[] = [
  {
    table: "accounts",
    columns: [
      { name: "account_id", type: "text" },
      { name: "agent_id", type: "text", nullable: true },
      { name: "mandate_id", type: "text", nullable: true },
      { name: "created_at", type: "timestamptz" },
    ],
    indexes: [{ name: "idx_accounts_agent_created", columns: ["agent_id", "created_at"] }],
  },
  {
    table: "account_keys",
    columns: [
      { name: "account_key_id", type: "text" },
      { name: "account_id", type: "text" },
      { name: "policy_version", type: "text", nullable: true },
      { name: "policy_hash", type: "text", nullable: true },
      { name: "risk_assessment_id", type: "text", nullable: true },
      { name: "created_at", type: "timestamptz" },
    ],
    indexes: [],
  },
  {
    table: "session_keys",
    columns: [
      { name: "session_key_id", type: "text" },
      { name: "account_id", type: "text" },
      { name: "agent_id", type: "text" },
      { name: "mandate_id", type: "text" },
      { name: "capability_ids", type: "jsonb" },
      { name: "nonce_domain", type: "text" },
      { name: "policy_version", type: "text" },
      { name: "policy_hash", type: "text" },
      { name: "risk_assessment_id", type: "text" },
      { name: "valid_until", type: "timestamptz" },
      { name: "revoked_at", type: "timestamptz", nullable: true },
      { name: "created_at", type: "timestamptz" },
    ],
    indexes: [{ name: "idx_session_keys_revoked", columns: ["session_key_id", "revoked_at"] }],
  },
  {
    table: "capabilities",
    columns: [
      { name: "capability_id", type: "text" },
      { name: "mandate_id", type: "text" },
      { name: "policy_version", type: "text" },
      { name: "policy_hash", type: "text" },
      { name: "allowed_chain_ids", type: "jsonb" },
      { name: "allowed_contracts", type: "jsonb" },
      { name: "allowed_function_selectors", type: "jsonb" },
      { name: "allowed_assets", type: "jsonb" },
      { name: "allowed_actions", type: "jsonb" },
      { name: "per_tx_max_amount", type: "numeric", nullable: true },
      { name: "cumulative_limit_max_amount", type: "numeric", nullable: true },
      { name: "cumulative_limit_window_ms", type: "bigint", nullable: true },
      { name: "created_at", type: "timestamptz" },
    ],
    indexes: [{ name: "idx_capabilities_mandate_created", columns: ["mandate_id", "created_at"] }],
  },
  {
    table: "user_operations",
    columns: [
      { name: "user_operation_hash", type: "text" },
      { name: "idempotency_key", type: "text" },
      { name: "replay_key", type: "text" },
      { name: "agent_id", type: "text", nullable: true },
      { name: "mandate_id", type: "text", nullable: true },
      { name: "capability_id", type: "text", nullable: true },
      { name: "session_key_id", type: "text", nullable: true },
      { name: "policy_version", type: "text", nullable: true },
      { name: "policy_hash", type: "text", nullable: true },
      { name: "risk_assessment_id", type: "text", nullable: true },
      { name: "nonce_domain", type: "text", nullable: true },
      { name: "created_at", type: "timestamptz" },
    ],
    indexes: [
      { name: "idx_user_operations_hash", columns: ["user_operation_hash"], unique: true },
      { name: "idx_user_operations_replay", columns: ["replay_key"], unique: true },
    ],
  },
  {
    table: "user_operation_attempts",
    columns: [
      { name: "attempt_id", type: "text" },
      { name: "user_operation_hash", type: "text" },
      { name: "agent_id", type: "text", nullable: true },
      { name: "capability_id", type: "text", nullable: true },
      { name: "created_at", type: "timestamptz" },
    ],
    indexes: [{ name: "idx_user_operation_attempts_agent_created", columns: ["agent_id", "created_at"] }],
  },
  {
    table: "paymaster_policies",
    columns: [
      { name: "policy_id", type: "text" },
      { name: "policy_version", type: "text" },
      { name: "policy_hash", type: "text" },
      { name: "risk_assessment_id", type: "text", nullable: true },
      { name: "created_at", type: "timestamptz" },
    ],
    indexes: [],
  },
];
