import {describe, expect, test} from "bun:test";

import generatedSnapshot from "../demo-git/generated.json" with {type: "json"};
import {generateDemoGitSnapshot} from "../scripts/generate-demo-git.js";
import type {DemoGitSnapshotData} from "./demo-git-data.js";

const snapshot = generatedSnapshot as DemoGitSnapshotData;

describe("generated demo Git data", () => {
  test("matches a freshly generated repository snapshot", async () => {
    expect(await generateDemoGitSnapshot()).toEqual(snapshot);
  });

  test("contains real patches for the bundled demo files", () => {
    const files = new Map(snapshot.diffs[""]!.files.map((file) => [file.change.path, file.patch]));

    expect(files.get("example.ts")).toContain("-  return `${message}, ${recipient}.`;");
    expect(files.get("example.ts")).toContain("+  return `${message}, ${recipient}!`;");
    expect(files.get("example.ts")).toContain('recipient: "world"');
    expect(files.get("example.ts")).toContain('recipient: "Peruse"');
    expect(files.get(".hidden/workflow.yaml")).toContain(
      '+  file: "demo-files/.hidden/workflow.yaml"',
    );
    expect(files.get("draft.md")).toContain("-This file is staged for deletion in the demo.");
  });
});
