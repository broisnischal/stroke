import { describe, it, expect } from 'vitest'
import { isWriteSql, stripSqlComments } from './sql-write.js'

describe('isWriteSql', () => {
  it('allows plain reads', () => {
    expect(isWriteSql('SELECT * FROM users')).toBe(false)
    expect(isWriteSql('  select 1  ')).toBe(false)
    expect(isWriteSql('EXPLAIN ANALYZE SELECT 1')).toBe(false)
    expect(isWriteSql('SHOW TABLES')).toBe(false)
    expect(isWriteSql('WITH recent AS (SELECT 1) SELECT * FROM recent')).toBe(false)
    expect(isWriteSql('')).toBe(false)
    expect(isWriteSql(null)).toBe(false)
  })

  it('catches the obvious writes', () => {
    expect(isWriteSql('INSERT INTO t VALUES (1)')).toBe(true)
    expect(isWriteSql('update t set a = 1')).toBe(true)
    expect(isWriteSql('DELETE FROM t')).toBe(true)
    expect(isWriteSql('TRUNCATE TABLE t')).toBe(true)
    expect(isWriteSql('DROP INDEX "public"."idx"')).toBe(true)
    expect(isWriteSql('ALTER TABLE t ADD COLUMN c int')).toBe(true)
    expect(isWriteSql('CREATE INDEX idx ON t (a)')).toBe(true)
    expect(isWriteSql('GRANT SELECT ON t TO bob')).toBe(true)
  })

  it('catches storage rewrites that no user typed as data', () => {
    expect(isWriteSql('VACUUM FULL')).toBe(true)
    expect(isWriteSql('REINDEX TABLE t')).toBe(true)
    expect(isWriteSql('REFRESH MATERIALIZED VIEW mv')).toBe(true)
  })

  it('looks past a CTE to the real verb', () => {
    expect(isWriteSql('WITH d AS (SELECT id FROM t) DELETE FROM u USING d WHERE u.id = d.id')).toBe(true)
    expect(isWriteSql('WITH x AS (SELECT 1) INSERT INTO t SELECT * FROM x')).toBe(true)
    expect(isWriteSql('with s as (select 1) update t set a = 1')).toBe(true)
  })

  it('is not fooled by a comment in front of the verb', () => {
    expect(isWriteSql('-- just looking\nDROP TABLE t')).toBe(true)
    expect(isWriteSql('/* SELECT */ DELETE FROM t')).toBe(true)
  })

  it('flags any write inside a multi-statement script', () => {
    expect(isWriteSql('SELECT 1; SELECT 2')).toBe(false)
    expect(isWriteSql('SELECT 1; DELETE FROM t; SELECT 2')).toBe(true)
  })

  it('does not treat a semicolon or keyword inside a literal as syntax', () => {
    expect(isWriteSql("SELECT * FROM t WHERE note = 'a; delete from u'")).toBe(false)
    expect(isWriteSql("SELECT * FROM t WHERE note LIKE '%into%'")).toBe(false)
    expect(isWriteSql("SELECT * FROM t WHERE c = '-- drop table t'")).toBe(false)
  })

  it('distinguishes SELECT INTO from a read', () => {
    expect(isWriteSql('SELECT a, b INTO backup FROM t')).toBe(true)
    expect(isWriteSql("SELECT * INTO OUTFILE '/tmp/x' FROM t")).toBe(true)
    expect(isWriteSql('SELECT * FROM t WHERE label = 1')).toBe(false)
  })

  it('splits COPY by direction', () => {
    expect(isWriteSql('COPY t FROM \'/tmp/x.csv\'')).toBe(true)
    expect(isWriteSql('COPY t TO STDOUT')).toBe(false)
  })

  it('treats identity changes as writes but leaves plain SET alone', () => {
    expect(isWriteSql('SET ROLE admin')).toBe(true)
    expect(isWriteSql('SET SESSION AUTHORIZATION bob')).toBe(true)
    expect(isWriteSql("SET statement_timeout = '5s'")).toBe(false)
  })

  it('lets introspection PRAGMAs through but not assignments', () => {
    expect(isWriteSql("PRAGMA table_info('users')")).toBe(false)
    expect(isWriteSql('PRAGMA foreign_key_list(users)')).toBe(false)
    expect(isWriteSql('PRAGMA data_version')).toBe(false)
    expect(isWriteSql('PRAGMA journal_mode')).toBe(false)
    expect(isWriteSql('PRAGMA journal_mode = WAL')).toBe(true)
    expect(isWriteSql('PRAGMA foreign_keys=ON')).toBe(true)
    expect(isWriteSql('PRAGMA optimize')).toBe(true)
    expect(isWriteSql('PRAGMA incremental_vacuum')).toBe(true)
  })

  it('covers the Redis commands that share the execute path', () => {
    expect(isWriteSql('DEL "session:1"')).toBe(true)
    expect(isWriteSql('HDEL h field')).toBe(true)
    expect(isWriteSql('FLUSHDB')).toBe(true)
    expect(isWriteSql('EXPIRE k 60')).toBe(true)
    expect(isWriteSql('SET mykey "value"')).toBe(true)
    expect(isWriteSql('GET mykey')).toBe(false)
    expect(isWriteSql('SCAN 0 MATCH * COUNT 100')).toBe(false)
    expect(isWriteSql('TTL mykey')).toBe(false)
    expect(isWriteSql('HGETALL h')).toBe(false)
  })
})

describe('stripSqlComments', () => {
  it('keeps string contents intact', () => {
    expect(stripSqlComments("SELECT '--x' AS a -- tail")).toBe("SELECT '--x' AS a ")
  })

  it('handles doubled quotes inside a literal', () => {
    expect(stripSqlComments("SELECT 'it''s fine' -- tail")).toBe("SELECT 'it''s fine' ")
  })
})
