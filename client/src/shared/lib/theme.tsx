"use client";

import {
  createContext,
  useContext,
  useEffect,
  useSyncExternalStore,
  type ReactNode,
} from "react";

export type Theme = "light" | "dark" | "system";

type ResolvedTheme = "light" | "dark";

const STORAGE_KEY = "hms-theme";

interface ThemeSnapshot {
  theme: Theme;
  resolved: ResolvedTheme;
}

// ---------- External store ----------
// Theme lives in a tiny module-level store read through useSyncExternalStore.
// This is hydration-safe (getServerSnapshot) and avoids setState-in-effect,
// which the react-hooks lint preset flags.

function getSystemTheme(): ResolvedTheme {
  if (typeof window === "undefined") return "light";
  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

function readStoredTheme(): Theme {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (raw === "light" || raw === "dark" || raw === "system") return raw;
  } catch {
    /* storage unavailable */
  }
  return "system";
}

function applyTheme(theme: Theme) {
  if (typeof window === "undefined") return;
  const resolved = theme === "system" ? getSystemTheme() : theme;
  const root = document.documentElement;
  root.classList.toggle("dark", resolved === "dark");
  root.setAttribute("data-theme", resolved);
  root.style.colorScheme = resolved;
}

// Initialize from localStorage before the first client render so the toggle
// shows the right icon immediately (the inline head script already handles
// the pre-paint colors).
if (typeof window !== "undefined") {
  applyTheme(readStoredTheme());
}

let theme: Theme = readStoredTheme();
const listeners = new Set<() => void>();

function notify() {
  listeners.forEach((listener) => listener());
}

function subscribe(callback: () => void) {
  listeners.add(callback);
  return () => {
    listeners.delete(callback);
  };
}

let snapshot: ThemeSnapshot | null = null;
function getSnapshot(): ThemeSnapshot {
  const resolved = theme === "system" ? getSystemTheme() : theme;
  if (!snapshot || snapshot.theme !== theme || snapshot.resolved !== resolved) {
    snapshot = { theme, resolved };
  }
  return snapshot;
}

// Cached — React requires getServerSnapshot to return a stable reference
// (a fresh object each call triggers the "should be cached" hydration warning).
const serverSnapshot: ThemeSnapshot = { theme: "system", resolved: "light" };

function getServerSnapshot(): ThemeSnapshot {
  return serverSnapshot;
}

function setTheme(next: Theme) {
  theme = next;
  try {
    window.localStorage.setItem(STORAGE_KEY, next);
  } catch {
    /* storage unavailable */
  }
  applyTheme(next);
  notify();
}

// ---------- Context ----------

interface ThemeContextValue {
  theme: Theme;
  resolvedTheme: ResolvedTheme;
  setTheme: (theme: Theme) => void;
  toggleTheme: () => void;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

export function ThemeProvider({ children }: { children: ReactNode }) {
  const { theme, resolved } = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);

  // Keep the DOM in sync and follow system preference changes while in "system" mode.
  useEffect(() => {
    applyTheme(theme);
    if (theme !== "system") return;

    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const onChange = () => notify();
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, [theme]);

  return (
    <ThemeContext.Provider
      value={{
        theme,
        resolvedTheme: resolved,
        setTheme,
        toggleTheme: () => setTheme(resolved === "dark" ? "light" : "dark"),
      }}
    >
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error("useTheme must be used within ThemeProvider");
  return ctx;
}
