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

  if (paymasterRequired && userOperation.paymasterAndData === "0x") {
    throw new UserOpRuntimeError("INVALID_PAYMASTER", "paymaster required but paymasterAndData is empty");
  }
}
