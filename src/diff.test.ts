import {describe, expect, test} from "bun:test";

import {parseWorkingTreeDiff} from "./diff.js";

describe("working tree diff parsing", () => {
  test("parses hunks, line numbers, notices, and totals", () => {
    const parsed = parseWorkingTreeDiff({
      files: [
        {
          change: {path: "src/example.ts", unstaged: "modified"},
          patch: `diff --git a/src/example.ts b/src/example.ts
index 1111111..2222222 100644
--- a/src/example.ts
+++ b/src/example.ts
@@ -1,3 +1,3 @@
 export const first = 1;
-export const answer = 41;
+export const answer = 42;
 export const last = true;
\\ No newline at end of file
`,
        },
      ],
    });

    expect(parsed.additions).toBe(1);
    expect(parsed.deletions).toBe(1);
    expect(parsed.files[0]?.hunks[0]?.lines).toEqual([
      {content: "export const first = 1;", kind: "context", newLine: 1, oldLine: 1},
      {
        content: "export const answer = 41;",
        intraline: {end: 24, start: 23},
        kind: "deletion",
        oldLine: 2,
      },
      {
        content: "export const answer = 42;",
        intraline: {end: 24, start: 23},
        kind: "addition",
        newLine: 2,
      },
      {content: "export const last = true;", kind: "context", newLine: 3, oldLine: 3},
      {content: "\\ No newline at end of file", kind: "notice"},
    ]);
  });

  test("captures metadata and safe display messages without patch paths", () => {
    const parsed = parseWorkingTreeDiff({
      files: [
        {
          change: {originalPath: "old.bin", path: "new.bin", staged: "renamed"},
          patch: `diff --git a/private/old.bin b/private/new.bin
similarity index 100%
rename from private/old.bin
rename to private/new.bin
Binary files a/private/old.bin and b/private/new.bin differ
`,
        },
      ],
    });

    expect(parsed.files[0]?.details).toEqual(["similarity index 100%"]);
    expect(parsed.files[0]?.message).toBe("Binary file not shown.");
    expect(JSON.stringify(parsed)).not.toContain("private/");
  });
});
