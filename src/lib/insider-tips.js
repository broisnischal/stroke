/** @type {{ category: string; label: string; text: string }[]} */
export const insiderTips = [
  {
    category: 'SQL',
    label: 'NULL semantics',
    text: 'NULL is not a value, it represents absence. NULL ≠ NULL is always true, which is why IS NULL exists.',
  },
  {
    category: 'SQL',
    label: 'Execution order',
    text: 'SQL runs in this logical order: FROM → JOIN → WHERE → GROUP BY → HAVING → SELECT → DISTINCT → ORDER BY → LIMIT.',
  },
  {
    category: 'SQL',
    label: 'Window functions',
    text: 'Window functions like ROW_NUMBER(), RANK(), and LAG() compute across related rows without collapsing them into one.',
  },
  {
    category: 'SQL',
    label: 'CTEs',
    text: 'WITH clauses (CTEs) are evaluated once and referenced like temp tables, great for breaking up complex queries.',
  },
  {
    category: 'SQL',
    label: 'RETURNING clause',
    text: 'INSERT, UPDATE, and DELETE support RETURNING, get modified rows back without an extra SELECT.',
  },
  {
    category: 'SQL',
    label: 'DISTINCT timing',
    text: 'DISTINCT is applied before ORDER BY in the execution order, so you can only sort by columns in the SELECT list.',
  },
  {
    category: 'Performance',
    label: 'EXPLAIN ANALYZE',
    text: 'EXPLAIN ANALYZE actually runs your query and shows real row counts and timings, not just planner estimates.',
  },
  {
    category: 'Performance',
    label: 'Covering indexes',
    text: 'A covering index includes every column a query needs. The engine never touches the main table, just the index.',
  },
  {
    category: 'Performance',
    label: 'Partial indexes',
    text: 'Partial indexes only index rows matching a WHERE clause. Smaller, faster to scan, and cheaper to maintain.',
  },
  {
    category: 'Performance',
    label: 'B-tree vs Hash',
    text: "B-tree indexes support equality and range queries. Hash indexes only support equality, and aren't WAL-logged before Postgres 10.",
  },
  {
    category: 'Performance',
    label: 'FK indexes',
    text: 'A foreign key without an index on the referencing column causes a full table scan on every CASCADE or key check.',
  },
  {
    category: 'Performance',
    label: 'SELECT FOR UPDATE',
    text: 'SELECT FOR UPDATE locks the matched rows until your transaction commits, preventing concurrent updates on the same rows.',
  },
  {
    category: 'PostgreSQL',
    label: 'MVCC',
    text: "PostgreSQL's MVCC (Multi-Version Concurrency Control) lets readers never block writers, each transaction sees a consistent snapshot.",
  },
  {
    category: 'PostgreSQL',
    label: 'VACUUM',
    text: 'VACUUM reclaims storage occupied by dead row versions created by updates and deletes. AUTOVACUUM handles this automatically.',
  },
  {
    category: 'PostgreSQL',
    label: 'TOAST',
    text: 'TOAST (The Oversized-Attribute Storage Technique) transparently compresses and stores large values out-of-line.',
  },
  {
    category: 'PostgreSQL',
    label: 'JSONB',
    text: 'JSONB stores JSON as binary, faster to query than plain JSON and supports GIN indexes for key/value lookups.',
  },
  {
    category: 'PostgreSQL',
    label: 'SERIAL',
    text: 'SERIAL is shorthand for creating an integer column with a sequence as its default. IDENTITY columns are the modern replacement.',
  },
  {
    category: 'PostgreSQL',
    label: 'Age',
    text: "PostgreSQL's lineage traces back to 1986 at UC Berkeley. It has been open-source since 1996.",
  },
  {
    category: 'Concepts',
    label: 'ACID',
    text: 'Transactions follow ACID: Atomicity (all or nothing), Consistency (valid state), Isolation (no interference), Durability (survives crashes).',
  },
  {
    category: 'Concepts',
    label: 'Normalization',
    text: '3NF removes transitive dependencies. BCNF is stricter. Denormalization is sometimes intentional for read performance.',
  },
  {
    category: 'Concepts',
    label: 'N+1 problem',
    text: 'The N+1 query problem: fetching N rows then querying once per row. Fix it with a JOIN or a WHERE IN list.',
  },
  {
    category: 'Concepts',
    label: 'Idempotency',
    text: 'INSERT ... ON CONFLICT DO NOTHING (or DO UPDATE) makes upserts idempotent, safe to retry on failure.',
  },
]

/** Returns a single random tip. */
export function pickRandomTip() {
  return insiderTips[Math.floor(Math.random() * insiderTips.length)]
}
