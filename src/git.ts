import {realpath} from "node:fs/promises";
import path from "node:path";

const gitCommandTimeout = 5_000;
const maximumGitOutput = 16 * 1024 * 1024;
const maximumConcurrentGitCommands = 6;

export type GitChangeKind =
  | "added"
  | "copied"
  | "deleted"
  | "modified"
  | "renamed"
  | "type-changed";

export interface GitChange {
  conflicted?: true;
  originalPath?: string;
  path: string;
  staged?: GitChangeKind;
  unstaged?: GitChangeKind;
  untracked?: true;
}

export interface GitCommit {
  date: Date;
  hash: string;
  shortHash: string;
  summary: string;
}

export interface GitEntryInfo {
  changes: readonly GitChange[];
  commit?: GitCommit;
}

export interface GitDirectoryInfo {
  branch: string;
  changes: readonly GitChange[];
  commit?: GitCommit;
  detached: boolean;
  entries: ReadonlyMap<string, GitEntryInfo>;
  head?: string;
}

export interface GitDirectoryEntry {
  isDirectory: boolean;
  name: string;
}

export interface GitMetadataProvider {
  directoryInfo(
    segments: readonly string[],
    directoryEntries: readonly GitDirectoryEntry[],
  ): Promise<GitDirectoryInfo | undefined>;
}

interface GitStatus {
  branch: string;
  changes: GitChange[];
  detached: boolean;
  head?: string;
}

function gitChangeKind(code: string): GitChangeKind | undefined {
  switch (code) {
    case "A":
      return "added";
    case "C":
      return "copied";
    case "D":
      return "deleted";
    case "M":
      return "modified";
    case "R":
      return "renamed";
    case "T":
      return "type-changed";
    default:
      return undefined;
  }
}

function splitAfterFields(value: string, count: number): [string[], string] | undefined {
  const fields: string[] = [];
  let start = 0;
  for (let index = 0; index < count; index += 1) {
    const end = value.indexOf(" ", start);
    if (end === -1) return undefined;
    fields.push(value.slice(start, end));
    start = end + 1;
  }
  return [fields, value.slice(start)];
}

function stripRepositoryPrefix(filePath: string, repositoryPrefix: string): string | undefined {
  if (repositoryPrefix === "") return filePath;
  if (!filePath.startsWith(`${repositoryPrefix}/`)) return undefined;
  return filePath.slice(repositoryPrefix.length + 1);
}

function pathIsInside(filePath: string, directory: string): boolean {
  return directory === "" || filePath === directory || filePath.startsWith(`${directory}/`);
}

function filterConfigurationOverrides(output: Uint8Array): string[] {
  const filters = new Set<string>();
  for (const entry of new TextDecoder().decode(output).split("\0")) {
    const separator = entry.indexOf("\n");
    const key = separator === -1 ? entry : entry.slice(0, separator);
    const match = /^(filter\..+)\.(clean|process|required)$/i.exec(key);
    if (match?.[1] !== undefined) filters.add(match[1]);
  }
  return [...filters].flatMap((filter) => [
    "-c",
    `${filter}.clean=`,
    "-c",
    `${filter}.process=`,
    "-c",
    `${filter}.required=false`,
  ]);
}

export function parseGitStatus(output: string, repositoryPrefix = ""): GitStatus {
  const records = output.split("\0");
  const changes: GitChange[] = [];
  let branch = "HEAD";
  let detached = false;
  let head: string | undefined;

  for (let index = 0; index < records.length; index += 1) {
    const record = records[index];
    if (record === undefined || record === "") continue;
    if (record.startsWith("# branch.oid ")) {
      const oid = record.slice("# branch.oid ".length);
      if (oid !== "(initial)") head = oid;
      continue;
    }
    if (record.startsWith("# branch.head ")) {
      const name = record.slice("# branch.head ".length);
      detached = name === "(detached)";
      branch = detached ? "HEAD" : name;
      continue;
    }

    if (record.startsWith("? ")) {
      const filePath = stripRepositoryPrefix(record.slice(2), repositoryPrefix);
      if (filePath !== undefined) changes.push({path: filePath, untracked: true});
      continue;
    }

    if (record.startsWith("1 ")) {
      const parsed = splitAfterFields(record, 8);
      if (parsed === undefined) continue;
      const [fields, rawPath] = parsed;
      const filePath = stripRepositoryPrefix(rawPath, repositoryPrefix);
      const status = fields[1];
      if (filePath === undefined || status === undefined) continue;
      const staged = gitChangeKind(status[0] ?? ".");
      const unstaged = gitChangeKind(status[1] ?? ".");
      const change: GitChange = {path: filePath};
      if (staged !== undefined) change.staged = staged;
      if (unstaged !== undefined) change.unstaged = unstaged;
      changes.push(change);
      continue;
    }

    if (record.startsWith("2 ")) {
      const parsed = splitAfterFields(record, 9);
      if (parsed === undefined) continue;
      const [fields, rawPath] = parsed;
      const filePath = stripRepositoryPrefix(rawPath, repositoryPrefix);
      const status = fields[1];
      const rawOriginalPath = records[index + 1];
      index += 1;
      if (filePath === undefined || status === undefined) continue;
      const staged = gitChangeKind(status[0] ?? ".");
      const unstaged = gitChangeKind(status[1] ?? ".");
      const originalPath =
        rawOriginalPath === undefined
          ? undefined
          : stripRepositoryPrefix(rawOriginalPath, repositoryPrefix);
      const change: GitChange = {path: filePath};
      if (originalPath !== undefined) change.originalPath = originalPath;
      if (staged !== undefined) change.staged = staged;
      if (unstaged !== undefined) change.unstaged = unstaged;
      changes.push(change);
      continue;
    }

    if (record.startsWith("u ")) {
      const parsed = splitAfterFields(record, 10);
      if (parsed === undefined) continue;
      const filePath = stripRepositoryPrefix(parsed[1], repositoryPrefix);
      if (filePath !== undefined) changes.push({conflicted: true, path: filePath});
    }
  }

  return {
    branch,
    changes,
    detached,
    ...(head === undefined ? {} : {head}),
  };
}

function parseCommit(output: Uint8Array): GitCommit | undefined {
  const fields = new TextDecoder().decode(output).split("\0");
  const hash = fields[0];
  const shortHash = fields[1];
  const timestamp = fields[2];
  const summary = fields[3]?.trimEnd();
  if (
    hash === undefined ||
    hash === "" ||
    shortHash === undefined ||
    timestamp === undefined ||
    summary === undefined
  ) {
    return undefined;
  }
  const seconds = Number(timestamp);
  if (!Number.isFinite(seconds)) return undefined;
  return {date: new Date(seconds * 1_000), hash, shortHash, summary};
}

async function readLimited(
  stream: ReadableStream<Uint8Array>,
  maximumBytes: number,
  abort: () => void,
): Promise<Uint8Array> {
  const chunks: Uint8Array[] = [];
  const reader = stream.getReader();
  let total = 0;
  try {
    while (true) {
      // Stream reads are sequential so the output limit can stop the subprocess early.
      // eslint-disable-next-line no-await-in-loop
      const {done, value} = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > maximumBytes) {
        abort();
        throw new Error("git output exceeded the limit");
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  return Buffer.concat(chunks, total);
}

async function runGit(
  workingDirectory: string,
  safeDirectory: string,
  arguments_: readonly string[],
): Promise<Uint8Array> {
  const process = Bun.spawn(
    [
      "git",
      "--no-optional-locks",
      "-c",
      `safe.directory=${safeDirectory}`,
      "-c",
      "core.fsmonitor=false",
      "-C",
      workingDirectory,
      ...arguments_,
    ],
    {
      env: {
        ...Bun.env,
        GIT_OPTIONAL_LOCKS: "0",
        GIT_PAGER: "cat",
        GIT_TERMINAL_PROMPT: "0",
        LC_ALL: "C",
      },
      stderr: "pipe",
      stdin: "ignore",
      stdout: "pipe",
    },
  );
  const abort = (): void => process.kill();
  const timeout = setTimeout(abort, gitCommandTimeout);
  try {
    const [exitCode, stdout, stderr] = await Promise.all([
      process.exited,
      readLimited(process.stdout, maximumGitOutput, abort),
      readLimited(process.stderr, 64 * 1024, abort),
    ]);
    if (exitCode !== 0) {
      throw new Error(new TextDecoder().decode(stderr).trim() || `git exited with ${exitCode}`);
    }
    return stdout;
  } finally {
    clearTimeout(timeout);
  }
}

export class GitRepository implements GitMetadataProvider {
  private activeCommands = 0;
  private readonly commitCache = new Map<string, Promise<GitCommit | undefined>>();
  private historyHead: string | undefined;
  private readonly commandWaiters: Array<() => void> = [];

  private constructor(
    private readonly root: string,
    private readonly repositoryRoot: string,
    private readonly repositoryPrefix: string,
  ) {}

  static async open(root: string): Promise<GitRepository | undefined> {
    try {
      const canonicalRoot = await realpath(root);
      const output = await runGit(canonicalRoot, "*", ["rev-parse", "--show-toplevel"]);
      const repositoryRoot = new TextDecoder().decode(output).replace(/\r?\n$/, "");
      if (repositoryRoot === "") return undefined;
      const relative = path.relative(repositoryRoot, canonicalRoot);
      if (relative === ".." || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) {
        return undefined;
      }
      const repositoryPrefix = relative.split(path.sep).filter(Boolean).join("/");
      return new GitRepository(canonicalRoot, repositoryRoot, repositoryPrefix);
    } catch {
      return undefined;
    }
  }

  private async run(arguments_: readonly string[]): Promise<Uint8Array> {
    return await this.withCommandPermit(async () =>
      runGit(this.root, this.repositoryRoot, arguments_),
    );
  }

  private async withCommandPermit<T>(operation: () => Promise<T>): Promise<T> {
    if (this.activeCommands >= maximumConcurrentGitCommands) {
      await new Promise<void>((resolve) => this.commandWaiters.push(resolve));
    }
    this.activeCommands += 1;
    try {
      return await operation();
    } finally {
      this.activeCommands -= 1;
      this.commandWaiters.shift()?.();
    }
  }

  private commitForPath(head: string, filePath: string): Promise<GitCommit | undefined> {
    const key = `${head}\0${filePath}`;
    const cached = this.commitCache.get(key);
    if (cached !== undefined) return cached;

    const pathspec = filePath === "" ? "." : `:(literal)${filePath}`;
    const pending = this.run(["log", "-1", "--format=%H%x00%h%x00%ct%x00%s", head, "--", pathspec])
      .then(parseCommit)
      .catch(() => {
        this.commitCache.delete(key);
        return undefined;
      });
    this.commitCache.set(key, pending);
    return pending;
  }

  async directoryInfo(
    segments: readonly string[],
    directoryEntries: readonly GitDirectoryEntry[],
  ): Promise<GitDirectoryInfo | undefined> {
    let status: GitStatus;
    const directoryPath = segments.join("/");
    const pathspec = directoryPath === "" ? "." : `:(literal)${directoryPath}`;
    try {
      const configuration = await this.run(["config", "--local", "--null", "--list", "--includes"]);
      const output = await this.run([
        ...filterConfigurationOverrides(configuration),
        "status",
        "--porcelain=v2",
        "--branch",
        "-z",
        "--renames",
        "--untracked-files=all",
        "--ignore-submodules=dirty",
        "--",
        pathspec,
      ]);
      status = parseGitStatus(new TextDecoder().decode(output), this.repositoryPrefix);
    } catch {
      return undefined;
    }

    if (status.head !== this.historyHead) {
      this.commitCache.clear();
      this.historyHead = status.head;
    }

    const changes = status.changes
      .filter(
        (change) =>
          pathIsInside(change.path, directoryPath) ||
          (change.originalPath !== undefined && pathIsInside(change.originalPath, directoryPath)),
      )
      .toSorted((left, right) => left.path.localeCompare(right.path));
    const commit =
      status.head === undefined ? undefined : await this.commitForPath(status.head, directoryPath);
    const entries = new Map<string, GitEntryInfo>();
    const changesByEntry = new Map<string, GitChange[]>();
    for (const change of changes) {
      const prefix = directoryPath === "" ? "" : `${directoryPath}/`;
      const changedPath = change.path.startsWith(prefix) ? change.path.slice(prefix.length) : "";
      const originalPath = change.originalPath?.startsWith(prefix)
        ? change.originalPath.slice(prefix.length)
        : undefined;
      for (const relativePath of [changedPath, originalPath]) {
        const entryName = relativePath?.split("/", 1)[0];
        if (entryName === undefined || entryName === "") continue;
        const entryChanges = changesByEntry.get(entryName) ?? [];
        if (!entryChanges.includes(change)) entryChanges.push(change);
        changesByEntry.set(entryName, entryChanges);
      }
    }

    await Promise.all(
      directoryEntries.map(async (entry) => {
        const entryPath = [...segments, entry.name].join("/");
        const entryChanges = changesByEntry.get(entry.name) ?? [];
        const entryCommit =
          status.head === undefined ? undefined : await this.commitForPath(status.head, entryPath);
        entries.set(entry.name, {
          changes: entryChanges,
          ...(entryCommit === undefined ? {} : {commit: entryCommit}),
        });
      }),
    );

    return {
      branch: status.branch,
      changes,
      detached: status.detached,
      entries,
      ...(commit === undefined ? {} : {commit}),
      ...(status.head === undefined ? {} : {head: status.head}),
    };
  }
}
