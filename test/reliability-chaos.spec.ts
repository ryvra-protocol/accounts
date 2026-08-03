import { describe, expect, it } from "vitest";
import { InMemoryUserOpMetrics, UserOpRuntimeError, UserOpService } from "../src/index.js";

function buildUserOperation() {
  return {
    sender: "0xabababababababababababababababababababab",
    nonce: "1",
    callData: "0x1234",
    callGasLimit: "21000",
    verificationGasLimit: "30000",
    preVerificationGas: "22000",
    maxFeePerGas: "100",
    maxPriorityFeePerGas: "2",
    signature: "0x" + "11".repeat(65),
  };
}

describe("reliability and chaos hardening", () => {
  it("retries retriable bundler send failures with bounded backoff", async () => {
    let attempts = 0;
    const sleepDurations: number[] = [];

    const service = new UserOpService({
      chainId: 1,
      knownAccounts: ["acc_1"],
      retryPolicy: { maxAttempts: 3, baseDelayMs: 10, maxDelayMs: 50, jitterMs: 3 },
      random: () => 0,
      sleep: async (ms) => {
        sleepDurations.push(ms);
      },
      bundlerClient: {
        simulateUserOperation: async () => ({ ok: true }),
        sendUserOperation: async () => {
          attempts += 1;
          if (attempts < 3) {
            throw new UserOpRuntimeError("UPSTREAM_UNAVAILABLE", "temporary");
          }
          return { userOpHash: "0x" + "11".repeat(32) };
        },
        getUserOperationByHash: async () => ({ ok: true }),
        getUserOperationReceipt: async () => ({
          userOpHash: "0x" + "11".repeat(32),
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
      userOperation: buildUserOperation(),
    });

    expect(response).toHaveProperty("accepted", true);
    expect(attempts).toBe(3);
    expect(sleepDurations).toEqual([10, 20]);
  });

  it("does not retry terminal bundler errors", async () => {
    let attempts = 0;

    const service = new UserOpService({
      chainId: 1,
      knownAccounts: ["acc_1"],
      retryPolicy: { maxAttempts: 4, baseDelayMs: 10, maxDelayMs: 50, jitterMs: 2 },
      bundlerClient: {
        simulateUserOperation: async () => ({ ok: true }),
        sendUserOperation: async () => {
          attempts += 1;
          throw new UserOpRuntimeError("BUNDLER_ERROR", "terminal");
        },
        getUserOperationByHash: async () => null,
        getUserOperationReceipt: async () => null,
      },
    });

    const response = await service.submitUserOp({
      account_id: "acc_1",
      reference_id: "ref_1",
      idempotency_key: "idem_1",
      correlation_id: "corr_1",
      policy_version: "policy.v1",
      userOperation: buildUserOperation(),
    });

    expect(response).toHaveProperty("code", "INTERNAL_ERROR");
    expect(attempts).toBe(1);
  });

  it("returns stale pending when receipt never materializes before timeout", async () => {
    let now = 0;
    const metrics = new InMemoryUserOpMetrics();

    const service = new UserOpService({
      chainId: 1,
      knownAccounts: ["acc_1"],
      pendingTimeoutMs: 1000,
      receiptPollIntervalMs: 200,
      clockNowMs: () => now,
      sleep: async (ms) => {
        now += ms;
      },
      random: () => 0,
      metrics,
      bundlerClient: {
        simulateUserOperation: async () => ({ ok: true }),
        sendUserOperation: async () => ({ userOpHash: "0x" + "22".repeat(32) }),
        getUserOperationByHash: async () => ({ pending: true }),
        getUserOperationReceipt: async () => null,
      },
    });

    const response = await service.submitUserOp({
      account_id: "acc_1",
      reference_id: "ref_2",
      idempotency_key: "idem_2",
      correlation_id: "corr_2",
      policy_version: "policy.v1",
      userOperation: buildUserOperation(),
    });

    expect(response).toHaveProperty("accepted", true);
    expect(response).toHaveProperty("status", "stale_pending");
    expect(response).toHaveProperty("outcome_code", "MISSING_RECEIPT");
    expect(metrics.counters.userop_stale_pending_total).toBe(1);
  });
});
