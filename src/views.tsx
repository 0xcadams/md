/** @jsxImportSource hono/jsx */
import {html, raw} from "hono/html";
import type {PropsWithChildren} from "hono/jsx";

import type {DirectoryEntry} from "./filesystem.js";
import {encodeUrlPath, formatModified, formatSize} from "./filesystem.js";

function FileIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 16 16" width="16" height="16">
      <path d="M3.75 1.75A1.75 1.75 0 0 1 5.5 0h4.086c.464 0 .909.184 1.237.513l2.664 2.664c.329.328.513.773.513 1.237v9.836A1.75 1.75 0 0 1 12.25 16h-6.5A1.75 1.75 0 0 1 4 14.25V2.5a.25.25 0 0 0-.25-.25h-.5a.75.75 0 0 1 0-1.5h.5Zm1.75-.25a.25.25 0 0 0-.25.25v12.5c0 .138.112.25.25.25h6.75a.25.25 0 0 0 .25-.25V5h-2.25A1.25 1.25 0 0 1 9 3.75V1.5H5.5Zm5 .31v1.94c0 .138.112.25.25.25h1.94L10.5 1.81Z" />
    </svg>
  );
}

function FolderIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 16 16" width="16" height="16">
      <path d="M1.75 1h4.586c.464 0 .909.184 1.237.513L9.06 3H14.25A1.75 1.75 0 0 1 16 4.75v8.5A1.75 1.75 0 0 1 14.25 15H1.75A1.75 1.75 0 0 1 0 13.25V2.75C0 1.784.784 1 1.75 1Zm0 1.5a.25.25 0 0 0-.25.25v10.5c0 .138.112.25.25.25h12.5a.25.25 0 0 0 .25-.25v-8.5a.25.25 0 0 0-.25-.25H8.75a.75.75 0 0 1-.53-.22L6.513 2.573a.25.25 0 0 0-.177-.073H1.75Z" />
    </svg>
  );
}

function BrandIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 16 16" width="16" height="16">
      <path d="M2.75 1A1.75 1.75 0 0 0 1 2.75v10.5C1 14.216 1.784 15 2.75 15h10.5A1.75 1.75 0 0 0 15 13.25V2.75A1.75 1.75 0 0 0 13.25 1H2.75ZM2.5 2.75a.25.25 0 0 1 .25-.25h10.5a.25.25 0 0 1 .25.25v10.5a.25.25 0 0 1-.25.25H2.75a.25.25 0 0 1-.25-.25V2.75Zm2.25 2a.75.75 0 0 0 0 1.5h6.5a.75.75 0 0 0 0-1.5h-6.5Zm0 3a.75.75 0 0 0 0 1.5h4.5a.75.75 0 0 0 0-1.5h-4.5Zm0 3a.75.75 0 0 0 0 1.5h6.5a.75.75 0 0 0 0-1.5h-6.5Z" />
    </svg>
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
  title: string;
}

export function Layout(props: PropsWithChildren<LayoutProps>) {
  return (
    <>
      {html`<!doctype html>`}
      <html
        lang="en"
        data-color-mode="auto"
        data-dark-theme="dark"
        data-light-theme="light"
        data-theme="auto"
      >
        <head>
          <meta charset="utf-8" />
          <meta name="viewport" content="width=device-width, initial-scale=1" />
          <meta name="color-scheme" content="light dark" />
          <title>{props.title}</title>
          <link rel="stylesheet" href="/__md/assets/styles.css" />
        </head>
        <body>
          <header class="site-header">
            <a class="brand" href="/" aria-label="md home">
              <BrandIcon />
              <span>md</span>
            </a>
            <button
              class="theme-toggle"
              id="theme-toggle"
              type="button"
              aria-label="Toggle color theme"
              title="Toggle color theme"
            >
              <svg
                class="theme-icon theme-icon-light"
                aria-hidden="true"
                viewBox="0 0 16 16"
                width="16"
                height="16"
              >
                <path d="M8 10.5A2.5 2.5 0 1 0 8 5a2.5 2.5 0 0 0 0 5.5ZM8 4a4 4 0 1 1 0 8 4 4 0 0 1 0-8Zm0-4a.75.75 0 0 1 .75.75v1.5a.75.75 0 0 1-1.5 0V.75A.75.75 0 0 1 8 0Zm0 13a.75.75 0 0 1 .75.75v1.5a.75.75 0 0 1-1.5 0v-1.5A.75.75 0 0 1 8 13ZM.75 7.25h1.5a.75.75 0 0 1 0 1.5H.75a.75.75 0 0 1 0-1.5Zm13 0h1.5a.75.75 0 0 1 0 1.5h-1.5a.75.75 0 0 1 0-1.5ZM2.697 1.636a.75.75 0 0 1 1.06 0l1.061 1.06a.75.75 0 0 1-1.06 1.061l-1.061-1.06a.75.75 0 0 1 0-1.061Zm8.485 8.485a.75.75 0 0 1 1.06 0l1.061 1.061a.75.75 0 0 1-1.06 1.06l-1.061-1.06a.75.75 0 0 1 0-1.06Zm2.121-8.485a.75.75 0 0 1 0 1.06l-1.06 1.061a.75.75 0 1 1-1.061-1.06l1.06-1.061a.75.75 0 0 1 1.061 0ZM4.818 10.12a.75.75 0 0 1 0 1.061l-1.06 1.061a.75.75 0 0 1-1.061-1.06l1.06-1.062a.75.75 0 0 1 1.061 0Z" />
              </svg>
              <svg
                class="theme-icon theme-icon-dark"
                aria-hidden="true"
                viewBox="0 0 16 16"
                width="16"
                height="16"
              >
                <path d="M9.598 1.591a.75.75 0 0 1 .785-.175 6.75 6.75 0 1 1-8.967 8.967.75.75 0 0 1 .96-.96 5.25 5.25 0 0 0 7.047-7.047.75.75 0 0 1 .175-.785ZM8.08 3.12a6.75 6.75 0 0 1-5.201 5.201A5.25 5.25 0 1 0 8.08 3.12Z" />
              </svg>
            </button>
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
}) {
  const title = props.segments.at(-1) ?? props.rootName;
  const hasRows = props.entries.length > 0 || props.segments.length > 0;
  return (
    <Layout title={`${title} - md`} rootName={props.rootName} segments={props.segments} directory>
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
}) {
  return (
    <Layout
      title={props.name}
      rootName={props.rootName}
      segments={props.segments}
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
}) {
  return (
    <Layout
      title={props.name}
      rootName={props.rootName}
      segments={props.segments}
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
  title: string;
}) {
  return (
    <Layout
      title={props.title}
      rootName={props.rootName}
      segments={props.segments ?? []}
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
