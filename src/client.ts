type Theme = "dark" | "light";

const root = document.documentElement;
const themeSelector = document.querySelector<HTMLSelectElement>("#theme-selector");
const diagrams = document.querySelectorAll<HTMLElement>(".mermaid");

function effectiveTheme(): Theme {
  return root.dataset.theme === "dark" ? "dark" : "light";
}

themeSelector?.addEventListener("change", () => {
  document.cookie = `md-code-theme=${encodeURIComponent(themeSelector.value)}; Path=/; Max-Age=31536000; SameSite=Lax`;
  window.location.reload();
});

if (diagrams.length > 0) {
  const mermaidModule = new URL("/__md/assets/mermaid.js", window.location.origin).href;
  void import(mermaidModule).then(async (module: typeof import("./mermaid-client.js")) => {
    await module.renderMermaid(diagrams, effectiveTheme());
  });
}
