import type { ServiceError, UserOpValidationResult } from "../types.js";

export interface ValidateUserOpRequest {
  account_id: string;
  reference_id: string;
  idempotency_key: string;
  correlation_id: string;
  policy_version: string;
  userOperation: Record<string, unknown>;
  expected_nonce: string;
}

export interface SubmitUserOpRequest {
  account_id: string;
  reference_id: string;
  idempotency_key: string;
  correlation_id: string;
  policy_version: string;
  userOperation: Record<string, unknown>;
}

export interface SubmitUserOpResponse {
  accepted: boolean;
  reference_id: string;
  correlation_id: string;
  user_op_hash?: string;
  bundler_request_id?: string;
}

/**
 * Initial UserOp service scaffolding.
 * TODO: implement canonical nonce source checks, signature verification, and bundler integration.
 */
export class UserOpService {
  async validateUserOp(
    request: ValidateUserOpRequest,
  ): Promise<UserOpValidationResult | ServiceError> {
    return {
      valid: false,
      reference_id: request.reference_id,
      correlation_id: request.correlation_id,
      reasons: ["TODO: validation logic not implemented"],
    };
  }

  async submitUserOp(request: SubmitUserOpRequest): Promise<SubmitUserOpResponse | ServiceError> {
    return {
      accepted: false,
      reference_id: request.reference_id,
      correlation_id: request.correlation_id,
    };
  }
}
