#!/usr/bin/env bash
set -euo pipefail

PUBKEY='ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIKPQWlM3ZaPlhJksSip/Ct+wU0TGSjYIeW4wLsTpxsOv dabbir-falconcloud-dubai-admin-2026-09-01'
ROOT=/mnt/dabbir-root
mkdir -p "$ROOT"

cleanup() {
  set +e
  for p in run sys proc dev/pts dev; do mountpoint -q "$ROOT/$p" && umount -l "$ROOT/$p"; done
  mountpoint -q "$ROOT" && umount -l "$ROOT"
}
trap cleanup EXIT

find_root() {
  local dev
  while read -r dev; do
    [ -b "$dev" ] || continue
    mount "$dev" "$ROOT" 2>/dev/null || continue
    if [ -f "$ROOT/etc/debian_version" ] && [ -d "$ROOT/etc/ssh" ]; then
      echo "$dev"
      return 0
    fi
    umount "$ROOT" || true
  done < <(lsblk -lnpo NAME,TYPE | awk '$2=="part"{print $1}')
  return 1
}

ROOTDEV="$(find_root)" || { echo 'ERROR: Debian root partition not found.' >&2; exit 10; }
echo "DABBIR root found: $ROOTDEV"

mkdir -p "$ROOT/dev/pts" "$ROOT/proc" "$ROOT/sys" "$ROOT/run"
mount --rbind /dev "$ROOT/dev"
mount --make-rslave "$ROOT/dev"
mount -t proc proc "$ROOT/proc"
mount --rbind /sys "$ROOT/sys"
mount --make-rslave "$ROOT/sys"
mount --rbind /run "$ROOT/run"
mount --make-rslave "$ROOT/run"

if [ -e "$ROOT/etc/resolv.conf" ]; then
  cp -L "$ROOT/etc/resolv.conf" "$ROOT/etc/resolv.conf.dabbir-backup" 2>/dev/null || true
fi
cp -L /etc/resolv.conf "$ROOT/etc/resolv.conf"

mkdir -p "$ROOT/root/.ssh"
printf '%s\n' "$PUBKEY" > "$ROOT/root/.ssh/authorized_keys"
chmod 700 "$ROOT/root/.ssh"
chmod 600 "$ROOT/root/.ssh/authorized_keys"
chown -R 0:0 "$ROOT/root/.ssh"

mkdir -p "$ROOT/etc/ssh/sshd_config.d"
cat > "$ROOT/etc/ssh/sshd_config.d/99-dabbir-recovery.conf" <<'EOF'
PermitRootLogin prohibit-password
PubkeyAuthentication yes
PasswordAuthentication no
KbdInteractiveAuthentication no
EOF

chroot "$ROOT" /bin/bash -lc '
set -e
export DEBIAN_FRONTEND=noninteractive
if ! command -v sshd >/dev/null 2>&1; then
  apt-get update
  apt-get install -y openssh-server
fi
mkdir -p /run/sshd
ssh-keygen -A
systemctl unmask ssh 2>/dev/null || true
systemctl enable ssh
/usr/sbin/sshd -t
'

echo 'PASS: SSH repaired and DABBIR admin key installed.'
echo 'NEXT: In Falconcloud choose Boot from system volume, then reboot once.'
