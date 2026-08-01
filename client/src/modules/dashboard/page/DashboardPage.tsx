"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/shared/components/ui/card";
import { cn } from "@/shared/lib/utils";
import { useRoleDashboard } from "@/modules/dashboard/hooks/useRoleDashboard";
import { useDashboardStats } from "@/modules/dashboard/hooks/useDashboardStats";
import { StatCard, QuickActionLink } from "@/modules/dashboard/component/StatCard";
import { PANELS } from "@/modules/dashboard/component/Panels";

export default function DashboardPage() {
  const { role, config } = useRoleDashboard();
  const stats = useDashboardStats(config);

  return (
    <div className="flex flex-col gap-6">
      {/* Hero banner */}
      <div className="relative overflow-hidden rounded-2xl border border-border">
        <div
          aria-hidden
          className={cn(
            "absolute inset-0 bg-gradient-to-br opacity-[0.14] dark:opacity-20",
            config.accent,
          )}
        />
        <div
          aria-hidden
          className={cn(
            "pointer-events-none absolute -top-24 -right-16 size-72 rounded-full bg-gradient-to-br opacity-25 blur-3xl",
            config.accent,
          )}
        />
        <div className="relative p-6 md:p-8">
          <p className="text-xs font-semibold tracking-widest text-primary uppercase">{config.eyebrow}</p>
          <h1 className="mt-1.5 text-2xl font-semibold tracking-tight md:text-3xl">{config.title}</h1>
          <p className="mt-1.5 max-w-2xl text-sm text-muted-foreground">{config.description}</p>
          <p className="mt-3 inline-flex items-center gap-1.5 rounded-full border border-border bg-background/60 px-3 py-1 text-xs font-medium text-muted-foreground backdrop-blur">
            <span className="size-1.5 rounded-full bg-emerald-500" />
            Signed in as {role?.replace(/_/g, " ")}
          </p>
        </div>
      </div>

      {/* Stat cards */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {config.stats.map((stat, i) => {
          const s = stats[stat.scope];
          return (
            <StatCard
              key={stat.scope}
              label={stat.label}
              href={stat.href}
              icon={stat.icon}
              value={s.value}
              loading={s.loading}
              error={s.error}
              index={i}
            />
          );
        })}
      </div>

      {/* Quick actions */}
      {config.quickActions.length > 0 && (
        <Card>
          <CardHeader className="py-4">
            <CardTitle className="text-sm">Quick actions</CardTitle>
          </CardHeader>
          <CardContent className="grid grid-cols-2 gap-2 pb-4 md:grid-cols-4">
            {config.quickActions.map((action) => (
              <QuickActionLink key={action.href} label={action.label} href={action.href} icon={action.icon} />
            ))}
          </CardContent>
        </Card>
      )}

      {/* Role panels */}
      <div className="grid gap-6 lg:grid-cols-2">
        {config.panels.map((panelKey) => {
          const Panel = PANELS[panelKey];
          if (!Panel) return null;
          return <Panel key={panelKey} className={panelKey === "opdQueue" ? "lg:col-span-2" : undefined} />;
        })}
      </div>
    </div>
  );
}
