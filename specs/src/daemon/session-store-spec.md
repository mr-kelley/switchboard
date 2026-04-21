---
title: Daemon Session Store Specification
version: 0.1.0
maintained_by: claude
domain_tags: [daemon, persistence, session]
status: draft
governs: src/daemon/session-store.ts
platform: claude-code
license: MIT
---

# Purpose
Persist session metadata to a JSON file in the daemon's data directory so sessions can be reported and optionally restored on daemon restart. Stores session configuration and runtime metadata (name, cwd, command, status), not terminal history (that is handled by `OutputBuffer`).

# Scope

## Covers
- Save and load session metadata to/from `~/.switchboard/sessions.json` (or `$SWITCHBOARD_HOME/sessions.json`).
- Data format: JSON array of session records.
- Atomic writes.
- Defensive loading (missing file, corrupt data).

## Does Not Cover
- Terminal output history -- governed by `output-buffer-spec.md`.
- PTY lifecycle management -- governed by `pty-manager-spec.md`.
- Client-side session persistence -- governed by the Electron `session-store-spec.md`.

# Inputs
- File path: configurable, defaults to `<dataDir>/sessions.json` (from `DaemonConfig.sessionPersistPath`).
- Session metadata arrays for saving.

# Outputs
- Loaded session metadata arrays.
- Persisted `sessions.json` file on disk.

# Responsibilities

## Data Model

```typescript
interface SavedSession {
  id: string;          // Session UUID (preserved across daemon restarts)
  name: string;        // User-facing label
  cwd: string;         // Working directory
  command: string;     // Shell command
}
```

Note: `pid` and `status` are runtime-only and not persisted. On daemon restart, sessions are re-spawned with new PIDs and start in `working` status.

## Class Interface

```typescript
class SessionStore {
  constructor(filePath: string);

  load(): SavedSession[];
  save(sessions: SavedSession[]): void;
}
```

### `constructor(filePath: string)`
- Stores the file path for subsequent load/save operations.
- Does NOT read the file during construction.

### `load(): SavedSession[]`
1. If the file does not exist, return an empty array.
2. Read the file as UTF-8 text.
3. Parse as JSON. Expected format:
   ```json
   {
     "sessions": [
       { "id": "uuid-1", "name": "project-a", "cwd": "/home/user/project-a", "command": "/bin/bash" },
       { "id": "uuid-2", "name": "project-b", "cwd": "/home/user/project-b", "command": "claude" }
     ]
   }
   ```
4. Validate that `sessions` is an array.
5. Filter entries: each entry must have `id` (string), `name` (string), `cwd` (string), and `command` (string). Entries missing any of these fields are silently dropped.
6. Return the filtered array.

On any error (file read failure, JSON parse failure, `sessions` not an array): log a warning and return an empty array.

### `save(sessions: SavedSession[]): void`
1. Ensure the parent directory exists (create with `recursive: true` if needed).
2. Construct the data object: `{ sessions }`.
3. Serialize to JSON with 2-space indentation.
4. Write atomically: write to a temp file (`<filePath>.tmp`) in the same directory, then rename to the target path. This prevents corrupt files from partial writes.
5. On write/rename failure: log an error. Do NOT throw -- daemon operation must continue even if persistence fails.

## File Format
```json
{
  "sessions": [
    {
      "id": "a1b2c3d4-...",
      "name": "my-project",
      "cwd": "/home/user/my-project",
      "command": "/bin/bash"
    }
  ]
}
```

The top-level object wraps the array to allow future fields (e.g., a `version` or `lastSaved` timestamp) without breaking the format.

# Edge Cases / Fault Handling

- **File does not exist**: `load` returns empty array. This is the normal state on first daemon run.
- **File is empty**: Treated as corrupt JSON. `load` logs warning, returns empty array.
- **File contains valid JSON but no `sessions` field**: `load` logs warning, returns empty array.
- **File contains `sessions` as a non-array**: `load` logs warning, returns empty array.
- **Session entry missing required fields**: Entry is silently dropped. Other valid entries are returned.
- **File permission denied on read**: `load` logs warning, returns empty array.
- **File permission denied on write**: `save` logs error, does not throw.
- **Disk full on write**: `save` catches write error, logs it. Temp file may be left behind; next successful save overwrites it.
- **Concurrent save calls**: Single-threaded Node.js event loop ensures `save` calls are serialized. No locking needed.
- **Very large number of sessions**: No limit enforced. File size scales linearly. Thousands of sessions are expected to be fine.

# Test Strategy

Test file: `tests/src/daemon/session-store.test.ts`

- Unit test: `load` returns empty array when file does not exist.
- Unit test: `save` then `load` round-trip preserves all session data.
- Unit test: `save` creates parent directory if it does not exist.
- Unit test: `load` returns empty array for corrupt JSON.
- Unit test: `load` returns empty array for empty file.
- Unit test: `load` returns empty array when `sessions` is not an array.
- Unit test: `load` filters out entries with missing `id`.
- Unit test: `load` filters out entries with missing `name`.
- Unit test: `load` filters out entries with missing `cwd`.
- Unit test: `load` filters out entries with missing `command`.
- Unit test: `load` returns valid entries even when some entries are invalid.
- Unit test: `save` writes atomically (temp file then rename).
- Unit test: `save` does not throw on write failure (mock fs error).
- Unit test: multiple `save`/`load` cycles produce consistent results.
- Integration test: save sessions to a temp directory, load them back, verify equality.

# Completion Criteria
1. `load` returns session metadata from a valid `sessions.json` file.
2. `load` defensively handles missing, empty, and corrupt files.
3. `save` writes atomically using temp file + rename.
4. `save` never throws -- errors are logged.
5. Field validation filters out malformed entries on load.
6. Works with the daemon's data directory (no Electron dependency).
7. All tests pass.
