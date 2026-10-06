#!/usr/bin/env bash
# Jalankan ./play.sh untuk langsung main AI Hand Battle di macOS atau Linux.
# Butuh Node.js (https://nodejs.org).
set -e
cd "$(dirname "$0")"

if ! command -v node >/dev/null 2>&1; then
  echo
  echo "  Node.js tidak ditemukan."
  echo "  Install dari https://nodejs.org, atau pakai aplikasi (.dmg / .AppImage) dari GitHub Actions."
  echo
  exit 1
fi

echo
echo "  Menyalakan AI Hand Battle..."
exec node scripts/serve.mjs "$@"
