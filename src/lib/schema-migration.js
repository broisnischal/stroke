/**
 * Turn a snapshot diff into migration SQL.
 *
 * `diffSnapshots` already works out what changed between two captures; this
 * renders that into statements you can review and run. Both directions are
 * produced: `up` moves the database from the earlier snapshot to the later one,
 * `down` puts it back.
 *
 * Nothing here executes anything. The output is meant to be read before it is
 * run, and it deliberately refuses to guess where a guess could lose data —
 * see `warnings`.
 */

/** @typedef {import('$lib/stores/schema-snapshots.js').SnapshotColumn} SnapshotColumn */
/** @typedef {import('$lib/stores/schema-snapshots.js').SnapshotDiff} SnapshotDiff */

/** @typedef {'postgres'|'mysql'|'sqlite'} MigrationDialect */

/**
 * @typedef {object} Migration
 * @property {string} up statements taking `before` to `after`
 * @property {string} down statements taking `after` back to `before`
 * @property {string[]} warnings things the reader has to decide, in order
 * @property {number} statementCount statements in `up`
 */

/**
 * Quote an identifier for the dialect.
 * @param {string} name @param {MigrationDialect} dialect
 */
export function quoteIdent(name, dialect) {
  const s = String(name ?? "");
  return dialect === "mysql" ? `\`${s.replace(/`/g, "``")}\`` : `"${s.replace(/"/g, '""')}"`;
}

/**
 * A schema-qualified table reference. SQLite has no schemas, so the schema is
 * dropped there rather than emitted as an attached-database name.
 * @param {string} schema @param {string} table @param {MigrationDialect} dialect
 */
function tableRef(schema, table, dialect) {
  if (dialect === "sqlite" || !schema) return quoteIdent(table, dialect);
  return `${quoteIdent(schema, dialect)}.${quoteIdent(table, dialect)}`;
}

/**
 * Render a column for a CREATE TABLE or ADD COLUMN clause.
 * @param {SnapshotColumn} col @param {MigrationDialect} dialect
 */
function columnClause(col, dialect) {
  let out = `${quoteIdent(col.name, dialect)} ${col.dataType}`;
  if (col.defaultValue !== null && col.defaultValue !== undefined && col.defaultValue !== "") {
    out += ` DEFAULT ${col.defaultValue}`;
  }
  if (!col.nullable) out += " NOT NULL";
  return out;
}

/**
 * Statements that alter one existing column to match `to`.
 *
 * Postgres and MySQL spell this differently enough to be worth separating:
 * Postgres alters one property at a time, MySQL restates the whole column.
 *
 * @param {string} ref @param {SnapshotColumn} from @param {SnapshotColumn} to
 * @param {string[]} changed @param {MigrationDialect} dialect
 * @returns {string[]}
 */
function alterColumn(ref, from, to, changed, dialect) {
  const col = quoteIdent(to.name, dialect);

  if (dialect === "mysql") {
    // MODIFY COLUMN replaces the whole definition, so one statement covers
    // every property that changed.
    return [`ALTER TABLE ${ref} MODIFY COLUMN ${columnClause(to, dialect)};`];
  }

  const out = [];
  if (changed.includes("dataType")) {
    // USING lets an otherwise-illegal cast through. It is the value Postgres
    // would have used implicitly, written out so it can be edited.
    out.push(
      `ALTER TABLE ${ref} ALTER COLUMN ${col} TYPE ${to.dataType} USING ${col}::${to.dataType};`,
    );
  }
  if (changed.includes("defaultValue")) {
    out.push(
      to.defaultValue
        ? `ALTER TABLE ${ref} ALTER COLUMN ${col} SET DEFAULT ${to.defaultValue};`
        : `ALTER TABLE ${ref} ALTER COLUMN ${col} DROP DEFAULT;`,
    );
  }
  if (changed.includes("nullable")) {
    out.push(
      to.nullable
        ? `ALTER TABLE ${ref} ALTER COLUMN ${col} DROP NOT NULL;`
        : `ALTER TABLE ${ref} ALTER COLUMN ${col} SET NOT NULL;`,
    );
  }
  return out;
}

/**
 * Build the migration for a diff.
 *
 * @param {SnapshotDiff} diff
 * @param {{ dialect?: MigrationDialect }} [options]
 * @returns {Migration}
 */
export function buildMigration(diff, options = {}) {
  const dialect = options.dialect ?? "postgres";
  /** @type {string[]} */
  const up = [];
  /** @type {string[]} */
  const down = [];
  /** @type {string[]} */
  const warnings = [];

  // ── Tables added ──────────────────────────────────────────────────────────
  for (const t of diff.addedTables ?? []) {
    const ref = tableRef(t.schema, t.name, dialect);
    const cols = [...(t.columns ?? [])].sort(
      (a, b) => (a.ordinalPosition ?? 0) - (b.ordinalPosition ?? 0),
    );
    if (cols.length === 0) {
      warnings.push(`${t.schema}.${t.name} was added but the snapshot recorded no columns for it.`);
      continue;
    }
    up.push(
      `CREATE TABLE ${ref} (\n${cols.map((c) => `  ${columnClause(c, dialect)}`).join(",\n")}\n);`,
    );
    down.push(`DROP TABLE ${ref};`);
  }

  // ── Tables removed ────────────────────────────────────────────────────────
  for (const t of diff.removedTables ?? []) {
    const ref = tableRef(t.schema, t.name, dialect);
    up.push(`DROP TABLE ${ref};`);
    // A snapshot records a removed table by name only, so there is nothing to
    // rebuild it from. Saying that is more useful than emitting a CREATE TABLE
    // that would silently produce a different table.
    down.push(`-- Cannot recreate ${t.schema}.${t.name}: the snapshot has no definition for it.`);
    warnings.push(
      `Dropping ${t.schema}.${t.name} destroys its data, and the rollback cannot bring the table back.`,
    );
  }

  // ── Tables changed ────────────────────────────────────────────────────────
  for (const t of diff.modifiedTables ?? []) {
    const ref = tableRef(t.schema, t.name, dialect);

    for (const col of t.addedColumns ?? []) {
      up.push(`ALTER TABLE ${ref} ADD COLUMN ${columnClause(col, dialect)};`);
      down.push(`ALTER TABLE ${ref} DROP COLUMN ${quoteIdent(col.name, dialect)};`);
      if (!col.nullable && !col.defaultValue) {
        warnings.push(
          `${t.schema}.${t.name}.${col.name} is NOT NULL with no default, so adding it fails unless the table is empty.`,
        );
      }
    }

    for (const col of t.removedColumns ?? []) {
      up.push(`ALTER TABLE ${ref} DROP COLUMN ${quoteIdent(col.name, dialect)};`);
      down.push(`ALTER TABLE ${ref} ADD COLUMN ${columnClause(col, dialect)};`);
      warnings.push(`Dropping ${t.schema}.${t.name}.${col.name} destroys the data in it.`);
    }

    for (const mod of t.modifiedColumns ?? []) {
      const changed = mod.changed ?? [];
      up.push(...alterColumn(ref, mod.before, mod.after, changed, dialect));
      down.push(...alterColumn(ref, mod.after, mod.before, changed, dialect));
      if (changed.includes("dataType")) {
        warnings.push(
          `${t.schema}.${t.name}.${mod.name} changes type from ${mod.before.dataType} to ${mod.after.dataType}; check the USING clause before running it.`,
        );
      }
      if (changed.includes("nullable") && !mod.after.nullable) {
        warnings.push(
          `${t.schema}.${t.name}.${mod.name} becomes NOT NULL, which fails if any existing row is null.`,
        );
      }
    }
  }

  if (dialect === "sqlite") {
    const unsupported = (diff.modifiedTables ?? []).some(
      (t) => (t.modifiedColumns ?? []).length > 0 || (t.removedColumns ?? []).length > 0,
    );
    if (unsupported) {
      warnings.push(
        "SQLite cannot alter or drop a column in place; those statements need the copy-and-rename dance instead.",
      );
    }
  }

  // The rollback has to undo the steps in the reverse of the order that made
  // them, or a table is dropped before the column change inside it is undone.
  down.reverse();

  return {
    up: up.join("\n\n"),
    down: down.join("\n\n"),
    warnings: [...new Set(warnings)],
    statementCount: up.length,
  };
}

/**
 * Wrap a migration as a reviewable script, with the rollback commented out
 * beneath it so the whole thing is safe to paste into the console.
 *
 * @param {Migration} migration
 * @param {{ title?: string, dialect?: MigrationDialect }} [options]
 */
export function formatMigrationScript(migration, options = {}) {
  const dialect = options.dialect ?? "postgres";
  const title = options.title ?? "Schema migration";
  const lines = [`-- ${title}`, `-- Generated by Stroke from a snapshot diff`, ""];

  if (migration.warnings.length > 0) {
    lines.push("-- Read before running:");
    for (const w of migration.warnings) lines.push(`--   * ${w}`);
    lines.push("");
  }

  // One transaction, so a failure part-way leaves the schema as it was. MySQL
  // commits DDL implicitly, so wrapping it there would be a false promise.
  const transactional = dialect !== "mysql";
  if (transactional) lines.push("BEGIN;", "");
  lines.push(migration.up || "-- No changes.");
  if (transactional) lines.push("", "COMMIT;");

  if (migration.down) {
    lines.push("", "-- Rollback:", ...migration.down.split("\n").map((l) => (l ? `-- ${l}` : "--")));
  }
  return lines.join("\n");
}
