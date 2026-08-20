import { describe, it, expect } from "vitest";
import {
  ITEM_TYPES,
  BOARDS,
  InvalidItemError,
  assertValidId,
  assertValidType,
  assertValidBoard,
  assertValidMeta,
  imageColumns,
  buildUpdateAssignments,
} from "./itemValidation";

const VALID_UUID = "1b3f2c40-9a3e-4d3f-8a2b-6f7e5c4d3b2a";

describe("assertValidId", () => {
  it("accepts a UUID", () => {
    expect(() => assertValidId(VALID_UUID)).not.toThrow();
  });

  it("accepts an upper-case UUID", () => {
    expect(() => assertValidId(VALID_UUID.toUpperCase())).not.toThrow();
  });

  it.each([
    ["empty string", ""],
    ["not a UUID at all", "hello"],
    ["a UUID missing a segment", "1b3f2c40-9a3e-4d3f-8a2b"],
    ["a number", 42],
    ["null", null],
    ["undefined", undefined],
  ])("rejects %s", (_label, value) => {
    expect(() => assertValidId(value)).toThrow(InvalidItemError);
  });
});

describe("assertValidType", () => {
  it("accepts every declared item type", () => {
    for (const type of ITEM_TYPES) {
      expect(() => assertValidType(type)).not.toThrow();
    }
  });

  it("rejects a type outside the known set", () => {
    expect(() => assertValidType("gif")).toThrow(InvalidItemError);
  });

  it("rejects a non-string type", () => {
    expect(() => assertValidType(123)).toThrow(InvalidItemError);
  });
});

describe("assertValidBoard", () => {
  it("accepts undefined — the default-to-moodboard case", () => {
    expect(() => assertValidBoard(undefined)).not.toThrow();
  });

  it("accepts every declared board", () => {
    for (const board of BOARDS) {
      expect(() => assertValidBoard(board)).not.toThrow();
    }
  });

  it("rejects a board outside the known set", () => {
    expect(() => assertValidBoard("scratchpad")).toThrow(InvalidItemError);
  });
});

describe("assertValidMeta", () => {
  it("accepts absent meta", () => {
    expect(() => assertValidMeta(undefined)).not.toThrow();
    expect(() => assertValidMeta(null)).not.toThrow();
  });

  it("accepts a JSON object string", () => {
    expect(() => assertValidMeta('{"color":"honey"}')).not.toThrow();
    expect(() => assertValidMeta("{}")).not.toThrow();
  });

  it.each([
    ["not JSON at all", "not json"],
    ["a JSON array", "[1,2,3]"],
    ["a JSON string primitive", '"hello"'],
    ["a JSON number", "42"],
    ["JSON null", "null"],
    ["a non-string value", 42],
  ])("rejects %s", (_label, value) => {
    expect(() => assertValidMeta(value)).toThrow(InvalidItemError);
  });
});

describe("imageColumns", () => {
  it("routes a data URL to image_data", () => {
    expect(imageColumns("data:image/webp;base64,abc123")).toEqual({
      imageUrlColumn: null,
      imageDataColumn: "data:image/webp;base64,abc123",
    });
  });

  it("routes a regular URL to image_url", () => {
    expect(imageColumns("https://example.com/photo.jpg")).toEqual({
      imageUrlColumn: "https://example.com/photo.jpg",
      imageDataColumn: null,
    });
  });

  it("returns both columns null for an absent image", () => {
    expect(imageColumns(undefined)).toEqual({ imageUrlColumn: null, imageDataColumn: null });
    expect(imageColumns(null)).toEqual({ imageUrlColumn: null, imageDataColumn: null });
  });
});

describe("buildUpdateAssignments", () => {
  it("returns nothing for an empty patch", () => {
    expect(buildUpdateAssignments({})).toEqual([]);
  });

  it("includes only the keys present in the patch — this is the presence check that replaces the old !== undefined / \"x\" in body split", () => {
    const assignments = buildUpdateAssignments({ title: "New title" });
    expect(assignments).toEqual([{ column: "title", value: "New title" }]);
  });

  it("does not include a key that was never in the patch", () => {
    const assignments = buildUpdateAssignments({ title: "New title" });
    expect(assignments.some((a) => a.column === "note")).toBe(false);
  });

  it("maps completed and pinned straight through", () => {
    expect(buildUpdateAssignments({ completed: true })).toEqual([
      { column: "completed", value: true },
    ]);
    expect(buildUpdateAssignments({ pinned: false })).toEqual([
      { column: "pinned", value: false },
    ]);
  });

  it("normalizes an explicit null to null on nullable text fields", () => {
    expect(buildUpdateAssignments({ note: null })).toEqual([{ column: "note", value: null }]);
    expect(buildUpdateAssignments({ subtitle: null })).toEqual([
      { column: "subtitle", value: null },
    ]);
  });

  it("splits imageUrl into both image columns via the same storage policy as insert", () => {
    const dataUrlAssignments = buildUpdateAssignments({ imageUrl: "data:image/webp;base64,xyz" });
    expect(dataUrlAssignments).toEqual([
      { column: "image_url", value: null },
      { column: "image_data", value: "data:image/webp;base64,xyz" },
    ]);

    const linkAssignments = buildUpdateAssignments({ imageUrl: "https://example.com/a.jpg" });
    expect(linkAssignments).toEqual([
      { column: "image_url", value: "https://example.com/a.jpg" },
      { column: "image_data", value: null },
    ]);
  });

  it("clearing imageUrl (null) clears both columns", () => {
    expect(buildUpdateAssignments({ imageUrl: null })).toEqual([
      { column: "image_url", value: null },
      { column: "image_data", value: null },
    ]);
  });

  it("builds one assignment per present field, all in one pass — no positional coupling to work out by hand", () => {
    const assignments = buildUpdateAssignments({
      title: "T",
      note: "N",
      pinned: true,
      imageUrl: "https://example.com/a.jpg",
    });
    expect(assignments.map((a) => a.column)).toEqual([
      "pinned",
      "note",
      "title",
      "image_url",
      "image_data",
    ]);
  });
});
