import { describe, expect, it } from "vitest";
import { UserOpService } from "../src/index.js";

describe("replay and idempotency boundaries", () => {
  it("returns same result for idempotent duplicate submit", async () => {
    const service = new UserOpService({ chainId: 1, knownAccounts: ["acc_1"] });

    const request = {
      account_id: "acc_1",
      reference_id: "ref_1",
      idempotency_key: "idem_1",
      correlation_id: "corr_1",
      policy_version: "policy.v1",
      userOperation: {
        sender: "0xabababababababababababababababababababab",
        nonce: "1",
        callData: "0x1234",
      },
    };

    const first = await service.submitUserOp(request);
    const second = await service.submitUserOp(request);

    expect(first).toHaveProperty("accepted", true);
    expect(second).toEqual(first);
  });

  it("detects nonce reuse with different idempotency key", async () => {
    const service = new UserOpService({ chainId: 1, knownAccounts: ["acc_1"] });

    const first = await service.submitUserOp({
      account_id: "acc_1",
      reference_id: "ref_1",
      idempotency_key: "idem_1",
      correlation_id: "corr_1",
      policy_version: "policy.v1",
      userOperation: {
        sender: "0xabababababababababababababababababababab",
        nonce: "5",
        callData: "0x5678",
      },
    });

    const second = await service.submitUserOp({
      account_id: "acc_1",
      reference_id: "ref_2",
      idempotency_key: "idem_2",
      correlation_id: "corr_2",
      policy_version: "policy.v1",
      userOperation: {
        sender: "0xabababababababababababababababababababab",
        nonce: "5",
        callData: "0x1234",
      },
    });

    expect(first).toHaveProperty("accepted", true);
    expect(second).toHaveProperty("code", "NONCE_CONFLICT");
  });

  it("flags replayed userOp hash in validation after submission", async () => {
    const service = new UserOpService({ chainId: 1, knownAccounts: ["acc_1"] });

    await service.submitUserOp({
      account_id: "acc_1",
      reference_id: "ref_submit",
      idempotency_key: "idem_submit",
      correlation_id: "corr_submit",
      policy_version: "policy.v1",
      userOperation: {
        sender: "0xabababababababababababababababababababab",
        nonce: "10",
        callData: "0x1234",
      },
    });

    const result = await service.validateUserOp({
      account_id: "acc_1",
      reference_id: "ref_validate",
      idempotency_key: "idem_validate",
      correlation_id: "corr_validate",
      policy_version: "policy.v1",
      expected_nonce: "10",
      userOperation: {
        sender: "0xabababababababababababababababababababab",
        nonce: "10",
        callData: "0x1234",
      },
    });

    expect(result).toHaveProperty("code", "REPLAY_DETECTED");
  });
});
