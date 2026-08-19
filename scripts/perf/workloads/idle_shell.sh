#!/bin/bash
# Perf workload: hold the shell open indefinitely with no work.
#
# Used for "N idle sessions" scenarios — the emulator window stays open,
# the shell consumes ~zero CPU, memory is stable. The driver's cleanup
# step kills these when the sampling window ends.
#
# exec sleep so the process tree is one process per window, not
# bash-plus-sleep. Matters when we're counting per-session RSS overhead.

exec sleep 86400
