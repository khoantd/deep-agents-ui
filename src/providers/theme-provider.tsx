"use client";

import * as React from "react";
import { ThemeProvider as NextThemesProvider } from "next-themes";
import {
  THEME_PRESETS,
  ThemePresetId,
  getInitialThemePreset,
  persistThemePreset,
} from "@/lib/themePresets";

interface ThemePresetContextValue {
  preset: ThemePresetId;
  setPreset: (preset: ThemePresetId) => void;
  presets: typeof THEME_PRESETS;
}

const ThemePresetContext = React.createContext<ThemePresetContextValue | null>(
  null
);

export function useThemePreset(): ThemePresetContextValue {
  const ctx = React.useContext(ThemePresetContext);
  if (!ctx) {
    throw new Error("useThemePreset must be used within ThemeProvider");
  }
  return ctx;
}

export function ThemeProvider({
  children,
  ...props
}: React.ComponentProps<typeof NextThemesProvider>) {
  const [preset, setPresetState] = React.useState<ThemePresetId>(() =>
    getInitialThemePreset()
  );

  const setPreset = React.useCallback((next: ThemePresetId) => {
    setPresetState(next);
    persistThemePreset(next);
    if (typeof document !== "undefined") {
      document.documentElement.dataset.themePreset = next;
    }
  }, []);

  React.useEffect(() => {
    // Ensure the attribute is in sync on mount.
    if (typeof document !== "undefined") {
      document.documentElement.dataset.themePreset = preset;
    }
  }, [preset]);

  const value = React.useMemo<ThemePresetContextValue>(
    () => ({
      preset,
      setPreset,
      presets: THEME_PRESETS,
    }),
    [preset, setPreset]
  );

  return (
    <NextThemesProvider {...props}>
      <ThemePresetContext.Provider value={value}>
        {children}
      </ThemePresetContext.Provider>
    </NextThemesProvider>
  );
}

