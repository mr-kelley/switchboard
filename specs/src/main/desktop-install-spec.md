---
title: Desktop Integration (AppImage Self-Install) Specification
version: 0.1.0
maintained_by: claude
domain_tags: [electron, main-process, linux, packaging, desktop-integration, appimage, wayland]
status: active
platform: claude-code
license: Apache-2.0
governs: src/main/desktop-install.ts
---

# Purpose
Register the running AppImage in the user's applications menu so that Linux desktops (particularly GNOME on Wayland) can resolve Switchboard's window app_id to a known `.desktop` entry and display the correct icon and name in the dock, window list, and app grid. Wayland does not expose a per-window icon protocol, so the compositor relies on `.desktop` entries — an AppImage without one falls back to the generic Electron icon.

# Scope

## Covers
- Writing (and updating) `~/.local/share/applications/switchboard.desktop` at startup when running as an AppImage.
- Writing hicolor icon PNGs at every packaged size (16, 32, 48, 64, 128, 256, 512) under `~/.local/share/icons/hicolor/<size>x<size>/apps/switchboard.png`.
- Idempotency: re-writing only when the on-disk `Exec=` no longer matches the current `$APPIMAGE` path.
- Cache refresh via `update-desktop-database` and `gtk-update-icon-cache` (best-effort; missing binaries acceptable).
- Explicit uninstall (`Preferences → Daemons → Desktop integration → Uninstall`) that removes the `.desktop` entry and icons.
- Status introspection (`getStatus()`) for the renderer.

## Does Not Cover
- Non-AppImage packaging (`.deb`, `.snap`, source): those formats' installers register the `.desktop` entry themselves. This module is a no-op outside `$APPIMAGE`.
- Registration of MIME handlers beyond what the `.desktop` file itself declares (no `xdg-mime default` invocation).
- SUID-helper setup or sandbox configuration (`--no-sandbox` is baked into the generated `Exec=` line).
- Cross-user or system-wide install (`/usr/share/*`); this module writes only to `$XDG_DATA_HOME` (default `~/.local/share`).

# Inputs
- `process.env.APPIMAGE` — absolute path to the AppImage on disk, set by the AppImage runtime. Absence means we are not running as an AppImage.
- `process.env.XDG_DATA_HOME` — user data root; defaults to `~/.local/share`.
- Embedded icon assets from `src/main/app-icon.ts` (`DESKTOP_ICONS`: Record<size, dataURL>). Generated from `build/icon.png` by `scripts/gen-app-icon.py`.

# Outputs
- Files written under `~/.local/share/applications/` and `~/.local/share/icons/hicolor/*/apps/`.
- Best-effort `execFile` spawns of `update-desktop-database` and `gtk-update-icon-cache`.
- Return values from `getStatus()`, `install()`, `uninstall()` describing what happened.

# Responsibilities
- **`getStatus()` (pure introspection):**
  - Returns `{ supported, installed, appImagePath, desktopPath }`.
  - `supported = true` iff `$APPIMAGE` is a non-empty string.
  - `installed = true` iff the target `.desktop` file exists on disk.
  - Does not read, write, or modify any files.

- **`install()` (idempotent write):**
  - No-op when `$APPIMAGE` is unset (returns `{ changed: false, reason: 'not-running-under-appimage' }`).
  - Reads any existing `.desktop` file and parses its `Exec=` line.
    - If it matches `${APPIMAGE} --no-sandbox %U`, returns `{ changed: false, reason: 'up-to-date' }`.
  - Otherwise:
    - Creates parent directories as needed.
    - Writes the `.desktop` file (mode 0644) with `Exec=${APPIMAGE} --no-sandbox %U`, `Icon=switchboard`, `StartupWMClass=Switchboard`, and the other keys listed under **Desktop File Contents** below.
    - Writes each `DESKTOP_ICONS[size]` PNG (mode 0644) to `~/.local/share/icons/hicolor/<size>x<size>/apps/switchboard.png`.
    - Fires off `update-desktop-database ~/.local/share/applications` and `gtk-update-icon-cache -f -t ~/.local/share/icons/hicolor` best-effort (5s timeout, errors swallowed).
  - Any I/O error is caught and returned as `{ changed: false, reason: 'error: ...' }`. MUST NOT throw.

- **`uninstall()` (best-effort cleanup):**
  - Removes the `.desktop` file if present.
  - Removes each hicolor icon PNG if present.
  - Refreshes caches only when at least one file was removed.
  - Never throws; per-file errors are logged and skipped.
  - Returns `{ removed: boolean }` indicating whether at least one file was deleted.

# Desktop File Contents
```
[Desktop Entry]
Name=Switchboard
Exec=<$APPIMAGE> --no-sandbox %U
Terminal=false
Type=Application
Icon=switchboard
StartupWMClass=Switchboard
Comment=A Slack-style multi-session terminal manager for AI coding workflows
Categories=Development;
Keywords=terminal;shell;pty;
MimeType=x-scheme-handler/switchboard;
```

# Edge Cases / Fault Handling
- **Not running under AppImage:** `install()` returns immediately with `reason: 'not-running-under-appimage'`; no writes attempted.
- **`$APPIMAGE` path change (upgrade / move):** on next launch `install()` observes the mismatch and rewrites the `.desktop` file. No manual uninstall needed.
- **Manual deletion of `.desktop` between launches:** file is missing → `install()` re-creates it.
- **Manual edit of `.desktop` (custom Exec):** on next launch we notice the mismatch and overwrite. Users needing custom Exec should uninstall then edit their own copy at a different path.
- **Cache tools absent (`update-desktop-database`, `gtk-update-icon-cache`):** silent failure via `execFile` callback; the entry is still written and will take effect on the next login even without cache refresh.
- **Icon-cache directory unwritable:** the `.desktop` write fails first — no partial state — and the error is returned via the `reason` field.
- **Multiple AppImages of different versions on disk:** last-launched wins (each launch's `install()` rewrites `Exec=` to that binary's `$APPIMAGE`). Standard AppImage behavior.

# Test Strategy
Unit tests in `tests/main/desktop-install.test.ts` (Vitest) using a temporary `XDG_DATA_HOME`:
- `getStatus()` reports `supported=false` when `$APPIMAGE` is unset.
- `install()` returns `not-running-under-appimage` when `$APPIMAGE` is unset; no files created.
- `install()` writes the `.desktop` file and all icon PNGs when `$APPIMAGE` is set and no entry exists (`reason: 'created'`).
- `install()` called twice with the same `$APPIMAGE` is a no-op the second time (`reason: 'up-to-date'`; file mtime unchanged).
- `install()` with a different `$APPIMAGE` overwrites the existing entry.
- `uninstall()` removes the `.desktop` file and icon PNGs and returns `removed=true`; second call returns `removed=false`.
- `install()` catches synthesized I/O errors and returns `error: ...` instead of throwing.

# Completion Criteria
- Running the rc.11 AppImage on Ubuntu 24.04 GNOME (Wayland) writes the `.desktop` entry and icons; the Switchboard branded icon appears in the dock and app grid on the next launch (or immediately after cache refresh).
- Preferences → Daemons → Desktop integration shows `Installed` when installed and an `Uninstall` action that removes the entry.
- Non-AppImage runs (dev mode, `.deb` install) do not write any files under `~/.local/share`.
- All tests in `tests/main/desktop-install.test.ts` pass.
