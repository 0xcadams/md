import {afterEach, describe, expect, test} from "bun:test";
import {mkdtemp, mkdir, rm, symlink, writeFile} from "node:fs/promises";
import {tmpdir} from "node:os";
import path from "node:path";

import {createApp} from "./app.js";
import {embeddedAssets} from "./embedded-assets.js";

const temporaryDirectories: string[] = [];

async function fixture(): Promise<string> {
  const root = await mkdtemp(path.join(tmpdir(), "md-app-"));
  temporaryDirectories.push(root);
  await mkdir(path.join(root, "src"));
  await writeFile(path.join(root, "README.md"), "# Demo workspace\n\nWelcome.");
  await writeFile(path.join(root, "src", "example.ts"), "export const answer: number = 42\n");
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
    expect(body).toContain('id="theme-toggle"');
    expect(body).toContain('rel="icon"');
    expect(body).toContain('href="/__md/assets/logo.svg"');
    expect(body).toContain('src="/__md/assets/logo.svg"');
    expect(body.indexOf("Directory contents")).toBeLessThan(body.indexOf("Demo workspace"));
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
    expect(body).toContain('class="shiki shiki-themes');
    expect(body).toContain('href="/raw/src/example.ts"');

    const raw = await app.request("/raw/src/example.ts");
    expect(raw.headers.get("content-type")).toBe("text/plain; charset=utf-8");
    expect(await raw.text()).toBe("export const answer: number = 42\n");
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
