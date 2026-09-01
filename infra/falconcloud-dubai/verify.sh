#!/usr/bin/env bash
set -euo pipefail

DOMAIN="${DABBIR_DB_DOMAIN:-}"
[[ -n "$DOMAIN" ]] || { echo "Set DABBIR_DB_DOMAIN" >&2; exit 1; }

fail=0
check(){
  local name="$1"; shift
  if "$@"; then printf 'PASS  %s\n' "$name"; else printf 'FAIL  %s\n' "$name"; fail=1; fi
}

check "Docker active" systemctl is-active --quiet docker
check "Caddy active" systemctl is-active --quiet caddy
check "Firewall active" bash -lc "ufw status | grep -q '^Status: active'"
check "Supabase containers healthy" bash -lc "cd /opt/dabbir/supabase-project && docker compose ps --format json | jq -s 'length > 0 and all(.[]; (.State == \"running\") and ((.Health // \"healthy\") == \"healthy\"))' -e >/dev/null"
check "HTTPS reachable" curl -fsS --max-time 10 "https://${DOMAIN}/auth/v1/health" -o /dev/null
check "REST reachable" curl -fsS --max-time 10 -I "https://${DOMAIN}/rest/v1/" -o /dev/null

# Verify public ports. 5432/8000 must not be Internet-exposed by UFW policy.
if ss -lnt | awk '{print $4}' | grep -Eq '(^|:)5432$'; then
  echo "INFO  Postgres listens locally; ensure provider firewall also blocks 5432."
fi
if ss -lnt | awk '{print $4}' | grep -Eq '0\.0\.0\.0:8000|\[::\]:8000'; then
  echo "WARN  Supabase gateway is listening on all interfaces; UFW still blocks 8000, but bind-to-loopback hardening is recommended."
fi

# Basic resource sanity.
mem_gb=$(awk '/MemTotal/{printf "%d", $2/1024/1024}' /proc/meminfo)
cpu=$(nproc)
disk_gb=$(df -BG /opt | awk 'NR==2{gsub("G","",$2); print $2}')
[[ "$mem_gb" -ge 7 ]] && echo "PASS  RAM ${mem_gb}GB" || { echo "FAIL  RAM ${mem_gb}GB (<8GB target)"; fail=1; }
[[ "$cpu" -ge 4 ]] && echo "PASS  CPU ${cpu} cores" || { echo "FAIL  CPU ${cpu} (<4 target)"; fail=1; }
[[ "$disk_gb" -ge 140 ]] && echo "PASS  Disk ${disk_gb}GB" || echo "WARN  Disk ${disk_gb}GB (<160GB target)"

# Network checks suitable before cutover.
ping -c 5 -W 2 1.1.1.1 >/tmp/dabbir-ping.txt || fail=1
awk -F'/' '/rtt/{print "INFO  Internet RTT avg=" $5 " ms"}' /tmp/dabbir-ping.txt || true

exit "$fail"
