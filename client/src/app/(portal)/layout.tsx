"use client";

import { useCallback, useEffect, type ReactNode } from "react";
import { usePathname, useRouter } from "next/navigation";
import Link from "next/link";
import { ShieldXIcon } from "lucide-react";

import { AppShell } from "@/shared/components/layout/AppShell";
import { useSession } from "@/shared/lib/auth-client";
import { Skeleton } from "@/shared/components/ui/skeleton";
import { Button } from "@/shared/components/ui/button";
import { canViewNavItem, NAV_GROUPS, type NavItem } from "@/shared/components/layout/nav-items";
import type { Role } from "@/shared/types";

/** Longest-matching nav item for a pathname (exact or sub-path). */
function navItemForPath(pathname: string): NavItem | undefined {
  let best: NavItem | undefined;
  for (const group of NAV_GROUPS) {
    for (const item of group.items) {
      const match = pathname === item.href || pathname.startsWith(`${item.href}/`);
      if (match && (!best || item.href.length > best.href.length)) {
        best = item;
      }
    }
  }
  return best;
}

/**
 * Portal layout — wraps every authenticated route in the AppShell (sidebar +
 * topbar). The proxy (edge) validates sessions server-side and clears stale
 * cookies; this is a secondary client-side guard for navigations that don't
 * round-trip through the proxy, and enforces role-based access (RBAC audit #3)
 * so a direct URL to an unauthorized module renders "Access denied" instead of
 * the page shell.
 */
export default function PortalLayout({ children }: { children: ReactNode }) {
  const { data: session, isPending, error } = useSession();
  const router = useRouter();
  const pathname = usePathname();

  const role = session?.user?.role as Role | undefined;

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

  // Role guard — mirrors sidebar visibility (RBAC audit #3). Uses
  // canViewNavItem so empty `minRoles` (admin-only) blocks non-admins instead
  // of falling through to a bare hasRole() call that returns true.
  const item = navItemForPath(pathname);
  const denied = role !== undefined && !!item?.minRoles && !canViewNavItem(role, item);

  if (denied) {
    return (
      <div className="flex h-dvh items-center justify-center p-6">
        <div className="flex max-w-md flex-col items-center gap-4 rounded-xl border border-border bg-card p-8 text-center shadow-sm">
          <div className="flex size-14 items-center justify-center rounded-full bg-destructive/10 text-destructive">
            <ShieldXIcon className="size-7" />
          </div>
          <div>
            <h2 className="text-lg font-semibold">Access denied</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Your role{role ? ` (${role.replace(/_/g, " ")})` : ""} doesn&apos;t have permission to
              view this page. If you believe this is a mistake, contact an administrator.
            </p>
          </div>
          <Button asChild variant="outline">
            <Link href="/dashboard">Back to dashboard</Link>
          </Button>
        </div>
      </div>
    );
  }

  return <AppShell>{children}</AppShell>;
}
