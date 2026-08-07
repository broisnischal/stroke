-- Stroke fixture: PostGIS data.
--
-- Positions are scattered around real metropolitan areas rather than spread
-- evenly over the globe. A modular placement like `(g * 137) % 36000` is faster
-- to write, but it lays every row on a diagonal lattice — and on a map that
-- lattice is all you see, which makes the fixture useless for judging whether
-- the *renderer* is right. Clustered data also exercises the parts that matter:
-- server-side clustering has something to cluster, and zooming in actually
-- changes what is on screen.

CREATE TEMP TABLE _metro (
    id int PRIMARY KEY, name text, country text, lon float8, lat float8, pop int
);
INSERT INTO _metro (id, name, country, lon, lat, pop) VALUES
 ( 0,'Tokyo','JP',139.6917,35.6895,37400068),   ( 1,'Delhi','IN',77.1025,28.7041,28514000),
 ( 2,'Shanghai','CN',121.4737,31.2304,25582000),( 3,'Sao Paulo','BR',-46.6333,-23.5505,21650000),
 ( 4,'Mexico City','MX',-99.1332,19.4326,21581000),( 5,'Cairo','EG',31.2357,30.0444,20076000),
 ( 6,'Mumbai','IN',72.8777,19.0760,19980000),   ( 7,'Beijing','CN',116.4074,39.9042,19618000),
 ( 8,'Dhaka','BD',90.4125,23.8103,19578000),    ( 9,'Osaka','JP',135.5023,34.6937,19281000),
 (10,'New York','US',-74.0060,40.7128,18819000),(11,'Karachi','PK',67.0099,24.8607,15400000),
 (12,'Buenos Aires','AR',-58.3816,-34.6037,14967000),(13,'Istanbul','TR',28.9784,41.0082,14751000),
 (14,'Kolkata','IN',88.3639,22.5726,14681000),  (15,'Manila','PH',120.9842,14.5995,13482000),
 (16,'Lagos','NG',3.3792,6.5244,13463000),      (17,'Rio de Janeiro','BR',-43.1729,-22.9068,13293000),
 (18,'Tianjin','CN',117.1901,39.1252,13215000), (19,'Kinshasa','CD',15.2663,-4.4419,13171000),
 (20,'Guangzhou','CN',113.2644,23.1291,12638000),(21,'Los Angeles','US',-118.2437,34.0522,12458000),
 (22,'Moscow','RU',37.6173,55.7558,12410000),   (23,'Shenzhen','CN',114.0579,22.5431,11908000),
 (24,'Lahore','PK',74.3587,31.5204,11738000),   (25,'Bangalore','IN',77.5946,12.9716,11440000),
 (26,'Paris','FR',2.3522,48.8566,10901000),     (27,'Bogota','CO',-74.0721,4.7110,10574000),
 (28,'Jakarta','ID',106.8456,-6.2088,10517000), (29,'Chennai','IN',80.2707,13.0827,10456000),
 (30,'Lima','PE',-77.0428,-12.0464,10391000),   (31,'Bangkok','TH',100.5018,13.7563,10156000),
 (32,'Seoul','KR',126.9780,37.5665,9963000),    (33,'Nagoya','JP',136.9066,35.1815,9507000),
 (34,'Hyderabad','IN',78.4867,17.3850,9482000), (35,'London','GB',-0.1276,51.5074,9046000),
 (36,'Tehran','IR',51.3890,35.6892,8896000),    (37,'Chicago','US',-87.6298,41.8781,8864000),
 (38,'Chengdu','CN',104.0665,30.5728,8813000),  (39,'Nanjing','CN',118.7969,32.0603,8245000),
 (40,'Wuhan','CN',114.3055,30.5928,8176000),    (41,'Ho Chi Minh City','VN',106.6297,10.8231,8145000),
 (42,'Luanda','AO',13.2343,-8.8390,7774000),    (43,'Ahmedabad','IN',72.5714,23.0225,7681000),
 (44,'Kuala Lumpur','MY',101.6869,3.1390,7564000),(45,'Hong Kong','HK',114.1694,22.3193,7429000),
 (46,'Dongguan','CN',113.7518,23.0207,7360000), (47,'Hangzhou','CN',120.1551,30.2741,7236000),
 (48,'Riyadh','SA',46.6753,24.7136,6907000),    (49,'Baghdad','IQ',44.3661,33.3152,6812000),
 (50,'Santiago','CL',-70.6693,-33.4489,6680000),(51,'Toronto','CA',-79.3832,43.6532,6082000),
 (52,'Madrid','ES',-3.7038,40.4168,6497000),    (53,'Singapore','SG',103.8198,1.3521,5792000),
 (54,'Johannesburg','ZA',28.0473,-26.2041,5486000),(55,'Barcelona','ES',2.1734,41.3851,5494000),
 (56,'Saint Petersburg','RU',30.3351,59.9311,5468000),(57,'Yangon','MM',96.1951,16.8661,5157000),
 (58,'Alexandria','EG',29.9187,31.2001,5086000),(59,'Guadalajara','MX',-103.3496,20.6597,5023000),
 (60,'Ankara','TR',32.8597,39.9334,5017000),    (61,'Melbourne','AU',144.9631,-37.8136,4968000),
 (62,'Sydney','AU',151.2093,-33.8688,4859000),  (63,'Nairobi','KE',36.8219,-1.2921,4735000),
 (64,'Monterrey','MX',-100.3161,25.6866,4712000),(65,'Cape Town','ZA',18.4241,-33.9249,4618000),
 (66,'Berlin','DE',13.4050,52.5200,3557000),    (67,'Casablanca','MA',-7.5898,33.5731,3752000),
 (68,'Houston','US',-95.3698,29.7604,2320000),  (69,'Addis Ababa','ET',38.7469,9.0320,4400000),
 (70,'Rome','IT',12.4964,41.9028,4234000),      (71,'Dar es Salaam','TZ',39.2083,-6.7924,6048000),
 (72,'Miami','US',-80.1918,25.7617,6157000),    (73,'Belo Horizonte','BR',-43.9345,-19.9167,5972000),
 (74,'Khartoum','SD',32.5599,15.5007,5678000),  (75,'Philadelphia','US',-75.1652,39.9526,5695000),
 (76,'Dallas','US',-96.7970,32.7767,6301000),   (77,'Atlanta','US',-84.3880,33.7490,5572000),
 (78,'Washington','US',-77.0369,38.9072,5207000),(79,'Boston','US',-71.0589,42.3601,4309000),
 (80,'Phoenix','US',-112.0740,33.4484,4489000), (81,'San Francisco','US',-122.4194,37.7749,3603000),
 (82,'Seattle','US',-122.3321,47.6062,3480000), (83,'Montreal','CA',-73.5674,45.5019,4221000),
 (84,'Vancouver','CA',-123.1207,49.2827,2581000),(85,'Milan','IT',9.1900,45.4642,3140000),
 (86,'Athens','GR',23.7275,37.9838,3153000),    (87,'Lisbon','PT',-9.1393,38.7223,2957000),
 (88,'Vienna','AT',16.3738,48.2082,2400000),    (89,'Warsaw','PL',21.0122,52.2297,1783000),
 (90,'Amsterdam','NL',4.9041,52.3676,1149000),  (91,'Brussels','BE',4.3517,50.8503,2081000),
 (92,'Zurich','CH',8.5417,47.3769,1395000),     (93,'Stockholm','SE',18.0686,59.3293,1633000),
 (94,'Oslo','NO',10.7522,59.9139,1027000),      (95,'Copenhagen','DK',12.5683,55.6761,1336000),
 (96,'Dublin','IE',-6.2603,53.3498,1215000),    (97,'Kathmandu','NP',85.3240,27.7172,1442000),
 (98,'Colombo','LK',79.8612,6.9271,5648000),    (99,'Auckland','NZ',174.7633,-36.8485,1657000);

/*
 * Offset from a metro centre, in degrees, derived from the row number.
 *
 * This deliberately does NOT use random(). The placements below sit in LATERAL
 * subqueries that reference only the joined metro row, and Postgres memoizes
 * those: the expression is evaluated once per distinct metro and reused for
 * every row that joins to it, so `random()` produced ONE point per city and
 * stacked six hundred rows on top of each other. Deriving the offset from the
 * row number instead makes the subquery depend on the row, which is both
 * correct and reproducible — the same fixture every time it is seeded.
 *
 * Two hashes summed approximate a normal, putting most rows near the centre
 * with a tail out to the suburbs: the shape real point data has, and the shape
 * that gives a density map something to show.
 *
 * The hash must be `hashtextextended`, not arithmetic of the form
 * `seed * A + B`. A linear congruential step is linear in the seed, so deriving
 * x from one and y from another makes y an affine function of x: every row lands
 * on a straight line. It is invisible at world zoom and unmistakable the moment
 * you zoom into a city — the whole layer draws as one diagonal streak.
 */
CREATE OR REPLACE FUNCTION _jitter(seed bigint, salt int, spread float8) RETURNS float8 AS $$
    SELECT ((a % 1000000)::float8 / 1000000.0 + (b % 1000000)::float8 / 1000000.0 - 1.0) * spread
    FROM (
        SELECT abs(hashtextextended(seed::text || ':' || salt::text, 11) % 1000000) AS a,
               abs(hashtextextended(seed::text || ':' || salt::text, 97) % 1000000) AS b
    ) h;
$$ LANGUAGE sql IMMUTABLE;

\echo '== stroke_geo: seeding cities (60k) =='

INSERT INTO cities (name, country, region, population, elevation_m, founded, geom, geog, web_merc, props)
SELECT
    m.name || ' ' || (ARRAY['Central', 'North', 'South', 'East', 'West', 'Old Town',
                            'Harbour', 'Heights', 'Park', 'Riverside'])[1 + g % 10]
        || ' ' || (1 + g / 1000),
    m.country,
    (ARRAY['coastal', 'inland', 'alpine', 'delta', 'plateau'])[1 + g % 5],
    -- District population, derived from the real metro figure so filtering on
    -- population orders the map the way the real world does.
    GREATEST(500, (m.pop / 60.0 * (0.4 + random()))::int),
    (random() * 3500)::int - 100,
    date '1000-01-01' + (g % 360000),
    p.pt,
    p.pt::geography,
    ST_Transform(p.pt, 3857),
    jsonb_build_object(
        'timezone', (ARRAY['UTC', 'CET', 'JST', 'IST', 'EST'])[1 + g % 5],
        'capital', g % 211 = 0,
        'iso', jsonb_build_object('a2', (ARRAY['IT', 'FR', 'DE'])[1 + g % 3])
    )
FROM generate_series(1, 60000) g
JOIN _metro m ON m.id = g % 100
CROSS JOIN LATERAL (
    SELECT ST_SetSRID(
        ST_MakePoint(m.lon + _jitter(g, 1, 2.2), m.lat + _jitter(g, 2, 1.6)), 4326
    ) AS pt
) p;

\echo '== stroke_geo: seeding roads (30k linestrings) =='

INSERT INTO roads (name, class, lanes, speed_kph, toll, length_m, geom)
SELECT
    (ARRAY['A', 'E', 'SS', 'SP', 'M'])[1 + g % 5] || (1 + g % 999)
        || ' ' || (ARRAY['bypass', 'link', 'ring', 'spur', 'corridor'])[1 + g % 5],
    (ARRAY['motorway', 'trunk', 'primary', 'secondary', 'residential'])[1 + g % 5],
    (1 + g % 4)::smallint,
    (ARRAY[30, 50, 70, 90, 110, 130])[1 + g % 6],
    g % 9 = 0,
    NULL,
    l.line
FROM generate_series(1, 30000) g
JOIN _metro m ON m.id = g % 100
CROSS JOIN LATERAL (SELECT m.lon + _jitter(g, 3, 1.4) AS lon0, m.lat + _jitter(g, 4, 1.0) AS lat0) o
CROSS JOIN LATERAL (
    -- Each road walks from its start on a heading that turns a little at every
    -- vertex, so the result meanders like a road instead of running dead straight.
    -- A fixed step in x and y just draws a set of parallel diagonals, which is
    -- what a road layer must not look like.
    SELECT ST_SetSRID(ST_MakeLine(array_agg(pt ORDER BY k)), 4326) AS line
    FROM generate_series(0, 5 + g % 19) k
    CROSS JOIN LATERAL (
        SELECT ST_MakePoint(
            o.lon0 + 0.006 * SUM(cos(_jitter(g, 20 + kk, 3.14159))) OVER (ORDER BY kk),
            o.lat0 + 0.006 * SUM(sin(_jitter(g, 20 + kk, 3.14159))) OVER (ORDER BY kk)
        ) AS pt
        FROM generate_series(0, k) kk
        ORDER BY kk DESC
        LIMIT 1
    ) q
) l;

UPDATE roads SET length_m = round(ST_Length(geom::geography)::numeric, 2);

\echo '== stroke_geo: seeding zones (15k polygons, some with holes) =='

INSERT INTO zones (code, kind, area_km2, tags, geom)
SELECT
    'Z-' || lpad(g::text, 6, '0'),
    (ARRAY['residential', 'industrial', 'park', 'protected', 'commercial'])[1 + g % 5],
    NULL,
    (ARRAY['zoning', 'draft', 'approved', 'expired', 'review'])[1 + g % 5 : 2 + g % 5],
    CASE WHEN g % 7 = 0
         -- Every seventh zone carries an interior ring, which is the case a
         -- ring-count-blind polygon reader gets wrong.
         THEN ST_MakePolygon(
                  ST_ExteriorRing(ST_Buffer(b.pt, 0.05, 8)),
                  ARRAY[ST_ExteriorRing(ST_Buffer(b.pt, 0.015, 8))]
              )
         ELSE ST_Buffer(b.pt, 0.02 + (g % 5) * 0.01, 6)
    END
FROM generate_series(1, 15000) g
JOIN _metro m ON m.id = g % 100
CROSS JOIN LATERAL (
    SELECT ST_SetSRID(
        ST_MakePoint(m.lon + _jitter(g, 5, 1.1), m.lat + _jitter(g, 6, 0.8)), 4326
    ) AS pt
) b;

UPDATE zones SET area_km2 = round((ST_Area(geom::geography) / 1e6)::numeric, 4);

\echo '== stroke_geo: seeding districts (3k multipolygons) =='

INSERT INTO districts (name, geom)
SELECT
    (ARRAY['Harbour', 'Old Town', 'University', 'Riverside', 'Foundry',
           'Orchard', 'Beacon', 'Quarry'])[1 + g % 8] || ' District ' || g,
    ST_Multi(ST_Collect(ARRAY[
        ST_Buffer(ST_SetSRID(ST_MakePoint(c.lon, c.lat), 4326), 0.03, 6),
        ST_Buffer(ST_SetSRID(ST_MakePoint(c.lon + 0.5, c.lat + 0.4), 4326), 0.02, 6),
        ST_Buffer(ST_SetSRID(ST_MakePoint(c.lon - 0.6, c.lat - 0.3), 4326), 0.025, 6)
    ]))
FROM generate_series(1, 3000) g
JOIN _metro m ON m.id = g % 100
CROSS JOIN LATERAL (
    SELECT m.lon + _jitter(g, 7, 0.9) AS lon, m.lat + _jitter(g, 8, 0.7) AS lat
) c;

\echo '== stroke_geo: seeding cadastre.parcels (200k) =='

INSERT INTO cadastre.parcels (parcel_no, owner, value_usd, geom, centroid)
SELECT
    to_char(g, 'FM0000000') || '/' || (1 + g % 12),
    (ARRAY['Hopper Holdings', 'Lovelace Trust', 'Turing Estate', 'Liskov & Co',
           'Perlman Group', NULL])[1 + g % 6],
    round((25000 + random() * 3000000)::numeric, 2),
    ST_MakeEnvelope(c.lon, c.lat, c.lon + 0.002, c.lat + 0.0015, 4326),
    ST_SetSRID(ST_MakePoint(c.lon + 0.001, c.lat + 0.00075), 4326)
FROM generate_series(1, 200000) g
JOIN _metro m ON m.id = g % 100
-- A cadastre is genuinely a tiling: parcels abut, in blocks, separated by
-- streets. So this layer keeps a lattice where the others do not — but it has to
-- be a COMPLETE one. Deriving the column from `g / 40` while the metro join was
-- `g % 100` meant the stride and the group size shared a factor, so each city
-- received only every other column and the layer drew as vertical stripes.
--
-- Indexing off the row's position *within its own city* is what makes the tiling
-- complete, and it stays correct if the number of cities changes again.
CROSS JOIN LATERAL (SELECT (g - 1) / 100 AS idx) i
CROSS JOIN LATERAL (
    SELECT (i.idx % 45)::int AS col, ((i.idx / 45) % 45)::int AS row
) rc
CROSS JOIN LATERAL (
    -- Every tenth line is a street, so the block structure reads as a town
    -- rather than as graph paper.
    SELECT m.lon + rc.col * 0.0022 + (rc.col / 10) * 0.0018 - 0.055 AS lon,
           m.lat + rc.row * 0.0016 + (rc.row / 10) * 0.0013 - 0.040 AS lat
) c;

\echo '== stroke_geo: seeding gps_pings (1,000,000) =='

INSERT INTO gps_pings (device_id, ts, speed_kph, heading, accuracy, fix, geom)
SELECT
    1 + g % 4000,
    timestamptz '2024-03-01 00:00:00+00' + (g * interval '15 seconds'),
    round((random() * 140)::numeric, 1)::float8,
    round((random() * 360)::numeric, 2)::float8,
    (2 + random() * 30)::real,
    (ARRAY['gps', 'gps+glonass', 'network', 'fused'])[1 + g % 4],
    ST_SetSRID(ST_MakePoint(m.lon + _jitter(g, 9, 1.8), m.lat + _jitter(g, 10, 1.3)), 4326)
FROM generate_series(1, 1000000) g
JOIN _metro m ON m.id = g % 100;

\echo '== stroke_geo: seeding tiles (raster) =='

INSERT INTO tiles (name, rast)
SELECT
    'tile-' || i,
    ST_AddBand(
        ST_MakeEmptyRaster(64, 64, -180 + i * 2.0, 80.0, 0.5, -0.5, 0, 0, 4326),
        '8BUI'::text, (i * 7) % 256, 0
    )
FROM generate_series(1, 120) i;

\echo '== stroke_geo: seeding geom_zoo =='

INSERT INTO geom_zoo (label, expected, geom) VALUES
    ('point',            'SRID=4326;POINT(30 10)',          ST_GeomFromEWKT('SRID=4326;POINT(30 10)')),
    ('point_no_srid',    'POINT(30 10) — no SRID prefix',   ST_GeomFromText('POINT(30 10)')),
    ('point_3857',       'SRID=3857;POINT(...)',            ST_GeomFromEWKT('SRID=3857;POINT(3339584 1118890)')),
    ('point_z',          'POINT Z(30 10 5)',                ST_GeomFromEWKT('SRID=4326;POINTZ(30 10 5)')),
    ('point_m',          'POINT M(30 10 42)',               ST_GeomFromEWKT('SRID=4326;POINTM(30 10 42)')),
    ('point_zm',         'POINT ZM(30 10 5 42)',            ST_GeomFromEWKT('SRID=4326;POINTZM(30 10 5 42)')),
    ('point_empty',      'POINT EMPTY',                     ST_GeomFromEWKT('SRID=4326;POINT EMPTY')),
    ('linestring',       'LINESTRING(30 10,10 30,40 40)',   ST_GeomFromEWKT('SRID=4326;LINESTRING(30 10,10 30,40 40)')),
    ('linestring_z',     'LINESTRING Z(...)',               ST_GeomFromEWKT('SRID=4326;LINESTRINGZ(30 10 1,10 30 2,40 40 3)')),
    ('linestring_empty', 'LINESTRING EMPTY',                ST_GeomFromEWKT('SRID=4326;LINESTRING EMPTY')),
    ('polygon',          'POLYGON((...))',                  ST_GeomFromEWKT('SRID=4326;POLYGON((30 10,40 40,20 40,10 20,30 10))')),
    ('polygon_hole',     'POLYGON with interior ring',      ST_GeomFromEWKT('SRID=4326;POLYGON((35 10,45 45,15 40,10 20,35 10),(20 30,35 35,30 20,20 30))')),
    ('polygon_empty',    'POLYGON EMPTY',                   ST_GeomFromEWKT('SRID=4326;POLYGON EMPTY')),
    ('multipoint',       'MULTIPOINT((10 40),(40 30))',     ST_GeomFromEWKT('SRID=4326;MULTIPOINT((10 40),(40 30),(20 20),(30 10))')),
    ('multilinestring',  'MULTILINESTRING(...)',            ST_GeomFromEWKT('SRID=4326;MULTILINESTRING((10 10,20 20,10 40),(40 40,30 30,40 20,30 10))')),
    ('multipolygon',     'MULTIPOLYGON(...)',               ST_GeomFromEWKT('SRID=4326;MULTIPOLYGON(((30 20,45 40,10 40,30 20)),((15 5,40 10,10 20,5 10,15 5)))')),
    ('multipolygon_hole','MULTIPOLYGON with a hole',        ST_GeomFromEWKT('SRID=4326;MULTIPOLYGON(((40 40,20 45,45 30,40 40)),((20 35,10 30,10 10,30 5,45 20,20 35),(30 20,20 15,20 25,30 20)))')),
    ('collection',       'GEOMETRYCOLLECTION keeps member names', ST_GeomFromEWKT('SRID=4326;GEOMETRYCOLLECTION(POINT(4 6),LINESTRING(4 6,7 10),POLYGON((1 1,2 1,2 2,1 2,1 1)))')),
    ('collection_nested','GEOMETRYCOLLECTION inside a GEOMETRYCOLLECTION', ST_GeomFromEWKT('SRID=4326;GEOMETRYCOLLECTION(POINT(1 2),GEOMETRYCOLLECTION(POINT(3 4),LINESTRING(5 6,7 8)))')),
    ('collection_empty', 'GEOMETRYCOLLECTION EMPTY',        ST_GeomFromEWKT('SRID=4326;GEOMETRYCOLLECTION EMPTY')),
    ('negatives',        'negative coordinates',            ST_GeomFromEWKT('SRID=4326;POINT(-122.4194 -37.7749)')),
    ('high_precision',   'coordinates must not lose digits', ST_GeomFromEWKT('SRID=4326;POINT(-122.41941234567 37.77492345678)')),
    ('big_linestring',   '500-vertex line — truncation case', ST_SetSRID(ST_MakeLine(ARRAY(SELECT ST_MakePoint(i * 0.017, sin(i / 12.0) * 40) FROM generate_series(1, 500) i)), 4326)),
    -- Curve and surface types the EWKB reader does not model. These should fall
    -- back to a readable hex preview, not a crash or a blank cell.
    ('circularstring',   'unsupported → hex fallback',      ST_GeomFromEWKT('SRID=4326;CIRCULARSTRING(1 5,6 2,7 3)')),
    ('compoundcurve',    'unsupported → hex fallback',      ST_GeomFromEWKT('SRID=4326;COMPOUNDCURVE(CIRCULARSTRING(0 0,1 1,1 0),(1 0,0 1))')),
    ('curvepolygon',     'unsupported → hex fallback',      ST_GeomFromEWKT('SRID=4326;CURVEPOLYGON(CIRCULARSTRING(0 0,4 0,4 4,0 4,0 0),(1 1,3 3,3 1,1 1))')),
    ('multicurve',       'unsupported → hex fallback',      ST_GeomFromEWKT('SRID=4326;MULTICURVE((0 0,5 5),CIRCULARSTRING(4 0,4 4,8 4))')),
    ('multisurface',     'unsupported → hex fallback',      ST_GeomFromEWKT('SRID=4326;MULTISURFACE(CURVEPOLYGON(CIRCULARSTRING(0 0,4 0,4 4,0 4,0 0)),((10 10,14 12,11 10,10 10)))')),
    ('triangle',         'unsupported → hex fallback',      ST_GeomFromEWKT('SRID=4326;TRIANGLE((0 0,0 9,9 0,0 0))')),
    ('tin',              'unsupported → hex fallback',      ST_GeomFromEWKT('SRID=4326;TIN(((0 0 0,0 0 1,0 1 0,0 0 0)),((0 0 0,0 1 0,1 1 0,0 0 0)))')),
    ('polyhedralsurface','unsupported → hex fallback',      ST_GeomFromEWKT('SRID=4326;POLYHEDRALSURFACE(((0 0 0,0 0 1,0 1 1,0 1 0,0 0 0)),((0 0 0,0 1 0,1 1 0,1 0 0,0 0 0)))')),
    ('null_geom',        'NULL stays NULL',                 NULL);

UPDATE geom_zoo
SET geog = geom::geography
WHERE geom IS NOT NULL
  AND ST_SRID(geom) = 4326
  AND GeometryType(geom) IN ('POINT', 'LINESTRING', 'POLYGON', 'MULTIPOINT',
                             'MULTILINESTRING', 'MULTIPOLYGON', 'GEOMETRYCOLLECTION')
  AND NOT ST_IsEmpty(geom);
