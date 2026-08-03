"use client";

import { useState, type ReactNode } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ReactQueryDevtools } from "@tanstack/react-query-devtools";
import { Provider as ReduxProvider } from "react-redux";
import { Toaster } from "react-hot-toast";

import { store } from "@/shared/store";
import { SocketProvider } from "@/shared/lib/hooks/useSocket";
import { ThemeProvider, useTheme } from "@/shared/lib/theme";

/** Toaster that adapts to the active theme. */
function ThemedToaster() {
  const { resolvedTheme } = useTheme();
  const isDark = resolvedTheme === "dark";
  return (
    <Toaster
      position="top-right"
      toastOptions={{
        duration: 4000,
        style: {
          background: isDark ? "var(--card)" : "#ffffff",
          color: "var(--foreground)",
          border: "1px solid var(--border)",
        },
      }}
    />
  );
}

export default function Provider({ children }: { children: ReactNode }) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 30_000,
            retry: 1,
            refetchOnWindowFocus: false,
          },
        },
      }),
  );

  return (
    <ReduxProvider store={store}>
      <ThemeProvider>
        <QueryClientProvider client={queryClient}>
          <SocketProvider>
            {children}
            <ThemedToaster />
          </SocketProvider>
          <ReactQueryDevtools initialIsOpen={false} />
        </QueryClientProvider>
      </ThemeProvider>
    </ReduxProvider>
  );
}
