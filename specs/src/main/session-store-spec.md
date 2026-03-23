---
title: Session Store Specification
version: 0.1.0
maintained_by: claude
domain_tags: [electron, main-process, persistence]
status: active
governs: src/main/session-store.ts
---

# Purpose
Persist session configuration to a local JSON file so sessions can be restored on app relaunch. Stores session metadata (name, cwd, command), not terminal history.

# Behavior

## File Location
`sessions.json` in the Electron app's user data directory (`app.getPath('userData')`).

## Data Format
```json
{
  "sessions": [
    { "name": "project-a", "cwd": "/home/user/project-a", "command": "claude" },
    { "name": "project-b", "cwd": "/home/user/project-b", "command": "/bin/bash" }
  ]
}
```

## Operations
- `load(): SavedSession[]` — reads sessions.json, returns array (empty if file missing/corrupt).
- `save(sessions: SavedSession[]): void` — writes sessions.json atomically.

## Error Handling
- Missing file: return empty array.
- Corrupt JSON: log warning, return empty array.
- Write failures: log error, do not crash.

# Exports
- `SessionStore` class
- `SavedSession` type

# Test Strategy
- Unit test: load returns empty array when file doesn't exist.
- Unit test: save/load round-trip preserves data.
- Unit test: corrupt JSON returns empty array.
