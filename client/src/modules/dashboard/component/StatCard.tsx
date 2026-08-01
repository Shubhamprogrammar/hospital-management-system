"use client";

import Link from "next/link";
import type { LucideIcon } from "lucide-react";
import { ArrowUpRightIcon } from "lucide-react";

import { Card } from "@/shared/components/ui/card";
import { Skeleton } from "@/shared/components/ui/skeleton";
import { cn } from "@/shared/lib/utils";

interface StatCardProps {
  label: string;
  href: string;
  icon: LucideIcon;
  value?: number;
  loading?: boolean;
  error?: boolean;
  index?: number;
}

const ACCENT_BY_INDEX = [
  "from-indigo-500 to-violet-500",
  "from-cyan-500 to-sky-500",
  "from-emerald-500 to-teal-500",
  "from-rose-500 to-orange-500",
  "from-fuchsia-500 to-purple-500",
  "from-amber-500 to-yellow-500",
] as const;

export function StatCard({ label, href, icon: Icon, value, loading, error, index = 0 }: StatCardProps) {
  const accent = ACCENT_BY_INDEX[index % ACCENT_BY_INDEX.length];

  return (
    <Link href={href} className="group block">
      <Card className="relative overflow-hidden transition-all duration-300 group-hover:-translate-y-0.5 group-hover:border-primary/30 group-hover:shadow-lg group-hover:shadow-primary/10">
        {/* soft corner glow */}
        <div
          aria-hidden
          className={cn(
            "pointer-events-none absolute -top-10 -right-10 size-28 rounded-full bg-gradient-to-br opacity-20 blur-2xl transition-opacity duration-300 group-hover:opacity-40",
            accent,
          )}
        />
        <div className="flex items-center justify-between p-5">
          <div>
            <p className="text-sm text-muted-foreground">{label}</p>
            {loading ? (
              <Skeleton className="mt-2 h-8 w-14" />
            ) : error ? (
              <p className="mt-2 text-sm font-medium text-destructive">—</p>
            ) : (
              <p className="mt-1 text-3xl font-semibold tracking-tight">{value ?? 0}</p>
            )}
          </div>
          <div
            className={cn(
              "flex size-11 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br text-white shadow-md transition-transform duration-300 group-hover:scale-110",
              accent,
            )}
          >
            <Icon className="size-5" />
          </div>
        </div>
        <div
          aria-hidden
          className={cn(
            "absolute inset-x-0 bottom-0 h-0.5 bg-gradient-to-r opacity-0 transition-opacity duration-300 group-hover:opacity-100",
            accent,
          )}
        />
      </Card>
    </Link>
  );
}

export function QuickActionLink({ label, href, icon: Icon }: { label: string; href: string; icon: LucideIcon }) {
  return (
    <Link
      href={href}
      className="group flex items-center justify-between gap-2 rounded-lg border border-border bg-background px-3.5 py-2.5 text-sm font-medium transition-all hover:border-primary/40 hover:bg-primary/5"
    >
      <span className="flex items-center gap-2.5">
        <span className="flex size-7 items-center justify-center rounded-md bg-primary/10 text-primary transition-colors group-hover:bg-primary group-hover:text-primary-foreground">
          <Icon className="size-3.5" />
        </span>
        {label}
      </span>
      <ArrowUpRightIcon className="size-4 text-muted-foreground transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5 group-hover:text-primary" />
    </Link>
  );
}
