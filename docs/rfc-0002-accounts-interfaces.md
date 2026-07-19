# RFC-0002: Ryvra Accounts Interfaces (Initial)

## Status
Draft

## Scope
This RFC defines initial interfaces for the Ryvra Accounts services.

## Common Conventions

- All timestamps are ISO-8601 UTC strings.
- `accountId` is a canonical identifier for an account abstraction wallet.
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
  accountId: string;
  accountAddress: string;
  deployed: boolean;
}
```

### Methods
- `createAccount(request): Promise<CreateAccountResponse | ServiceError>`
- `getAccount(accountId): Promise<{ accountId: string; accountAddress: string } | ServiceError>`

## 2) SessionKeyManager

### Request/Response Models

```ts
interface IssueSessionKeyRequest {
  accountId: string;
  sessionPublicKey: string;
  validAfter: string;
  validUntil: string;
  policyRef: string;
}

interface IssueSessionKeyResponse {
  sessionKeyId: string;
  accountId: string;
  status: "active" | "revoked" | "expired";
}

interface RevokeSessionKeyRequest {
  accountId: string;
  sessionKeyId: string;
  reason?: string;
}
```

### Methods
- `issueSessionKey(request): Promise<IssueSessionKeyResponse | ServiceError>`
- `revokeSessionKey(request): Promise<{ revoked: true } | ServiceError>`
- `getSessionKey(accountId, sessionKeyId): Promise<IssueSessionKeyResponse | ServiceError>`

## 3) UserOpService

### Request/Response Models

```ts
interface ValidateUserOpRequest {
  accountId: string;
  userOperation: Record<string, unknown>;
  expectedNonce: string;
}

interface ValidateUserOpResponse {
  valid: boolean;
  userOpHash?: string;
  reasons?: string[];
}

interface SubmitUserOpRequest {
  accountId: string;
  userOperation: Record<string, unknown>;
}

interface SubmitUserOpResponse {
  accepted: boolean;
  userOpHash?: string;
  bundlerRequestId?: string;
}
```

### Methods
- `validateUserOp(request): Promise<ValidateUserOpResponse | ServiceError>`
- `submitUserOp(request): Promise<SubmitUserOpResponse | ServiceError>`

## 4) PolicyDecisionPoint

### Request/Response Models

```ts
interface PolicyEvaluationRequest {
  accountId: string;
  actorKeyId?: string;
  action: string;
  context: Record<string, unknown>;
}

interface PolicyEvaluationResponse {
  allow: boolean;
  decisionId: string;
  denyReasons?: string[];
}
```

### Methods
- `evaluate(request): Promise<PolicyEvaluationResponse | ServiceError>`

## 5) PaymasterEligibility

### Request/Response Models

```ts
interface PaymasterEligibilityRequest {
  accountId: string;
  userOperation: Record<string, unknown>;
  policyDecisionId?: string;
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
- `expectedNonce` mismatch should return `NONCE_CONFLICT`.
- Duplicate `userOpHash` submissions must return `REPLAY_DETECTED`.
- Services should bind nonce usage to account scope and relevant key scope where supported.
- Front-running mitigation should include deterministic hashing and strict signature domain separation.
