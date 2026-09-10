import { describe, expect, it } from "vitest";
import { AgentValidator, SessionKeyManager, UserOpService } from "../src/index.js";

function nonceWithDomain(domain: bigint, sequence: bigint): string {
  return ((domain << 64n) + sequence).toString(10);
}

function buildUserOperation(nonce: string) {
  return {
    sender: "0xabababababababababababababababababababab",
    nonce,
    callData: "0xa9059cbb0000000000000000000000000000000000000000000000000000000000000001",
    callGasLimit: "21000",
    verificationGasLimit: "30000",
    preVerificationGas: "22000",
    maxFeePerGas: "100",
    maxPriorityFeePerGas: "2",
    signature: "0x" + "11".repeat(65),
  };
}

function buildAgentContext(params?: {
  replayKey?: string;
  functionSelector?: string;
  asset?: string;
  action?: string;
  amount?: string;
  policyHash?: string;
  policyVersion?: string;
}): NonNullable<Parameters<UserOpService["submitUserOp"]>[0]["agent_context"]> {
  return {
    initiated_by_agent: true,
    agent_id: "agent_1",
    mandate_id: "mandate_1",
    mandate_version: "v1",
    capability_id: "cap_1",
    policy_hash: params?.policyHash ?? "0x" + "aa".repeat(32),
    risk_assessment_id: "risk_1",
    session_key_id: "sk_1",
    replay_protection_key: params?.replayKey ?? "replay_1",
    operation: {
      target_contract: "0xcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcd",
      function_selector: params?.functionSelector ?? "0xa9059cbb",
      asset: params?.asset ?? "0xefefefefefefefefefefefefefefefefefefefef",
      action: params?.action ?? "transfer",
      amount: params?.amount ?? "10",
    },
  };
}

function setupService(overrides?: {
  mandateValidUntil?: string;
  sessionValidUntil?: string;
  perTxMaxAmount?: string;
  cumulativeMaxAmount?: string;
  cumulativeWindowMs?: number;
}) {
  const validator = new AgentValidator();
  validator.registerAgent({
    agent_id: "agent_1",
    status: "ACTIVE",
    mandate_id: "mandate_1",
    policy_version: "policy.v1",
    policy_hash: "0x" + "aa".repeat(32),
    risk_assessment_id: "risk_1",
  });
  validator.registerMandate({
    mandate_id: "mandate_1",
    version: "v1",
    status: "ACTIVE",
    valid_after: "2020-01-01T00:00:00Z",
    valid_until: overrides?.mandateValidUntil ?? "2099-01-01T00:00:00Z",
    capability_ids: ["cap_1"],
  });
  validator.registerCapability({
    capability_id: "cap_1",
    mandate_id: "mandate_1",
    status: "ACTIVE",
    policy_version: "policy.v1",
    policy_hash: "0x" + "aa".repeat(32),
    allowed_chain_ids: [1],
    allowed_contracts: ["0xcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcd"],
    allowed_function_selectors: ["0xa9059cbb"],
    allowed_assets: ["0xefefefefefefefefefefefefefefefefefefefef"],
    allowed_actions: ["transfer"],
    per_tx_max_amount: overrides?.perTxMaxAmount ?? "100",
    cumulative_limit: {
      max_amount: overrides?.cumulativeMaxAmount ?? "1000",
      window_ms: overrides?.cumulativeWindowMs ?? 60_000,
    },
  });
  validator.registerSessionKey({
    session_key_id: "sk_1",
    account_id: "acc_1",
    agent_id: "agent_1",
    mandate_id: "mandate_1",
    capability_ids: ["cap_1"],
    nonce_domain: "0x1",
    valid_after: "2020-01-01T00:00:00Z",
    valid_until: overrides?.sessionValidUntil ?? "2099-01-01T00:00:00Z",
    policy_version: "policy.v1",
    policy_hash: "0x" + "aa".repeat(32),
    authority_scope: "capability_scoped",
  });

  const service = new UserOpService({
    chainId: 1,
    knownAccounts: ["acc_1"],
    agentValidator: validator,
  });

  return { service, validator };
}

describe("RFC-0006/0007 agent enforcement", () => {
  it("accepts valid scoped agent operation", async () => {
    const { service } = setupService();

    const response = await service.submitUserOp({
      account_id: "acc_1",
      reference_id: "ref_1",
      idempotency_key: "idem_1",
      correlation_id: "corr_1",
      policy_version: "policy.v1",
      userOperation: buildUserOperation(nonceWithDomain(1n, 1n)),
      agent_context: buildAgentContext(),
    });

    expect(response).toHaveProperty("accepted", true);
  });

  it("rejects suspended agent", async () => {
    const { service, validator } = setupService();
    validator.suspendAgent("agent_1");

    const response = await service.submitUserOp({
      account_id: "acc_1",
      reference_id: "ref_2",
      idempotency_key: "idem_2",
      correlation_id: "corr_2",
      policy_version: "policy.v1",
      userOperation: buildUserOperation(nonceWithDomain(1n, 2n)),
      agent_context: buildAgentContext({ replayKey: "replay_2" }),
    });

    expect(response).toHaveProperty("code", "POLICY_DENIED");
  });

  it("rejects expired mandate", async () => {
    const { service } = setupService({ mandateValidUntil: "2021-01-01T00:00:00Z" });

    const response = await service.submitUserOp({
      account_id: "acc_1",
      reference_id: "ref_3",
      idempotency_key: "idem_3",
      correlation_id: "corr_3",
      policy_version: "policy.v1",
      userOperation: buildUserOperation(nonceWithDomain(1n, 3n)),
      agent_context: buildAgentContext({ replayKey: "replay_3" }),
    });

    expect(response).toHaveProperty("code", "POLICY_DENIED");
  });

  it("rejects expired or revoked session key", async () => {
    const expired = setupService({ sessionValidUntil: "2021-01-01T00:00:00Z" });
    const expiredResult = await expired.service.submitUserOp({
      account_id: "acc_1",
      reference_id: "ref_4",
      idempotency_key: "idem_4",
      correlation_id: "corr_4",
      policy_version: "policy.v1",
      userOperation: buildUserOperation(nonceWithDomain(1n, 4n)),
      agent_context: buildAgentContext({ replayKey: "replay_4" }),
    });
    expect(expiredResult).toHaveProperty("code", "POLICY_DENIED");

    const revoked = setupService();
    revoked.validator.revokeSessionKey("sk_1");
    const revokedResult = await revoked.service.submitUserOp({
      account_id: "acc_1",
      reference_id: "ref_5",
      idempotency_key: "idem_5",
      correlation_id: "corr_5",
      policy_version: "policy.v1",
      userOperation: buildUserOperation(nonceWithDomain(1n, 5n)),
      agent_context: buildAgentContext({ replayKey: "replay_5" }),
    });
    expect(revokedResult).toHaveProperty("code", "POLICY_DENIED");
  });

  it("rejects disallowed selector", async () => {
    const { service } = setupService();

    const response = await service.submitUserOp({
      account_id: "acc_1",
      reference_id: "ref_6",
      idempotency_key: "idem_6",
      correlation_id: "corr_6",
      policy_version: "policy.v1",
      userOperation: buildUserOperation(nonceWithDomain(1n, 6n)),
      agent_context: buildAgentContext({ replayKey: "replay_6", functionSelector: "0x095ea7b3" }),
    });

    expect(response).toHaveProperty("code", "POLICY_DENIED");
  });

  it("rejects disallowed asset/action", async () => {
    const { service } = setupService();

    const response = await service.submitUserOp({
      account_id: "acc_1",
      reference_id: "ref_7",
      idempotency_key: "idem_7",
      correlation_id: "corr_7",
      policy_version: "policy.v1",
      userOperation: buildUserOperation(nonceWithDomain(1n, 7n)),
      agent_context: buildAgentContext({
        replayKey: "replay_7",
        asset: "0x0101010101010101010101010101010101010101",
        action: "approve",
      }),
    });

    expect(response).toHaveProperty("code", "POLICY_DENIED");
  });

  it("rejects amount limit exceeded", async () => {
    const { service } = setupService({ perTxMaxAmount: "20" });

    const response = await service.submitUserOp({
      account_id: "acc_1",
      reference_id: "ref_8",
      idempotency_key: "idem_8",
      correlation_id: "corr_8",
      policy_version: "policy.v1",
      userOperation: buildUserOperation(nonceWithDomain(1n, 8n)),
      agent_context: buildAgentContext({ replayKey: "replay_8", amount: "25" }),
    });

    expect(response).toHaveProperty("code", "POLICY_DENIED");
  });

  it("rejects cumulative limit exceeded", async () => {
    const { service } = setupService({ cumulativeMaxAmount: "100" });

    const first = await service.submitUserOp({
      account_id: "acc_1",
      reference_id: "ref_9a",
      idempotency_key: "idem_9a",
      correlation_id: "corr_9a",
      policy_version: "policy.v1",
      userOperation: buildUserOperation(nonceWithDomain(1n, 9n)),
      agent_context: buildAgentContext({ replayKey: "replay_9a", amount: "60" }),
    });
    const second = await service.submitUserOp({
      account_id: "acc_1",
      reference_id: "ref_9b",
      idempotency_key: "idem_9b",
      correlation_id: "corr_9b",
      policy_version: "policy.v1",
      userOperation: buildUserOperation(nonceWithDomain(1n, 10n)),
      agent_context: buildAgentContext({ replayKey: "replay_9b", amount: "50" }),
    });

    expect(first).toHaveProperty("accepted", true);
    expect(second).toHaveProperty("code", "POLICY_DENIED");
  });

  it("rejects nonce domain mismatch", async () => {
    const { service } = setupService();

    const response = await service.submitUserOp({
      account_id: "acc_1",
      reference_id: "ref_10",
      idempotency_key: "idem_10",
      correlation_id: "corr_10",
      policy_version: "policy.v1",
      userOperation: buildUserOperation(nonceWithDomain(2n, 1n)),
      agent_context: buildAgentContext({ replayKey: "replay_10" }),
    });

    expect(response).toHaveProperty("code", "POLICY_DENIED");
  });

  it("rejects policy hash/version mismatch", async () => {
    const { service } = setupService();

    const response = await service.submitUserOp({
      account_id: "acc_1",
      reference_id: "ref_11",
      idempotency_key: "idem_11",
      correlation_id: "corr_11",
      policy_version: "policy.v2",
      userOperation: buildUserOperation(nonceWithDomain(1n, 11n)),
      agent_context: buildAgentContext({ replayKey: "replay_11", policyHash: "0x" + "bb".repeat(32) }),
    });

    expect(response).toHaveProperty("code", "POLICY_DENIED");
  });

  it("rejects replay attempts", async () => {
    const { service } = setupService();

    const first = await service.submitUserOp({
      account_id: "acc_1",
      reference_id: "ref_12a",
      idempotency_key: "idem_12a",
      correlation_id: "corr_12a",
      policy_version: "policy.v1",
      userOperation: buildUserOperation(nonceWithDomain(1n, 12n)),
      agent_context: buildAgentContext({ replayKey: "replay_fixed" }),
    });
    const second = await service.submitUserOp({
      account_id: "acc_1",
      reference_id: "ref_12b",
      idempotency_key: "idem_12b",
      correlation_id: "corr_12b",
      policy_version: "policy.v1",
      userOperation: buildUserOperation(nonceWithDomain(1n, 13n)),
      agent_context: buildAgentContext({ replayKey: "replay_fixed" }),
    });

    expect(first).toHaveProperty("accepted", true);
    expect(second).toHaveProperty("code", "REPLAY_DETECTED");
  });

  it("prevents owner-level key path for agents", async () => {
    const manager = new SessionKeyManager();

    const issued = await manager.issueSessionKey({
      account_id: "acc_1",
      agent_id: "agent_1",
      mandate_id: "mandate_1",
      capability_ids: ["cap_1"],
      nonce_domain: "0x1",
      reference_id: "ref_13",
      idempotency_key: "idem_13",
      correlation_id: "corr_13",
      policy_version: "policy.v1",
      policy_hash: "0x" + "aa".repeat(32),
      risk_assessment_id: "risk_1",
      session_public_key: "0xabc",
      valid_after: "2020-01-01T00:00:00Z",
      valid_until: "2099-01-01T00:00:00Z",
      authority_scope: "owner",
    });

    expect(issued).toHaveProperty("code", "UNAUTHORIZED");
  });

  it("is race-resistant for cumulative limits", async () => {
    const { service } = setupService({ cumulativeMaxAmount: "100" });

    const [a, b] = await Promise.all([
      service.submitUserOp({
        account_id: "acc_1",
        reference_id: "ref_14a",
        idempotency_key: "idem_14a",
        correlation_id: "corr_14a",
        policy_version: "policy.v1",
        userOperation: buildUserOperation(nonceWithDomain(1n, 14n)),
        agent_context: buildAgentContext({ replayKey: "replay_14a", amount: "60" }),
      }),
      service.submitUserOp({
        account_id: "acc_1",
        reference_id: "ref_14b",
        idempotency_key: "idem_14b",
        correlation_id: "corr_14b",
        policy_version: "policy.v1",
        userOperation: buildUserOperation(nonceWithDomain(1n, 15n)),
        agent_context: buildAgentContext({ replayKey: "replay_14b", amount: "60" }),
      }),
    ]);

    const accepted = [a, b].filter((entry) => "accepted" in entry && entry.accepted === true);
    const denied = [a, b].filter((entry) => "code" in entry && entry.code === "POLICY_DENIED");

    expect(accepted).toHaveLength(1);
    expect(denied).toHaveLength(1);
  });
});
