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
import {
  bundledLanguages,
  codeToHtml,
  codeToTokens,
  getTokenStyleObject,
  type BundledLanguage,
  type BundledTheme,
  type ShikiTransformer,
} from "shiki";
import {unified} from "unified";
import {visit} from "unist-util-visit";
import type {VFile} from "vfile";

import {defaultCodeTheme} from "./themes.js";

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

export interface HighlightedToken {
  content: string;
  style: string;
}

export interface HighlightedCode {
  background: string;
  foreground: string;
  lines: readonly (readonly HighlightedToken[])[];
}

const sourceLineTransformer: ShikiTransformer = {
  name: "source-lines",
  pre(element) {
    const style = typeof element.properties.style === "string" ? element.properties.style : "";
    const separator = style === "" || style.endsWith(";") ? "" : ";";
    element.properties.style = `${style}${separator}--line-number-width:${String(this.lines.length).length + 4}ch`;
  },
  line(element, line) {
    element.properties.dataLineNumber = line;
    element.children.unshift({
      type: "element",
      tagName: "a",
      properties: {
        ariaLabel: `Line ${line}`,
        className: ["line-number"],
        dataLineNumber: line,
        href: `#L${line}`,
        id: `L${line}`,
      },
      children: [],
    });
  },
};

function createProcessor(wikiIndex: ReadonlyMap<string, string>, theme: BundledTheme) {
  return unified()
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
      fallbackLanguage: "text",
      langs: [],
      lazy: true,
      theme,
    })
    .use(rehypeStringify);
}

export class MarkdownRenderer {
  private readonly processors = new Map<BundledTheme, ReturnType<typeof createProcessor>>();

  constructor(private readonly wikiIndex: ReadonlyMap<string, string>) {}

  private processor(theme: BundledTheme): ReturnType<typeof createProcessor> {
    let processor = this.processors.get(theme);
    if (processor === undefined) {
      processor = createProcessor(this.wikiIndex, theme);
      this.processors.set(theme, processor);
    }
    return processor;
  }

  async render(
    source: string,
    theme: BundledTheme = defaultCodeTheme.id,
  ): Promise<RenderedMarkdown> {
    const result = await this.processor(theme).process(source);
    return {hasMermaid: result.data.hasMermaid ?? false, html: String(result)};
  }

  async highlight(
    source: string,
    language: string,
    theme: BundledTheme = defaultCodeTheme.id,
  ): Promise<string> {
    try {
      return await codeToHtml(source, {
        lang: language as BundledLanguage,
        theme,
        transformers: [sourceLineTransformer],
      });
    } catch {
      return codeToHtml(source, {
        lang: "text",
        theme,
        transformers: [sourceLineTransformer],
      });
    }
  }

  async tokenize(
    source: string,
    language: string,
    theme: BundledTheme = defaultCodeTheme.id,
  ): Promise<HighlightedCode> {
    const normalizedLanguage = language.trim().toLowerCase();
    const lang = Object.hasOwn(bundledLanguages, normalizedLanguage)
      ? (normalizedLanguage as BundledLanguage)
      : "text";
    const result = await codeToTokens(source, {lang, theme});
    return {
      background: result.bg ?? "transparent",
      foreground: result.fg ?? "inherit",
      lines: result.tokens.map((line) =>
        line.map((token) => {
          const styles = Object.entries(token.htmlStyle ?? getTokenStyleObject(token))
            .filter(([name]) => name !== "background-color")
            .map(([name, value]) => `${name}:${value}`)
            .join(";");
          return {content: token.content, style: styles};
        }),
      ),
    };
  }
}
