# Session Key Policy (Initial)

## Policy Dimensions

### 1) Validity Windows

- Each session key MUST include `validAfter` and `validUntil`.
- `validUntil` MUST be greater than `validAfter`.
- Expired keys MUST be rejected for all new operations.

### 2) Spending Caps

- Policies SHOULD define per-operation and cumulative spending caps.
- Exceeding any cap MUST result in policy denial.

### 3) Allowed Targets and Assets

- Policies MUST constrain allowed contract targets.
- Policies SHOULD constrain allowed asset contracts and methods.
- Requests outside allow-lists MUST be denied.

### 4) Revocation Semantics

- Revocation MUST take effect immediately after confirmation.
- Revoked keys MUST be treated as invalid regardless of prior validity window.
- Revocation reason SHOULD be recorded when supplied.

### 5) Audit Logging Requirements

- Log issuance with key ID, account ID, policy reference, and validity window.
- Log revocation with key ID, account ID, reason, and actor.
- Log policy denials with decision ID and normalized reason codes.
- Logs SHOULD be immutable and retained per governance policy.
