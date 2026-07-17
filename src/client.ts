type Theme = "dark" | "light";

const root = document.documentElement;
const themeSelector = document.querySelector<HTMLSelectElement>("#theme-selector");
const diagrams = document.querySelectorAll<HTMLElement>(".mermaid");
const changesDisclosure = document.querySelector<HTMLDetailsElement>(".changes-disclosure");
const copyPathButtons = document.querySelectorAll<HTMLButtonElement>("[data-copy-path]");

function effectiveTheme(): Theme {
  return root.dataset.theme === "dark" ? "dark" : "light";
}

themeSelector?.addEventListener("change", () => {
  document.cookie = `md-code-theme=${encodeURIComponent(themeSelector.value)}; Path=/; Max-Age=31536000; SameSite=Lax`;
  window.location.reload();
});

async function copyPath(button: HTMLButtonElement): Promise<void> {
  const filePath = button.dataset.copyPath;
  if (filePath === undefined) return;
  try {
    await navigator.clipboard.writeText(filePath);
  } catch {
    return;
  }
  button.dataset.copied = "true";
  button.ariaLabel = "Copied path";
  button.title = "Copied";
  window.setTimeout(() => {
    delete button.dataset.copied;
    button.ariaLabel = "Copy path";
    button.title = "Copy path";
  }, 1_500);
}

for (const button of copyPathButtons) {
  button.addEventListener("click", () => void copyPath(button));
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
  const mermaidModule = new URL("/__md/assets/mermaid.js", window.location.origin).href;
  void import(mermaidModule).then(async (module: typeof import("./mermaid-client.js")) => {
    await module.renderMermaid(diagrams, effectiveTheme());
  });
}
