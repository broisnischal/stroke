-- Stroke fixture: PostGIS schema.
-- Covers geometry and geography, every WKB type the EWKT decoder claims plus the
-- curve types it doesn't, mixed SRIDs, Z/M dimensions, and raster.

\echo '== stroke_geo: extensions =='

CREATE EXTENSION IF NOT EXISTS postgis;
CREATE EXTENSION IF NOT EXISTS postgis_raster;
CREATE EXTENSION IF NOT EXISTS postgis_topology;
CREATE EXTENSION IF NOT EXISTS fuzzystrmatch;

\echo '== stroke_geo: tables =='

-- Points in both geometry and geography flavours over the same coordinates, so a
-- rendering difference between the two types is visible side by side.
CREATE TABLE cities (
    id         bigserial PRIMARY KEY,
    name       text NOT NULL,
    country    text NOT NULL,
    region     text,
    population integer NOT NULL,
    elevation_m integer,
    founded    date,
    geom       geometry(Point, 4326),
    geog       geography(Point, 4326),
    web_merc   geometry(Point, 3857),
    props      jsonb NOT NULL DEFAULT '{}'::jsonb
);

COMMENT ON COLUMN cities.geom  IS 'geometry(Point,4326) — planar, GiST indexed.';
COMMENT ON COLUMN cities.geog  IS 'geography(Point,4326) — spheroidal, same coordinates.';
COMMENT ON COLUMN cities.web_merc IS 'Same point reprojected, so SRID=3857 shows in the cell.';

-- Linestrings of 6-24 vertices: long WKT that has to truncate somewhere sane.
CREATE TABLE roads (
    id        bigserial PRIMARY KEY,
    name      text NOT NULL,
    class     text NOT NULL,
    lanes     smallint,
    speed_kph integer,
    toll      boolean NOT NULL DEFAULT false,
    length_m  double precision,
    geom      geometry(LineString, 4326)
);

-- Polygons with real vertex counts, plus a few with interior rings.
CREATE TABLE zones (
    id       bigserial PRIMARY KEY,
    code     text NOT NULL UNIQUE,
    kind     text NOT NULL,
    area_km2 double precision,
    tags     text[] NOT NULL DEFAULT '{}',
    geom     geometry(Polygon, 4326)
);

CREATE TABLE districts (
    id    bigserial PRIMARY KEY,
    name  text NOT NULL,
    geom  geometry(MultiPolygon, 4326)
);

-- The million-row table: point geometry at scale.
CREATE TABLE gps_pings (
    id        bigserial PRIMARY KEY,
    device_id integer     NOT NULL,
    ts        timestamptz NOT NULL,
    speed_kph double precision,
    heading   double precision,
    accuracy  real,
    fix       text,
    geom      geometry(Point, 4326)
);

-- One row per shape the decoder has to handle, named so a wrong render is
-- obvious at a glance. `geom` is untyped on purpose — mixed types in one column.
CREATE TABLE geom_zoo (
    id       serial PRIMARY KEY,
    label    text NOT NULL,
    expected text NOT NULL,
    geom     geometry,
    geog     geography
);

CREATE TABLE tiles (
    id   serial PRIMARY KEY,
    name text NOT NULL,
    rast raster
);

CREATE SCHEMA cadastre;

CREATE TABLE cadastre.parcels (
    id       bigserial PRIMARY KEY,
    parcel_no text NOT NULL,
    owner    text,
    value_usd numeric(14, 2),
    geom     geometry(Polygon, 4326),
    centroid geometry(Point, 4326)
);
