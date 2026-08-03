import { UserOpRuntimeError, classifyRetryDisposition } from "./errors.js";

export interface RetryPolicy {
  maxAttempts: number;
  baseDelayMs: number;
  maxDelayMs: number;
  jitterMs: number;
}

export interface RetryDependencies {
  sleep(ms: number): Promise<void>;
  random(): number;
}

const DEFAULT_RETRY_POLICY: RetryPolicy = {
  maxAttempts: 3,
  baseDelayMs: 100,
  maxDelayMs: 1000,
  jitterMs: 40,
};

export function withDefaultRetryPolicy(policy?: Partial<RetryPolicy>): RetryPolicy {
  return {
    ...DEFAULT_RETRY_POLICY,
    ...(policy ?? {}),
  };
}

export async function executeWithRetry<T>(
  operation: () => Promise<T>,
  retryPolicy: RetryPolicy,
  dependencies: RetryDependencies,
): Promise<T> {
  let attempt = 0;
  let lastError: unknown;

  while (attempt < retryPolicy.maxAttempts) {
    try {
      return await operation();
    } catch (error) {
      lastError = error;
      attempt += 1;
      const disposition = classifyRetryDisposition(error);
      if (attempt >= retryPolicy.maxAttempts || disposition === "terminal") {
        break;
      }

      const exponential = Math.min(
        retryPolicy.maxDelayMs,
        retryPolicy.baseDelayMs * 2 ** (attempt - 1),
      );
      const jitter = Math.floor(dependencies.random() * retryPolicy.jitterMs);
      await dependencies.sleep(exponential + jitter);
    }
  }

  if (lastError instanceof UserOpRuntimeError) {
    throw lastError;
  }

  throw new UserOpRuntimeError("UPSTREAM_UNAVAILABLE", "upstream dependency unavailable", {
    attempts: retryPolicy.maxAttempts,
  });
}
