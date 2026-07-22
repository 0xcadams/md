import {formatLineHash, parseLineHash} from "./line-selection.js";

type Theme = "dark" | "light";

const root = document.documentElement;
const themeSelector = document.querySelector<HTMLSelectElement>("#theme-selector");
const diagrams = document.querySelectorAll<HTMLElement>(".mermaid");
const changesDisclosure = document.querySelector<HTMLDetailsElement>(".changes-disclosure");
const copyUrlButtons = document.querySelectorAll<HTMLButtonElement>("[data-copy-url]");
const sourceCode = document.querySelector<HTMLElement>(".source-code");
const sourceLines = [
  ...(sourceCode?.querySelectorAll<HTMLElement>(".line[data-line-number]") ?? []),
];

let lineSelectionAnchor: number | undefined;

function effectiveTheme(): Theme {
  return root.dataset.theme === "dark" ? "dark" : "light";
}

themeSelector?.addEventListener("change", () => {
  document.cookie = `peruse-code-theme=${encodeURIComponent(themeSelector.value)}; Path=/; Max-Age=31536000; SameSite=Lax`;
  window.location.reload();
});

async function copyUrl(button: HTMLButtonElement): Promise<void> {
  try {
    await navigator.clipboard.writeText(window.location.href);
  } catch {
    return;
  }
  button.dataset.copied = "true";
  button.ariaLabel = "Copied URL";
  button.title = "Copied";
  window.setTimeout(() => {
    delete button.dataset.copied;
    button.ariaLabel = "Copy URL";
    button.title = "Copy URL";
  }, 1_500);
}

for (const button of copyUrlButtons) {
  button.addEventListener("click", () => void copyUrl(button));
}

function applyLineSelection(scroll: boolean, anchor?: number): void {
  const range = parseLineHash(window.location.hash);
  let firstSelected: HTMLElement | undefined;

  for (const line of sourceLines) {
    const lineNumber = Number(line.dataset.lineNumber);
    const selected = range !== undefined && lineNumber >= range.start && lineNumber <= range.end;
    line.classList.toggle("line-selected", selected);
    if (selected && firstSelected === undefined) firstSelected = line;
  }

  lineSelectionAnchor = firstSelected === undefined ? undefined : (anchor ?? range?.start);
  if (scroll) firstSelected?.scrollIntoView({block: "center"});
}

sourceCode?.addEventListener("click", (event) => {
  if (
    !(event.target instanceof Element) ||
    event.button !== 0 ||
    event.metaKey ||
    event.ctrlKey ||
    event.altKey
  ) {
    return;
  }

  const link = event.target.closest<HTMLAnchorElement>(".line-number");
  if (link === null || !sourceCode.contains(link)) return;

  const line = Number(link.dataset.lineNumber);
  if (!Number.isSafeInteger(line)) return;

  event.preventDefault();
  const anchor = event.shiftKey && lineSelectionAnchor !== undefined ? lineSelectionAnchor : line;
  const hash = formatLineHash(anchor, line);
  if (window.location.hash !== hash) history.pushState(null, "", hash);
  applyLineSelection(false, anchor);
});

if (sourceCode !== null) {
  applyLineSelection(true);
  window.addEventListener("hashchange", () => applyLineSelection(true));
}

document.addEventListener("click", (event) => {
  if (
    changesDisclosure?.open &&
    event.target instanceof Node &&
    !changesDisclosure.contains(event.target)
  ) {
    changesDisclosure.open = false;
  }
});

document.addEventListener("keydown", (event) => {
  if (event.key === "Escape" && changesDisclosure?.open) {
    changesDisclosure.open = false;
    changesDisclosure.querySelector("summary")?.focus();
  }
});

if (diagrams.length > 0) {
  const mermaidModule = new URL("/__peruse/assets/mermaid.js", window.location.origin).href;
  void import(mermaidModule).then(async (module: typeof import("./mermaid-client.js")) => {
    await module.renderMermaid(diagrams, effectiveTheme());
  });
}
