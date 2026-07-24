import type { ServiceError, SessionKeyRecord } from "../types.js";

export interface IssueSessionKeyRequest {
  account_id: string;
  reference_id: string;
  idempotency_key: string;
  correlation_id: string;
  policy_version: string;
  session_public_key: string;
  valid_after: string;
  valid_until: string;
}

export interface RevokeSessionKeyRequest {
  account_id: string;
  reference_id: string;
  correlation_id: string;
  session_key_id: string;
  reason?: string;
}

/**
 * Initial session key manager scaffolding.
 * TODO: persist keys securely and enforce policy-aware issuance constraints.
 */
export class SessionKeyManager {
  async issueSessionKey(request: IssueSessionKeyRequest): Promise<SessionKeyRecord | ServiceError> {
    if (request.valid_until <= request.valid_after) {
      return {
        code: "INVALID_REQUEST",
        message: "valid_until must be greater than valid_after",
      };
    }

    return {
      session_key_id: "TODO-session-key-id",
      account_id: request.account_id,
      reference_id: request.reference_id,
      correlation_id: request.correlation_id,
      status: "active",
      valid_after: request.valid_after,
      valid_until: request.valid_until,
      policy_version: request.policy_version,
    };
  }

  async revokeSessionKey(_request: RevokeSessionKeyRequest): Promise<{ revoked: true } | ServiceError> {
    return { revoked: true };
  }
}
