export type UserOpRuntimeErrorCode =
  | "INVALID_CHAIN"
  | "INVALID_ENTRYPOINT"
  | "INVALID_ACCOUNT"
  | "INVALID_PAYMASTER"
  | "NONCE_CONFLICT"
  | "REPLAY_DETECTED"
  | "BUNDLER_ERROR"
  | "SIMULATION_FAILED"
  | "INVALID_USER_OPERATION"
  | "INVALID_NONCE_DOMAIN"
  | "INVALID_SIGNATURE"
  | "INVALID_GAS_FIELDS"
  | "UPSTREAM_UNAVAILABLE"
  | "PENDING_TIMEOUT"
  | "RECEIPT_TIMEOUT";

export type RetryDisposition = "retriable" | "terminal";

export class UserOpRuntimeError extends Error {
  constructor(
    readonly code: UserOpRuntimeErrorCode,
    message: string,
    readonly details?: Record<string, unknown>,
  ) {
    super(message);
    this.name = "UserOpRuntimeError";
  }
}

function getErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return `${error.name}:${error.message}`.toLowerCase();
  }
  if (typeof error === "string") {
    return error.toLowerCase();
  }
  return "";
}

export function classifyRetryDisposition(error: unknown): RetryDisposition {
  if (error instanceof UserOpRuntimeError) {
    if (error.code === "UPSTREAM_UNAVAILABLE") {
      return "retriable";
    }
    if (error.code === "BUNDLER_ERROR" && error.details?.retriable === true) {
      return "retriable";
    }
    return "terminal";
  }

  const message = getErrorMessage(error);
  if (
    message.includes("timeout") ||
    message.includes("timed out") ||
    message.includes("econnreset") ||
    message.includes("econnrefused") ||
    message.includes("enotfound") ||
    message.includes("429") ||
    message.includes("too many requests") ||
    message.includes("503") ||
    message.includes("temporar")
  ) {
    return "retriable";
  }

  return "terminal";
}

export function sanitizeErrorDetails(error: unknown): Record<string, unknown> | undefined {
  if (!(error instanceof Error)) {
    return undefined;
  }
  return {
    name: error.name,
  };
}
