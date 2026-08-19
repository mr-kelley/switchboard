---
sprint: 22
title: In-app cert init — bootstrap a personal CA + certs from the client
milestone: Fleet
status: planned
issue: TBD
---

# Goal
A first-time user who does not already have a lab CA can bootstrap the entire mTLS chain from within Switchboard: `switchboard cert init` (from the AppImage CLI) or Preferences → Certs → Initialize (in the client UI) generates a personal CA, issues a matching client cert for the operator's own use, issues a server cert for the local daemon, places everything with the right permissions, and lands the operator at a working `Preferences → Daemons` view. The manual `openssl` recipe currently documented in `docs/setup/tls.md` remains supported for operators with an existing lab CA, but is no longer the only path to a first-launch success.

This is Fleet Sprint 22. It removes the hardest onboarding blocker surfaced during the Sprint 21 live-verification and post-merge docs walkthrough: an operator without pre-existing PKI infrastructure has no way past `~/.switchboard/tls/` being empty. Every attempted first launch fails with `CertLoadError: required TLS file not found`, and the recovery path assumes fluency with `openssl` and X.509 SANs.

Downstream effect: makes the existing Sprint 21 "Add remote daemon" flow work without prerequisite CA setup. Once cert-init runs, the client has a signing key it can use to issue matching server certs for each remote daemon as part of provisioning, closing the loop that Sprint 21 left half-open (DEC-000010 assumed cert distribution was "operator out-of-band"; this sprint softens that assumption for single-operator setups without weakening it for lab deployments).

# Design

## Scope of this sprint
- **Single-operator, single-workstation CA.** The generated CA is intended for one operator's own hosts, not for issuing certs to other users. A `--replace-with-lab-ca` migration path is out of scope for v1.
- **Delivery surfaces (both, sharing the same core implementation):**
  - CLI: `Switchboard-<version>.AppImage cert init` (documented in the README as the recommended first-launch path).
  - In-app: Preferences → Certs → Initialize (calls the same core code via an IPC handler).
- **Idempotent by default:** an existing `~/.switchboard/ca/` is reused (only issue new leaf certs); an existing `~/.switchboard/tls/` bundle is refused with a "clear the dir first" message. `--force` overrides.
- **Non-goals (deferred to later Fleet sprints or explicitly out of scope):**
  - Password-protected CA keys (single-operator laptop threat model does not warrant it; would break automation).
  - CRL / OCSP / revocation infrastructure.
  - Multi-operator CA hierarchies or intermediate CAs.
  - Migration from a personal CA to a lab CA (documentation path only, no in-app tooling).
  - Replacing the existing lab-CA integration path — operators who want lab-CA-signed certs still use `docs/setup/tls.md`; cert-init is purely additive.
  - Cert rotation UX beyond "re-run cert init to reissue a leaf." Rotation of the CA root itself is a documented manual operation.
  - Bundling the operator's CA into remote provisioning (that's separate work — see the Sprint 21 follow-up notes below).

## Architecture

### Cert-gen library — implementation choice

Sprint execution needs to pick one of three approaches for the underlying cert generation. Decision to be captured in a DEC filed at the start of the sprint (see Decision log). Options:

- **A. Shell out to `openssl`** — no new npm deps. Requires `openssl` on the host; not always present on minimal user environments. Same commands the docs already document, so behavior stays traceable.
- **B. `node-forge`** — pure JS X.509 primitives. ~200 KB dependency. Battle-tested; used by many Node cert-issuing tools. No system dependency.
- **C. `@peculiar/x509`** — modern WebCrypto-based. Smaller than node-forge; TypeScript-native. Newer.

**Recommendation to lock in via DEC:** **B (node-forge)** for v1. Rationale: no runtime dep on `openssl`; the AppImage runs on any glibc x64 Linux without extra prerequisites; libraries are mature; sprint scope stays contained.

### CLI entry point

- `src/main/main.ts` gets a subcommand dispatch at startup: if `process.argv[1]` matches a known subcommand (`cert`, subcommand `init`), skip the Electron BrowserWindow bootstrap and run the CLI handler.
- New module: `src/main/cli/cert-init.ts`.
- Reuses `src/main/preload.ts` types where relevant, but does not require the renderer to be running.

### Core cert-gen module

- New module: `src/main/tls/cert-gen.ts`.
- Exposes three functions:
  - `createPersonalCa(opts): CaBundle` — generates a fresh CA key + self-signed root cert; returns `{ pem, keyPem, subject, notAfter }`.
  - `issueLeafCert(ca, opts): LeafBundle` — signs a leaf cert (server or client) against the CA; returns `{ pem, keyPem, subject, sans, notAfter }`.
  - `verifyChain(leaf, ca): boolean` — sanity check for tests and for the daemon-start smoke path.
- Uses node-forge (pending DEC) exclusively for X.509 primitives; no `child_process` calls.

### CA storage

- CA key + cert live under `~/.switchboard/ca/` (separate from `tls/`) with mode `0700` on the dir and `0600` on `ca.key`. `~/.switchboard/tls/ca.crt` is a copy of the CA root.
- `~/.switchboard/ca/README.txt` is written on init explaining the significance of `ca.key`, warning against committing/backing up over insecure channels, and pointing at the rotation section of `docs/setup/tls.md`.

### Client-cert identity

Default identity: `switchboard.<sanitized-hostname>.local` where `<sanitized-hostname>` is `os.hostname()` with non-DNS-safe characters replaced by `-`. Override with `--identity=<fqdn>` on the CLI or a form field in the in-app modal.

### Server-cert identity

For the local daemon: SANs = `DNS:localhost, IP:127.0.0.1, IP:::1`. Additional SANs can be added via `--server-san=DNS:foo,IP:1.2.3.4` (repeatable) for the case where the operator wants their local daemon reachable from other hosts on their LAN.

### File placement + modes

```
~/.switchboard/
  ca/
    ca.crt    (0644)
    ca.key    (0600)
    README.txt
  tls/
    ca.crt      (0644) — copy of ~/.switchboard/ca/ca.crt
    server.crt  (0644)
    server.key  (0600)
    client.crt  (0644)
    client.key  (0600)
```

Dir modes: `0700` on both `ca/` and `tls/`.

### Idempotence contract

- **Fresh install** (`ca/` missing, `tls/` empty): generate CA, issue both leaf certs, populate `tls/`. Success.
- **Reissue leaves** (`ca/` present, `tls/` empty): reuse existing CA, issue fresh leaf certs, populate `tls/`. Success. Prints a note that the existing CA is being reused.
- **Reissue leaves after cleanup** (`ca/` present, `tls/` present): refuse by default with a "your existing bundle at ~/.switchboard/tls/ would be overwritten — pass `--force` to replace it, or clear the directory manually" message. With `--force`, proceed as above.
- **CA rotation** (`ca/` present, want new CA): out of scope for the sprint. Documented workaround: `rm -rf ~/.switchboard/ca ~/.switchboard/tls` and re-run cert-init.

### IPC surface (for the in-app modal)

- `certInit:status` (invoke → response): returns `{ caPresent, tlsBundlePresent, defaultIdentity }` for the modal to render the initial form.
- `certInit:run` (invoke → response, streaming progress): takes `{ identity?, serverSans?, force? }`, emits `certInit:progress` broadcasts through each step, resolves to `{ success, tlsDir, notes }` or rejects with a typed error.

### UI: Preferences → Certs

- New sidebar entry under Preferences: **Certs**.
- Two panels:
  1. **Current state:** shows what's in `~/.switchboard/ca/` and `~/.switchboard/tls/` (issuer, subject, SANs, valid-until), or "not initialized yet."
  2. **Initialize / Reissue:** form with identity, additional server SANs, and a "Force overwrite" checkbox. Live progress list matching the CLI's step sequence.

### Downstream integration with Sprint 21 (remote provisioning)

- Once cert-init has run, the `remote-provisioner` module gains a new step (post-tarball-upload, pre-daemon-start) that issues a server cert for the target host — using SAN `DNS:<target-hostname>, IP:<resolved-target-ip>` — and uploads it alongside `ca.crt`. This closes the loop that Sprint 21 left "operator-out-of-band."
- This integration change is a **stretch goal** for this sprint. If it can't land in the same sprint, it becomes Sprint 23 and Sprint 22 delivers only the local-init story.

# Deliverables

## Implementation
- **Main:**
  - `src/main/tls/cert-gen.ts` — core CA / leaf issuance (node-forge, pending DEC).
  - `src/main/cli/cert-init.ts` — CLI subcommand handler.
  - `src/main/cli/index.ts` — dispatch from `main.ts`'s `argv` to CLI subcommands vs. Electron bootstrap.
  - `src/main/main.ts` — early-argv sniff to route to CLI dispatch when `cert init` is present.
  - `src/main/ipc-handlers.ts` — `certInit:status`, `certInit:run` handlers; `certInit:progress` broadcaster.
  - `src/main/preload.ts` — expose `cert.init.{status, run, onProgress}`.
- **Renderer:**
  - `src/renderer/components/PreferencesModal.tsx` — new Certs section.
  - `src/renderer/components/CertsPanel.tsx` — status + form + progress rendering.
- **Docs:**
  - `docs/setup/tls.md` — new "Bootstrapping in-app" section pointing at `switchboard cert init` as the recommended path for single-operator setups, with the manual openssl recipe demoted to "if you have an existing lab CA or want fine-grained control."
  - `README.md` — update the Security model bullet that currently points at `docs/setup/tls.md` to mention the cert-init subcommand as the recommended first-launch path.

## Specs
- `specs/src/main/tls/cert-gen-spec.md` — new.
- `specs/src/main/cli/cert-init-spec.md` — new.
- `specs/src/renderer/components/CertsPanel-spec.md` — new.
- Update `specs/src/main/ipc-handlers-spec.md` and `specs/src/main/preload-spec.md` for the new surface.

## Decision log
- **DEC-000015 (planned):** Introduce single-operator in-app cert enrollment. Formally softens DEC-000010's "operator out-of-band" assumption for the personal-CA case. Constrains scope to single-operator, single-workstation; lab-CA path unchanged.
- **DEC-000016 (planned):** Cert-gen implementation choice (openssl shell-out vs. node-forge vs. @peculiar/x509). Chosen at sprint start so implementation can proceed. Recommendation: node-forge.

## Tests
- `tests/main/tls/cert-gen.test.ts` — CA generation produces a valid self-signed root; leaf issuance produces a chain that `verifyChain` accepts; leaf certs carry the requested SANs.
- `tests/main/cli/cert-init.test.ts` — CLI flow against a temp `SWITCHBOARD_HOME`: happy path, existing-CA reissue, existing-bundle refusal, `--force` override, invalid identity.
- `tests/renderer/components/CertsPanel.test.tsx` — status rendering, form validation, progress-list transitions, error surfacing.
- Integration test: cert-init → daemon start against the produced bundle → transport handshake succeeds against a stub client using the produced `client.crt`.

# Acceptance Criteria
- From a fresh install (empty `~/.switchboard/`), running `Switchboard-<version>.AppImage cert init` (or clicking Initialize in Preferences → Certs) produces a working bundle: `~/.switchboard/tls/` contains all five files at the documented modes, and starting the daemon succeeds.
- The generated `client.crt` has a SAN DNS matching either the user-supplied identity or the default `switchboard.<hostname>.local`.
- The generated `server.crt` has SANs for `localhost`, `127.0.0.1`, `::1`, plus any operator-supplied additional SANs.
- Reissuing (re-running cert init with `~/.switchboard/ca/` already populated) reuses the existing CA and issues fresh leaves — it does not silently regenerate the CA.
- Re-running against an existing populated `tls/` dir refuses by default; `--force` succeeds.
- No `child_process` call from the cert-init path invokes `openssl` (assuming DEC-000016 lands on node-forge). All cert operations are pure JS.
- All tests pass; live-tested on the operator's workstation (`cloud0`) with a fresh `SWITCHBOARD_HOME=/tmp/sb-test` sandbox.
- README's Security model bullet points at cert-init as the recommended path; `docs/setup/tls.md` keeps the manual recipe but frames it as "if you already have a lab CA or want fine-grained control."

# Dependencies
- **DEC-000010** — the mTLS transport spec that this sprint fills in the enrollment gap for.
- **Sprint 21 (remote provisioning)** — the remote-provisioner integration in the stretch goal reuses the SSH plumbing that Sprint 21 built. If Sprint 22 splits, that stretch item becomes Sprint 23.

# Notes / Open questions to resolve during implementation
- **Argv routing sanity:** early-CLI dispatch in `main.ts` must run before any Electron initialization (`app.on(...)`, `BrowserWindow`, etc.). Verify on Linux AppImage that the CLI path exits cleanly without leaking Chromium processes.
- **CA key modes on Linux:** confirm that `fs.writeFileSync(..., { mode: 0o600 })` actually produces `0o600` on filesystems used by target hosts (verified on ext4; check on tmpfs / eCryptfs / btrfs subvolumes if operators use those).
- **Identity default when `os.hostname()` returns something DNS-hostile:** the sanitizer replaces non-`[a-zA-Z0-9.-]` with `-` and drops leading/trailing hyphens. Test cases: hostname with underscores (Docker default), hostname with dots ("mikes.laptop"), empty hostname (some minimal images).
- **In-app UX on locked cert dir:** if `~/.switchboard/tls/` is present but was made by manual openssl, the operator's real intent may be to reissue leaves against a *manually* provisioned CA (which they'd have in `~/.switchboard/ca/` or somewhere they'd need to point at). The `--force` overwrite is the right default; the UX may want a "keep existing CA, only reissue leaves" branch that references an external `--ca-key=<path>`. Deferred to review — v1 assumes CA either exists in the standard location or is being freshly generated.
- **Rotation UX:** the sprint intentionally does not add a "rotate CA" flow. If operators start asking for one, plan a follow-up sprint rather than shoehorning it in here.
- **Docs migration:** once cert-init lands, `docs/setup/tls.md` needs to be reframed so the CLI is the primary path. Doing this in the same sprint keeps the docs consistent with what ships.
- **Splitting:** if this sprint runs long, natural cut points are (a) cert-gen library + CLI subcommand, (b) in-app modal + preferences integration, (c) remote-provisioner integration. (c) is already flagged as a stretch goal / potential Sprint 23.
