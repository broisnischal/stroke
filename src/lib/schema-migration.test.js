import { describe, it, expect } from "vitest";
import { buildMigration, formatMigrationScript, quoteIdent } from "./schema-migration.js";

/** @param {Partial<import('./schema-migration.js').SnapshotColumn>} [over] */
const col = (over = {}) => ({
  name: "id",
  dataType: "integer",
  nullable: true,
  defaultValue: null,
  ordinalPosition: 1,
  ...over,
});

/** @param {Partial<import('$lib/stores/schema-snapshots.js').SnapshotDiff>} [over] */
const diff = (over = {}) => ({
  addedTables: [],
  removedTables: [],
  modifiedTables: [],
  ...over,
});

describe("quoteIdent", () => {
  it("quotes for the dialect and escapes the quote character", () => {
    expect(quoteIdent("user", "postgres")).toBe('"user"');
    expect(quoteIdent("user", "mysql")).toBe("`user`");
    expect(quoteIdent('a"b', "postgres")).toBe('"a""b"');
    expect(quoteIdent("a`b", "mysql")).toBe("`a``b`");
  });
});

describe("buildMigration — tables", () => {
  it("creates an added table and drops it on the way back", () => {
    const m = buildMigration(
      diff({
        addedTables: [
          {
            schema: "public",
            name: "users",
            columns: [
              col({ name: "id", dataType: "integer", nullable: false, ordinalPosition: 1 }),
              col({ name: "email", dataType: "text", ordinalPosition: 2 }),
            ],
          },
        ],
      }),
    );
    expect(m.up).toContain('CREATE TABLE "public"."users"');
    expect(m.up).toContain('"id" integer NOT NULL');
    expect(m.up).toContain('"email" text');
    expect(m.down).toBe('DROP TABLE "public"."users";');
    expect(m.statementCount).toBe(1);
  });

  it("emits columns in ordinal order, not map order", () => {
    const m = buildMigration(
      diff({
        addedTables: [
          {
            schema: "public",
            name: "t",
            columns: [
              col({ name: "second", ordinalPosition: 2 }),
              col({ name: "first", ordinalPosition: 1 }),
            ],
          },
        ],
      }),
    );
    expect(m.up.indexOf('"first"')).toBeLessThan(m.up.indexOf('"second"'));
  });

  it("will not invent a definition for a dropped table", () => {
    const m = buildMigration(diff({ removedTables: [{ schema: "public", name: "old" }] }));
    expect(m.up).toBe('DROP TABLE "public"."old";');
    expect(m.down).toContain("Cannot recreate public.old");
    expect(m.warnings.join(" ")).toMatch(/destroys its data/);
  });
});

describe("buildMigration — columns", () => {
  const modified = (/** @type {any} */ over) =>
    diff({
      modifiedTables: [
        {
          schema: "public",
          name: "users",
          addedColumns: [],
          removedColumns: [],
          modifiedColumns: [],
          ...over,
        },
      ],
    });

  it("adds and drops a column, each undone by the other", () => {
    const m = buildMigration(modified({ addedColumns: [col({ name: "age", dataType: "integer" })] }));
    expect(m.up).toBe('ALTER TABLE "public"."users" ADD COLUMN "age" integer;');
    expect(m.down).toBe('ALTER TABLE "public"."users" DROP COLUMN "age";');
  });

  it("warns that a NOT NULL column with no default cannot be added to a populated table", () => {
    const m = buildMigration(
      modified({ addedColumns: [col({ name: "age", nullable: false })] }),
    );
    expect(m.warnings.join(" ")).toMatch(/NOT NULL with no default/);
  });

  it("restores a dropped column's full definition on rollback", () => {
    const m = buildMigration(
      modified({
        removedColumns: [col({ name: "nickname", dataType: "text", nullable: false, defaultValue: "'x'" })],
      }),
    );
    expect(m.up).toBe('ALTER TABLE "public"."users" DROP COLUMN "nickname";');
    expect(m.down).toBe(
      'ALTER TABLE "public"."users" ADD COLUMN "nickname" text DEFAULT \'x\' NOT NULL;',
    );
    expect(m.warnings.join(" ")).toMatch(/destroys the data/);
  });

  it("alters one property at a time on Postgres", () => {
    const m = buildMigration(
      modified({
        modifiedColumns: [
          {
            name: "age",
            before: col({ name: "age", dataType: "integer", nullable: true }),
            after: col({ name: "age", dataType: "bigint", nullable: false }),
            changed: ["dataType", "nullable"],
          },
        ],
      }),
    );
    expect(m.up).toContain('ALTER COLUMN "age" TYPE bigint USING "age"::bigint;');
    expect(m.up).toContain('ALTER COLUMN "age" SET NOT NULL;');
    // The rollback restores both properties.
    expect(m.down).toContain('ALTER COLUMN "age" TYPE integer USING "age"::integer;');
    expect(m.down).toContain('ALTER COLUMN "age" DROP NOT NULL;');
  });

  it("restates the whole column on MySQL", () => {
    const m = buildMigration(
      modified({
        modifiedColumns: [
          {
            name: "age",
            before: col({ name: "age", dataType: "int" }),
            after: col({ name: "age", dataType: "bigint", nullable: false }),
            changed: ["dataType", "nullable"],
          },
        ],
      }),
      { dialect: "mysql" },
    );
    expect(m.up).toBe("ALTER TABLE `public`.`users` MODIFY COLUMN `age` bigint NOT NULL;");
  });

  it("drops a default rather than setting it to nothing", () => {
    const m = buildMigration(
      modified({
        modifiedColumns: [
          {
            name: "state",
            before: col({ name: "state", defaultValue: "'new'" }),
            after: col({ name: "state", defaultValue: null }),
            changed: ["defaultValue"],
          },
        ],
      }),
    );
    expect(m.up).toContain('DROP DEFAULT;');
    expect(m.down).toContain("SET DEFAULT 'new';");
  });
});

describe("buildMigration — ordering and dialects", () => {
  it("reverses the rollback so each step undoes the one after it", () => {
    const m = buildMigration(
      diff({
        addedTables: [{ schema: "public", name: "a", columns: [col()] }],
        removedTables: [{ schema: "public", name: "b" }],
      }),
    );
    // `up` creates a then drops b; `down` must recreate b's placeholder first,
    // then drop a.
    expect(m.down.indexOf("Cannot recreate public.b")).toBeLessThan(
      m.down.indexOf('DROP TABLE "public"."a"'),
    );
  });

  it("leaves the schema off for SQLite and flags what it cannot do", () => {
    const m = buildMigration(
      diff({
        modifiedTables: [
          {
            schema: "main",
            name: "users",
            addedColumns: [],
            removedColumns: [col({ name: "old" })],
            modifiedColumns: [],
          },
        ],
      }),
      { dialect: "sqlite" },
    );
    expect(m.up).toBe('ALTER TABLE "users" DROP COLUMN "old";');
    expect(m.warnings.join(" ")).toMatch(/cannot alter or drop a column in place/);
  });

  it("reports no changes for an empty diff", () => {
    const m = buildMigration(diff());
    expect(m.up).toBe("");
    expect(m.statementCount).toBe(0);
    expect(m.warnings).toEqual([]);
  });

  it("does not repeat the same warning", () => {
    const m = buildMigration(
      diff({
        removedTables: [
          { schema: "public", name: "a" },
          { schema: "public", name: "a" },
        ],
      }),
    );
    expect(m.warnings).toHaveLength(1);
  });
});

describe("formatMigrationScript", () => {
  it("wraps Postgres in a transaction and comments the rollback out", () => {
    const m = buildMigration(diff({ removedTables: [{ schema: "public", name: "old" }] }));
    const script = formatMigrationScript(m, { title: "Drop old" });
    expect(script).toContain("-- Drop old");
    expect(script).toContain("BEGIN;");
    expect(script).toContain("COMMIT;");
    expect(script).toContain("-- Read before running:");
    // Every rollback line is commented, so the whole script is safe to paste.
    const rollback = script.slice(script.indexOf("-- Rollback:"));
    for (const line of rollback.split("\n")) {
      expect(line.startsWith("--")).toBe(true);
    }
  });

  it("does not promise a transaction on MySQL, where DDL commits implicitly", () => {
    const m = buildMigration(diff({ removedTables: [{ schema: "d", name: "old" }] }));
    const script = formatMigrationScript(m, { dialect: "mysql" });
    expect(script).not.toContain("BEGIN;");
    expect(script).not.toContain("COMMIT;");
  });

  it("says so when there is nothing to do", () => {
    expect(formatMigrationScript(buildMigration(diff()))).toContain("-- No changes.");
  });
});
