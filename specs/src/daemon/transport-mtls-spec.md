---
title: Daemon Transport (Lab-CA mTLS) Specification
version: 0.1.0
maintained_by: claude
domain_tags: [daemon, transport, auth, pki, mtls]
status: draft
governs: src/daemon/transport.ts, src/main/connection-manager.ts, src/main/local-daemon.ts, src/main/remote-provisioner.ts
platform: claude-code
license: MIT
---

# Purpose
Define the daemon's WebSocket-over-TLS transport contract when authentication is mediated by mutual TLS keyed off the operator's lab Root CA. Supersedes the pre-DEC-000010 pairing / bearer-token / fingerprint-pin auth model.

Governs authentication only. Message framing, sequencing, and payload shape remain per `specs/src/shared/protocol-spec.md`.

# Scope

## Covers
- TLS handshake requirements on the daemon (server) side and the client side.
- Cert storage layout and configuration precedence.
- Client identity extraction and its propagation into `ClientConnection`.
- Startup-time failure behavior when certs are missing or invalid.
- The removal of all legacy auth code paths.

## Does Not Cover
- Cert enrollment or issuance mechanisms — operator-provisioned out-of-band from the lab CA.
- Per-message authorization (which client identities may invoke which operations) — see the individual operation specs (e.g., `inject-api-spec.md`).
- Application-layer message framing — see `protocol-spec.md`.
- TLS version and cipher-suite selection beyond "modern defaults" — Node.js `https` defaults suffice; do not override.

# Inputs

## Daemon side (server)
- `SWITCHBOARD_TLS_DIR` env var, or `config.tls.dir` config file value, or the well-known path `~/.switchboard/tls/`, in that precedence order. Must contain:
  - `server.crt` — PEM-encoded server certificate signed by the lab CA. Subject CN and/or SAN must include the daemon host's FQDN.
  - `server.key` — PEM-encoded private key matching `server.crt`. File mode 0600.
  - `ca.crt` — PEM-encoded lab CA root certificate (chain of trust anchor for validating incoming client certs).

## Client side
- Analogous layout at `~/.switchboard/tls/` (or env override): `client.crt`, `client.key`, `ca.crt`. The client cert's SAN must include the client host's FQDN.

## Configuration
- `injectAllowedClients` — array of FQDNs authorized to invoke `inject:request`. Consumed by `inject-api-spec.md`; declared here because it names cert-derived identities.
- No `SWITCHBOARD_INSECURE=1` or equivalent bypass. There is no plaintext or self-signed fallback.

# Outputs

## Daemon side
- A `wss://` listener on `config.port` and `config.host`, TLS-terminated with `server.crt` / `server.key`, requiring and validating a client cert against `ca.crt`.
- Rejected TLS handshakes: distinct TLS alert (bad_certificate / unknown_ca / certificate_expired as applicable) so the client can diagnose without ambiguity. No application-layer fallback.
- Accepted connections: `ClientConnection` populated with a `clientIdentity` field equal to the client cert's first `subjectAltName` DNS entry.

## Client side
- A `WebSocket` opened to `wss://<daemonHost>:<daemonPort>` with `cert`, `key`, `ca` set from the client-side cert dir. `rejectUnauthorized: true` (default). No fingerprint check, no bearer token.

# Responsibilities

## Cert loading — daemon
1. Resolve cert dir per the precedence above. If unresolvable, log a clear error naming the paths tried and refuse to start.
2. Read `server.crt`, `server.key`, `ca.crt` synchronously at startup. If any file is missing, malformed, or the key doesn't match the cert, log the specific defect and refuse to start.
3. Log a startup line summarizing the effective identity: cert dir path, server cert subject CN, cert expiry timestamp, and the number of trust anchors in `ca.crt`. Do NOT log key material or full PEM bodies.

## TLS server construction
1. Use `https.createServer({ cert, key, ca, requestCert: true, rejectUnauthorized: true })`. Attach the `WebSocketServer` to this HTTPS server (existing `noServer` / `server` pattern in `transport.ts:start()`).
2. On a completed handshake, extract the client cert via `socket.getPeerCertificate(true)` at the connection-established boundary. Read the first `DNS:` entry from the cert's `subjectaltname` string. Store on `ClientConnection.clientIdentity`.
3. If `getPeerCertificate` returns an empty object (which indicates a completed handshake without a validated peer cert — should not happen with `rejectUnauthorized: true` but code defensively), close the WebSocket with code 4003 ("Auth failed") and log.

## TLS client construction — main-process connection manager
1. Resolve client cert dir per the same precedence. Load `client.crt`, `client.key`, `ca.crt`. On failure, mark the connection status `disconnected` with a descriptive error surfaced through the existing `daemon:error` broadcast path.
2. Pass `cert`, `key`, `ca` to the `ws.WebSocket` constructor. Leave `rejectUnauthorized` at its default (`true`). Do NOT set `checkServerIdentity` to a permissive function — the default hostname-vs-cert check is intended.

## Removal of legacy code paths (hard cutover)
The following are deleted in the same commit series that introduces mTLS. No config flag preserves them.
- `handlePairRequest`, `handlePairResponse`, and the `pair:request` / `pair:response` / `pair:challenge` / `pair:success` / `pair:fail` message types.
- The 6-digit pairing code file (`writePairingCodeFile` and its consumers in `remote-provisioner.ts`).
- The `handleAuth` bearer-token path in `transport.ts` and the `auth` / `auth:ok` / `auth:fail` message types on the standard connection path. (`auth:ok` may remain as an optional post-handshake handshake carrying `daemonId`/`hostname`/`version` if the client needs that metadata — but it is NOT gating access. Prefer sending metadata unsolicited on connect.)
- `getCertFingerprint` and the client-side fingerprint check.
- `generateSelfSignedCert` — the daemon no longer manufactures its own cert. `~/.switchboard/daemon.{crt,key}` (legacy path) is not read or written.
- `SWITCHBOARD_INSECURE` (never existed — do not add).

## Client-side pairing UI removal
- The "Add remote daemon" flow drops the pairing-code phase entirely. Form collects host + port only; the connection succeeds when mTLS succeeds and the daemon's identity metadata (name, daemonId) arrives on the first post-handshake message.
- Persisted daemon connections keep `{id, name, host, port, autoConnect}`. No `token`, no `fingerprint`.

## Provisioning updates (`remote-provisioner.ts`)
- The provisioner MUST upload the daemon's server cert bundle (`server.crt`, `server.key`, `ca.crt`) alongside the tarball, into the target's `~/.switchboard/tls/` directory. The certs come from a caller-provided local path (operator-managed) — the provisioner does NOT enroll certs.
- The state machine drops the read-pairing-code, wait-ready-for-pair, and complete-pairing steps. New machine: test SSH → probe target → upload tarball + certs → extract → install-service → verify listening → done.
- The provisioner's caller (the client's remote-provisioning modal) collects the local server-cert path from the operator; a sensible default is `~/.switchboard/tls-outbox/<target-fqdn>/` if the operator organizes their issued certs that way.

## Local daemon
- The local daemon (child process of the Electron client) reads its own server cert from the same well-known path. On the developer machine, the operator issues a cert with the developer machine's FQDN in SAN and drops it into `~/.switchboard/tls/`.
- If certs are missing at startup, the local daemon exits with a clear error message and instructions naming the exact paths to populate. The Electron client surfaces this via the existing local-daemon-status UI.

# Edge Cases / Fault Handling

- **Missing / unreadable cert files at daemon startup**: refuse to start; log all attempted paths and the specific error.
- **Key doesn't match cert**: refuse to start; log with the cert subject + key fingerprint (safe to log key fingerprints, not key material).
- **CA cert is expired**: refuse to start (validated at load time).
- **Server cert expired**: refuse to start (validated at load time).
- **Client presents no cert**: TLS handshake fails; connection closed at handshake with a `bad_certificate` alert. No application-layer error, no `auth:fail` message (which would require a WebSocket to be open).
- **Client cert not signed by lab CA**: TLS handshake fails; `unknown_ca` alert. Same behavior.
- **Client cert expired**: `certificate_expired` alert. Client should surface expiry-error text to the user in the sidebar.
- **Client's own cert files missing**: connection attempt fails synchronously on WebSocket construction; status set to `disconnected` with a specific error message surfaced through `daemon:error`.
- **Cert rotated on either side**: connections drop when the underlying TLS session ends; existing reconnect logic re-handshakes with the new cert. No daemon restart required if the daemon re-reads certs on rotation (out of scope for v1 — v1 reads certs at startup only; document that cert rotation on the daemon side requires a restart).
- **Fingerprint of the server cert is different from a persisted value** (leftover from pre-DEC-000010 clients): the persisted fingerprint field is no longer consulted. If a legacy client cache is loaded that has a `fingerprint` field, the client silently ignores it.

# Test Strategy

## Unit tests
Location: `tests/daemon/transport.test.ts` (extended), new `tests/daemon/transport-mtls.test.ts` as needed.

Behaviors to cover:
- Daemon refuses to start when any of `server.crt`, `server.key`, `ca.crt` is missing.
- Daemon refuses to start when key and cert don't match (mismatched pair).
- Daemon refuses to start when `ca.crt` is expired.
- Daemon extracts client identity from the first SAN DNS entry.
- Daemon closes with 4003 when peer cert is unexpectedly absent (defensive path).
- Client fails to construct WebSocket when its own cert files are missing; failure surfaced via `daemon:error`.

## Integration tests
Location: `tests/daemon/transport-mtls.integration.test.ts` (new). May require a fixture CA + fixture cert pair; keep fixtures under `tests/fixtures/tls/` and generate them via a helper script committed alongside.

Behaviors to cover:
- Handshake succeeds with a fixture-CA-signed server cert + client cert.
- Handshake fails when the client cert is signed by an unrelated CA (unknown_ca).
- Handshake fails when the client cert is expired (certificate_expired).
- Handshake fails when the client presents no cert (bad_certificate).
- After a successful handshake, `ClientConnection.clientIdentity` equals the SAN FQDN.

## Removed tests
- All bearer-token / pairing-code / fingerprint-pin cases in `tests/daemon/auth.test.ts` — deleted with the code they cover.

# Completion Criteria

1. All Responsibilities above are implemented in the source files listed under `governs`.
2. All legacy auth code (per Responsibilities → Removal) is deleted, not merely disabled.
3. `injectAllowedClients` config field is defined in `config.ts` (default: empty array) — consumed by `inject-api-spec.md`.
4. Unit and integration tests above pass.
5. Manual verification: fresh daemon on a target host + fresh client on a laptop, both with operator-issued certs, completes a `session:spawn` end-to-end. A client with no cert, an expired cert, or a wrong-CA cert is refused at the TLS layer with a distinct alert visible in the client's stderr.
6. `specs/INDEX.md` updated with this spec.
7. `DEC-000010` entry created in `decisions/events/`, `decisions/SEQ.txt` incremented.
