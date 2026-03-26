#!/usr/bin/env bash
# scripts/run-cron-setup.sh
# Reads .env.local, substitutes ${CRON_SECRET} and ${SUPABASE_PROJECT_ID} into
# setup-cron-jobs.sql, and runs it against your linked Supabase project.
#
# Usage: bash scripts/run-cron-setup.sh
#
# Prerequisites:
#   - CRON_SECRET and SUPABASE_PROJECT_ID set in .env.local
#   - supabase CLI installed and project linked (supabase link --project-ref <ref>)

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ENV_FILE="$SCRIPT_DIR/../.env.local"
SQL_TEMPLATE="$SCRIPT_DIR/setup-cron-jobs.sql"

# ── Load .env.local ───────────────────────────────────────────────────────────
if [[ ! -f "$ENV_FILE" ]]; then
  echo "Error: .env.local not found at $ENV_FILE" >&2
  exit 1
fi

# Source the file, skipping blank lines and comment-only lines
set -a
# shellcheck disable=SC1090
source <(grep -v '^\s*#' "$ENV_FILE" | grep -v '^\s*$')
set +a

# ── Validate required vars ────────────────────────────────────────────────────
: "${CRON_SECRET:?CRON_SECRET is not set in .env.local. Generate one with: openssl rand -hex 32}"
: "${SUPABASE_PROJECT_ID:?SUPABASE_PROJECT_ID is not set in .env.local}"

# ── Substitute and execute ────────────────────────────────────────────────────
TMPFILE=$(mktemp /tmp/kart-cron-setup.XXXXXX.sql)
trap 'rm -f "$TMPFILE"' EXIT

# envsubst only replaces the two vars we care about — leaves all other ${...} untouched
envsubst '${CRON_SECRET} ${SUPABASE_PROJECT_ID}' < "$SQL_TEMPLATE" > "$TMPFILE"

echo "Setting up cron jobs for project: $SUPABASE_PROJECT_ID"
supabase db execute --file "$TMPFILE"
echo "Done."
