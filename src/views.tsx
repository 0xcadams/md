/** @jsxImportSource hono/jsx */
import {html, raw} from "hono/html";
import type {PropsWithChildren} from "hono/jsx";

import type {DirectoryEntry} from "./filesystem.js";
import {encodeUrlPath, formatModified, formatSize} from "./filesystem.js";
import type {GitChange, GitChangeKind, GitCommit, GitDirectoryInfo} from "./git.js";
import {codeThemes, type CodeTheme, type ThemeAppearance} from "./themes.js";

const relativeTime = new Intl.RelativeTimeFormat("en", {numeric: "auto"});

function LucideIcon(props: PropsWithChildren<{class?: string}>) {
  return (
    <svg
      class={props.class}
      aria-hidden="true"
      viewBox="0 0 24 24"
      width="16"
      height="16"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {props.children}
    </svg>
  );
}

function FileIcon() {
  return (
    <LucideIcon>
      <path d="M6 22a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h8a2.4 2.4 0 0 1 1.704.706l3.588 3.588A2.4 2.4 0 0 1 20 8v12a2 2 0 0 1-2 2z" />
      <path d="M14 2v5a1 1 0 0 0 1 1h5" />
    </LucideIcon>
  );
}

function FolderIcon() {
  return (
    <LucideIcon>
      <path d="M20 20a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.9a2 2 0 0 1-1.69-.9L9.6 3.9A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2Z" />
    </LucideIcon>
  );
}

function BranchIcon() {
  return (
    <LucideIcon>
      <line x1="6" x2="6" y1="3" y2="15" />
      <circle cx="18" cy="6" r="3" />
      <circle cx="6" cy="18" r="3" />
      <path d="M18 9a9 9 0 0 1-9 9" />
    </LucideIcon>
  );
}

function TagIcon() {
  return (
    <LucideIcon>
      <path d="M12.586 2.586A2 2 0 0 0 11.172 2H4a2 2 0 0 0-2 2v7.172a2 2 0 0 0 .586 1.414l8.704 8.704a2.426 2.426 0 0 0 3.42 0l6.58-6.58a2.426 2.426 0 0 0 0-3.42z" />
      <circle cx="7.5" cy="7.5" r=".5" fill="currentColor" />
    </LucideIcon>
  );
}

function CommitIcon() {
  return (
    <LucideIcon>
      <circle cx="12" cy="12" r="3" />
      <line x1="3" x2="9" y1="12" y2="12" />
      <line x1="15" x2="21" y1="12" y2="12" />
    </LucideIcon>
  );
}

function HistoryIcon() {
  return (
    <LucideIcon>
      <path d="M3 12a9 9 0 1 0 3-6.7L3 8" />
      <path d="M3 3v5h5" />
      <path d="M12 7v5l4 2" />
    </LucideIcon>
  );
}

function CodeIcon() {
  return (
    <LucideIcon>
      <path d="m16 18 6-6-6-6" />
      <path d="m8 6-6 6 6 6" />
    </LucideIcon>
  );
}

function CopyIcon(props: {class: string}) {
  return (
    <LucideIcon class={props.class}>
      <rect width="14" height="14" x="8" y="8" rx="2" ry="2" />
      <path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2" />
    </LucideIcon>
  );
}

function CheckIcon(props: {class: string}) {
  return (
    <LucideIcon class={props.class}>
      <path d="m20 6-11 11-5-5" />
    </LucideIcon>
  );
}

function ChangesIcon() {
  return (
    <LucideIcon>
      <circle cx="6" cy="6" r="3" />
      <path d="M6 9v12" />
      <circle cx="18" cy="18" r="3" />
      <path d="M18 15V3" />
    </LucideIcon>
  );
}

function PaletteIcon() {
  return (
    <LucideIcon class="theme-select-icon">
      <path d="M12 22a1 1 0 0 1 0-20 10 9 0 0 1 10 9 5 5 0 0 1-5 5h-2.25a1.75 1.75 0 0 0-1.4 2.8l.3.4a1.75 1.75 0 0 1-1.4 2.8z" />
      <circle cx="13.5" cy="6.5" r=".5" fill="currentColor" />
      <circle cx="17.5" cy="10.5" r=".5" fill="currentColor" />
      <circle cx="6.5" cy="12.5" r=".5" fill="currentColor" />
      <circle cx="8.5" cy="7.5" r=".5" fill="currentColor" />
    </LucideIcon>
  );
}

function ChevronDownIcon() {
  return (
    <LucideIcon class="theme-select-chevron">
      <path d="m6 9 6 6 6-6" />
    </LucideIcon>
  );
}

function ThemeOptions(props: {appearance: ThemeAppearance; selected: CodeTheme}) {
  return (
    <optgroup label={props.appearance === "light" ? "Light" : "Dark"}>
      {codeThemes
        .filter((theme) => theme.appearance === props.appearance)
        .map((theme) => (
          <option value={theme.id} selected={theme.id === props.selected.id}>
            {theme.label}
          </option>
        ))}
    </optgroup>
  );
}

function ThemeSelector(props: {theme: CodeTheme}) {
  return (
    <label class="theme-selector">
      <span class="visually-hidden">Syntax theme</span>
      <PaletteIcon />
      <select id="theme-selector" name="theme">
        <ThemeOptions appearance="light" selected={props.theme} />
        <ThemeOptions appearance="dark" selected={props.theme} />
      </select>
      <ChevronDownIcon />
    </label>
  );
}

function Breadcrumbs(props: {directory: boolean; rootName: string; segments: readonly string[]}) {
  const displayedPath = props.segments.join("/");
  return (
    <nav class="breadcrumbs" aria-label="Breadcrumb">
      <a class="repo-name" href="/">
        {props.rootName}
      </a>
      {props.segments.map((segment, index) => {
        const current = index === props.segments.length - 1;
        const url = encodeUrlPath(props.segments.slice(0, index + 1), props.directory || !current);
        return (
          <>
            <span class="breadcrumb-separator">/</span>
            {current && !props.directory ? (
              <span aria-current="page">{segment}</span>
            ) : (
              <a href={url}>{segment}</a>
            )}
          </>
        );
      })}
      {displayedPath === "" ? null : (
        <button
          type="button"
          class="button copy-path-button"
          data-copy-path={displayedPath}
          aria-label="Copy path"
          title="Copy path"
        >
          <div>
            <CopyIcon class="copy-path-copy-icon" />
            <CheckIcon class="copy-path-check-icon" />
          </div>
        </button>
      )}
    </nav>
  );
}

interface LayoutProps {
  directory: boolean;
  rootName: string;
  segments: readonly string[];
  theme: CodeTheme;
  title: string;
}

export function Layout(props: PropsWithChildren<LayoutProps>) {
  return (
    <>
      {html`<!doctype html>`}
      <html lang="en" data-code-theme={props.theme.id} data-theme={props.theme.appearance}>
        <head>
          <meta charset="utf-8" />
          <meta name="viewport" content="width=device-width, initial-scale=1" />
          <meta name="color-scheme" content={props.theme.appearance} />
          <title>{props.title}</title>
          <link rel="icon" href="/__md/assets/logo.svg" type="image/svg+xml" />
          <link rel="stylesheet" href="/__md/assets/styles.css" />
        </head>
        <body>
          <header class="site-header">
            <div class="site-header-inner">
              <a class="brand" href="/" aria-label="md home">
                <img src="/__md/assets/logo.svg" alt="" width="32" height="32" />
              </a>
              <ThemeSelector theme={props.theme} />
            </div>
          </header>
          <main class="page-shell">
            <Breadcrumbs
              directory={props.directory}
              rootName={props.rootName}
              segments={props.segments}
            />
            {props.children}
          </main>
          <script type="module" src="/__md/assets/app.js" />
        </body>
      </html>
    </>
  );
}

export interface ReadmePanel {
  html: string;
  name: string;
  url: string;
}

export function formatRelativeDate(date: Date, now = new Date()): string {
  const seconds = Math.round((date.getTime() - now.getTime()) / 1_000);
  const absolute = Math.abs(seconds);
  if (absolute < 60) return relativeTime.format(seconds, "second");
  if (absolute < 60 * 60) return relativeTime.format(Math.round(seconds / 60), "minute");
  if (absolute < 24 * 60 * 60) return relativeTime.format(Math.round(seconds / (60 * 60)), "hour");
  if (absolute < 30 * 24 * 60 * 60)
    return relativeTime.format(Math.round(seconds / (24 * 60 * 60)), "day");
  if (absolute < 365 * 24 * 60 * 60)
    return relativeTime.format(Math.round(seconds / (30 * 24 * 60 * 60)), "month");
  return relativeTime.format(Math.round(seconds / (365 * 24 * 60 * 60)), "year");
}

function RelativeDate(props: {date: Date}) {
  return (
    <time dateTime={props.date.toISOString()} title={props.date.toISOString()}>
      {formatRelativeDate(props.date)}
    </time>
  );
}

function githubPage(repositoryUrl: string, page: string, value?: string): string {
  return `${repositoryUrl}/${page}${value === undefined ? "" : `/${encodeURIComponent(value)}`}`;
}

function RepositoryStat(props: PropsWithChildren<{href: string | undefined}>) {
  return props.href === undefined ? (
    <span class="repo-stat">{props.children}</span>
  ) : (
    <a class="repo-stat" href={props.href}>
      {props.children}
    </a>
  );
}

function changeCode(kind: GitChangeKind): string {
  switch (kind) {
    case "added":
      return "A";
    case "copied":
      return "C";
    case "deleted":
      return "D";
    case "modified":
      return "M";
    case "renamed":
      return "R";
    case "type-changed":
      return "T";
  }
}

function changeName(kind: GitChangeKind): string {
  return kind === "type-changed" ? "type changed" : kind;
}

function StatusBadge(props: {
  kind?: GitChangeKind;
  location?: "staged" | "unstaged";
  special?: "conflicted" | "untracked";
}) {
  const code =
    props.special === "conflicted"
      ? "U"
      : props.special === "untracked"
        ? "?"
        : changeCode(props.kind!);
  const description =
    props.special === undefined
      ? `${props.location === "staged" ? "Staged" : "Unstaged"}: ${changeName(props.kind!)}`
      : `${props.special[0]?.toUpperCase()}${props.special.slice(1)}`;
  const tone = props.special ?? props.kind ?? "modified";
  return (
    <span
      class={`status-badge status-${tone} ${props.location === "unstaged" ? "status-unstaged" : ""}`}
      aria-label={description}
      role="img"
      title={description}
    >
      {code}
    </span>
  );
}

function ChangeBadges(props: {change: GitChange}) {
  return (
    <span class="status-badges">
      {props.change.conflicted ? <StatusBadge special="conflicted" /> : null}
      {props.change.untracked ? <StatusBadge special="untracked" /> : null}
      {props.change.staged ? <StatusBadge kind={props.change.staged} location="staged" /> : null}
      {props.change.unstaged ? (
        <StatusBadge kind={props.change.unstaged} location="unstaged" />
      ) : null}
    </span>
  );
}

function changeDescription(change: GitChange): string {
  if (change.conflicted) return "conflicted";
  if (change.untracked) return "untracked";
  const descriptions: string[] = [];
  if (change.staged !== undefined) descriptions.push(`staged ${changeName(change.staged)}`);
  if (change.unstaged !== undefined) descriptions.push(`unstaged ${changeName(change.unstaged)}`);
  return descriptions.join(", ");
}

function displayGitPath(filePath: string, segments: readonly string[]): string {
  const prefix = segments.length === 0 ? "" : `${segments.join("/")}/`;
  return prefix !== "" && filePath.startsWith(prefix) ? filePath.slice(prefix.length) : filePath;
}

function isDeleted(change: GitChange): boolean {
  return change.staged === "deleted" || change.unstaged === "deleted";
}

function ChangesDisclosure(props: {changes: readonly GitChange[]; segments: readonly string[]}) {
  if (props.changes.length === 0) return null;
  return (
    <details class="changes-disclosure">
      <summary>
        <ChangesIcon />
        {props.changes.length} change{props.changes.length === 1 ? "" : "s"}
      </summary>
      <div class="changes-menu">
        <div class="changes-menu-header">Working tree</div>
        <ul>
          {props.changes.map((change) => {
            const currentPath = displayGitPath(change.path, props.segments);
            const originalPath =
              change.originalPath === undefined
                ? undefined
                : displayGitPath(change.originalPath, props.segments);
            const label =
              originalPath === undefined ? currentPath : `${originalPath} -> ${currentPath}`;
            const pathSegments = change.path.split("/");
            return (
              <li>
                <ChangeBadges change={change} />
                {isDeleted(change) ? (
                  <span class="change-path">{label}</span>
                ) : (
                  <a class="change-path" href={encodeUrlPath(pathSegments)}>
                    {label}
                  </a>
                )}
                <span class="change-description">{changeDescription(change)}</span>
              </li>
            );
          })}
        </ul>
      </div>
    </details>
  );
}

function EntryChanges(props: {changes: readonly GitChange[]; directory: boolean}) {
  if (props.changes.length === 0) return null;
  if (props.directory) {
    return (
      <span class="status-count" title="Uncommitted changes inside this directory">
        {props.changes.length} change{props.changes.length === 1 ? "" : "s"}
      </span>
    );
  }
  return (
    <span class="entry-statuses">
      {props.changes.map((change) => (
        <ChangeBadges change={change} />
      ))}
    </span>
  );
}

function CommitSummary(props: {commit: GitCommit; repositoryUrl: string | undefined}) {
  const url =
    props.repositoryUrl === undefined
      ? undefined
      : githubPage(props.repositoryUrl, "commit", props.commit.hash);
  return (
    <>
      <span class="commit-author">{props.commit.author}</span>
      {url === undefined ? (
        <span class="commit-summary" title={props.commit.summary}>
          {props.commit.summary}
        </span>
      ) : (
        <a class="commit-summary" href={url} title={props.commit.summary}>
          {props.commit.summary}
        </a>
      )}
      {url === undefined ? (
        <code>{props.commit.shortHash}</code>
      ) : (
        <a class="commit-hash" href={url}>
          <code>{props.commit.shortHash}</code>
        </a>
      )}
      <span class="commit-separator" aria-hidden="true">
        {"\u00b7"}
      </span>
      <RelativeDate date={props.commit.date} />
    </>
  );
}

export interface FileGitInfo {
  commit: GitCommit;
  historyUrl?: string;
  repositoryUrl?: string;
}

function FileCommitHeader(props: {git: FileGitInfo | undefined}) {
  if (props.git === undefined) return null;
  return (
    <div class="list-header git-list-header file-commit-header">
      <CommitIcon />
      <CommitSummary commit={props.git.commit} repositoryUrl={props.git.repositoryUrl} />
      {props.git.historyUrl === undefined ? null : (
        <a class="button file-history-link" href={props.git.historyUrl}>
          <HistoryIcon />
          History
        </a>
      )}
    </div>
  );
}

function rawUrl(segments: readonly string[]): string {
  return `/raw${encodeUrlPath(segments)}`;
}

export function DirectoryPage(props: {
  entries: readonly DirectoryEntry[];
  git?: GitDirectoryInfo | undefined;
  readme?: ReadmePanel | undefined;
  rootName: string;
  segments: readonly string[];
  theme: CodeTheme;
}) {
  const title = props.segments.at(-1) ?? props.rootName;
  const hasRows = props.entries.length > 0 || props.segments.length > 0;
  const repositoryUrl = props.git?.repositoryUrl;
  const ref = props.git?.detached ? props.git.head : props.git?.branch;
  const refUrl =
    repositoryUrl === undefined || ref === undefined
      ? undefined
      : githubPage(repositoryUrl, props.git?.detached ? "commit" : "tree", ref);
  const commitsUrl =
    repositoryUrl === undefined || ref === undefined
      ? undefined
      : githubPage(repositoryUrl, "commits", ref);
  return (
    <Layout
      title={`${title} - md`}
      rootName={props.rootName}
      segments={props.segments}
      theme={props.theme}
      directory
    >
      {props.git ? (
        <div class="repo-toolbar">
          {refUrl === undefined ? (
            <span
              class="branch-label"
              title={props.git.detached ? "Detached HEAD" : "Current branch"}
            >
              <BranchIcon />
              {props.git.detached ? (props.git.head?.slice(0, 7) ?? "HEAD") : props.git.branch}
            </span>
          ) : (
            <a
              class="branch-label"
              href={refUrl}
              title={props.git.detached ? "Detached HEAD on GitHub" : "Current branch on GitHub"}
            >
              <BranchIcon />
              {props.git.detached ? (props.git.head?.slice(0, 7) ?? "HEAD") : props.git.branch}
            </a>
          )}
          {props.git.branchCount === undefined ? null : (
            <RepositoryStat
              href={repositoryUrl === undefined ? undefined : githubPage(repositoryUrl, "branches")}
            >
              <BranchIcon />
              <span>
                <strong>{props.git.branchCount}</strong> Branch
                {props.git.branchCount === 1 ? "" : "es"}
              </span>
            </RepositoryStat>
          )}
          {props.git.tagCount === undefined ? null : (
            <RepositoryStat
              href={repositoryUrl === undefined ? undefined : githubPage(repositoryUrl, "tags")}
            >
              <TagIcon />
              <span>
                <strong>{props.git.tagCount}</strong> Tag{props.git.tagCount === 1 ? "" : "s"}
              </span>
            </RepositoryStat>
          )}
          <span class="item-count">
            {props.entries.length} item{props.entries.length === 1 ? "" : "s"}
          </span>
          {props.git.changes.length === 0 && repositoryUrl === undefined ? null : (
            <div class="repo-toolbar-actions">
              <ChangesDisclosure changes={props.git.changes} segments={props.segments} />
              {repositoryUrl === undefined ? null : (
                <a class="button repository-link" href={repositoryUrl}>
                  <CodeIcon />
                  GitHub
                </a>
              )}
            </div>
          )}
        </div>
      ) : null}
      <section class="file-list" aria-label="Directory contents">
        {props.git ? (
          <div class="list-header git-list-header">
            <CommitIcon />
            {props.git.commit ? (
              <CommitSummary commit={props.git.commit} repositoryUrl={repositoryUrl} />
            ) : (
              <span class="commit-summary">No commits yet</span>
            )}
            {props.git.commitCount === undefined ? null : commitsUrl === undefined ? (
              <span class="commit-count">
                <HistoryIcon />
                {props.git.commitCount} Commit{props.git.commitCount === 1 ? "" : "s"}
              </span>
            ) : (
              <a class="commit-count" href={commitsUrl}>
                <HistoryIcon />
                {props.git.commitCount} Commit{props.git.commitCount === 1 ? "" : "s"}
              </a>
            )}
          </div>
        ) : (
          <div class="list-header">
            <span>
              {props.entries.length} item{props.entries.length === 1 ? "" : "s"}
            </span>
          </div>
        )}
        {hasRows ? (
          <table>
            <tbody>
              {props.segments.length > 0 ? (
                <tr>
                  <td class="entry-name">
                    <FolderIcon />
                    <a href={encodeUrlPath(props.segments.slice(0, -1), true)}>..</a>
                  </td>
                  {props.git ? (
                    <>
                      <td class="entry-commit" />
                      <td class="entry-updated" />
                    </>
                  ) : (
                    <>
                      <td class="entry-size" />
                      <td class="entry-modified" />
                    </>
                  )}
                </tr>
              ) : null}
              {props.entries.map((entry) => {
                const gitEntry = props.git?.entries.get(entry.name);
                return (
                  <tr>
                    <td class="entry-name">
                      {entry.isDirectory ? <FolderIcon /> : <FileIcon />}
                      <a href={entry.url}>
                        {entry.name}
                        {entry.isDirectory ? "/" : ""}
                      </a>
                      {gitEntry ? (
                        <EntryChanges changes={gitEntry.changes} directory={entry.isDirectory} />
                      ) : null}
                    </td>
                    {props.git ? (
                      <>
                        <td class="entry-commit" title={gitEntry?.commit?.summary}>
                          {gitEntry?.commit === undefined ? null : repositoryUrl === undefined ? (
                            gitEntry.commit.summary
                          ) : (
                            <a href={githubPage(repositoryUrl, "commit", gitEntry.commit.hash)}>
                              {gitEntry.commit.summary}
                            </a>
                          )}
                        </td>
                        <td class="entry-updated">
                          {gitEntry?.commit === undefined ? null : (
                            <RelativeDate date={gitEntry.commit.date} />
                          )}
                        </td>
                      </>
                    ) : (
                      <>
                        <td class="entry-size">
                          {entry.isDirectory ? "" : formatSize(entry.size)}
                        </td>
                        <td class="entry-modified">
                          <time dateTime={entry.modified.toISOString()}>
                            {formatModified(entry.modified)}
                          </time>
                        </td>
                      </>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>
        ) : (
          <div class="empty-state">This directory is empty.</div>
        )}
      </section>
      {props.readme ? (
        <section class="readme-panel">
          <div class="panel-header">
            <FileIcon />
            <a href={props.readme.url}>{props.readme.name}</a>
          </div>
          <article class="markdown-body">{raw(props.readme.html)}</article>
        </section>
      ) : null}
    </Layout>
  );
}

export function MarkdownPage(props: {
  git?: FileGitInfo | undefined;
  html: string;
  name: string;
  rootName: string;
  segments: readonly string[];
  theme: CodeTheme;
}) {
  return (
    <Layout
      title={props.name}
      rootName={props.rootName}
      segments={props.segments}
      theme={props.theme}
      directory={false}
    >
      <FileCommitHeader git={props.git} />
      <section class="document-panel">
        <div class="panel-header">
          <FileIcon />
          <span>{props.name}</span>
          <a class="button" href={rawUrl(props.segments)}>
            Raw
          </a>
        </div>
        <article class="markdown-body">{raw(props.html)}</article>
      </section>
    </Layout>
  );
}

export function SourcePage(props: {
  git?: FileGitInfo | undefined;
  highlighted: string;
  language: string;
  name: string;
  rootName: string;
  segments: readonly string[];
  size: number;
  theme: CodeTheme;
}) {
  return (
    <Layout
      title={props.name}
      rootName={props.rootName}
      segments={props.segments}
      theme={props.theme}
      directory={false}
    >
      <FileCommitHeader git={props.git} />
      <section class="document-panel code-panel">
        <div class="panel-header">
          <FileIcon />
          <span>{props.name}</span>
          <span class="file-meta">
            {formatSize(props.size)} &middot; {props.language}
          </span>
          <a class="button" href={rawUrl(props.segments)}>
            Raw
          </a>
        </div>
        <div class="source-code">{raw(props.highlighted)}</div>
      </section>
    </Layout>
  );
}

export function MessagePage(props: {
  message: string;
  rootName: string;
  segments?: readonly string[];
  status: number;
  theme: CodeTheme;
  title: string;
}) {
  return (
    <Layout
      title={props.title}
      rootName={props.rootName}
      segments={props.segments ?? []}
      theme={props.theme}
      directory={false}
    >
      <section class="message-panel">
        <strong>{props.status}</strong>
        <h1>{props.title}</h1>
        <p>{props.message}</p>
      </section>
    </Layout>
  );
}
