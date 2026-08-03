import type { ServiceError, UserOpValidationResult } from "../types.js";
import {
  type UnifiedAssetContext,
  validateUnifiedAssetBoundaryContexts,
} from "../compat/unified-asset-compat.js";
import type { BundlerClient, UserOperationReceipt } from "../runtime/bundler-client.js";
import { UserOpRuntimeError, sanitizeErrorDetails } from "../runtime/errors.js";
import {
  emitUserOpLifecycleEvent,
  type UserOpLifecycleLogger,
  type UserOpLifecycleObserver,
  type UserOpMetrics,
} from "../runtime/observability.js";
import {
  buildSignatureReadyPayload,
  canonicalizeUserOperation,
  computeUserOperationHash,
  stableStringify,
  type UserOperationBuilderInput,
} from "../runtime/user-operation-builder.js";
import type { PaymasterClient, SponsorshipPolicyConstraints } from "../runtime/paymaster.js";
import { validateSponsorshipConstraints } from "../runtime/paymaster.js";
import { executeWithRetry, withDefaultRetryPolicy, type RetryPolicy } from "../runtime/retry.js";
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
  status?: "included" | "stale_pending";
  outcome_code?: "MISSING_USEROP_VISIBILITY" | "MISSING_RECEIPT";
}

export interface UserOpServiceDependencies {
  bundlerClient?: BundlerClient;
  paymasterClient?: PaymasterClient;
  lifecycleObserver?: UserOpLifecycleObserver;
  lifecycleLogger?: UserOpLifecycleLogger;
  metrics?: UserOpMetrics;
  chainId?: number;
  entryPoint?: string;
  knownAccounts?: string[];
  sponsorshipConstraints?: SponsorshipPolicyConstraints;
  retryPolicy?: Partial<RetryPolicy>;
  pendingTimeoutMs?: number;
  receiptPollIntervalMs?: number;
  clockNowMs?: () => number;
  sleep?: (ms: number) => Promise<void>;
  random?: () => number;
  duplicateRejectionHook?: (context: {
    account_id: string;
    reference_id: string;
    reason: "idempotency_duplicate" | "replay_duplicate";
    key: string;
  }) => Promise<void> | void;
}

interface SubmissionRecord {
  userOpHash: string;
  bundlerRequestId?: string;
  status: "included" | "stale_pending";
  outcome_code?: "MISSING_USEROP_VISIBILITY" | "MISSING_RECEIPT";
}

const DEFAULT_CHAIN_ID = 1;
const DEFAULT_ENTRY_POINT = "0x0000000071727de22e5e9d8baf0edac6f37da032";
const DEFAULT_PENDING_TIMEOUT_MS = 15_000;
const DEFAULT_RECEIPT_POLL_INTERVAL_MS = 400;

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
          message: "nonce conflict",
          details: error.details,
        };
      case "REPLAY_DETECTED":
        return {
          code: "REPLAY_DETECTED",
          message: "replay detected",
          details: error.details,
        };
      case "INVALID_PAYMASTER":
        return {
          code: "SPONSORSHIP_DENIED",
          message: "paymaster sponsorship denied",
          details: error.details,
        };
      case "UPSTREAM_UNAVAILABLE":
        return {
          code: "UPSTREAM_UNAVAILABLE",
          message: "upstream dependency unavailable",
          details: error.details,
        };
      case "PENDING_TIMEOUT":
      case "RECEIPT_TIMEOUT":
        return {
          code: "PENDING_TIMEOUT",
          message: "user operation pending timeout",
          details: error.details,
        };
      case "BUNDLER_ERROR":
      case "SIMULATION_FAILED":
        return {
          code: "INTERNAL_ERROR",
          message: "bundler operation failed",
          details: error.details,
        };
      default:
        return {
          code: "INVALID_REQUEST",
          message: "invalid user operation request",
          details: error.details,
        };
    }
  }

  return {
    code: "INTERNAL_ERROR",
    message: "unexpected runtime failure",
    details: sanitizeErrorDetails(error),
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
  private readonly submissionsByReplayKey = new Set<string>();
  private readonly usedNonceDomainKeys = new Set<string>();
  private readonly knownAccounts: ReadonlySet<string>;
  private readonly retryPolicy: RetryPolicy;

  constructor(private readonly dependencies: UserOpServiceDependencies = {}) {
    this.knownAccounts = new Set(dependencies.knownAccounts ?? []);
    this.retryPolicy = withDefaultRetryPolicy(dependencies.retryPolicy);
  }

  private nowMs(): number {
    return this.dependencies.clockNowMs ? this.dependencies.clockNowMs() : Date.now();
  }

  private async sleep(ms: number): Promise<void> {
    if (this.dependencies.sleep) {
      await this.dependencies.sleep(ms);
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, ms));
  }

  private random(): number {
    return this.dependencies.random ? this.dependencies.random() : Math.random();
  }

  private async executeWithRetry<T>(operation: () => Promise<T>): Promise<T> {
    return executeWithRetry(operation, this.retryPolicy, {
      sleep: async (ms) => this.sleep(ms),
      random: () => this.random(),
    });
  }

  private createReplayKey(params: {
    chainId: number;
    entryPoint: string;
    account_id: string;
    canonicalNonce: string;
    userOpHash: string;
  }): string {
    return stableStringify({
      chainId: params.chainId,
      entryPoint: params.entryPoint.toLowerCase(),
      account_id: params.account_id,
      nonce: params.canonicalNonce,
      userOpHash: params.userOpHash,
    });
  }

  private createNonceDomainKey(params: {
    chainId: number;
    entryPoint: string;
    account_id: string;
    canonicalNonce: string;
  }): string {
    return `${params.chainId}:${params.entryPoint.toLowerCase()}:${params.account_id}:${params.canonicalNonce}`;
  }

  private async rejectDuplicate(
    reason: "idempotency_duplicate" | "replay_duplicate",
    request: { account_id: string; reference_id: string },
    key: string,
  ): Promise<void> {
    if (!this.dependencies.duplicateRejectionHook) {
      return;
    }

    await this.dependencies.duplicateRejectionHook({
      account_id: request.account_id,
      reference_id: request.reference_id,
      reason,
      key,
    });
  }

  private async emitLifecycle(event: {
    type: "userop.simulated" | "userop.submitted" | "userop.included" | "userop.failed" | "userop.stale_pending";
    account_id: string;
    reference_id: string;
    correlation_id: string;
    user_op_hash?: string;
    reason_code?: string;
  }): Promise<void> {
    await emitUserOpLifecycleEvent(
      this.dependencies.lifecycleObserver,
      this.dependencies.lifecycleLogger,
      event,
    );
  }

  private async resolveReceiptState(userOpHash: string): Promise<{
    receipt: UserOperationReceipt | null;
    outcome: "included" | "MISSING_USEROP_VISIBILITY" | "MISSING_RECEIPT";
  }> {
    if (!this.dependencies.bundlerClient) {
      return { receipt: null, outcome: "MISSING_USEROP_VISIBILITY" };
    }

    const startedAt = this.nowMs();
    const timeoutMs = this.dependencies.pendingTimeoutMs ?? DEFAULT_PENDING_TIMEOUT_MS;
    const pollIntervalMs = this.dependencies.receiptPollIntervalMs ?? DEFAULT_RECEIPT_POLL_INTERVAL_MS;
    let seenByHash = false;

    while (this.nowMs() - startedAt < timeoutMs) {
      const receipt = await this.executeWithRetry(() =>
        this.dependencies.bundlerClient!.getUserOperationReceipt(userOpHash),
      );
      if (receipt) {
        return { receipt, outcome: "included" };
      }

      const byHash = await this.executeWithRetry(() =>
        this.dependencies.bundlerClient!.getUserOperationByHash(userOpHash),
      );
      if (byHash) {
        seenByHash = true;
      }

      await this.sleep(pollIntervalMs);
    }

    return {
      receipt: null,
      outcome: seenByHash ? "MISSING_RECEIPT" : "MISSING_USEROP_VISIBILITY",
    };
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

      const replayKey = this.createReplayKey({
        chainId,
        entryPoint,
        account_id: request.account_id,
        canonicalNonce,
        userOpHash,
      });
      const nonceDomainKey = this.createNonceDomainKey({
        chainId,
        entryPoint,
        account_id: request.account_id,
        canonicalNonce,
      });

      if (this.usedNonceDomainKeys.has(nonceDomainKey)) {
        throw new UserOpRuntimeError("NONCE_CONFLICT", "nonce already used in nonce domain", {
          nonce_domain_key: nonceDomainKey,
        });
      }

      if (this.submissionsByReplayKey.has(replayKey)) {
        await this.rejectDuplicate("replay_duplicate", request, replayKey);
        throw new UserOpRuntimeError("REPLAY_DETECTED", "duplicate replay key already submitted", {
          replay_key: replayKey,
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
      await this.rejectDuplicate("idempotency_duplicate", request, request.idempotency_key);
      return {
        accepted: true,
        reference_id: request.reference_id,
        correlation_id: request.correlation_id,
        user_op_hash: existing.userOpHash,
        bundler_request_id: existing.bundlerRequestId,
        status: existing.status,
        outcome_code: existing.outcome_code,
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
      const replayKey = this.createReplayKey({
        chainId,
        entryPoint,
        account_id: request.account_id,
        canonicalNonce,
        userOpHash,
      });
      const nonceDomainKey = this.createNonceDomainKey({
        chainId,
        entryPoint,
        account_id: request.account_id,
        canonicalNonce,
      });

      if (this.usedNonceDomainKeys.has(nonceDomainKey)) {
        throw new UserOpRuntimeError("NONCE_CONFLICT", "nonce already used in nonce domain", {
          nonce_domain_key: nonceDomainKey,
        });
      }

      if (this.submissionsByReplayKey.has(replayKey)) {
        await this.rejectDuplicate("replay_duplicate", request, replayKey);
        throw new UserOpRuntimeError("REPLAY_DETECTED", "duplicate replay key already submitted", {
          replay_key: replayKey,
        });
      }

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

        const sponsorship = await this.executeWithRetry(() =>
          this.dependencies.paymasterClient!.sponsorUserOperation(sponsorshipRequest),
        );
        if (!sponsorship.sponsored || !sponsorship.paymasterAndData) {
          throw new UserOpRuntimeError("INVALID_PAYMASTER", "sponsorship denied");
        }
        canonical.paymasterAndData = sponsorship.paymasterAndData;
      }

      if (this.dependencies.bundlerClient?.simulateUserOperation) {
        await this.executeWithRetry(() =>
          this.dependencies.bundlerClient!.simulateUserOperation!(canonical, entryPoint),
        );
      }

      await this.emitLifecycle({
        type: "userop.simulated",
        account_id: request.account_id,
        correlation_id: request.correlation_id,
        reference_id: request.reference_id,
        user_op_hash: userOpHash,
      });

      const sendResult = this.dependencies.bundlerClient
        ? await this.executeWithRetry(() =>
            this.dependencies.bundlerClient!.sendUserOperation(canonical, entryPoint),
          )
        : { userOpHash };

      this.dependencies.metrics?.increment("userop_submit_total");

      await this.emitLifecycle({
        type: "userop.submitted",
        account_id: request.account_id,
        correlation_id: request.correlation_id,
        reference_id: request.reference_id,
        user_op_hash: sendResult.userOpHash,
      });

      const submittedAt = this.nowMs();
      const receiptState = await this.resolveReceiptState(sendResult.userOpHash);

      this.submissionsByReplayKey.add(replayKey);
      this.usedNonceDomainKeys.add(nonceDomainKey);
      if (receiptState.outcome === "included") {
        this.submissionsByIdempotency.set(request.idempotency_key, {
          userOpHash: sendResult.userOpHash,
          bundlerRequestId: signatureReady.payloadHash,
          status: "included",
        });
        await this.emitLifecycle({
          type: "userop.included",
          account_id: request.account_id,
          correlation_id: request.correlation_id,
          reference_id: request.reference_id,
          user_op_hash: sendResult.userOpHash,
        });
        this.dependencies.metrics?.observe("userop_time_to_inclusion_ms", this.nowMs() - submittedAt);

        return {
          accepted: true,
          reference_id: request.reference_id,
          correlation_id: request.correlation_id,
          user_op_hash: sendResult.userOpHash,
          bundler_request_id: signatureReady.payloadHash,
          status: "included",
        };
      }

      await this.emitLifecycle({
        type: "userop.stale_pending",
        account_id: request.account_id,
        correlation_id: request.correlation_id,
        reference_id: request.reference_id,
        user_op_hash: sendResult.userOpHash,
        reason_code: receiptState.outcome,
      });
      this.dependencies.metrics?.increment("userop_stale_pending_total");

      this.submissionsByIdempotency.set(request.idempotency_key, {
        userOpHash: sendResult.userOpHash,
        bundlerRequestId: signatureReady.payloadHash,
        status: "stale_pending",
        outcome_code: receiptState.outcome,
      });

      return {
        accepted: true,
        reference_id: request.reference_id,
        correlation_id: request.correlation_id,
        user_op_hash: sendResult.userOpHash,
        bundler_request_id: signatureReady.payloadHash,
        status: "stale_pending",
        outcome_code: receiptState.outcome,
      };
    } catch (error) {
      const serviceError = toServiceError(error);
      await this.emitLifecycle({
        type: "userop.failed",
        account_id: request.account_id,
        correlation_id: request.correlation_id,
        reference_id: request.reference_id,
        reason_code: isServiceError(serviceError) ? serviceError.code : "INTERNAL_ERROR",
      });
      this.dependencies.metrics?.increment("userop_failure_total");
      return serviceError;
    }
  }
}
