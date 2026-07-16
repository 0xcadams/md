import mermaid from "mermaid";

export async function renderMermaid(
  nodes: NodeListOf<HTMLElement>,
  theme: "dark" | "light",
): Promise<void> {
  mermaid.initialize({
    securityLevel: "strict",
    startOnLoad: false,
    theme: theme === "dark" ? "dark" : "default",
  });
  try {
    await mermaid.run({nodes});
  } catch (error) {
    console.error("Unable to render Mermaid diagram", error);
  }
}
