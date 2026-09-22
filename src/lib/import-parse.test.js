import { describe, it, expect } from "vitest";
import {
  autoMapFields,
  coerceValue,
  parseDelimited,
  parseImportText,
  parseJsonRecords,
  sniffDelimiter,
  toTypedRows,
} from "./import-parse.js";

describe("parseDelimited", () => {
  it("reads a header and body", () => {
    const { fields, rows } = parseDelimited("id,name\n1,Ada\n2,Grace\n");
    expect(fields).toEqual(["id", "name"]);
    expect(rows).toEqual([
      ["1", "Ada"],
      ["2", "Grace"],
    ]);
  });

  it("keeps delimiters, newlines and quotes inside a quoted field", () => {
    const { rows } = parseDelimited('id,note\n1,"a,b\nc ""quoted"""\n');
    expect(rows).toEqual([["1", 'a,b\nc "quoted"']]);
  });

  it("handles CRLF endings", () => {
    const { fields, rows } = parseDelimited("id,name\r\n1,Ada\r\n");
    expect(fields).toEqual(["id", "name"]);
    expect(rows).toEqual([["1", "Ada"]]);
  });

  it("does not invent a row from a trailing newline", () => {
    expect(parseDelimited("id\n1\n2\n").rows).toHaveLength(2);
    expect(parseDelimited("id\n1\n2").rows).toHaveLength(2);
  });

  it("strips a byte-order mark from the first field name", () => {
    const { fields } = parseDelimited("﻿id,name\n1,Ada\n");
    expect(fields).toEqual(["id", "name"]);
  });

  it("names columns positionally when there is no header", () => {
    const { fields, rows } = parseDelimited("1,Ada\n", { hasHeader: false });
    expect(fields).toEqual(["column_1", "column_2"]);
    expect(rows).toEqual([["1", "Ada"]]);
  });

  it("reads tab-separated text", () => {
    const { fields, rows } = parseDelimited("id\tname\n1\tAda\n", { delimiter: "\t" });
    expect(fields).toEqual(["id", "name"]);
    expect(rows).toEqual([["1", "Ada"]]);
  });
});

describe("sniffDelimiter", () => {
  it("picks the delimiter that gives consistent rows, not the most frequent character", () => {
    // Commas appear more often, but only the semicolon splits every row evenly.
    const text = "name;note\nAda;one, two, three\nGrace;four, five, six\n";
    expect(sniffDelimiter(text)).toBe(";");
  });

  it("finds tabs", () => {
    expect(sniffDelimiter("a\tb\n1\t2\n")).toBe("\t");
  });

  it("falls back to a comma for a single column", () => {
    expect(sniffDelimiter("name\nAda\n")).toBe(",");
  });
});

describe("parseJsonRecords", () => {
  it("reads an array of objects", () => {
    const { fields, rows } = parseJsonRecords('[{"id":1,"name":"Ada"}]');
    expect(fields).toEqual(["id", "name"]);
    expect(rows).toEqual([[1, "Ada"]]);
  });

  it("reads JSONL", () => {
    const { fields, rows } = parseJsonRecords('{"id":1}\n{"id":2}\n');
    expect(fields).toEqual(["id"]);
    expect(rows).toEqual([[1], [2]]);
  });

  it("unions keys across records and fills the gaps with null", () => {
    const { fields, rows } = parseJsonRecords('[{"id":1},{"id":2,"name":"Ada"}]');
    expect(fields).toEqual(["id", "name"]);
    expect(rows).toEqual([
      [1, null],
      [2, "Ada"],
    ]);
  });

  it("rejects records that are not objects", () => {
    expect(() => parseJsonRecords("[1,2,3]")).toThrow(/must be a JSON object/);
  });

  it("names the line that failed to parse", () => {
    expect(() => parseJsonRecords('{"id":1}\nnot json\n')).toThrow(/Line 2/);
  });
});

describe("parseImportText", () => {
  it("detects JSON by its first character", () => {
    expect(parseImportText('[{"id":1}]').format).toBe("json");
    expect(parseImportText("id,name\n1,Ada\n").format).toBe("delimited");
  });
});

describe("coerceValue", () => {
  it("turns empty text into null by default", () => {
    expect(coerceValue("")).toBeNull();
    expect(coerceValue("", { emptyAsNull: false })).toBe("");
  });

  it("honours an explicit null spelling", () => {
    expect(coerceValue("NULL", { nullText: "NULL" })).toBeNull();
    expect(coerceValue("NULL")).toBe("NULL");
  });

  it("converts plain numbers and booleans", () => {
    expect(coerceValue("42")).toBe(42);
    expect(coerceValue("-1.5")).toBe(-1.5);
    expect(coerceValue("true")).toBe(true);
    expect(coerceValue("false")).toBe(false);
  });

  it("keeps leading-zero codes as text", () => {
    // Losing this turns a product code or a zip into a different value.
    expect(coerceValue("007")).toBe("007");
    expect(coerceValue("01234")).toBe("01234");
  });

  it("keeps integers too large to round-trip as text", () => {
    const big = "9007199254740993"; // 2^53 + 1
    expect(coerceValue(big)).toBe(big);
  });

  it("leaves values that only look numeric alone", () => {
    expect(coerceValue("1,5")).toBe("1,5");
    expect(coerceValue(" 42")).toBe(" 42");
    expect(coerceValue("+42")).toBe("+42");
    expect(coerceValue("1e999")).toBe("1e999");
  });

  it("passes typed JSON values straight through", () => {
    expect(coerceValue(42)).toBe(42);
    expect(coerceValue(null)).toBeNull();
    expect(coerceValue({ a: 1 })).toEqual({ a: 1 });
  });

  it("can be told not to convert", () => {
    expect(coerceValue("42", { parseNumbers: false })).toBe("42");
    expect(coerceValue("true", { parseBooleans: false })).toBe("true");
  });
});

describe("autoMapFields", () => {
  it("matches across case, spaces, dashes and underscores", () => {
    expect(autoMapFields(["first_name", "id"], ["First Name", "ID"])).toEqual({
      first_name: "First Name",
      id: "ID",
    });
  });

  it("leaves a column unmapped when nothing matches", () => {
    expect(autoMapFields(["created_at"], ["id"])).toEqual({ created_at: "" });
  });
});

describe("toTypedRows", () => {
  it("reorders fields to the target column order and coerces", () => {
    const rows = [["Ada", "1"]];
    const fields = ["name", "id"];
    const mapping = { id: "id", name: "name" };
    expect(toTypedRows(rows, fields, mapping, ["id", "name"])).toEqual([[1, "Ada"]]);
  });

  it("sends null for a column with no mapped field", () => {
    const rows = [["Ada"]];
    expect(toTypedRows(rows, ["name"], { id: "", name: "name" }, ["id", "name"])).toEqual([
      [null, "Ada"],
    ]);
  });
});
