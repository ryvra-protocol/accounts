import type { ServiceError, SessionKeyRecord } from "../types.js";

export interface IssueSessionKeyRequest {
  accountId: string;
  sessionPublicKey: string;
  validAfter: string;
  validUntil: string;
  policyRef: string;
}

export interface RevokeSessionKeyRequest {
  accountId: string;
  sessionKeyId: string;
  reason?: string;
}

/**
 * Initial session key manager scaffolding.
 * TODO: persist keys securely and enforce policy-aware issuance constraints.
 */
export class SessionKeyManager {
  async issueSessionKey(request: IssueSessionKeyRequest): Promise<SessionKeyRecord | ServiceError> {
    if (request.validUntil <= request.validAfter) {
      return {
        code: "INVALID_REQUEST",
        message: "validUntil must be greater than validAfter",
      };
    }

    return {
      sessionKeyId: "TODO-session-key-id",
      accountId: request.accountId,
      status: "active",
      validAfter: request.validAfter,
      validUntil: request.validUntil,
      policyRef: request.policyRef,
    };
  }

  async revokeSessionKey(_request: RevokeSessionKeyRequest): Promise<{ revoked: true } | ServiceError> {
    return { revoked: true };
  }
}
