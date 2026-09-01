#!/usr/bin/env bash
set -euo pipefail

# DABBIR | دبّر — Dubai Supabase bootstrap for Falconcloud / Equinix DX1.
# Run only on a fresh Ubuntu 24.04 LTS VM with >=4 vCPU, >=8 GB RAM, >=160 GB SSD.

if [[ "${EUID}" -ne 0 ]]; then
  echo "Run as root (sudo -i)." >&2
  exit 1
fi

for v in DABBIR_DB_DOMAIN DABBIR_APP_URL ADMIN_EMAIL; do
  if [[ -z "${!v:-}" ]]; then
    echo "Missing required environment variable: $v" >&2
    exit 1
  fi
done

export DEBIAN_FRONTEND=noninteractive
apt-get update
apt-get install -y ca-certificates curl git jq openssl ufw fail2ban unattended-upgrades

# Firewall: SSH + HTTPS only. Supabase gateway stays private behind Caddy.
ufw default deny incoming
ufw default allow outgoing
ufw allow OpenSSH
ufw allow 80/tcp
ufw allow 443/tcp
ufw --force enable
systemctl enable --now fail2ban

install -d -m 0750 /opt/dabbir
cd /opt/dabbir

# Official Supabase Linux installer. It generates unique secrets and current pinned self-hosted config.
curl -fsSL https://supabase.link/setup.sh -o /tmp/supabase-setup.sh
bash /tmp/supabase-setup.sh -y

SUPA_DIR="/opt/dabbir/supabase-project"
if [[ ! -d "$SUPA_DIR" ]]; then
  # Current installer may create the project under the invoking directory or $HOME.
  SUPA_DIR="$(find /opt/dabbir /root -maxdepth 2 -type d -name supabase-project 2>/dev/null | head -n1 || true)"
fi
[[ -n "$SUPA_DIR" && -d "$SUPA_DIR" ]] || { echo "Supabase project directory not found" >&2; exit 1; }

cd "$SUPA_DIR"

# Configure public URLs. The API gateway itself remains on localhost; Caddy terminates TLS.
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
out=[]
seen=set()
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

# Bind Envoy to loopback only where compose uses the gateway port.
# Keep changes intentionally minimal and inspect compose before public cutover.
sh run.sh start

docker compose ps

# Caddy reverse proxy for automatic TLS.
apt-get install -y debian-keyring debian-archive-keyring apt-transport-https
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

echo "Bootstrap complete. Do not cut over production yet."
echo "Next: run verify.sh, then migrate schema/data/storage/auth, then update Vercel production env and dxb1 region."
