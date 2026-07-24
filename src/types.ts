/** Shared service error structure for initial scaffolding interfaces. */
export interface ServiceError {
  code:
    | "INVALID_REQUEST"
    | "UNAUTHORIZED"
    | "NOT_FOUND"
    | "POLICY_DENIED"
    | "REPLAY_DETECTED"
    | "NONCE_CONFLICT"
    | "RATE_LIMITED"
    | "SPONSORSHIP_DENIED"
    | "INTERNAL_ERROR";
  message: string;
  details?: Record<string, unknown>;
}

export type PolicyDecision = "ALLOW" | "DENY" | "REVIEW";

export interface PolicyDecisionContract {
  decision: PolicyDecision;
  policy_version: string;
  reference_id: string;
  correlation_id: string;
  reason_codes?: string[];
}

export interface EventEnvelope<TPayload = Record<string, unknown>> {
  event_id: string;
  correlation_id: string;
  reference_id: string;
  event_type: string;
  timestamp: string;
  payload: TPayload;
}

/** Canonical session key record used by the initial SessionKeyManager scaffold. */
export interface SessionKeyRecord {
  session_key_id: string;
  account_id: string;
  reference_id: string;
  correlation_id: string;
  status: "active" | "revoked" | "expired";
  valid_after: string;
  valid_until: string;
  policy_version: string;
}

/** Canonical user operation validation result used by UserOpService. */
export interface UserOpValidationResult {
  valid: boolean;
  reference_id: string;
  correlation_id: string;
  user_op_hash?: string;
  reasons?: string[];
}
