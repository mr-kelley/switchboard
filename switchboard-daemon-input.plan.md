---
title: Switchboard Daemon Input Contract — Scoped Implementation Plan
maintained_by: switchboard-developer
for: mrkelley (operator), then lab-git-manager
in_response_to: switchboard-daemon-input.handoff.md
status: locked — operator signed off on all 5 open questions 2026-08-03; ready for spec-writing
updated: 2026-08-03
---

# Scoped Implementation Plan

## Framing

lab-git-manager's handoff asks for a machine input contract on the daemon so the Bosun's Mate can inject work into a role's live session. The contract cannot be honored on today's transport (bearer-token + self-signed fingerprint pin). Two things have to change, in order:

1. **Lab-CA mTLS** — replace pairing/token/pin with lab-CA-issued server and client certs. This is the wider-lab compliance step and is a prerequisite for step 2 (per the handoff's §5 normative security constraints and the operator's plan to converge Switchboard onto the lab CA).
2. **Inject API** — new message type + contract that satisfies §A-§F of the handoff. Small once the auth story is right.

**Role-in-daemon**: none. The daemon addresses sessions by absolute project cwd (which it already tracks per-session). Bosun's `role → cwd` map lives on Bosun's side. Confirmed with operator.

## Sprint 22 — Lab-CA mTLS (biggest chunk)

Current state:
- Daemon: auto-generates self-signed cert at `~/.switchboard/daemon.{crt,key}` on first run (`src/daemon/config.ts:36`).
- Client: pins the daemon's cert by SHA-256 fingerprint captured during pairing; sends a bearer token, also from pairing.
- No client cert. No CA chain. `rejectUnauthorized: false` on the client's WS.

Target state:
- Daemon presents a lab-CA-signed server cert. Requests + validates client cert against the lab CA root. Extracts client identity (CN or SAN) into `ClientConnection` for later authorization decisions.
- Client presents a lab-CA-signed client cert. Validates the daemon's cert against the lab CA root (drop `rejectUnauthorized: false`, drop fingerprint pin).
- Pairing + bearer token retired for the standard path. Kept only as a `--dev` mode fallback for local development on machines without lab certs (see open question 3).

### Sub-tasks

**S22.1 — Cert acquisition & storage contract**
- Well-known paths: `~/.switchboard/tls/server.crt`, `server.key`, `ca.crt` on the daemon host; same layout for `client.{crt,key}` + `ca.crt` on client hosts.
- Config precedence: env vars → config file → well-known paths → refuse to start.
- Operator responsibility: certs delivered out-of-band by the lab CA before daemon/client startup. Not the daemon's job to enroll.

**S22.2 — Daemon TLS server**
- Update `transport.ts:start()` (`https.createServer`) with `requestCert: true`, `rejectUnauthorized: true`, `ca: [labCA]`.
- Read + verify client cert on handshake. On failure, close with a distinct TLS alert (surfaces cleanly on client side).
- Extract client identity from the cert's **subjectAltName** (FQDN) — the operator's lab CA issues client certs with the client FQDN in SAN, not CN. Store in `ClientConnection` for downstream authorization.

**S22.3 — Daemon message handling**
- Remove `pair:request` / `pair:response` / `auth` handling from the standard path. If session is authenticated at TLS layer (client cert valid), no additional bearer step.
- Keep the message routing intact — just skip the pre-auth gate.

**S22.4 — Client WS**
- `connection-manager.ts:141` — WebSocket config gets `cert`, `key`, `ca`; drop `rejectUnauthorized: false`; drop the fingerprint check.
- Remove pairing flow from the standard path (Preferences → Add remote daemon → **just host+port**, no code exchange).
- Persist only `{id, name, host, port, autoConnect}`, no token/fingerprint.

**S22.5 — Provisioning updates**
- `remote-provisioner.ts` — upload the server cert alongside the tarball (from a caller-provided local path or the operator's cert dir); write to `~/.switchboard/tls/` before starting the systemd unit.
- Drop the read-pairing-code step from the state machine.
- Drop the complete-pairing step.
- New shortened flow: test SSH → upload tarball + certs → install systemd unit → start → done (no client-side pair phase).

**S22.6 — Local daemon**
- On the client machine, the local daemon still runs but reads certs from the same well-known path — the developer machine gets its own lab-CA-signed server + client cert pair, same as any other host. No dev-mode fallback (see decision on open question 3, below). If certs are missing at startup, the local daemon refuses to start with a clear error and instructions.

**S22.7 — Migration**
- Any client on an existing paired setup will fail cert validation and refuse to connect. No graceful migration path — operator tears down and reprovisions. Pre-1.0, acceptable.

**S22.8 — Tests**
- Unit: transport accepts valid client cert, rejects unsigned/expired/wrong-CA certs.
- Unit: client rejects daemon cert not signed by lab CA.
- Integration: end-to-end handshake with fixture CA + certs.
- Governance: retire `tests/daemon/auth.test.ts`'s bearer-token cases; replace with mTLS coverage.

**Estimated rc count for Sprint 22**: 3 rcs (clean cutover, no legacy fallback to maintain).
- rc.12: daemon mTLS server + client mTLS client — hard cutover. Removes all pairing/token/pin code in the same commit series. Operator tears down existing daemons + client and starts fresh with certs.
- rc.13: provisioning updates — remote-provisioner uploads server cert alongside tarball, drops pair phases from the state machine.
- rc.14: local daemon cert bootstrap + failure-mode messaging when certs are missing.

## Sprint 23 — Inject API (small, once Sprint 22 lands)

New message type on the existing transport, delivered under mTLS from a client cert with `CN=bosun-mate` (or whatever identity the operator's CA issues for the Mate).

**S23.1 — Protocol**
- New client → daemon message:
  ```
  { type: 'inject:request', seq, inject_id, cwd, context }
  ```
- New daemon → client message (synchronous, keyed by `seq` + `inject_id`):
  ```
  { type: 'inject:response', seq, inject_id, status: 'accepted' | 'rejected', reason?: 'busy' | 'not_ready' | 'auth' | 'unknown_role' }
  ```
- Wire cap on `context`: 1 MB. Larger → rejected with a distinct error (not part of the taxonomy; a hard protocol error).

**S23.2 — Session lookup by cwd**
- Walk `PtyManager.getAll()`, find session whose `cwd === request.cwd`.
- Zero matches → `rejected, reason='unknown_role'`.
- Multiple matches → same → `rejected, reason='unknown_role'` (violates operator's 1:1 root-dir→role invariant, so this is a bug on Bosun's side; fail-closed).

**S23.3 — Busy semantics** (§C — reject-if-busy)
- Query `IdleDetector` for that session's status:
  - `working` → `rejected, reason='busy'`.
  - `idle` or `needs-attention` → deliver.
- Interleave is impossible: writes to the same PTY are serialized by the kernel. Confirmed for handoff response §4.

**S23.4 — Authorization** (§5 normative)
- Use the SAN-derived client FQDN (Sprint 22 wires this into `ClientConnection`).
- Inject handler requires the client's SAN FQDN to appear in the operator's `injectAllowedClients` config list. Default: empty (no client can inject until operator lists them by FQDN).
- Not in list → `rejected, reason='auth'`.

**S23.5 — Idempotency** (§D)
- LRU cache keyed on `inject_id` → last response (accepted/rejected + reason). Cap 10k entries, 1-hour TTL.
- Duplicate `inject_id` within window returns the cached response verbatim. No re-delivery.
- Cache persists across daemon restarts? Not for v1 — accept the small risk of duplicate-delivery across a restart. Note in handoff response so Mate can decide whether to burn a fresh id per restart.

**S23.6 — Delivery** (§F — verbatim boundary)
- On accept, write `context` to the PTY via `ptyManager.write(sessionId, context)`. **Verbatim, no framing, no trailing newline.** Caller composes their payload including whatever terminator the target expects (e.g., `\r` to submit at a prompt).
- Document in the handoff response: this is a **dumb, authenticated pipe for bytes into a PTY**. Escaping and terminators are the caller's problem. Matches Bosun's stated "I will treat the payload as hostile on my side regardless."

**S23.7 — Tests**
- Unit: each response branch (accepted / busy / not_ready / auth / unknown_role) with stub PtyManager + IdleDetector.
- Unit: idempotency — same inject_id twice returns same response, no double-write.
- Unit: authorization gate — CN in allowlist accepts, not in allowlist rejects.
- Integration: end-to-end inject over mTLS with fixture certs.

**Estimated rc count for Sprint 23**: 2 rcs.
- rc.16: `inject:request` + `inject:response` + lookup + busy + idempotency + tests.
- rc.17: authorization gate + integration test with a fixture "bosun-mate" client cert.

## Decisions locked in with operator (2026-08-03)

1. **Cert distribution mechanism.** Operator provisions out-of-band, files land at well-known paths before daemon/client starts. Currently one client (operator's laptop); design so adding more clients is a matter of the operator issuing another cert from the lab CA and dropping it on the new machine.
2. **Client identity.** SAN with FQDN. All connections are by FQDN only.
3. **Dev-mode fallback.** Killed. `npm run dev` requires lab certs like everything else. Developer (currently just the operator) issues themself a cert from the lab CA. No `SWITCHBOARD_INSECURE=1`, no legacy self-signed + token path anywhere. Cleaner code, and we're not shipping anything to non-operator devs anyway.
4. **`inject_id` persistence across daemon restarts.** Skipped in v1. Documented in the handoff response so the Mate can burn a fresh id per restart if it cares. Bring back in v2.
5. **`not_ready` reason code.** Collapsed into `unknown_role` for v1. Revisit if the daemon grows a real spawning/unhealthy state.

## Delivery estimate

Assuming a nominal 1-rc-per-day pace at the current test/manual-verify cadence:
- Sprint 22: ~1 week (3-4 rcs, biggest surface area).
- Sprint 23: ~2-3 days (2 rcs, small surface, needs Sprint 22).
- Response to lab-git-manager: same day Sprint 23 lands.

Total: ~1.5 weeks operator-side of testing, gated on Sprint 22 first.

## What we send back to lab-git-manager

Once both sprints land, reply to the handoff with:
- Ratified §3 straw-man (edits: `cwd` instead of `role` for addressing; add `seq` for our transport's sequencing convention; note that `not_ready` is collapsed into `unknown_role` for v1; note that `inject_id` dedupe does not survive daemon restart in v1).
- §4 confirmations (all three: yes, yes, yes).
- Concrete client-cert enrollment instructions: lab CA issues a client cert with the Mate host's FQDN in SAN; delivered to the Mate host at `~/.switchboard/tls/client.{crt,key}` alongside `ca.crt`; daemon-side `injectAllowedClients` config lists the Mate host's FQDN.
- Test fixture (a fixture CA + client cert + a `curl`-equivalent — probably a small Node script since our transport is WebSocket, not HTTP — demonstrating the accept and each reject).

## Not doing (deliberate scope cuts)

- Role registry inside the daemon. Bosun's role concept stays Bosun-side.
- Session-queue-on-busy. Reject-if-busy only per §C preference. `queuedPrompts` (existing feature) remains an Electron-client concern.
- Cross-daemon inject routing (Mate → some-daemon-figure-it-out). Mate resolves role → daemon-endpoint on its side per §A.
- ACME-like automatic cert enrollment. Operator handles it out-of-band.
