#!/bin/bash
# Real-time CPU monitor: switchboard daemon vs client (v2).
# Computes true per-interval CPU% from /proc/<pid>/stat deltas —
# no pidstat dependency, no lifetime-average problem.
#
# Usage: ./monitor_cpu_daemon_client_v2.sh [duration_seconds] [interval_seconds]

DURATION=${1:-60}
INTERVAL=${2:-1}
OUTPUT_DIR="${OUTPUT_DIR:-$PWD}"
OUTPUT_FILE="$OUTPUT_DIR/switchboard_cpu_v2_$(date +%s).csv"
CLK_TCK=$(getconf CLK_TCK)   # jiffies per second, usually 100

# Daemon: node process running daemon.js
DAEMON_PIDS=$(pgrep -f "switchboard-daemon")
# Client: Electron tree from the AppImage mount (main, gpu, renderer, utility, zygotes)
CLIENT_PIDS=$(pgrep -f "mount_Switch.*switchboard|Switchboard.*AppImage")

if [ -z "$DAEMON_PIDS" ] && [ -z "$CLIENT_PIDS" ]; then
    echo "Error: no switchboard daemon or client processes found."
    exit 1
fi

echo "Daemon PIDs: $(echo $DAEMON_PIDS | tr '\n' ' ')"
echo "Client PIDs: $(echo $CLIENT_PIDS | tr '\n' ' ')"
echo "Recording to: $OUTPUT_FILE"
echo "Duration: ${DURATION}s, Interval: ${INTERVAL}s, CLK_TCK: $CLK_TCK"
echo ""

echo "timestamp,daemon_cpu_percent,client_cpu_percent,total_cpu_percent" > "$OUTPUT_FILE"

# Sum utime+stime (jiffies) for a list of PIDs.
# comm field can contain spaces, so strip everything through the last ')' first.
group_jiffies() {
    local total=0
    for pid in $1; do
        if [ -r "/proc/$pid/stat" ]; then
            local stat rest utime stime
            stat=$(cat "/proc/$pid/stat" 2>/dev/null) || continue
            rest=${stat##*) }                 # fields from state onward
            utime=$(echo "$rest" | awk '{print $12}')  # field 14 overall
            stime=$(echo "$rest" | awk '{print $13}')  # field 15 overall
            total=$((total + utime + stime))
        fi
    done
    echo "$total"
}

START_TIME=$(date +%s)
PREV_DAEMON=$(group_jiffies "$DAEMON_PIDS")
PREV_CLIENT=$(group_jiffies "$CLIENT_PIDS")
PREV_NS=$(date +%s%N)

while true; do
    NOW=$(date +%s)
    [ $((NOW - START_TIME)) -ge "$DURATION" ] && break

    sleep "$INTERVAL"

    CUR_DAEMON=$(group_jiffies "$DAEMON_PIDS")
    CUR_CLIENT=$(group_jiffies "$CLIENT_PIDS")
    CUR_NS=$(date +%s%N)

    # Elapsed wall time in seconds (float) — measured, not assumed
    LINE=$(awk -v d1="$PREV_DAEMON" -v d2="$CUR_DAEMON" \
               -v c1="$PREV_CLIENT" -v c2="$CUR_CLIENT" \
               -v t1="$PREV_NS" -v t2="$CUR_NS" -v hz="$CLK_TCK" '
        BEGIN {
            secs = (t2 - t1) / 1e9
            if (secs <= 0) secs = 1
            dcpu = (d2 - d1) * 100 / (hz * secs)
            ccpu = (c2 - c1) * 100 / (hz * secs)
            printf "%.1f%%,%.1f%%,%.1f%%", dcpu, ccpu, dcpu + ccpu
        }')

    TIMESTAMP=$(date '+%Y-%m-%d %H:%M:%S')
    echo "$TIMESTAMP,$LINE" | tee -a "$OUTPUT_FILE"

    PREV_DAEMON=$CUR_DAEMON
    PREV_CLIENT=$CUR_CLIENT
    PREV_NS=$CUR_NS
done

echo ""
echo "Monitoring complete. Results saved to $OUTPUT_FILE"
