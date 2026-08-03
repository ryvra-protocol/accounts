export type UserOpLifecycleEventType =
  | "userop.submitted"
  | "userop.simulated"
  | "userop.included"
  | "userop.failed"
  | "userop.stale_pending";

export interface UserOpLifecycleEvent {
  type: UserOpLifecycleEventType;
  timestamp: string;
  account_id: string;
  reference_id: string;
  correlation_id: string;
  user_op_hash?: string;
  reason_code?: string;
}

export interface UserOpLifecycleObserver {
  onEvent(event: UserOpLifecycleEvent): Promise<void> | void;
}

export interface UserOpLifecycleLogger {
  log(event: UserOpLifecycleEvent): Promise<void> | void;
}

export type UserOpMetricName =
  | "userop_submit_total"
  | "userop_failure_total"
  | "userop_time_to_inclusion_ms"
  | "userop_stale_pending_total";

export interface UserOpMetrics {
  increment(metric: Exclude<UserOpMetricName, "userop_time_to_inclusion_ms">): void;
  observe(metric: "userop_time_to_inclusion_ms", value: number): void;
}

export class InMemoryUserOpLifecycleObserver implements UserOpLifecycleObserver {
  readonly events: UserOpLifecycleEvent[] = [];

  onEvent(event: UserOpLifecycleEvent): void {
    this.events.push({ ...event });
  }
}

export class InMemoryUserOpMetrics implements UserOpMetrics {
  readonly counters: Record<Exclude<UserOpMetricName, "userop_time_to_inclusion_ms">, number> = {
    userop_submit_total: 0,
    userop_failure_total: 0,
    userop_stale_pending_total: 0,
  };

  readonly userOpTimeToInclusionMs: number[] = [];

  increment(metric: Exclude<UserOpMetricName, "userop_time_to_inclusion_ms">): void {
    this.counters[metric] += 1;
  }

  observe(metric: "userop_time_to_inclusion_ms", value: number): void {
    if (metric === "userop_time_to_inclusion_ms") {
      this.userOpTimeToInclusionMs.push(value);
    }
  }
}

export async function emitUserOpLifecycleEvent(
  observer: UserOpLifecycleObserver | undefined,
  logger: UserOpLifecycleLogger | undefined,
  event: Omit<UserOpLifecycleEvent, "timestamp">,
): Promise<void> {
  const withTimestamp = {
    ...event,
    timestamp: new Date().toISOString(),
  };

  if (observer) {
    await observer.onEvent(withTimestamp);
  }

  if (logger) {
    await logger.log(withTimestamp);
  }
}
