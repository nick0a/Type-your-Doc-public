#!/usr/bin/env sh
set -e

if [ "${SKIP_SECRET_SCAN:-}" = "1" ]; then
  echo "SKIP_SECRET_SCAN=1 set, skipping secret scan."
  exit 0
fi

if ! command -v gitleaks >/dev/null 2>&1; then
  echo "gitleaks not found in PATH."
  echo "Install from https://github.com/gitleaks/gitleaks or set SKIP_SECRET_SCAN=1 to bypass."
  exit 1
fi

gitleaks detect --source . --no-git --redact
