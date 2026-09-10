import { UserOpRuntimeError } from "../runtime/errors.js";

export type AgentIdentityStatus = "ACTIVE" | "SUSPENDED" | "REVOKED";
export type MandateStatus = "ACTIVE" | "REVOKED";
export type CapabilityStatus = "ACTIVE" | "REVOKED";

export interface AgentIdentityRecord {
  agent_id: string;
  status: AgentIdentityStatus;
  mandate_id: string;
  policy_version: string;
  policy_hash: string;
  risk_assessment_id: string;
}

export interface MandateRecord {
  mandate_id: string;
  version: string;
  status: MandateStatus;
  valid_after?: string;
  valid_until: string;
  capability_ids: string[];
}

export interface CapabilityWindowLimit {
  max_amount: string;
  window_ms: number;
}

export interface CapabilityRecord {
  capability_id: string;
  mandate_id: string;
  status: CapabilityStatus;
  policy_version: string;
  policy_hash: string;
  allowed_chain_ids: number[];
  allowed_contracts: string[];
  allowed_function_selectors: string[];
  allowed_assets: string[];
  allowed_actions: string[];
  per_tx_max_amount?: string;
  cumulative_limit?: CapabilityWindowLimit;
}

export interface SessionCapabilityKeyRecord {
  session_key_id: string;
  account_id: string;
  agent_id: string;
  mandate_id: string;
  capability_ids: string[];
  policy_version: string;
  policy_hash: string;
  nonce_domain: string;
  valid_after: string;
  valid_until: string;
  revoked_at?: string;
  authority_scope: "capability_scoped";
}

export interface AgentOperationContext {
  target_contract: string;
  function_selector: string;
  asset: string;
  action: string;
  amount: string;
}

export interface AgentValidationContext {
  chain_id: number;
  account_id: string;
  agent_id: string;
  mandate_id: string;
  mandate_version: string;
  capability_id: string;
  policy_version: string;
  policy_hash: string;
  risk_assessment_id: string;
  session_key_id: string;
  nonce_domain: string;
  replay_protection_key: string;
  operation: AgentOperationContext;
  at_ms?: number;
  consume?: boolean;
}

interface CapabilityWindowUsage {
  window_start_ms: number;
  used: bigint;
}

function normalizeHex(value: string, field: string): string {
  if (!/^0x[0-9a-fA-F]*$/.test(value)) {
    throw new UserOpRuntimeError("INVALID_USER_OPERATION", `${field} must be canonical 0x hex`);
  }
  const body = value.slice(2).toLowerCase();
  return `0x${body}`;
}

function parseAmount(value: string, field: string): bigint {
  if (!/^\d+$/.test(value)) {
    throw new UserOpRuntimeError("POLICY_MISMATCH", `${field} must be decimal integer`);
  }
  return BigInt(value);
}

function toMs(value: string, field: string): number {
  const parsed = Date.parse(value);
  if (Number.isNaN(parsed)) {
    throw new UserOpRuntimeError("INVALID_REQUEST", `${field} must be ISO timestamp`);
  }
  return parsed;
}

function assertActiveWindow(validAfter: string, validUntil: string, nowMs: number, type: string): void {
  const from = toMs(validAfter, `${type}.valid_after`);
  const until = toMs(validUntil, `${type}.valid_until`);

  if (until <= from) {
    throw new UserOpRuntimeError("INVALID_REQUEST", `${type} validity window is invalid`);
  }

  if (nowMs < from || nowMs > until) {
    throw new UserOpRuntimeError("AGENT_INACTIVE", `${type} expired or not active`, {
      valid_after: validAfter,
      valid_until: validUntil,
    });
  }
}

/**
 * AgentValidator enforces RFC-0006/0007 scoped execution constraints.
 */
export class AgentValidator {
  private readonly agents = new Map<string, AgentIdentityRecord>();
  private readonly mandates = new Map<string, MandateRecord>();
  private readonly capabilities = new Map<string, CapabilityRecord>();
  private readonly sessionKeys = new Map<string, SessionCapabilityKeyRecord>();
  private readonly replayKeys = new Set<string>();
  private readonly nonceDomainKeys = new Set<string>();
  private readonly capabilityUsage = new Map<string, CapabilityWindowUsage>();
  private readonly capabilityLocks = new Map<string, Promise<void>>();

  registerAgent(record: AgentIdentityRecord): void {
    this.agents.set(record.agent_id, record);
  }

  registerMandate(record: MandateRecord): void {
    this.mandates.set(record.mandate_id, record);
  }

  registerCapability(record: CapabilityRecord): void {
    this.capabilities.set(record.capability_id, record);
  }

  registerSessionKey(record: SessionCapabilityKeyRecord): void {
    this.sessionKeys.set(record.session_key_id, record);
  }

  suspendAgent(agentId: string): void {
    const existing = this.agents.get(agentId);
    if (existing) {
      this.agents.set(agentId, { ...existing, status: "SUSPENDED" });
    }
  }

  revokeCapability(capabilityId: string): void {
    const existing = this.capabilities.get(capabilityId);
    if (existing) {
      this.capabilities.set(capabilityId, { ...existing, status: "REVOKED" });
    }
  }

  revokeSessionKey(sessionKeyId: string): void {
    const existing = this.sessionKeys.get(sessionKeyId);
    if (existing) {
      this.sessionKeys.set(sessionKeyId, {
        ...existing,
        revoked_at: new Date().toISOString(),
      });
    }
  }

  async validate(context: AgentValidationContext): Promise<void> {
    await this.validateInternal({ ...context, consume: false });
  }

  async validateAndConsume(context: AgentValidationContext): Promise<void> {
    await this.validateInternal({ ...context, consume: true });
  }

  private async validateInternal(context: AgentValidationContext): Promise<void> {
    const capabilityId = context.capability_id;

    const previous = this.capabilityLocks.get(capabilityId) ?? Promise.resolve();
    let release!: () => void;
    const next = new Promise<void>((resolve) => {
      release = resolve;
    });
    this.capabilityLocks.set(capabilityId, previous.then(() => next));

    await previous;
    try {
      this.validateIdentity(context);
      this.validateMandateCapability(context);
      this.validateSessionKey(context);
      this.validateOperationScope(context);
      this.validateLimits(context);

      if (context.consume) {
        this.consumeReplayAndNonceKeys(context);
        this.consumeCumulativeUsage(context);
      }
    } finally {
      release();
      const stored = this.capabilityLocks.get(capabilityId);
      if (stored === previous.then(() => next)) {
        this.capabilityLocks.delete(capabilityId);
      }
    }
  }

  private nowMs(context: AgentValidationContext): number {
    return context.at_ms ?? Date.now();
  }

  private validateIdentity(context: AgentValidationContext): void {
    const agent = this.agents.get(context.agent_id);
    if (!agent || agent.status !== "ACTIVE") {
      throw new UserOpRuntimeError("AGENT_INACTIVE", "agent is not ACTIVE");
    }

    if (agent.mandate_id !== context.mandate_id) {
      throw new UserOpRuntimeError("POLICY_MISMATCH", "agent mandate binding mismatch");
    }

    if (agent.policy_version !== context.policy_version || agent.policy_hash !== context.policy_hash) {
      throw new UserOpRuntimeError("POLICY_MISMATCH", "agent policy version/hash mismatch");
    }

    if (agent.risk_assessment_id !== context.risk_assessment_id) {
      throw new UserOpRuntimeError("POLICY_MISMATCH", "agent risk assessment mismatch");
    }
  }

  private validateMandateCapability(context: AgentValidationContext): void {
    const mandate = this.mandates.get(context.mandate_id);
    if (!mandate || mandate.status !== "ACTIVE") {
      throw new UserOpRuntimeError("MANDATE_INVALID", "mandate is not ACTIVE");
    }

    if (mandate.version !== context.mandate_version) {
      throw new UserOpRuntimeError("MANDATE_INVALID", "mandate version mismatch");
    }

    if (!mandate.capability_ids.includes(context.capability_id)) {
      throw new UserOpRuntimeError("CAPABILITY_INVALID", "capability is not bound to mandate");
    }

    assertActiveWindow(mandate.valid_after ?? "1970-01-01T00:00:00.000Z", mandate.valid_until, this.nowMs(context), "mandate");

    const capability = this.capabilities.get(context.capability_id);
    if (!capability || capability.status !== "ACTIVE") {
      throw new UserOpRuntimeError("CAPABILITY_INVALID", "capability is not ACTIVE");
    }

    if (capability.mandate_id !== context.mandate_id) {
      throw new UserOpRuntimeError("CAPABILITY_INVALID", "capability mandate linkage mismatch");
    }

    if (
      capability.policy_version !== context.policy_version ||
      capability.policy_hash !== context.policy_hash
    ) {
      throw new UserOpRuntimeError("POLICY_MISMATCH", "capability policy version/hash mismatch");
    }
  }

  private validateSessionKey(context: AgentValidationContext): void {
    const key = this.sessionKeys.get(context.session_key_id);
    if (!key) {
      throw new UserOpRuntimeError("SESSION_KEY_INVALID", "session key not found");
    }

    if (key.revoked_at) {
      throw new UserOpRuntimeError("SESSION_KEY_INVALID", "session key revoked", {
        revoked_at: key.revoked_at,
      });
    }

    if (key.authority_scope !== "capability_scoped") {
      throw new UserOpRuntimeError("SESSION_KEY_SCOPE_VIOLATION", "owner-equivalent session keys are prohibited");
    }

    if (key.agent_id !== context.agent_id || key.mandate_id !== context.mandate_id) {
      throw new UserOpRuntimeError("SESSION_KEY_INVALID", "session key linkage mismatch");
    }

    if (!key.capability_ids.includes(context.capability_id)) {
      throw new UserOpRuntimeError("SESSION_KEY_INVALID", "session key does not grant capability");
    }

    if (key.policy_version !== context.policy_version || key.policy_hash !== context.policy_hash) {
      throw new UserOpRuntimeError("POLICY_MISMATCH", "session key policy mismatch");
    }

    if (key.nonce_domain !== context.nonce_domain) {
      throw new UserOpRuntimeError("NONCE_DOMAIN_MISMATCH", "session key nonce domain mismatch");
    }

    assertActiveWindow(key.valid_after, key.valid_until, this.nowMs(context), "session_key");
  }

  private validateOperationScope(context: AgentValidationContext): void {
    const capability = this.capabilities.get(context.capability_id);
    if (!capability) {
      throw new UserOpRuntimeError("CAPABILITY_INVALID", "capability not found");
    }

    if (!capability.allowed_chain_ids.includes(context.chain_id)) {
      throw new UserOpRuntimeError("POLICY_MISMATCH", "chain not allowed for capability");
    }

    const target = normalizeHex(context.operation.target_contract, "operation.target_contract");
    const selector = normalizeHex(context.operation.function_selector, "operation.function_selector");
    if (selector.length !== 10) {
      throw new UserOpRuntimeError("POLICY_MISMATCH", "function selector must be 4 bytes");
    }

    const allowedContracts = capability.allowed_contracts.map((value) => value.toLowerCase());
    const allowedSelectors = capability.allowed_function_selectors.map((value) => value.toLowerCase());
    const allowedAssets = capability.allowed_assets.map((value) => value.toLowerCase());
    const allowedActions = capability.allowed_actions.map((value) => value.toLowerCase());

    if (!allowedContracts.includes(target.toLowerCase())) {
      throw new UserOpRuntimeError("POLICY_MISMATCH", "target contract not allowed");
    }

    if (!allowedSelectors.includes(selector.toLowerCase())) {
      throw new UserOpRuntimeError("POLICY_MISMATCH", "function selector not allowed");
    }

    const asset = normalizeHex(context.operation.asset, "operation.asset").toLowerCase();
    if (!allowedAssets.includes(asset)) {
      throw new UserOpRuntimeError("POLICY_MISMATCH", "asset not allowed");
    }

    if (!allowedActions.includes(context.operation.action.toLowerCase())) {
      throw new UserOpRuntimeError("POLICY_MISMATCH", "action not allowed");
    }
  }

  private validateLimits(context: AgentValidationContext): void {
    const capability = this.capabilities.get(context.capability_id);
    if (!capability) {
      throw new UserOpRuntimeError("CAPABILITY_INVALID", "capability not found");
    }

    const amount = parseAmount(context.operation.amount, "operation.amount");

    if (capability.per_tx_max_amount) {
      const perTxLimit = parseAmount(capability.per_tx_max_amount, "capability.per_tx_max_amount");
      if (amount > perTxLimit) {
        throw new UserOpRuntimeError("LIMIT_EXCEEDED", "per-tx amount exceeds capability limit");
      }
    }

    if (capability.cumulative_limit) {
      const cumulativeMax = parseAmount(
        capability.cumulative_limit.max_amount,
        "capability.cumulative_limit.max_amount",
      );
      const nowMs = this.nowMs(context);
      const existing = this.capabilityUsage.get(capability.capability_id);
      const windowStart = existing ? existing.window_start_ms : nowMs;
      const windowExpired = nowMs - windowStart >= capability.cumulative_limit.window_ms;
      const currentUsed = windowExpired ? 0n : (existing?.used ?? 0n);

      if (currentUsed + amount > cumulativeMax) {
        throw new UserOpRuntimeError("LIMIT_EXCEEDED", "cumulative capability limit exceeded", {
          used: currentUsed.toString(10),
          amount: amount.toString(10),
          max: cumulativeMax.toString(10),
        });
      }
    }

    if (this.replayKeys.has(context.replay_protection_key)) {
      throw new UserOpRuntimeError("REPLAY_DETECTED", "agent replay protection key already used");
    }

    const nonceKey = `${context.session_key_id}:${context.nonce_domain}`;
    if (this.nonceDomainKeys.has(nonceKey)) {
      throw new UserOpRuntimeError("NONCE_CONFLICT", "nonce domain already consumed for session key");
    }
  }

  private consumeReplayAndNonceKeys(context: AgentValidationContext): void {
    this.replayKeys.add(context.replay_protection_key);
    this.nonceDomainKeys.add(`${context.session_key_id}:${context.nonce_domain}`);
  }

  private consumeCumulativeUsage(context: AgentValidationContext): void {
    const capability = this.capabilities.get(context.capability_id);
    if (!capability?.cumulative_limit) {
      return;
    }

    const amount = parseAmount(context.operation.amount, "operation.amount");
    const nowMs = this.nowMs(context);
    const existing = this.capabilityUsage.get(capability.capability_id);

    if (!existing || nowMs - existing.window_start_ms >= capability.cumulative_limit.window_ms) {
      this.capabilityUsage.set(capability.capability_id, {
        window_start_ms: nowMs,
        used: amount,
      });
      return;
    }

    this.capabilityUsage.set(capability.capability_id, {
      window_start_ms: existing.window_start_ms,
      used: existing.used + amount,
    });
  }
}
