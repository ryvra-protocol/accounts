# Ryvra Accounts

> ✅ **Production hardening gates enabled for ERC-4337 runtime reliability.** Use with standard protocol rollout controls and incident runbook procedures.

Ryvra Accounts is the EIP-4337 account abstraction layer for Ryvra Protocol.
It focuses on:
- Smart account lifecycle
- Session key issuance and revocation
- UserOperation validation and orchestration
- Paymaster sponsorship policy integration
- Agent-scoped execution enforcement (RFC-0006/0007)

## Status Badges

![CI](https://img.shields.io/badge/ci-pending-lightgrey)
![Security](https://img.shields.io/badge/security-baseline-lightgrey)
![Coverage](https://img.shields.io/badge/coverage-pending-lightgrey)

## Architecture

```text
+------------------------+        +-----------------------+
| AccountFactory         |        | PolicyDecisionPoint   |
| - deploy smart account |<------>| - evaluate policies   |
+-----------+------------+        +-----------+-----------+
            |                                 ^
            v                                 |
+-----------+------------+        +-----------+-----------+
| SessionKeyManager      |------->| PaymasterEligibility  |
| - issue/revoke keys    |        | - sponsorship checks  |
+-----------+------------+        +-----------+-----------+
            |
            v
+-----------+------------+        +-----------------------+
| UserOpService          |------->| AgentValidator        |
| - validate UserOp      |        | - RFC-0006/0007 gates |
| - orchestrate submit   |        | - kill-switch checks  |
+------------------------+        +-----------------------+
```

## PR8 Runtime Coverage (ERC-4337)

Implemented runtime surfaces:
- Deterministic `UserOperation` canonicalization and ordering with signature-ready payload generation.
- Runtime nonce/replay/idempotency handling.
- Bundler client interface + JSON-RPC adapter:
  - `sendUserOperation`
  - `estimateUserOperationGas`
  - `simulateUserOperation`
  - `getUserOperationByHash`
  - `getUserOperationReceipt`
- Paymaster sponsorship hooks with typed request/response and policy constraint validation.
- Simulation/validation layer with typed runtime error taxonomy for chain, entrypoint, account, paymaster, nonce/replay failures.
- Sanitized lifecycle observability events:
  - `userop.submitted`
  - `userop.simulated`
  - `userop.included`
  - `userop.failed`


## Production Hardening Coverage

Current runtime hardening includes:
- Strict UserOperation validation for chain/entrypoint, nonce domain, signature shape, gas invariants, and paymaster payload shape.
- Deterministic replay/idempotency keys with duplicate rejection hooks.
- Agent-aware fail-closed validation path for agent initiated operations requiring:
  - active `agent_id`
  - active `mandate_id` + mandate `version`
  - scoped `capability_id`
  - policy `policy_version` + `policy_hash` binding
  - `risk_assessment_id` linkage
  - active capability-scoped `session_key_id`
- Bounded retry policy with exponential backoff + jitter for bundler/paymaster network operations.
- Typed stale-pending outcomes for missing userOp visibility and missing receipt timeout paths.
- Sanitized lifecycle events with structured logs and metrics:
  - `userop_submit_total`
  - `userop_failure_total`
  - `userop_time_to_inclusion_ms`
  - `userop_stale_pending_total`

Operational runbook: `/home/runner/work/accounts/accounts/docs/aa-incident-runbook.md`

## Agent Session Keys (Capabilities, Not Wallet Authority)

- Session keys are bound to `{ agent_id, mandate_id, capability_ids, nonce_domain, valid_until }`.
- Session keys are always issued with `authority_scope=capability_scoped`.
- Owner-equivalent authority is rejected during issuance.
- Revocations are immediate and checked during UserOperation validation.

## Threat Controls

- **Replay protection**: global replay keys plus agent replay protection keys.
- **Nonce-domain isolation**: session key nonce-domain binding enforced on each agent operation.
- **Escalation prevention**: contract/selector/asset/action allowlists and per-tx + cumulative window limits.
- **Kill-switch**: suspended/revoked agents, mandates, capabilities, or session keys fail validation immediately.

## RFC Mapping

- **RFC-0005**: ERC-4337 runtime, deterministic userOp hashing, base replay/idempotency guards.
- **RFC-0006**: capability-scoped agent execution checks and policy/risk binding.
- **RFC-0007**: session-key capability model, nonce-domain isolation, and fail-closed revocation/suspension behavior.

## Repository Scope

Current interface scaffolding aligns to protocol-core canonical contract vocabulary:
- Canonical ID fields: `account_id`, `reference_id`, `idempotency_key`, `policy_version`, `correlation_id`
- Policy decisions: `ALLOW | DENY | REVIEW` with non-empty `reason_codes` on `DENY`

## Non-goals

- No business-specific markets flow logic.
- No proprietary strategy/policy orchestration beyond generic policy/version constraints.
- No assumption of a specific bundler/paymaster vendor backend.
