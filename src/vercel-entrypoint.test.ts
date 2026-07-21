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
    expect(body).toContain('title="Current branch"');
    expect(body).toContain("<strong>2</strong> Branches");
    expect(body).toContain("<strong>1</strong> Tag");
    expect(body).toContain("1 Commit");
    expect(body).toContain("md demo");
    expect(body).toContain("feat: add demo workspace");
    expect(body).not.toContain('class="button repository-link"');
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
    expect(body).toContain("feat: add demo workspace");
    expect(body).toContain("1 change");
    expect(body).toContain('href="/guides/getting-started.md"');
    expect(body).toContain('aria-label="Staged: modified"');
    expect(body).not.toContain("notes.md");
    expect(fileResponse.status).toBe(200);
    expect(fileBody).not.toContain(">History</a>");
  });

  test("renders generated source-level diffs", async () => {
    const response = await app.request("/changes/example.ts");
    const body = await response.text();
    const text = body.replace(/<[^>]+>/g, "");

    expect(response.status).toBe(200);
    expect(body).toContain("Showing 1 changed file");
    expect(body).toContain('aria-label="Diff for example.ts"');
    expect(text).toContain("recipient: &quot;world&quot;");
    expect(text).toContain("recipient: &quot;md&quot;");
    expect(body).not.toContain("Previous working tree content");
    expect(body).not.toContain("Updated working tree content");
  });
});
