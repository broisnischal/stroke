#!/usr/bin/env bash
# One container per dialect, all carrying the same `shop` schema.
#
#   scripts/dialects.sh up      · start everything, seed what the image cannot
#   scripts/dialects.sh status  · what is up and how many rows it holds
#   scripts/dialects.sh verify  · walk every engine through Stroke's own code
#   scripts/dialects.sh down    · stop (add --volumes to discard the data)
#
# Postgres, MySQL, MariaDB and ClickHouse seed themselves from
# docker/seed/<engine>. CockroachDB, Redis and SQL Server have no init-dir, so
# `up` seeds them here once they answer.
set -euo pipefail

cd "$(dirname "$0")/.."
COMPOSE=(docker compose -f docker/dialects.yml)
SA_PASS='Stroke!passw0rd'

step() { printf '\033[1m→ %s\033[0m\n' "$*"; }
ok()   { printf '  \033[32m✓\033[0m %s\n' "$*"; }
warn() { printf '  \033[33m!\033[0m %s\n' "$*"; }

wait_healthy() {
  local svc=$1 tries=${2:-60} cid
  cid=$("${COMPOSE[@]}" ps -q "$svc" 2>/dev/null || true)
  [ -n "$cid" ] || { warn "$svc is not running"; return 1; }
  for _ in $(seq "$tries"); do
    case "$(docker inspect -f '{{.State.Health.Status}}' "$cid" 2>/dev/null || echo none)" in
      healthy) return 0 ;;
      none)    return 0 ;;
    esac
    sleep 2
  done
  warn "$svc never reported healthy"
  return 1
}

seed_cockroach() {
  # Cockroach has no init-dir. Its dialect is close enough to Postgres that the
  # same file works, bar `serial` defaults and ANALYZE - hence the edits.
  docker exec -i stroke-test-cockroach cockroach sql --insecure -d defaultdb >/dev/null <<'SQL'
SELECT 1;
SQL
  sed -e 's/timestamptz/TIMESTAMPTZ/g' -e '/^ANALYZE;$/d' docker/seed/postgres/01-shop.sql \
    | docker exec -i stroke-test-cockroach cockroach sql --insecure -d defaultdb >/dev/null 2>&1 \
    && ok 'cockroach seeded' || warn 'cockroach already seeded (or refused the schema)'
}

seed_redis() {
  # Redis has no tables; Stroke lists keys. Seed a spread of types so each row
  # kind in the key browser has an example.
  docker exec stroke-test-redis redis-cli -n 0 FLUSHDB >/dev/null
  docker exec stroke-test-redis redis-cli -n 0 MSET \
    'shop:customer:1' 'Ada Lovelace' \
    'shop:customer:2' 'Alan Turing' \
    'shop:product:KB-001' 'Mechanical keyboard' >/dev/null
  docker exec stroke-test-redis redis-cli -n 0 HSET 'shop:order:1' \
    customer 1 status shipped total 208.50 >/dev/null
  docker exec stroke-test-redis redis-cli -n 0 RPUSH 'shop:cart:1' KB-001 MS-002 >/dev/null
  docker exec stroke-test-redis redis-cli -n 0 SADD 'shop:tags' input desk display cable >/dev/null
  docker exec stroke-test-redis redis-cli -n 0 ZADD 'shop:bestsellers' 3 KB-001 2 CB-004 1 MN-003 >/dev/null
  ok 'redis seeded'
}

seed_mssql() {
  local sqlcmd=/opt/mssql-tools18/bin/sqlcmd
  docker exec stroke-test-mssql "$sqlcmd" -S localhost -U sa -P "$SA_PASS" -C -b -Q "
    IF DB_ID('shop') IS NULL CREATE DATABASE shop;" >/dev/null
  docker exec -i stroke-test-mssql "$sqlcmd" -S localhost -U sa -P "$SA_PASS" -C -b -d shop >/dev/null <<'SQL'
IF OBJECT_ID('dbo.order_items') IS NOT NULL DROP TABLE dbo.order_items;
IF OBJECT_ID('dbo.orders') IS NOT NULL DROP TABLE dbo.orders;
IF OBJECT_ID('dbo.products') IS NOT NULL DROP TABLE dbo.products;
IF OBJECT_ID('dbo.customers') IS NOT NULL DROP TABLE dbo.customers;
CREATE TABLE dbo.customers (
  id INT IDENTITY(1,1) PRIMARY KEY, email NVARCHAR(255) NOT NULL UNIQUE,
  full_name NVARCHAR(255) NOT NULL, signed_up DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME(),
  is_active BIT NOT NULL DEFAULT 1);
CREATE TABLE dbo.products (
  id INT IDENTITY(1,1) PRIMARY KEY, sku NVARCHAR(32) NOT NULL UNIQUE,
  name NVARCHAR(255) NOT NULL, price DECIMAL(10,2) NOT NULL,
  metadata NVARCHAR(MAX), created_at DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME());
CREATE TABLE dbo.orders (
  id INT IDENTITY(1,1) PRIMARY KEY,
  customer_id INT NOT NULL REFERENCES dbo.customers(id),
  placed_at DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME(),
  status NVARCHAR(32) NOT NULL DEFAULT 'pending', total DECIMAL(10,2) NOT NULL);
CREATE TABLE dbo.order_items (
  order_id INT NOT NULL REFERENCES dbo.orders(id),
  product_id INT NOT NULL REFERENCES dbo.products(id),
  quantity INT NOT NULL, unit_price DECIMAL(10,2) NOT NULL,
  PRIMARY KEY (order_id, product_id));
INSERT INTO dbo.customers (email, full_name, is_active) VALUES
  ('ada@example.com','Ada Lovelace',1),('alan@example.com','Alan Turing',1),
  ('grace@example.com','Grace Hopper',1),('edsger@example.com','Edsger Dijkstra',0),
  ('barbara@example.com','Barbara Liskov',1);
INSERT INTO dbo.products (sku, name, price, metadata) VALUES
  ('KB-001','Mechanical keyboard',129.00,'{"switches":"brown"}'),
  ('MS-002','Trackball mouse',79.50,'{"buttons":6}'),
  ('MN-003','27" display',449.99,'{"hz":144}'),
  ('CB-004','USB-C cable',19.00,'{"length_m":2}'),
  ('DK-005','Docking station',219.00,'{"ports":11}');
INSERT INTO dbo.orders (customer_id, status, total) VALUES
  (1,'shipped',208.50),(2,'pending',449.99),(3,'shipped',19.00),
  (1,'cancelled',219.00),(5,'pending',148.00);
INSERT INTO dbo.order_items (order_id, product_id, quantity, unit_price) VALUES
  (1,1,1,129.00),(1,2,1,79.50),(2,3,1,449.99),(3,4,1,19.00),
  (4,5,1,219.00),(5,1,1,129.00),(5,4,1,19.00);
SQL
  ok 'mssql seeded'
}

case "${1:-up}" in
  up)
    step 'starting containers'
    "${COMPOSE[@]}" up -d
    for svc in postgres mysql mariadb clickhouse redis cockroach; do
      wait_healthy "$svc" && ok "$svc healthy" || true
    done
    step 'seeding the engines without an init-dir'
    seed_cockroach || true
    seed_redis || true
    step 'waiting for sql server (emulated on arm64, give it a minute)'
    if wait_healthy mssql 60; then seed_mssql || true; else warn 'skipping mssql seed'; fi
    step 'done'
    "$0" status
    ;;

  status)
    printf '%-12s %-24s %-8s %s\n' ENGINE ADDRESS STATE ROWS
    row() { printf '%-12s %-24s %-8s %s\n' "$1" "$2" "$3" "$4"; }
    up() { [ -n "$("${COMPOSE[@]}" ps -q "$1" 2>/dev/null)" ] && echo up || echo down; }

    row postgres  '127.0.0.1:55432/shop' "$(up postgres)" \
      "$(docker exec stroke-test-postgres psql -U stroke -d shop -tAc \
         'SELECT count(*) FROM shop.products' 2>/dev/null || echo '-')"
    row cockroach '127.0.0.1:56257/defaultdb' "$(up cockroach)" \
      "$(docker exec stroke-test-cockroach cockroach sql --insecure -d defaultdb --format=csv \
         -e 'SELECT count(*) FROM shop.products' 2>/dev/null | tail -1 || echo '-')"
    row mysql     '127.0.0.1:53306/shop' "$(up mysql)" \
      "$(docker exec stroke-test-mysql mysql -uroot -pstroke -N -B -e \
         'SELECT count(*) FROM shop.products' 2>/dev/null | tail -1 || echo '-')"
    row mariadb   '127.0.0.1:53307/shop' "$(up mariadb)" \
      "$(docker exec stroke-test-mariadb mariadb -uroot -pstroke -N -B -e \
         'SELECT count(*) FROM shop.products' 2>/dev/null | tail -1 || echo '-')"
    row clickhouse '127.0.0.1:58123/shop' "$(up clickhouse)" \
      "$(docker exec stroke-test-clickhouse clickhouse-client -u stroke --password stroke \
         -q 'SELECT count() FROM shop.products' 2>/dev/null || echo '-')"
    row redis     '127.0.0.1:56379/0' "$(up redis)" \
      "$(docker exec stroke-test-redis redis-cli -n 0 DBSIZE 2>/dev/null || echo '-') keys"
    row mssql     '127.0.0.1:51433/shop' "$(up mssql)" \
      "$(docker exec stroke-test-mssql /opt/mssql-tools18/bin/sqlcmd -S localhost -U sa \
         -P "$SA_PASS" -C -h -1 -W -d shop -Q 'SET NOCOUNT ON; SELECT count(*) FROM dbo.products' \
         2>/dev/null | head -1 || echo '-')"
    ;;

  verify)
    step 'walking every engine through Stroke’s own schema code'
    (cd src-tauri && cargo test --lib dialect_matrix -- --ignored --nocapture)
    ;;

  down) shift; "${COMPOSE[@]}" down "$@" ;;
  *) sed -n '2,10p' "$0"; exit 2 ;;
esac
