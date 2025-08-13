#!/usr/bin/env bash
set -euo pipefail

# Config
REPO_DIR="$(cd "$(dirname "$0")/.." && pwd)"
SYSTEMD_DIR="/etc/systemd/system"

usage() {
  cat <<EOF
Usage:
  sudo scripts/install-systemd.sh [mode]

Modes:
  coretools   Install/enable pokemon-func.service (runs npm run start)
  compose     Install/enable pokemon-updater-compose.service (docker compose up -d)

Before running:
  - Edit systemd/*.service to set the correct USER and WorkingDirectory

Examples:
  sudo scripts/install-systemd.sh coretools
  sudo scripts/install-systemd.sh compose
EOF
}

if [[ "${1:-}" == "" ]]; then
  usage
  exit 1
fi

MODE="$1"

case "$MODE" in
  coretools)
    sudo cp "$REPO_DIR/systemd/pokemon-func.service" "$SYSTEMD_DIR/pokemon-func.service"
    sudo systemctl daemon-reload
    sudo systemctl enable pokemon-func
    sudo systemctl restart pokemon-func
    echo "Installed and started pokemon-func.service"
    ;;
  compose)
    sudo cp "$REPO_DIR/systemd/pokemon-updater-compose.service" "$SYSTEMD_DIR/pokemon-updater-compose.service"
    sudo systemctl daemon-reload
    sudo systemctl enable pokemon-updater-compose
    sudo systemctl restart pokemon-updater-compose
    echo "Installed and started pokemon-updater-compose.service"
    ;;
  *)
    usage
    exit 1
    ;;
esac

echo "Check status:"
echo "  sudo systemctl status pokemon-func"
echo "  sudo systemctl status pokemon-updater-compose"
