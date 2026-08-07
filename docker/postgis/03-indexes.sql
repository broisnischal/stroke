-- Stroke fixture: PostGIS indexes, built after the bulk load.

\echo '== stroke_geo: building indexes =='

SET maintenance_work_mem = '1GB';
SET max_parallel_maintenance_workers = 4;

CREATE INDEX cities_geom_gix  ON cities USING gist (geom);
CREATE INDEX cities_geog_gix  ON cities USING gist (geog);
CREATE INDEX cities_pop_idx   ON cities (population DESC);
CREATE INDEX cities_props_gin ON cities USING gin (props jsonb_path_ops);

CREATE INDEX roads_geom_gix ON roads USING gist (geom);
CREATE INDEX roads_class_idx ON roads (class, speed_kph);

CREATE INDEX zones_geom_gix  ON zones USING gist (geom);
CREATE INDEX zones_tags_gin  ON zones USING gin (tags);

CREATE INDEX districts_geom_gix ON districts USING gist (geom);

CREATE INDEX gps_pings_geom_gix ON gps_pings USING gist (geom);
CREATE INDEX gps_pings_dev_ts   ON gps_pings (device_id, ts DESC);

CREATE INDEX parcels_geom_gix ON cadastre.parcels USING gist (geom);
CREATE INDEX parcels_no_idx   ON cadastre.parcels (parcel_no);

\echo '== stroke_geo: analyze =='

VACUUM ANALYZE cities;
VACUUM ANALYZE roads;
VACUUM ANALYZE zones;
VACUUM ANALYZE districts;
VACUUM ANALYZE gps_pings;
VACUUM ANALYZE cadastre.parcels;
VACUUM ANALYZE geom_zoo;

-- A spatial join view and a matview, so the schema page has more than tables.
CREATE VIEW city_zones AS
SELECT c.id AS city_id, c.name AS city, z.code AS zone, z.kind, z.geom
FROM cities c
JOIN zones z ON ST_DWithin(c.geom, z.geom, 0.05);

CREATE MATERIALIZED VIEW country_extents AS
SELECT country,
       count(*)                     AS cities,
       sum(population)              AS population,
       ST_Extent(geom)::geometry    AS bbox,
       ST_Centroid(ST_Collect(geom)) AS centroid
FROM cities
GROUP BY country;

CREATE UNIQUE INDEX country_extents_pk ON country_extents (country);

\echo '== stroke_geo: ready =='
