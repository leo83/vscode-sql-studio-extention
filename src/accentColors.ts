import * as vscode from "vscode";
import { contrastingTextColor, normalizeHexColor } from "./connectionTags";

export interface AccentColorSettings {
  accentColor?: string;
  chartColors: string[];
}

const MAX_CHART_COLORS = 12;

export function getAccentColorSettings(): AccentColorSettings {
  const config = vscode.workspace.getConfiguration("sqlStudio");
  const accentRaw = config.get<string>("accentColor", "").trim();
  const accentColor = normalizeHexColor(accentRaw);
  const chartRaw = config.get<string[]>("chartAccentColors", []);
  const chartColors = chartRaw
    .map((value) => normalizeHexColor(String(value).trim()))
    .filter((value): value is string => Boolean(value))
    .slice(0, MAX_CHART_COLORS);

  return {
    accentColor,
    chartColors,
  };
}

export function buildAccentColorStyleBlock(settings: AccentColorSettings): string {
  const rules: string[] = [];

  if (settings.accentColor) {
    rules.push(`--sql-studio-accent: ${settings.accentColor};`);
    rules.push(
      `--sql-studio-accent-foreground: ${contrastingTextColor(settings.accentColor)};`
    );
    rules.push(
      "--sql-studio-selection: color-mix(in srgb, var(--sql-studio-accent) 32%, var(--vscode-editor-background, #1e1e1e));"
    );
    rules.push(
      "--sql-studio-selection-foreground: var(--sql-studio-accent-foreground, var(--vscode-list-activeSelectionForeground, #fff));"
    );
    rules.push("--sql-studio-focus: var(--sql-studio-accent);");
  }

  settings.chartColors.forEach((color, index) => {
    rules.push(`--sql-studio-chart-${index + 1}: ${color};`);
  });

  if (rules.length === 0) {
    return "";
  }

  return `:root { ${rules.join(" ")} }`;
}

export function buildAccentColorStyleElement(): string {
  const block = buildAccentColorStyleBlock(getAccentColorSettings());
  if (!block) {
    return "";
  }
  return `<style id="sql-studio-accent-colors">${block}</style>`;
}

export function accentColorsAffectConfiguration(event: vscode.ConfigurationChangeEvent): boolean {
  return (
    event.affectsConfiguration("sqlStudio.accentColor") ||
    event.affectsConfiguration("sqlStudio.chartAccentColors")
  );
}
