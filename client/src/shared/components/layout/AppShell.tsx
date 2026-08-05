"use client";

import type { ReactNode } from "react";

import { Sidebar } from "@/shared/components/layout/Sidebar";
import { Topbar } from "@/shared/components/layout/Topbar";
import { useSession } from "@/shared/lib/auth-client";
import type { Role } from "@/shared/types";

export function AppShell({ children }: { children: ReactNode }) {
  const { data: session } = useSession();

  return (
    <div className="relative flex h-dvh w-full overflow-hidden bg-background">
      {/* Ambient cyan/navy wash */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 -z-0 bg-[radial-gradient(60rem_30rem_at_110%_-10%,var(--glow-cyan),transparent_60%),radial-gradient(50rem_28rem_at_-10%_110%,var(--glow-navy),transparent_55%)]"
      />
      <Sidebar role={session?.user?.role as Role | undefined} className="relative z-10 hidden md:flex" />
      <div className="relative z-10 flex min-w-0 flex-1 flex-col">
        <Topbar />
        <main className="flex-1 overflow-y-auto">
          <div className="mx-auto w-full max-w-7xl p-4 md:p-6">{children}</div>
        </main>
      </div>
    </div>
  );
}
