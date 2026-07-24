# RFC-0002: Ryvra Accounts Interfaces (Initial)

## Status
Draft

## Scope
This RFC defines initial interfaces for the Ryvra Accounts services.

## Common Conventions

- All timestamps are ISO-8601 UTC strings.
- `account_id` is the canonical identifier for an account abstraction wallet.
- Canonical ID fields (where applicable): `account_id`, `reference_id`, `idempotency_key`, `policy_version`, `correlation_id`.
- `userOpHash` follows EIP-4337 hashing expectations for replay-safety.
- Errors are returned as structured error objects.

### Error Model

```ts
interface ServiceError {
  code:
    | "INVALID_REQUEST"
    | "UNAUTHORIZED"
    | "NOT_FOUND"
    | "POLICY_DENIED"
    | "REPLAY_DETECTED"
    | "NONCE_CONFLICT"
    | "RATE_LIMITED"
    | "SPONSORSHIP_DENIED"
    | "INTERNAL_ERROR";
  message: string;
  details?: Record<string, unknown>;
}
```

## 1) AccountFactory

### Request/Response Models

```ts
interface CreateAccountRequest {
  owner: string;
  salt: string;
  initPolicyId?: string;
}

interface CreateAccountResponse {
  account_id: string;
  reference_id: string;
  correlation_id: string;
  accountAddress: string;
  deployed: boolean;
}
```

### Methods
- `createAccount(request): Promise<CreateAccountResponse | ServiceError>`
- `getAccount(account_id): Promise<{ account_id: string; accountAddress: string } | ServiceError>`

## 2) SessionKeyManager

### Request/Response Models

```ts
interface IssueSessionKeyRequest {
  account_id: string;
  reference_id: string;
  idempotency_key: string;
  correlation_id: string;
  policy_version: string;
  session_public_key: string;
  valid_after: string;
  valid_until: string;
}

interface IssueSessionKeyResponse {
  session_key_id: string;
  account_id: string;
  reference_id: string;
  correlation_id: string;
  status: "active" | "revoked" | "expired";
  valid_after: string;
  valid_until: string;
  policy_version: string;
}

interface RevokeSessionKeyRequest {
  account_id: string;
  reference_id: string;
  correlation_id: string;
  session_key_id: string;
  reason?: string;
}
```

### Methods
- `issueSessionKey(request): Promise<IssueSessionKeyResponse | ServiceError>`
- `revokeSessionKey(request): Promise<{ revoked: true } | ServiceError>`
- `getSessionKey(account_id, session_key_id): Promise<IssueSessionKeyResponse | ServiceError>`

## 3) UserOpService

### Request/Response Models

```ts
interface ValidateUserOpRequest {
  account_id: string;
  reference_id: string;
  idempotency_key: string;
  correlation_id: string;
  policy_version: string;
  userOperation: Record<string, unknown>;
  expected_nonce: string;
}

interface ValidateUserOpResponse {
  valid: boolean;
  reference_id: string;
  correlation_id: string;
  user_op_hash?: string;
  reasons?: string[];
}

interface SubmitUserOpRequest {
  account_id: string;
  reference_id: string;
  idempotency_key: string;
  correlation_id: string;
  policy_version: string;
  userOperation: Record<string, unknown>;
}

interface SubmitUserOpResponse {
  accepted: boolean;
  reference_id: string;
  correlation_id: string;
  user_op_hash?: string;
  bundler_request_id?: string;
}
```

### Methods
- `validateUserOp(request): Promise<ValidateUserOpResponse | ServiceError>`
- `submitUserOp(request): Promise<SubmitUserOpResponse | ServiceError>`

## 4) PolicyDecisionPoint

### Request/Response Models

```ts
interface PolicyEvaluationRequest {
  account_id: string;
  reference_id: string;
  correlation_id: string;
  policy_version: string;
  actor_key_id?: string;
  action: string;
  context: Record<string, unknown>;
}

interface PolicyEvaluationResponse {
  decision: "ALLOW" | "DENY" | "REVIEW";
  policy_version: string;
  reference_id: string;
  correlation_id: string;
  reason_codes?: string[];
}
```

- `DENY` responses MUST include non-empty machine-readable `reason_codes`.

### Methods
- `evaluate(request): Promise<PolicyEvaluationResponse | ServiceError>`

## 5) PaymasterEligibility

### Request/Response Models

```ts
interface PaymasterEligibilityRequest {
  account_id: string;
  reference_id: string;
  correlation_id: string;
  userOperation: Record<string, unknown>;
  policy_decision_reference_id?: string;
}

interface PaymasterEligibilityResponse {
  eligible: boolean;
  paymaster?: string;
  reason?: string;
}
```

### Methods
- `checkEligibility(request): Promise<PaymasterEligibilityResponse | ServiceError>`

## Nonce Handling and Replay Prevention

- Nonce must be read from canonical account nonce source before validation.
- `expected_nonce` mismatch should return `NONCE_CONFLICT`.
- Duplicate `user_op_hash` submissions must return `REPLAY_DETECTED`.
- Services should bind nonce usage to account scope and relevant key scope where supported.
- Front-running mitigation should include deterministic hashing and strict signature domain separation.

## Event Envelope (Canonical)

```ts
interface EventEnvelope<TPayload = Record<string, unknown>> {
  event_id: string;
  correlation_id: string;
  reference_id: string;
  event_type: string;
  timestamp: string;
  payload: TPayload;
}
```
