# Ryvra Accounts

> ⚠️ **Not production-ready.** This repository is still under active hardening and should not be used in production without full protocol and security review.

Ryvra Accounts is the EIP-4337 account abstraction layer for Ryvra Protocol.
It focuses on:
- Smart account lifecycle
- Session key issuance and revocation
- UserOperation validation and orchestration
- Paymaster sponsorship policy integration

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
+-----------+------------+
| UserOpService          |
| - validate UserOp      |
| - orchestrate submit   |
+------------------------+
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

## Repository Scope

Current interface scaffolding aligns to protocol-core canonical contract vocabulary:
- Canonical ID fields: `account_id`, `reference_id`, `idempotency_key`, `policy_version`, `correlation_id`
- Policy decisions: `ALLOW | DENY | REVIEW` with non-empty `reason_codes` on `DENY`

## Non-goals

- No business-specific markets flow logic.
- No proprietary strategy/policy orchestration beyond generic policy/version constraints.
- No assumption of a specific bundler/paymaster vendor backend.
