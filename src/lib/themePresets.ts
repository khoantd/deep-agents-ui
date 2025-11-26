export type ThemePresetId = "default" | "high-contrast" | "solarized";

export interface ThemePreset {
  id: ThemePresetId;
  label: string;
  description: string;
}

export const THEME_PRESET_STORAGE_KEY = "da-ui-theme-preset";

export const THEME_PRESETS: ThemePreset[] = [
  {
    id: "default",
    label: "Default",
    description: "Balanced contrast for everyday use.",
  },
  {
    id: "high-contrast",
    label: "High contrast",
    description: "Stronger contrast for improved readability.",
  },
  {
    id: "solarized",
    label: "Solarized",
    description: "Softer palette inspired by Solarized themes.",
  },
];

export function getInitialThemePreset(): ThemePresetId {
  if (typeof window === "undefined") {
    return "default";
  }

  const stored = window.localStorage.getItem(THEME_PRESET_STORAGE_KEY) as
    | ThemePresetId
    | null;

  if (stored === "default" || stored === "high-contrast" || stored === "solarized") {
    return stored;
  }

  return "default";
}

export function persistThemePreset(preset: ThemePresetId) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(THEME_PRESET_STORAGE_KEY, preset);
  } catch {
    // Best-effort persistence only.
  }
}


