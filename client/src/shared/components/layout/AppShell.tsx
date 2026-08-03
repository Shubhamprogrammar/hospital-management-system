"use client";

import type { ReactNode } from "react";

import { Sidebar } from "@/shared/components/layout/Sidebar";
import { Topbar } from "@/shared/components/layout/Topbar";
import { useSession } from "@/shared/lib/auth-client";
import type { Role } from "@/shared/types";

export function AppShell({ children }: { children: ReactNode }) {
  const { data: session } = useSession();

  return (
    <div className="flex h-dvh w-full overflow-hidden bg-background">
      <Sidebar role={session?.user?.role as Role | undefined} className="hidden md:flex" />
      <div className="flex min-w-0 flex-1 flex-col">
        <Topbar />
        <main className="flex-1 overflow-y-auto">
          <div className="mx-auto w-full max-w-7xl p-4 md:p-6">{children}</div>
        </main>
      </div>
    </div>
  );
}
