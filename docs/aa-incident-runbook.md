# AA Incident Runbook (ERC-4337)

## Scope
Operational response for UserOperation submission reliability incidents in accounts runtime.

## Trigger signals
- Sustained increase in `userop_failure_total`
- Sustained increase in `userop_stale_pending_total`
- Elevated `userop_time_to_inclusion_ms`
- Bundler/paymaster health degradation or timeout reports

## Initial triage checklist
1. Confirm chain and entrypoint configuration values match expected runtime deployment.
2. Check recent lifecycle events for failure reason codes and stale pending outcomes.
3. Verify bundler JSON-RPC responsiveness for:
   - `eth_sendUserOperation`
   - `eth_getUserOperationByHash`
   - `eth_getUserOperationReceipt`
4. Verify paymaster sponsorship policy version and chain allowlist.
5. Confirm nonce-domain conflicts and replay key rejects are not due to upstream replayed traffic.

## Manual remediation steps
1. **Bundler unavailable / transient faults**
   - Validate network path and endpoint health.
   - Temporarily reduce submit rate if repeated retry exhaustion occurs.
   - Fail over to a healthy bundler endpoint if configured.
2. **Paymaster sponsorship denied unexpectedly**
   - Validate policy version and max sponsored cost constraints.
   - Check paymaster service health and recent policy deployments.
   - Use non-sponsored path only if policy permits.
3. **Stale pending / missing receipt**
   - Query by userOp hash and confirm visibility.
   - If visible but no receipt, continue receipt polling with operational tooling.
   - If not visible, re-queue only with a new idempotency key after replay checks.
4. **Nonce domain conflicts**
   - Confirm account-specific pending pool state.
   - Rebuild operation with next expected nonce.

## Escalation
Escalate to protocol/oncall when:
- stale pending ratio exceeds SLO threshold for 15 minutes.
- receipt inclusion latency breaches SLO for 15 minutes.
- repeat non-transient bundler failures occur across providers.

## Post-incident actions
1. Record root cause, impact window, and impacted references/correlation IDs.
2. Capture whether failures were retriable or terminal.
3. Add regression tests for discovered failure mode.
4. Update this runbook and reliability thresholds as needed.
