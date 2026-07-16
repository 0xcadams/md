import {afterEach, describe, expect, test} from "bun:test";
import {mkdtemp, mkdir, rm, symlink, writeFile} from "node:fs/promises";
import {tmpdir} from "node:os";
import path from "node:path";

import {
  encodeUrlPath,
  formatSize,
  isMarkdown,
  isTextContent,
  languageForFile,
  RootFileSystem,
} from "./filesystem.js";

const temporaryDirectories: string[] = [];

async function temporaryDirectory(): Promise<string> {
  const directory = await mkdtemp(path.join(tmpdir(), "md-"));
  temporaryDirectories.push(directory);
  return directory;
}

afterEach(async () => {
  await Promise.all(
    temporaryDirectories
      .splice(0)
      .map((directory) => rm(directory, {force: true, recursive: true})),
  );
});

describe("RootFileSystem", () => {
  test("sorts directories first and encodes URLs", async () => {
    const root = await temporaryDirectory();
    await mkdir(path.join(root, "a folder"));
    await writeFile(path.join(root, "z.txt"), "hello");
    const files = await RootFileSystem.open(root);
    const resolved = await files.resolvePathname("/");
    expect(resolved).toBeDefined();
    const entries = await files.list(resolved!);
    expect(entries.map((entry) => entry.name)).toEqual(["a folder", "z.txt"]);
    expect(entries[0]?.url).toBe("/a%20folder/");
  });

  test("rejects malformed paths, .git, and escaping symlinks", async () => {
    const root = await temporaryDirectory();
    const outside = await temporaryDirectory();
    await mkdir(path.join(root, ".git"));
    await writeFile(path.join(outside, "secret.txt"), "secret");
    await symlink(path.join(outside, "secret.txt"), path.join(root, "escape.txt"));
    await symlink(path.join(root, ".git"), path.join(root, "git-alias"));
    const files = await RootFileSystem.open(root);

    expect(await files.resolvePathname("/%E0%A4%A")).toBeUndefined();
    expect(await files.resolvePathname("/.git/config")).toBeUndefined();
    expect(await files.resolvePathname("/escape.txt")).toBeUndefined();
    expect(await files.resolvePathname("/git-alias")).toBeUndefined();
    const resolved = await files.resolvePathname("/");
    expect((await files.list(resolved!)).map((entry) => entry.name)).toEqual([]);
  });

  test("indexes Markdown files for wiki links", async () => {
    const root = await temporaryDirectory();
    await mkdir(path.join(root, "guides"));
    await writeFile(path.join(root, "guides", "Getting Started.md"), "# Start");
    const index = await (await RootFileSystem.open(root)).buildWikiIndex();
    expect(index.get("getting started")).toBe("/guides/Getting%20Started.md");
    expect(index.get("getting started.md")).toBe("/guides/Getting%20Started.md");
  });
});

describe("file helpers", () => {
  test("classifies common files", () => {
    expect(isMarkdown("README.MD")).toBe(true);
    expect(languageForFile("component.tsx")).toBe("tsx");
    expect(languageForFile("Dockerfile")).toBe("dockerfile");
    expect(isTextContent("unknown", new TextEncoder().encode("plain text"))).toBe(true);
    expect(isTextContent("unknown", Uint8Array.from([0, 1, 2]))).toBe(false);
  });

  test("formats paths and sizes", () => {
    expect(encodeUrlPath(["a b", "readme.md"])).toBe("/a%20b/readme.md");
    expect(formatSize(900)).toBe("900 B");
    expect(formatSize(1536)).toBe("1.5 KB");
  });
});
