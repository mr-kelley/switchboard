---
title: SSH Client Specification
version: 0.1.0
maintained_by: claude
domain_tags: [electron, main-process, ssh, security, remote-provisioning]
status: active
platform: claude-code
license: Apache-2.0
governs: src/main/ssh-client.ts
---

# Purpose
Provide a narrow, safe wrapper around the system `ssh` and `scp` binaries so the remote-provisioning flow (Sprint 21) can talk to target Linux hosts without embedding a full SSH client library. Every operation validates user-derived input, passes each argument as a distinct argv element (no shell interpolation), and classifies stderr into typed error kinds.

# Scope

## Covers
- Three operations: `test`, `run`, `upload`.
- Strict input validation for `host`, `user`, `port`, `identityFile`, and any custom SSH options.
- Typed error class (`SshError`) with a discriminated `kind`: `unreachable | auth-failed | host-key-mismatch | host-key-unknown | command-failed | timeout | ssh-missing | invalid-input | unknown`.
- Password-less operation via `-o BatchMode=yes`.
- Timeout and keepalive tuning suitable for install-flow use.

## Does Not Cover
- Interactive password prompts.
- Port forwarding, tunnels, X11, SFTP subsystem beyond `scp`.
- ssh-agent management (delegates entirely to the user's environment).
- Concurrent connection pooling / multiplexing (relies on the user's `~/.ssh/config` if they've enabled ControlMaster themselves).

# Inputs
- `SshTarget = { host, user, port, identityFile?, options? }` — validated at the top of every public call.
- Character-class regexes gate every field:
  - `host`: `[a-zA-Z0-9._:\-\[\]]+` (hostnames, IPv4, IPv6 in brackets)
  - `user`: `[a-zA-Z0-9._\-]+`
  - `port`: 1–65535
  - `identityFile`: `[\w./\-]+`
  - `options`: keys `[A-Za-z][A-Za-z0-9]*`, values `[A-Za-z0-9._\/=+\-]+`
- `run(target, remoteCommand)` — the remote command is passed as a **single argv element** to `ssh`; the caller is responsible for shell quoting inside that string.

# Outputs
- `test()` → `{ stderr }` on success; throws `SshError` on failure.
- `run()` → `{ stdout, stderr, code }` on exit code 0; throws `SshError` with parsed `kind` on non-zero exit or spawn failure.
- `upload()` → `void` on success; throws `SshError` on failure.

# Responsibilities
- **Argument construction:** always via string arrays. Base options are `-o BatchMode=yes -o ConnectTimeout=8 -o ServerAliveInterval=10 -o ServerAliveCountMax=3`. `-i identityFile` implies `-o IdentitiesOnly=yes` so the specified key is the only one tried.
- **Timeouts:** default 15s (test), 30s (run), 120s (upload); override per call.
- **Error classification:** stderr is lowercased and matched against known ssh/scp error phrases:
  - `remote host identification has changed` / `host key verification failed` → `host-key-mismatch`
  - `the authenticity of host` / `no matching host key` → `host-key-unknown`
  - `permission denied` → `auth-failed`
  - `connection refused` / `no route to host` / `network is unreachable` / `name or service not known` / `could not resolve hostname` → `unreachable`
  - `operation timed out` / `connection timed out` → `timeout`
  - default → `command-failed`
- **Missing binary:** `ENOENT` from spawn → `ssh-missing` (both `ssh` and `scp` share this classification).
- **Buffer size:** `maxBuffer: 4 MiB` for `run()` — enough for a `journalctl` tail without truncation but capped so a runaway command doesn't wedge us.
- **No side effects** other than the spawned processes; the module holds no state.

# Edge Cases / Fault Handling
- **Invalid input reaches the module:** throws `SshError('invalid-input', ...)` **before** any process spawn.
- **Non-zero exit with empty stderr:** classifies as `command-failed`; the exit code is preserved on `SshError.exitCode`.
- **execFile timeout:** child is killed with SIGTERM; classified as `timeout`.
- **Custom `options`:** merged after the base options so users can override e.g. `StrictHostKeyChecking` if they know what they're doing. Values are still character-class validated.
- **`identityFile` without `~` expansion:** the OS ssh binary handles `~` expansion inside `-i`, so we let it through as long as the path matches the allowlist.

# Test Strategy
Unit tests in `tests/main/ssh-client.test.ts` (Vitest) with `child_process.execFile` mocked:
- Argument construction: each op produces the exact expected argv (base options + `-p`/`-P` + `-i` if given + user@host + command).
- Input validation: bad host / user / port / identityFile / option key / option value each throw `SshError('invalid-input', ...)` without spawning.
- Error classification: seeded stderr strings for each `kind` produce the correct discriminant on `SshError`.
- Spawn failures: `ENOENT` → `ssh-missing`; SIGTERM kill → `timeout`.
- The `run()` command string is passed as a single argv element (regression guard against future refactors that try to expand it).

# Completion Criteria
- All calls to `ssh` and `scp` in the codebase go through this module.
- No `child_process.exec` or `spawn({shell: true})` anywhere in the remote-provisioning path.
- Live-tested: successful `test`, `run`, and `upload` against a real Ubuntu VM with the user's normal SSH agent + keys.
