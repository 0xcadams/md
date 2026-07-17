type Theme = "dark" | "light";

const root = document.documentElement;
const themeSelector = document.querySelector<HTMLSelectElement>("#theme-selector");
const diagrams = document.querySelectorAll<HTMLElement>(".mermaid");
const changesDisclosure = document.querySelector<HTMLDetailsElement>(".changes-disclosure");

function effectiveTheme(): Theme {
  return root.dataset.theme === "dark" ? "dark" : "light";
}

themeSelector?.addEventListener("change", () => {
  document.cookie = `md-code-theme=${encodeURIComponent(themeSelector.value)}; Path=/; Max-Age=31536000; SameSite=Lax`;
  window.location.reload();
});

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
