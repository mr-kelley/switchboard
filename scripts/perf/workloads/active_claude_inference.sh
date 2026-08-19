#!/bin/bash
# Perf workload: canonical anonymous Claude CLI inference.
#
# Runs a single fixed prompt in a scratch cwd so nothing about the
# invocation persists to the operator's ~/.claude/. See
# docs/performance/terminal-emulator-comparison.md for the anonymization
# rationale (repeatable runs, no memory pollution, no history residue).
#
# When the inference completes, the scratch cwd and the Claude project
# dir it produced are both wiped. The shell then exits — the emulator
# window will close (typical default behavior).
#
# Requires `claude` CLI in PATH.

set -euo pipefail

PROMPT="Write a 500-word article about the history of terminal emulators, from teletype machines through modern GPU-accelerated terminals. Structure with 3-4 headers."

SCRATCH=$(mktemp -d /tmp/sb-perf-run-XXXXXX)
# The project-dir naming pattern Claude Code uses: prefix "-" and slashes → "-".
# For /tmp/sb-perf-run-ABC that becomes -tmp-sb-perf-run-ABC.
PROJECT_DIR="$HOME/.claude/projects/-tmp-sb-perf-run-$(basename "$SCRATCH" | sed 's/^sb-perf-run-//')"

cleanup() {
    cd /
    rm -rf "$SCRATCH" 2>/dev/null || true
    rm -rf "$PROJECT_DIR" 2>/dev/null || true
    # Belt-and-braces: kill any orphaned project dirs from earlier crashed runs.
    rm -rf "$HOME/.claude/projects/-tmp-sb-perf-run-"* 2>/dev/null || true
}
trap cleanup EXIT INT TERM

cd "$SCRATCH"

if ! command -v claude >/dev/null 2>&1; then
    echo "error: claude CLI not found in PATH" >&2
    exit 1
fi

claude -p "$PROMPT"
