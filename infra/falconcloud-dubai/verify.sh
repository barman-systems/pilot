#!/usr/bin/env bash
set -euo pipefail

DOMAIN="${DABBIR_DB_DOMAIN:-}"
[[ -n "$DOMAIN" ]] || { echo "Set DABBIR_DB_DOMAIN" >&2; exit 1; }

fail=0
check(){
  local name="$1"; shift
  if "$@"; then printf 'PASS  %s\n' "$name"; else printf 'FAIL  %s\n' "$name"; fail=1; fi
}
http_non_5xx(){
  local url="$1" code
  code="$(curl -sS -o /dev/null --max-time 10 -w '%{http_code}' "$url" || true)"
  [[ "$code" =~ ^[1-4][0-9][0-9]$ ]]
}

check "Docker active" systemctl is-active --quiet docker
check "Caddy active" systemctl is-active --quiet caddy
check "Firewall active" bash -lc "ufw status | grep -q '^Status: active'"
check "Supabase containers running" bash -lc "cd /opt/dabbir/supabase-project && docker compose ps --format json | jq -s 'length > 0 and all(.[]; .State == \"running\")' -e >/dev/null"
check "Auth HTTPS reachable" http_non_5xx "https://${DOMAIN}/auth/v1/health"
check "REST gateway reachable" http_non_5xx "https://${DOMAIN}/rest/v1/"

# UFW must not permit DB/gateway ports from the Internet.
if ufw status | grep -Eq '(^|[[:space:]])(5432|8000)(/tcp)?[[:space:]]+ALLOW'; then
  echo "FAIL  UFW exposes 5432 or 8000"
  fail=1
else
  echo "PASS  DB/gateway ports not allowed by UFW"
fi

if ss -lnt | awk '{print $4}' | grep -Eq '0\.0\.0\.0:5432|\[::\]:5432'; then
  echo "WARN  Postgres listens on all interfaces; UFW blocks it, but bind-to-private/loopback is preferred."
fi
if ss -lnt | awk '{print $4}' | grep -Eq '0\.0\.0\.0:8000|\[::\]:8000'; then
  echo "WARN  Supabase gateway listens on all interfaces; UFW blocks 8000, but bind-to-loopback is preferred."
fi

mem_kb=$(awk '/MemTotal/{print $2}' /proc/meminfo)
cpu=$(nproc)
disk_gb=$(df -BG /opt | awk 'NR==2{gsub("G","",$2); print $2}')
(( mem_kb >= 7*1024*1024 )) && echo "PASS  RAM target met" || { echo "FAIL  RAM below 8GB-class target"; fail=1; }
(( cpu >= 4 )) && echo "PASS  CPU ${cpu} cores" || { echo "FAIL  CPU ${cpu} (<4)"; fail=1; }
(( disk_gb >= 140 )) && echo "PASS  Disk ${disk_gb}GB" || { echo "FAIL  Disk ${disk_gb}GB (<160GB-class target)"; fail=1; }

# PostgreSQL major must match source (17.6 source -> PG17 target).
DB_CONTAINER="$(cd /opt/dabbir/supabase-project && docker compose ps --format json | jq -r 'select((.Service // .Name // "")|test("db|postgres";"i")) | .Name' | head -n1)"
if [[ -n "$DB_CONTAINER" ]] && docker exec "$DB_CONTAINER" psql -U postgres -Atc 'show server_version_num' | grep -q '^17'; then
  echo "PASS  PostgreSQL major 17"
else
  echo "FAIL  PostgreSQL 17 target not confirmed"
  fail=1
fi

# ICMP is diagnostic only; some networks legitimately block it.
if ping -c 5 -W 2 1.1.1.1 >/tmp/dabbir-ping.txt 2>/dev/null; then
  awk -F'/' '/rtt/{print "INFO  Internet RTT avg=" $5 " ms"}' /tmp/dabbir-ping.txt || true
else
  echo "INFO  ICMP unavailable; HTTPS checks above are authoritative."
fi

exit "$fail"
