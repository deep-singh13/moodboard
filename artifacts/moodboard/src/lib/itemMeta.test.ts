import { describe, it, expect } from "vitest";
import {
  DEFAULT_QUOTE_COLOR,
  decodeMovieMeta,
  decodePlaceMeta,
  decodeQuoteMeta,
  decodeReelMeta,
  encodeMovieMeta,
  encodePlaceMeta,
  encodeQuoteMeta,
  encodeReelMeta,
} from "@/lib/itemMeta";

const meta = (value: unknown) => ({ meta: JSON.stringify(value) });

describe("malformed input", () => {
  const junk = [
    { meta: undefined },
    { meta: "" },
    { meta: "not json at all" },
    { meta: "{unclosed" },
    { meta: "null" },
    { meta: "42" },
    { meta: '"a string"' },
    { meta: "[1,2,3]" },
  ];

  it("decodes to defaults rather than throwing", () => {
    for (const item of junk) {
      expect(() => decodeQuoteMeta(item)).not.toThrow();
      expect(decodeQuoteMeta(item).color).toBe(DEFAULT_QUOTE_COLOR);
      expect(decodeMovieMeta(item)).toEqual({
        imdbId: undefined,
        year: undefined,
        genre: undefined,
        rating: undefined,
        director: undefined,
      });
      expect(decodePlaceMeta(item).photos).toEqual([]);
      expect(decodeReelMeta(item).username).toBeUndefined();
    }
  });
});

describe("field validation", () => {
  it("drops a wrong-typed place rating instead of handing it to toFixed", () => {
    // The exact hazard: `rating` is a string on a movie and a number on a
    // place, and PlaceCard calls .toFixed(1) on it.
    const decoded = decodePlaceMeta(meta({ rating: "7.8" }));
    expect(decoded.rating).toBeUndefined();
  });

  it("keeps a well-typed place rating", () => {
    expect(decodePlaceMeta(meta({ rating: 4.5 })).rating).toBe(4.5);
  });

  it("rejects non-finite numbers", () => {
    // NaN and Infinity are not representable in JSON and arrive as null.
    expect(decodePlaceMeta({ meta: '{"lat":null}' }).lat).toBeUndefined();
    expect(decodePlaceMeta(meta({ ratingCount: "many" })).ratingCount).toBeUndefined();
  });

  it("keeps a movie rating as the string OMDB gives", () => {
    expect(decodeMovieMeta(meta({ rating: "7.8" })).rating).toBe("7.8");
  });

  it("filters non-strings out of list fields", () => {
    const decoded = decodePlaceMeta(meta({ photos: ["a", 3, null, "b"] }));
    expect(decoded.photos).toEqual(["a", "b"]);
  });

  it("coerces a non-array list field to an empty array", () => {
    expect(decodePlaceMeta(meta({ cuisines: "Italian" })).cuisines).toEqual([]);
  });

  it("only accepts the two known place sources", () => {
    expect(decodePlaceMeta(meta({ source: "district" })).source).toBe("district");
    expect(decodePlaceMeta(meta({ source: "manual" })).source).toBe("manual");
    expect(decodePlaceMeta(meta({ source: "yelp" })).source).toBeUndefined();
  });

  it("falls back when a quote colour is not a string", () => {
    expect(decodeQuoteMeta(meta({ color: 7 })).color).toBe(DEFAULT_QUOTE_COLOR);
  });
});

describe("round trip", () => {
  it("survives encode then decode for a quote", () => {
    const encoded = encodeQuoteMeta({ color: "honey" });
    expect(decodeQuoteMeta({ meta: encoded }).color).toBe("honey");
  });

  it("survives encode then decode for a movie", () => {
    const encoded = encodeMovieMeta({ imdbId: "tt0111161", year: "1994" });
    expect(decodeMovieMeta({ meta: encoded })).toMatchObject({
      imdbId: "tt0111161",
      year: "1994",
    });
  });

  it("survives encode then decode for a reel", () => {
    const encoded = encodeReelMeta({ username: "someone", reel_url: "https://x/y" });
    expect(decodeReelMeta({ meta: encoded })).toEqual({
      username: "someone",
      reel_url: "https://x/y",
    });
  });

  it("survives encode then decode for a place", () => {
    const encoded = encodePlaceMeta({
      address: "12 Some Road",
      lat: 28.5,
      lng: 77.2,
      cuisines: ["Italian"],
      rating: 4.3,
      source: "district",
    });
    expect(decodePlaceMeta({ meta: encoded })).toMatchObject({
      address: "12 Some Road",
      lat: 28.5,
      lng: 77.2,
      cuisines: ["Italian"],
      rating: 4.3,
      source: "district",
    });
  });
});

describe("merge on encode", () => {
  it("preserves keys the patch does not mention", () => {
    // The bug this replaces: editing a quote's colour used to write
    // JSON.stringify({ color }) and drop everything else on the row.
    const stored = JSON.stringify({ color: "honey", sourceBook: "Dune" });
    const encoded = encodeQuoteMeta({ color: "rosette" }, stored);

    expect(JSON.parse(encoded)).toEqual({
      color: "rosette",
      sourceBook: "Dune",
    });
  });

  it("preserves keys the codec itself does not know about", () => {
    const stored = JSON.stringify({ rating: 4.1, futureField: { a: 1 } });
    const encoded = encodePlaceMeta({ rating: 4.9 }, stored);

    expect(JSON.parse(encoded)).toEqual({ rating: 4.9, futureField: { a: 1 } });
  });

  it("ignores undefined values in the patch rather than writing nulls", () => {
    const stored = JSON.stringify({ color: "honey" });
    const encoded = encodeQuoteMeta({ color: undefined }, stored);

    expect(JSON.parse(encoded)).toEqual({ color: "honey" });
  });

  it("writes fresh when there is nothing stored", () => {
    expect(JSON.parse(encodeQuoteMeta({ color: "sea-salt" }))).toEqual({
      color: "sea-salt",
    });
  });

  it("treats unparseable stored meta as empty rather than losing the patch", () => {
    const encoded = encodeQuoteMeta({ color: "sea-salt" }, "{corrupt");
    expect(JSON.parse(encoded)).toEqual({ color: "sea-salt" });
  });
});
