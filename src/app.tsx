/** @jsxImportSource hono/jsx */
import {access, readFile, realpath} from "node:fs/promises";
import path from "node:path";
import {Readable} from "node:stream";
import {fileURLToPath} from "node:url";

import {Hono} from "hono";
import {secureHeaders} from "hono/secure-headers";

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
import {MarkdownRenderer} from "./markdown.js";
import {DirectoryPage, MarkdownPage, MessagePage, SourcePage, type ReadmePanel} from "./views.js";

const maximumRenderedFileSize = 5 * 1024 * 1024;
const assetPrefix = "/__md/assets/";

export interface AppOptions {
  assetDirectory?: string;
  assets?: Readonly<Record<string, string | Uint8Array>>;
  customCss?: string;
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

async function rawFileResponse(request: Request, file: ResolvedFile): Promise<Response> {
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
    "Content-Type": rawContentType(name),
    "Last-Modified": stats.mtime.toUTCString(),
  });
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
        title="Internal server error"
      />,
      500,
    );
  });

  app.get("/__md/health", (context) => context.text("ok\n"));

  app.on(["GET", "HEAD"], "/__md/assets/*", async (context) => {
    const relative = context.req.path.slice(assetPrefix.length);
    if (relative === "styles.css") {
      return new Response(context.req.method === "HEAD" ? null : (css as unknown as BodyInit), {
        headers: {
          "Cache-Control": "public, max-age=3600",
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
        "Cache-Control": "public, max-age=3600",
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
          title="Not found"
        />,
        404,
      );
    }
    return await rawFileResponse(context.req.raw, resolved);
  });

  app.on(["GET", "HEAD"], "*", async (context) => {
    const url = new URL(context.req.url);
    const resolved = await files.resolvePathname(url.pathname);
    if (resolved === undefined) {
      return context.html(
        <MessagePage
          message="The requested path does not exist inside the mounted directory."
          rootName={files.name}
          status={404}
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
      const readmeEntry =
        entries.find((entry) => !entry.isDirectory && entry.name.toLowerCase() === "readme.md") ??
        entries.find((entry) => !entry.isDirectory && entry.name.toLowerCase() === "index.md");
      let readme: ReadmePanel | undefined;
      if (readmeEntry !== undefined && readmeEntry.size <= maximumRenderedFileSize) {
        const readmeFile = await files.resolvePathname(readmeEntry.url);
        if (readmeFile !== undefined) {
          const loadedReadme = await readResolvedFile(readmeFile, maximumRenderedFileSize);
          if (loadedReadme !== undefined) {
            const rendered = await markdown.render(loadedReadme.contents.toString("utf8"));
            readme = {html: rendered.html, name: readmeEntry.name, url: readmeEntry.url};
          }
        }
      }

      return context.html(
        <DirectoryPage
          entries={entries}
          readme={readme}
          rootName={files.name}
          segments={resolved.segments}
        />,
      );
    }

    const name = resolved.segments.at(-1) ?? "file";
    const loaded = await readResolvedFile(resolved, maximumRenderedFileSize);
    if (loaded === undefined) return await rawFileResponse(context.req.raw, resolved);
    const {contents, stats} = loaded;

    if (isMarkdown(name)) {
      const rendered = await markdown.render(contents.toString("utf8"));
      return context.html(
        <MarkdownPage
          html={rendered.html}
          name={name}
          rootName={files.name}
          segments={resolved.segments}
        />,
      );
    }

    if (!isTextContent(name, contents)) {
      return await rawFileResponse(context.req.raw, resolved);
    }
    const language = languageForFile(name);
    const highlighted = await markdown.highlight(contents.toString("utf8"), language);
    return context.html(
      <SourcePage
        highlighted={highlighted}
        language={language}
        name={name}
        rootName={files.name}
        segments={resolved.segments}
        size={stats.size}
      />,
    );
  });

  app.all("*", (context) => {
    context.header("Allow", "GET, HEAD");
    return context.text("method not allowed\n", 405);
  });

  return app;
}
