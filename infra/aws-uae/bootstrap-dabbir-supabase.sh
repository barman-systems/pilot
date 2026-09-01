#!/usr/bin/env bash
set -euo pipefail

# DABBIR UAE Supabase bootstrap.
# Intended to run on the AWS me-central-1 host through AWS Systems Manager.
# No passwords or API keys are stored in this repository.

SUPABASE_TAG="${SUPABASE_TAG:-self-hosted/v0.8.0}"
INSTALL_ROOT="${INSTALL_ROOT:-/opt/dabbir}"
SUPABASE_ROOT="${SUPABASE_ROOT:-${INSTALL_ROOT}/supabase}"
DATA_ROOT="${DATA_ROOT:-${INSTALL_ROOT}/data}"
ENV_FILE="${ENV_FILE:-${SUPABASE_ROOT}/docker/.env}"
PUBLIC_URL="${DABBIR_SUPABASE_PUBLIC_URL:-}"
SITE_URL="${DABBIR_SITE_URL:-https://dabbir.bmalman.com}"

require_root() {
  if [[ "${EUID}" -ne 0 ]]; then
    echo "Run through SSM as root (or sudo)." >&2
    exit 1
  fi
}

install_packages() {
  dnf install -y git docker jq curl openssl postgresql17 || dnf install -y git docker jq curl openssl postgresql
  systemctl enable --now docker
  mkdir -p /usr/local/lib/docker/cli-plugins "${INSTALL_ROOT}" "${DATA_ROOT}"
  if [[ ! -x /usr/local/lib/docker/cli-plugins/docker-compose ]]; then
    curl -fsSL https://github.com/docker/compose/releases/latest/download/docker-compose-linux-x86_64 \
      -o /usr/local/lib/docker/cli-plugins/docker-compose
    chmod 0755 /usr/local/lib/docker/cli-plugins/docker-compose
  fi
}

checkout_supabase() {
  if [[ ! -d "${SUPABASE_ROOT}/.git" ]]; then
    git clone --filter=blob:none https://github.com/supabase/supabase.git "${SUPABASE_ROOT}"
  fi
  git -C "${SUPABASE_ROOT}" fetch --tags --force
  git -C "${SUPABASE_ROOT}" checkout --detach "${SUPABASE_TAG}"
}

generate_env_once() {
  cd "${SUPABASE_ROOT}/docker"
  if [[ -f "${ENV_FILE}" ]]; then
    echo "Existing ${ENV_FILE} retained."
    return
  fi

  cp .env.example "${ENV_FILE}"
  chmod 0600 "${ENV_FILE}"

  # Supabase's pinned self-hosted release ships official key-generation helpers.
  sh utils/generate-keys.sh
  sh utils/add-new-auth-keys.sh

  # Replace non-secret deployment settings only. Secret values are generated locally.
  if [[ -n "${PUBLIC_URL}" ]]; then
    sed -i "s|^SUPABASE_PUBLIC_URL=.*|SUPABASE_PUBLIC_URL=${PUBLIC_URL}|" "${ENV_FILE}"
    sed -i "s|^API_EXTERNAL_URL=.*|API_EXTERNAL_URL=${PUBLIC_URL}/auth/v1|" "${ENV_FILE}"
    sed -i "s|^PROXY_DOMAIN=.*|PROXY_DOMAIN=${PUBLIC_URL#https://}|" "${ENV_FILE}"
  fi
  sed -i "s|^SITE_URL=.*|SITE_URL=${SITE_URL}|" "${ENV_FILE}"
  sed -i "s|^STUDIO_DEFAULT_ORGANIZATION=.*|STUDIO_DEFAULT_ORGANIZATION=DABBIR|" "${ENV_FILE}"
  sed -i "s|^STUDIO_DEFAULT_PROJECT=.*|STUDIO_DEFAULT_PROJECT=DABBIR Production|" "${ENV_FILE}"
  sed -i "s|^PGRST_DB_SCHEMAS=.*|PGRST_DB_SCHEMAS=public,graphql_public|" "${ENV_FILE}"
  sed -i "s|^PGRST_DB_MAX_ROWS=.*|PGRST_DB_MAX_ROWS=1000|" "${ENV_FILE}"
}

harden_local_services() {
  cd "${SUPABASE_ROOT}/docker"

  # Studio/database administration is intentionally not exposed via the EC2 security group.
  # Public ingress is limited by CloudFormation to 80/443; Postgres/Supavisor remain unreachable
  # from the public Internet. Administration is performed through SSM port forwarding/session.
  install -m 0700 -d "${INSTALL_ROOT}/ops"
  cat >"${INSTALL_ROOT}/ops/README" <<'EOF'
DABBIR production administration policy
- No public SSH.
- No public PostgreSQL/Supavisor.
- Use AWS Systems Manager Session Manager / port forwarding.
- Public ingress is HTTPS only after TLS proxy is configured.
- Secrets live on the host (0600) or AWS secret storage, never in Git.
EOF
}

validate_config() {
  cd "${SUPABASE_ROOT}/docker"
  docker compose config >/dev/null
  echo "Supabase ${SUPABASE_TAG} configuration validated."
}

start_stack() {
  cd "${SUPABASE_ROOT}/docker"
  docker compose pull
  docker compose up -d
  docker compose ps
}

health_check() {
  local attempts=30
  local i
  for ((i=1;i<=attempts;i++)); do
    if curl -fsS --max-time 3 http://127.0.0.1:8000/rest/v1/ >/dev/null 2>&1; then
      echo "DABBIR Supabase API gateway is responding locally."
      return 0
    fi
    sleep 2
  done
  echo "Supabase API gateway did not become healthy in time." >&2
  docker compose -f "${SUPABASE_ROOT}/docker/docker-compose.yml" ps >&2 || true
  return 1
}

main() {
  require_root
  install_packages
  checkout_supabase
  generate_env_once
  harden_local_services
  validate_config
  start_stack
  health_check
  echo "Bootstrap complete. Configure DNS/TLS before public cutover."
}

main "$@"
