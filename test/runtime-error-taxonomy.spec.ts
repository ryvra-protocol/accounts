import { describe, expect, it } from "vitest";
import { UserOpService } from "../src/index.js";

describe("runtime error taxonomy", () => {
  const baseRequest = {
    account_id: "acc_1",
    reference_id: "ref_1",
    idempotency_key: "idem_1",
    correlation_id: "corr_1",
    policy_version: "policy.v1",
    expected_nonce: "1",
    userOperation: {
      sender: "0xabababababababababababababababababababab",
      nonce: "1",
      callData: "0x1234",
    },
  };

  it("returns INVALID_REQUEST for chain mismatch", async () => {
    const service = new UserOpService({ chainId: 1, knownAccounts: ["acc_1"] });
    const result = await service.validateUserOp({ ...baseRequest, chain_id: 10 });
    expect(result).toHaveProperty("code", "INVALID_REQUEST");
  });

  it("returns INVALID_REQUEST for entrypoint mismatch", async () => {
    const service = new UserOpService({
      chainId: 1,
      entryPoint: "0x0000000071727de22e5e9d8baf0edac6f37da032",
      knownAccounts: ["acc_1"],
    });
    const result = await service.validateUserOp({
      ...baseRequest,
      entry_point: "0x0000000000000000000000000000000000000001",
    });
    expect(result).toHaveProperty("code", "INVALID_REQUEST");
  });

  it("returns INVALID_REQUEST for unknown account", async () => {
    const service = new UserOpService({ chainId: 1, knownAccounts: ["acc_other"] });
    const result = await service.validateUserOp(baseRequest);
    expect(result).toHaveProperty("code", "INVALID_REQUEST");
  });

  it("returns SPONSORSHIP_DENIED when paymaster sponsorship fails", async () => {
    const service = new UserOpService({
      chainId: 1,
      knownAccounts: ["acc_1"],
      paymasterClient: {
        sponsorUserOperation: async () => ({
          sponsored: false,
          reason: "budget exceeded",
        }),
      },
    });

    const result = await service.submitUserOp({
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
    });

    expect(result).toHaveProperty("code", "SPONSORSHIP_DENIED");
  });
});
