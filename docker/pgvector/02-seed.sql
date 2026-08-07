-- Stroke fixture: pgvector data.
--
-- Vectors come from a small pool combined pairwise rather than one random draw
-- per element: 100k × 384 fresh randoms takes minutes, a 997×384 pool plus a
-- 389-element noise pool takes seconds and still yields ~388k distinct vectors.

\echo '== stroke_vec: seeding articles (100k) =='

CREATE TEMP TABLE _pool AS
SELECT i AS pid,
       (SELECT array_agg((random() - 0.5)::real) FROM generate_series(1, 384))::vector(384) AS v
FROM generate_series(0, 996) i;

CREATE TEMP TABLE _noise AS
SELECT i AS nid,
       (SELECT array_agg(((random() - 0.5) * 0.15)::real) FROM generate_series(1, 384))::vector(384) AS v
FROM generate_series(0, 388) i;

CREATE TEMP TABLE _sparse AS
SELECT i AS sid,
       ('{' || string_agg(idx || ':' || round(w::numeric, 4), ',' ORDER BY idx) || '}/2048')::sparsevec(2048) AS v
FROM generate_series(0, 499) i
CROSS JOIN LATERAL (
    SELECT DISTINCT ON (idx) idx, random() AS w
    FROM (SELECT 1 + (random() * 2047)::int AS idx FROM generate_series(1, 12)) t
) k
GROUP BY i;

INSERT INTO articles (slug, title, body, category, author, published_at, views, rating,
                      is_published, tags, meta, embedding, embedding_h, keywords, flags)
SELECT
    'article-' || g,
    (ARRAY['Vector search', 'Embedding drift', 'Hybrid retrieval', 'Reranking',
           'Chunking strategy', 'HNSW tuning', 'Quantization', 'Recall vs latency',
           'Multilingual retrieval', 'RAG evaluation'])[1 + g % 10]
        || ' in production, part ' || (1 + g % 47),
    repeat('Nearest-neighbour search over document ' || g || ' returns candidates ranked by cosine distance. ',
           2 + g % 5),
    (ARRAY['research', 'engineering', 'ops', 'product', 'tutorial'])[1 + g % 5],
    (ARRAY['Ada Lovelace', 'Grace Hopper', 'Alan Turing', 'Barbara Liskov',
           'Ken Thompson', 'Radia Perlman'])[1 + g % 6],
    timestamptz '2023-01-01 00:00:00+00' + (g * interval '7 minutes'),
    (random() * 250000)::int,
    round((1 + random() * 4)::numeric, 2),
    g % 13 <> 0,
    (ARRAY['pgvector', 'hnsw', 'ivfflat', 'cosine', 'l2', 'sparse', 'rerank',
           'ann', 'recall', 'latency'])[1 + g % 10 : 3 + g % 10],
    jsonb_build_object(
        'lang', (ARRAY['en', 'de', 'ja', 'es', 'fr'])[1 + g % 5],
        'model', (ARRAY['all-MiniLM-L6-v2', 'bge-small-en', 'gte-small'])[1 + g % 3],
        'chunks', 1 + g % 9,
        'scores', jsonb_build_array(round(random()::numeric, 3), round(random()::numeric, 3))
    ),
    p.v + n.v,
    (p.v + n.v)::halfvec(384),
    s.v,
    (g % 65536)::bit(16)
FROM generate_series(1, 100000) g
JOIN _pool   p ON p.pid = g % 997
JOIN _noise  n ON n.nid = g % 389
JOIN _sparse s ON s.sid = g % 500;

\echo '== stroke_vec: seeding openai_docs (10k × 1536-dim) =='

CREATE TEMP TABLE _pool_wide AS
SELECT i AS pid,
       (SELECT array_agg((random() - 0.5)::real) FROM generate_series(1, 1536))::vector(1536) AS v
FROM generate_series(0, 199) i;

CREATE TEMP TABLE _noise_wide AS
SELECT i AS nid,
       (SELECT array_agg(((random() - 0.5) * 0.2)::real) FROM generate_series(1, 1536))::vector(1536) AS v
FROM generate_series(0, 96) i;

INSERT INTO openai_docs (chunk, source, content, tokens, embedding)
SELECT
    1 + g % 12,
    (ARRAY['handbook.pdf', 'runbook.md', 'contracts/2024.docx', 'support-tickets.csv',
           'design-system.md'])[1 + g % 5],
    'Chunk ' || (1 + g % 12) || ' of document ' || (g / 12) ||
        ': ' || repeat('the quick brown fox jumps over the lazy dog. ', 3 + g % 4),
    120 + (random() * 380)::int,
    p.v + n.v
FROM generate_series(1, 10000) g
JOIN _pool_wide  p ON p.pid = g % 200
JOIN _noise_wide n ON n.nid = g % 97;

\echo '== stroke_vec: seeding events (1,000,000) =='

CREATE TEMP TABLE _pool_tiny AS
SELECT i AS pid,
       (SELECT array_agg((random() * 2 - 1)::real) FROM generate_series(1, 8))::vector(8) AS v
FROM generate_series(0, 9999) i;

INSERT INTO events (ts, device_id, session, kind, amount, ok, latency_ms, embed, props)
SELECT
    timestamptz '2024-01-01 00:00:00+00' + (g * interval '25 seconds'),
    1 + g % 5000,
    ('00000000-0000-4000-8000-' || lpad(to_hex(g % 100000), 12, '0'))::uuid,
    (ARRAY['page_view', 'click', 'purchase', 'search', 'signup', 'error',
           'scroll', 'share'])[1 + g % 8],
    CASE WHEN g % 8 = 2 THEN round((random() * 900 + 5)::numeric, 2) END,
    g % 17 <> 0,
    5 + (random() * 1200)::int,
    p.v,
    CASE WHEN g % 4 = 0
         THEN jsonb_build_object('ab', (ARRAY['a', 'b'])[1 + g % 2], 'retries', g % 3)
    END
FROM generate_series(1, 1000000) g
JOIN _pool_tiny p ON p.pid = g % 10000;

\echo '== stroke_vec: seeding analytics.query_log =='

INSERT INTO analytics.query_log (asked_at, query, q_embed, hit_ids, took_ms)
SELECT
    timestamptz '2025-01-01 00:00:00+00' + (g * interval '11 minutes'),
    'how do I ' || (ARRAY['tune hnsw', 'shrink an index', 'rerank results',
                          'chunk a pdf', 'measure recall'])[1 + g % 5] || '?',
    p.v + n.v,
    ARRAY(SELECT 1 + (random() * 99999)::int FROM generate_series(1, 5)),
    round((random() * 400 + 3)::numeric, 3)::float8
FROM generate_series(1, 25000) g
JOIN _pool  p ON p.pid = g % 997
JOIN _noise n ON n.nid = g % 389;

\echo '== stroke_vec: seeding vector_zoo =='

INSERT INTO vector_zoo (label, note, v3, h3, s10, b8, vb) VALUES
    ('zeros',        'all components zero',                    '[0,0,0]',          '[0,0,0]',        '{}/10',                   B'00000000', B'0'),
    ('ones',         'integral values must not print as 1.0',  '[1,1,1]',          '[1,1,1]',        '{1:1,10:1}/10',           B'11111111', B'1111'),
    ('negatives',    'sign handling',                          '[-1,-2.5,-0.125]', '[-1,-2.5,-0.5]', '{2:-1,5:-0.25}/10',       B'10000001', B'101'),
    ('tiny',         'f32 0.001 widened to f64 prints 0.001000000047497451', '[0.001,0.002,0.003]', '[0.001,0.002,0.003]', '{3:0.001}/10', B'00000001', B'0000000001'),
    ('big',          'large magnitudes',                       '[1e10,-1e10,123456792]', '[1000,-1000,2048]', '{1:65504,9:-65504}/10', B'01010101', B'11110000111100001111'),
    ('precise',      'seven significant digits',               '[0.1234567,0.7654321,0.5555555]', '[0.125,0.75,0.5]', '{4:0.12345,8:0.98765}/10', B'11001100', B'1'),
    ('subnormal',    'smallest normal f32',                    '[1.1754944e-38,-1.1754944e-38,0]', '[6.104e-05,0,0]', '{7:0.00001}/10', B'00010000', B'000'),
    ('one_nonzero',  'sparse with a single set index',         '[0,0,42]',         '[0,0,42]',       '{10:42}/10',              B'00000010', B'11'),
    ('dense_sparse', 'every index set',                        '[3,2,1]',          '[3,2,1]',        '{1:1,2:2,3:3,4:4,5:5,6:6,7:7,8:8,9:9,10:10}/10', B'11111110', B'10101010101010101010101'),
    ('nulls',        'NULL must stay NULL, not become an empty vector', NULL, NULL, NULL, NULL, NULL);
