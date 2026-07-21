import {lstat, readFile, realpath} from "node:fs/promises";
import path from "node:path";

const gitCommandTimeout = 5_000;
const maximumGitOutput = 16 * 1024 * 1024;
const maximumConcurrentGitCommands = 6;
const maximumCachedDirectories = 256;
const maximumCachedRepositories = 64;
const emptyTreeHash = "4b825dc642cb6eb9a060e54bf8d69288fbee4904";

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
  author: string;
  date: Date;
  hash: string;
  shortHash: string;
  summary: string;
}

export interface GitEntryInfo {
  changes: readonly GitChange[];
  commit?: GitCommit;
  repositoryPath: string;
}

export interface GitDirectoryInfo {
  branch: string;
  branchCount?: number;
  changes: readonly GitChange[];
  commit?: GitCommit;
  commitCount?: number;
  detached: boolean;
  entries: ReadonlyMap<string, GitEntryInfo>;
  head?: string;
  repositoryUrl?: string;
  tagCount?: number;
}

export interface GitDirectoryEntry {
  isDirectory: boolean;
  name: string;
}

export interface GitFileDiff {
  change: GitChange;
  patch: string;
}

export interface GitWorkingTreeDiff {
  files: readonly GitFileDiff[];
}

export interface GitMetadataProvider {
  directoryInfo(
    segments: readonly string[],
    directoryEntries: readonly GitDirectoryEntry[],
  ): Promise<GitDirectoryInfo | undefined>;
  workingTreeDiff(segments: readonly string[]): Promise<GitWorkingTreeDiff | undefined>;
}

interface GitStatus {
  branch: string;
  changes: GitChange[];
  detached: boolean;
  head?: string;
}

interface GitStatusContext {
  configuration: Uint8Array;
  ignoreCase: boolean;
  status: GitStatus;
}

interface GitHubRemote {
  name: string;
  repositoryUrl: string;
}

interface GitRepositoryCounts {
  branches: number;
  commits?: number;
  tags: number;
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

function normalizeGitPath(filePath: string, ignoreCase: boolean): string {
  return ignoreCase ? filePath.toLowerCase() : filePath;
}

function stripRepositoryPrefix(
  filePath: string,
  repositoryPrefix: string,
  ignoreCase = false,
): string | undefined {
  if (repositoryPrefix === "") return filePath;
  if (
    !normalizeGitPath(filePath, ignoreCase).startsWith(
      `${normalizeGitPath(repositoryPrefix, ignoreCase)}/`,
    )
  ) {
    return undefined;
  }
  return filePath.slice(repositoryPrefix.length + 1);
}

function pathIsInside(filePath: string, directory: string, ignoreCase = false): boolean {
  const normalizedPath = normalizeGitPath(filePath, ignoreCase);
  const normalizedDirectory = normalizeGitPath(directory, ignoreCase);
  return (
    normalizedDirectory === "" ||
    normalizedPath === normalizedDirectory ||
    normalizedPath.startsWith(`${normalizedDirectory}/`)
  );
}

function literalPathspec(filePath: string, ignoreCase: boolean): string {
  if (filePath === "") return ".";
  return ignoreCase ? `:(icase,literal)${filePath}` : `:(literal)${filePath}`;
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

function configurationBoolean(output: Uint8Array, name: string): boolean {
  const normalizedName = name.toLowerCase();
  for (const entry of new TextDecoder().decode(output).split("\0")) {
    const separator = entry.indexOf("\n");
    if (separator === -1 || entry.slice(0, separator).toLowerCase() !== normalizedName) continue;
    return ["1", "on", "true", "yes"].includes(entry.slice(separator + 1).toLowerCase());
  }
  return false;
}

function githubRepositoryUrl(remoteUrl: string): string | undefined {
  let owner: string | undefined;
  let repository: string | undefined;
  const scp = /^(?:[^@/:]+@)?github\.com:([^/]+)\/([^/]+)\/?$/i.exec(remoteUrl);
  if (scp !== null) {
    owner = scp[1];
    repository = scp[2];
  } else {
    try {
      const url = new URL(remoteUrl);
      if (
        url.hostname.toLowerCase() !== "github.com" ||
        !["git:", "http:", "https:", "ssh:"].includes(url.protocol)
      ) {
        return undefined;
      }
      const segments = url.pathname.split("/").filter(Boolean);
      if (segments.length !== 2) return undefined;
      [owner, repository] = segments;
    } catch {
      return undefined;
    }
  }

  repository = repository?.replace(/\.git$/i, "");
  if (
    owner === undefined ||
    repository === undefined ||
    !/^[\w.-]+$/.test(owner) ||
    !/^[\w.-]+$/.test(repository)
  ) {
    return undefined;
  }
  return `https://github.com/${owner}/${repository}`;
}

function githubRemoteFromConfiguration(output: Uint8Array): GitHubRemote | undefined {
  const remotes: GitHubRemote[] = [];
  for (const entry of new TextDecoder().decode(output).split("\0")) {
    const separator = entry.indexOf("\n");
    if (separator === -1) continue;
    const match = /^remote\.(.+)\.url$/i.exec(entry.slice(0, separator));
    if (match?.[1] === undefined) continue;
    const repositoryUrl = githubRepositoryUrl(entry.slice(separator + 1));
    if (repositoryUrl !== undefined) remotes.push({name: match[1], repositoryUrl});
  }
  return remotes.find((remote) => remote.name.toLowerCase() === "origin") ?? remotes[0];
}

async function filesystemIgnoresCase(directory: string): Promise<boolean> {
  let current = await realpath(directory);
  while (true) {
    const parent = path.dirname(current);
    const name = path.basename(current);
    const letterIndex = name.search(/[a-z]/i);
    if (letterIndex !== -1) {
      const letter = name[letterIndex] ?? "";
      const alternateLetter =
        letter === letter.toLowerCase() ? letter.toUpperCase() : letter.toLowerCase();
      const alternateName = `${name.slice(0, letterIndex)}${alternateLetter}${name.slice(letterIndex + 1)}`;
      try {
        // Each ancestor is checked only when its child name has no usable casing variant.
        // eslint-disable-next-line no-await-in-loop
        return (await realpath(path.join(parent, alternateName))) === current;
      } catch {
        return false;
      }
    }
    if (parent === current) return false;
    current = parent;
  }
}

export function parseGitStatus(
  output: string,
  repositoryPrefix = "",
  ignoreCase = false,
): GitStatus {
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
      const filePath = stripRepositoryPrefix(record.slice(2), repositoryPrefix, ignoreCase);
      if (filePath !== undefined) changes.push({path: filePath, untracked: true});
      continue;
    }

    if (record.startsWith("1 ")) {
      const parsed = splitAfterFields(record, 8);
      if (parsed === undefined) continue;
      const [fields, rawPath] = parsed;
      const filePath = stripRepositoryPrefix(rawPath, repositoryPrefix, ignoreCase);
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
      const filePath = stripRepositoryPrefix(rawPath, repositoryPrefix, ignoreCase);
      const status = fields[1];
      const rawOriginalPath = records[index + 1];
      index += 1;
      if (filePath === undefined || status === undefined) continue;
      const staged = gitChangeKind(status[0] ?? ".");
      const unstaged = gitChangeKind(status[1] ?? ".");
      const originalPath =
        rawOriginalPath === undefined
          ? undefined
          : stripRepositoryPrefix(rawOriginalPath, repositoryPrefix, ignoreCase);
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
      const filePath = stripRepositoryPrefix(parsed[1], repositoryPrefix, ignoreCase);
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
  const author = fields[3];
  const summary = fields[4]?.trimEnd();
  if (
    hash === undefined ||
    hash === "" ||
    shortHash === undefined ||
    timestamp === undefined ||
    author === undefined ||
    summary === undefined
  ) {
    return undefined;
  }
  const seconds = Number(timestamp);
  if (!Number.isFinite(seconds)) return undefined;
  return {author, date: new Date(seconds * 1_000), hash, shortHash, summary};
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
  successfulExitCodes: readonly number[] = [0],
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
    if (!successfulExitCodes.includes(exitCode)) {
      throw new Error(new TextDecoder().decode(stderr).trim() || `git exited with ${exitCode}`);
    }
    return stdout;
  } finally {
    clearTimeout(timeout);
  }
}

class GitCommandLimiter {
  private activeCommands = 0;
  private readonly waiters: Array<() => void> = [];

  async run<T>(operation: () => Promise<T>): Promise<T> {
    if (this.activeCommands >= maximumConcurrentGitCommands) {
      await new Promise<void>((resolve) => this.waiters.push(resolve));
    }
    this.activeCommands += 1;
    try {
      return await operation();
    } finally {
      this.activeCommands -= 1;
      this.waiters.shift()?.();
    }
  }
}

const gitCommands = new GitCommandLimiter();

async function discoverRepositoryRoot(directory: string): Promise<string | undefined> {
  try {
    const canonicalDirectory = await realpath(directory);
    const output = await gitCommands.run(async () =>
      runGit(canonicalDirectory, "*", ["rev-parse", "--show-toplevel"]),
    );
    const repositoryRoot = new TextDecoder().decode(output).replace(/\r?\n$/, "");
    return repositoryRoot === "" ? undefined : await realpath(repositoryRoot);
  } catch {
    return undefined;
  }
}

export class GitRepository implements GitMetadataProvider {
  private readonly commitCache = new Map<string, Promise<GitCommit | undefined>>();
  private commitCountCache: Promise<number | undefined> | undefined;
  private readonly filesystemIgnoreCase: Promise<boolean>;
  private historyHead: string | undefined;
  private ignoreCase = false;

  private constructor(
    private readonly root: string,
    private readonly repositoryRoot: string,
    private readonly repositoryPrefix: string,
  ) {
    this.filesystemIgnoreCase = filesystemIgnoresCase(root);
  }

  static async open(root: string): Promise<GitRepository | undefined> {
    try {
      const canonicalRoot = await realpath(root);
      const repositoryRoot = await discoverRepositoryRoot(canonicalRoot);
      if (repositoryRoot === undefined) return undefined;
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

  static async openRoot(root: string): Promise<GitRepository | undefined> {
    try {
      const canonicalRoot = await realpath(root);
      return new GitRepository(canonicalRoot, canonicalRoot, "");
    } catch {
      return undefined;
    }
  }

  get ignoresPathCase(): boolean {
    return this.ignoreCase;
  }

  private async run(
    arguments_: readonly string[],
    successfulExitCodes?: readonly number[],
  ): Promise<Uint8Array> {
    return await gitCommands.run(async () =>
      runGit(this.root, this.repositoryRoot, arguments_, successfulExitCodes),
    );
  }

  private async statusForDirectory(directoryPath: string): Promise<GitStatusContext | undefined> {
    try {
      const configuration = await this.run(["config", "--local", "--null", "--list", "--includes"]);
      const ignoreCase =
        configurationBoolean(configuration, "core.ignorecase") && (await this.filesystemIgnoreCase);
      this.ignoreCase = ignoreCase;
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
        literalPathspec(directoryPath, ignoreCase),
      ]);
      return {
        configuration,
        ignoreCase,
        status: parseGitStatus(new TextDecoder().decode(output), this.repositoryPrefix, ignoreCase),
      };
    } catch {
      return undefined;
    }
  }

  private commitForPath(
    head: string,
    filePath: string,
    ignoreCase: boolean,
  ): Promise<GitCommit | undefined> {
    const key = `${head}\0${ignoreCase ? "i" : "s"}\0${filePath}`;
    const cached = this.commitCache.get(key);
    if (cached !== undefined) return cached;

    const pathspec = literalPathspec(filePath, ignoreCase);
    const pending = this.run([
      "log",
      "-1",
      "--format=%H%x00%h%x00%ct%x00%an%x00%s",
      head,
      "--",
      pathspec,
    ])
      .then(parseCommit)
      .catch(() => {
        this.commitCache.delete(key);
        return undefined;
      });
    this.commitCache.set(key, pending);
    return pending;
  }

  private async repositoryCounts(
    head: string | undefined,
    remoteName: string | undefined,
  ): Promise<GitRepositoryCounts | undefined> {
    try {
      const refPrefixes = ["refs/heads", "refs/tags"];
      if (remoteName !== undefined) refPrefixes.push(`refs/remotes/${remoteName}`);
      const [refOutput, commits] = await Promise.all([
        this.run(["for-each-ref", "--format=%(refname)", ...refPrefixes]),
        head === undefined ? undefined : this.commitCount(head),
      ]);
      const branches = new Set<string>();
      let tags = 0;
      for (const ref of new TextDecoder().decode(refOutput).split(/\r?\n/)) {
        if (ref.startsWith("refs/heads/")) {
          branches.add(ref.slice("refs/heads/".length));
        } else if (remoteName !== undefined && ref.startsWith(`refs/remotes/${remoteName}/`)) {
          const branch = ref.slice(`refs/remotes/${remoteName}/`.length);
          if (branch !== "HEAD") branches.add(branch);
        } else if (ref.startsWith("refs/tags/")) {
          tags += 1;
        }
      }
      return {
        branches: branches.size,
        ...(commits === undefined ? {} : {commits}),
        tags,
      };
    } catch {
      return undefined;
    }
  }

  private commitCount(head: string): Promise<number | undefined> {
    if (this.commitCountCache !== undefined) return this.commitCountCache;
    this.commitCountCache = this.run(["rev-list", "--count", head])
      .then((output) => {
        const count = Number(new TextDecoder().decode(output).trim());
        return Number.isSafeInteger(count) ? count : undefined;
      })
      .catch(() => {
        this.commitCountCache = undefined;
        return undefined;
      });
    return this.commitCountCache;
  }

  async directoryInfo(
    segments: readonly string[],
    directoryEntries: readonly GitDirectoryEntry[],
  ): Promise<GitDirectoryInfo | undefined> {
    const directoryPath = segments.join("/");
    const statusContext = await this.statusForDirectory(directoryPath);
    if (statusContext === undefined) return undefined;
    const {configuration, ignoreCase, status} = statusContext;
    const githubRemote = githubRemoteFromConfiguration(configuration);

    if (status.head !== this.historyHead) {
      this.commitCache.clear();
      this.commitCountCache = undefined;
      this.historyHead = status.head;
    }

    const countsPromise = this.repositoryCounts(status.head, githubRemote?.name);

    const changes = status.changes
      .filter(
        (change) =>
          pathIsInside(change.path, directoryPath, ignoreCase) ||
          (change.originalPath !== undefined &&
            pathIsInside(change.originalPath, directoryPath, ignoreCase)),
      )
      .toSorted((left, right) => left.path.localeCompare(right.path));
    const commit =
      status.head === undefined
        ? undefined
        : await this.commitForPath(status.head, directoryPath, ignoreCase);
    const entries = new Map<string, GitEntryInfo>();
    const changesByEntry = new Map<string, GitChange[]>();
    for (const change of changes) {
      const changedPath = stripRepositoryPrefix(change.path, directoryPath, ignoreCase) ?? "";
      const originalPath =
        change.originalPath === undefined
          ? undefined
          : stripRepositoryPrefix(change.originalPath, directoryPath, ignoreCase);
      for (const relativePath of [changedPath, originalPath]) {
        const entryName = relativePath?.split("/", 1)[0];
        if (entryName === undefined || entryName === "") continue;
        const entryKey = normalizeGitPath(entryName, ignoreCase);
        const entryChanges = changesByEntry.get(entryKey) ?? [];
        if (!entryChanges.includes(change)) entryChanges.push(change);
        changesByEntry.set(entryKey, entryChanges);
      }
    }

    await Promise.all(
      directoryEntries.map(async (entry) => {
        const entryPath = [...segments, entry.name].join("/");
        const entryChanges = changesByEntry.get(normalizeGitPath(entry.name, ignoreCase)) ?? [];
        const entryCommit =
          status.head === undefined
            ? undefined
            : await this.commitForPath(status.head, entryPath, ignoreCase);
        entries.set(entry.name, {
          changes: entryChanges,
          ...(entryCommit === undefined ? {} : {commit: entryCommit}),
          repositoryPath: [this.repositoryPrefix, entryPath].filter(Boolean).join("/"),
        });
      }),
    );

    const counts = await countsPromise;

    return {
      branch: status.branch,
      ...(counts === undefined ? {} : {branchCount: counts.branches, tagCount: counts.tags}),
      changes,
      ...(counts?.commits === undefined ? {} : {commitCount: counts.commits}),
      detached: status.detached,
      entries,
      ...(commit === undefined ? {} : {commit}),
      ...(status.head === undefined ? {} : {head: status.head}),
      ...(githubRemote === undefined ? {} : {repositoryUrl: githubRemote.repositoryUrl}),
    };
  }

  private async untrackedPatch(change: GitChange): Promise<string> {
    const absolutePath = path.resolve(this.root, ...change.path.split("/"));
    if (!isWithin(this.root, absolutePath, this.ignoreCase)) return "";
    try {
      const stats = await lstat(absolutePath);
      if (!stats.isFile() || stats.isSymbolicLink()) return "";
      if (stats.size > maximumGitOutput) return "File is too large to display.\n";
      const contents = await readFile(absolutePath);
      if (contents.includes(0)) return "Binary file not shown.\n";
      let source: string;
      try {
        source = new TextDecoder("utf-8", {fatal: true}).decode(contents);
      } catch {
        return "Binary file not shown.\n";
      }
      const hasTrailingNewline = source.endsWith("\n");
      const lines = source.split(/\r?\n/);
      if (hasTrailingNewline) lines.pop();
      const mode = (stats.mode & 0o111) === 0 ? "100644" : "100755";
      const patch = [
        `new file mode ${mode}`,
        "--- /dev/null",
        "+++ b/file",
        `@@ -0,0 +1,${lines.length} @@`,
        ...lines.map((line) => `+${line}`),
      ];
      if (!hasTrailingNewline && lines.length > 0) patch.push("\\ No newline at end of file");
      return `${patch.join("\n")}\n`;
    } catch {
      return "";
    }
  }

  async workingTreeDiff(segments: readonly string[]): Promise<GitWorkingTreeDiff | undefined> {
    const directoryPath = segments.join("/");
    const statusContext = await this.statusForDirectory(directoryPath);
    if (statusContext === undefined) return undefined;
    const {configuration, ignoreCase, status} = statusContext;
    const changes = status.changes
      .filter(
        (change) =>
          pathIsInside(change.path, directoryPath, ignoreCase) ||
          (change.originalPath !== undefined &&
            pathIsInside(change.originalPath, directoryPath, ignoreCase)),
      )
      .toSorted((left, right) => left.path.localeCompare(right.path));
    const files: GitFileDiff[] = [];
    let totalBytes = 0;

    for (const change of changes) {
      let patch: string;
      if (change.untracked) {
        // Untracked files are synthesized so Git cannot follow a symlink outside the served root.
        // eslint-disable-next-line no-await-in-loop
        patch = await this.untrackedPatch(change);
      } else {
        const paths = [change.path, change.originalPath]
          .filter(
            (filePath): filePath is string =>
              filePath !== undefined && pathIsInside(filePath, directoryPath, ignoreCase),
          )
          .map((filePath) =>
            [this.repositoryPrefix, filePath].filter((part) => part !== "").join("/"),
          );
        try {
          // Commands run sequentially so the aggregate output limit can be enforced.
          // eslint-disable-next-line no-await-in-loop
          const output = await this.run([
            ...filterConfigurationOverrides(configuration),
            "diff",
            "--no-color",
            "--no-ext-diff",
            "--no-textconv",
            "--find-renames",
            "--unified=3",
            status.head ?? emptyTreeHash,
            "--",
            ...paths.map((filePath) => literalPathspec(filePath, ignoreCase)),
          ]);
          patch = new TextDecoder().decode(output);
        } catch {
          patch = "Diff unavailable.\n";
        }
      }
      totalBytes += Buffer.byteLength(patch);
      if (totalBytes > maximumGitOutput) {
        files.push({change, patch: "Diff output limit reached.\n"});
        break;
      }
      files.push({change, patch});
    }

    return {files};
  }
}

function relativeWithin(root: string, candidate: string, ignoreCase = false): string | undefined {
  const relative = path.relative(root, candidate);
  if (
    relative === "" ||
    (relative !== ".." && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative))
  ) {
    return relative;
  }
  if (!ignoreCase) return undefined;
  const absoluteRoot = path.resolve(root);
  const absoluteCandidate = path.resolve(candidate);
  const normalizedRoot = absoluteRoot.toLowerCase();
  const normalizedCandidate = absoluteCandidate.toLowerCase();
  if (normalizedCandidate === normalizedRoot) return "";
  if (!normalizedCandidate.startsWith(`${normalizedRoot}${path.sep}`)) return undefined;
  return absoluteCandidate.slice(absoluteRoot.length + 1);
}

function isWithin(root: string, candidate: string, ignoreCase = false): boolean {
  return relativeWithin(root, candidate, ignoreCase) !== undefined;
}

function setBounded<K, V>(map: Map<K, V>, key: K, value: V, maximumSize: number): void {
  if (!map.has(key) && map.size >= maximumSize) {
    const oldest = map.keys().next().value;
    if (oldest !== undefined) map.delete(oldest);
  }
  map.set(key, value);
}

function servedPathForGitPath(
  gitPath: string,
  repositoryRoot: string,
  servedRoot: string,
  directory: string,
  segments: readonly string[],
  ignoreCase: boolean,
): string | undefined {
  const absolutePath = path.resolve(repositoryRoot, ...gitPath.split("/"));
  const servedRelative = relativeWithin(servedRoot, absolutePath, ignoreCase);
  if (servedRelative === undefined) return undefined;
  const directoryRelative = relativeWithin(directory, absolutePath, ignoreCase);
  if (directoryRelative !== undefined) {
    return [...segments, ...directoryRelative.split(path.sep).filter(Boolean)].join("/");
  }
  return servedRelative.split(path.sep).filter(Boolean).join("/");
}

function mapChangeToServedRoot(
  change: GitChange,
  repositoryRoot: string,
  servedRoot: string,
  directory: string,
  segments: readonly string[],
  ignoreCase: boolean,
): GitChange | undefined {
  const mappedPath = servedPathForGitPath(
    change.path,
    repositoryRoot,
    servedRoot,
    directory,
    segments,
    ignoreCase,
  );
  const mappedOriginalPath =
    change.originalPath === undefined
      ? undefined
      : servedPathForGitPath(
          change.originalPath,
          repositoryRoot,
          servedRoot,
          directory,
          segments,
          ignoreCase,
        );
  if (mappedPath === undefined) {
    if (mappedOriginalPath === undefined) return undefined;
    return {
      path: mappedOriginalPath,
      ...(change.staged === undefined ? {} : {staged: "deleted" as const}),
      ...(change.unstaged === undefined ? {} : {unstaged: "deleted" as const}),
    };
  }
  const mappedChange = {...change};
  delete mappedChange.originalPath;
  return {
    ...mappedChange,
    path: mappedPath,
    ...(mappedOriginalPath === undefined ? {} : {originalPath: mappedOriginalPath}),
  };
}

function mapDirectoryInfoToServedRoot(
  info: GitDirectoryInfo,
  repositoryRoot: string,
  servedRoot: string,
  directory: string,
  segments: readonly string[],
  ignoreCase: boolean,
): GitDirectoryInfo {
  const mapChange = (change: GitChange): GitChange | undefined =>
    mapChangeToServedRoot(change, repositoryRoot, servedRoot, directory, segments, ignoreCase);
  return {
    ...info,
    changes: info.changes.map(mapChange).filter((change) => change !== undefined),
    entries: new Map(
      [...info.entries].map(([name, entry]) => [
        name,
        {
          ...entry,
          changes: entry.changes.map(mapChange).filter((change) => change !== undefined),
        },
      ]),
    ),
  };
}

export class GitRepositoryResolver implements GitMetadataProvider {
  private readonly canonicalRoot: Promise<string>;
  private readonly repositoryRoots = new Map<string, Promise<string | undefined>>();
  private readonly repositories = new Map<string, Promise<GitRepository | undefined>>();

  constructor(root: string) {
    this.canonicalRoot = realpath(root);
  }

  private async repositoryRootFor(directory: string): Promise<string | undefined> {
    let pending = this.repositoryRoots.get(directory);
    if (pending === undefined) {
      pending = discoverRepositoryRoot(directory);
      setBounded(this.repositoryRoots, directory, pending, maximumCachedDirectories);
    }
    const repositoryRoot = await pending;
    if (this.repositoryRoots.get(directory) === pending) this.repositoryRoots.delete(directory);
    return repositoryRoot;
  }

  private async repositoryFor(repositoryRoot: string): Promise<GitRepository | undefined> {
    let pending = this.repositories.get(repositoryRoot);
    if (pending === undefined) {
      pending = GitRepository.openRoot(repositoryRoot);
      setBounded(this.repositories, repositoryRoot, pending, maximumCachedRepositories);
    }
    const repository = await pending;
    if (repository === undefined && this.repositories.get(repositoryRoot) === pending) {
      this.repositories.delete(repositoryRoot);
    }
    return repository;
  }

  async directoryInfo(
    segments: readonly string[],
    directoryEntries: readonly GitDirectoryEntry[],
  ): Promise<GitDirectoryInfo | undefined> {
    let servedRoot: string;
    let directory: string;
    try {
      servedRoot = await this.canonicalRoot;
      directory = await realpath(path.resolve(servedRoot, ...segments));
    } catch {
      return undefined;
    }
    if (!isWithin(servedRoot, directory)) return undefined;

    const repositoryRoot = await this.repositoryRootFor(directory);
    if (repositoryRoot === undefined || !isWithin(repositoryRoot, directory)) return undefined;
    const repository = await this.repositoryFor(repositoryRoot);
    if (repository === undefined) return undefined;
    const repositorySegments = path
      .relative(repositoryRoot, directory)
      .split(path.sep)
      .filter(Boolean);
    const info = await repository.directoryInfo(repositorySegments, directoryEntries);
    if (info === undefined) {
      this.repositories.delete(repositoryRoot);
      return undefined;
    }
    return mapDirectoryInfoToServedRoot(
      info,
      repositoryRoot,
      servedRoot,
      directory,
      segments,
      repository.ignoresPathCase,
    );
  }

  async workingTreeDiff(segments: readonly string[]): Promise<GitWorkingTreeDiff | undefined> {
    let servedRoot: string;
    let directory: string;
    try {
      servedRoot = await this.canonicalRoot;
      directory = await realpath(path.resolve(servedRoot, ...segments));
    } catch {
      return undefined;
    }
    if (!isWithin(servedRoot, directory)) return undefined;

    const repositoryRoot = await this.repositoryRootFor(directory);
    if (repositoryRoot === undefined || !isWithin(repositoryRoot, directory)) return undefined;
    const repository = await this.repositoryFor(repositoryRoot);
    if (repository === undefined) return undefined;
    const repositorySegments = path
      .relative(repositoryRoot, directory)
      .split(path.sep)
      .filter(Boolean);
    const diff = await repository.workingTreeDiff(repositorySegments);
    if (diff === undefined) {
      this.repositories.delete(repositoryRoot);
      return undefined;
    }

    return {
      files: diff.files.flatMap((file) => {
        const change = mapChangeToServedRoot(
          file.change,
          repositoryRoot,
          servedRoot,
          directory,
          segments,
          repository.ignoresPathCase,
        );
        return change === undefined ? [] : [{change, patch: file.patch}];
      }),
    };
  }
}
