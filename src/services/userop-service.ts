import type { ServiceError, UserOpValidationResult } from "../types.js";

export interface ValidateUserOpRequest {
  accountId: string;
  userOperation: Record<string, unknown>;
  expectedNonce: string;
}

export interface SubmitUserOpRequest {
  accountId: string;
  userOperation: Record<string, unknown>;
}

export interface SubmitUserOpResponse {
  accepted: boolean;
  userOpHash?: string;
  bundlerRequestId?: string;
}

/**
 * Initial UserOp service scaffolding.
 * TODO: implement canonical nonce source checks, signature verification, and bundler integration.
 */
export class UserOpService {
  async validateUserOp(
    _request: ValidateUserOpRequest,
  ): Promise<UserOpValidationResult | ServiceError> {
    return {
      valid: false,
      reasons: ["TODO: validation logic not implemented"],
    };
  }

  async submitUserOp(_request: SubmitUserOpRequest): Promise<SubmitUserOpResponse | ServiceError> {
    return {
      accepted: false,
    };
  }
}
