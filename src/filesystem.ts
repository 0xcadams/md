import {constants, type Stats} from "node:fs";
import {open, readdir, realpath, stat, type FileHandle} from "node:fs/promises";
import path from "node:path";

import {lookup} from "mime-types";

const markdownExtensions = new Set([".md", ".markdown", ".mdown", ".mkd"]);
const textExtensions = new Set([
  ".conf",
  ".csv",
  ".env",
  ".graphql",
  ".gql",
  ".ini",
  ".log",
  ".properties",
  ".sql",
  ".toml",
  ".txt",
]);

const languagesByExtension: Readonly<Record<string, string>> = {
  ".astro": "astro",
  ".bash": "bash",
  ".c": "c",
  ".cc": "cpp",
  ".cpp": "cpp",
  ".cs": "csharp",
  ".css": "css",
  ".diff": "diff",
  ".go": "go",
  ".h": "c",
  ".hpp": "cpp",
  ".html": "html",
  ".java": "java",
  ".js": "javascript",
  ".json": "json",
  ".jsonc": "jsonc",
  ".jsx": "jsx",
  ".kt": "kotlin",
  ".kts": "kotlin",
  ".lua": "lua",
  ".mjs": "javascript",
  ".php": "php",
  ".prisma": "prisma",
  ".py": "python",
  ".rb": "ruby",
  ".rs": "rust",
  ".scss": "scss",
  ".sh": "bash",
  ".sql": "sql",
  ".svelte": "svelte",
  ".swift": "swift",
  ".toml": "toml",
  ".ts": "typescript",
  ".tsx": "tsx",
  ".vue": "vue",
  ".xml": "xml",
  ".yaml": "yaml",
  ".yml": "yaml",
  ".zsh": "zsh",
};

const languagesByName: Readonly<Record<string, string>> = {
  ".dockerignore": "gitignore",
  ".editorconfig": "ini",
  ".gitattributes": "gitattributes",
  ".gitignore": "gitignore",
  dockerfile: "dockerfile",
  gemfile: "ruby",
  makefile: "makefile",
};

const sourceContentTypes: Readonly<Record<string, string>> = {
  ".js": "text/javascript; charset=utf-8",
  ".jsx": "text/jsx; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".ts": "text/typescript; charset=utf-8",
  ".tsx": "text/tsx; charset=utf-8",
};

export interface ResolvedFile {
  absolutePath: string;
  segments: string[];
  stats: Stats;
}

export interface DirectoryEntry {
  isDirectory: boolean;
  modified: Date;
  name: string;
  size: number;
  url: string;
}

export interface OpenedFile {
  handle: FileHandle;
  stats: Stats;
}

export interface ReadFileResult {
  contents: Buffer;
  stats: Stats;
}

function isWithin(root: string, candidate: string): boolean {
  const relative = path.relative(root, candidate);
  return (
    relative === "" ||
    (relative !== ".." && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative))
  );
}

function isGitMetadata(root: string, candidate: string): boolean {
  return path.relative(root, candidate).split(path.sep).includes(".git");
}

export function encodeUrlPath(segments: readonly string[], directory = false): string {
  const encoded = `/${segments.map((segment) => encodeURIComponent(segment)).join("/")}`;
  return directory && encoded !== "/" ? `${encoded}/` : encoded;
}

export class RootFileSystem {
  readonly name: string;
  readonly root: string;

  private constructor(root: string) {
    this.root = root;
    this.name = path.basename(root) || root;
  }

  static async open(root: string): Promise<RootFileSystem> {
    const canonicalRoot = await realpath(root);
    const rootStats = await stat(canonicalRoot);
    if (!rootStats.isDirectory()) throw new Error(`${root} is not a directory`);
    return new RootFileSystem(canonicalRoot);
  }

  async resolvePathname(encodedPathname: string): Promise<ResolvedFile | undefined> {
    let decoded: string;
    try {
      decoded = decodeURIComponent(encodedPathname);
    } catch {
      return undefined;
    }
    if (decoded.includes("\0") || decoded.includes("\\")) return undefined;

    const segments = decoded.split("/").filter(Boolean);
    if (segments.some((segment) => segment === "." || segment === ".." || segment === ".git")) {
      return undefined;
    }

    const candidate = path.resolve(this.root, ...segments);
    if (!isWithin(this.root, candidate)) return undefined;

    try {
      const canonicalPath = await realpath(candidate);
      if (!isWithin(this.root, canonicalPath) || isGitMetadata(this.root, canonicalPath))
        return undefined;
      const canonicalStats = await stat(canonicalPath);
      if (!canonicalStats.isDirectory() && !canonicalStats.isFile()) return undefined;
      return {
        absolutePath: canonicalPath,
        segments,
        stats: canonicalStats,
      };
    } catch {
      return undefined;
    }
  }

  async list(directory: ResolvedFile): Promise<DirectoryEntry[]> {
    const dirents = await readdir(directory.absolutePath, {withFileTypes: true});
    const entries = await Promise.all(
      dirents.map(async (dirent): Promise<DirectoryEntry | undefined> => {
        if (dirent.name === ".git") return undefined;
        try {
          const childPath = await realpath(path.join(directory.absolutePath, dirent.name));
          if (!isWithin(this.root, childPath) || isGitMetadata(this.root, childPath))
            return undefined;
          const childStats = await stat(childPath);
          if (!childStats.isDirectory() && !childStats.isFile()) return undefined;
          const isDirectory = childStats.isDirectory();
          return {
            isDirectory,
            modified: childStats.mtime,
            name: dirent.name,
            size: childStats.size,
            url: encodeUrlPath([...directory.segments, dirent.name], isDirectory),
          };
        } catch {
          return undefined;
        }
      }),
    );

    return entries
      .filter((entry): entry is DirectoryEntry => entry !== undefined)
      .toSorted((left, right) => {
        if (left.isDirectory !== right.isDirectory) return left.isDirectory ? -1 : 1;
        return left.name.localeCompare(right.name, undefined, {sensitivity: "base"});
      });
  }

  async buildWikiIndex(): Promise<Map<string, string>> {
    const index = new Map<string, string>();
    const visited = new Set<string>();

    const walk = async (absoluteDirectory: string, segments: string[]): Promise<void> => {
      if (visited.has(absoluteDirectory)) return;
      visited.add(absoluteDirectory);

      let entries;
      try {
        entries = await readdir(absoluteDirectory, {withFileTypes: true});
      } catch {
        return;
      }

      await Promise.all(
        entries.map(async (entry) => {
          if (entry.name === ".git" || entry.name === "node_modules") return;
          if (
            !entry.isDirectory() &&
            !entry.isSymbolicLink() &&
            (!entry.isFile() || !isMarkdown(entry.name))
          ) {
            return;
          }
          try {
            const child = await realpath(path.join(absoluteDirectory, entry.name));
            if (!isWithin(this.root, child) || isGitMetadata(this.root, child)) return;
            const childStats = await stat(child);
            if (childStats.isDirectory()) {
              await walk(child, [...segments, entry.name]);
              return;
            }
            if (!childStats.isFile() || !isMarkdown(entry.name)) return;
            const extension = path.extname(entry.name);
            const stem = entry.name.slice(0, -extension.length).toLowerCase();
            const url = encodeUrlPath([...segments, entry.name]);
            if (!index.has(stem)) index.set(stem, url);
            if (!index.has(entry.name.toLowerCase())) index.set(entry.name.toLowerCase(), url);
          } catch {
            // The mounted directory may change while it is being indexed.
          }
        }),
      );
    };

    await walk(this.root, []);
    return index;
  }
}

export function isMarkdown(name: string): boolean {
  return markdownExtensions.has(path.extname(name).toLowerCase());
}

export function languageForFile(name: string): string {
  const lowerName = name.toLowerCase();
  return languagesByName[lowerName] ?? languagesByExtension[path.extname(lowerName)] ?? "text";
}

export function isTextContent(name: string, contents: Uint8Array): boolean {
  const extension = path.extname(name).toLowerCase();
  const mimeType = lookup(name);
  if (
    languageForFile(name) !== "text" ||
    textExtensions.has(extension) ||
    (typeof mimeType === "string" && mimeType.startsWith("text/"))
  ) {
    return true;
  }
  if (contents.includes(0)) return false;
  try {
    new TextDecoder("utf-8", {fatal: true}).decode(contents);
    return true;
  } catch {
    return false;
  }
}

export function contentType(name: string): string {
  const sourceType = sourceContentTypes[path.extname(name).toLowerCase()];
  if (sourceType !== undefined) return sourceType;
  const type = lookup(name) || "application/octet-stream";
  if (
    typeof type === "string" &&
    (type.startsWith("text/") || type === "application/json" || type.endsWith("+json"))
  ) {
    return `${type}; charset=utf-8`;
  }
  return String(type);
}

export function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  const units = ["KB", "MB", "GB", "TB"];
  let value = bytes / 1024;
  let unit = units[0] ?? "KB";
  for (let index = 1; value >= 1024 && index < units.length; index += 1) {
    value /= 1024;
    unit = units[index] ?? unit;
  }
  return `${value.toFixed(1)} ${unit}`;
}

export function formatModified(date: Date): string {
  return date.toISOString().slice(0, 16);
}

export async function openResolvedFile(file: ResolvedFile): Promise<OpenedFile> {
  const handle = await open(file.absolutePath, constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0));
  try {
    const handleStats = await handle.stat();
    if (!handleStats.isFile()) throw new Error("path is not a regular file");
    return {handle, stats: handleStats};
  } catch (error) {
    await handle.close();
    throw error;
  }
}

export async function readResolvedFile(
  file: ResolvedFile,
  maximumBytes: number,
): Promise<ReadFileResult | undefined> {
  const {handle, stats: handleStats} = await openResolvedFile(file);
  try {
    if (handleStats.size > maximumBytes) return undefined;
    const contents = await handle.readFile();
    if (contents.byteLength > maximumBytes) return undefined;
    return {contents, stats: handleStats};
  } finally {
    await handle.close();
  }
}
