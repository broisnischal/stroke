#!/usr/bin/env bash
# =============================================================================
# DB Studio — process performance monitor & logger
#
# Usage:
#   ./scripts/monitor.sh                    # watch live, log to logs/perf.log
#   ./scripts/monitor.sh -i 5              # sample every 5 seconds (default: 2)
#   ./scripts/monitor.sh -o /tmp/perf.log  # custom log path
#   ./scripts/monitor.sh -n 100            # stop after 100 samples
#   ./scripts/monitor.sh --no-log          # print only, no file
#   ./scripts/monitor.sh --summary         # print summary of an existing log
#
# The log is CSV so you can open it in any spreadsheet or plot it with gnuplot.
# =============================================================================

set -euo pipefail

# ── Defaults ────────────────────────────────────────────────────────────────
INTERVAL=2
LOG_DIR="$(cd "$(dirname "$0")/.." && pwd)/logs"
LOG_FILE="$LOG_DIR/perf-$(date +%Y%m%d-%H%M%S).log"
MAX_SAMPLES=0          # 0 = unlimited
NO_LOG=0
SUMMARY_MODE=0
SUMMARY_FILE=""
PROCESS_NAME="db-studio"

# ── Arg parsing ──────────────────────────────────────────────────────────────
while [[ $# -gt 0 ]]; do
  case $1 in
    -i|--interval)  INTERVAL="$2"; shift 2 ;;
    -o|--output)    LOG_FILE="$2"; shift 2 ;;
    -n|--samples)   MAX_SAMPLES="$2"; shift 2 ;;
    -p|--process)   PROCESS_NAME="$2"; shift 2 ;;
    --no-log)       NO_LOG=1; shift ;;
    --summary)      SUMMARY_MODE=1; SUMMARY_FILE="${2:-}"; shift; [[ $# -gt 0 ]] && shift || true ;;
    -h|--help)
      sed -n '3,15p' "$0" | sed 's/^# \?//'
      exit 0 ;;
    *) echo "Unknown arg: $1"; exit 1 ;;
  esac
done

# ── Summary mode ─────────────────────────────────────────────────────────────
if [[ $SUMMARY_MODE -eq 1 ]]; then
  target="${SUMMARY_FILE:-$(ls -t "$LOG_DIR"/perf-*.log 2>/dev/null | head -1)}"
  if [[ -z "$target" || ! -f "$target" ]]; then
    echo "No log file found. Run the monitor first, or pass the path as the second argument."
    exit 1
  fi
  echo ""
  echo "  Log: $target"
  echo "  Samples: $(tail -n +2 "$target" | wc -l)"
  echo ""
  # awk: skip header, compute min/max/avg for RSS(col4), Virt(col5), CPU(col6)
  awk -F',' 'NR>1 {
    rss=$4; virt=$5; cpu=$6
    if (NR==2 || rss<rssMin)  rssMin=rss;   if (NR==2 || rss>rssMax)  rssMax=rss;  rssSum+=rss
    if (NR==2 || virt<virtMin) virtMin=virt; if (NR==2 || virt>virtMax) virtMax=virt; virtSum+=virt
    if (NR==2 || cpu<cpuMin)  cpuMin=cpu;   if (NR==2 || cpu>cpuMax)  cpuMax=cpu;  cpuSum+=cpu
    n++
  }
  END {
    if (n==0) { print "  No data."; exit }
    fmt="%8.1f"
    printf "  %-20s  %12s  %12s  %12s\n", "Metric", "Min", "Avg", "Max"
    printf "  %-20s  %12s  %12s  %12s\n", "------", "---", "---", "---"
    printf "  %-20s  %9.1f MB  %9.1f MB  %9.1f MB\n", "RSS (physical)", rssMin/1024, (rssSum/n)/1024, rssMax/1024
    printf "  %-20s  %9.1f MB  %9.1f MB  %9.1f MB\n", "Virtual mem",   virtMin/1024, (virtSum/n)/1024, virtMax/1024
    printf "  %-20s  %9.1f %%   %9.1f %%   %9.1f %%\n", "CPU",         cpuMin, cpuSum/n, cpuMax
  }' "$target"
  echo ""
  exit 0
fi

# ── Helpers ───────────────────────────────────────────────────────────────────
find_pid() {
  # Try by exact process name first, then binary name
  pgrep -x "$PROCESS_NAME" 2>/dev/null | head -1 \
    || pgrep -f "$PROCESS_NAME" 2>/dev/null | grep -v "$0" | head -1 \
    || true
}

read_proc_status() {
  local pid=$1 field=$2
  grep "^${field}:" "/proc/$pid/status" 2>/dev/null | awk '{print $2}' || echo 0
}

read_cpu_percent() {
  # Read two /proc/$pid/stat snapshots 200ms apart and compute usage
  local pid=$1
  local stat1 stat2 utime1 stime1 utime2 stime2 uptime1 uptime2
  stat1=$(cat "/proc/$pid/stat" 2>/dev/null) || { echo "0.0"; return; }
  uptime1=$(awk '{print $1}' /proc/uptime)
  sleep 0.2
  stat2=$(cat "/proc/$pid/stat" 2>/dev/null) || { echo "0.0"; return; }
  uptime2=$(awk '{print $1}' /proc/uptime)

  utime1=$(echo "$stat1" | awk '{print $14}')
  stime1=$(echo "$stat1" | awk '{print $15}')
  utime2=$(echo "$stat2" | awk '{print $14}')
  stime2=$(echo "$stat2" | awk '{print $15}')

  awk -v u1="$utime1" -v s1="$stime1" -v u2="$utime2" -v s2="$stime2" \
      -v up1="$uptime1" -v up2="$uptime2" \
      'BEGIN {
        hz = 100          # USER_HZ (sysconf _SC_CLK_TCK)
        proc_delta = (u2+s2) - (u1+s1)
        time_delta = (up2 - up1) * hz
        if (time_delta <= 0) { print "0.0"; exit }
        printf "%.1f\n", (proc_delta / time_delta) * 100
      }'
}

fmt_kb() { awk -v kb="$1" 'BEGIN { printf "%.1f MB", kb/1024 }'; }

# ── Setup log ─────────────────────────────────────────────────────────────────
if [[ $NO_LOG -eq 0 ]]; then
  mkdir -p "$LOG_DIR"
  # CSV header
  echo "timestamp,pid,process_name,rss_kb,virtual_kb,cpu_pct,threads,open_fds" > "$LOG_FILE"
  echo "  Logging to: $LOG_FILE"
fi

# ── Locate process ────────────────────────────────────────────────────────────
echo ""
echo "  DB Studio process monitor"
echo "  Looking for process: $PROCESS_NAME"
echo "  Interval: ${INTERVAL}s  |  Ctrl+C to stop"
echo ""
printf "  %-24s  %-6s  %-12s  %-12s  %-8s  %-8s  %s\n" \
  "Timestamp" "PID" "RSS" "Virtual" "CPU%" "Threads" "FDs"
printf "  %-24s  %-6s  %-12s  %-12s  %-8s  %-8s  %s\n" \
  "-------------------------" "------" "------------" "------------" "--------" "-------" "---"

sample_count=0

while true; do
  PID=$(find_pid)

  if [[ -z "$PID" ]]; then
    printf "  %-24s  %s\n" "$(date '+%Y-%m-%d %H:%M:%S')" "(process not running — waiting)"
    sleep "$INTERVAL"
    continue
  fi

  # Read /proc directly — no external deps needed
  RSS_KB=$(read_proc_status "$PID" "VmRSS")
  VIRT_KB=$(read_proc_status "$PID" "VmSize")
  THREADS=$(read_proc_status "$PID" "Threads")
  OPEN_FDS=$(ls "/proc/$PID/fd" 2>/dev/null | wc -l || echo 0)
  PROC_NAME=$(cat "/proc/$PID/comm" 2>/dev/null | tr -d '\n' || echo "$PROCESS_NAME")
  CPU=$(read_cpu_percent "$PID")
  TS=$(date '+%Y-%m-%d %H:%M:%S')

  # Print live
  printf "  %-24s  %-6s  %-12s  %-12s  %-8s  %-8s  %s\n" \
    "$TS" "$PID" "$(fmt_kb "$RSS_KB")" "$(fmt_kb "$VIRT_KB")" "${CPU}%" "$THREADS" "$OPEN_FDS"

  # Write CSV
  if [[ $NO_LOG -eq 0 ]]; then
    echo "$TS,$PID,$PROC_NAME,$RSS_KB,$VIRT_KB,$CPU,$THREADS,$OPEN_FDS" >> "$LOG_FILE"
  fi

  (( sample_count++ )) || true
  if [[ $MAX_SAMPLES -gt 0 && $sample_count -ge $MAX_SAMPLES ]]; then
    echo ""
    echo "  Reached $MAX_SAMPLES samples. Stopping."
    break
  fi

  # Subtract the 0.2s already spent in read_cpu_percent
  sleep "$(awk -v i="$INTERVAL" 'BEGIN { v=i-0.2; print (v>0)?v:0 }')"
done

# Print summary at exit
if [[ $NO_LOG -eq 0 && $sample_count -gt 0 ]]; then
  echo ""
  echo "  ── Summary ────────────────────────────────────────────────"
  bash "$0" --summary "$LOG_FILE"
fi
