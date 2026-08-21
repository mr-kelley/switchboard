#!/bin/bash
# Run a perf scenario on a daemon-only host (Pi, SuperMicro, VM, etc.).
# Captures host info once, then samples daemon CPU + memory in parallel
# for the run duration. All output goes into a per-host, per-scenario
# subdirectory named after the anonymized hostname hash — safe to publish
# without leaking hostnames.
#
# Load is expected to come from a remote Switchboard client (this script
# doesn't drive sessions or workload — the operator connects sessions
# from their workstation and, if applicable, triggers a workload in one
# of them before starting the timer).
#
# Requires the daemon to be running (pgrep -f switchboard-daemon finds
# it). The script fails fast if it doesn't.
#
# Usage:
#   run_daemon_only.sh --scenario NAME [--duration SECONDS] [--interval SECONDS] [--with-sudo]
#
# Example — 5 sessions idle for 60 s:
#   1. From your workstation, connect 5 sessions to this daemon.
#   2. On this host: ./run_daemon_only.sh --scenario 5sessions_idle --duration 60
#   3. Wait for the timer; CSVs land in perf-runs/<date>/<hash>/<scenario>/.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
LIB_DIR="$SCRIPT_DIR/lib"

SCENARIO=""
DURATION=60
INTERVAL=1
WITH_SUDO=""
OUTPUT_BASE="${PERF_RUNS_DIR:-$PWD/perf-runs}"

usage() {
    cat >&2 <<'EOF'
Usage: run_daemon_only.sh --scenario NAME [--duration SECONDS] [--interval SECONDS] [--with-sudo]

Required:
  --scenario NAME      Short label for this run (e.g. 5sessions_idle, 10sessions_inference).
                       Must be [a-zA-Z0-9_-]+ — becomes a directory name.

Options:
  --duration SECONDS   Sampling window (default: 60).
  --interval SECONDS   Sampling period (default: 1).
  --with-sudo          Pass through to collect_host_info.sh so DIMM info is captured.

Environment:
  PERF_RUNS_DIR        Base directory for output (default: $PWD/perf-runs).

Output layout:
  <base>/<YYYY-MM-DD>/<hostname_hash>/<scenario>/
    host.json
    sample_cpu.csv
    sample_mem.csv
EOF
    exit 2
}

while [ $# -gt 0 ]; do
    case "$1" in
        --scenario) [ $# -ge 2 ] || usage; SCENARIO="$2"; shift 2 ;;
        --duration) [ $# -ge 2 ] || usage; DURATION="$2"; shift 2 ;;
        --interval) [ $# -ge 2 ] || usage; INTERVAL="$2"; shift 2 ;;
        --with-sudo) WITH_SUDO="--with-sudo"; shift ;;
        -h|--help) usage ;;
        *) echo "error: unknown arg: $1" >&2; usage ;;
    esac
done

[ -n "$SCENARIO" ] || { echo "error: --scenario required" >&2; usage; }
[[ "$SCENARIO" =~ ^[a-zA-Z0-9_-]+$ ]] || { echo "error: --scenario must match [a-zA-Z0-9_-]+ (got: $SCENARIO)" >&2; exit 2; }

# Verify the daemon is running before we bother capturing anything.
DAEMON_PIDS=$(pgrep -f 'switchboard-daemon.*daemon\.js' 2>/dev/null || true)
if [ -z "$DAEMON_PIDS" ]; then
    echo "error: no switchboard-daemon process found on this host" >&2
    echo "start the daemon (systemctl --user start switchboard-daemon) and try again" >&2
    exit 1
fi

# Compute the anonymized output directory.
HN_HASH=$(hostname | sha256sum | awk '{print substr($1, 1, 16)}')
DATE_DIR=$(date +%Y-%m-%d)
OUT_DIR="$OUTPUT_BASE/$DATE_DIR/$HN_HASH/$SCENARIO"
mkdir -p "$OUT_DIR"

echo "=== Switchboard daemon-only perf run ==="
echo "Scenario:    $SCENARIO"
echo "Duration:    ${DURATION}s at ${INTERVAL}s intervals"
echo "Daemon PIDs: $(echo "$DAEMON_PIDS" | tr '\n' ' ')"
echo "Output:      $OUT_DIR"
echo ""

# 1. Host info (one-shot).
echo "-> Capturing host info..."
"$LIB_DIR/collect_host_info.sh" $WITH_SUDO --output "$OUT_DIR/host.json"

# 2. Launch CPU + memory samplers in parallel.
echo "-> Starting CPU + memory samplers (${DURATION}s)..."
"$LIB_DIR/sample_cpu.sh" \
    --group daemon='switchboard-daemon.*daemon\.js' \
    --duration "$DURATION" \
    --interval "$INTERVAL" \
    --output "$OUT_DIR/sample_cpu.csv" > "$OUT_DIR/sample_cpu.log" 2>&1 &
CPU_PID=$!

"$LIB_DIR/sample_mem.sh" \
    --group daemon='switchboard-daemon.*daemon\.js' \
    --duration "$DURATION" \
    --interval "$INTERVAL" \
    --output "$OUT_DIR/sample_mem.csv" > "$OUT_DIR/sample_mem.log" 2>&1 &
MEM_PID=$!

# Propagate Ctrl-C to samplers so a cancelled run doesn't leave background jobs.
trap 'kill $CPU_PID $MEM_PID 2>/dev/null || true; echo "cancelled." >&2; exit 130' INT TERM

wait "$CPU_PID"
wait "$MEM_PID"

echo ""
echo "=== Run complete ==="
echo "  host.json      $(wc -c < "$OUT_DIR/host.json") bytes"
echo "  sample_cpu.csv $(wc -l < "$OUT_DIR/sample_cpu.csv") rows"
echo "  sample_mem.csv $(wc -l < "$OUT_DIR/sample_mem.csv") rows"
echo ""
echo "Files in $OUT_DIR:"
ls -la "$OUT_DIR"
