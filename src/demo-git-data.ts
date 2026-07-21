import type {
  GitCommit,
  GitDirectoryEntry,
  GitDirectoryInfo,
  GitEntryInfo,
  GitMetadataProvider,
  GitWorkingTreeDiff,
} from "./git.js";

export interface DemoGitCommitData extends Omit<GitCommit, "date"> {
  date: string;
}

export interface DemoGitEntryData extends Omit<GitEntryInfo, "commit"> {
  commit?: DemoGitCommitData;
}

export interface DemoGitDirectoryData extends Omit<GitDirectoryInfo, "commit" | "entries"> {
  commit?: DemoGitCommitData;
  entries: Readonly<Record<string, DemoGitEntryData>>;
}

export interface DemoGitSnapshotData {
  diffs: Readonly<Record<string, GitWorkingTreeDiff>>;
  directories: Readonly<Record<string, DemoGitDirectoryData>>;
}

function hydrateCommit(commit: DemoGitCommitData): GitCommit {
  return {...commit, date: new Date(commit.date)};
}

function hydrateDirectory(
  directory: DemoGitDirectoryData,
  directoryEntries: readonly GitDirectoryEntry[],
): GitDirectoryInfo {
  const {commit, entries: serializedEntries, ...metadata} = directory;
  const requestedEntries = new Set(directoryEntries.map((entry) => entry.name));
  const entries = new Map(
    Object.entries(serializedEntries)
      .filter(([name]) => requestedEntries.has(name))
      .map(([name, entry]) => {
        const {commit: entryCommit, ...entryMetadata} = entry;
        return [
          name,
          {
            ...entryMetadata,
            ...(entryCommit === undefined ? {} : {commit: hydrateCommit(entryCommit)}),
          },
        ];
      }),
  );
  return {
    ...metadata,
    ...(commit === undefined ? {} : {commit: hydrateCommit(commit)}),
    entries,
  };
}

export function createDemoGitMetadata(snapshot: DemoGitSnapshotData): GitMetadataProvider {
  return {
    async directoryInfo(segments, directoryEntries) {
      const directory = snapshot.directories[segments.join("/")];
      return directory === undefined ? undefined : hydrateDirectory(directory, directoryEntries);
    },
    async workingTreeDiff(segments) {
      return snapshot.diffs[segments.join("/")];
    },
  };
}
