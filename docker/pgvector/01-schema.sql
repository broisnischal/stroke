-- Stroke fixture: pgvector schema.
-- Every vector-family type the app claims to decode gets a column here, plus the
-- ordinary columns around them so the table reads like a real embedding store.

\echo '== stroke_vec: extensions =='

CREATE EXTENSION IF NOT EXISTS vector;
CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE EXTENSION IF NOT EXISTS btree_gin;

\echo '== stroke_vec: tables =='

-- The headline table: 100k rows of realistic 384-dim embeddings (MiniLM size)
-- alongside the half-precision and sparse variants of the same content.
CREATE TABLE articles (
    id           bigserial PRIMARY KEY,
    slug         text        NOT NULL UNIQUE,
    title        text        NOT NULL,
    body         text        NOT NULL,
    category     text        NOT NULL,
    author       text        NOT NULL,
    published_at timestamptz NOT NULL,
    views        integer     NOT NULL DEFAULT 0,
    rating       numeric(3, 2),
    is_published boolean     NOT NULL DEFAULT true,
    tags         text[]      NOT NULL DEFAULT '{}',
    meta         jsonb       NOT NULL DEFAULT '{}'::jsonb,
    embedding    vector(384),
    embedding_h  halfvec(384),
    keywords     sparsevec(2048),
    flags        bit(16)
);

COMMENT ON TABLE articles IS 'Dense + half + sparse embeddings over the same rows.';
COMMENT ON COLUMN articles.embedding IS 'vector(384) — MiniLM-sized dense embedding, cosine indexed.';
COMMENT ON COLUMN articles.keywords IS 'sparsevec(2048) — BM25-style sparse term weights.';

-- Wide vectors: OpenAI text-embedding-3-small dimensionality. Fewer rows, but
-- each cell is 1536 floats, which is where a cell viewer stops being optional.
CREATE TABLE openai_docs (
    id        serial PRIMARY KEY,
    doc_id    uuid    NOT NULL DEFAULT gen_random_uuid(),
    chunk     integer NOT NULL,
    source    text    NOT NULL,
    content   text    NOT NULL,
    tokens    integer NOT NULL,
    embedding vector(1536),
    UNIQUE (doc_id, chunk)
);

-- The million-row table. Narrow vectors so the row count, not the payload, is
-- what gets tested: scrolling, counting, filtering, sorting at scale.
CREATE TABLE events (
    id         bigserial PRIMARY KEY,
    ts         timestamptz NOT NULL,
    device_id  integer     NOT NULL,
    session    uuid        NOT NULL,
    kind       text        NOT NULL,
    amount     numeric(12, 2),
    ok         boolean,
    latency_ms integer,
    embed      vector(8),
    props      jsonb
);

-- Awkward values on purpose: the ones that expose a formatter that widens f32 to
-- f64, mishandles signs, or can't print an empty/NULL vector.
CREATE TABLE vector_zoo (
    id    serial PRIMARY KEY,
    label text NOT NULL,
    note  text,
    v3    vector(3),
    h3    halfvec(3),
    s10   sparsevec(10),
    b8    bit(8),
    vb    varbit
);

-- A second schema, so the sidebar has more than `public` to group.
CREATE SCHEMA analytics;

CREATE TABLE analytics.query_log (
    id        bigserial PRIMARY KEY,
    asked_at  timestamptz NOT NULL DEFAULT now(),
    query     text        NOT NULL,
    q_embed   vector(384),
    hit_ids   bigint[],
    took_ms   double precision
);
