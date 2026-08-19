#!/bin/bash
# Run a workstation-combined perf scenario: client + local daemon on the
# same host. Captures host info once, then samples daemon-and-client CPU
# and memory in parallel for the run duration. Output goes into a
# per-host, per-scenario subdirectory (matching run_daemon_only.sh's
# layout so all reports in the series file the same way).
#
# For active workloads (Claude inference, npm ci, etc.) the operator
# fires the workload in one of the Switchboard sessions during the run;
# this script only samples. See docs/performance/switchboard-performance.md
# for the operator flow.
#
# Requires the Switchboard client to be running from the AppImage (the
# `client` PID matcher looks for the AppImage mount).
#
# Usage:
#   run_workstation_combined.sh --scenario NAME [--duration SECONDS] [--interval SECONDS] [--with-sudo]
#
# Example — 15 sessions idle for 60 s:
#   ./run_workstation_combined.sh --scenario 15sessions_idle --duration 60
#
# Example — 15 sessions with 1 active Claude inference for 150 s:
#   ./run_workstation_combined.sh --scenario 15sessions_1inference --duration 150

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
Usage: run_workstation_combined.sh --scenario NAME [--duration SECONDS] [--interval SECONDS] [--with-sudo]

Required:
  --scenario NAME     Short label (e.g. 15sessions_idle, 15sessions_5inference).
                      Must be [a-zA-Z0-9_-]+ — becomes a directory name.

Options:
  --duration SECONDS  Sampling window (default: 60).
  --interval SECONDS  Sampling period (default: 1).
  --with-sudo         Pass through to collect_host_info.sh so DIMM info is captured.

Environment:
  PERF_RUNS_DIR       Base directory for output (default: $PWD/perf-runs).

Output layout:
  <base>/<YYYY-MM-DD>/<hostname_hash>/workstation-combined/<scenario>/
    host.json
    sample_cpu.csv
    sample_mem.csv
EOF
    exit 2
}

while [ $# -gt 0 ]; do
    case "$1" in
        --scenario)  [ $# -ge 2 ] || usage; SCENARIO="$2"; shift 2 ;;
        --duration)  [ $# -ge 2 ] || usage; DURATION="$2"; shift 2 ;;
        --interval)  [ $# -ge 2 ] || usage; INTERVAL="$2"; shift 2 ;;
        --with-sudo) WITH_SUDO="--with-sudo"; shift ;;
        -h|--help)   usage ;;
        *) echo "error: unknown arg: $1" >&2; usage ;;
    esac
done

[ -n "$SCENARIO" ] || { echo "error: --scenario required" >&2; usage; }
[[ "$SCENARIO" =~ ^[a-zA-Z0-9_-]+$ ]] || { echo "error: --scenario must match [a-zA-Z0-9_-]+ (got: $SCENARIO)" >&2; exit 2; }

# Verify daemon + client are running before we bother capturing anything.
DAEMON_PIDS=$(pgrep -f 'switchboard-daemon' 2>/dev/null || true)
CLIENT_PIDS=$(pgrep -f 'mount_Switch.*switchboard|Switchboard.*AppImage' 2>/dev/null || true)
if [ -z "$DAEMON_PIDS" ]; then
    echo "error: no switchboard-daemon process found on this host" >&2
    echo "start the daemon (systemctl --user start switchboard-daemon) and try again" >&2
    exit 1
fi
if [ -z "$CLIENT_PIDS" ]; then
    echo "error: no Switchboard client (AppImage) process found" >&2
    echo "launch Switchboard from the AppImage and try again" >&2
    exit 1
fi

HN_HASH=$(hostname | sha256sum | awk '{print substr($1, 1, 16)}')
DATE_DIR=$(date +%Y-%m-%d)
OUT_DIR="$OUTPUT_BASE/$DATE_DIR/$HN_HASH/workstation-combined/$SCENARIO"
mkdir -p "$OUT_DIR"

echo "=== Switchboard workstation-combined perf run ==="
echo "Scenario:    $SCENARIO"
echo "Duration:    ${DURATION}s at ${INTERVAL}s intervals"
echo "Daemon PIDs: $(echo "$DAEMON_PIDS" | tr '\n' ' ')"
echo "Client PIDs: $(echo "$CLIENT_PIDS" | tr '\n' ' ')"
echo "Output:      $OUT_DIR"
echo ""

echo "-> Capturing host info..."
"$LIB_DIR/collect_host_info.sh" $WITH_SUDO --output "$OUT_DIR/host.json"

echo "-> Starting CPU + memory samplers (${DURATION}s)..."
GROUP_ARGS=(
    --group daemon='switchboard-daemon'
    --group client='mount_Switch.*switchboard|Switchboard.*AppImage'
)

"$LIB_DIR/sample_cpu.sh" \
    "${GROUP_ARGS[@]}" \
    --duration "$DURATION" \
    --interval "$INTERVAL" \
    --output "$OUT_DIR/sample_cpu.csv" > "$OUT_DIR/sample_cpu.log" 2>&1 &
CPU_PID=$!

"$LIB_DIR/sample_mem.sh" \
    "${GROUP_ARGS[@]}" \
    --duration "$DURATION" \
    --interval "$INTERVAL" \
    --output "$OUT_DIR/sample_mem.csv" > "$OUT_DIR/sample_mem.log" 2>&1 &
MEM_PID=$!

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
