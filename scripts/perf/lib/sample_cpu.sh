#!/bin/bash
# Real-time CPU monitor: per-interval CPU% for one or more named process groups.
# Computes true per-interval CPU% from /proc/<pid>/stat utime+stime deltas
# divided by measured wall time — the same math `top` uses. Avoids the
# lifetime-average problem of `ps aux %CPU` / argument-less `pidstat`.
#
# PIDs are snapshotted ONCE at startup. A process that spawns mid-run won't be
# counted; totals will under-report. Fine for stable process sets and runs of
# a few minutes; for longer runs or session-churning workloads, restart the
# monitor when the set changes.
#
# Requires Linux (/proc/<pid>/stat, GNU date +%s%N). Bash 4+.
#
# Usage:
#   sample_cpu.sh --group NAME=PATTERN [--group NAME=PATTERN ...] \
#                 [--duration SECONDS] [--interval SECONDS] [--output FILE]
#
# NAME     [a-zA-Z0-9_]+ — used as a CSV column prefix.
# PATTERN  A pgrep -f regex identifying the group's processes.
#
# CSV columns: timestamp,<name1>_cpu_percent,<name2>_cpu_percent,...,total_cpu_percent
# Values are percent of ONE core; can exceed 100 for multi-threaded groups.
#
# Example (Switchboard combined workstation — daemon + Electron client):
#   sample_cpu.sh \
#       --group daemon='switchboard-daemon' \
#       --group client='mount_Switch.*switchboard|Switchboard.*AppImage' \
#       --duration 150 --interval 1

set -euo pipefail

GROUP_NAMES=()
GROUP_PATTERNS=()
DURATION=60
INTERVAL=1
OUTPUT_DIR="${OUTPUT_DIR:-$PWD}"
OUTPUT_FILE=""

usage() {
    cat >&2 <<'EOF'
Usage: sample_cpu.sh --group NAME=PATTERN [--group NAME=PATTERN ...] \
                     [--duration SECONDS] [--interval SECONDS] [--output FILE]

Required:
  --group NAME=PATTERN   Repeatable. NAME must be [a-zA-Z0-9_]+; PATTERN is a pgrep -f regex.

Options:
  --duration SECONDS     Total sampling window (default: 60).
  --interval SECONDS     Sampling period (default: 1).
  --output FILE          CSV path (default: $OUTPUT_DIR/sample_cpu_<epoch>.csv).

Environment:
  OUTPUT_DIR             Default output directory when --output is not given (default: current directory).
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

CLK_TCK=$(getconf CLK_TCK)

# Snapshot PIDs per group at startup. pgrep -f returns non-zero when nothing
# matches, which is a valid state for one group as long as another matched.
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
    OUTPUT_FILE="$OUTPUT_DIR/sample_cpu_$(date +%s).csv"
fi

for i in "${!GROUP_NAMES[@]}"; do
    pids_display="${GROUP_PIDS[$i]:-<none>}"
    echo "${GROUP_NAMES[$i]} PIDs: $(echo "$pids_display" | tr '\n' ' ')"
done
echo "Recording to: $OUTPUT_FILE"
echo "Duration: ${DURATION}s, Interval: ${INTERVAL}s, CLK_TCK: $CLK_TCK"
echo ""

header="timestamp"
for name in "${GROUP_NAMES[@]}"; do
    header="$header,${name}_cpu_percent"
done
header="$header,total_cpu_percent"
echo "$header" > "$OUTPUT_FILE"

# Sum utime+stime (jiffies) across a whitespace-separated PID list. The comm
# field can contain spaces and parens, so strip everything through the last ')'
# before splitting on whitespace.
group_jiffies() {
    local total=0
    for pid in $1; do
        if [ -r "/proc/$pid/stat" ]; then
            local stat rest utime stime
            stat=$(cat "/proc/$pid/stat" 2>/dev/null) || continue
            rest=${stat##*) }
            utime=$(echo "$rest" | awk '{print $12}')
            stime=$(echo "$rest" | awk '{print $13}')
            total=$((total + utime + stime))
        fi
    done
    echo "$total"
}

declare -a PREV_JIFFIES
for i in "${!GROUP_NAMES[@]}"; do
    PREV_JIFFIES[$i]=$(group_jiffies "${GROUP_PIDS[$i]}")
done
PREV_NS=$(date +%s%N)
START_TIME=$(date +%s)

while true; do
    NOW=$(date +%s)
    [ $((NOW - START_TIME)) -ge "$DURATION" ] && break
    sleep "$INTERVAL"

    declare -a CUR_JIFFIES
    for i in "${!GROUP_NAMES[@]}"; do
        CUR_JIFFIES[$i]=$(group_jiffies "${GROUP_PIDS[$i]}")
    done
    CUR_NS=$(date +%s%N)

    # Wall-time seconds this interval, computed once.
    secs=$(awk -v t1="$PREV_NS" -v t2="$CUR_NS" 'BEGIN {
        s = (t2 - t1) / 1e9
        if (s <= 0) s = 1
        printf "%.6f", s
    }')

    line=""
    total_delta=0
    for i in "${!GROUP_NAMES[@]}"; do
        d=$(( CUR_JIFFIES[i] - PREV_JIFFIES[i] ))
        total_delta=$(( total_delta + d ))
        pct=$(awk -v d="$d" -v hz="$CLK_TCK" -v s="$secs" 'BEGIN { printf "%.1f%%", d * 100 / (hz * s) }')
        line="$line,$pct"
    done
    total_pct=$(awk -v d="$total_delta" -v hz="$CLK_TCK" -v s="$secs" 'BEGIN { printf "%.1f%%", d * 100 / (hz * s) }')
    line="${line#,},$total_pct"

    TIMESTAMP=$(date '+%Y-%m-%d %H:%M:%S')
    echo "$TIMESTAMP,$line" | tee -a "$OUTPUT_FILE"

    for i in "${!GROUP_NAMES[@]}"; do
        PREV_JIFFIES[$i]="${CUR_JIFFIES[$i]}"
    done
    PREV_NS=$CUR_NS
done

echo ""
echo "Monitoring complete. Results saved to $OUTPUT_FILE"
