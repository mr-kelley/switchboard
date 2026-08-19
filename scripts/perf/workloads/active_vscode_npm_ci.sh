#!/bin/bash
# Perf workload: shallow-clone VS Code and run `npm ci`.
#
# Represents "real developer work in a terminal" — a bursty install with
# thousands of package resolutions, network + disk activity, streamed
# stdout. See docs/performance/terminal-emulator-comparison.md for why
# this is the chosen non-AI comparison workload.
#
# Uses a scratch dir under $TMPDIR so we don't touch the operator's
# working tree. Cleaned up on exit even if `npm ci` fails.
#
# Requires `git` and `npm`. First run downloads a ~300 MB shallow clone
# and populates ~1-2 GB of node_modules; expect 60-120 s wall time on a
# fast box, longer on constrained hardware.

set -euo pipefail

REPO_URL="https://github.com/microsoft/vscode"
SCRATCH=$(mktemp -d /tmp/sb-perf-vscode-XXXXXX)

cleanup() {
    cd /
    rm -rf "$SCRATCH" 2>/dev/null || true
}
trap cleanup EXIT INT TERM

for cmd in git npm; do
    if ! command -v "$cmd" >/dev/null 2>&1; then
        echo "error: $cmd not found in PATH" >&2
        exit 1
    fi
done

cd "$SCRATCH"
echo "-> cloning $REPO_URL (shallow)..."
git clone --depth 1 "$REPO_URL" vscode
cd vscode
echo "-> running npm ci..."
npm ci
echo "-> workload complete."
