const USER_OPERATION_FIELD_ORDER = [
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
] as const;

export type UserOperationField = (typeof USER_OPERATION_FIELD_ORDER)[number];

export interface UserOperation {
  sender: string;
  nonce: string;
  initCode: string;
  callData: string;
  callGasLimit: string;
  verificationGasLimit: string;
  preVerificationGas: string;
  maxFeePerGas: string;
  maxPriorityFeePerGas: string;
  paymasterAndData: string;
  signature: string;
}

export interface UserOperationBuilderInput {
  sender: string;
  nonce: string | number | bigint;
  initCode?: string;
  callData: string;
  callGasLimit?: string | number | bigint;
  verificationGasLimit?: string | number | bigint;
  preVerificationGas?: string | number | bigint;
  maxFeePerGas?: string | number | bigint;
  maxPriorityFeePerGas?: string | number | bigint;
  paymasterAndData?: string;
  signature?: string;
}

export interface SignatureReadyPayload {
  entryPoint: string;
  chainId: number;
  canonicalUserOperation: Omit<UserOperation, "signature"> & { signature: "0x" };
  payload: string;
  payloadHash: string;
}

const HEX_PATTERN = /^0x[0-9a-fA-F]*$/;

function normalizeHex(value: string, field: string): string {
  if (!HEX_PATTERN.test(value)) {
    throw new Error(`${field} must be a 0x-prefixed hex string`);
  }

  const body = value.slice(2).toLowerCase();
  if (body.length === 0) {
    return "0x";
  }

  const evenBody = body.length % 2 === 0 ? body : `0${body}`;
  return `0x${evenBody}`;
}

function normalizeAddress(value: string, field: string): string {
  const normalized = normalizeHex(value, field);
  if (normalized.length !== 42) {
    throw new Error(`${field} must be 20-byte address`);
  }

  return normalized;
}

function normalizeBigIntHex(value: string | number | bigint, field: string): string {
  let parsed: bigint;
  if (typeof value === "bigint") {
    parsed = value;
  } else if (typeof value === "number") {
    if (!Number.isInteger(value) || value < 0) {
      throw new Error(`${field} must be non-negative integer`);
    }
    parsed = BigInt(value);
  } else {
    if (value.startsWith("0x") || value.startsWith("0X")) {
      const normalized = normalizeHex(value, field);
      parsed = BigInt(normalized);
    } else if (/^\d+$/.test(value)) {
      parsed = BigInt(value);
    } else {
      throw new Error(`${field} must be decimal or hex integer`);
    }
  }

  if (parsed < 0n) {
    throw new Error(`${field} must be non-negative`);
  }

  return `0x${parsed.toString(16)}`;
}

export function canonicalizeUserOperation(input: UserOperationBuilderInput): UserOperation {
  return {
    sender: normalizeAddress(input.sender, "sender"),
    nonce: normalizeBigIntHex(input.nonce, "nonce"),
    initCode: normalizeHex(input.initCode ?? "0x", "initCode"),
    callData: normalizeHex(input.callData, "callData"),
    callGasLimit: normalizeBigIntHex(input.callGasLimit ?? "0", "callGasLimit"),
    verificationGasLimit: normalizeBigIntHex(
      input.verificationGasLimit ?? "0",
      "verificationGasLimit",
    ),
    preVerificationGas: normalizeBigIntHex(input.preVerificationGas ?? "0", "preVerificationGas"),
    maxFeePerGas: normalizeBigIntHex(input.maxFeePerGas ?? "0", "maxFeePerGas"),
    maxPriorityFeePerGas: normalizeBigIntHex(
      input.maxPriorityFeePerGas ?? "0",
      "maxPriorityFeePerGas",
    ),
    paymasterAndData: normalizeHex(input.paymasterAndData ?? "0x", "paymasterAndData"),
    signature: normalizeHex(input.signature ?? "0x", "signature"),
  };
}

export function toCanonicalUserOperationObject(userOperation: UserOperation): UserOperation {
  const ordered: Partial<UserOperation> = {};
  for (const field of USER_OPERATION_FIELD_ORDER) {
    ordered[field] = userOperation[field];
  }

  return ordered as UserOperation;
}

export function stableStringify(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map(stableStringify).join(",")}]`;
  }
  if (value && typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>).sort(([a], [b]) =>
      a.localeCompare(b),
    );
    return `{${entries
      .map(([key, entryValue]) => `${JSON.stringify(key)}:${stableStringify(entryValue)}`)
      .join(",")}}`;
  }
  return JSON.stringify(value);
}

export async function sha256Hex(input: string): Promise<string> {
  const encoder = new TextEncoder();
  const digest = await globalThis.crypto.subtle.digest("SHA-256", encoder.encode(input));
  const bytes = new Uint8Array(digest);
  return `0x${Array.from(bytes)
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("")}`;
}

export async function buildSignatureReadyPayload(params: {
  userOperation: UserOperationBuilderInput;
  chainId: number;
  entryPoint: string;
}): Promise<SignatureReadyPayload> {
  const canonicalUserOperation = canonicalizeUserOperation(params.userOperation);
  const signatureReadyOperation = {
    ...canonicalUserOperation,
    signature: "0x" as const,
  };
  const payload = stableStringify({
    chainId: normalizeBigIntHex(params.chainId, "chainId"),
    entryPoint: normalizeAddress(params.entryPoint, "entryPoint"),
    userOperation: toCanonicalUserOperationObject(signatureReadyOperation),
  });
  const payloadHash = await sha256Hex(payload);

  return {
    chainId: params.chainId,
    entryPoint: normalizeAddress(params.entryPoint, "entryPoint"),
    canonicalUserOperation: signatureReadyOperation,
    payload,
    payloadHash,
  };
}

export async function computeUserOperationHash(params: {
  userOperation: UserOperationBuilderInput;
  chainId: number;
  entryPoint: string;
}): Promise<string> {
  const canonicalUserOperation = canonicalizeUserOperation(params.userOperation);
  const payload = stableStringify({
    chainId: normalizeBigIntHex(params.chainId, "chainId"),
    entryPoint: normalizeAddress(params.entryPoint, "entryPoint"),
    userOperation: toCanonicalUserOperationObject(canonicalUserOperation),
  });

  return sha256Hex(payload);
}
