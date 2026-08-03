import type { ServiceError, UserOpValidationResult } from "../types.js";
import {
  type UnifiedAssetContext,
  validateUnifiedAssetBoundaryContexts,
} from "../compat/unified-asset-compat.js";
import type { BundlerClient } from "../runtime/bundler-client.js";
import { UserOpRuntimeError } from "../runtime/errors.js";
import { emitUserOpLifecycleEvent, type UserOpLifecycleObserver } from "../runtime/observability.js";
import {
  buildSignatureReadyPayload,
  canonicalizeUserOperation,
  computeUserOperationHash,
  type UserOperationBuilderInput,
} from "../runtime/user-operation-builder.js";
import type { PaymasterClient, SponsorshipPolicyConstraints } from "../runtime/paymaster.js";
import { validateSponsorshipConstraints } from "../runtime/paymaster.js";
import { validateRuntimeContext, validateUserOperationShape } from "../runtime/validation.js";

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
  chain_id?: number;
  entry_point?: string;
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
  chain_id?: number;
  entry_point?: string;
}

export interface SubmitUserOpResponse {
  accepted: boolean;
  reference_id: string;
  correlation_id: string;
  user_op_hash?: string;
  bundler_request_id?: string;
}

export interface UserOpServiceDependencies {
  bundlerClient?: BundlerClient;
  paymasterClient?: PaymasterClient;
  lifecycleObserver?: UserOpLifecycleObserver;
  chainId?: number;
  entryPoint?: string;
  knownAccounts?: string[];
  sponsorshipConstraints?: SponsorshipPolicyConstraints;
}

interface SubmissionRecord {
  userOpHash: string;
  bundlerRequestId?: string;
}

const DEFAULT_CHAIN_ID = 1;
const DEFAULT_ENTRY_POINT = "0x0000000071727de22e5e9d8baf0edac6f37da032";

function isServiceError(value: unknown): value is ServiceError {
  if (!value || typeof value !== "object") {
    return false;
  }

  return "code" in value && "message" in value;
}

function toServiceError(error: unknown): ServiceError {
  if (error instanceof UserOpRuntimeError) {
    switch (error.code) {
      case "NONCE_CONFLICT":
        return {
          code: "NONCE_CONFLICT",
          message: error.message,
          details: error.details,
        };
      case "REPLAY_DETECTED":
        return {
          code: "REPLAY_DETECTED",
          message: error.message,
          details: error.details,
        };
      case "INVALID_PAYMASTER":
        return {
          code: "SPONSORSHIP_DENIED",
          message: error.message,
          details: error.details,
        };
      case "BUNDLER_ERROR":
      case "SIMULATION_FAILED":
        return {
          code: "INTERNAL_ERROR",
          message: error.message,
          details: error.details,
        };
      default:
        return {
          code: "INVALID_REQUEST",
          message: error.message,
          details: error.details,
        };
    }
  }

  if (error instanceof Error) {
    return {
      code: "INVALID_REQUEST",
      message: error.message,
    };
  }

  return {
    code: "INTERNAL_ERROR",
    message: "unknown user operation runtime error",
  };
}

function asBuilderInput(userOperation: Record<string, unknown>): UserOperationBuilderInput {
  return {
    sender: String(userOperation.sender ?? ""),
    nonce: (userOperation.nonce ?? "0") as string | number | bigint,
    initCode: typeof userOperation.initCode === "string" ? userOperation.initCode : "0x",
    callData: String(userOperation.callData ?? "0x"),
    callGasLimit:
      typeof userOperation.callGasLimit === "string" ||
      typeof userOperation.callGasLimit === "number" ||
      typeof userOperation.callGasLimit === "bigint"
        ? userOperation.callGasLimit
        : "0",
    verificationGasLimit:
      typeof userOperation.verificationGasLimit === "string" ||
      typeof userOperation.verificationGasLimit === "number" ||
      typeof userOperation.verificationGasLimit === "bigint"
        ? userOperation.verificationGasLimit
        : "0",
    preVerificationGas:
      typeof userOperation.preVerificationGas === "string" ||
      typeof userOperation.preVerificationGas === "number" ||
      typeof userOperation.preVerificationGas === "bigint"
        ? userOperation.preVerificationGas
        : "0",
    maxFeePerGas:
      typeof userOperation.maxFeePerGas === "string" ||
      typeof userOperation.maxFeePerGas === "number" ||
      typeof userOperation.maxFeePerGas === "bigint"
        ? userOperation.maxFeePerGas
        : "0",
    maxPriorityFeePerGas:
      typeof userOperation.maxPriorityFeePerGas === "string" ||
      typeof userOperation.maxPriorityFeePerGas === "number" ||
      typeof userOperation.maxPriorityFeePerGas === "bigint"
        ? userOperation.maxPriorityFeePerGas
        : "0",
    paymasterAndData:
      typeof userOperation.paymasterAndData === "string" ? userOperation.paymasterAndData : "0x",
    signature: typeof userOperation.signature === "string" ? userOperation.signature : "0x",
  };
}

/**
 * ERC-4337 UserOperation orchestration service.
 */
export class UserOpService {
  private readonly submissionsByIdempotency = new Map<string, SubmissionRecord>();
  private readonly submissionsByHash = new Set<string>();
  private readonly usedNonceKeys = new Set<string>();
  private readonly knownAccounts: ReadonlySet<string>;

  constructor(private readonly dependencies: UserOpServiceDependencies = {}) {
    this.knownAccounts = new Set(dependencies.knownAccounts ?? []);
  }

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

    try {
      const chainId = request.chain_id ?? this.dependencies.chainId ?? DEFAULT_CHAIN_ID;
      const entryPoint = request.entry_point ?? this.dependencies.entryPoint ?? DEFAULT_ENTRY_POINT;
      const canonical = canonicalizeUserOperation(asBuilderInput(request.userOperation));

      validateRuntimeContext({
        chainId,
        expectedChainId: this.dependencies.chainId ?? chainId,
        entryPoint,
        expectedEntryPoint: this.dependencies.entryPoint ?? entryPoint,
        account_id: request.account_id,
        knownAccounts: this.knownAccounts.size > 0 ? this.knownAccounts : new Set([request.account_id]),
        paymasterEnabled: !!this.dependencies.paymasterClient,
      });
      validateUserOperationShape(canonical, !!this.dependencies.paymasterClient);

      const canonicalNonce = BigInt(canonical.nonce).toString(10);
      const expectedNonce = BigInt(request.expected_nonce).toString(10);
      if (canonicalNonce !== expectedNonce) {
        throw new UserOpRuntimeError("NONCE_CONFLICT", "user operation nonce does not match expected nonce", {
          expected_nonce: expectedNonce,
          received_nonce: canonicalNonce,
        });
      }

      const userOpHash = await computeUserOperationHash({
        userOperation: asBuilderInput(request.userOperation),
        chainId,
        entryPoint,
      });

      if (this.submissionsByHash.has(userOpHash)) {
        throw new UserOpRuntimeError("REPLAY_DETECTED", "duplicate user operation hash already submitted", {
          user_op_hash: userOpHash,
        });
      }

      return {
        valid: true,
        reference_id: request.reference_id,
        correlation_id: request.correlation_id,
        user_op_hash: userOpHash,
      };
    } catch (error) {
      const serviceError = toServiceError(error);
      if (serviceError.code === "INVALID_REQUEST") {
        return {
          valid: false,
          reference_id: request.reference_id,
          correlation_id: request.correlation_id,
          reasons: [serviceError.message],
        };
      }
      return serviceError;
    }
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

    const existing = this.submissionsByIdempotency.get(request.idempotency_key);
    if (existing) {
      return {
        accepted: true,
        reference_id: request.reference_id,
        correlation_id: request.correlation_id,
        user_op_hash: existing.userOpHash,
        bundler_request_id: existing.bundlerRequestId,
      };
    }

    try {
      const chainId = request.chain_id ?? this.dependencies.chainId ?? DEFAULT_CHAIN_ID;
      const entryPoint = request.entry_point ?? this.dependencies.entryPoint ?? DEFAULT_ENTRY_POINT;
      const canonical = canonicalizeUserOperation(asBuilderInput(request.userOperation));
      const signatureReady = await buildSignatureReadyPayload({
        chainId,
        entryPoint,
        userOperation: asBuilderInput(request.userOperation),
      });
      const userOpHash = await computeUserOperationHash({
        userOperation: asBuilderInput(request.userOperation),
        chainId,
        entryPoint,
      });
      if (this.submissionsByHash.has(userOpHash)) {
        throw new UserOpRuntimeError("REPLAY_DETECTED", "duplicate user operation hash already submitted", {
          user_op_hash: userOpHash,
        });
      }

      const nonceScopeKey = `${request.account_id}:${canonical.nonce}`;
      if (this.usedNonceKeys.has(nonceScopeKey)) {
        throw new UserOpRuntimeError("NONCE_CONFLICT", "nonce already used for account", {
          account_id: request.account_id,
          nonce: canonical.nonce,
        });
      }

      validateRuntimeContext({
        chainId,
        expectedChainId: this.dependencies.chainId ?? chainId,
        entryPoint,
        expectedEntryPoint: this.dependencies.entryPoint ?? entryPoint,
        account_id: request.account_id,
        knownAccounts: this.knownAccounts.size > 0 ? this.knownAccounts : new Set([request.account_id]),
        paymasterEnabled: !!this.dependencies.paymasterClient,
      });
      validateUserOperationShape(canonical, !!this.dependencies.paymasterClient);

      if (this.dependencies.paymasterClient) {
        const sponsorshipRequest = {
          account_id: request.account_id,
          reference_id: request.reference_id,
          correlation_id: request.correlation_id,
          policy_version: request.policy_version,
          chainId,
          entryPoint,
          userOperation: canonical,
          estimatedMaxCostWei: "0",
        };
        if (this.dependencies.sponsorshipConstraints) {
          validateSponsorshipConstraints(sponsorshipRequest, this.dependencies.sponsorshipConstraints);
        }

        const sponsorship = await this.dependencies.paymasterClient.sponsorUserOperation(sponsorshipRequest);
        if (!sponsorship.sponsored || !sponsorship.paymasterAndData) {
          throw new UserOpRuntimeError("INVALID_PAYMASTER", sponsorship.reason ?? "sponsorship denied");
        }
        canonical.paymasterAndData = sponsorship.paymasterAndData;
      }

      if (this.dependencies.bundlerClient?.simulateUserOperation) {
        await this.dependencies.bundlerClient.simulateUserOperation(canonical, entryPoint);
      }

      await emitUserOpLifecycleEvent(this.dependencies.lifecycleObserver, {
        type: "userop.simulated",
        account_id: request.account_id,
        correlation_id: request.correlation_id,
        reference_id: request.reference_id,
        user_op_hash: userOpHash,
      });

      const sendResult = this.dependencies.bundlerClient
        ? await this.dependencies.bundlerClient.sendUserOperation(canonical, entryPoint)
        : { userOpHash };

      const receipt = this.dependencies.bundlerClient
        ? await this.dependencies.bundlerClient.getUserOperationReceipt(sendResult.userOpHash)
        : null;

      await emitUserOpLifecycleEvent(this.dependencies.lifecycleObserver, {
        type: "userop.submitted",
        account_id: request.account_id,
        correlation_id: request.correlation_id,
        reference_id: request.reference_id,
        user_op_hash: sendResult.userOpHash,
      });

      if (receipt) {
        await emitUserOpLifecycleEvent(this.dependencies.lifecycleObserver, {
          type: "userop.included",
          account_id: request.account_id,
          correlation_id: request.correlation_id,
          reference_id: request.reference_id,
          user_op_hash: sendResult.userOpHash,
        });
      }

      this.usedNonceKeys.add(nonceScopeKey);
      this.submissionsByHash.add(sendResult.userOpHash);
      this.submissionsByHash.add(userOpHash);

      this.submissionsByIdempotency.set(request.idempotency_key, {
        userOpHash: sendResult.userOpHash,
        bundlerRequestId: signatureReady.payloadHash,
      });

      return {
        accepted: true,
        reference_id: request.reference_id,
        correlation_id: request.correlation_id,
        user_op_hash: sendResult.userOpHash,
        bundler_request_id: signatureReady.payloadHash,
      };
    } catch (error) {
      const serviceError = toServiceError(error);
      await emitUserOpLifecycleEvent(this.dependencies.lifecycleObserver, {
        type: "userop.failed",
        account_id: request.account_id,
        correlation_id: request.correlation_id,
        reference_id: request.reference_id,
        reason_code: isServiceError(serviceError) ? serviceError.code : "INTERNAL_ERROR",
      });
      return serviceError;
    }
  }
}
