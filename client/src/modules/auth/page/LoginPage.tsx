import Link from "next/link";
import { ActivityIcon, ArrowRightIcon, CalendarClockIcon, HeartPulseIcon, ShieldCheckIcon } from "lucide-react";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/shared/components/ui/card";
import { ThemeToggle } from "@/shared/components/layout/ThemeToggle";
import { LoginForm } from "@/modules/auth/component/LoginForm";
import { AuthBrandPanel } from "@/modules/auth/component/AuthBrandPanel";

const PERKS = [
  { icon: CalendarClockIcon, title: "One calendar", description: "Appointments, OPD queue, and doctor availability in a single view." },
  { icon: HeartPulseIcon, title: "Clinical workflow", description: "Prescriptions, labs, pharmacy, and inventory without context switching." },
  { icon: ShieldCheckIcon, title: "Role-based access", description: "Every role sees exactly the tools they need — nothing more." },
];

export function LoginPage() {
  return (
    <div className="flex min-h-dvh bg-background">
      <AuthBrandPanel
        eyebrow="Hospital operating system"
        headline="One platform for your entire hospital"
        subheadline="From registration to discharge — patients, appointments, billing, clinical workflows, and AI-assisted prescriptions in one secure portal."
        perks={PERKS}
      />

      {/* Form panel */}
      <div className="relative flex flex-1 items-center justify-center px-4 py-12">
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 bg-[radial-gradient(40rem_24rem_at_100%_0%,var(--glow-cyan),transparent_60%)]"
        />
        <div className="absolute top-4 right-4 z-10">
          <ThemeToggle />
        </div>
        <div className="relative w-full max-w-sm">
          <div className="mb-6 flex items-center justify-center gap-2 lg:hidden">
            <div className="flex size-8 items-center justify-center rounded-lg bg-gradient-brand text-white">
              <ActivityIcon className="size-4" />
            </div>
            <span className="text-lg font-semibold tracking-tight">MediCore<span className="text-gradient-brand">HMS</span></span>
          </div>

          <Card className="border-border/70 shadow-card-hover p-6 lg:border ">
            <CardHeader>
              <CardTitle className="text-lg">Sign in to your account</CardTitle>
              <CardDescription>Use your hospital staff or patient credentials.</CardDescription>
            </CardHeader>
            <CardContent>
              <LoginForm />
              <p className="mt-6 text-center text-sm text-muted-foreground">
                Don&apos;t have an account?{" "}
                <Link href="/register" className="font-medium text-primary hover:underline">
                  Create one
                </Link>
              </p>
              <div className="mt-6 flex items-center justify-center">
                <Link
                  href="/"
                  className="inline-flex items-center gap-1 text-xs font-medium text-muted-foreground transition-colors hover:text-primary"
                >
                  Back to homepage <ArrowRightIcon className="size-3.5" />
                </Link>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
