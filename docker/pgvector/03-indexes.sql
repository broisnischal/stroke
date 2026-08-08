-- Stroke fixture: pgvector indexes.
-- Built after the data so each one is a bulk build rather than 100k insertions,
-- and so the schema page has an HNSW, an IVFFlat, a GIN and a trigram to render.

\echo '== stroke_vec: building indexes (this is the slow part) =='

SET maintenance_work_mem = '1GB';
SET max_parallel_maintenance_workers = 4;

CREATE INDEX articles_embedding_hnsw   ON articles USING hnsw (embedding vector_cosine_ops);
CREATE INDEX articles_embedding_h_hnsw ON articles USING hnsw (embedding_h halfvec_l2_ops);
CREATE INDEX articles_published_idx    ON articles (published_at DESC);
CREATE INDEX articles_tags_gin         ON articles USING gin (tags);
CREATE INDEX articles_meta_gin         ON articles USING gin (meta jsonb_path_ops);
CREATE INDEX articles_title_trgm       ON articles USING gin (title gin_trgm_ops);

CREATE INDEX openai_embedding_ivf ON openai_docs USING ivfflat (embedding vector_l2_ops) WITH (lists = 100);

CREATE INDEX events_ts_idx     ON events (ts);
CREATE INDEX events_device_idx ON events (device_id, ts DESC);
CREATE INDEX events_embed_ivf  ON events USING ivfflat (embed vector_l2_ops) WITH (lists = 200);

\echo '== stroke_vec: analyze =='

VACUUM ANALYZE articles;
VACUUM ANALYZE openai_docs;
VACUUM ANALYZE events;
VACUUM ANALYZE analytics.query_log;

-- A view and a matview, so the sidebar has relation kinds beyond plain tables.
CREATE VIEW popular_articles AS
SELECT id, slug, title, category, views, rating, published_at, embedding
FROM articles
WHERE is_published AND views > 100000;

CREATE MATERIALIZED VIEW category_stats AS
SELECT category,
       count(*)                    AS articles,
       round(avg(views))           AS avg_views,
       round(avg(rating), 3)       AS avg_rating,
       avg(embedding)              AS centroid
FROM articles
GROUP BY category;

CREATE UNIQUE INDEX category_stats_pk ON category_stats (category);

\echo '== stroke_vec: ready =='
