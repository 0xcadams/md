import type {BundledTheme} from "shiki";

export type ThemeAppearance = "dark" | "light";

export interface CodeTheme {
  appearance: ThemeAppearance;
  id: BundledTheme;
  label: string;
}

export const codeThemes = [
  {appearance: "light", id: "github-light-default", label: "GitHub Light"},
  {appearance: "light", id: "catppuccin-latte", label: "Catppuccin Latte"},
  {appearance: "light", id: "solarized-light", label: "Solarized Light"},
  {appearance: "light", id: "vitesse-light", label: "Vitesse Light"},
  {appearance: "dark", id: "github-dark-default", label: "GitHub Dark"},
  {appearance: "dark", id: "catppuccin-mocha", label: "Catppuccin Mocha"},
  {appearance: "dark", id: "solarized-dark", label: "Solarized Dark"},
  {appearance: "dark", id: "vitesse-dark", label: "Vitesse Dark"},
] as const satisfies readonly CodeTheme[];

export const defaultCodeTheme: CodeTheme = codeThemes[4];
export const themeCookieName = "md-code-theme";

const themesById = new Map<string, CodeTheme>(codeThemes.map((theme) => [theme.id, theme]));

export function resolveCodeTheme(id: string | undefined): CodeTheme {
  return (id === undefined ? undefined : themesById.get(id)) ?? defaultCodeTheme;
}
