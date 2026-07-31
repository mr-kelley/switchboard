---
sprint: 21
title: Remote Daemon Provisioning over SSH
milestone: Fleet
status: planned
issue: 47
---

# Goal
From within Switchboard, the user gives SSH connection details for a target host; the client installs the Switchboard daemon on that host, starts it as a `systemd --user` service, retrieves the 6-digit pairing code over the SSH channel, and completes the pairing handshake automatically. Adding a new server becomes a form + a click instead of a manual `ssh`/`scp`/`systemctl` dance.

This is the first sprint of v6 Fleet. It fills a gap surfaced during Sprint 20 live-testing: the existing pairing flow assumes a daemon is already running on the target, but there is no in-app mechanism to install and start one on a fresh server. Cross-host session groups (Sprint 20) cannot be exercised end-to-end until this ships.

# Design

## Scope of this sprint
- **Target hosts:** x86_64 Linux with systemd, Node.js ≥ 20 installed, SSH server reachable, user session available (`systemd --user` requires a lingering user session or `loginctl enable-linger`).
- **Auth:** key-based SSH via the user's SSH agent or a specified key file. No password prompts in v1.
- **Non-goals (deferred to later Fleet sprints):**
  - Password authentication
  - Non-systemd hosts (OpenRC, s6, launchd, Windows Services)
  - Non-Linux targets (macOS, Windows Server, BSD)
  - Bundled Node.js (v1 assumes Node ≥ 20 on the target)
  - Fleet status view (Sprint 22+)
  - Remote daemon upgrade (Sprint 22+)
  - Persisted SSH connection-details management (Sprint 23+)

## Architecture

### SSH plumbing
- **Transport:** shell out to the system `ssh` and `scp` binaries via `child_process.execFile` with strict argument arrays (no shell interpolation, no path injection). Reuses whatever key/agent config the user already has.
- **New module:** `src/main/ssh-client.ts`
  - `test(target): Promise<{ok, stderr?, hostKey?}>` — `ssh -o BatchMode=yes -o ConnectTimeout=8 <target> true`. Surfaces host-key errors distinctly from auth errors.
  - `run(target, cmd, args): Promise<{stdout, stderr, code}>` — one shot command over SSH.
  - `upload(target, localPath, remotePath): Promise<void>` — `scp` wrapper.
  - All operations accept `{host, user, port, identityFile?}` and never accept a raw command string from the renderer.

### Daemon distributable
- **Build:** new npm script `dist:daemon-tarball` — produces `release/switchboard-daemon-<version>-linux-x64.tar.gz` containing:
  - `daemon/` — compiled `dist/daemon/**` output
  - `node_modules/ws/**`
  - `node_modules/node-pty/**` including the linux-x64 prebuild binary (already built by `dist:appimage`; reuse the rebuild output)
  - `README-daemon.txt` — one-page manual-install instructions as a fallback
- **Layout on target:** `~/.local/share/switchboard/daemon/` (matches XDG). `~/.local/state/switchboard/` for the daemon's own data.

### Install flow (a state machine in `src/main/remote-provisioner.ts`)
Each step is a discrete, cancellable operation with progress feedback to the renderer.
1. **Test connection** — `ssh <target> true`. Fail fast with a clear error class: unreachable / auth-failed / host-key-mismatch.
2. **Probe target** — `ssh <target> "node --version && systemctl --user is-system-running || true"`. Verify Node ≥ 20 and that `systemd --user` responds. Refuse with a clear message otherwise.
3. **Check for existing install** — `ssh <target> "test -f ~/.local/share/switchboard/daemon/daemon.js"`. If present, offer "reinstall" or "reuse existing and just re-pair" branches.
4. **Upload tarball** — `scp release/switchboard-daemon-*.tar.gz <target>:/tmp/`.
5. **Extract + place** — `ssh <target> "mkdir -p ~/.local/share/switchboard && tar -xzf /tmp/switchboard-daemon-*.tar.gz -C ~/.local/share/switchboard && rm /tmp/switchboard-daemon-*.tar.gz"`.
6. **Install systemd unit** — write `~/.config/systemd/user/switchboard-daemon.service` on the target (via `ssh <target> "cat > ..."` fed a heredoc from local template with `ExecStart=/usr/bin/node ~/.local/share/switchboard/daemon/daemon.js`). Then `systemctl --user daemon-reload && systemctl --user enable --now switchboard-daemon`.
7. **Wait for daemon ready** — poll `journalctl --user -u switchboard-daemon -n 50 --no-pager` looking for the "listening on 0.0.0.0:3717" marker, with a 30s timeout.
8. **Read pairing code** — the daemon writes its 6-digit unpaired code to a well-known location (`~/.local/state/switchboard/pairing-code.txt` — new daemon behavior for this sprint) and also emits it to systemd journal. `ssh <target> "cat ~/.local/state/switchboard/pairing-code.txt"`.
9. **Complete pairing** — feed the code + host details into the existing `ConnectionManager.pair(...)` / `submitPairingCode(...)` flow, but bypassing the user-typed-code step. On success, add the connection to preferences with `autoConnect: true`.
10. **Cleanup** — remove any temp artifacts on the target.

Every step reports progress and errors to the renderer via a new `remoteProvisioner:progress` broadcast so the modal can show a live status list.

### Daemon changes (small)
- On startup when unpaired, write the pairing code to `~/.local/state/switchboard/pairing-code.txt` (mode 0600) in addition to the existing stdout emission. On successful pairing, delete the file. This makes the code readable via SSH without parsing logs.

### UI: "Add remote daemon" flow
- **Preferences → Daemons** gets a new **"Add remote daemon"** button next to the existing "Pair with local daemon" button.
- Opens a modal `RemoteProvisioningModal.tsx`:
  1. **Details form:** host, user, port (default 22), identity file (default: agent).
  2. **Progress view:** vertical checklist rendering the 10-step state machine, with each step in one of {pending / active / done / failed}. Failed step shows the underlying error and a "Retry from here" button.
  3. **Success:** shows the paired daemon and closes to Preferences.

# Deliverables

## Implementation
- **Main:**
  - `src/main/ssh-client.ts` — SSH/SCP shell-out helper.
  - `src/main/remote-provisioner.ts` — install state machine, orchestrates the 10 steps, emits progress.
  - `src/main/ipc-handlers.ts` — new handlers `remoteProvisioner:start`, `remoteProvisioner:cancel`, `remoteProvisioner:retry-from`.
  - `src/main/preload.ts` — expose `daemon.remoteProvision.{start,cancel,retryFrom,onProgress}`.
- **Daemon:**
  - `src/daemon/pairing.ts` (or wherever pairing lives today) — write pairing code to `~/.local/state/switchboard/pairing-code.txt` on unpaired start; unlink on successful pair.
- **Renderer:**
  - `src/renderer/components/RemoteProvisioningModal.tsx` — new modal.
  - `src/renderer/components/PreferencesModal.tsx` — "Add remote daemon" trigger.
- **Build:**
  - `scripts/build-daemon-tarball.sh` (or `.js`) — assemble the tarball from build outputs.
  - `package.json` — new `dist:daemon-tarball` script.

## Specs
- `specs/src/main/ssh-client-spec.md` — new.
- `specs/src/main/remote-provisioner-spec.md` — new.
- `specs/src/renderer/components/RemoteProvisioningModal-spec.md` — new.
- Update `specs/src/main/preferences-store-spec.md` — additional daemon-connection fields (SSH details, if we persist them; deferred to Sprint 23 — see Non-goals).
- Update `specs/src/main/ipc-handlers-spec.md` and `specs/src/main/preload-spec.md` for the new surface.

## Decision log
- **DEC-000007 (planned):** SSH transport shape — shell out to system `ssh` vs. embed a Node SSH library (`ssh2`). Chosen: shell out for v1 (reuses user's existing SSH config, agent, keys).
- **DEC-000008 (planned):** Daemon distributable shape — tarball with bundled `node_modules/{ws,node-pty}` + assume system Node ≥ 20. Chosen over standalone-binary (avoids `pkg`/`nexe` maintenance burden) and over pure-scp (`node-pty` native module).

## Tests
- `tests/main/ssh-client.test.ts` — mock `execFile`; verify arg lists for `test` / `run` / `upload`; verify that untrusted input never reaches shell metacharacters.
- `tests/main/remote-provisioner.test.ts` — inject a stub `ssh-client`; verify the state machine sequences correctly, cancels cleanly, and reports errors per step.
- `tests/renderer/components/RemoteProvisioningModal.test.tsx` — form validation, progress rendering, retry-from-step behavior.

# Acceptance Criteria
- From a fresh Ubuntu VM with Node ≥ 20 and SSH access, the user can add a remote daemon via Preferences → Daemons → Add remote daemon. Within ~60 seconds the daemon is installed, running, and paired; a new tab/group appears in the sidebar for the remote host.
- All 10 install steps report progress; each failure surfaces a specific, human-readable error and offers a Retry from here.
- After success, closing the client does not affect the remote daemon; reopening the client reconnects (via existing pairing).
- No `child_process` call in this sprint invokes a shell (no `exec`, no `spawn` with `shell:true`); all use `execFile` with arg arrays.
- All shell-out args derived from user input are validated / escaped where they must appear in a remote command (heredocs, systemd unit content).
- All tests pass; live-tested against at least one Ubuntu 24.04 target host that Sprint 20's cross-group drag was blocked on.

# Dependencies
- **v3 Daemon** — reuses the daemon binary as-is aside from the small pairing-code-file addition.
- **Sprint 18 (systemd installer)** — the local installer's unit-file template and `systemctl --user` command patterns are a direct reference for the remote unit file; ideally we factor out a shared helper.
- **Sprint 20 (session groups)** — this sprint unblocks the multi-host testing that Sprint 20 needs.

# Notes / Open questions to resolve during implementation
- **Host-key trust model:** first-touch acceptance vs. strict-preverified. v1 leans on the user's existing `~/.ssh/known_hosts`; if the host is unknown, surface the fingerprint and require the user to click "Trust and continue" before proceeding.
- **Reinstall vs. reuse:** step 3's "existing install detected" branch may want to re-pair without transferring the tarball. Cheap enhancement; punt to review.
- **AppImage-only reality:** the client is now AppImage-only (rc.12 / DEC-000006). The daemon tarball is a separate artifact, produced by a separate build script; keep it that way — don't try to extract the daemon out of the AppImage at runtime.
- **What if `systemctl --user` requires linger?** Non-lingering user sessions kill user services when the last login closes. If we detect this, offer to run `loginctl enable-linger $USER` (requires sudo) or fall back to a `screen`/`nohup` startup (loses restart-on-failure).
- **Splitting:** if this sprint runs long, natural cut points are (a) SSH plumbing + probe (steps 1-2), (b) daemon tarball build + upload/install (steps 3-6), (c) pairing automation + UI (steps 7-10). Would map to Sprint 21a / 21b / 21c respectively — decide once the SSH module lands and we can see how much surface each piece really has.
