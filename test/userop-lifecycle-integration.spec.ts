import { describe, expect, it } from "vitest";
import { InMemoryUserOpLifecycleObserver, InMemoryUserOpMetrics, UserOpService } from "../src/index.js";

describe("UserOp submit to receipt lifecycle", () => {
  it("submits, simulates, and emits lifecycle events through receipt inclusion", async () => {
    const observer = new InMemoryUserOpLifecycleObserver();
    const metrics = new InMemoryUserOpMetrics();
    let sentHash: string | undefined;

    const service = new UserOpService({
      chainId: 1,
      knownAccounts: ["acc_1"],
      lifecycleObserver: observer,
      metrics,
      bundlerClient: {
        simulateUserOperation: async () => ({ ok: true }),
        sendUserOperation: async () => {
          sentHash = "0x" + "11".repeat(32);
          return { userOpHash: sentHash };
        },
        getUserOperationByHash: async () => ({ ok: true }),
        getUserOperationReceipt: async () => ({
          userOpHash: sentHash ?? "0x" + "11".repeat(32),
          sender: "0xabababababababababababababababababababab",
          nonce: "0x1",
          success: true,
        }),
      },
    });

    const response = await service.submitUserOp({
      account_id: "acc_1",
      reference_id: "ref_1",
      idempotency_key: "idem_1",
      correlation_id: "corr_1",
      policy_version: "policy.v1",
      userOperation: {
        sender: "0xabababababababababababababababababababab",
        nonce: "1",
        callData: "0x1234",
        callGasLimit: "21000",
        verificationGasLimit: "30000",
        preVerificationGas: "22000",
        maxFeePerGas: "100",
        maxPriorityFeePerGas: "2",
        signature: "0x" + "11".repeat(65),
      },
    });

    expect(response).toHaveProperty("accepted", true);
    expect(response).toHaveProperty("status", "included");
    expect(response).toHaveProperty("user_op_hash", "0x" + "11".repeat(32));
    expect(observer.events.map((event) => event.type)).toEqual([
      "userop.simulated",
      "userop.submitted",
      "userop.included",
    ]);
    expect(observer.events[0]).not.toHaveProperty("payload");
    expect(metrics.counters.userop_submit_total).toBe(1);
    expect(metrics.userOpTimeToInclusionMs.length).toBe(1);
  });
});
