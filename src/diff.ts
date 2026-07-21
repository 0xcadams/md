import type {GitChange, GitFileDiff, GitWorkingTreeDiff} from "./git.js";

export type DiffLineKind = "addition" | "context" | "deletion" | "notice";

export interface IntralineRange {
  end: number;
  start: number;
}

export interface DiffLine {
  content: string;
  intraline?: IntralineRange;
  kind: DiffLineKind;
  newLine?: number;
  oldLine?: number;
}

export interface DiffHunk {
  header: string;
  lines: DiffLine[];
  newCount: number;
  newStart: number;
  oldCount: number;
  oldStart: number;
}

export interface ParsedDiffFile {
  additions: number;
  change: GitChange;
  deletions: number;
  details: readonly string[];
  hunks: readonly DiffHunk[];
  message?: string;
}

export interface ParsedWorkingTreeDiff {
  additions: number;
  deletions: number;
  files: readonly ParsedDiffFile[];
}

const hunkPattern = /^@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@.*$/;

function intralineRange(left: string, right: string): [IntralineRange, IntralineRange] | undefined {
  let prefix = 0;
  const maximumPrefix = Math.min(left.length, right.length);
  while (prefix < maximumPrefix && left[prefix] === right[prefix]) prefix += 1;

  let suffix = 0;
  const maximumSuffix = Math.min(left.length - prefix, right.length - prefix);
  while (
    suffix < maximumSuffix &&
    left[left.length - suffix - 1] === right[right.length - suffix - 1]
  ) {
    suffix += 1;
  }
  if (prefix === 0 && suffix === 0) return undefined;
  return [
    {end: left.length - suffix, start: prefix},
    {end: right.length - suffix, start: prefix},
  ];
}

function addIntralineRanges(lines: DiffLine[]): void {
  for (let index = 0; index < lines.length; index += 1) {
    if (lines[index]?.kind !== "deletion") continue;
    const deletions: DiffLine[] = [];
    while (lines[index]?.kind === "deletion") {
      deletions.push(lines[index]!);
      index += 1;
    }
    const additions: DiffLine[] = [];
    while (lines[index]?.kind === "addition") {
      additions.push(lines[index]!);
      index += 1;
    }
    index -= 1;
    for (let pair = 0; pair < Math.min(deletions.length, additions.length); pair += 1) {
      const deletion = deletions[pair]!;
      const addition = additions[pair]!;
      const ranges = intralineRange(deletion.content, addition.content);
      if (ranges === undefined) continue;
      deletion.intraline = ranges[0];
      addition.intraline = ranges[1];
    }
  }
}

function parseFile(file: GitFileDiff): ParsedDiffFile {
  const patchLines = file.patch.split(/\r?\n/);
  const hunks: DiffHunk[] = [];
  const details: string[] = [];
  let message: string | undefined;
  let additions = 0;
  let deletions = 0;

  for (let index = 0; index < patchLines.length; index += 1) {
    const patchLine = patchLines[index] ?? "";
    const match = hunkPattern.exec(patchLine);
    if (match === null) {
      if (/^(?:old|new|deleted file|new file) mode \d+$/.test(patchLine)) {
        details.push(patchLine);
      } else if (/^(?:dis)?similarity index \d+%$/.test(patchLine)) {
        details.push(patchLine);
      } else if (
        /^(?:Binary file not shown|File is too large to display|Diff unavailable|Diff output limit reached)\.$/.test(
          patchLine,
        )
      ) {
        message = patchLine;
      } else if (patchLine.startsWith("Binary files ") || patchLine === "GIT binary patch") {
        message = "Binary file not shown.";
      }
      continue;
    }

    const oldStart = Number(match[1]);
    const oldCount = Number(match[2] ?? "1");
    const newStart = Number(match[3]);
    const newCount = Number(match[4] ?? "1");
    let oldLine = oldStart;
    let newLine = newStart;
    const lines: DiffLine[] = [];

    for (index += 1; index < patchLines.length; index += 1) {
      const line = patchLines[index] ?? "";
      if (hunkPattern.test(line) || line.startsWith("diff --git ")) {
        index -= 1;
        break;
      }
      if (line.startsWith(" ")) {
        lines.push({content: line.slice(1), kind: "context", newLine, oldLine});
        oldLine += 1;
        newLine += 1;
      } else if (line.startsWith("-")) {
        lines.push({content: line.slice(1), kind: "deletion", oldLine});
        oldLine += 1;
        deletions += 1;
      } else if (line.startsWith("+")) {
        lines.push({content: line.slice(1), kind: "addition", newLine});
        newLine += 1;
        additions += 1;
      } else if (line === "\\ No newline at end of file") {
        lines.push({content: line, kind: "notice"});
      } else {
        index -= 1;
        break;
      }
    }
    addIntralineRanges(lines);
    hunks.push({header: patchLine, lines, newCount, newStart, oldCount, oldStart});
  }

  return {
    additions,
    change: file.change,
    deletions,
    details,
    hunks,
    ...(message === undefined ? {} : {message}),
  };
}

export function parseWorkingTreeDiff(diff: GitWorkingTreeDiff): ParsedWorkingTreeDiff {
  const files = diff.files.map(parseFile);
  return {
    additions: files.reduce((total, file) => total + file.additions, 0),
    deletions: files.reduce((total, file) => total + file.deletions, 0),
    files,
  };
}
