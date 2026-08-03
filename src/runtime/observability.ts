export type UserOpLifecycleEventType =
  | "userop.submitted"
  | "userop.simulated"
  | "userop.included"
  | "userop.failed";

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

export class InMemoryUserOpLifecycleObserver implements UserOpLifecycleObserver {
  readonly events: UserOpLifecycleEvent[] = [];

  onEvent(event: UserOpLifecycleEvent): void {
    this.events.push({ ...event });
  }
}

export async function emitUserOpLifecycleEvent(
  observer: UserOpLifecycleObserver | undefined,
  event: Omit<UserOpLifecycleEvent, "timestamp">,
): Promise<void> {
  if (!observer) {
    return;
  }

  await observer.onEvent({
    ...event,
    timestamp: new Date().toISOString(),
  });
}
