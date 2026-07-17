import {afterEach, describe, expect, test} from "bun:test";
import {access, mkdtemp, mkdir, rename, rm, writeFile} from "node:fs/promises";
import {tmpdir} from "node:os";
import path from "node:path";

import {GitRepository, parseGitStatus} from "./git.js";

const temporaryDirectories: string[] = [];
const nullDevice = process.platform === "win32" ? "NUL" : "/dev/null";

async function temporaryDirectory(): Promise<string> {
  const directory = await mkdtemp(path.join(tmpdir(), "md-git-"));
  temporaryDirectories.push(directory);
  return directory;
}

async function git(root: string, arguments_: readonly string[]): Promise<string> {
  const process = Bun.spawn(["git", ...arguments_], {
    cwd: root,
    env: {
      ...Bun.env,
      GIT_CONFIG_GLOBAL: nullDevice,
      GIT_CONFIG_NOSYSTEM: "1",
      GIT_TERMINAL_PROMPT: "0",
    },
    stderr: "pipe",
    stdout: "pipe",
  });
  const [exitCode, stdout, stderr] = await Promise.all([
    process.exited,
    new Response(process.stdout).text(),
    new Response(process.stderr).text(),
  ]);
  if (exitCode !== 0) throw new Error(stderr.trim() || `git exited with ${exitCode}`);
  return stdout;
}

afterEach(async () => {
  await Promise.all(
    temporaryDirectories
      .splice(0)
      .map((directory) => rm(directory, {force: true, recursive: true})),
  );
});

describe("Git status parsing", () => {
  test("parses porcelain v2 records and strips the served-directory prefix", () => {
    const fields = {
      ordinary: "1 .M N... 100644 100644 100644 abc def root/file with spaces.txt",
      rename: "2 R. N... 100644 100644 100644 abc def R100 root/new name.txt",
      unmerged: "u UU N... 100644 100644 100644 100644 abc def fed root/conflict.txt",
    };
    const status = parseGitStatus(
      [
        "# branch.oid 0123456789abcdef",
        "# branch.head (detached)",
        fields.ordinary,
        fields.rename,
        "root/old name.txt",
        fields.unmerged,
        "? root/untracked.txt",
        "? outside.txt",
        "",
      ].join("\0"),
      "root",
    );

    expect(status.branch).toBe("HEAD");
    expect(status.detached).toBe(true);
    expect(status.head).toBe("0123456789abcdef");
    expect(status.changes).toEqual([
      {path: "file with spaces.txt", unstaged: "modified"},
      {originalPath: "old name.txt", path: "new name.txt", staged: "renamed"},
      {conflicted: true, path: "conflict.txt"},
      {path: "untracked.txt", untracked: true},
    ]);
  });
});

describe("GitRepository", () => {
  test("returns undefined outside a repository", async () => {
    expect(await GitRepository.open(await temporaryDirectory())).toBeUndefined();
  });

  test("loads commit history and live staged and unstaged changes", async () => {
    const root = await temporaryDirectory();
    await git(root, ["init", "-b", "main"]);
    await mkdir(path.join(root, "src"));
    await writeFile(path.join(root, "README.md"), "# Initial\n");
    await writeFile(path.join(root, "delete.txt"), "remove me\n");
    await writeFile(path.join(root, "old.txt"), "rename me\n");
    await writeFile(path.join(root, "src", "example.ts"), "export const value = 1;\n");
    await git(root, ["add", "."]);
    await git(root, [
      "-c",
      "user.name=md test",
      "-c",
      "user.email=md@example.com",
      "commit",
      "-m",
      "initial commit",
    ]);

    await writeFile(path.join(root, "README.md"), "# Modified\n");
    await writeFile(path.join(root, "staged.ts"), "export const staged = 1;\n");
    await git(root, ["add", "staged.ts"]);
    await writeFile(path.join(root, "staged.ts"), "export const staged = 2;\n");
    await writeFile(path.join(root, "untracked.txt"), "new\n");
    await rm(path.join(root, "delete.txt"));
    await rename(path.join(root, "old.txt"), path.join(root, "renamed.txt"));
    await git(root, ["add", "old.txt", "renamed.txt"]);

    const repository = await GitRepository.open(root);
    expect(repository).toBeDefined();
    const info = await repository!.directoryInfo(
      [],
      [
        {isDirectory: false, name: "README.md"},
        {isDirectory: false, name: "renamed.txt"},
        {isDirectory: true, name: "src"},
        {isDirectory: false, name: "staged.ts"},
        {isDirectory: false, name: "untracked.txt"},
      ],
    );

    expect(info?.branch).toBe("main");
    expect(info?.detached).toBe(false);
    expect(info?.commit?.summary).toBe("initial commit");
    expect(info?.entries.get("README.md")?.commit?.summary).toBe("initial commit");
    expect(info?.entries.get("src")?.commit?.summary).toBe("initial commit");
    expect(info?.entries.get("untracked.txt")?.commit).toBeUndefined();
    expect(info?.changes).toHaveLength(5);
    expect(info?.changes).toEqual(
      expect.arrayContaining([
        {path: "README.md", unstaged: "modified"},
        {path: "delete.txt", unstaged: "deleted"},
        {originalPath: "old.txt", path: "renamed.txt", staged: "renamed"},
        {path: "staged.ts", staged: "added", unstaged: "modified"},
        {path: "untracked.txt", untracked: true},
      ]),
    );
    expect(info?.entries.get("staged.ts")?.changes).toEqual([
      {path: "staged.ts", staged: "added", unstaged: "modified"},
    ]);

    await git(root, ["add", "README.md"]);
    const refreshed = await repository!.directoryInfo(
      [],
      [{isDirectory: false, name: "README.md"}],
    );
    expect(refreshed?.entries.get("README.md")?.changes).toEqual([
      {path: "README.md", staged: "modified"},
    ]);

    await writeFile(path.join(root, "src", "example.ts"), "export const value = 2;\n");
    const subdirectoryRepository = await GitRepository.open(path.join(root, "src"));
    const subdirectory = await subdirectoryRepository?.directoryInfo(
      [],
      [{isDirectory: false, name: "example.ts"}],
    );
    expect(subdirectory?.commit?.summary).toBe("initial commit");
    expect(subdirectory?.changes).toEqual([{path: "example.ts", unstaged: "modified"}]);
    expect(subdirectory?.entries.get("example.ts")?.commit?.summary).toBe("initial commit");

    await writeFile(path.join(root, ".gitattributes"), "*.md filter=evil\n");
    await git(root, ["config", "filter.evil.clean", "git config --file filter-ran executed true"]);
    await writeFile(path.join(root, "README.md"), "# Filtered change\n");
    await repository!.directoryInfo([], [{isDirectory: false, name: "README.md"}]);
    const filterRan = await access(path.join(root, "filter-ran")).then(
      () => true,
      () => false,
    );
    expect(filterRan).toBe(false);
  });
});
