"use client";

import { MoonIcon, SunIcon } from "lucide-react";

import { Button } from "@/shared/components/ui/button";
import { useTheme } from "@/shared/lib/theme";
import { cn } from "@/shared/lib/utils";

/**
 * Animated light/dark toggle. Clicking flips the resolved theme and persists it.
 */
export function ThemeToggle({ className }: { className?: string }) {
  const { resolvedTheme, toggleTheme } = useTheme();
  const isDark = resolvedTheme === "dark";

  return (
    <Button
      variant="ghost"
      size="icon"
      onClick={toggleTheme}
      aria-label={isDark ? "Switch to light mode" : "Switch to dark mode"}
      title={isDark ? "Switch to light mode" : "Switch to dark mode"}
      className={cn("relative overflow-hidden", className)}
    >
      <SunIcon
        className={cn(
          "absolute size-4 transition-all duration-300 ease-out",
          isDark ? "scale-100 rotate-0 opacity-100" : "-rotate-90 scale-0 opacity-0",
        )}
      />
      <MoonIcon
        className={cn(
          "absolute size-4 transition-all duration-300 ease-out",
          isDark ? "rotate-90 scale-0 opacity-0" : "scale-100 rotate-0 opacity-100",
        )}
      />
    </Button>
  );
}
