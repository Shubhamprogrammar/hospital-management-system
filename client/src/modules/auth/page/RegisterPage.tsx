import Link from "next/link";
import { ActivityIcon, ArrowRightIcon, BellIcon, Clock3Icon, ShieldCheckIcon } from "lucide-react";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/shared/components/ui/card";
import { ThemeToggle } from "@/shared/components/layout/ThemeToggle";
import { RegisterForm } from "@/modules/auth/component/RegisterForm";
import { AuthBrandPanel } from "@/modules/auth/component/AuthBrandPanel";

const PERKS = [
  { icon: BellIcon, title: "Realtime updates", description: "Live notifications for appointments, queues, and results." },
  { icon: Clock3Icon, title: "Faster workflows", description: "Fewer clicks from registration to discharge — by design." },
  { icon: ShieldCheckIcon, title: "Secure by default", description: "Role-scoped access and full audit trails on every action." },
];

export function RegisterPage() {
  return (
    <div className="flex min-h-dvh bg-background">
      <AuthBrandPanel
        eyebrow="Join the care team"
        headline="Modern hospitals run on MediCore"
        subheadline="Create an account to explore the platform. New accounts get patient-portal access; staff accounts are provisioned by an administrator."
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

          <Card className="border-border/70 shadow-card-hover -py-1">
            <CardHeader>
              <CardTitle className="text-lg">Create your account</CardTitle>
              <CardDescription>
                New accounts get patient-portal access. Staff accounts are provisioned by an administrator.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <RegisterForm />
              <p className="mt-6 text-center text-sm text-muted-foreground">
                Already have an account?{" "}
                <Link href="/login" className="font-medium text-primary hover:underline">
                  Sign in
                </Link>
              </p>
              <div className="mt-6 flex items-center justify-center">
                <Link
                  href="/"
                  className="inline-flex items-center gap-1.5 text-xs font-medium text-muted-foreground transition-colors hover:text-primary"
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
