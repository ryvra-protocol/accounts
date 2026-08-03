import type { UserOperation } from "./user-operation-builder.js";
import { UserOpRuntimeError, classifyRetryDisposition } from "./errors.js";

export interface UserOperationReceipt {
  userOpHash: string;
  sender: string;
  nonce: string;
  actualGasCost?: string;
  actualGasUsed?: string;
  success?: boolean;
  receipt?: Record<string, unknown>;
}

export interface BundlerEstimateResult {
  preVerificationGas?: string;
  verificationGasLimit?: string;
  callGasLimit?: string;
}

export interface BundlerSimulationResult {
  ok: boolean;
  details?: Record<string, unknown>;
}

export interface BundlerClient {
  sendUserOperation(userOperation: UserOperation, entryPoint: string): Promise<{ userOpHash: string }>;
  estimateUserOperationGas?(
    userOperation: UserOperation,
    entryPoint: string,
  ): Promise<BundlerEstimateResult>;
  simulateUserOperation?(
    userOperation: UserOperation,
    entryPoint: string,
  ): Promise<BundlerSimulationResult>;
  getUserOperationByHash(userOpHash: string): Promise<Record<string, unknown> | null>;
  getUserOperationReceipt(userOpHash: string): Promise<UserOperationReceipt | null>;
}

export type JsonRpcTransport = (request: { method: string; params: unknown[] }) => Promise<unknown>;

function toBundlerError(error: unknown, method: string): UserOpRuntimeError {
  const retriable = classifyRetryDisposition(error) === "retriable";
  return new UserOpRuntimeError(
    retriable ? "UPSTREAM_UNAVAILABLE" : "BUNDLER_ERROR",
    retriable ? "bundler temporarily unavailable" : "bundler request failed",
    {
      method,
      retriable,
    },
  );
}

export class JsonRpcBundlerClient implements BundlerClient {
  constructor(private readonly transport: JsonRpcTransport) {}

  private async request(method: string, params: unknown[]): Promise<unknown> {
    try {
      return await this.transport({ method, params });
    } catch (error) {
      throw toBundlerError(error, method);
    }
  }

  async sendUserOperation(
    userOperation: UserOperation,
    entryPoint: string,
  ): Promise<{ userOpHash: string }> {
    const result = await this.request("eth_sendUserOperation", [userOperation, entryPoint]);

    if (typeof result !== "string" || !result.startsWith("0x")) {
      throw new UserOpRuntimeError("BUNDLER_ERROR", "bundler returned invalid userOpHash", {
        method: "eth_sendUserOperation",
      });
    }

    return { userOpHash: result };
  }

  async estimateUserOperationGas(
    userOperation: UserOperation,
    entryPoint: string,
  ): Promise<BundlerEstimateResult> {
    const result = await this.request("eth_estimateUserOperationGas", [userOperation, entryPoint]);

    if (!result || typeof result !== "object") {
      throw new UserOpRuntimeError("SIMULATION_FAILED", "bundler gas estimation failed", {
        method: "eth_estimateUserOperationGas",
      });
    }

    return result as BundlerEstimateResult;
  }

  async simulateUserOperation(
    userOperation: UserOperation,
    entryPoint: string,
  ): Promise<BundlerSimulationResult> {
    const result = await this.request("eth_simulateUserOperation", [userOperation, entryPoint]);

    if (!result || typeof result !== "object") {
      throw new UserOpRuntimeError("SIMULATION_FAILED", "bundler simulation failed", {
        method: "eth_simulateUserOperation",
      });
    }

    return {
      ok: true,
      details: result as Record<string, unknown>,
    };
  }

  async getUserOperationByHash(userOpHash: string): Promise<Record<string, unknown> | null> {
    const result = await this.request("eth_getUserOperationByHash", [userOpHash]);

    if (result === null) {
      return null;
    }

    if (!result || typeof result !== "object") {
      throw new UserOpRuntimeError("BUNDLER_ERROR", "bundler returned invalid user operation", {
        method: "eth_getUserOperationByHash",
      });
    }

    return result as Record<string, unknown>;
  }

  async getUserOperationReceipt(userOpHash: string): Promise<UserOperationReceipt | null> {
    const result = await this.request("eth_getUserOperationReceipt", [userOpHash]);

    if (result === null) {
      return null;
    }

    if (!result || typeof result !== "object") {
      throw new UserOpRuntimeError("BUNDLER_ERROR", "bundler returned invalid receipt", {
        method: "eth_getUserOperationReceipt",
      });
    }

    return result as UserOperationReceipt;
  }
}
