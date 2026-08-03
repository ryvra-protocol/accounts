import type { ServiceError, UserOpValidationResult } from "../types.js";
import {
  type UnifiedAssetContext,
  validateUnifiedAssetBoundaryContexts,
} from "../compat/unified-asset-compat.js";

export interface ValidateUserOpRequest {
  account_id: string;
  reference_id: string;
  idempotency_key: string;
  correlation_id: string;
  policy_version: string;
  userOperation: Record<string, unknown>;
  expected_nonce: string;
  unified_asset_context?: UnifiedAssetContext;
  paymaster_asset_context?: UnifiedAssetContext;
  bundler_asset_context?: UnifiedAssetContext;
}

export interface SubmitUserOpRequest {
  account_id: string;
  reference_id: string;
  idempotency_key: string;
  correlation_id: string;
  policy_version: string;
  userOperation: Record<string, unknown>;
  unified_asset_context?: UnifiedAssetContext;
  paymaster_asset_context?: UnifiedAssetContext;
  bundler_asset_context?: UnifiedAssetContext;
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
    const assetValidation = validateUnifiedAssetBoundaryContexts({
      userop_context: request.unified_asset_context,
      paymaster_context: request.paymaster_asset_context,
      bundler_context: request.bundler_asset_context,
    });
    if (!assetValidation.valid) {
      return {
        code: "INVALID_REQUEST",
        message: "invalid unified asset context",
        details: {
          issues: assetValidation.issues,
        },
      };
    }

    return {
      valid: false,
      reference_id: request.reference_id,
      correlation_id: request.correlation_id,
      reasons: ["TODO: validation logic not implemented"],
    };
  }

  async submitUserOp(request: SubmitUserOpRequest): Promise<SubmitUserOpResponse | ServiceError> {
    const assetValidation = validateUnifiedAssetBoundaryContexts({
      userop_context: request.unified_asset_context,
      paymaster_context: request.paymaster_asset_context,
      bundler_context: request.bundler_asset_context,
    });
    if (!assetValidation.valid) {
      return {
        code: "INVALID_REQUEST",
        message: "invalid unified asset context",
        details: {
          issues: assetValidation.issues,
        },
      };
    }

    return {
      accepted: false,
      reference_id: request.reference_id,
      correlation_id: request.correlation_id,
    };
  }
}
