import {afterEach, describe, expect, test} from "bun:test";
import {mkdtemp, mkdir, rm, symlink, writeFile} from "node:fs/promises";
import {tmpdir} from "node:os";
import path from "node:path";

import {createApp} from "./app.js";
import {embeddedAssets} from "./embedded-assets.js";

const temporaryDirectories: string[] = [];
const fixtureSvg = '<svg xmlns="http://www.w3.org/2000/svg"><title>CloudZero</title></svg>\n';
const nullDevice = process.platform === "win32" ? "NUL" : "/dev/null";

async function git(root: string, arguments_: readonly string[]): Promise<void> {
  const process = Bun.spawn(["git", ...arguments_], {
    cwd: root,
    env: {
      ...Bun.env,
      GIT_CONFIG_GLOBAL: nullDevice,
      GIT_CONFIG_NOSYSTEM: "1",
      GIT_TERMINAL_PROMPT: "0",
    },
    stderr: "pipe",
    stdout: "pipe",
  });
  const [exitCode, stderr] = await Promise.all([
    process.exited,
    new Response(process.stderr).text(),
    new Response(process.stdout).arrayBuffer(),
  ]);
  if (exitCode !== 0) throw new Error(stderr.trim() || `git exited with ${exitCode}`);
}

async function fixture(): Promise<string> {
  const root = await mkdtemp(path.join(tmpdir(), "md-app-"));
  temporaryDirectories.push(root);
  await mkdir(path.join(root, "src"));
  await mkdir(path.join(root, "doc", "assets"), {recursive: true});
  await writeFile(
    path.join(root, "README.md"),
    '# Demo workspace\n\nWelcome.\n\n<img src="./doc/assets/cloudzero.svg" alt="the big picture">',
  );
  await writeFile(path.join(root, "src", "example.ts"), "export const answer: number = 42\n");
  await writeFile(path.join(root, "doc", "assets", "cloudzero.svg"), fixtureSvg);
  await writeFile(path.join(root, "data.bin"), Uint8Array.from([0, 1, 2, 3]));
  await writeFile(path.join(root, "page.html"), '<script src="/raw/payload.js"></script>');
  await writeFile(path.join(root, "payload.js"), 'alert("unsafe")');
  return root;
}

afterEach(async () => {
  await Promise.all(
    temporaryDirectories
      .splice(0)
      .map((directory) => rm(directory, {force: true, recursive: true})),
  );
});

describe("application routes", () => {
  test("renders the file listing before the root README", async () => {
    const app = await createApp({root: await fixture()});
    const response = await app.request("/");
    const body = await response.text();

    expect(response.status).toBe(200);
    expect(body.startsWith("<!doctype html>")).toBe(true);
    expect(body).toContain("Directory contents");
    expect(body).toContain('href="/src/"');
    expect(body).toContain('href="/README.md"');
    expect(body).toContain("Demo workspace");
    expect(body).toContain('id="theme-selector"');
    expect(body).toContain('<optgroup label="Light">');
    expect(body).toContain('<optgroup label="Dark">');
    expect(body).toContain('value="github-light-default"');
    expect(body).toContain('value="github-dark-default"');
    expect(body).toContain('value="vitesse-dark" selected');
    expect(body).toContain('rel="icon"');
    expect(body).toContain('href="/__md/assets/logo.svg"');
    expect(body).toContain('src="/__md/assets/logo.svg"');
    expect(body).toContain('<img src="./doc/assets/cloudzero.svg" alt="the big picture">');
    expect(body).toContain('<th class="entry-size">Size</th>');
    expect(body).not.toContain('class="repo-toolbar"');
    expect(body.indexOf("Directory contents")).toBeLessThan(body.indexOf("Demo workspace"));
  });

  test("discovers a repository below a non-repository server root", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "md-workspace-"));
    temporaryDirectories.push(root);
    const project = path.join(root, "project");
    await mkdir(project);
    await git(project, ["init", "-b", "main"]);
    await writeFile(path.join(project, "README.md"), "# Nested repository\n");
    await git(project, ["add", "."]);
    await git(project, [
      "-c",
      "user.name=md test",
      "-c",
      "user.email=md@example.com",
      "commit",
      "-m",
      "feat: add nested repository",
    ]);

    const app = await createApp({root});
    const workspaceBody = await (await app.request("/")).text();
    const projectBody = await (await app.request("/project/")).text();

    expect(workspaceBody).not.toContain('class="repo-toolbar"');
    expect(projectBody).toContain('class="repo-toolbar"');
    expect(projectBody).toContain("feat: add nested repository");
    expect(projectBody).toContain('>main</span><span class="item-count">');
  });

  test("renders Git history and staged and unstaged working tree changes", async () => {
    const root = await fixture();
    await git(root, ["init", "-b", "main"]);
    await git(root, ["add", "."]);
    await git(root, [
      "-c",
      "user.name=md test",
      "-c",
      "user.email=md@example.com",
      "commit",
      "-m",
      "initial fixture",
    ]);
    await writeFile(path.join(root, "src", "example.ts"), "export const answer = 41;\n");
    await git(root, ["add", "src/example.ts"]);
    await writeFile(path.join(root, "src", "example.ts"), "export const answer = 42;\n");
    await writeFile(path.join(root, "draft.md"), "# Draft\n");
    await rm(path.join(root, "payload.js"));

    const app = await createApp({root});
    const body = await (await app.request("/")).text();

    expect(body).toContain('class="repo-toolbar"');
    expect(body).toContain('>main</span><span class="item-count">');
    expect(body).toContain("initial fixture");
    expect(body).toContain("Last commit");
    expect(body).toContain("3 changes");
    expect(body).toContain('aria-label="Staged: modified"');
    expect(body).toContain('aria-label="Unstaged: modified"');
    expect(body).toContain('aria-label="Untracked"');
    expect(body).toContain("payload.js");
    expect(body).toContain("unstaged deleted");
    expect(body).not.toContain('href="/payload.js"');
    expect(body).toContain('href="/draft.md"');
  });

  test("serves the embedded logo asset", async () => {
    const app = await createApp({assets: embeddedAssets, root: await fixture()});
    const response = await app.request("/__md/assets/logo.svg");
    const body = await response.text();

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("image/svg+xml");
    expect(body).toContain('<title id="title">md</title>');
    expect(body).not.toContain("<text");
  });

  test("renders source files with Shiki and offers raw access", async () => {
    const app = await createApp({root: await fixture()});
    const page = await app.request("/src/example.ts");
    const body = await page.text();
    expect(body).toContain('class="shiki vitesse-dark"');
    expect(body).toContain('href="/raw/src/example.ts"');

    const raw = await app.request("/raw/src/example.ts");
    expect(raw.headers.get("content-type")).toBe("text/plain; charset=utf-8");
    expect(await raw.text()).toBe("export const answer: number = 42\n");
  });

  test("serves embedded SVG images without changing document navigation", async () => {
    const app = await createApp({root: await fixture()});
    const imageHeaders = {
      Accept: "image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8",
      "Sec-Fetch-Dest": "image",
    };
    const image = await app.request("/doc/assets/cloudzero.svg", {headers: imageHeaders});

    expect(image.status).toBe(200);
    expect(image.headers.get("content-type")).toBe("image/svg+xml");
    expect(image.headers.get("vary")).toBe("Accept, Sec-Fetch-Dest");
    expect(image.headers.get("x-content-type-options")).toBe("nosniff");
    expect(await image.text()).toBe(fixtureSvg);

    const destinationImage = await app.request("/doc/assets/cloudzero.svg", {
      headers: {
        Accept: "text/html,image/svg+xml;q=0.1",
        "Sec-Fetch-Dest": "image",
      },
    });
    expect(destinationImage.headers.get("content-type")).toBe("image/svg+xml");

    const fallback = await app.request("/doc/assets/cloudzero.svg", {
      headers: {Accept: imageHeaders.Accept},
    });
    expect(fallback.headers.get("content-type")).toBe("image/svg+xml");
    expect(await fallback.text()).toBe(fixtureSvg);

    const navigation = await app.request("/doc/assets/cloudzero.svg", {
      headers: {
        Accept: imageHeaders.Accept,
        "Sec-Fetch-Dest": "document",
      },
    });
    const navigationBody = await navigation.text();
    expect(navigation.headers.get("content-type")?.startsWith("text/html")).toBe(true);
    expect(navigation.headers.get("vary")).toBe("Accept, Sec-Fetch-Dest");
    expect(navigationBody.startsWith("<!doctype html>")).toBe(true);
    expect(navigationBody).toContain('href="/raw/doc/assets/cloudzero.svg"');

    const fallbackNavigation = await app.request("/doc/assets/cloudzero.svg", {
      headers: {
        Accept:
          "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
      },
    });
    expect(fallbackNavigation.headers.get("content-type")?.startsWith("text/html")).toBe(true);

    const tied = await app.request("/doc/assets/cloudzero.svg", {
      headers: {Accept: "text/html,image/svg+xml"},
    });
    expect(tied.headers.get("content-type")?.startsWith("text/html")).toBe(true);

    const parameterized = await app.request("/doc/assets/cloudzero.svg", {
      headers: {Accept: "image/svg+xml;profile=foo,text/html;q=0.5"},
    });
    expect(parameterized.headers.get("content-type")?.startsWith("text/html")).toBe(true);

    const parameterizedHtml = await app.request("/doc/assets/cloudzero.svg", {
      headers: {Accept: "text/html;charset=UTF-8,image/svg+xml;q=0.5"},
    });
    expect(parameterizedHtml.headers.get("content-type")?.startsWith("text/html")).toBe(true);

    const head = await app.request("/doc/assets/cloudzero.svg", {
      headers: imageHeaders,
      method: "HEAD",
    });
    expect(head.headers.get("content-type")).toBe("image/svg+xml");
    expect(head.headers.get("content-length")).toBe(String(Buffer.byteLength(fixtureSvg)));
    expect(await head.text()).toBe("");

    const range = await app.request("/doc/assets/cloudzero.svg", {
      headers: {...imageHeaders, Range: "bytes=0-3"},
    });
    expect(range.status).toBe(206);
    expect(range.headers.get("content-type")).toBe("image/svg+xml");
    expect(await range.text()).toBe("<svg");

    const raw = await app.request("/raw/doc/assets/cloudzero.svg", {headers: imageHeaders});
    expect(raw.headers.get("content-type")).toBe("text/plain; charset=utf-8");
    expect(raw.headers.get("content-security-policy")).toBe("default-src 'none'; sandbox");
    expect(await raw.text()).toBe(fixtureSvg);
  });

  test("renders the selected Shiki theme from a validated cookie", async () => {
    const app = await createApp({root: await fixture()});
    const selected = await app.request("/src/example.ts", {
      headers: {Cookie: "md-code-theme=catppuccin-mocha"},
    });
    const selectedBody = await selected.text();

    expect(selectedBody).toContain('data-code-theme="catppuccin-mocha"');
    expect(selectedBody).toContain('data-theme="dark"');
    expect(selectedBody).toContain('class="shiki catppuccin-mocha"');
    expect(selectedBody).toContain('value="catppuccin-mocha" selected');

    const fallback = await app.request("/", {
      headers: {Cookie: "md-code-theme=not-a-theme"},
    });
    expect(await fallback.text()).toContain('data-code-theme="vitesse-dark"');
  });

  test("does not customize Shiki token colors", async () => {
    const app = await createApp({assets: embeddedAssets, root: await fixture()});
    const response = await app.request("/__md/assets/styles.css");
    const body = await response.text();

    expect(response.status).toBe(200);
    expect(body).not.toContain("saturate(");
    expect(body).not.toContain("--shiki-");
  });

  test("serves active raw files as sandboxed plain text", async () => {
    const app = await createApp({root: await fixture()});
    const response = await app.request("/raw/page.html");

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("text/plain; charset=utf-8");
    expect(response.headers.get("content-security-policy")).toBe("default-src 'none'; sandbox");
    expect(response.headers.get("x-content-type-options")).toBe("nosniff");
    expect(response.headers.get("content-disposition")).toContain("page.html");
    expect(await response.text()).toContain("<script");
  });

  test("streams binary files and redirects directory URLs", async () => {
    const app = await createApp({root: await fixture()});
    const binary = await app.request("/data.bin");
    expect(binary.headers.get("content-type")).toBe("application/octet-stream");
    expect(new Uint8Array(await binary.arrayBuffer())).toEqual(Uint8Array.from([0, 1, 2, 3]));

    const range = await app.request("/raw/data.bin", {headers: {Range: "bytes=1-2"}});
    expect(range.status).toBe(206);
    expect(range.headers.get("content-range")).toBe("bytes 1-2/4");
    expect(new Uint8Array(await range.arrayBuffer())).toEqual(Uint8Array.from([1, 2]));

    const suffix = await app.request("/raw/data.bin", {headers: {Range: "bytes=-2"}});
    expect(suffix.status).toBe(206);
    expect(new Uint8Array(await suffix.arrayBuffer())).toEqual(Uint8Array.from([2, 3]));

    const unsupported = await app.request("/raw/data.bin", {headers: {Range: "items=1-2"}});
    expect(unsupported.status).toBe(200);
    expect(new Uint8Array(await unsupported.arrayBuffer())).toEqual(Uint8Array.from([0, 1, 2, 3]));

    const unsatisfiable = await app.request("/raw/data.bin", {headers: {Range: "bytes=9-10"}});
    expect(unsatisfiable.status).toBe(416);
    expect(unsatisfiable.headers.get("content-range")).toBe("bytes */4");

    const redirect = await app.request("/src", {redirect: "manual"});
    expect(redirect.status).toBe(308);
    expect(redirect.headers.get("location")).toBe("/src/");
  });

  test("provides health, method, and security responses", async () => {
    const app = await createApp({root: await fixture()});
    const health = await app.request("/__md/health");
    expect(await health.text()).toBe("ok\n");
    expect(health.headers.get("x-frame-options")).toBe("DENY");

    const disallowed = await app.request("/", {method: "POST"});
    expect(disallowed.status).toBe(405);
    expect(disallowed.headers.get("allow")).toBe("GET, HEAD");

    expect((await app.request("/__md/assets/toString")).status).toBe(404);
  });

  test("does not expose symlinks outside the root", async () => {
    const root = await fixture();
    const outside = await mkdtemp(path.join(tmpdir(), "md-secret-"));
    temporaryDirectories.push(outside);
    await writeFile(path.join(outside, "secret.txt"), "secret");
    await symlink(path.join(outside, "secret.txt"), path.join(root, "secret.txt"));
    const app = await createApp({root});

    expect((await app.request("/secret.txt")).status).toBe(404);
    expect(await (await app.request("/")).text()).not.toContain("secret.txt");
  });
});
