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

/** Canonical session key record used by the initial SessionKeyManager scaffold. */
export interface SessionKeyRecord {
  sessionKeyId: string;
  accountId: string;
  status: "active" | "revoked" | "expired";
  validAfter: string;
  validUntil: string;
  policyRef: string;
}

/** Canonical user operation validation result used by UserOpService. */
export interface UserOpValidationResult {
  valid: boolean;
  userOpHash?: string;
  reasons?: string[];
}
