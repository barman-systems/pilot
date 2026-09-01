#!/usr/bin/env bash
set -euo pipefail

# DABBIR | دبّر — Dubai Supabase bootstrap for Falconcloud / Equinix DX1.
# Target: fresh Ubuntu 24.04 LTS x86_64 VM, >=4 vCPU, >=8 GB RAM, >=160 GB SSD.

if [[ "${EUID}" -ne 0 ]]; then
  echo "Run as root (sudo -i)." >&2
  exit 1
fi

for v in DABBIR_DB_DOMAIN DABBIR_APP_URL; do
  if [[ -z "${!v:-}" ]]; then
    echo "Missing required environment variable: $v" >&2
    exit 1
  fi
done

[[ "$(uname -m)" == "x86_64" ]] || { echo "This bootstrap is pinned for x86_64." >&2; exit 1; }

export DEBIAN_FRONTEND=noninteractive
apt-get update
apt-get install -y ca-certificates curl git jq openssl gnupg python3 ufw fail2ban unattended-upgrades postgresql-client debian-keyring debian-archive-keyring apt-transport-https

# Pin the Supabase CLI release used for migration and verify the vendor-published SHA-256.
SUPABASE_CLI_VERSION="2.116.0"
SUPABASE_CLI_DEB="/tmp/supabase_${SUPABASE_CLI_VERSION}_linux_amd64.deb"
curl -fL "https://github.com/supabase/cli/releases/download/v${SUPABASE_CLI_VERSION}/supabase_${SUPABASE_CLI_VERSION}_linux_amd64.deb" -o "$SUPABASE_CLI_DEB"
echo "82cb424bc13cd029a66cb43bc537315cee9068cc6237b7d4b7f8f8949800d251  $SUPABASE_CLI_DEB" | sha256sum -c -
dpkg -i "$SUPABASE_CLI_DEB"
supabase --version | grep -qx "$SUPABASE_CLI_VERSION"

# Host firewall: SSH + HTTP(S) only. DB and Supabase gateway never become public ports.
ufw default deny incoming
ufw default allow outgoing
ufw allow OpenSSH
ufw allow 80/tcp
ufw allow 443/tcp
ufw --force enable
systemctl enable --now fail2ban

install -d -m 0750 /opt/dabbir
cd /opt/dabbir

# Official Supabase self-host installer. It generates unique secrets and current self-hosted config.
curl -fsSL https://supabase.link/setup.sh -o /tmp/supabase-setup.sh
bash /tmp/supabase-setup.sh -y

SUPA_DIR="/opt/dabbir/supabase-project"
if [[ ! -d "$SUPA_DIR" ]]; then
  SUPA_DIR="$(find /opt/dabbir /root -maxdepth 3 -type d -name supabase-project 2>/dev/null | head -n1 || true)"
fi
[[ -n "$SUPA_DIR" && -d "$SUPA_DIR" ]] || { echo "Supabase project directory not found" >&2; exit 1; }

cd "$SUPA_DIR"

python3 - <<'PY'
from pathlib import Path
import os
p=Path('.env')
s=p.read_text()
vals={
  'SUPABASE_PUBLIC_URL':f"https://{os.environ['DABBIR_DB_DOMAIN']}",
  'API_EXTERNAL_URL':f"https://{os.environ['DABBIR_DB_DOMAIN']}/auth/v1",
  'SITE_URL':os.environ['DABBIR_APP_URL'],
}
out=[]; seen=set()
for line in s.splitlines():
    if '=' in line and not line.lstrip().startswith('#'):
        k=line.split('=',1)[0]
        if k in vals:
            line=f"{k}={vals[k]}"; seen.add(k)
    out.append(line)
for k,v in vals.items():
    if k not in seen: out.append(f"{k}={v}")
p.write_text('\n'.join(out)+'\n')
PY

sh run.sh start

docker compose ps

# Fresh self-hosted target must be PostgreSQL 17 to match the source major version.
DB_CONTAINER="$(docker compose ps --format json | jq -r 'select((.Service // .Name // "")|test("db|postgres";"i")) | .Name' | head -n1)"
if [[ -n "$DB_CONTAINER" ]]; then
  docker exec "$DB_CONTAINER" psql -U postgres -Atc 'show server_version_num' | grep -q '^17'
fi

# Caddy terminates TLS and proxies only to the local Supabase gateway.
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' | gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' > /etc/apt/sources.list.d/caddy-stable.list
apt-get update
apt-get install -y caddy

cat >/etc/caddy/Caddyfile <<EOF
${DABBIR_DB_DOMAIN} {
  encode zstd gzip
  reverse_proxy 127.0.0.1:8000
  header {
    Strict-Transport-Security "max-age=31536000; includeSubDomains"
    X-Content-Type-Options "nosniff"
    X-Frame-Options "DENY"
    Referrer-Policy "no-referrer"
  }
}
EOF

systemctl enable --now caddy
systemctl reload caddy

echo "Bootstrap complete. Production cutover remains blocked until verify.sh and DABBIR-only migration gates pass."
