import type {
  GitChange,
  GitCommit,
  GitDirectoryInfo,
  GitMetadataProvider,
  GitWorkingTreeDiff,
} from "./git.js";

const head = "950ad36b91d5356fe50d84519f92ebbe2b236528";

function commit(hash: string, summary: string, date: string): GitCommit {
  return {author: "Chase Adams", date: new Date(date), hash, shortHash: hash.slice(0, 7), summary};
}

const commits = new Map<string, GitCommit>([
  [
    "",
    commit(
      "9547d863c3607498f6ee0ee9f8ad71e183f19636",
      "feat: refine default theme and layout",
      "2026-07-16T18:58:08Z",
    ),
  ],
  [
    "README.md",
    commit(
      "9547d863c3607498f6ee0ee9f8ad71e183f19636",
      "feat: refine default theme and layout",
      "2026-07-16T18:58:08Z",
    ),
  ],
  [
    "example.ts",
    commit(
      "a970f7daa5ed5d9e0f18fbcedf89389a0c14f480",
      "feat: add md file browser",
      "2026-07-16T17:12:11Z",
    ),
  ],
  [
    "guides",
    commit(
      "a970f7daa5ed5d9e0f18fbcedf89389a0c14f480",
      "feat: add md file browser",
      "2026-07-16T17:12:11Z",
    ),
  ],
  [
    "guides/getting-started.md",
    commit(
      "a970f7daa5ed5d9e0f18fbcedf89389a0c14f480",
      "feat: add md file browser",
      "2026-07-16T17:12:11Z",
    ),
  ],
  [
    "notes",
    commit(
      "a970f7daa5ed5d9e0f18fbcedf89389a0c14f480",
      "feat: add md file browser",
      "2026-07-16T17:12:11Z",
    ),
  ],
  [
    "notes/deep-notes.md",
    commit(
      "a970f7daa5ed5d9e0f18fbcedf89389a0c14f480",
      "feat: add md file browser",
      "2026-07-16T17:12:11Z",
    ),
  ],
  [
    "notes.md",
    commit(
      "a970f7daa5ed5d9e0f18fbcedf89389a0c14f480",
      "feat: add md file browser",
      "2026-07-16T17:12:11Z",
    ),
  ],
]);

const changes: readonly GitChange[] = [
  {path: ".hidden/workflow.yaml", untracked: true},
  {path: "draft.md", staged: "deleted"},
  {path: "example.ts", staged: "modified", unstaged: "modified"},
  {path: "guides/getting-started.md", staged: "modified"},
  {path: "notes.md", unstaged: "modified"},
];

function pathIsInside(filePath: string, directory: string): boolean {
  return directory === "" || filePath === directory || filePath.startsWith(`${directory}/`);
}

export const demoGitMetadata: GitMetadataProvider = {
  async directoryInfo(segments, directoryEntries): Promise<GitDirectoryInfo> {
    const directoryPath = segments.join("/");
    const directoryChanges = changes.filter(
      (change) =>
        pathIsInside(change.path, directoryPath) ||
        (change.originalPath !== undefined && pathIsInside(change.originalPath, directoryPath)),
    );
    const entries = new Map(
      directoryEntries.map((entry) => {
        const entryPath = [...segments, entry.name].join("/");
        const entryChanges = directoryChanges.filter(
          (change) =>
            change.path === entryPath ||
            (entry.isDirectory && change.path.startsWith(`${entryPath}/`)) ||
            change.originalPath === entryPath ||
            (entry.isDirectory && change.originalPath?.startsWith(`${entryPath}/`)),
        );
        const entryCommit = commits.get(entryPath);
        return [
          entry.name,
          {
            changes: entryChanges,
            ...(entryCommit === undefined ? {} : {commit: entryCommit}),
            repositoryPath: ["demo-files", entryPath].join("/"),
          },
        ];
      }),
    );
    const latestCommit = commits.get(directoryPath);
    return {
      branch: "main",
      branchCount: 1,
      changes: directoryChanges,
      commitCount: 33,
      detached: false,
      entries,
      head,
      repositoryUrl: "https://github.com/0xcadams/md",
      tagCount: 4,
      ...(latestCommit === undefined ? {} : {commit: latestCommit}),
    };
  },
  async workingTreeDiff(segments): Promise<GitWorkingTreeDiff> {
    const directoryPath = segments.join("/");
    return {
      files: changes
        .filter(
          (change) =>
            pathIsInside(change.path, directoryPath) ||
            (change.originalPath !== undefined && pathIsInside(change.originalPath, directoryPath)),
        )
        .map((change) => ({
          change,
          patch: change.untracked
            ? "new file mode 100644\n@@ -0,0 +1 @@\n+# New working tree file\n"
            : change.staged === "deleted" || change.unstaged === "deleted"
              ? "deleted file mode 100644\n@@ -1 +0,0 @@\n-Removed working tree content\n"
              : "@@ -1 +1 @@\n-Previous working tree content\n+Updated working tree content\n",
        })),
    };
  },
};
