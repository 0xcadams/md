import {beforeAll, describe, expect, test} from "bun:test";

import {MarkdownRenderer} from "./markdown.js";

let renderer: MarkdownRenderer;

beforeAll(() => {
  renderer = new MarkdownRenderer(new Map([["notes", "/notes.md"]]));
});

describe("MarkdownRenderer", () => {
  test("renders GFM and Shiki highlighting", async () => {
    const rendered = await renderer.render(`# Example

| Name | Value |
| --- | --- |
| one | two |

- [x] complete

~~removed~~

\`\`\`ts
const answer: number = 42
\`\`\``);

    expect(rendered.html).toContain("<table>");
    expect(rendered.html).toContain('type="checkbox"');
    expect(rendered.html).toContain("<del>removed</del>");
    expect(rendered.html).toContain('class="shiki vitesse-dark"');
    expect(rendered.html).not.toContain('class="line-number"');
    expect(rendered.html).not.toContain("--shiki-");
  });

  test("sanitizes embedded HTML", async () => {
    const rendered = await renderer.render(
      '<details open><summary>Safe</summary>Body</details><img src="assets/logo.svg" alt="Logo" onerror="alert(1)"><script>alert("x")</script>',
    );
    expect(rendered.html).toContain("<details open>");
    expect(rendered.html).toContain('<img src="assets/logo.svg" alt="Logo">');
    expect(rendered.html).not.toContain("onerror");
    expect(rendered.html).not.toContain("<script");
    expect(rendered.html).not.toContain("alert(");
  });

  test("preserves alerts, Mermaid, and wiki links", async () => {
    const rendered = await renderer.render(`> [!WARNING]
> Be careful.

See [[notes#More Info|the notes]].

\`\`\`mermaid
graph TD
  A --> B
\`\`\``);

    expect(rendered.html).toContain("markdown-alert-warning");
    expect(rendered.html).toContain("markdown-alert-title");
    expect(rendered.html).toContain('href="/notes.md#more-info"');
    expect(rendered.html).toContain('class="mermaid"');
    expect(rendered.hasMermaid).toBe(true);
  });

  test("highlights source files and falls back for unknown languages", async () => {
    const highlighted = await renderer.highlight("const value = 1\nexport {value}", "typescript");
    expect(highlighted).toContain('class="shiki vitesse-dark"');
    expect(highlighted).toContain('class="line-number"');
    expect(highlighted).toContain('data-line-number="1"');
    expect(highlighted).toContain('href="#L1"');
    expect(highlighted).toContain('id="L2"');
    expect(
      await renderer.highlight("const value = 1", "typescript", "github-light-default"),
    ).toContain('class="shiki github-light-default"');
    expect(await renderer.highlight("plain", "not-a-language")).toContain("plain");
  });
});
