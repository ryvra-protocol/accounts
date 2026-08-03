import type { UserOperation } from "./user-operation-builder.js";
import { UserOpRuntimeError } from "./errors.js";

export interface SponsorshipPolicyConstraints {
  maxSponsoredCostWei?: string;
  allowedChains?: number[];
  requiredPolicyVersion?: string;
}

export interface SponsorshipRequest {
  account_id: string;
  reference_id: string;
  correlation_id: string;
  policy_version: string;
  chainId: number;
  entryPoint: string;
  userOperation: UserOperation;
  estimatedMaxCostWei?: string;
}

export interface SponsorshipResponse {
  sponsored: boolean;
  paymasterAndData?: string;
  reason?: string;
  constraints_applied?: SponsorshipPolicyConstraints;
}

export interface PaymasterClient {
  sponsorUserOperation(request: SponsorshipRequest): Promise<SponsorshipResponse>;
}

function parsePositiveBigInt(value: string, field: string): bigint {
  if (!/^\d+$/.test(value)) {
    throw new UserOpRuntimeError("INVALID_PAYMASTER", `${field} must be a decimal integer`);
  }

  return BigInt(value);
}

export function validateSponsorshipConstraints(
  request: SponsorshipRequest,
  constraints: SponsorshipPolicyConstraints,
): void {
  if (constraints.requiredPolicyVersion && constraints.requiredPolicyVersion !== request.policy_version) {
    throw new UserOpRuntimeError("INVALID_PAYMASTER", "policy version not sponsorable", {
      requiredPolicyVersion: constraints.requiredPolicyVersion,
      receivedPolicyVersion: request.policy_version,
    });
  }

  if (constraints.allowedChains && !constraints.allowedChains.includes(request.chainId)) {
    throw new UserOpRuntimeError("INVALID_CHAIN", "chain not sponsorable", {
      chainId: request.chainId,
      allowedChains: constraints.allowedChains,
    });
  }

  if (constraints.maxSponsoredCostWei && request.estimatedMaxCostWei) {
    const max = parsePositiveBigInt(constraints.maxSponsoredCostWei, "maxSponsoredCostWei");
    const estimated = parsePositiveBigInt(request.estimatedMaxCostWei, "estimatedMaxCostWei");
    if (estimated > max) {
      throw new UserOpRuntimeError("INVALID_PAYMASTER", "estimated sponsorship cost exceeds policy", {
        maxSponsoredCostWei: constraints.maxSponsoredCostWei,
        estimatedMaxCostWei: request.estimatedMaxCostWei,
      });
    }
  }
}
