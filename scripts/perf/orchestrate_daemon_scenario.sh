#!/bin/bash
# Run one daemon perf scenario end-to-end from the workstation.
#
# Pushes the sampler + libs + workloads to the target host, opens N
# mTLS sessions from here via session_driver.js, kicks off the sampler
# over SSH, and rsyncs the resulting CSVs + host.json back into the
# workstation's local perf-runs/.
#
# Assumptions:
#   - Passwordless SSH to the target (same host used for the daemon
#     address — per user's fleet: SSH-host === daemon-host).
#   - Client TLS bundle at ~/.switchboard/tls/ on this workstation.
#   - node in PATH on this workstation, with the switchboard repo's
#     node_modules populated (need `ws`).
#   - bash / awk / pgrep on the target (universal on modern Linux).
#
# Usage:
#   orchestrate_daemon_scenario.sh \
#     --host HOST \
#     --scenario NAME \
#     --sessions N \
#     --duration SECONDS \
#     [--port 3717] \
#     [--workload "CMD"] \
#     [--workload-delay SECONDS] \
#     [--with-sudo] \
#     [--remote-scratch PATH]

set -euo pipefail

HOST=""
PORT=3717
SCENARIO=""
SESSIONS=""
DURATION=""
WORKLOAD=""
WORKLOAD_DELAY=5
WITH_SUDO=""
REMOTE_SCRATCH='$HOME/.cache/switchboard-perf'

usage() {
    cat >&2 <<'EOF'
Usage: orchestrate_daemon_scenario.sh --host HOST --scenario NAME --sessions N --duration SECONDS
       [--port 3717] [--workload "CMD"] [--workload-delay SECONDS] [--with-sudo]
       [--remote-scratch PATH]
EOF
    exit 2
}

while [ $# -gt 0 ]; do
    case "$1" in
        --host) HOST="$2"; shift 2 ;;
        --port) PORT="$2"; shift 2 ;;
        --scenario) SCENARIO="$2"; shift 2 ;;
        --sessions) SESSIONS="$2"; shift 2 ;;
        --duration) DURATION="$2"; shift 2 ;;
        --workload) WORKLOAD="$2"; shift 2 ;;
        --workload-delay) WORKLOAD_DELAY="$2"; shift 2 ;;
        --with-sudo) WITH_SUDO="--with-sudo"; shift ;;
        --remote-scratch) REMOTE_SCRATCH="$2"; shift 2 ;;
        -h|--help) usage ;;
        *) echo "error: unknown arg: $1" >&2; usage ;;
    esac
done

[ -n "$HOST" ] || { echo "error: --host required" >&2; usage; }
[ -n "$SCENARIO" ] || { echo "error: --scenario required" >&2; usage; }
[ -n "$SESSIONS" ] || { echo "error: --sessions required" >&2; usage; }
[ -n "$DURATION" ] || { echo "error: --duration required" >&2; usage; }

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
# SCRIPT_DIR is <repo>/scripts/perf; the repo root is two levels up.
REPO_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"

BUNDLE=$(mktemp -u /tmp/sb-perf-bundle-XXXXXX.tar.gz)
DRIVER_LOG=$(mktemp)
DRIVER_PID=""

cleanup() {
    if [ -n "$DRIVER_PID" ] && kill -0 "$DRIVER_PID" 2>/dev/null; then
        kill -TERM "$DRIVER_PID" 2>/dev/null || true
        # Give driver a moment to close sessions cleanly before force-kill.
        for _ in $(seq 5); do
            kill -0 "$DRIVER_PID" 2>/dev/null || break
            sleep 0.2
        done
        kill -KILL "$DRIVER_PID" 2>/dev/null || true
        wait "$DRIVER_PID" 2>/dev/null || true
    fi
    rm -f "$BUNDLE" "$DRIVER_LOG"
}
trap cleanup EXIT INT TERM

echo "=== orchestrate: $SCENARIO on $HOST ==="
echo "Sessions:       $SESSIONS"
echo "Duration:       ${DURATION}s"
echo "Workload:       ${WORKLOAD:-<none>}"
echo "Remote scratch: $REMOTE_SCRATCH"
echo ""

# --- 1. Bundle perf scripts + workloads and push to target ---
echo "-> Bundling perf scripts..."
tar czf "$BUNDLE" -C "$REPO_ROOT" \
    scripts/perf/run_daemon_only.sh \
    scripts/perf/lib/collect_host_info.sh \
    scripts/perf/lib/sample_cpu.sh \
    scripts/perf/lib/sample_mem.sh \
    scripts/perf/workloads/

echo "-> Pushing bundle to $HOST:$REMOTE_SCRATCH ..."
ssh -o BatchMode=yes "$HOST" "mkdir -p $REMOTE_SCRATCH"
scp -q -o BatchMode=yes "$BUNDLE" "$HOST:$REMOTE_SCRATCH/bundle.tar.gz"
ssh -o BatchMode=yes "$HOST" "cd $REMOTE_SCRATCH && tar xzf bundle.tar.gz && chmod +x scripts/perf/run_daemon_only.sh scripts/perf/lib/*.sh scripts/perf/workloads/*.sh 2>/dev/null || true"

# --- 2. Start session driver (unless N=0) ---
if [ "$SESSIONS" -gt 0 ]; then
    echo "-> Starting session driver: $SESSIONS sessions to $HOST:$PORT ..."
    if [ -n "$WORKLOAD" ]; then
        node "$SCRIPT_DIR/lib/session_driver.js" \
            --host "$HOST" --port "$PORT" --count "$SESSIONS" \
            --workload "$WORKLOAD" --workload-delay "$WORKLOAD_DELAY" \
            > "$DRIVER_LOG" 2>&1 &
    else
        node "$SCRIPT_DIR/lib/session_driver.js" \
            --host "$HOST" --port "$PORT" --count "$SESSIONS" \
            > "$DRIVER_LOG" 2>&1 &
    fi
    DRIVER_PID=$!

    # Wait for READY (up to 30s). Poll the log file rather than tail -F (which
    # doesn't exit cleanly on grep -m1).
    for _ in $(seq 30); do
        if ! kill -0 "$DRIVER_PID" 2>/dev/null; then
            echo "error: session driver exited before becoming ready:" >&2
            cat "$DRIVER_LOG" >&2
            exit 1
        fi
        if grep -q '^\[session_driver\] READY' "$DRIVER_LOG"; then
            break
        fi
        sleep 1
    done
    if ! grep -q '^\[session_driver\] READY' "$DRIVER_LOG"; then
        echo "error: session driver did not become ready within 30s:" >&2
        cat "$DRIVER_LOG" >&2
        exit 1
    fi
    echo "-> Sessions ready."
else
    echo "-> N=0, skipping session driver (idle-daemon-only measurement)."
fi

# --- 3. Run the sampler on the target (foreground, blocks for $DURATION) ---
echo "-> Starting sampler on $HOST ..."
REMOTE_CMD="cd $REMOTE_SCRATCH && bash scripts/perf/run_daemon_only.sh --scenario '$SCENARIO' --duration $DURATION $WITH_SUDO"
ssh -o BatchMode=yes "$HOST" "$REMOTE_CMD"

# --- 4. Fetch results back ---
echo ""
echo "-> Fetching results ..."
mkdir -p "$REPO_ROOT/perf-runs"
# rsync preserves the <date>/<hash>/<scenario>/ tree.
rsync -a -e "ssh -o BatchMode=yes" "$HOST:$REMOTE_SCRATCH/perf-runs/" "$REPO_ROOT/perf-runs/"

# --- 5. Report ---
DATE=$(date +%Y-%m-%d)
LOCAL_TREE=$(find "$REPO_ROOT/perf-runs/$DATE" -type d -name "$SCENARIO" 2>/dev/null | head -1)
if [ -n "$LOCAL_TREE" ]; then
    echo ""
    echo "-> Results in $LOCAL_TREE"
    ls -la "$LOCAL_TREE"
else
    echo "-> WARNING: expected output tree not found under $REPO_ROOT/perf-runs/$DATE"
fi

echo ""
echo "=== $SCENARIO complete ==="
