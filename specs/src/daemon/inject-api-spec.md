---
title: Daemon Inject API Specification
version: 0.1.0
maintained_by: claude
domain_tags: [daemon, protocol, inject, bosun-integration, authorization]
status: draft
governs: src/daemon/daemon.ts (inject handler), src/daemon/inject-dedupe.ts, src/shared/protocol.ts (inject message types)
platform: claude-code
license: MIT
---

# Purpose
Define the machine input contract by which an authenticated, authorized external client (specifically the Bosun's Mate orchestrator, but generalizable to any mTLS client with a SAN FQDN in the daemon's allowlist) injects a text payload into a specific session's PTY on the daemon.

The daemon is a dumb, authenticated pipe for bytes into a PTY. It knows nothing about roles, tickets, forges, or orchestration. The inject request identifies its target by absolute `cwd`; higher-level concepts (role registry, ticket state, retry policy) live in the caller.

Requires the mTLS transport per `specs/src/daemon/transport-mtls-spec.md` — client identity is only defined under mTLS.

# Scope

## Covers
- The `inject:request` and `inject:response` message pair on the existing WebSocket transport.
- Session lookup semantics (cwd-addressed).
- The response taxonomy: `accepted` / `rejected` with `reason ∈ {busy, auth, unknown_role}`.
- Authorization gate keyed on client SAN FQDN.
- Idempotency via caller-supplied `inject_id`.
- Payload boundary and size limit.

## Does Not Cover
- Terminal outcome of the injected work — the daemon does not observe or report it. The caller learns the outcome out-of-band (in Bosun's case, a `===BOSUN-TICKET-UPDATE===` block in the ticket file, which Bosun polls).
- Role → cwd resolution — caller-side.
- Cross-daemon routing — caller connects directly to the correct daemon.
- Cert enrollment, TLS handshake, or client identity extraction — see `transport-mtls-spec.md`.

# Inputs

## Wire format
Request (client → daemon):
```json
{
  "type": "inject:request",
  "seq": <number>,
  "inject_id": "<caller-generated stable id, string>",
  "cwd": "<absolute path>",
  "context": "<UTF-8 payload, verbatim delivery>"
}
```

Response (daemon → client, correlates via `seq`):
```json
{
  "type": "inject:response",
  "seq": <number>,
  "inject_id": "<echo of request>",
  "status": "accepted" | "rejected",
  "reason": "busy" | "auth" | "unknown_role" | null
}
```

## Configuration
- `injectAllowedClients: string[]` in the daemon config file — FQDNs authorized to invoke this endpoint. Default: `[]` (no clients authorized). Consumed by the authorization gate.
- No timeouts or size caps in config; hardcoded per Responsibilities below.

# Outputs

## Success path (`status: accepted`)
- `context` is written verbatim to the target session's PTY via `PtyManager.write(sessionId, context)`.
- `inject_id` is recorded in the dedupe cache with the response payload.
- The `inject:response` is sent synchronously (before this handler returns).
- No additional side effects. No log line beyond the standard `[session:input]`-analog (see Responsibilities → Logging).

## Rejection paths
- `reason='busy'`: session exists at `cwd` but `IdleDetector` reports its status as `working`. No PTY write.
- `reason='unknown_role'`: no session matches `cwd`, OR multiple sessions match `cwd` (caller-side invariant violation; daemon fails closed). No PTY write.
- `reason='auth'`: client SAN FQDN not in `injectAllowedClients`. No PTY write. No session lookup performed.
- All rejections are recorded in the dedupe cache with their response payload; a redelivered `inject_id` returns the same rejection verbatim.

# Responsibilities

## Message dispatch
1. `inject:request` handled in `daemon.ts` alongside the existing `session:spawn` / `session:input` / etc. handlers. Not a special code path — the standard message router.
2. The daemon MUST send exactly one `inject:response` per received `inject:request`. Never zero, never more than one.

## Authorization (checked first)
1. Read the connection's `clientIdentity` (populated by `transport-mtls-spec.md`).
2. If `clientIdentity` is not a case-insensitive match for any entry in `injectAllowedClients`, respond `{status: 'rejected', reason: 'auth'}`. Record in dedupe cache. Return.
3. Do not perform session lookup, dedupe check, or any other work when auth fails. This prevents leaking session existence to unauthorized callers via response-timing.

## Idempotency check (second)
1. If `inject_id` is present in the dedupe cache, return the cached response verbatim. Do not re-write to the PTY. Do not re-evaluate authorization or busy state.
2. Cache is a bounded LRU: cap 10 000 entries, per-entry TTL 1 hour. When either bound is hit, the oldest entries are evicted.
3. The cache is in-memory only and does NOT survive daemon restart. This is a documented v1 constraint (see DEC-000011). Callers who care about cross-restart idempotency must burn a fresh `inject_id` after a known restart.

## Session lookup (third)
1. Walk `PtyManager.getAll()`. Collect all sessions whose `cwd` (as recorded at spawn time) exactly equals `request.cwd`. Path comparison is byte-exact after both are normalized with `path.resolve()`.
2. Zero matches → respond `{status: 'rejected', reason: 'unknown_role'}`.
3. More than one match → respond `{status: 'rejected', reason: 'unknown_role'}`. Log a warning identifying the conflicting session ids — this is a caller-side bug.
4. Exactly one match → proceed to busy check.

## Busy check (fourth)
1. Consult `IdleDetector.getStatus(sessionId)` for the matched session:
   - `working` → respond `{status: 'rejected', reason: 'busy'}`.
   - `idle` or `needs-attention` → proceed to delivery.
2. `not_ready` is not a v1 reason code; a session that exists in `PtyManager` is by definition spawned and one of the three IdleDetector statuses. Any spawning/unhealthy state added later would earn its own reason code.

## Delivery (fifth)
1. Call `PtyManager.write(sessionId, request.context)` with the payload verbatim. Do NOT append `\r`, `\n`, or any framing. The caller composes what the target expects (e.g., trailing `\r` to submit at an interactive prompt).
2. Update `IdleDetector.onInput(sessionId)` so the caller's write is treated the same as a user keystroke for status-transition purposes.
3. Respond `{status: 'accepted', reason: null}`.
4. Record the response in the dedupe cache.

## Payload constraints
- `context` MUST be a string. Non-string → this is a protocol violation; respond with the transport's existing `INVALID_MESSAGE` error (not an `inject:response`).
- `context.length` cap: 1 048 576 code units (1 MiB in UTF-16 code units, roughly 1 MiB of ASCII or ~350 KB of dense multi-byte UTF-8). Larger → respond with `INVALID_MESSAGE` (same transport-level error), NOT an `inject:response` — this is a hard protocol violation, not part of the accept/reject taxonomy.
- `cwd` MUST be an absolute path (starts with `/` on POSIX). Non-absolute → `INVALID_MESSAGE`.
- `inject_id` MUST be a non-empty string. Empty or missing → `INVALID_MESSAGE`.

## Logging
- Every `inject:request` MUST produce a log line:
  `[inject:request] client=<clientIdentity> cwd=<cwd> inject_id=<inject_id> bytes=<context.length>`
- Every `inject:response` MUST produce a log line:
  `[inject:response] inject_id=<inject_id> status=<status>` and, for rejections, ` reason=<reason>`.
- Do NOT log the `context` payload. Payload may contain untrusted content or sensitive data.

# Edge Cases / Fault Handling

- **Client disconnects after `inject:request` but before `inject:response` is sent**: response is dropped. Caller will retry with the same `inject_id`; the dedupe cache returns the cached response. If the delivery was accepted, no double-write. If it was rejected, the same rejection surfaces.
- **PTY write throws** (e.g., session was closed between busy check and delivery): treat as `unknown_role` (the session is no longer present). Record in dedupe cache; a retry will hit the cache. Do NOT surface a distinct error — the caller cannot distinguish "closed just now" from "never existed" and shouldn't need to.
- **Session status transitions to `working` between busy check and delivery**: the delivery already happened (the check + write are within the same synchronous handler, no await). No race window in practice.
- **`inject_id` collision with an entry evicted from cache**: caller may receive a fresh delivery for a payload it thought was already committed. This is a documented v1 idempotency limit — the LRU cap and TTL bound this window. Callers who need stronger guarantees should include the request context in their id (e.g., hash of ticket+attempt).
- **Multiple concurrent `inject:request`s for the same `cwd`**: handled by sequential message processing on a single WebSocket. Multiple connections from the same client with concurrent requests: PTY writes are kernel-serialized; two accepts for the same session result in two writes in some order, both delivered atomically. Callers concerned about ordering should serialize their own dispatch.
- **`context` contains a NUL byte or unpaired UTF-16 surrogate**: passed verbatim to the PTY. Caller's problem to sanitize.

# Test Strategy

## Unit tests
Location: `tests/daemon/inject-api.test.ts` (new).

Behaviors to cover (each maps to a Responsibilities item):
- **auth accept**: request from a `clientIdentity` in `injectAllowedClients` proceeds past auth.
- **auth reject**: request from a `clientIdentity` NOT in `injectAllowedClients` returns `{status: 'rejected', reason: 'auth'}` and does not touch PtyManager or IdleDetector.
- **auth reject is timing-blind**: rejection latency for a nonexistent cwd equals rejection latency for an existing cwd, both from an unauthorized client. (Assert via mock — real timing is not the goal; ensuring the lookup path is skipped is.)
- **unknown_role when no session**: authorized client, cwd matches nothing → `rejected, reason='unknown_role'`.
- **unknown_role when multiple sessions**: authorized client, cwd matches two sessions → `rejected, reason='unknown_role'`, warning logged.
- **busy**: authorized client, single cwd match, IdleDetector returns `working` → `rejected, reason='busy'`. No PTY write.
- **accept when idle**: authorized, single match, `idle` → `accepted`, PTY written with exact bytes.
- **accept when needs-attention**: authorized, single match, `needs-attention` → `accepted`.
- **verbatim delivery**: `context` passed to PtyManager.write character-for-character (assert with a payload containing newline, tab, escape sequences).
- **idempotency**: same `inject_id` twice → second call returns the cached response, PtyManager.write called exactly once.
- **idempotency across reject**: same `inject_id` after a rejection returns the cached rejection, no state change.
- **LRU eviction**: cache honors the 10k cap; eviction is oldest-first.
- **TTL eviction**: entries older than 1 h evicted (test with mocked clock).
- **payload size cap**: 1 MB + 1 byte → `INVALID_MESSAGE` at the transport layer, NOT an `inject:response`.
- **missing `inject_id`**: `INVALID_MESSAGE`.
- **non-absolute cwd**: `INVALID_MESSAGE`.
- **logging**: request and response log lines match the specified format (regex assertions).

## Integration tests
Location: `tests/daemon/inject-api.integration.test.ts` (new).

Requires the mTLS fixtures from `transport-mtls-spec.md`. Behaviors:
- End-to-end: authorized fixture client cert + fixture session at a known cwd → accept + PTY receives the payload.
- Wrong-CA client cert refused at handshake — never reaches the inject handler.
- Authorized client cert whose SAN FQDN is NOT in `injectAllowedClients` → connection succeeds, `inject:request` rejected with `reason='auth'`.

# Completion Criteria

1. All Responsibilities implemented in `src/daemon/daemon.ts` (dispatch + handler), `src/daemon/inject-dedupe.ts` (LRU + TTL), and `src/shared/protocol.ts` (message types).
2. `injectAllowedClients` config field defined in `src/daemon/config.ts` per `transport-mtls-spec.md`.
3. All unit + integration tests above pass.
4. Manual verification: from a fixture Bosun-Mate client (fixture cert with a known SAN FQDN, added to `injectAllowedClients`), invoke each response branch against a live daemon and confirm the response taxonomy and PTY effect.
5. `specs/INDEX.md` updated with this spec.
6. `DEC-000011` entry created in `decisions/events/`, `decisions/SEQ.txt` incremented.
7. Handoff response document (reply to `switchboard-daemon-input.handoff.md`) drafted, ratifying the §3 straw-man with the edits enumerated in `switchboard-daemon-input.plan.md` → "What we send back to lab-git-manager".
