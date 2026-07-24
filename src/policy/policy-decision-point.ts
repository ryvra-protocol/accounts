import type { PolicyDecisionContract, ServiceError } from "../types.js";

export interface PolicyEvaluationRequest {
  account_id: string;
  reference_id: string;
  correlation_id: string;
  policy_version: string;
  actor_key_id?: string;
  action: string;
  context: Record<string, unknown>;
}

export type PolicyEvaluationResponse = PolicyDecisionContract;

/**
 * Initial policy decision point scaffolding.
 * TODO: implement deny-by-default policy evaluation with signed policy bundles.
 */
export class PolicyDecisionPoint {
  async evaluate(request: PolicyEvaluationRequest): Promise<PolicyEvaluationResponse | ServiceError> {
    return {
      decision: "DENY",
      policy_version: request.policy_version,
      reference_id: request.reference_id,
      correlation_id: request.correlation_id,
      reason_codes: ["POLICY_ENGINE_UNIMPLEMENTED"],
    };
  }
}
