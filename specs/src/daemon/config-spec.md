---
title: Daemon Configuration Specification
version: 0.1.0
maintained_by: claude
domain_tags: [daemon, configuration, tls, auth]
status: draft
governs: src/daemon/config.ts
platform: claude-code
license: MIT
---

# Purpose
Load, validate, and provide daemon configuration. Handle first-run setup: generate auth token, self-signed TLS certificate and key, and write a default configuration file. Expose a typed configuration object to all daemon subsystems.

# Scope

## Covers
- Configuration file loading from `~/.switchboard/daemon.json` (or `$SWITCHBOARD_HOME/daemon.json`).
- Configuration schema: required and optional fields with defaults.
- First-run bootstrapping: token generation, TLS cert/key generation, default config file creation.
- Connection string output on first run.
- Configuration validation.

## Does Not Cover
- Runtime config reloading (daemon must be restarted for config changes).
- Client-side connection configuration -- governed by client specs.
- TLS transport setup -- governed by daemon transport spec (consumes config values).

# Inputs
- File system: `$SWITCHBOARD_HOME/daemon.json` (default `~/.switchboard/daemon.json`).
- Environment variable: `SWITCHBOARD_HOME` (optional, overrides default data directory).

# Outputs
- A validated `DaemonConfig` object.
- On first run: config file, TLS cert, TLS key written to data directory; connection string printed to stdout.

# Responsibilities

## Data Directory Resolution

```typescript
function resolveDataDir(): string
```

- If `SWITCHBOARD_HOME` environment variable is set and non-empty, use its value.
- Otherwise, use `~/.switchboard` (where `~` is `os.homedir()`).
- The data directory MUST be created (with `recursive: true`) if it does not exist.

## Configuration Schema

```typescript
interface DaemonConfig {
  port: number;                    // Default: 3717
  host: string;                    // Default: "127.0.0.1"
  tls: {
    cert: string;                  // Path to TLS certificate file
    key: string;                   // Path to TLS private key file
    ca?: string;                   // Optional: path to CA cert (future use)
  };
  auth: {
    token: string;                 // 256-bit hex-encoded shared secret
  };
  scrollbackLimit: number;         // Default: 50000
  sessionPersistPath: string;      // Default: "<dataDir>/sessions.json"
  idlePattern?: string;            // Optional: regex string for idle detection
}
```

### Required Fields in Config File
These fields MUST be present in the config file. On first run they are auto-generated:
- `tls.cert`
- `tls.key`
- `auth.token`

### Optional Fields with Defaults
These fields use defaults if not present in the config file:
- `port`: `3717`
- `host`: `"127.0.0.1"`
- `scrollbackLimit`: `50000`
- `sessionPersistPath`: `"<dataDir>/sessions.json"`
- `tls.ca`: `undefined`
- `idlePattern`: `undefined` (idle detector uses its own default)

## Loading Configuration

```typescript
async function loadConfig(): Promise<DaemonConfig>
```

1. Resolve the data directory.
2. Construct the config file path: `<dataDir>/daemon.json`.
3. If the config file does not exist, run first-run setup (see below), then load the newly created file.
4. Read and parse the config file as JSON.
5. Validate required fields are present and have correct types.
6. Apply defaults for optional fields.
7. Resolve relative paths in `tls.cert`, `tls.key`, `tls.ca`, and `sessionPersistPath` relative to the data directory.
8. Return the validated `DaemonConfig`.

## First-Run Setup

```typescript
async function firstRunSetup(dataDir: string): Promise<void>
```

Executed when no config file exists. Steps in order:

1. **Generate auth token**: Generate 32 random bytes (256 bits) using `crypto.randomBytes(32)`. Hex-encode to produce a 64-character string.
2. **Generate self-signed TLS certificate and key**:
   - Generate a 2048-bit RSA key pair (or use Ed25519 if available via the chosen TLS library).
   - Create a self-signed X.509 certificate with:
     - Subject CN: `switchboard-daemon`
     - Validity: 365 days
     - Subject Alternative Name: `127.0.0.1`, `localhost`
   - Write the certificate to `<dataDir>/daemon.crt` (PEM format).
   - Write the private key to `<dataDir>/daemon.key` (PEM format).
   - Set file permissions on the key file to `0o600` (owner read/write only).
3. **Write default config file**: Write `<dataDir>/daemon.json` with:
   ```json
   {
     "port": 3717,
     "host": "127.0.0.1",
     "tls": {
       "cert": "daemon.crt",
       "key": "daemon.key"
     },
     "auth": {
       "token": "<generated-token>"
     },
     "scrollbackLimit": 50000
   }
   ```
4. **Print connection string to stdout**:
   - Compute the SHA-256 fingerprint of the generated certificate (DER-encoded).
   - Print: `switchboard://127.0.0.1:3717?token=<token>&fingerprint=<sha256-hex>`
   - This is the only output to stdout during first-run setup.

## Configuration Validation

```typescript
function validateConfig(raw: unknown): DaemonConfig
```

- `port`: must be an integer between 1 and 65535.
- `host`: must be a non-empty string.
- `tls.cert`: must be a non-empty string. The referenced file MUST exist (checked after path resolution).
- `tls.key`: must be a non-empty string. The referenced file MUST exist (checked after path resolution).
- `auth.token`: must be a non-empty string of at least 32 hex characters (minimum 128 bits).
- `scrollbackLimit`: must be a positive integer.
- `sessionPersistPath`: must be a non-empty string.
- `tls.ca`: if present, must be a non-empty string and the referenced file MUST exist.
- `idlePattern`: if present, must be a valid regex string (test via `new RegExp()`).

Throws `ConfigError` with a descriptive message for any validation failure.

```typescript
class ConfigError extends Error {
  constructor(message: string);
}
```

# Edge Cases / Fault Handling

- **Config file is malformed JSON**: Throw `ConfigError` with parse error details.
- **Config file has wrong field types**: Throw `ConfigError` identifying the field and expected type.
- **TLS cert/key files missing**: Throw `ConfigError` naming the missing file path.
- **Data directory not writable**: First-run setup throws with OS-level error. Daemon exits.
- **SWITCHBOARD_HOME points to non-existent path**: Create the directory recursively. If creation fails, throw.
- **Token is too short**: Throw `ConfigError` requiring at least 32 hex characters.
- **Port already in use**: Not detected at config load time -- transport layer handles this.
- **Config file exists but is empty**: Treated as malformed JSON, throws `ConfigError`.
- **Concurrent first-run from multiple processes**: No locking. Last writer wins. This is acceptable because first-run is a one-time interactive operation.

# Test Strategy

Test file: `tests/src/daemon/config.test.ts`

- Unit test: `resolveDataDir` uses `SWITCHBOARD_HOME` when set.
- Unit test: `resolveDataDir` falls back to `~/.switchboard` when `SWITCHBOARD_HOME` is unset.
- Unit test: `loadConfig` reads and parses a valid config file, applying defaults for missing optional fields.
- Unit test: `loadConfig` resolves relative TLS paths against the data directory.
- Unit test: `validateConfig` accepts a fully valid config object.
- Unit test: `validateConfig` throws `ConfigError` for missing `auth.token`.
- Unit test: `validateConfig` throws `ConfigError` for missing `tls.cert`.
- Unit test: `validateConfig` throws `ConfigError` for missing `tls.key`.
- Unit test: `validateConfig` throws `ConfigError` for out-of-range port.
- Unit test: `validateConfig` throws `ConfigError` for non-integer port.
- Unit test: `validateConfig` throws `ConfigError` for token shorter than 32 hex chars.
- Unit test: `validateConfig` throws `ConfigError` for invalid `idlePattern` regex.
- Unit test: `firstRunSetup` generates a 64-character hex token.
- Unit test: `firstRunSetup` creates `daemon.crt` and `daemon.key` files.
- Unit test: `firstRunSetup` sets key file permissions to 0o600.
- Unit test: `firstRunSetup` writes a valid `daemon.json` config file.
- Unit test: `firstRunSetup` prints a connection string to stdout matching the expected format.
- Unit test: `loadConfig` triggers first-run setup when config file does not exist, then returns valid config.
- Unit test: malformed JSON in config file throws `ConfigError`.
- Integration test: full first-run flow in a temporary directory -- setup, load, validate.

# Completion Criteria
1. `loadConfig` returns a validated `DaemonConfig` from an existing config file.
2. First-run setup generates token, TLS cert/key, and default config file.
3. Connection string is printed to stdout on first run.
4. All validation rules are enforced with descriptive `ConfigError` messages.
5. `SWITCHBOARD_HOME` environment variable is respected.
6. All tests pass.
