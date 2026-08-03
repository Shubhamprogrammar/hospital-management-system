"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ActivityIcon } from "lucide-react";

import { cn } from "@/shared/lib/utils";
import { hasRoleAtLeast, type Role } from "@/shared/types";
import { NAV_GROUPS } from "@/shared/components/layout/nav-items";

export function Sidebar({ role, className }: { role?: Role; className?: string }) {
  const pathname = usePathname();

  return (
    <aside
      className={cn(
        "flex h-full w-64 shrink-0 flex-col border-r border-sidebar-border bg-sidebar text-sidebar-foreground",
        className,
      )}
    >
      <div className="flex h-14 items-center gap-2.5 border-b border-sidebar-border px-5">
        <div className="flex size-8 items-center justify-center rounded-xl bg-gradient-brand text-primary-foreground shadow-md">
          <ActivityIcon className="size-4.5" />
        </div>
        <span className="text-sm font-semibold tracking-tight">
          MediCore<span className="text-gradient-brand">HMS</span>
        </span>
      </div>

      <nav className="flex flex-1 flex-col gap-4 overflow-y-auto p-3">
        {NAV_GROUPS.map((group) => {
          const visible = group.items.filter((item) => !item.minRoles || hasRoleAtLeast(role, ...item.minRoles));
          if (visible.length === 0) return null;
          return (
            <div key={group.label} className="flex flex-col gap-1">
              <p className="px-3 pt-1 pb-1.5 text-[11px] font-semibold tracking-widest text-muted-foreground/60 uppercase">
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
                        ? "bg-primary text-primary-foreground shadow-card"
                        : "text-sidebar-foreground/75 hover:bg-accent hover:text-accent-foreground",
                    )}
                  >
                    <Icon
                      className={cn(
                        "size-4 shrink-0 transition-transform duration-200 group-hover:scale-110",
                        active && "text-primary-foreground",
                      )}
                    />
                    {item.label}
                    {active && <span className="ml-auto size-1.5 rounded-full bg-primary-foreground/70" />}
                  </Link>
                );
              })}
            </div>
          );
        })}
      </nav>

      <div className="border-t border-sidebar-border p-3">
        <p className="px-2 text-center text-[11px] text-muted-foreground/70">
          {role ? role.replace(/_/g, " ") : "Signed out"}
        </p>
      </div>
    </aside>
  );
}
