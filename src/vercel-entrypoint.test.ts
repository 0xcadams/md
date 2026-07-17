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
    expect(body).toContain('href="https://github.com/0xcadams/md/tree/main"');
    expect(body).toContain('href="https://github.com/0xcadams/md/branches"');
    expect(body).toContain('href="https://github.com/0xcadams/md/tags"');
    expect(body).toContain("<strong>4</strong> Tags");
    expect(body).toContain('href="https://github.com/0xcadams/md/commits/main"');
    expect(body).toContain("33 Commits");
    expect(body).toContain("Chase Adams");
    expect(body).toContain("feat: refine default theme and layout");
    expect(body).toContain("9547d86");
    expect(body).toContain(
      'href="https://github.com/0xcadams/md/commit/9547d863c3607498f6ee0ee9f8ad71e183f19636"',
    );
    expect(body).not.toContain('class="entry-commit">Last commit');
    expect(body).toContain("5 changes");
    expect(body).toContain('aria-label="Staged: modified"');
    expect(body).toContain('aria-label="Unstaged: modified"');
    expect(body).toContain('aria-label="Untracked"');
    expect(body).toContain("draft.md");
    expect(body).not.toContain('href="/draft.md"');
  });

  test("scopes demo changes and history to nested directories", async () => {
    const [response, fileResponse] = await Promise.all([
      app.request("/guides/"),
      app.request("/guides/getting-started.md"),
    ]);
    const [body, fileBody] = await Promise.all([response.text(), fileResponse.text()]);

    expect(response.status).toBe(200);
    expect(body).toContain("feat: add md file browser");
    expect(body).toContain(
      'href="https://github.com/0xcadams/md/commit/a970f7daa5ed5d9e0f18fbcedf89389a0c14f480"',
    );
    expect(body).toContain("1 change");
    expect(body).toContain('href="/guides/getting-started.md"');
    expect(body).toContain('aria-label="Staged: modified"');
    expect(body).not.toContain("notes.md");
    expect(fileResponse.status).toBe(200);
    expect(fileBody).toContain(
      'href="https://github.com/0xcadams/md/commits/main/demo-files/guides/getting-started.md"',
    );
    expect(fileBody).toContain(">History</a>");
  });
});
