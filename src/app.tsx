/** @jsxImportSource hono/jsx */
import {access, readFile, realpath} from "node:fs/promises";
import path from "node:path";
import {Readable} from "node:stream";
import {fileURLToPath} from "node:url";

import {Hono, type Context} from "hono";
import {accepts} from "hono/accepts";
import {getCookie} from "hono/cookie";
import {secureHeaders} from "hono/secure-headers";

import {parseWorkingTreeDiff, type ParsedWorkingTreeDiff} from "./diff.js";
import {
  contentType,
  encodeUrlPath,
  isMarkdown,
  isTextContent,
  languageForFile,
  openResolvedFile,
  readResolvedFile,
  RootFileSystem,
  type ResolvedFile,
} from "./filesystem.js";
import {GitRepositoryResolver, type GitMetadataProvider} from "./git.js";
import {MarkdownRenderer} from "./markdown.js";
import {resolveCodeTheme, themeCookieName} from "./themes.js";
import {
  DirectoryPage,
  DiffPage,
  type FileGitInfo,
  type HighlightedDiffFile,
  type HighlightedWorkingTreeDiff,
  MarkdownPage,
  MessagePage,
  type ReadmePanel,
  SourcePage,
} from "./views.js";

const maximumRenderedFileSize = 5 * 1024 * 1024;
const assetPrefix = "/__peruse/assets/";
const imageResponseVary = "Accept, Sec-Fetch-Dest";

function requestTheme(context: Context) {
  return resolveCodeTheme(getCookie(context, themeCookieName));
}

async function highlightWorkingTreeDiff(
  diff: ParsedWorkingTreeDiff,
  markdown: MarkdownRenderer,
  theme: ReturnType<typeof resolveCodeTheme>,
): Promise<HighlightedWorkingTreeDiff> {
  const files = await Promise.all(
    diff.files.map(async (file): Promise<HighlightedDiffFile> => {
      const language = languageForFile(file.change.path);
      let foreground = "inherit";
      const hunks = await Promise.all(
        file.hunks.map(async (hunk) => {
          const oldLines = hunk.lines
            .filter((line) => line.kind === "context" || line.kind === "deletion")
            .map((line) => line.content);
          const newLines = hunk.lines
            .filter((line) => line.kind === "context" || line.kind === "addition")
            .map((line) => line.content);
          const [oldCode, newCode] = await Promise.all([
            markdown.tokenize(oldLines.join("\n"), language, theme.id),
            markdown.tokenize(newLines.join("\n"), language, theme.id),
          ]);
          foreground = newCode.foreground;
          let oldIndex = 0;
          let newIndex = 0;
          return {
            ...hunk,
            lines: hunk.lines.map((line) => {
              if (line.kind === "deletion") {
                const tokens = oldCode.lines[oldIndex] ?? [];
                oldIndex += 1;
                return {...line, tokens};
              }
              if (line.kind === "addition") {
                const tokens = newCode.lines[newIndex] ?? [];
                newIndex += 1;
                return {...line, tokens};
              }
              if (line.kind === "context") {
                oldIndex += 1;
                const tokens = newCode.lines[newIndex] ?? [];
                newIndex += 1;
                return {...line, tokens};
              }
              return {...line, tokens: []};
            }),
          };
        }),
      );
      return {...file, foreground, hunks};
    }),
  );
  return {...diff, files};
}

export interface AppOptions {
  assetDirectory?: string;
  assets?: Readonly<Record<string, string | Uint8Array>>;
  customCss?: string;
  git?: GitMetadataProvider | undefined;
  logger?: Pick<Console, "error">;
  root: string;
}

async function defaultAssetDirectory(): Promise<string> {
  const candidate = fileURLToPath(new URL("../public/assets/", import.meta.url));
  await access(candidate);
  return realpath(candidate);
}

function isInside(root: string, candidate: string): boolean {
  const relative = path.relative(root, candidate);
  return (
    relative === "" ||
    (relative !== ".." && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative))
  );
}

function rawContentType(name: string): string {
  const type = contentType(name);
  const mediaType = type.split(";", 1)[0] ?? type;
  if (
    mediaType.startsWith("text/") ||
    mediaType === "application/javascript" ||
    mediaType === "application/json" ||
    mediaType === "application/xml" ||
    mediaType.endsWith("+json") ||
    mediaType.endsWith("+xml") ||
    mediaType === "image/svg+xml"
  ) {
    return "text/plain; charset=utf-8";
  }
  return type;
}

function requestPrefersImage(context: Context, mediaType: string): boolean {
  const destination = context.req.header("Sec-Fetch-Dest");
  if (destination !== undefined) return destination.trim().toLowerCase() === "image";

  return (
    accepts(context, {
      default: "text/html",
      header: "Accept",
      supports: [mediaType, "text/html"],
      match: (accepted) => {
        const qualityFor = (candidate: string, allowParameters: boolean): number => {
          const [type, subtype] = candidate.split("/", 2);
          let bestQuality = 0;
          let bestSpecificity = -1;
          for (const range of accepted) {
            const [rangeType, rangeSubtype] = range.type.toLowerCase().split("/", 2);
            if (
              type === undefined ||
              subtype === undefined ||
              rangeType === undefined ||
              rangeSubtype === undefined
            ) {
              continue;
            }
            if (
              !allowParameters &&
              Object.keys(range.params).some((name) => name.toLowerCase() !== "q")
            ) {
              continue;
            }
            if (rangeType === "*" && rangeSubtype !== "*") continue;
            if (rangeType !== "*" && rangeType !== type) continue;
            if (rangeSubtype !== "*" && rangeSubtype !== subtype) continue;

            const specificity = rangeType === "*" ? 0 : rangeSubtype === "*" ? 1 : 2;
            if (specificity > bestSpecificity) {
              bestQuality = range.q;
              bestSpecificity = specificity;
            }
          }
          return bestQuality;
        };

        return qualityFor(mediaType, false) > qualityFor("text/html", true)
          ? mediaType
          : "text/html";
      },
    }) === mediaType
  );
}

async function rawFileResponse(
  request: Request,
  file: ResolvedFile,
  options: {contentType?: string; vary?: string} = {},
): Promise<Response> {
  const name = file.segments.at(-1) ?? "file";
  let opened;
  try {
    opened = await openResolvedFile(file);
  } catch {
    return new Response("not found\n", {status: 404});
  }
  const {handle, stats} = opened;
  let start = 0;
  let end = stats.size - 1;
  let status = 200;
  const headers = new Headers({
    "Accept-Ranges": "bytes",
    "Cache-Control": "no-cache",
    "Content-Disposition": `inline; filename*=UTF-8''${encodeURIComponent(name)}`,
    "Content-Type": options.contentType ?? rawContentType(name),
    "Last-Modified": stats.mtime.toUTCString(),
  });
  if (options.vary !== undefined) headers.set("Vary", options.vary);
  const range = request.headers.has("if-range") ? null : request.headers.get("range");
  if (range !== null) {
    const match = /^bytes=(\d*)-(\d*)$/.exec(range);
    if (match !== null) {
      if (stats.size === 0) {
        headers.set("Content-Range", `bytes */${stats.size}`);
        await handle.close();
        return new Response(null, {headers, status: 416});
      }
      const requestedStart = match[1] === "" ? undefined : Number(match[1]);
      const requestedEnd = match[2] === "" ? undefined : Number(match[2]);
      if (requestedStart === undefined) {
        const suffixLength = requestedEnd ?? 0;
        if (suffixLength <= 0) {
          headers.set("Content-Range", `bytes */${stats.size}`);
          await handle.close();
          return new Response(null, {headers, status: 416});
        }
        start = Math.max(0, stats.size - suffixLength);
      } else {
        start = requestedStart;
        if (requestedEnd !== undefined) end = Math.min(requestedEnd, stats.size - 1);
      }
      if (start < 0 || start >= stats.size || end < start) {
        headers.set("Content-Range", `bytes */${stats.size}`);
        await handle.close();
        return new Response(null, {headers, status: 416});
      }
      status = 206;
      headers.set("Content-Range", `bytes ${start}-${end}/${stats.size}`);
    }
  }

  headers.set("Content-Length", String(end >= start ? end - start + 1 : 0));
  if (request.method === "HEAD") {
    await handle.close();
    return new Response(null, {headers, status});
  }
  const stream = Readable.toWeb(handle.createReadStream(status === 206 ? {end, start} : undefined));
  return new Response(stream as unknown as BodyInit, {headers, status});
}

export async function createApp(options: AppOptions): Promise<Hono> {
  const logger = options.logger ?? console;
  const files = await RootFileSystem.open(options.root);
  const git = options.git ?? new GitRepositoryResolver(files.root);
  const markdown = new MarkdownRenderer(await files.buildWikiIndex());
  const assetDirectory =
    options.assets === undefined
      ? await realpath(options.assetDirectory ?? (await defaultAssetDirectory()))
      : undefined;
  const readAsset = async (relative: string): Promise<Buffer | undefined> => {
    const embedded =
      options.assets !== undefined && Object.hasOwn(options.assets, relative)
        ? options.assets[relative]
        : undefined;
    if (embedded !== undefined) {
      return Buffer.from(embedded);
    }
    if (assetDirectory === undefined) return undefined;
    const requestedPath = path.resolve(assetDirectory, relative);
    if (!isInside(assetDirectory, requestedPath)) return undefined;
    try {
      const absolutePath = await realpath(requestedPath);
      if (!isInside(assetDirectory, absolutePath)) return undefined;
      return await readFile(absolutePath);
    } catch {
      return undefined;
    }
  };
  const bundledCss = await readAsset("styles.css");
  if (bundledCss === undefined) throw new Error("the built stylesheet is missing");
  const css = options.customCss
    ? Buffer.concat([bundledCss, Buffer.from(`\n/* Custom stylesheet */\n${options.customCss}`)])
    : bundledCss;
  const app = new Hono();

  app.use("/raw/*", async (context, next) => {
    await next();
    context.header("Content-Security-Policy", "default-src 'none'; sandbox");
  });

  app.use(
    "*",
    secureHeaders({
      contentSecurityPolicy: {
        baseUri: ["'none'"],
        connectSrc: ["'none'"],
        defaultSrc: ["'none'"],
        fontSrc: ["'self'", "data:"],
        formAction: ["'none'"],
        frameAncestors: ["'none'"],
        imgSrc: ["'self'", "data:", "http:", "https:"],
        objectSrc: ["'none'"],
        scriptSrc: ["'self'"],
        styleSrcAttr: ["'unsafe-inline'"],
        styleSrcElem: ["'self'", "'unsafe-inline'"],
      },
      referrerPolicy: "no-referrer",
      xFrameOptions: "DENY",
    }),
  );

  app.onError((error, context) => {
    logger.error(error);
    return context.html(
      <MessagePage
        message="The file could not be rendered."
        rootName={files.name}
        status={500}
        theme={requestTheme(context)}
        title="Internal server error"
      />,
      500,
    );
  });

  app.get("/__peruse/health", (context) => context.text("ok\n"));

  app.on(["GET", "HEAD"], "/__peruse/assets/*", async (context) => {
    const relative = context.req.path.slice(assetPrefix.length);
    if (relative === "styles.css") {
      return new Response(context.req.method === "HEAD" ? null : (css as unknown as BodyInit), {
        headers: {
          "Cache-Control": "no-cache",
          "Content-Length": String(css.byteLength),
          "Content-Type": "text/css; charset=utf-8",
        },
      });
    }
    if (!/^[a-zA-Z0-9_./-]+$/.test(relative)) return context.notFound();
    const body = await readAsset(relative);
    if (body === undefined) return context.notFound();
    return new Response(context.req.method === "HEAD" ? null : (body as unknown as BodyInit), {
      headers: {
        "Cache-Control": "no-cache",
        "Content-Length": String(body.byteLength),
        "Content-Type": contentType(relative),
      },
    });
  });

  app.on(["GET", "HEAD"], "/raw/*", async (context) => {
    const resolved = await files.resolvePathname(context.req.path.slice("/raw".length));
    if (resolved === undefined || resolved.stats.isDirectory()) {
      return context.html(
        <MessagePage
          message="The requested raw file does not exist inside the mounted directory."
          rootName={files.name}
          status={404}
          theme={requestTheme(context)}
          title="Not found"
        />,
        404,
      );
    }
    return await rawFileResponse(context.req.raw, resolved);
  });

  const changesHandler = async (context: Context) => {
    const theme = requestTheme(context);
    const requestPath = new URL(context.req.url).pathname;
    const scopePath = requestPath.slice("/changes".length) || "/";
    const resolved = await files.resolvePathname(scopePath);
    if (resolved === undefined) {
      return context.html(
        <MessagePage
          message="The requested changes scope does not exist inside the mounted directory."
          rootName={files.name}
          status={404}
          theme={theme}
          title="Not found"
        />,
        404,
      );
    }
    const directory = resolved.stats.isDirectory();
    const canonicalPath =
      resolved.segments.length === 0
        ? "/changes"
        : `/changes${encodeUrlPath(resolved.segments, directory)}`;
    if (requestPath !== canonicalPath) return context.redirect(canonicalPath, 308);

    const gitSegments = directory ? resolved.segments : resolved.segments.slice(0, -1);
    const workingTreeDiff = await git.workingTreeDiff(gitSegments);
    if (workingTreeDiff === undefined) {
      return context.html(
        <MessagePage
          message="No Git working tree was found for this path."
          rootName={files.name}
          segments={resolved.segments}
          status={404}
          theme={theme}
          title="Changes"
        />,
        404,
      );
    }
    const scopedDiff = directory
      ? workingTreeDiff
      : {
          files: workingTreeDiff.files.filter(
            (file) => file.change.path === resolved.segments.join("/"),
          ),
        };
    const diff = await highlightWorkingTreeDiff(parseWorkingTreeDiff(scopedDiff), markdown, theme);
    return context.html(
      <DiffPage
        diff={diff}
        directory={directory}
        rootName={files.name}
        segments={resolved.segments}
        theme={theme}
      />,
    );
  };
  app.on(["GET", "HEAD"], "/changes", changesHandler);
  app.on(["GET", "HEAD"], "/changes/*", changesHandler);

  app.on(["GET", "HEAD"], "*", async (context) => {
    const url = new URL(context.req.url);
    const theme = requestTheme(context);
    const resolved = await files.resolvePathname(url.pathname);
    if (resolved === undefined) {
      return context.html(
        <MessagePage
          message="The requested path does not exist inside the mounted directory."
          rootName={files.name}
          status={404}
          theme={theme}
          title="Not found"
        />,
        404,
      );
    }

    if (resolved.stats.isDirectory()) {
      const canonicalUrl = encodeUrlPath(resolved.segments, true);
      if (!url.pathname.endsWith("/")) {
        return context.redirect(`${canonicalUrl}${url.search}`, 308);
      }

      const entries = await files.list(resolved);
      const gitInfoPromise = git?.directoryInfo(resolved.segments, entries);
      const readmeEntry =
        entries.find((entry) => !entry.isDirectory && entry.name.toLowerCase() === "readme.md") ??
        entries.find((entry) => !entry.isDirectory && entry.name.toLowerCase() === "index.md");
      let readme: ReadmePanel | undefined;
      if (readmeEntry !== undefined && readmeEntry.size <= maximumRenderedFileSize) {
        const readmeFile = await files.resolvePathname(readmeEntry.url);
        if (readmeFile !== undefined) {
          const loadedReadme = await readResolvedFile(readmeFile, maximumRenderedFileSize);
          if (loadedReadme !== undefined) {
            const rendered = await markdown.render(
              loadedReadme.contents.toString("utf8"),
              theme.id,
            );
            readme = {html: rendered.html, name: readmeEntry.name, url: readmeEntry.url};
          }
        }
      }

      return context.html(
        <DirectoryPage
          entries={entries}
          git={await gitInfoPromise}
          readme={readme}
          rootName={files.name}
          segments={resolved.segments}
          theme={theme}
        />,
      );
    }

    const name = resolved.segments.at(-1) ?? "file";
    const exactContentType = contentType(name);
    const mediaType = (exactContentType.split(";", 1)[0] ?? exactContentType).toLowerCase();
    const isImage = mediaType.startsWith("image/");
    if (isImage) {
      context.header("Vary", imageResponseVary);
      if (requestPrefersImage(context, mediaType)) {
        return await rawFileResponse(context.req.raw, resolved, {
          contentType: exactContentType,
          vary: imageResponseVary,
        });
      }
    }

    const loaded = await readResolvedFile(resolved, maximumRenderedFileSize);
    if (loaded === undefined) {
      return await rawFileResponse(
        context.req.raw,
        resolved,
        isImage ? {vary: imageResponseVary} : {},
      );
    }
    const {contents, stats} = loaded;
    const markdownFile = isMarkdown(name);

    if (!markdownFile && !isTextContent(name, contents)) {
      return await rawFileResponse(
        context.req.raw,
        resolved,
        isImage ? {vary: imageResponseVary} : {},
      );
    }

    const fileGitPromise = git
      ?.directoryInfo(resolved.segments.slice(0, -1), [{isDirectory: false, name}])
      .then((info): {changesUrl?: string; git?: FileGitInfo} => {
        const entry = info?.entries.get(name);
        const changesUrl =
          entry !== undefined && entry.changes.length > 0
            ? `/changes${encodeUrlPath(resolved.segments)}`
            : undefined;
        if (entry?.commit === undefined) {
          return changesUrl === undefined ? {} : {changesUrl};
        }
        const ref = info?.detached ? info.head : info?.branch;
        const historyUrl =
          info?.repositoryUrl === undefined || ref === undefined
            ? undefined
            : `${info.repositoryUrl}/commits/${encodeURIComponent(ref)}/${entry.repositoryPath
                .split("/")
                .map(encodeURIComponent)
                .join("/")}`;
        const fileGit: FileGitInfo = {
          commit: entry.commit,
          ...(historyUrl === undefined ? {} : {historyUrl}),
          ...(info?.repositoryUrl === undefined ? {} : {repositoryUrl: info.repositoryUrl}),
        };
        return {
          ...(changesUrl === undefined ? {} : {changesUrl}),
          git: fileGit,
        };
      });

    if (markdownFile) {
      const [rendered, fileInfo] = await Promise.all([
        markdown.render(contents.toString("utf8"), theme.id),
        fileGitPromise,
      ]);
      return context.html(
        <MarkdownPage
          changesUrl={fileInfo?.changesUrl}
          git={fileInfo?.git}
          html={rendered.html}
          name={name}
          rootName={files.name}
          segments={resolved.segments}
          theme={theme}
        />,
      );
    }

    const language = languageForFile(name);
    const [highlighted, fileInfo] = await Promise.all([
      markdown.highlight(contents.toString("utf8"), language, theme.id),
      fileGitPromise,
    ]);
    return context.html(
      <SourcePage
        changesUrl={fileInfo?.changesUrl}
        git={fileInfo?.git}
        highlighted={highlighted}
        language={language}
        name={name}
        rootName={files.name}
        segments={resolved.segments}
        size={stats.size}
        theme={theme}
      />,
    );
  });

  app.all("*", (context) => {
    context.header("Allow", "GET, HEAD");
    return context.text("method not allowed\n", 405);
  });

  return app;
}
