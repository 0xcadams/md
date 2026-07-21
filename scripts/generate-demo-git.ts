import {cp, mkdtemp, readFile, readdir, rm, writeFile} from "node:fs/promises";
import {tmpdir} from "node:os";
import path from "node:path";

import type {
  DemoGitCommitData,
  DemoGitDirectoryData,
  DemoGitEntryData,
  DemoGitSnapshotData,
} from "../src/demo-git-data.js";
import {GitRepository, type GitCommit, type GitDirectoryEntry} from "../src/git.js";

const projectRoot = path.resolve(import.meta.dir, "..");
const demoFilesRoot = path.join(projectRoot, "demo-files");
const fixtureRoot = path.join(projectRoot, "demo-git");
const outputPath = path.join(fixtureRoot, "generated.json");
const nullDevice = process.platform === "win32" ? "NUL" : "/dev/null";
const gitEnvironment = {
  ...Bun.env,
  GIT_AUTHOR_DATE: "2026-01-01T00:00:00Z",
  GIT_COMMITTER_DATE: "2026-01-01T00:00:00Z",
  GIT_CONFIG_GLOBAL: nullDevice,
  GIT_CONFIG_NOSYSTEM: "1",
  GIT_TERMINAL_PROMPT: "0",
  LC_ALL: "C",
};

async function git(root: string, arguments_: readonly string[]): Promise<string> {
  const process = Bun.spawn(["git", ...arguments_], {
    cwd: root,
    env: gitEnvironment,
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

async function directoryEntries(root: string, relative: string): Promise<GitDirectoryEntry[]> {
  const entries = await readdir(path.join(root, relative), {withFileTypes: true});
  return entries
    .filter((entry) => entry.name !== ".git")
    .map((entry) => ({isDirectory: entry.isDirectory(), name: entry.name}))
    .toSorted((left, right) => left.name.localeCompare(right.name));
}

async function directoryPaths(root: string, relative = ""): Promise<string[]> {
  const paths = [relative];
  for (const entry of await directoryEntries(root, relative)) {
    if (!entry.isDirectory) continue;
    const child = [relative, entry.name].filter(Boolean).join("/");
    // eslint-disable-next-line no-await-in-loop
    paths.push(...(await directoryPaths(root, child)));
  }
  return paths;
}

async function fileContents(root: string, relative = ""): Promise<Map<string, Buffer>> {
  const files = new Map<string, Buffer>();
  for (const entry of await readdir(path.join(root, relative), {withFileTypes: true})) {
    if (entry.name === ".git") continue;
    const child = [relative, entry.name].filter(Boolean).join("/");
    if (entry.isDirectory()) {
      // eslint-disable-next-line no-await-in-loop
      for (const [filePath, contents] of await fileContents(root, child)) {
        files.set(filePath, contents);
      }
    } else if (entry.isFile()) {
      // eslint-disable-next-line no-await-in-loop
      files.set(child, await readFile(path.join(root, child)));
    }
  }
  return files;
}

async function verifyWorktree(root: string): Promise<void> {
  const [expected, actual] = await Promise.all([fileContents(demoFilesRoot), fileContents(root)]);
  if (expected.size !== actual.size) {
    throw new Error("generated demo worktree paths do not match demo-files");
  }
  for (const [filePath, contents] of expected) {
    const actualContents = actual.get(filePath);
    if (actualContents === undefined || !contents.equals(actualContents)) {
      throw new Error(`generated demo worktree differs at ${filePath}`);
    }
  }
}

function serializeCommit(commit: GitCommit): DemoGitCommitData {
  return {...commit, date: commit.date.toISOString()};
}

function serializeEntry(entry: {
  changes: DemoGitEntryData["changes"];
  commit?: GitCommit;
  repositoryPath: string;
}): DemoGitEntryData {
  const {commit, ...metadata} = entry;
  return {
    ...metadata,
    ...(commit === undefined ? {} : {commit: serializeCommit(commit)}),
  };
}

function serializeDirectory(
  directory: Awaited<ReturnType<GitRepository["directoryInfo"]>> & {},
): DemoGitDirectoryData {
  const {commit, entries, ...metadata} = directory;
  return {
    ...metadata,
    ...(commit === undefined ? {} : {commit: serializeCommit(commit)}),
    entries: Object.fromEntries(
      [...entries]
        .toSorted(([left], [right]) => left.localeCompare(right))
        .map(([name, entry]) => [name, serializeEntry(entry)]),
    ),
  };
}

async function createRepository(root: string): Promise<void> {
  await cp(demoFilesRoot, root, {recursive: true});
  await git(root, ["init", "-b", "main"]);
  await git(root, ["config", "core.autocrlf", "false"]);
  await git(root, ["config", "core.filemode", "false"]);
  await git(root, [
    "apply",
    "--reverse",
    "--unidiff-zero",
    path.join(fixtureRoot, "unstaged.patch"),
  ]);
  await git(root, ["apply", "--reverse", "--unidiff-zero", path.join(fixtureRoot, "staged.patch")]);
  await git(root, ["add", "."]);
  await git(root, [
    "-c",
    "user.name=md demo",
    "-c",
    "user.email=demo@example.com",
    "commit",
    "-m",
    "feat: add demo workspace",
  ]);
  await git(root, ["branch", "release"]);
  await git(root, ["tag", "v1.0.0"]);
  await git(root, ["apply", "--unidiff-zero", path.join(fixtureRoot, "staged.patch")]);
  await git(root, ["add", "-A"]);
  await git(root, ["apply", "--unidiff-zero", path.join(fixtureRoot, "unstaged.patch")]);
  await verifyWorktree(root);
}

export async function generateDemoGitSnapshot(): Promise<DemoGitSnapshotData> {
  const temporaryRoot = await mkdtemp(path.join(tmpdir(), "md-demo-git-"));
  try {
    await createRepository(temporaryRoot);
    const repository = await GitRepository.open(temporaryRoot);
    if (repository === undefined) throw new Error("failed to open generated demo repository");
    const directories: Record<string, DemoGitDirectoryData> = {};
    const diffs: DemoGitSnapshotData["diffs"] = {};
    for (const directoryPath of await directoryPaths(temporaryRoot)) {
      const segments = directoryPath.split("/").filter(Boolean);
      // Provider calls are sequential to keep generated object ordering deterministic.
      // eslint-disable-next-line no-await-in-loop
      const info = await repository.directoryInfo(
        segments,
        // eslint-disable-next-line no-await-in-loop
        await directoryEntries(temporaryRoot, directoryPath),
      );
      if (info === undefined) throw new Error(`missing Git metadata for ${directoryPath || "."}`);
      directories[directoryPath] = serializeDirectory(info);
      // eslint-disable-next-line no-await-in-loop
      const diff = await repository.workingTreeDiff(segments);
      if (diff === undefined) throw new Error(`missing Git diff for ${directoryPath || "."}`);
      (diffs as Record<string, typeof diff>)[directoryPath] = diff;
    }
    return {diffs, directories};
  } finally {
    await rm(temporaryRoot, {force: true, recursive: true});
  }
}

function output(snapshot: DemoGitSnapshotData): string {
  return `${JSON.stringify(snapshot, null, 2)}\n`;
}

if (import.meta.main) {
  const generated = output(await generateDemoGitSnapshot());
  if (Bun.argv.includes("--check")) {
    const existing = await readFile(outputPath, "utf8").catch(() => "");
    if (existing !== generated) {
      console.error("demo Git snapshot is stale; run `bun run generate:demo-git`");
      process.exitCode = 1;
    }
  } else {
    await writeFile(outputPath, generated);
  }
}
