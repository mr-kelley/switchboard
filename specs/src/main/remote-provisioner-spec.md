---
title: Remote Provisioner Specification
version: 0.3.2
maintained_by: claude
domain_tags: [electron, main-process, remote-provisioning, ssh, systemd, mtls, multi-arch]
status: active
platform: claude-code
license: Apache-2.0
governs: src/main/remote-provisioner.ts
---

# Purpose
Orchestrate the end-to-end install of the Switchboard daemon on a target Linux host over SSH: probe (including target-arch detection) → transfer daemon tarball + cert bundle → extract → install as a `systemd --user` service → wait for readiness → open a client connection. Emits per-step progress so the renderer's modal can render a live checklist, supports cancellation, and supports resuming from a specific step after a failure.

Auth is mutual TLS keyed off the operator's lab CA (DEC-000010); tarball selection is arch-aware across `linux-x64`, `linux-arm64`, and `linux-armv7l` (DEC-000012).

# Scope

## Covers
- The 10-step state machine and its per-step commands.
- Idempotency of each step (a retry from a given step must not corrupt state left by a prior partial run).
- Progress callback protocol.
- Cancellation semantics.
- Locating the correct multi-arch daemon tarball on the client disk (dev + packaged) given the target's arch.
- The mapping from `uname -m` to tarball ARCH slug, and the failure mode for unsupported arches.
- Cert bundle upload (server cert / key / CA cert) into the target's `~/.switchboard/tls/`.

## Does Not Cover
- SSH plumbing (delegated to `ssh-client-spec.md`).
- WebSocket transport / TLS handshake (delegated to `transport-mtls-spec.md`).
- Tarball contents or how per-arch tarballs are built (delegated to `specs/scripts/build-daemon-tarball-spec.md`).
- UI rendering (owned by `RemoteProvisioningModal-spec.md`).
- Cert issuance from the lab CA (operator-provisioned out-of-band).

# Inputs
- `ProvisionRequest = { target: SshTarget, daemonName?, tarballPath, daemonPort, certs: ServerCertBundle }`.
  - `tarballPath` in v0.3 is an **arch-templated** path; the provisioner substitutes the detected ARCH slug at upload time. See §Tarball Path Resolution.
  - `certs: { serverCertPath, serverKeyPath, caCertPath }` — absolute local paths to the operator-issued cert bundle for this target.
- `ConnectionManager` reference — for `addAndConnect(host, port, name)`.
- `ProgressCallback = (state: readonly StepState[]) => void` — invoked on every step transition.

# Outputs
- Progress callbacks with the current step list snapshot.
- On success: a new managed connection appears in `ConnectionManager` (via `addAndConnect`), which the mTLS `auth:ok` handshake will rekey to the daemon's real `daemonId` (see `transport-mtls-spec.md`).
- On failure: throws the underlying error; leaves the failed step marked `failed` with `errorKind` + `errorDetail`.

# Step Definitions

| # | id | Purpose | Remote command |
|---|----|---------|----------------|
| 1 | `test-connection` | Verify SSH auth + reachability | `true` |
| 2 | `probe-target` | Resolve `$HOME`, verify systemd --user is active, read `uname -m` to select the matching tarball, **and verify `Linger=yes` for the target user** so the daemon survives after our SSH login exits. Node is not probed — the tarball bundles its own runtime (DEC-000009). | `set -e; echo "$HOME"; systemctl --user is-system-running \|\| true; uname -m; loginctl show-user "$USER" --property=Linger --value 2>/dev/null \|\| echo unknown` |
| 3 | `check-existing` | Detect a prior install (informational; does not branch behavior in v1) | `test -f ~/.local/share/switchboard/switchboard-daemon/dist/daemon/daemon/daemon.js && echo yes \|\| echo no` |
| 4 | `upload-tarball` | Ensure a user-owned cache dir exists (`mkdir -p ~/.cache/switchboard && chmod 700 ~/.cache/switchboard`), then scp the **arch-matched** daemon tarball to `~/.cache/switchboard/switchboard-daemon.tar.gz`. Never `/tmp`, which has the sticky bit and causes cross-operator collisions on shared hosts (DEC-000014). | `mkdir -p ~/.cache/switchboard && chmod 700 ~/.cache/switchboard` + (scp) |
| 5 | `upload-certs` | Upload `server.crt`, `server.key`, `ca.crt` via `~/.cache/switchboard/sb-*` temp paths (0700 parent dir shields the mid-upload private key from other users on the target — DEC-000014), then `install -m 0644/0600/0644` into `~/.switchboard/tls/` in a single remote step | (scp + `install -m`) |
| 6 | `extract` | Stop any prior daemon, overwrite prior install and extract | `systemctl --user stop switchboard-daemon 2>/dev/null \|\| true; mkdir -p ~/.local/share/switchboard && rm -rf ~/.local/share/switchboard/switchboard-daemon && tar -xzf ~/.cache/switchboard/switchboard-daemon.tar.gz -C ~/.local/share/switchboard && rm -f ~/.cache/switchboard/switchboard-daemon.tar.gz` |
| 7 | `install-service` | Write systemd user unit and enable+restart | See §Systemd Unit Template |
| 8 | `wait-ready` | Poll `systemctl --user is-active` and the journal for a listening/ready marker | Loop with 500ms sleep, 30s timeout |
| 9 | `connect-client` | Kick off `ConnectionManager.addAndConnect(host, daemonPort, daemonName)` so the client attempts the mTLS handshake. The `auth:ok` metadata message rekeys the provisional record to the daemon's real `daemonId`. | (client-side WS open) |
| 10 | `cleanup` | Remove temp tarball | `rm -f ~/.cache/switchboard/switchboard-daemon.tar.gz 2>/dev/null \|\| true` |

# Arch Detection (post-DEC-000012)

## Reading the target's arch
Step 2 (`probe-target`) captures `uname -m` alongside `$HOME` and the systemd status. The provisioner stores the raw string in its probe state and maps it via a fixed lookup table:

| `uname -m` | ARCH slug used to select the tarball |
|------------|--------------------------------------|
| `x86_64`   | `linux-x64`   |
| `aarch64`  | `linux-arm64` |
| `armv7l`   | `linux-armv7l` |

Any other value (e.g. `armv6l`, `i686`, `riscv64`, `ppc64le`) causes `probe-target` to throw with a message that names the reported string verbatim and lists the supported set — no fallback, no attempt to guess. This matches DEC-000012's fail-closed posture.

## Idempotency across retries
The detected ARCH is captured in the probe state alongside `remoteHome`. Retries from `probe-target` re-probe both. Retries from any later step reuse the probed values (a retry from `upload-tarball` after a network blip does not re-run `uname -m`).

# Responsibilities

## State Machine
- `run(fromStep?)`: resets `steps[fromStep..]` to `pending`, iterates them in order, calling `runStep(id)` for each. On error: marks the step `failed`, populates `errorKind` and `errorDetail`, and throws.
- `cancel()`: sets an internal flag; the flag is checked between steps and inside `wait-ready` polling loops. In-flight ssh/scp children do not receive SIGTERM (their timeouts fire naturally).
- `getState()`: snapshot of the current steps for inspection.

## Systemd Unit Template
```
[Unit]
Description=Switchboard daemon
After=network.target

[Service]
Type=simple
Environment=SWITCHBOARD_HOST=::
Environment=SWITCHBOARD_TLS_DIR=<home>/.switchboard/tls
ExecStart=<install-root>/bin/node <install-root>/dist/daemon/daemon/daemon.js
Restart=on-failure
RestartSec=5

[Install]
WantedBy=default.target
```

- `SWITCHBOARD_HOST=::` yields a dual-stack bind — mTLS + CA-validated client certs gate access, so a permissive bind is safe.
- `SWITCHBOARD_TLS_DIR` points the daemon at the well-known cert path uploaded in step 5.
- `ExecStart` uses the Node binary bundled inside the tarball (`bin/node`, DEC-000009). No target-side Node install is required.
- `<home>` and `<install-root>` are captured in step 2 and interpolated when the unit file is written.
- The heredoc marker (`SB_UNIT_END`) is single-quoted to disable shell expansion; `safeHeredoc` refuses to run if the unit content contains the marker on its own line.

## Cert Upload
- The remote TLS dir is created with `0700` and then populated with:
  - `server.crt` → `0644`
  - `server.key` → `0600`
  - `ca.crt` → `0644`
- Files are uploaded to `~/.cache/switchboard/sb-*` first (a 0700 user-owned dir created by step 4 — see DEC-000014) and then moved into place via `install -m` in a single remote step, so a partial upload never leaves a live daemon reading a mid-write file and no plaintext private key ever sits at 0644 in world-readable `/tmp` during the upload window.
- The provisioner refuses to run `upload-certs` if any of the three local paths in `ProvisionRequest.certs` does not exist — checked before any bytes leave the client.

## Client Connection (post-mTLS)
- Step 9 calls `ConnectionManager.addAndConnect(host, daemonPort, daemonName)`. The client opens `wss://` with its own cert/key/ca; the daemon validates and sends an unsolicited `auth:ok` metadata message; the connection manager rekeys its provisional entry to the daemon's real `daemonId` at that point (see `transport-mtls-spec.md`).
- The provisioner does not wait for the handshake to complete before marking `connect-client` done — that would double-count timeouts across two subsystems. If the handshake fails, the client surfaces the failure via the standard `daemon:error` channel, not the provisioning modal.

# Tarball Path Resolution
`defaultTarballPath(version, arch)` returns the path to the tarball matching a specific ARCH slug, resolved in this order:

1. Packaged AppImage: `process.resourcesPath/switchboard-daemon-${arch}.tar.gz` (stable name — the AppImage carries every supported arch as an `extraResource`, see `specs/scripts/build-daemon-tarball-spec.md`).
2. Dev build (relative to `app.getAppPath()`): `../../release/switchboard-daemon-${arch}.tar.gz` and `../../release/switchboard-daemon-${version}-${arch}.tar.gz`.
3. CWD fallback: `./release/switchboard-daemon-${arch}.tar.gz` and `./release/switchboard-daemon-${version}-${arch}.tar.gz`.

If none exist, `upload-tarball` throws with the resolved paths in the error message. The IPC handler that constructs a `ProvisionRequest` passes the arch value returned by `probe-target` into this resolver — meaning the caller doesn't need to know which arch the target is.

# Edge Cases / Fault Handling
- **Target has no Node installed:** not an error — the tarball bundles its own runtime.
- **`systemctl --user` not active** (no user session, no linger): step 2 throws suggesting `loginctl enable-linger $USER`.
- **User lingering not enabled** (`Linger=no` from `loginctl show-user`): step 2 fails closed with a message naming the target user and the exact `sudo loginctl enable-linger <user>` command. Without lingering, the target's per-user systemd manager tears down when the last login session exits, taking the daemon with it — the failure is invisible at provision time because our SSH session is itself keeping systemd alive. See DEC-000013. The provisioner intentionally does not run the sudo itself.
- **`uname -m` returns an unsupported string:** step 2 throws with a message like `unsupported target arch: 'armv6l'; supported: x86_64, aarch64, armv7l. See DEC-000012.` Retriable in the sense that a re-run will re-probe — but the only real recovery is a different target host.
- **Local tarball for the detected arch does not exist:** step 4 throws with the full search-path list. Points at either a client-side build gap (dev machine missing an arch) or a broken release artifact.
- **Existing install detected:** step 3 records a `message` but does not branch; step 6 always removes and re-extracts.
- **Daemon fails to become active/ready within 30s:** step 8 throws with the last observed service state or journal fragment. Retriable.
- **Cert bundle path missing on the client:** step 5 throws before any upload, naming the missing path.
- **Cert dir already exists on the target with looser perms:** step 5's `chmod 700` tightens it.
- **Stale transient file owned by another user on the target:** does not happen — step 4 uploads under `~/.cache/switchboard/`, a per-user dir. Historically (pre-DEC-000014) the provisioner wrote to `/tmp/switchboard-daemon.tar.gz`, and a stale file left by a different operator's failed run would collide with the sticky bit and fail scp with `Permission denied`. If a target still has a stale `/tmp/switchboard-daemon.tar.gz` from before this change, it's harmless orphaned data — the new code no longer touches that path.
- **Cancel during a step:** the current step's shell child completes on its own (up to 30s worst case for `run()`); after control returns to the state machine, the loop notices the flag and stops before starting the next step.
- **Retry-from-step re-runs steps N and later:** intermediate steps must be safe against prior partial state (extract always removes first; install-service always daemon-reloads; wait-ready polls fresh; cert install uses `install -m` which overwrites atomically).

# Test Strategy
Unit tests in `tests/main/remote-provisioner.test.ts` (Vitest):
- **State-machine sequencing:** stub `ssh-client` returns success for every call; verify all 10 steps run in order and end `done`.
- **Cancellation:** cancel during step 4; verify subsequent steps are not executed and the current step's status is not clobbered.
- **Retry-from-step:** run through step 6, inject a step-7 failure, call `run('install-service')`; verify steps 1-6 are not re-executed and step 7 runs fresh.
- **Probe validation:** malformed probe output (non-absolute `$HOME`, systemctl offline, missing `uname -m` line) each throw with the specific error message.
- **Arch mapping — supported:** for each of `{x86_64, aarch64, armv7l}`, verify the probe captures the correct ARCH slug and step 4 uploads the matching tarball path.
- **Arch mapping — unsupported:** for each of `{armv6l, i686, riscv64, mips}`, verify probe throws with the reported string in the message and no later step runs.
- **Heredoc guard:** attempting to build a unit file whose content contains `\nSB_UNIT_END\n` throws before spawning.
- **Cert bundle — missing files:** each of `serverCertPath` / `serverKeyPath` / `caCertPath` missing causes step 5 to throw naming that specific path; no scp is attempted.
- **Cert bundle — happy path:** verify the remote `chmod 700` + `install -m 0644/0600/0644` sequence is composed correctly.
- **Client connect handoff:** verify step 9 calls `ConnectionManager.addAndConnect(host, port, name)` exactly once, with the values from the request.

# Completion Criteria
- Live-tested end-to-end against three fresh targets: an Ubuntu x86_64 VM, a Raspberry Pi 4 (aarch64), and a Raspberry Pi 3 (armv7l). Each modal reports all 10 steps done in ~60s and the daemon appears in the sidebar under the new group.
- Retry-from-step is validated by hand: kill the daemon between steps 7 and 8, retry from `wait-ready`, and complete without re-uploading.
- An unsupported target (a spare armv6l Pi Zero, or an i686 VM) fails cleanly at `probe-target` with the reported arch in the error, and no bytes reach `/tmp` on the target.
- No orphaned files on the target after either a successful run or an explicit uninstall path (uninstall path is out of scope for v1).
