/** @jsxImportSource hono/jsx */
import {html, raw} from "hono/html";
import type {PropsWithChildren} from "hono/jsx";

import type {DirectoryEntry} from "./filesystem.js";
import {encodeUrlPath, formatModified, formatSize} from "./filesystem.js";
import {codeThemes, type CodeTheme, type ThemeAppearance} from "./themes.js";

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
            <a class="brand" href="/" aria-label="md home">
              <img src="/__md/assets/logo.svg" alt="" width="32" height="32" />
            </a>
            <ThemeSelector theme={props.theme} />
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

function rawUrl(segments: readonly string[]): string {
  return `/raw${encodeUrlPath(segments)}`;
}

export function DirectoryPage(props: {
  entries: readonly DirectoryEntry[];
  readme?: ReadmePanel | undefined;
  rootName: string;
  segments: readonly string[];
  theme: CodeTheme;
}) {
  const title = props.segments.at(-1) ?? props.rootName;
  const hasRows = props.entries.length > 0 || props.segments.length > 0;
  return (
    <Layout
      title={`${title} - md`}
      rootName={props.rootName}
      segments={props.segments}
      theme={props.theme}
      directory
    >
      <section class="file-list" aria-label="Directory contents">
        <div class="list-header">
          <span>
            {props.entries.length} item{props.entries.length === 1 ? "" : "s"}
          </span>
        </div>
        {hasRows ? (
          <table>
            <thead>
              <tr>
                <th>Name</th>
                <th class="entry-size">Size</th>
                <th class="entry-modified">Modified</th>
              </tr>
            </thead>
            <tbody>
              {props.segments.length > 0 ? (
                <tr>
                  <td class="entry-name">
                    <FolderIcon />
                    <a href={encodeUrlPath(props.segments.slice(0, -1), true)}>..</a>
                  </td>
                  <td class="entry-size" />
                  <td class="entry-modified" />
                </tr>
              ) : null}
              {props.entries.map((entry) => (
                <tr>
                  <td class="entry-name">
                    {entry.isDirectory ? <FolderIcon /> : <FileIcon />}
                    <a href={entry.url}>
                      {entry.name}
                      {entry.isDirectory ? "/" : ""}
                    </a>
                  </td>
                  <td class="entry-size">{entry.isDirectory ? "" : formatSize(entry.size)}</td>
                  <td class="entry-modified">
                    <time dateTime={entry.modified.toISOString()}>
                      {formatModified(entry.modified)}
                    </time>
                  </td>
                </tr>
              ))}
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
