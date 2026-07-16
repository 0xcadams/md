type Theme = "dark" | "light";

const root = document.documentElement;
const themeButton = document.querySelector<HTMLButtonElement>("#theme-toggle");
const systemTheme = window.matchMedia("(prefers-color-scheme: dark)");

function effectiveTheme(): Theme {
  if (root.dataset.theme === "dark" || root.dataset.theme === "light") return root.dataset.theme;
  return systemTheme.matches ? "dark" : "light";
}

function updateThemeButton(theme: Theme): void {
  if (themeButton) {
    const next = theme === "dark" ? "light" : "dark";
    themeButton.setAttribute("aria-label", `Switch to ${next} theme`);
    themeButton.title = `Switch to ${next} theme`;
  }
}

function applyTheme(theme: Theme): void {
  root.dataset.theme = theme;
  root.style.colorScheme = theme;
  updateThemeButton(theme);
}

try {
  const savedTheme = localStorage.getItem("md-theme");
  if (savedTheme === "dark" || savedTheme === "light") applyTheme(savedTheme);
} catch {
  // Storage can be unavailable in privacy-restricted browser contexts.
}
if (root.dataset.theme === "auto") updateThemeButton(effectiveTheme());
systemTheme.addEventListener("change", () => {
  if (root.dataset.theme === "auto") {
    updateThemeButton(effectiveTheme());
    if (document.querySelector(".mermaid")) window.location.reload();
  }
});

const diagrams = document.querySelectorAll<HTMLElement>(".mermaid");

themeButton?.addEventListener("click", () => {
  const next = effectiveTheme() === "dark" ? "light" : "dark";
  applyTheme(next);
  try {
    localStorage.setItem("md-theme", next);
  } catch {
    // The in-memory theme still works when storage is unavailable.
  }
  if (diagrams.length > 0) window.location.reload();
});

if (diagrams.length > 0) {
  const mermaidModule = new URL("/__md/assets/mermaid.js", window.location.origin).href;
  void import(mermaidModule).then(async (module: typeof import("./mermaid-client.js")) => {
    await module.renderMermaid(diagrams, effectiveTheme());
  });
}
