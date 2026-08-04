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
      {/* Ambient azure/violet aurora — slow drift gives the glass surfaces subtle depth */}
      <div aria-hidden className="pointer-events-none absolute inset-0">
        <div className="animate-aurora absolute -top-40 right-[-8%] size-[42rem] rounded-full bg-[radial-gradient(circle_at_center,var(--glow-cyan),transparent_65%)] blur-3xl will-change-transform" />
        <div className="animate-aurora absolute top-1/3 left-[-10%] size-[36rem] rounded-full bg-[radial-gradient(circle_at_center,var(--glow-navy),transparent_65%)] blur-3xl will-change-transform" style={{ animationDelay: "-8s" }} />
        <div className="animate-aurora absolute bottom-[-18%] left-1/3 size-[40rem] rounded-full bg-[radial-gradient(circle_at_center,var(--glow-violet),transparent_65%)] blur-3xl will-change-transform" style={{ animationDelay: "-16s" }} />
      </div>
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
