#!/bin/bash
# Memory / thread / FD sampler for one or more named process groups.
# Reads /proc/<pid>/status (VmRSS, VmSize, Threads) and counts /proc/<pid>/fd
# entries at each sampling interval. Same --group NAME=PATTERN interface as
# lib/sample_cpu.sh; PIDs snapshotted once at startup.
#
# Unlike CPU, memory is NOT meaningful to aggregate across unrelated groups
# (a "total_rss" that sums the daemon and client is misleading). This sampler
# emits per-group columns only.
#
# Requires Linux (/proc/<pid>/status, /proc/<pid>/fd). Bash 4+.
#
# Usage:
#   sample_mem.sh --group NAME=PATTERN [--group NAME=PATTERN ...] \
#                 [--duration SECONDS] [--interval SECONDS] [--output FILE]
#
# CSV columns: timestamp,<name>_rss_kb,<name>_vms_kb,<name>_threads,<name>_fds,...

set -euo pipefail

GROUP_NAMES=()
GROUP_PATTERNS=()
DURATION=60
INTERVAL=1
OUTPUT_DIR="${OUTPUT_DIR:-$PWD}"
OUTPUT_FILE=""

usage() {
    cat >&2 <<'EOF'
Usage: sample_mem.sh --group NAME=PATTERN [--group NAME=PATTERN ...] \
                     [--duration SECONDS] [--interval SECONDS] [--output FILE]

Required:
  --group NAME=PATTERN   Repeatable. NAME must be [a-zA-Z0-9_]+; PATTERN is a pgrep -f regex.

Options:
  --duration SECONDS     Total sampling window (default: 60).
  --interval SECONDS     Sampling period (default: 1).
  --output FILE          CSV path (default: $OUTPUT_DIR/sample_mem_<epoch>.csv).

Environment:
  OUTPUT_DIR             Default output directory (default: current directory).
EOF
    exit 2
}

while [ $# -gt 0 ]; do
    case "$1" in
        --group)
            [ $# -ge 2 ] || usage
            spec="$2"
            case "$spec" in
                *=*) : ;;
                *) echo "error: --group must be NAME=PATTERN (got: $spec)" >&2; exit 2 ;;
            esac
            name="${spec%%=*}"
            pattern="${spec#*=}"
            [[ "$name" =~ ^[a-zA-Z0-9_]+$ ]] || { echo "error: group name must match [a-zA-Z0-9_]+ (got: $name)" >&2; exit 2; }
            GROUP_NAMES+=("$name")
            GROUP_PATTERNS+=("$pattern")
            shift 2
            ;;
        --duration)
            [ $# -ge 2 ] || usage
            DURATION="$2"; shift 2 ;;
        --interval)
            [ $# -ge 2 ] || usage
            INTERVAL="$2"; shift 2 ;;
        --output)
            [ $# -ge 2 ] || usage
            OUTPUT_FILE="$2"; shift 2 ;;
        -h|--help) usage ;;
        *) echo "error: unknown arg: $1" >&2; usage ;;
    esac
done

[ ${#GROUP_NAMES[@]} -gt 0 ] || { echo "error: at least one --group required" >&2; usage; }

declare -a GROUP_PIDS
for i in "${!GROUP_NAMES[@]}"; do
    GROUP_PIDS[$i]=$(pgrep -f "${GROUP_PATTERNS[$i]}" 2>/dev/null || true)
done

matched_any=false
for pids in "${GROUP_PIDS[@]}"; do
    [ -n "$pids" ] && matched_any=true
done
$matched_any || { echo "error: no processes matched any --group pattern" >&2; exit 1; }

if [ -z "$OUTPUT_FILE" ]; then
    OUTPUT_FILE="$OUTPUT_DIR/sample_mem_$(date +%s).csv"
fi

for i in "${!GROUP_NAMES[@]}"; do
    pids_display="${GROUP_PIDS[$i]:-<none>}"
    echo "${GROUP_NAMES[$i]} PIDs: $(echo "$pids_display" | tr '\n' ' ')"
done
echo "Recording to: $OUTPUT_FILE"
echo "Duration: ${DURATION}s, Interval: ${INTERVAL}s"
echo ""

header="timestamp"
for name in "${GROUP_NAMES[@]}"; do
    header="$header,${name}_rss_kb,${name}_vms_kb,${name}_threads,${name}_fds"
done
echo "$header" > "$OUTPUT_FILE"

# Extract a numeric field from /proc/<pid>/status. Field values in status are
# "VmRSS:    12345 kB" style; grab the second whitespace-separated token.
status_field() {
    local pid="$1" field="$2"
    if [ -r "/proc/$pid/status" ]; then
        grep -m1 "^${field}:" "/proc/$pid/status" 2>/dev/null | awk '{print $2}'
    fi
}

# Sum a status field across a group's PIDs. Missing PIDs (died mid-run) contribute 0.
group_status_sum() {
    local pids="$1" field="$2"
    local total=0 val
    for pid in $pids; do
        val=$(status_field "$pid" "$field")
        [ -n "$val" ] && total=$(( total + val ))
    done
    echo "$total"
}

# Count entries in /proc/<pid>/fd across a group's PIDs.
group_fd_count() {
    local pids="$1"
    local total=0 count
    for pid in $pids; do
        if [ -d "/proc/$pid/fd" ] && [ -r "/proc/$pid/fd" ]; then
            count=$(ls -1 "/proc/$pid/fd" 2>/dev/null | wc -l)
            total=$(( total + count ))
        fi
    done
    echo "$total"
}

START_TIME=$(date +%s)

while true; do
    NOW=$(date +%s)
    [ $((NOW - START_TIME)) -ge "$DURATION" ] && break

    TIMESTAMP=$(date '+%Y-%m-%d %H:%M:%S')
    row="$TIMESTAMP"
    for i in "${!GROUP_NAMES[@]}"; do
        pids="${GROUP_PIDS[$i]}"
        rss=$(group_status_sum "$pids" "VmRSS")
        vms=$(group_status_sum "$pids" "VmSize")
        threads=$(group_status_sum "$pids" "Threads")
        fds=$(group_fd_count "$pids")
        row="$row,$rss,$vms,$threads,$fds"
    done
    echo "$row" | tee -a "$OUTPUT_FILE"

    sleep "$INTERVAL"
done

echo ""
echo "Sampling complete. Results saved to $OUTPUT_FILE"
