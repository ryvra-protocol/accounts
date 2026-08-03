import { UserOpRuntimeError } from "./errors.js";
import type { UserOperation } from "./user-operation-builder.js";

export interface RuntimeValidationContext {
  chainId: number;
  expectedChainId: number;
  entryPoint: string;
  expectedEntryPoint: string;
  account_id: string;
  knownAccounts: ReadonlySet<string>;
  paymasterEnabled: boolean;
}

const ADDRESS_PATTERN = /^0x[0-9a-f]{40}$/;
const HEX_PATTERN = /^0x[0-9a-f]*$/;
const SIGNATURE_PATTERN = /^0x([0-9a-f]{130}|)$/;

function ensureHex(value: string, field: string): void {
  if (!HEX_PATTERN.test(value)) {
    throw new UserOpRuntimeError("INVALID_USER_OPERATION", `${field} must be canonical 0x hex`);
  }
}

function parseHexToBigInt(value: string, field: string): bigint {
  ensureHex(value, field);
  return BigInt(value);
}

function assertGasInvariants(userOperation: UserOperation): void {
  const callGasLimit = parseHexToBigInt(userOperation.callGasLimit, "callGasLimit");
  const verificationGasLimit = parseHexToBigInt(
    userOperation.verificationGasLimit,
    "verificationGasLimit",
  );
  const preVerificationGas = parseHexToBigInt(userOperation.preVerificationGas, "preVerificationGas");
  const maxFeePerGas = parseHexToBigInt(userOperation.maxFeePerGas, "maxFeePerGas");
  const maxPriorityFeePerGas = parseHexToBigInt(
    userOperation.maxPriorityFeePerGas,
    "maxPriorityFeePerGas",
  );

  if (callGasLimit === 0n || verificationGasLimit === 0n || preVerificationGas === 0n) {
    throw new UserOpRuntimeError("INVALID_GAS_FIELDS", "gas limit fields must be non-zero");
  }

  if (maxFeePerGas === 0n || maxPriorityFeePerGas === 0n) {
    throw new UserOpRuntimeError("INVALID_GAS_FIELDS", "fee fields must be non-zero");
  }

  if (maxPriorityFeePerGas > maxFeePerGas) {
    throw new UserOpRuntimeError(
      "INVALID_GAS_FIELDS",
      "maxPriorityFeePerGas cannot exceed maxFeePerGas",
    );
  }
}

function assertNonceDomain(userOperation: UserOperation): void {
  const nonce = parseHexToBigInt(userOperation.nonce, "nonce");
  const nonceDomain = nonce >> 64n;
  if (nonceDomain > (1n << 128n) - 1n) {
    throw new UserOpRuntimeError("INVALID_NONCE_DOMAIN", "nonce domain exceeds 128 bits");
  }
}

function assertSignature(userOperation: UserOperation): void {
  if (!SIGNATURE_PATTERN.test(userOperation.signature)) {
    throw new UserOpRuntimeError(
      "INVALID_SIGNATURE",
      "signature must be empty or 65-byte canonical hex",
    );
  }
}

export function validateRuntimeContext(context: RuntimeValidationContext): void {
  if (context.chainId !== context.expectedChainId) {
    throw new UserOpRuntimeError("INVALID_CHAIN", "unexpected chain id", {
      chainId: context.chainId,
      expectedChainId: context.expectedChainId,
    });
  }

  if (context.entryPoint.toLowerCase() !== context.expectedEntryPoint.toLowerCase()) {
    throw new UserOpRuntimeError("INVALID_ENTRYPOINT", "unexpected entrypoint", {
      entryPoint: context.entryPoint,
      expectedEntryPoint: context.expectedEntryPoint,
    });
  }

  if (!context.knownAccounts.has(context.account_id)) {
    throw new UserOpRuntimeError("INVALID_ACCOUNT", "unknown account", {
      account_id: context.account_id,
    });
  }
}

export function validateUserOperationShape(userOperation: UserOperation, paymasterRequired: boolean): void {
  if (!ADDRESS_PATTERN.test(userOperation.sender)) {
    throw new UserOpRuntimeError("INVALID_USER_OPERATION", "sender is not a canonical address", {
      sender: userOperation.sender,
    });
  }

  ensureHex(userOperation.callData, "callData");
  ensureHex(userOperation.initCode, "initCode");

  assertNonceDomain(userOperation);
  assertGasInvariants(userOperation);
  assertSignature(userOperation);

  if (paymasterRequired && userOperation.paymasterAndData === "0x") {
    throw new UserOpRuntimeError("INVALID_PAYMASTER", "paymaster required but paymasterAndData is empty");
  }

  if (userOperation.paymasterAndData !== "0x") {
    ensureHex(userOperation.paymasterAndData, "paymasterAndData");
    if (userOperation.paymasterAndData.length < 42) {
      throw new UserOpRuntimeError(
        "INVALID_PAYMASTER",
        "paymasterAndData must include a 20-byte paymaster address",
      );
    }
  }
}
