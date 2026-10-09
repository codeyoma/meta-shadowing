#!/bin/bash
set -euo pipefail
cd "$(dirname "$0")/../.."

# Exercise the real formatter with controlled system-command outputs. No raw
# process command, device identifier, or error payload may reach public logs.
sysctl() {
    if [ "${CI_RESOURCE_FAILURE:-0}" = 1 ]; then
        echo 'PRIVATE_RESOURCE_ERROR /private/profile' >&2
        return 42
    fi
    case "$2" in
        hw.ncpu) echo 3 ;;
        hw.memsize) echo 7516192768 ;;
        vm.loadavg) echo '{ 12.30 8.40 4.50 }' ;;
    esac
}
vm_stat() {
    printf '%s\n' \
        'Mach Virtual Memory Statistics: (page size of 16384 bytes)' \
        'Pages free: 123.' 'Pages active: 456.' 'Pages wired down: 789.' \
        'Pages occupied by compressor: 321.' 'Swapins: 45.' 'Swapouts: 67.' \
        'PRIVATE_RESOURCE_PAYLOAD: /private/profile'
}
ps() {
    printf '%s\n' \
        '90.0 1024 /system/path/installd' \
        '25.5 2048 /system/path/com.apple.CoreSimulator.CoreSimulatorService' \
        '4.0 512 /private/profile/PRIVATE_RESOURCE_PROCESS' \
        'not-a-number 10 /private/profile/PRIVATE_RESOURCE_PAYLOAD'
}
export -f sysctl vm_stat ps

ruby -ropen3 -e '
  path = "native-ios/scripts/ci-simulator-resources.sh"
  output, status = Open3.capture2e("bash", path)
  abort "FAIL: resource snapshot failed" unless status.success?
  ["cpu_cores=3", "memory_bytes=7516192768", "load_1m=12.30",
   "page_bytes=16384", "free_pages=123", "compressed_pages=321",
   "swapins=45", "swapouts=67", "process_count=3 cpu_percent=119.5 rss_kib=3584",
   "process=installd count=1 cpu_percent=90.0 rss_kib=1024"].each do |value|
    abort "FAIL: missing numeric resource counter #{value}" unless output.include?(value)
  end
  abort "FAIL: resource payload leaked" if output.include?("PRIVATE_RESOURCE") || output.include?("/private/") || output.include?("/system/")
  output, status = Open3.capture2e({"CI_RESOURCE_FAILURE" => "1"}, "bash", path)
  abort "FAIL: unavailable diagnostics must remain nonfatal" unless status.success?
  abort "FAIL: raw command error leaked" if output.include?("PRIVATE_RESOURCE") || output.include?("/private/")
  puts "PASS: simulator resource counters are numeric, allowlisted, and nonfatal."
'
