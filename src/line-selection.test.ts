import {describe, expect, test} from "bun:test";

import {formatLineHash, parseLineHash} from "./line-selection.js";

describe("line selection hashes", () => {
  test("parses single lines and normalized ranges", () => {
    expect(parseLineHash("#L12")).toEqual({end: 12, start: 12});
    expect(parseLineHash("#L12-L18")).toEqual({end: 18, start: 12});
    expect(parseLineHash("#L18-L12")).toEqual({end: 18, start: 12});
  });

  test("rejects malformed and unsafe line hashes", () => {
    for (const hash of ["", "#heading", "#l1", "#L0", "#L1-L0", "#L1-L", "#L9007199254740992"]) {
      expect(parseLineHash(hash)).toBeUndefined();
    }
  });

  test("formats single lines and ordered ranges", () => {
    expect(formatLineHash(12, 12)).toBe("#L12");
    expect(formatLineHash(12, 18)).toBe("#L12-L18");
    expect(formatLineHash(18, 12)).toBe("#L12-L18");
  });
});
