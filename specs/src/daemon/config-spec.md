---
title: Daemon Configuration Specification
version: 0.2.0
maintained_by: claude
domain_tags: [daemon, configuration, tls, mtls]
status: draft
governs: src/daemon/config.ts
platform: claude-code
license: MIT
---

# Purpose
Load and validate daemon configuration at startup. Resolve the TLS cert bundle from disk (the operator provisions it out-of-band per DEC-000010), merge with per-daemon knobs from an optional config file and environment overrides, and expose a typed `DaemonConfig` object to all daemon subsystems.

**Not covered by this module:** cert generation, first-run bootstrap, pairing, and any form of auto-enrollment. The daemon never creates certs on the operator's behalf. Cert distribution is the operator's responsibility (manual placement, the client's "Add remote daemon" flow, or the future in-app cert-init subcommand — see `sprints/fleet/22-switchboard-cert-init.md`).

# Scope

## Covers
- Data directory resolution (`SWITCHBOARD_HOME` env → `~/.switchboard`).
- TLS directory resolution (`SWITCHBOARD_TLS_DIR` env → config-file `tls.dir` → `<dataDir>/tls`).
- Cert bundle loading: reading `server.crt`, `server.key`, `ca.crt` as PEM strings.
- Optional config file loading from `<dataDir>/daemon.json` (or an explicit path passed to `loadConfig`).
- Environment overrides for host/port (`SWITCHBOARD_HOST`, `SWITCHBOARD_PORT`) — used by the remote-provisioned systemd unit to bind to `::` without editing the config file.
- Default values for all optional fields.
- Directory bootstrap (`buffers/`, `sessions.json` path) for downstream subsystems.
- The `injectAllowedClients` allowlist for the inject-request API (DEC-000011).

## Does Not Cover
- Runtime config reloading — the daemon must be restarted for config changes to take effect.
- Cert generation / enrollment — deferred to the future cert-init subcommand.
- TLS handshake behavior — governed by `specs/src/daemon/transport-mtls-spec.md`.
- Client-side connection configuration — governed by the client's `connection-manager` specs.
- Pairing, bearer tokens, or fingerprint pinning — retired in DEC-000010; do not add back.

# Inputs
- File system: `<dataDir>/daemon.json` (optional; defaults apply if missing).
- File system: three PEM files under the resolved TLS directory (`server.crt`, `server.key`, `ca.crt`). All three are **required** — a missing file is a hard failure at load time.
- Environment variables:
  - `SWITCHBOARD_HOME` — override for the data directory (default `~/.switchboard`).
  - `SWITCHBOARD_TLS_DIR` — override for the cert directory (highest precedence).
  - `SWITCHBOARD_HOST` — override for the bind host.
  - `SWITCHBOARD_PORT` — override for the bind port.

# Outputs
- A validated `DaemonConfig` object with `tls.cert`, `tls.key`, `tls.ca` populated as PEM strings (not paths).
- On successful load, `<dataDir>/`, `<dataDir>/buffers/` are created (recursive `mkdir`).
- Never writes cert files. Never prints connection strings, tokens, or fingerprints — those concepts were removed in DEC-000010.

# Responsibilities

## Data directory resolution

```typescript
function getDataDir(): string
```

- Returns `process.env.SWITCHBOARD_HOME` if set and non-empty.
- Otherwise returns `path.join(os.homedir(), '.switchboard')`.
- The directory is created (with `recursive: true`) as a side effect of `loadConfig`, not by this function.

## TLS directory resolution

```typescript
function resolveTlsDir(configFileTlsDir: string | undefined, dataDir: string): string
```

Precedence (first non-empty wins):
1. `SWITCHBOARD_TLS_DIR` environment variable.
2. `tls.dir` field from the parsed config file (if a config file is present and has this field).
3. `path.join(dataDir, 'tls')`.

## Cert bundle loading

```typescript
function loadCertBundle(tlsDir: string): { cert: string; key: string; ca: string }
```

Reads three fixed filenames from `tlsDir`:
- `server.crt` — daemon's server certificate (leaf, signed by the CA).
- `server.key` — private key matching `server.crt`.
- `ca.crt` — CA root cert used as trust anchor for client-cert validation.

For each file:
- If ENOENT, throw `CertLoadError` naming the exact path, restating the requirement, and pointing at the mTLS transport spec.
- If the file exists but does not contain a PEM `-----BEGIN` marker, throw `CertLoadError` naming the path.
- On any other IO error, throw `CertLoadError` wrapping the underlying message.

Never returns a partial bundle. Never generates certs.

## Configuration schema

```typescript
interface DaemonConfig {
  port: number;
  host: string;
  tls: {
    /** Directory the three cert files were loaded from (for logging/diagnostics). */
    dir: string;
    /** Server certificate PEM (leaf, signed by the operator's CA). */
    cert: string;
    /** Server private key PEM (matches `cert`). */
    key: string;
    /** CA root cert PEM (trust anchor for client-cert validation). */
    ca: string;
  };
  scrollbackLimit: number;
  sessionPersistPath: string;
  idlePattern?: string;
  /**
   * SAN FQDNs of client identities allowed to invoke `inject:request`.
   * Empty list = no client is authorized. Populated by the operator per
   * specs/src/daemon/inject-api-spec.md.
   */
  injectAllowedClients: string[];
}
```

### Defaults

Applied when the corresponding field is missing from the config file (or when no config file is present):

- `port`: `3717`
- `host`: `"127.0.0.1"`
- `scrollbackLimit`: `50000`
- `sessionPersistPath`: `<dataDir>/sessions.json`
- `injectAllowedClients`: `[]`
- `idlePattern`: `undefined` (idle detector uses its own default)

`tls.cert`, `tls.key`, `tls.ca` have no defaults — they are always loaded from disk.

## Environment overrides

```typescript
function envOverrides(): Partial<DaemonConfig>
```

Environment overrides win over both saved config and defaults:
- `SWITCHBOARD_HOST` (any non-empty string) → `host`.
- `SWITCHBOARD_PORT` (parses to a finite integer) → `port`. Invalid values are silently ignored.

This is how the remote-provisioner-installed systemd unit binds a remote daemon to `::` (dual-stack) without a config-file edit.

## Loading

```typescript
export function loadConfig(configPath?: string): DaemonConfig
```

1. Resolve the data directory.
2. Determine the config file path: `configPath` if provided, else `<dataDir>/daemon.json`.
3. If the config file exists, parse it as JSON (a parse failure throws — see edge cases). Otherwise treat as `{}`.
4. Resolve the TLS directory via `resolveTlsDir`.
5. Load the cert bundle via `loadCertBundle` — this throws if any file is missing or malformed and the function does not proceed past this point.
6. Merge parsed config, defaults, and env overrides into a `DaemonConfig`. Env overrides applied last (highest precedence).
7. Ensure `<dataDir>/` and `<dataDir>/buffers/` exist (recursive `mkdir`).
8. Return the merged config.

## Error type

```typescript
class CertLoadError extends Error {
  constructor(message: string);
}
```

Used exclusively for cert-bundle load failures. Config-file parse errors currently surface as raw `SyntaxError` from `JSON.parse` — the daemon startup path catches these at a higher level; no wrapper class exists yet in code. Future work (out of scope for this spec version) may add a `ConfigError` type for parse and validation failures.

# Edge Cases / Fault Handling

- **Config file missing:** treated as `{}`. Not an error. Defaults + env overrides apply.
- **Config file is malformed JSON:** `JSON.parse` throws; the daemon startup path surfaces the message and exits. No auto-recovery.
- **Cert file missing:** `CertLoadError` with the specific path, the required-file summary, and a pointer to the transport-mtls spec.
- **Cert file exists but is not PEM:** `CertLoadError` naming the path.
- **`SWITCHBOARD_HOME` points to a non-writable path:** the `mkdirSync` at the end of `loadConfig` throws; the daemon exits.
- **`SWITCHBOARD_PORT` is a non-numeric string:** silently ignored; the parsed or default port applies.
- **Config file `tls.dir` is a relative path:** used verbatim; the caller (systemd unit or CLI) is expected to supply an absolute path.
- **Multiple daemons under the same `SWITCHBOARD_HOME` at once:** file-level concurrency is not managed by this module. Two daemons sharing a data dir will conflict on the socket file and session store — that failure surfaces at the transport / session-store layers, not here.

# Test Strategy

Test file: `tests/src/daemon/config.test.ts`

- Unit test: `getDataDir` uses `SWITCHBOARD_HOME` when set.
- Unit test: `getDataDir` falls back to `~/.switchboard` when `SWITCHBOARD_HOME` is unset.
- Unit test: `resolveTlsDir` prefers `SWITCHBOARD_TLS_DIR` over the config-file field.
- Unit test: `resolveTlsDir` prefers the config-file field over the default.
- Unit test: `resolveTlsDir` falls back to `<dataDir>/tls` when neither is set.
- Unit test: `loadConfig` parses a valid config file with a subset of fields and fills in defaults.
- Unit test: `loadConfig` treats a missing config file as `{}` and applies defaults.
- Unit test: `loadConfig` throws `CertLoadError` when `server.crt` is missing.
- Unit test: `loadConfig` throws `CertLoadError` when `server.key` is missing.
- Unit test: `loadConfig` throws `CertLoadError` when `ca.crt` is missing.
- Unit test: `loadConfig` throws `CertLoadError` when a cert file exists but is not PEM.
- Unit test: `SWITCHBOARD_HOST` env override wins over the config-file `host`.
- Unit test: `SWITCHBOARD_PORT` env override wins over the config-file `port` when numeric.
- Unit test: `SWITCHBOARD_PORT` non-numeric value is ignored.
- Unit test: `loadConfig` populates `tls.cert`, `tls.key`, `tls.ca` as PEM strings (not paths).
- Unit test: `loadConfig` creates `<dataDir>/buffers/` if missing.
- Integration test: full load in a temp directory with a valid cert bundle produces a `DaemonConfig` whose `tls.dir` matches the expected resolution.

# Completion Criteria
1. `loadConfig` returns a validated `DaemonConfig` from a valid cert bundle + optional config file.
2. Every cert-load failure surfaces as a `CertLoadError` naming the exact path.
3. `SWITCHBOARD_HOME` / `SWITCHBOARD_TLS_DIR` / `SWITCHBOARD_HOST` / `SWITCHBOARD_PORT` env vars are respected in the documented precedence order.
4. No auth token, self-signed cert, or connection string is ever generated or printed — those concepts were removed in DEC-000010.
5. All tests pass.

# References
- [DEC-000010](../../../decisions/events/DEC-000010.json) — mTLS as the sole daemon transport auth; removed pairing / tokens / fingerprint pin / insecure fallback.
- [DEC-000011](../../../decisions/events/DEC-000011.json) — Inject API for Bosun's Mate (adds `injectAllowedClients` field).
- `specs/src/daemon/transport-mtls-spec.md` — the transport layer that consumes the loaded TLS bundle.
- `docs/setup/tls.md` — first-time-operator guide to bootstrapping a personal CA + certs manually.
- `sprints/fleet/22-switchboard-cert-init.md` — planned in-app cert-init subcommand that will land alongside a follow-up DEC.
