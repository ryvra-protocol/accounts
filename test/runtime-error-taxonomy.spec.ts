import { describe, expect, it } from "vitest";
import {
  UserOpRuntimeError,
  canonicalizeUserOperation,
  validateRuntimeContext,
  validateSponsorshipConstraints,
  validateUserOperationShape,
} from "../src/index.js";

function expectRuntimeCode(fn: () => void, code: UserOpRuntimeError["code"]): void {
  try {
    fn();
    throw new Error("expected UserOpRuntimeError");
  } catch (error) {
    expect(error).toBeInstanceOf(UserOpRuntimeError);
    expect((error as UserOpRuntimeError).code).toBe(code);
  }
}

describe("runtime error taxonomy", () => {
  const canonical = canonicalizeUserOperation({
    sender: "0xabababababababababababababababababababab",
    nonce: "1",
    callData: "0x1234",
    callGasLimit: "21000",
    verificationGasLimit: "30000",
    preVerificationGas: "22000",
    maxFeePerGas: "100",
    maxPriorityFeePerGas: "2",
    signature: "0x" + "11".repeat(65),
  });

  it("INVALID_CHAIN", () => {
    expectRuntimeCode(
      () =>
        validateRuntimeContext({
          chainId: 10,
          expectedChainId: 1,
          entryPoint: "0x0000000071727de22e5e9d8baf0edac6f37da032",
          expectedEntryPoint: "0x0000000071727de22e5e9d8baf0edac6f37da032",
          account_id: "acc_1",
          knownAccounts: new Set(["acc_1"]),
          paymasterEnabled: false,
        }),
      "INVALID_CHAIN",
    );
  });

  it("INVALID_ENTRYPOINT", () => {
    expectRuntimeCode(
      () =>
        validateRuntimeContext({
          chainId: 1,
          expectedChainId: 1,
          entryPoint: "0x0000000000000000000000000000000000000001",
          expectedEntryPoint: "0x0000000071727de22e5e9d8baf0edac6f37da032",
          account_id: "acc_1",
          knownAccounts: new Set(["acc_1"]),
          paymasterEnabled: false,
        }),
      "INVALID_ENTRYPOINT",
    );
  });

  it("INVALID_ACCOUNT", () => {
    expectRuntimeCode(
      () =>
        validateRuntimeContext({
          chainId: 1,
          expectedChainId: 1,
          entryPoint: "0x0000000071727de22e5e9d8baf0edac6f37da032",
          expectedEntryPoint: "0x0000000071727de22e5e9d8baf0edac6f37da032",
          account_id: "acc_1",
          knownAccounts: new Set(["acc_other"]),
          paymasterEnabled: false,
        }),
      "INVALID_ACCOUNT",
    );
  });

  it("INVALID_PAYMASTER", () => {
    expectRuntimeCode(
      () =>
        validateSponsorshipConstraints(
          {
            account_id: "acc_1",
            reference_id: "ref_1",
            correlation_id: "corr_1",
            policy_version: "policy.v2",
            chainId: 1,
            entryPoint: "0x0000000071727de22e5e9d8baf0edac6f37da032",
            userOperation: canonical,
            estimatedMaxCostWei: "10",
          },
          {
            requiredPolicyVersion: "policy.v1",
          },
        ),
      "INVALID_PAYMASTER",
    );
  });

  it("INVALID_USER_OPERATION", () => {
    expectRuntimeCode(
      () => validateUserOperationShape({ ...canonical, sender: "0x1234" }, false),
      "INVALID_USER_OPERATION",
    );
  });

  it("INVALID_SIGNATURE", () => {
    expectRuntimeCode(
      () => validateUserOperationShape({ ...canonical, signature: "0x1234" }, false),
      "INVALID_SIGNATURE",
    );
  });

  it("INVALID_GAS_FIELDS", () => {
    expectRuntimeCode(
      () => validateUserOperationShape({ ...canonical, maxPriorityFeePerGas: "0x200" }, false),
      "INVALID_GAS_FIELDS",
    );
  });

  it("INVALID_NONCE_DOMAIN", () => {
    const oversizedNonce = "0x" + "ff".repeat(33);
    expectRuntimeCode(
      () => validateUserOperationShape({ ...canonical, nonce: oversizedNonce }, false),
      "INVALID_NONCE_DOMAIN",
    );
  });
});
