import {describe, expect, test} from "bun:test";

import app from "./vercel.js";

describe("Vercel entrypoint", () => {
  test("serves the bundled demo workspace", async () => {
    const response = await app.request("/");
    const body = await response.text();

    expect(response.status).toBe(200);
    expect(body).toContain("Directory contents");
    expect(body).toContain("Welcome to the <strong>md</strong> demo!");
    expect(body).toContain('href="/example.ts"');
    expect(body).toContain('class="repo-toolbar"');
    expect(body).toContain('>main</span><span class="item-count">');
    expect(body).toContain("Add Git-aware directory listings");
    expect(body).toContain("Last commit");
    expect(body).toContain("5 changes");
    expect(body).toContain('aria-label="Staged: modified"');
    expect(body).toContain('aria-label="Unstaged: modified"');
    expect(body).toContain('aria-label="Untracked"');
    expect(body).toContain("draft.md");
    expect(body).not.toContain('href="/draft.md"');
  });

  test("scopes demo changes and history to nested directories", async () => {
    const response = await app.request("/guides/");
    const body = await response.text();

    expect(response.status).toBe(200);
    expect(body).toContain("Add the getting started guide");
    expect(body).toContain("1 change");
    expect(body).toContain('href="/guides/getting-started.md"');
    expect(body).toContain('aria-label="Staged: modified"');
    expect(body).not.toContain("notes.md");
  });
});
