#!/bin/bash
# Read-only numeric diagnostics for cold hosted simulator preparation. Raw
# commands, paths, account/device identifiers, and command errors stay private.
set -uo pipefail

for ci_key in hw.ncpu hw.memsize vm.loadavg; do
    sysctl -n "$ci_key" 2>/dev/null | awk -v key="$ci_key" '
      key == "hw.ncpu" && $0 ~ /^[0-9]+$/ { print "Native resources: cpu_cores=" $0 }
      key == "hw.memsize" && $0 ~ /^[0-9]+$/ { print "Native resources: memory_bytes=" $0 }
      key == "vm.loadavg" && $2 ~ /^[0-9.]+$/ && $3 ~ /^[0-9.]+$/ && $4 ~ /^[0-9.]+$/ {
        print "Native resources: load_1m=" $2 " load_5m=" $3 " load_15m=" $4
      }
    ' || true
done

vm_stat 2>/dev/null | awk '
  /^Mach Virtual Memory Statistics: \(page size of [0-9]+ bytes\)/ {
    print "Native resources: page_bytes=" $8
  }
  BEGIN {
    keys["Pages free"] = "free_pages"; keys["Pages active"] = "active_pages"
    keys["Pages wired down"] = "wired_pages"
    keys["Pages occupied by compressor"] = "compressed_pages"
    keys["Swapins"] = "swapins"; keys["Swapouts"] = "swapouts"
  }
  {
    split($0, parts, ":")
    value = parts[2]; gsub(/[ .]/, "", value)
    if (parts[1] in keys && value ~ /^[0-9]+$/)
      print "Native resources: " keys[parts[1]] "=" value
  }
' || true

ps -A -o pcpu= -o rss= -o comm= 2>/dev/null | awk '
  BEGIN {
    split("installd lsd SpringBoard backboardd WindowServer kernel_task securityd mds mdworker_shared com.apple.CoreSimulator.CoreSimulatorService", names, " ")
    for (i in names) allowed[names[i]] = 1
  }
  $1 ~ /^[0-9.]+$/ && $2 ~ /^[0-9]+$/ {
    count++; cpu += $1; rss += $2
    name = $NF; sub(/^.*\//, "", name)
    if (name in allowed) {
      counts[name]++; cpus[name] += $1; memory[name] += $2
    }
  }
  END {
    printf "Native resources: process_count=%d cpu_percent=%.1f rss_kib=%.0f\n", count, cpu, rss
    for (name in counts)
      printf "Native resources: process=%s count=%d cpu_percent=%.1f rss_kib=%.0f\n", name, counts[name], cpus[name], memory[name]
  }
' || true
exit 0
