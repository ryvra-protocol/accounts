import { describe, expect, it } from "vitest";
import {
  buildSignatureReadyPayload,
  canonicalizeUserOperation,
  stableStringify,
  toCanonicalUserOperationObject,
  computeUserOperationHash,
} from "../src/index.js";

describe("UserOperation builder canonicalization", () => {
  it("produces deterministic canonical fields and ordering (golden)", () => {
    const canonical = canonicalizeUserOperation({
      sender: "0xABaBaBaBABabABabAbAbABAbABabababaBaBABaB",
      nonce: "15",
      callData: "0xabc",
      maxFeePerGas: "0x0a",
      signature: "0x1234",
    });

    expect(canonical).toEqual({
      sender: "0xabababababababababababababababababababab",
      nonce: "0xf",
      initCode: "0x",
      callData: "0x0abc",
      callGasLimit: "0x0",
      verificationGasLimit: "0x0",
      preVerificationGas: "0x0",
      maxFeePerGas: "0xa",
      maxPriorityFeePerGas: "0x0",
      paymasterAndData: "0x",
      signature: "0x1234",
    });

    const ordered = toCanonicalUserOperationObject(canonical);
    expect(Object.keys(ordered)).toEqual([
      "sender",
      "nonce",
      "initCode",
      "callData",
      "callGasLimit",
      "verificationGasLimit",
      "preVerificationGas",
      "maxFeePerGas",
      "maxPriorityFeePerGas",
      "paymasterAndData",
      "signature",
    ]);

    expect(stableStringify(ordered)).toBe(
      '{"callData":"0x0abc","callGasLimit":"0x0","initCode":"0x","maxFeePerGas":"0xa","maxPriorityFeePerGas":"0x0","nonce":"0xf","paymasterAndData":"0x","preVerificationGas":"0x0","sender":"0xabababababababababababababababababababab","signature":"0x1234","verificationGasLimit":"0x0"}',
    );
  });


  it("computes deterministic userOp hash across equivalent numeric encodings", async () => {
    const paramsA = {
      chainId: 1,
      entryPoint: "0x0000000071727de22e5e9d8baf0edac6f37da032",
      userOperation: {
        sender: "0xabababababababababababababababababababab",
        nonce: "15",
        callData: "0x1234",
        callGasLimit: "0x5208",
        verificationGasLimit: "0x7530",
        preVerificationGas: "22000",
        maxFeePerGas: "0x64",
        maxPriorityFeePerGas: "2",
        signature: "0x" + "11".repeat(65),
      },
    };
    const paramsB = {
      ...paramsA,
      userOperation: {
        ...paramsA.userOperation,
        nonce: 15,
        callGasLimit: 21000,
        verificationGasLimit: 30000,
        maxFeePerGas: 100,
      },
    };

    const [hashA, hashB] = await Promise.all([
      computeUserOperationHash(paramsA),
      computeUserOperationHash(paramsB),
    ]);

    expect(hashA).toBe(hashB);
    expect(hashA).toMatch(/^0x[0-9a-f]{64}$/);
  });

  it("creates signature-ready payload with stripped signature", async () => {
    const payload = await buildSignatureReadyPayload({
      chainId: 1,
      entryPoint: "0x0000000071727de22e5e9d8baf0edac6f37da032",
      userOperation: {
        sender: "0xabababababababababababababababababababab",
        nonce: "1",
        callData: "0x1234",
        signature: "0xdeadbeef",
      },
    });

    expect(payload.canonicalUserOperation.signature).toBe("0x");
    expect(payload.payloadHash).toMatch(/^0x[0-9a-f]{64}$/);
  });
});
