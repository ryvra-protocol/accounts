# Threat Model (Initial)

> Baseline model for early Ryvra Accounts scaffolding.

## 1) Session Key Compromise

- Risk: attacker obtains active session key material.
- Impact: unauthorized operation execution within granted policy bounds.
- Baseline mitigations:
  - short validity windows
  - spending/target constraints
  - explicit revocation support
  - anomaly monitoring for key behavior

## 2) Replay and Front-Running Vectors

- Risk: previously signed operations are replayed or copied into competing bundles.
- Impact: duplicate execution, ordering attacks, user fund impact.
- Baseline mitigations:
  - strict nonce tracking
  - user operation hash deduplication
  - expiry windows for signatures/session permissions
  - chain/domain-separated signatures

## 3) Sponsorship Abuse

- Risk: paymaster sponsorship consumed by abusive or policy-noncompliant traffic.
- Impact: budget depletion and denial of service to legitimate users.
- Baseline mitigations:
  - eligibility checks with explicit denial reasons
  - per-account/per-policy rate limits
  - sponsorship budget ceilings and alerts

## 4) Policy Bypass Risks

- Risk: malformed requests or service gaps bypass policy checks.
- Impact: unauthorized actions proceed.
- Baseline mitigations:
  - deny-by-default policy engine behavior
  - mandatory policy decision references in orchestration path
  - centralized policy evaluation logging

## 5) Monitoring and Incident Response Basics

- Monitor: key issuance/revocation, nonce conflicts, replay detections, sponsorship denials.
- Detect: unusual bursts, policy drift, repeated deny/allow edge patterns.
- Respond:
  - emergency revoke affected session keys
  - tighten policy constraints
  - disable sponsorship for impacted scopes
  - record incident timeline and remediation actions
