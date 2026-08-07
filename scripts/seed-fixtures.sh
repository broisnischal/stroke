#!/usr/bin/env bash
#
# Seed the fixture schemas into a Postgres you already have.
#
#   scripts/seed-fixtures.sh postgis  postgres://user:pass@host:5432/db
#   scripts/seed-fixtures.sh pgvector postgres://user:pass@host:5432/db
#
# This is the sibling of scripts/fixtures.sh. That one runs the whole thing in
# Docker and is what you want on a dev machine. This one points the same SQL at
# an *existing* database — a remote instance, a managed Postgres, a container
# you already have, a second machine — where Docker isn't the right answer or
# isn't available.
#
# It needs psql on PATH and a database whose user can CREATE EXTENSION. The
# target must already have the extension available to install:
#   postgis   → the postgis and postgis_raster extensions
#   pgvector  → the vector extension
#
# The seed is NOT idempotent: it creates tables and fails if they already exist.
# That is deliberate — silently appending a second million rows to a table you
# forgot about is worse than an error. Use --drop to remove the fixture objects
# first.

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

bold() { printf '\033[1m%s\033[0m\n' "$1"; }
info() { printf '  %s\n' "$1"; }
fail() { printf '\033[31m%s\033[0m\n' "$1" >&2; exit 1; }

usage() {
  sed -n '2,24p' "${BASH_SOURCE[0]}" | sed 's/^# \{0,1\}//'
  exit "${1:-0}"
}

FIXTURE=""
DSN=""
DROP=0
for arg in "$@"; do
  case "$arg" in
    --drop) DROP=1 ;;
    -h|--help) usage 0 ;;
    postgis|pgvector) FIXTURE="$arg" ;;
    *) DSN="$arg" ;;
  esac
done

[ -n "$FIXTURE" ] || usage 1
[ -n "$DSN" ] || fail "no connection string given (try --help)"
command -v psql >/dev/null 2>&1 || fail "psql is not installed or not on PATH"

SQL_DIR="$REPO_ROOT/docker/$FIXTURE"
[ -d "$SQL_DIR" ] || fail "no SQL for '$FIXTURE' at $SQL_DIR"

# ON_ERROR_STOP is what makes a failed statement stop the run instead of leaving
# a half-seeded database that looks fine until you query it.
run_sql() { psql "$DSN" -v ON_ERROR_STOP=1 -q "$@"; }

psql "$DSN" -c 'SELECT 1' >/dev/null 2>&1 || fail "cannot connect with the given connection string"

if [ "$DROP" = "1" ]; then
  bold "Dropping existing $FIXTURE fixture objects"
  case "$FIXTURE" in
    postgis)
      run_sql -c '
        DROP MATERIALIZED VIEW IF EXISTS country_extents;
        DROP VIEW IF EXISTS city_zones;
        DROP TABLE IF EXISTS gps_pings, cities, roads, zones, districts, geom_zoo, tiles CASCADE;
        DROP SCHEMA IF EXISTS cadastre CASCADE;'
      ;;
    pgvector)
      run_sql -c '
        DROP MATERIALIZED VIEW IF EXISTS category_stats;
        DROP VIEW IF EXISTS popular_articles;
        DROP TABLE IF EXISTS articles, openai_docs, events, vector_zoo CASCADE;
        DROP SCHEMA IF EXISTS analytics CASCADE;'
      ;;
  esac
fi

bold "Seeding $FIXTURE"
info "this takes a few minutes — the tables are large on purpose"
echo

# Same files, same order, as the container's docker-entrypoint-initdb.d runs.
for file in "$SQL_DIR"/*.sql; do
  info "$(basename "$file")"
  run_sql -f "$file"
done

echo
bold 'Done'
case "$FIXTURE" in
  postgis)  info 'See docker/README.md for what is in stroke_geo and how to probe it.' ;;
  pgvector) info 'See docker/README.md for what is in stroke_vec and how to probe it.' ;;
esac
