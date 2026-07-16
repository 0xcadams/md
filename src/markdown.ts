import rehypeShiki from "@shikijs/rehype";
import type {Element, Root as HastRoot} from "hast";
import type {
  Blockquote,
  Link,
  Paragraph,
  Parent,
  PhrasingContent,
  Root as MdastRoot,
  Text,
} from "mdast";
import rehypeAutolinkHeadings from "rehype-autolink-headings";
import rehypeRaw from "rehype-raw";
import rehypeSanitize, {defaultSchema} from "rehype-sanitize";
import rehypeSlug from "rehype-slug";
import rehypeStringify from "rehype-stringify";
import remarkGfm from "remark-gfm";
import remarkParse from "remark-parse";
import remarkRehype from "remark-rehype";
import {codeToHtml, type BundledLanguage} from "shiki";
import {unified} from "unified";
import {visit} from "unist-util-visit";
import type {VFile} from "vfile";

const alertKinds = new Set(["NOTE", "TIP", "IMPORTANT", "WARNING", "CAUTION"]);

declare module "vfile" {
  interface DataMap {
    hasMermaid: boolean;
  }
}

function remarkAlerts() {
  return (tree: MdastRoot): void => {
    visit(tree, "blockquote", (node: Blockquote) => {
      const firstParagraph = node.children[0];
      if (firstParagraph?.type !== "paragraph") return;
      const firstText = firstParagraph.children[0];
      if (firstText?.type !== "text") return;

      const match = /^\[!([A-Z]+)\](?:\r?\n|[ \t]*)/.exec(firstText.value);
      const kind = match?.[1];
      if (match === null || kind === undefined || !alertKinds.has(kind)) return;

      firstText.value = firstText.value.slice(match[0].length);
      if (firstText.value === "") firstParagraph.children.shift();
      node.data = {
        ...node.data,
        hName: "div",
        hProperties: {className: ["markdown-alert", `markdown-alert-${kind.toLowerCase()}`]},
      };
      const title: Paragraph = {
        type: "paragraph",
        data: {
          hName: "p",
          hProperties: {className: ["markdown-alert-title"]},
        },
        children: [{type: "text", value: kind[0] + kind.slice(1).toLowerCase()}],
      };
      node.children.unshift(title);
    });
  };
}

function headingFragment(value: string): string {
  return encodeURIComponent(
    value
      .normalize()
      .trim()
      .toLowerCase()
      .replace(/[^\p{L}\p{N}\s_-]/gu, "")
      .replace(/\s+/g, "-"),
  );
}

function remarkWikiLinks(index: ReadonlyMap<string, string>) {
  return () =>
    (tree: MdastRoot): void => {
      visit(tree, "text", (node: Text, childIndex, parent) => {
        if (
          childIndex === undefined ||
          parent === undefined ||
          parent.type === "link" ||
          !("children" in parent)
        ) {
          return;
        }

        const expression = /\[\[([^\]#|]+)(?:#([^\]|]+))?(?:\|([^\]]+))?\]\]/g;
        const children: PhrasingContent[] = [];
        let cursor = 0;
        let match: RegExpExecArray | null;

        while ((match = expression.exec(node.value)) !== null) {
          const target = match[1]?.trim();
          if (target === undefined) continue;
          const destination =
            index.get(target.toLowerCase()) ?? index.get(`${target.toLowerCase()}.md`);
          if (destination === undefined) continue;
          if (match.index > cursor) {
            children.push({type: "text", value: node.value.slice(cursor, match.index)});
          }
          const fragment = match[2]?.trim();
          const alias = match[3]?.trim();
          const link: Link = {
            type: "link",
            url:
              fragment === undefined ? destination : `${destination}#${headingFragment(fragment)}`,
            children: [{type: "text", value: alias ?? target}],
          };
          children.push(link);
          cursor = match.index + match[0].length;
        }

        if (children.length === 0) return;
        if (cursor < node.value.length)
          children.push({type: "text", value: node.value.slice(cursor)});
        (parent as Parent).children.splice(childIndex, 1, ...children);
        return childIndex + children.length;
      });
    };
}

function rehypeMermaid() {
  return (tree: HastRoot, file: VFile): void => {
    let hasMermaid = false;
    visit(tree, "element", (node: Element) => {
      if (node.tagName !== "pre") return;
      const code = node.children[0];
      if (code?.type !== "element" || code.tagName !== "code") return;
      const classes = code.properties.className;
      if (!Array.isArray(classes) || !classes.includes("language-mermaid")) return;
      node.tagName = "div";
      node.properties = {className: ["mermaid"]};
      node.children = code.children;
      hasMermaid = true;
    });
    file.data.hasMermaid = hasMermaid;
  };
}

const sanitizeSchema = {
  ...defaultSchema,
  attributes: {
    ...defaultSchema.attributes,
    "*": [...(defaultSchema.attributes?.["*"] ?? []), "className"],
  },
};

export interface RenderedMarkdown {
  hasMermaid: boolean;
  html: string;
}

export class MarkdownRenderer {
  private readonly processor;

  constructor(wikiIndex: ReadonlyMap<string, string>) {
    this.processor = unified()
      .use(remarkParse)
      .use(remarkGfm)
      .use(remarkAlerts)
      .use(remarkWikiLinks(wikiIndex))
      .use(remarkRehype, {allowDangerousHtml: true})
      .use(rehypeRaw)
      .use(rehypeSanitize, sanitizeSchema)
      .use(rehypeSlug)
      .use(rehypeAutolinkHeadings, {
        behavior: "prepend",
        content: {type: "text", value: "#"},
        properties: {ariaLabel: "Permalink", className: ["heading-anchor"]},
      })
      .use(rehypeMermaid)
      .use(rehypeShiki, {
        defaultColor: false,
        fallbackLanguage: "text",
        themes: {dark: "github-dark", light: "github-light"},
      })
      .use(rehypeStringify);
  }

  async render(source: string): Promise<RenderedMarkdown> {
    const result = await this.processor.process(source);
    return {hasMermaid: result.data.hasMermaid ?? false, html: String(result)};
  }

  async highlight(source: string, language: string): Promise<string> {
    try {
      return await codeToHtml(source, {
        defaultColor: false,
        lang: language as BundledLanguage,
        themes: {dark: "github-dark", light: "github-light"},
      });
    } catch {
      return codeToHtml(source, {
        defaultColor: false,
        lang: "text",
        themes: {dark: "github-dark", light: "github-light"},
      });
    }
  }
}
