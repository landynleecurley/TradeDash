"use client";

import { useEffect } from "react";
import { useGlobalStockData } from "@/components/StockDataProvider";

const THEME_KEY = "tradedash.theme";
const COLOR_KEY = "tradedash.themeColor";

/**
 * Syncs the user's stored theme + accent color preferences onto the <html>
 * element. The inline FOUC script in <RootLayout> has already taken a best
 * guess from localStorage; this provider takes over once we know the user
 * to either confirm or correct the painting from the server-side prefs.
 */
export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const { theme, themeColor } = useGlobalStockData();

  // Mode: light / dark / system
  useEffect(() => {
    if (typeof window === "undefined") return;
    try { window.localStorage.setItem(THEME_KEY, theme); } catch { /* private mode */ }

    const apply = () => {
      const dark =
        theme === "dark" ||
        (theme === "system" && window.matchMedia("(prefers-color-scheme: dark)").matches);
      document.documentElement.classList.toggle("dark", dark);
      document.documentElement.style.colorScheme = dark ? "dark" : "light";
    };
    apply();

    if (theme !== "system") return;
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const onChange = () => apply();
    media.addEventListener("change", onChange);
    return () => media.removeEventListener("change", onChange);
  }, [theme]);

  // Accent color: drives every var(--brand-*) consumer in the app
  useEffect(() => {
    if (typeof window === "undefined") return;
    try { window.localStorage.setItem(COLOR_KEY, themeColor); } catch { /* private mode */ }
    document.documentElement.setAttribute("data-theme-color", themeColor);
  }, [themeColor]);

  return <>{children}</>;
}
