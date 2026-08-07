#!/usr/bin/env bash
#
# Spin up the PostGIS and pgvector fixture databases and seed them.
#
#   scripts/fixtures.sh              # start both, seed on first run, wait until ready
#   scripts/fixtures.sh postgis      # just the PostGIS one
#   scripts/fixtures.sh pgvector     # just the pgvector one
#   scripts/fixtures.sh status       # what is running, and how much data is in it
#   scripts/fixtures.sh logs         # follow the seed progress
#   scripts/fixtures.sh reset        # DESTROY the volumes and reseed from scratch
#   scripts/fixtures.sh down         # stop, keep the data
#
# Seeding runs once, inside the container, on first start. It takes a few
# minutes — these are deliberately large tables (1M rows each) because the point
# is to test the app against data big enough to hurt.
#
# Everything lives in docker/: the compose file and the SQL that seeds it.
# See docker/README.md for what ends up in each database and why.

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
COMPOSE_FILE="$REPO_ROOT/docker/docker-compose.yml"

# Seeding a million rows is not a 60-second job; the default would give up first.
READY_TIMEOUT_SECONDS=${READY_TIMEOUT_SECONDS:-900}

bold() { printf '\033[1m%s\033[0m\n' "$1"; }
info() { printf '  %s\n' "$1"; }
fail() { printf '\033[31m%s\033[0m\n' "$1" >&2; exit 1; }

compose() { docker compose -f "$COMPOSE_FILE" "$@"; }

require_docker() {
  command -v docker >/dev/null 2>&1 || fail "docker is not installed or not on PATH"
  docker compose version >/dev/null 2>&1 || fail "docker compose (v2) is required"
  docker info >/dev/null 2>&1 || fail "the docker daemon is not reachable — is it running?"
}

# The seed scripts print this as their last line. Polling for it, rather than for
# the container's health check, is the difference between "postgres accepts
# connections" and "the tables actually have rows in them".
ready_marker() {
  case "$1" in
    pgvector) echo '== stroke_vec: ready ==' ;;
    postgis)  echo '== stroke_geo: ready ==' ;;
  esac
}

wait_for_seed() {
  local service="$1" marker deadline
  marker="$(ready_marker "$service")"
  deadline=$(( SECONDS + READY_TIMEOUT_SECONDS ))

  info "waiting for $service to finish seeding…"
  while (( SECONDS < deadline )); do
    if compose logs "$service" 2>&1 | grep -qF "$marker"; then
      info "$service ready"
      return 0
    fi
    # A failed seed statement aborts the init script and the entrypoint gives up.
    # Surfacing it beats waiting out the full timeout on a container that is
    # never going to finish.
    if compose logs "$service" 2>&1 | grep -qE 'psql:.*ERROR:'; then
      compose logs "$service" 2>&1 | grep -E 'psql:.*ERROR:|DETAIL:|LINE [0-9]' | head -10
      fail "$service failed while seeding (see above). 'scripts/fixtures.sh reset' to start over."
    fi
    sleep 5
  done
  fail "$service did not finish seeding within ${READY_TIMEOUT_SECONDS}s — 'scripts/fixtures.sh logs' to look"
}

connection_details() {
  bold 'Connections'
  info 'pgvector  postgres://stroke:stroke@127.0.0.1:5441/stroke_vec'
  info 'postgis   postgres://stroke:stroke@127.0.0.1:5442/stroke_geo'
  echo
  info "Both images are recognised by Stroke's Docker scanner, so they also show"
  info 'up under "Docker databases" in the connection modal with the credentials'
  info 'already filled in.'
}

cmd_up() {
  local services=("$@")
  require_docker
  if [ ${#services[@]} -eq 0 ]; then services=(pgvector postgis); fi

  bold "Starting: ${services[*]}"
  compose up -d "${services[@]}"
  echo
  for service in "${services[@]}"; do
    wait_for_seed "$service"
  done
  echo
  cmd_status
  echo
  connection_details
}

cmd_status() {
  require_docker
  bold 'Containers'
  compose ps --format 'table {{.Service}}\t{{.Status}}\t{{.Ports}}' 2>/dev/null || true
  echo

  local counts='
    SELECT schemaname || $q$.$q$ || relname AS "table",
           to_char(n_live_tup, $q$FM999,999,999$q$) AS rows,
           pg_size_pretty(pg_total_relation_size(relid)) AS size
    FROM pg_stat_user_tables
    WHERE schemaname NOT IN ($q$information_schema$q$, $q$pg_catalog$q$)
    ORDER BY n_live_tup DESC LIMIT 12;'

  if docker exec stroke-pgvector pg_isready -U stroke -d stroke_vec >/dev/null 2>&1; then
    bold 'stroke_vec (pgvector)'
    docker exec stroke-pgvector psql -U stroke -d stroke_vec -v q="'" -c "$counts" 2>/dev/null || true
  fi
  if docker exec stroke-postgis pg_isready -U stroke -d stroke_geo >/dev/null 2>&1; then
    bold 'stroke_geo (PostGIS)'
    docker exec stroke-postgis psql -U stroke -d stroke_geo -v q="'" -c "$counts" 2>/dev/null || true
  fi
}

cmd_reset() {
  require_docker
  bold 'This deletes both fixture volumes and reseeds from scratch.'
  read -r -p '  Type "reset" to confirm: ' answer
  [ "$answer" = "reset" ] || fail 'cancelled'
  compose down -v
  cmd_up
}

case "${1:-up}" in
  up)        shift || true; cmd_up "$@" ;;
  pgvector)  cmd_up pgvector ;;
  postgis)   cmd_up postgis ;;
  status)    cmd_status ;;
  logs)      require_docker; compose logs -f ;;
  down)      require_docker; compose down ;;
  reset)     cmd_reset ;;
  -h|--help|help)
    sed -n '2,22p' "${BASH_SOURCE[0]}" | sed 's/^# \{0,1\}//'
    ;;
  *) fail "unknown command: $1 (try --help)" ;;
esac
