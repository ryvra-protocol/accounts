# Ryvra Accounts

> ⚠️ **Not production-ready.** This repository is early-stage scaffolding for Ryvra Accounts and must not be used in production.

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

## Architecture (initial)

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

## Repository Scope

This repository starts docs-first with lightweight implementation scaffolding.
Concrete protocol and security-hardening logic is intentionally deferred.
