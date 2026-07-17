import {afterEach, describe, expect, test} from "bun:test";
import {access, mkdtemp, mkdir, realpath, rename, rm, symlink, writeFile} from "node:fs/promises";
import {tmpdir} from "node:os";
import path from "node:path";

import {GitRepository, GitRepositoryResolver, parseGitStatus} from "./git.js";

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

async function commitAll(root: string, message: string): Promise<void> {
  await git(root, ["add", "."]);
  await git(root, [
    "-c",
    "user.name=md test",
    "-c",
    "user.email=md@example.com",
    "commit",
    "-m",
    message,
  ]);
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

    const caseInsensitive = parseGitStatus(
      [
        "# branch.oid 0123456789abcdef",
        "# branch.head main",
        "1 .M N... 100644 100644 100644 abc def src/Example.ts",
        "",
      ].join("\0"),
      "Src",
      true,
    );
    expect(caseInsensitive.changes).toEqual([{path: "Example.ts", unstaged: "modified"}]);
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
    await git(root, ["remote", "add", "origin", "git@github.com:octo-org/example.git"]);
    await git(root, ["branch", "release"]);
    await git(root, ["tag", "v1"]);

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
    expect(info?.branchCount).toBe(2);
    expect(info?.commit?.author).toBe("md test");
    expect(info?.detached).toBe(false);
    expect(info?.commit?.summary).toBe("initial commit");
    expect(info?.commitCount).toBe(1);
    expect(info?.repositoryUrl).toBe("https://github.com/octo-org/example");
    expect(info?.tagCount).toBe(1);
    expect(info?.entries.get("README.md")?.repositoryPath).toBe("README.md");
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
    await git(root, ["remote", "set-url", "origin", "https://gitlab.com/octo-org/example.git"]);
    await git(root, ["remote", "add", "upstream", "https://github.com/octo-org/upstream.git"]);
    const refreshed = await repository!.directoryInfo(
      [],
      [{isDirectory: false, name: "README.md"}],
    );
    expect(refreshed?.entries.get("README.md")?.changes).toEqual([
      {path: "README.md", staged: "modified"},
    ]);
    expect(refreshed?.repositoryUrl).toBe("https://github.com/octo-org/upstream");

    await git(root, [
      "remote",
      "set-url",
      "upstream",
      "ssh://git@gitlab.com/octo-org/upstream.git",
    ]);
    const withoutGitHub = await repository!.directoryInfo(
      [],
      [{isDirectory: false, name: "README.md"}],
    );
    expect(withoutGitHub?.repositoryUrl).toBeUndefined();

    await writeFile(path.join(root, "src", "example.ts"), "export const value = 2;\n");
    const subdirectoryRepository = await GitRepository.open(path.join(root, "src"));
    const subdirectory = await subdirectoryRepository?.directoryInfo(
      [],
      [{isDirectory: false, name: "example.ts"}],
    );
    expect(subdirectory?.commit?.summary).toBe("initial commit");
    expect(subdirectory?.changes).toEqual([{path: "example.ts", unstaged: "modified"}]);
    expect(subdirectory?.entries.get("example.ts")?.repositoryPath).toBe("src/example.ts");
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

describe("GitRepositoryResolver", () => {
  test("resolves sibling repositories and rebases nested paths", async () => {
    const workspace = await temporaryDirectory();
    const first = path.join(workspace, "first");
    const second = path.join(workspace, "second");
    await mkdir(path.join(first, "src"), {recursive: true});
    await mkdir(path.join(first, "a"));
    await mkdir(path.join(first, "b"));
    await mkdir(second);

    await git(first, ["init", "-b", "main"]);
    await writeFile(path.join(first, "README.md"), "# First\n");
    await writeFile(path.join(first, "a", "old.txt"), "move me\n");
    await writeFile(path.join(first, "src", "example.ts"), "export const value = 1;\n");
    await commitAll(first, "feat: add first repository");
    await writeFile(path.join(first, "src", "example.ts"), "export const value = 2;\n");
    await rename(path.join(first, "a", "old.txt"), path.join(first, "b", "new.txt"));
    await git(first, ["add", "a/old.txt", "b/new.txt"]);

    await git(second, ["init", "-b", "release"]);
    await writeFile(path.join(second, "notes.md"), "# Notes\n");
    await commitAll(second, "docs: add second repository");
    await symlink(first, path.join(workspace, "alias"));

    const resolver = new GitRepositoryResolver(workspace);
    expect(
      await resolver.directoryInfo(
        [],
        [
          {isDirectory: true, name: "first"},
          {isDirectory: true, name: "second"},
        ],
      ),
    ).toBeUndefined();

    const firstInfo = await resolver.directoryInfo(
      ["first"],
      [
        {isDirectory: false, name: "README.md"},
        {isDirectory: true, name: "a"},
        {isDirectory: true, name: "b"},
        {isDirectory: true, name: "src"},
      ],
    );
    expect(firstInfo?.branch).toBe("main");
    expect(firstInfo?.commit?.summary).toBe("feat: add first repository");
    expect(firstInfo?.changes).toEqual([
      {
        originalPath: "first/a/old.txt",
        path: "first/b/new.txt",
        staged: "renamed",
      },
      {path: "first/src/example.ts", unstaged: "modified"},
    ]);
    expect(firstInfo?.entries.get("src")?.changes).toEqual([
      {path: "first/src/example.ts", unstaged: "modified"},
    ]);

    const nestedInfo = await resolver.directoryInfo(
      ["first", "src"],
      [{isDirectory: false, name: "example.ts"}],
    );
    expect(nestedInfo?.commit?.summary).toBe("feat: add first repository");
    expect(nestedInfo?.changes).toEqual([{path: "first/src/example.ts", unstaged: "modified"}]);

    const renameSource = await resolver.directoryInfo(["first", "a"], []);
    expect(renameSource?.changes).toEqual([{path: "first/a/old.txt", staged: "deleted"}]);
    const renameTarget = await resolver.directoryInfo(
      ["first", "b"],
      [{isDirectory: false, name: "new.txt"}],
    );
    expect(renameTarget?.entries.get("new.txt")?.changes).toEqual([
      {path: "first/b/new.txt", staged: "added"},
    ]);

    const scopedResolver = new GitRepositoryResolver(path.join(first, "src"));
    const scopedInfo = await scopedResolver.directoryInfo(
      [],
      [{isDirectory: false, name: "example.ts"}],
    );
    expect(scopedInfo?.commit?.summary).toBe("feat: add first repository");
    expect(scopedInfo?.changes).toEqual([{path: "example.ts", unstaged: "modified"}]);

    const aliasInfo = await resolver.directoryInfo(
      ["alias"],
      [
        {isDirectory: true, name: "a"},
        {isDirectory: true, name: "b"},
        {isDirectory: true, name: "src"},
      ],
    );
    expect(aliasInfo?.changes).toEqual([
      {
        originalPath: "alias/a/old.txt",
        path: "alias/b/new.txt",
        staged: "renamed",
      },
      {path: "alias/src/example.ts", unstaged: "modified"},
    ]);

    const secondInfo = await resolver.directoryInfo(
      ["second"],
      [{isDirectory: false, name: "notes.md"}],
    );
    expect(secondInfo?.branch).toBe("release");
    expect(secondInfo?.commit?.summary).toBe("docs: add second repository");
    expect(secondInfo?.changes).toEqual([]);

    const nestedRoot = path.join(first, "src");
    await git(nestedRoot, ["init", "-b", "nested"]);
    await commitAll(nestedRoot, "feat: initialize nested repository");
    const createdNestedInfo = await resolver.directoryInfo(
      ["first", "src"],
      [{isDirectory: false, name: "example.ts"}],
    );
    expect(createdNestedInfo?.branch).toBe("nested");
    expect(createdNestedInfo?.commit?.summary).toBe("feat: initialize nested repository");

    await rm(path.join(nestedRoot, ".git"), {force: true, recursive: true});
    const removedNestedInfo = await resolver.directoryInfo(
      ["first", "src"],
      [{isDirectory: false, name: "example.ts"}],
    );
    expect(removedNestedInfo?.branch).toBe("main");
    expect(removedNestedInfo?.commit?.summary).toBe("feat: add first repository");
  });

  test("does not resolve repositories through escaping symlinks", async () => {
    const workspace = await temporaryDirectory();
    const outside = await temporaryDirectory();
    await git(outside, ["init", "-b", "main"]);
    await writeFile(path.join(outside, "README.md"), "# Outside\n");
    await commitAll(outside, "docs: add outside repository");
    await symlink(outside, path.join(workspace, "outside"));

    const resolver = new GitRepositoryResolver(workspace);
    expect(
      await resolver.directoryInfo(["outside"], [{isDirectory: false, name: "README.md"}]),
    ).toBeUndefined();
  });

  test("discovers a repository immediately after an earlier miss", async () => {
    const workspace = await temporaryDirectory();
    const project = path.join(workspace, "project");
    await mkdir(project);
    const resolver = new GitRepositoryResolver(workspace);
    expect(await resolver.directoryInfo(["project"], [])).toBeUndefined();

    await git(project, ["init", "-b", "main"]);
    await writeFile(path.join(project, "README.md"), "# Project\n");
    await commitAll(project, "feat: initialize repository");
    const info = await resolver.directoryInfo(
      ["project"],
      [{isDirectory: false, name: "README.md"}],
    );
    expect(info?.branch).toBe("main");
    expect(info?.commit?.summary).toBe("feat: initialize repository");
  });

  test("uses case-insensitive pathspecs when configured by Git", async () => {
    const workspace = await temporaryDirectory();
    const project = path.join(workspace, "project");
    await mkdir(path.join(project, "src"), {recursive: true});
    await git(project, ["init", "-b", "main"]);
    await writeFile(path.join(project, "src", "example.ts"), "export const value = 1;\n");
    await commitAll(project, "feat: add source file");
    await git(project, ["config", "core.ignorecase", "true"]);
    await rename(path.join(project, "src"), path.join(project, "Src"));
    await writeFile(path.join(project, "Src", "example.ts"), "export const value = 2;\n");

    const resolver = new GitRepositoryResolver(workspace);
    const info = await resolver.directoryInfo(
      ["project", "Src"],
      [{isDirectory: false, name: "example.ts"}],
    );
    const caseInsensitiveFilesystem = await realpath(path.join(project, "src")).then(
      () => true,
      () => false,
    );
    if (caseInsensitiveFilesystem) {
      expect(info?.commit?.summary).toBe("feat: add source file");
      expect(info?.changes).toEqual([{path: "project/Src/example.ts", unstaged: "modified"}]);
      expect(info?.entries.get("example.ts")?.commit?.summary).toBe("feat: add source file");
    } else {
      expect(info?.commit).toBeUndefined();
      expect(info?.changes).toEqual([]);
    }
  });
});
