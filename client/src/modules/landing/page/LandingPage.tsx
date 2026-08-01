import type { Metadata } from "next";
import Link from "next/link";
import { ActivityIcon, ArrowRightIcon, BellIcon, CalendarClockIcon, HeartPulseIcon, MessageSquareIcon, PillIcon, ShieldCheckIcon, UsersIcon } from "lucide-react";

import { AnimatedHero, SplitWords } from "@/shared/components/motion/AnimatedHero";
import { MagneticButton } from "@/shared/components/motion/MagneticButton";
import { GradientText } from "@/shared/components/gradient/GradientText";
import { GradientBorderCard } from "@/shared/components/gradient/GradientBorderCard";
import { Button } from "@/shared/components/ui/button";
import { Badge } from "@/shared/components/ui/badge";
import Hero3DSceneLazy from "@/shared/components/three/Hero3DSceneLazy";

export const metadata: Metadata = {
  title: "MediCore HMS — Hospital Management Platform",
  description: "A unified, AI-powered hospital management platform for patients, appointments, billing, and care coordination.",
};

const FEATURES = [
  { icon: UsersIcon, title: "Master Patient Index", description: "One unified record per patient with UHID, timeline, and full clinical history across every department." },
  { icon: CalendarClockIcon, title: "Smart Scheduling", description: "Appointments, OPD queues, IPD admissions, and live doctor availability in a single view." },
  { icon: PillIcon, title: "Clinical Workflows", description: "Prescriptions, AI-assisted suggestions, lab orders, pharmacy dispensing, and inventory alerts." },
  { icon: HeartPulseIcon, title: "Wards & Beds", description: "Real-time bed census, ward occupancy, and IPD transfers with discharge summaries." },
  { icon: ShieldCheckIcon, title: "Billing & Compliance", description: "Bills, discounts, insurance, payments, credit notes, and full audit trails built in." },
  { icon: MessageSquareIcon, title: "Connected Care", description: "Staff chat, patient messaging, notifications, and a smart assistant across every channel." },
];

const STATS = [
  { value: 24, suffix: "/7", label: "Care continuity across OPD & IPD" },
  { value: 27, suffix: "+", label: "Clinical & operational modules" },
  { value: 99.9, suffix: "%", label: "Uptime with realtime updates", decimals: 1 },
  { value: 4.5, suffix: "s", label: "Median response across queues", decimals: 1 },
];

export default function LandingPage() {
  return (
    <main className="relative min-h-dvh overflow-hidden bg-background font-sans text-foreground">
      {/* Aurora glow background */}
      <div aria-hidden className="pointer-events-none absolute inset-0 -z-10">
        <div className="animate-aurora absolute -top-32 left-1/4 size-[36rem] rounded-full bg-[radial-gradient(circle_at_center,var(--glow-primary),transparent_65%)] blur-3xl" />
        <div className="animate-aurora absolute top-1/3 -right-32 size-[32rem] rounded-full bg-[radial-gradient(circle_at_center,var(--glow-cyan),transparent_65%)] blur-3xl" style={{ animationDelay: "-6s" }} />
        <div className="animate-aurora absolute -bottom-40 -left-24 size-[34rem] rounded-full bg-[radial-gradient(circle_at_center,var(--glow-indigo),transparent_65%)] blur-3xl" style={{ animationDelay: "-3s" }} />
      </div>

      {/* Nav */}
      <header className="flex items-center justify-between px-6 py-5 md:px-12">
        <div className="flex items-center gap-2">
          <div className="flex size-9 items-center justify-center rounded-xl bg-gradient-brand text-primary-foreground shadow-lg">
            <ActivityIcon className="size-5" />
          </div>
          <span className="text-lg font-semibold tracking-tight">MediCore<span className="text-gradient-brand">HMS</span></span>
        </div>
        <nav className="hidden items-center gap-8 text-sm text-muted-foreground md:flex">
          <a href="#features" className="transition-colors hover:text-foreground">Features</a>
          <a href="#stats" className="transition-colors hover:text-foreground">Platform</a>
          <a href="#cta" className="transition-colors hover:text-foreground">Get started</a>
        </nav>
        <div className="flex items-center gap-2">
          <Link href="/login">
            <Button variant="ghost" size="sm">Sign in</Button>
          </Link>
          <Link href="/register">
            <Button size="sm" className="bg-gradient-brand">Get started</Button>
          </Link>
        </div>
      </header>

      {/* Hero */}
      <AnimatedHero className="relative mx-auto max-w-7xl px-6 pt-16 pb-32 md:px-12 md:pt-24">
        <div className="pointer-events-none absolute inset-0 -z-10 md:opacity-70">
          <Hero3DSceneLazy />
        </div>
        <div className="relative z-10 max-w-3xl">
          <Badge variant="secondary" className="mb-6 gap-1.5 rounded-full px-3 py-1">
            <BellIcon className="size-3" /> Realtime care coordination
          </Badge>
          <h1 className="text-4xl font-semibold leading-[1.08] tracking-tight md:text-6xl">
            <SplitWords text="The hospital operating system for" />{" "}
            <GradientText className="text-4xl font-semibold leading-[1.08] tracking-tight md:text-6xl">
              <SplitWords text="modern care teams" />
            </GradientText>
          </h1>
          <p data-reveal className="mt-6 max-w-xl text-lg leading-relaxed text-muted-foreground">
            From registration to discharge — patients, appointments, billing, clinical workflows,
            and AI-assisted prescriptions in one fast, secure platform.
          </p>
          <div data-reveal className="mt-8 flex flex-wrap items-center gap-3">
            <Link href="/register">
              <MagneticButton className="inline-flex h-11 items-center gap-2 rounded-md bg-gradient-brand px-6 text-sm font-medium text-white shadow-lg transition-opacity hover:opacity-90">
                Start free <ArrowRightIcon className="size-4" />
              </MagneticButton>
            </Link>
            <Link href="/login">
              <Button variant="outline" size="lg">Explore the demo</Button>
            </Link>
          </div>
        </div>
      </AnimatedHero>

      {/* Feature grid */}
      <section id="features" className="mx-auto max-w-7xl px-6 py-20 md:px-12">
        <AnimatedHero className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
          {FEATURES.map((feature) => {
            const Icon = feature.icon;
            return (
              <GradientBorderCard key={feature.title} animated className="h-full">
                <div className="flex h-full flex-col gap-4 p-6">
                  <div className="flex size-11 items-center justify-center rounded-xl bg-gradient-brand-soft text-primary">
                    <Icon className="size-5" />
                  </div>
                  <h3 className="text-base font-semibold tracking-tight">{feature.title}</h3>
                  <p className="text-sm leading-relaxed text-muted-foreground">{feature.description}</p>
                </div>
              </GradientBorderCard>
            );
          })}
        </AnimatedHero>
      </section>

      {/* Stats */}
      <section id="stats" className="mx-auto max-w-7xl px-6 py-16 md:px-12">
        <AnimatedHero className="grid gap-4 rounded-2xl border border-border bg-gradient-brand-soft p-8 sm:grid-cols-2 lg:grid-cols-4">
          {STATS.map((stat) => (
            <div key={stat.label} data-reveal className="flex flex-col gap-1">
              <span className="text-3xl font-semibold tracking-tight text-gradient-brand">
                {stat.value}{stat.suffix}
              </span>
              <span className="text-sm text-muted-foreground">{stat.label}</span>
            </div>
          ))}
        </AnimatedHero>
      </section>

      {/* CTA */}
      <section id="cta" className="mx-auto max-w-7xl px-6 py-24 md:px-12">
        <AnimatedHero className="relative overflow-hidden rounded-3xl border border-border p-10 text-center md:p-16">
          <div aria-hidden className="absolute inset-0 -z-10">
            <div className="animate-aurora absolute -top-20 left-1/3 size-96 rounded-full bg-[radial-gradient(circle_at_center,var(--glow-primary),transparent_65%)] blur-3xl" />
          </div>
          <Badge variant="secondary" className="mb-4 rounded-full">Ready when you are</Badge>
          <h2 className="mx-auto max-w-2xl text-3xl font-semibold tracking-tight md:text-5xl">
            One platform for your entire hospital
          </h2>
          <p data-reveal className="mx-auto mt-4 max-w-xl text-muted-foreground">
            Join modern care teams running on MediCore. Sign in to your dashboard or create a staff account to explore.
          </p>
          <div data-reveal className="mt-8 flex justify-center">
            <Link href="/register">
              <MagneticButton className="inline-flex h-11 items-center gap-2 rounded-md bg-gradient-brand px-8 text-sm font-medium text-white shadow-lg transition-opacity hover:opacity-90">
                Get started <ArrowRightIcon className="size-4" />
              </MagneticButton>
            </Link>
          </div>
        </AnimatedHero>
      </section>

      {/* Footer */}
      <footer className="border-t border-border">
        <div className="mx-auto flex max-w-7xl flex-col items-center justify-between gap-4 px-6 py-8 text-sm text-muted-foreground md:flex-row md:px-12">
          <div className="flex items-center gap-2">
            <ActivityIcon className="size-4 text-primary" />
            <span>MediCore HMS</span>
          </div>
          <p>Built for hospitals that care. © {new Date().getFullYear()} MediCore Health.</p>
        </div>
      </footer>
    </main>
  );
}
