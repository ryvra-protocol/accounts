import type { ServiceError } from "../types.js";

export interface PolicyEvaluationRequest {
  accountId: string;
  actorKeyId?: string;
  action: string;
  context: Record<string, unknown>;
}

export interface PolicyEvaluationResponse {
  allow: boolean;
  decisionId: string;
  denyReasons?: string[];
}

/**
 * Initial policy decision point scaffolding.
 * TODO: implement deny-by-default policy evaluation with signed policy bundles.
 */
export class PolicyDecisionPoint {
  async evaluate(_request: PolicyEvaluationRequest): Promise<PolicyEvaluationResponse | ServiceError> {
    return {
      allow: false,
      decisionId: "TODO-decision-id",
      denyReasons: ["TODO: policy engine not implemented"],
    };
  }
}
