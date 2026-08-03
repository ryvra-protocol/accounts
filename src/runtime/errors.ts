export type UserOpRuntimeErrorCode =
  | "INVALID_CHAIN"
  | "INVALID_ENTRYPOINT"
  | "INVALID_ACCOUNT"
  | "INVALID_PAYMASTER"
  | "NONCE_CONFLICT"
  | "REPLAY_DETECTED"
  | "BUNDLER_ERROR"
  | "SIMULATION_FAILED"
  | "INVALID_USER_OPERATION";

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
