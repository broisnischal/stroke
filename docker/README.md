# Postgres extension fixtures

Two throwaway Postgres containers for exercising Stroke against extension types
that the SQLx driver hands back as raw bytes — pgvector's `vector`/`halfvec`/
`sparsevec` and PostGIS's `geometry`/`geography`. Decoding for these lives in
`src-tauri/src/db/pg_ext_types.rs`.

```sh
npm run fixtures            # start both, seed, wait until the data is actually there
npm run fixtures:status     # what is running and how many rows are in it
npm run fixtures:reset      # destroy the volumes and reseed from scratch
```

`scripts/fixtures.sh` wraps the compose file and waits for the seed's own "ready"
marker rather than the container health check — the difference between "Postgres
accepts connections" and "the tables have rows in them".

To seed a Postgres you already have instead of a container (a remote box, a
managed instance, a second machine), point the same SQL at it:

```sh
scripts/seed-fixtures.sh postgis  postgres://user:pass@host:5432/db
scripts/seed-fixtures.sh pgvector postgres://user:pass@host:5432/db --drop
```

Geometry is scattered around 40 real metropolitan areas, not spread evenly over
the globe. Evenly-spread synthetic points form a diagonal lattice that is all you
can see on a map, which makes the fixture useless for judging whether the
renderer is right — and gives server-side clustering nothing to cluster.

Seeding runs once, on first start, and finishes when the log prints
`== stroke_vec: ready ==` / `== stroke_geo: ready ==`.

# Dialect fixtures

`docker/dialects.yml` is the other stack: one container per engine Stroke can
talk to, every one carrying the same `shop` schema, so the sidebar, grid, DDL
and object pages can be compared across engines instead of one at a time.

```sh
scripts/dialects.sh up        # start everything, seed what the image cannot
scripts/dialects.sh status    # what is up and how many rows it holds
scripts/dialects.sh verify    # walk every engine through Stroke's own code
scripts/dialects.sh down      # stop; add --volumes to discard the data
```

| engine | address | user | password |
| --- | --- | --- | --- |
| PostgreSQL | `127.0.0.1:55432/shop` | `stroke` | `stroke` |
| CockroachDB | `127.0.0.1:56257/defaultdb` | `root` | *(none)* |
| MySQL | `127.0.0.1:53306/shop` | `root` | `stroke` |
| MariaDB | `127.0.0.1:53307/shop` | `root` | `stroke` |
| ClickHouse | `127.0.0.1:58123/shop` | `stroke` | `stroke` |
| Redis | `127.0.0.1:56379/0` | — | *(none)* |
| SQL Server | `127.0.0.1:51433/shop` | `sa` | `Stroke!passw0rd` |

Postgres, MySQL, MariaDB and ClickHouse seed themselves from
`docker/seed/<engine>`. CockroachDB, Redis and SQL Server have no init-dir, so
`scripts/dialects.sh up` seeds them once they answer.

Two notes that are easy to trip over:

- **SQL Server, leave Encrypt off.** Its self-signed certificate is X.509 v1,
  and the rustls backend rejects that under TLS 1.3 even with "Trust server
  certificate" on. `db/mssql.rs` says so in the error message now.
- **Redis has no table list.** `db::redis::list_tables` is a documented stub -
  keyspace browsing is not built yet. The fixture still seeds `shop:*` keys of
  every Redis type, so there is something to browse the day it lands.

## verify

`scripts/dialects.sh verify` runs `src-tauri/src/db/dialect_matrix.rs`: for each
engine it calls the same `list_schemas` / `list_tables` the sidebar calls, and
prints a row per engine. An engine that is not running is skipped; an engine
that IS running and answers wrongly fails.

It exists because a MySQL connection with tables in it listed an empty sidebar
and nothing caught it: `information_schema` hands `TABLE_NAME` back as
VARBINARY, sqlx refused the `String` decode, and the `filter_map(…ok()?)` around
it dropped every row - no error, nothing in a log. Every other test in the crate
either ran against SQLite or asserted on a string of SQL rather than on what a
server sends back.


## Connections

Both images are recognised by Stroke's Docker scanner, so they appear under
**Docker databases** in the connection modal with credentials already filled in.
Manually:

| | pgvector | PostGIS |
|---|---|---|
| host / port | `127.0.0.1:5441` | `127.0.0.1:5442` |
| database | `stroke_vec` | `stroke_geo` |
| user / password | `stroke` / `stroke` | `stroke` / `stroke` |

```
postgres://stroke:stroke@127.0.0.1:5441/stroke_vec
postgres://stroke:stroke@127.0.0.1:5442/stroke_geo
```

## What's in `stroke_vec` (pgvector)

| Table | Rows | What it tests |
|---|---|---|
| `articles` | 100,000 | `vector(384)` + `halfvec(384)` + `sparsevec(2048)` on the same rows, alongside `text[]`, `jsonb`, `numeric`, `bit(16)`. HNSW indexes on both dense columns. |
| `openai_docs` | 10,000 | `vector(1536)` — wide cells, where a value has to be viewed rather than read inline. IVFFlat index. |
| `events` | 1,000,000 | Row count at scale with a narrow `vector(8)`: scrolling, counting, sorting, filtering. |
| `vector_zoo` | 10 | Values that break naive formatters — zeros, negatives, `0.001` (prints as `0.001000000047497451` if an f32 is widened to f64), 1e10, subnormals, seven-digit precision, all-NULL. |
| `analytics.query_log` | 25,000 | A second schema, plus `bigint[]`. |
| `popular_articles` | view | Relation kinds beyond tables. |
| `category_stats` | matview | `avg(embedding)` centroids per category. |

Useful probes:

```sql
-- ANN search should use the HNSW index
EXPLAIN ANALYZE
SELECT id, title, embedding <=> (SELECT embedding FROM articles WHERE id = 1) AS dist
FROM articles ORDER BY dist LIMIT 10;

-- the formatter cases, all in one screen
SELECT label, note, v3, h3, s10, b8, vb FROM vector_zoo ORDER BY id;
```

## What's in `stroke_geo` (PostGIS)

| Table | Rows | What it tests |
|---|---|---|
| `cities` | 60,000 | `geometry(Point,4326)`, the same point as `geography`, and again reprojected to SRID 3857. |
| `roads` | 30,000 | `geometry(LineString,4326)`, 6–24 vertices each — long WKT. |
| `zones` | 15,000 | `geometry(Polygon,4326)`; every seventh has an interior ring. |
| `districts` | 3,000 | `geometry(MultiPolygon,4326)`. |
| `cadastre.parcels` | 200,000 | Second schema, polygon + point columns side by side. |
| `gps_pings` | 1,000,000 | Point geometry at scale. |
| `geom_zoo` | 32 | One row per shape, with an `expected` column stating what the cell should read. Covers POINT/LINESTRING/POLYGON/MULTI*/GEOMETRYCOLLECTION, Z/M/ZM, EMPTY of each, nested collections, missing SRID, SRID 3857, a 500-vertex line, and the curve/surface types (`CIRCULARSTRING`, `CURVEPOLYGON`, `TIN`, `POLYHEDRALSURFACE`, …) that the decoder does **not** model and should fall back to a hex preview for. |
| `tiles` | 120 | `raster` — no decoder, should degrade to a hex preview rather than a blank cell. |
| `city_zones` | view | Spatial join. |
| `country_extents` | matview | `ST_Extent` bbox + centroid per country. |

Useful probes:

```sql
-- the decoder's whole surface, with the expected rendering next to it
SELECT label, expected, geom, geog FROM geom_zoo ORDER BY id;

-- spatial index in use
EXPLAIN ANALYZE
SELECT count(*) FROM gps_pings
WHERE ST_DWithin(geom, ST_SetSRID(ST_MakePoint(12.5, 41.9), 4326), 1.0);
```

## Reset

```sh
docker compose -f docker/docker-compose.yml down -v   # -v drops the data, forcing a reseed
```
