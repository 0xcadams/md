import type {GitChange, GitCommit, GitDirectoryInfo, GitMetadataProvider} from "./git.js";

const head = "a5f7f76cf0e4323065f82ec2084572a3770b905c";

function commit(hash: string, summary: string, date: string): GitCommit {
  return {date: new Date(date), hash, shortHash: hash.slice(0, 7), summary};
}

const commits = new Map<string, GitCommit>([
  ["", commit(head, "feat: add Git-aware directory listings", "2026-07-17T01:04:06Z")],
  [
    "README.md",
    commit(
      "72beae6a6e9102f30ff0a726bc35f2c89401c549",
      "docs: document the demo workspace",
      "2026-07-16T20:18:00Z",
    ),
  ],
  [
    "example.ts",
    commit(
      "3c5b947412bc354343fd31a51fc33c4f16b6ddeb",
      "feat: add a typed source example",
      "2026-07-16T19:42:00Z",
    ),
  ],
  [
    "guides",
    commit(
      "cc347c674bb90fd5ef8799f6216f2fa75ffcf0b4",
      "docs: add the getting started guide",
      "2026-07-16T18:55:00Z",
    ),
  ],
  [
    "guides/getting-started.md",
    commit(
      "cc347c674bb90fd5ef8799f6216f2fa75ffcf0b4",
      "docs: add the getting started guide",
      "2026-07-16T18:55:00Z",
    ),
  ],
  [
    "notes",
    commit(
      "57101a9ec9d61b67684396e9b69fd14067c86a02",
      "docs: expand the linked notes",
      "2026-07-16T17:30:00Z",
    ),
  ],
  [
    "notes/deep-notes.md",
    commit(
      "57101a9ec9d61b67684396e9b69fd14067c86a02",
      "docs: expand the linked notes",
      "2026-07-16T17:30:00Z",
    ),
  ],
  [
    "notes.md",
    commit(
      "0fd6e0bf9a1321659b7903f97278f047afd21983",
      "docs: showcase wiki links",
      "2026-07-16T16:15:00Z",
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
          },
        ];
      }),
    );
    const latestCommit = commits.get(directoryPath);
    return {
      branch: "main",
      changes: directoryChanges,
      detached: false,
      entries,
      head,
      ...(latestCommit === undefined ? {} : {commit: latestCommit}),
    };
  },
};
