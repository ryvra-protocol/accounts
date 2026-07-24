import { describe, expect, it } from "vitest";
import { PolicyDecisionPoint, SessionKeyManager, UserOpService } from "../src/index.js";

describe("Ryvra Accounts scaffold", () => {
  it("exposes initial service stubs", async () => {
    const userOpService = new UserOpService();
    const sessionKeyManager = new SessionKeyManager();
    const pdp = new PolicyDecisionPoint();

    const validation = await userOpService.validateUserOp({
      account_id: "acc_1",
      reference_id: "ref_validate_1",
      idempotency_key: "idem_validate_1",
      correlation_id: "corr_1",
      policy_version: "policy.v1",
      userOperation: {},
      expected_nonce: "0",
    });

    const issued = await sessionKeyManager.issueSessionKey({
      account_id: "acc_1",
      reference_id: "ref_issue_1",
      idempotency_key: "idem_issue_1",
      correlation_id: "corr_1",
      policy_version: "policy.v1",
      session_public_key: "0xabc",
      valid_after: "2026-01-01T00:00:00Z",
      valid_until: "2026-01-01T01:00:00Z",
    });

    const policy = await pdp.evaluate({
      account_id: "acc_1",
      reference_id: "ref_policy_1",
      correlation_id: "corr_1",
      policy_version: "policy.v1",
      action: "userop.submit",
      context: {},
    });

    expect(validation).toHaveProperty("valid");
    expect(validation).toHaveProperty("reference_id", "ref_validate_1");
    expect(issued).toHaveProperty("account_id", "acc_1");
    expect(policy).toHaveProperty("decision", "DENY");
    expect(policy).toHaveProperty("reason_codes");
    expect(Array.isArray((policy as { reason_codes?: string[] }).reason_codes)).toBe(true);
    expect((policy as { reason_codes?: string[] }).reason_codes?.length).toBeGreaterThan(0);
  });
});
