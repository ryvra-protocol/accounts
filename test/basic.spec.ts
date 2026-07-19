import { describe, expect, it } from "vitest";
import { PolicyDecisionPoint, SessionKeyManager, UserOpService } from "../src/index.js";

describe("Ryvra Accounts scaffold", () => {
  it("exposes initial service stubs", async () => {
    const userOpService = new UserOpService();
    const sessionKeyManager = new SessionKeyManager();
    const pdp = new PolicyDecisionPoint();

    const validation = await userOpService.validateUserOp({
      accountId: "acc_1",
      userOperation: {},
      expectedNonce: "0",
    });

    const issued = await sessionKeyManager.issueSessionKey({
      accountId: "acc_1",
      sessionPublicKey: "0xabc",
      validAfter: "2026-01-01T00:00:00Z",
      validUntil: "2026-01-01T01:00:00Z",
      policyRef: "policy-basic",
    });

    const policy = await pdp.evaluate({
      accountId: "acc_1",
      action: "userop.submit",
      context: {},
    });

    expect(validation).toHaveProperty("valid");
    expect(issued).toHaveProperty("accountId", "acc_1");
    expect(policy).toHaveProperty("allow", false);
  });
});
