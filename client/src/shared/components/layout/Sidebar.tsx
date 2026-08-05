"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ActivityIcon } from "lucide-react";

import { cn } from "@/shared/lib/utils";
import type { Role } from "@/shared/types";
import { canViewNavItem, NAV_GROUPS } from "@/shared/components/layout/nav-items";

export function Sidebar({ role, className }: { role?: Role; className?: string }) {
  const pathname = usePathname();

  return (
    <aside
      className={cn(
        "relative flex h-full w-64 shrink-0 flex-col overflow-hidden border-r border-sidebar-border/70 bg-sidebar/75 text-sidebar-foreground backdrop-blur-xl",
        className,
      )}
    >
      {/* Ambient azure glow */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 -top-24 h-64 bg-[radial-gradient(ellipse_at_top,var(--glow-cyan),transparent_70%)] opacity-60"
      />

      <div className="relative flex h-14 items-center gap-2.5 border-b border-sidebar-border/70 px-5">
        <div className="flex size-8 items-center justify-center rounded-xl bg-gradient-brand text-white shadow-md shadow-blue-500/25">
          <ActivityIcon className="size-4.5" />
        </div>
        <span className="text-sm font-semibold tracking-tight text-sidebar-foreground">
          MediCore<span className="text-gradient-brand">HMS</span>
        </span>
      </div>

      <nav className="relative flex flex-1 flex-col gap-4 overflow-y-auto p-3">
        {NAV_GROUPS.map((group) => {
          // canViewNavItem handles empty minRoles (admin-only) correctly —
          // unlike a bare hasRole spread, which would show admin-only items
          // to every signed-in role (RBAC audit #1/#3).
          const visible = group.items.filter((item) => canViewNavItem(role, item));
          if (visible.length === 0) return null;
          return (
            <div key={group.label} className="flex flex-col gap-1">
              <p className="px-3 pt-1 pb-1.5 text-[11px] font-semibold tracking-widest text-sidebar-foreground/40 uppercase">
                {group.label}
              </p>
              {visible.map((item) => {
                const active = pathname === item.href || pathname?.startsWith(`${item.href}/`);
                const Icon = item.icon;
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    className={cn(
                      "group flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm font-medium transition-all duration-200",
                      active
                        ? "bg-gradient-brand text-white shadow-md shadow-blue-500/25"
                        : "text-sidebar-foreground/70 hover:bg-black/5 hover:text-sidebar-foreground dark:hover:bg-white/5",
                    )}
                  >
                    <Icon
                      className={cn(
                        "size-4 shrink-0 transition-transform duration-200 group-hover:scale-110",
                        active && "text-white",
                      )}
                    />
                    {item.label}
                    {active && <span className="ml-auto size-1.5 rounded-full bg-white/80" />}
                  </Link>
                );
              })}
            </div>
          );
        })}
      </nav>

      <div className="relative border-t border-sidebar-border/70 p-3">
        <div className="rounded-lg bg-black/5 px-3 py-2.5 dark:bg-white/5">
          <p className="text-[11px] font-medium text-sidebar-foreground/80">
            {role ? role.replace(/_/g, " ") : "Signed out"}
          </p>
        </div>
      </div>
    </aside>
  );
}
