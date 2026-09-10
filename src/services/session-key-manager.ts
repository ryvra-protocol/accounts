import type { ServiceError, SessionKeyRecord } from "../types.js";

export interface IssueSessionKeyRequest {
  account_id: string;
  agent_id: string;
  mandate_id: string;
  capability_ids: string[];
  nonce_domain: string;
  reference_id: string;
  idempotency_key: string;
  correlation_id: string;
  policy_version: string;
  policy_hash: string;
  risk_assessment_id: string;
  session_public_key: string;
  valid_after: string;
  valid_until: string;
  authority_scope?: "capability_scoped" | "owner";
}

export interface RevokeSessionKeyRequest {
  account_id: string;
  reference_id: string;
  correlation_id: string;
  session_key_id: string;
  reason?: string;
}

/**
 * Session key manager with capability-scoped issuance and immediate revocation.
 */
export class SessionKeyManager {
  private readonly keys = new Map<string, SessionKeyRecord>();

  async issueSessionKey(request: IssueSessionKeyRequest): Promise<SessionKeyRecord | ServiceError> {
    if (request.valid_until <= request.valid_after) {
      return {
        code: "INVALID_REQUEST",
        message: "valid_until must be greater than valid_after",
      };
    }

    if (request.authority_scope === "owner") {
      return {
        code: "UNAUTHORIZED",
        message: "owner-equivalent session keys are prohibited for agents",
      };
    }

    if (!request.capability_ids.length) {
      return {
        code: "INVALID_REQUEST",
        message: "session key must include at least one capability",
      };
    }

    const issuedAt = new Date().toISOString();
    const sessionKeyId = `sk_${request.agent_id}_${request.idempotency_key}`;
    const record: SessionKeyRecord = {
      session_key_id: sessionKeyId,
      account_id: request.account_id,
      agent_id: request.agent_id,
      mandate_id: request.mandate_id,
      capability_ids: [...request.capability_ids],
      nonce_domain: request.nonce_domain,
      reference_id: request.reference_id,
      correlation_id: request.correlation_id,
      status: request.valid_until <= issuedAt ? "expired" : "active",
      valid_after: request.valid_after,
      valid_until: request.valid_until,
      policy_version: request.policy_version,
      policy_hash: request.policy_hash,
      risk_assessment_id: request.risk_assessment_id,
      authority_scope: "capability_scoped",
    };

    this.keys.set(record.session_key_id, record);
    return record;
  }

  getSessionKey(sessionKeyId: string): SessionKeyRecord | undefined {
    return this.keys.get(sessionKeyId);
  }

  async revokeSessionKey(request: RevokeSessionKeyRequest): Promise<{ revoked: true } | ServiceError> {
    const existing = this.keys.get(request.session_key_id);
    if (!existing || existing.account_id !== request.account_id) {
      return {
        code: "NOT_FOUND",
        message: "session key not found",
      };
    }

    this.keys.set(request.session_key_id, {
      ...existing,
      status: "revoked",
    });
    return { revoked: true };
  }
}
