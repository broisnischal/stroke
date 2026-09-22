import { describe, it, expect } from "vitest";
import {
  dialectForEngine,
  extractSqlParams,
  formatParamLiteral,
  missingSqlParams,
  substituteSqlParams,
} from "./sql-params.js";

const names = (/** @type {string} */ sql) => extractSqlParams(sql).map((p) => p.name);

describe("extractSqlParams", () => {
  it("finds parameters in first-appearance order, without duplicates", () => {
    expect(names("SELECT * FROM t WHERE a = :b AND c = :a AND d = :b")).toEqual(["b", "a"]);
  });

  it("ignores a Postgres :: cast", () => {
    expect(names("SELECT '1'::int, x::text FROM t")).toEqual([]);
  });

  it("ignores colons inside strings, identifiers and comments", () => {
    expect(names("SELECT ':nope' FROM t")).toEqual([]);
    expect(names('SELECT ":nope" FROM t')).toEqual([]);
    expect(names("SELECT 1 -- :nope\n")).toEqual([]);
    expect(names("SELECT 1 /* :nope */")).toEqual([]);
    expect(names("SELECT $$ :nope $$")).toEqual([]);
  });

  it("records every position of a repeated parameter", () => {
    const [p] = extractSqlParams("SELECT :x, :x");
    expect(p.positions).toHaveLength(2);
  });
});

describe("formatParamLiteral", () => {
  it("passes numbers, booleans and NULL through in auto mode", () => {
    expect(formatParamLiteral("42", "auto")).toBe("42");
    expect(formatParamLiteral("-1.5e3", "auto")).toBe("-1.5e3");
    expect(formatParamLiteral("true", "auto")).toBe("TRUE");
    expect(formatParamLiteral("null", "auto")).toBe("NULL");
  });

  it("quotes anything else", () => {
    expect(formatParamLiteral("Ada", "auto")).toBe("'Ada'");
    expect(formatParamLiteral("42", "text")).toBe("'42'");
  });

  it("emits NULL and raw text for their modes", () => {
    expect(formatParamLiteral("anything", "null")).toBe("NULL");
    expect(formatParamLiteral("now()", "raw")).toBe("now()");
  });

  it("doubles an embedded quote", () => {
    expect(formatParamLiteral("it's", "text")).toBe("'it''s'");
  });

  it("leaves a backslash alone under standard rules", () => {
    // In Postgres and SQLite a backslash is just a character. Escaping it here
    // would store two of them.
    expect(formatParamLiteral("a\\b", "text")).toBe("'a\\b'");
    expect(formatParamLiteral("trailing\\", "text")).toBe("'trailing\\'");
  });

  it("escapes a backslash for MySQL so a value cannot break out of its quotes", () => {
    expect(formatParamLiteral("a\\b", "text", "backslash")).toBe("'a\\\\b'");
    // The injection case: under MySQL rules the old output `'\'' OR 1=1 -- '`
    // closed the literal and ran the rest as SQL.
    const attack = "\\' OR 1=1 -- ";
    const literal = formatParamLiteral(attack, "text", "backslash");
    expect(literal).toBe("'\\\\'' OR 1=1 -- '");
    // Every backslash is paired, so none of them escapes a quote.
    const body = literal.slice(1, -1);
    expect(body.replace(/\\\\/g, "")).not.toContain("\\");
  });
});

describe("dialectForEngine", () => {
  it("only MySQL uses backslash escapes", () => {
    expect(dialectForEngine("mysql")).toBe("backslash");
    expect(dialectForEngine("postgres")).toBe("standard");
    expect(dialectForEngine("sqlite")).toBe("standard");
    expect(dialectForEngine(null)).toBe("standard");
  });
});

describe("missingSqlParams", () => {
  it("reports a parameter with no entry", () => {
    expect(missingSqlParams("SELECT :a", {}).map((p) => p.name)).toEqual(["a"]);
  });

  it("treats an explicit empty string and NULL as satisfied", () => {
    expect(missingSqlParams("SELECT :a", { a: { value: "", mode: "text" } })).toEqual([]);
    expect(missingSqlParams("SELECT :a", { a: { value: "", mode: "null" } })).toEqual([]);
  });

  it("reports a blank auto value", () => {
    expect(missingSqlParams("SELECT :a", { a: { value: "  ", mode: "auto" } })).toHaveLength(1);
  });
});

describe("substituteSqlParams", () => {
  it("replaces every occurrence", () => {
    const out = substituteSqlParams("SELECT :x, :x", { x: { value: "1", mode: "auto" } });
    expect(out).toBe("SELECT 1, 1");
  });

  it("leaves parameters without a value untouched", () => {
    expect(substituteSqlParams("SELECT :a, :b", { a: { value: "1", mode: "auto" } })).toBe(
      "SELECT 1, :b",
    );
  });

  it("does not touch a lookalike inside a string", () => {
    const sql = "SELECT ':x', :x";
    expect(substituteSqlParams(sql, { x: { value: "1", mode: "auto" } })).toBe("SELECT ':x', 1");
  });

  it("substitutes right-to-left so earlier positions stay valid", () => {
    // A long replacement for the first parameter would shift the second one's
    // offsets if the replacements ran forwards.
    const out = substituteSqlParams("SELECT :a, :b", {
      a: { value: "a-very-long-value", mode: "text" },
      b: { value: "2", mode: "auto" },
    });
    expect(out).toBe("SELECT 'a-very-long-value', 2");
  });

  it("uses the dialect it is given", () => {
    const values = { x: { value: "back\\slash", mode: /** @type {const} */ ("text") } };
    expect(substituteSqlParams("SELECT :x", values)).toBe("SELECT 'back\\slash'");
    expect(substituteSqlParams("SELECT :x", values, "backslash")).toBe("SELECT 'back\\\\slash'");
  });
});
