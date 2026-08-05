"use client";

import { useCallback, useEffect, type ReactNode } from "react";
import { useRouter } from "next/navigation";

import { AppShell } from "@/shared/components/layout/AppShell";
import { useSession } from "@/shared/lib/auth-client";
import { Skeleton } from "@/shared/components/ui/skeleton";

/**
 * Portal layout — wraps every authenticated route in the AppShell (sidebar +
 * topbar). The proxy (edge) validates sessions server-side and clears stale
 * cookies; this is a secondary client-side guard for navigations that don't
 * round-trip through the proxy.
 */
export default function PortalLayout({ children }: { children: ReactNode }) {
  const { data: session, isPending, error } = useSession();
  const router = useRouter();

  const bounceToLogin = useCallback(() => {
    // The proxy clears stale session cookies via Set-Cookie on the next request;
    // httpOnly cookies can't be removed from JS, so just redirect here.
    router.replace(`/login?next=${encodeURIComponent(window.location.pathname)}`);
  }, [router]);

  useEffect(() => {
    // Only bounce when the server *definitively* said there is no session.
    // If the session fetch itself failed (e.g. backend briefly unreachable),
    // keep showing the shell instead of looping between /dashboard and /login.
    if (!isPending && !session && !error) {
      bounceToLogin();
    }
  }, [isPending, session, error, bounceToLogin]);

  if (isPending || (!session && !error)) {
    return (
      <div className="flex h-dvh flex-col">
        <div className="flex h-14 items-center border-b border-border bg-background px-4" />
        <div className="flex flex-1 gap-4 p-4 md:p-6">
          <aside className="hidden w-64 shrink-0 md:block">
            <Skeleton className="h-full w-full" />
          </aside>
          <div className="flex-1 space-y-4">
            <Skeleton className="h-8 w-1/3" />
            <Skeleton className="h-4 w-2/3" />
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              {Array.from({ length: 4 }).map((_, i) => (
                <Skeleton key={i} className="h-28 w-full" />
              ))}
            </div>
          </div>
        </div>
      </div>
    );
  }

  return <AppShell>{children}</AppShell>;
}
