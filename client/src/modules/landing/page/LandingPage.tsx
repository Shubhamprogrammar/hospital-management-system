import type { Metadata } from "next";
import Link from "next/link";
import { ActivityIcon, ArrowRightIcon, BellIcon, CalendarClockIcon, HeartPulseIcon, MessageSquareIcon, PillIcon, ShieldCheckIcon, UsersIcon } from "lucide-react";

import { AnimatedHero, SplitWords } from "@/shared/components/motion/AnimatedHero";
import { MagneticButton } from "@/shared/components/motion/MagneticButton";
import { GradientText } from "@/shared/components/gradient/GradientText";
import { GradientBorderCard } from "@/shared/components/gradient/GradientBorderCard";
import { Button } from "@/shared/components/ui/button";
import { ThemeToggle } from "@/shared/components/layout/ThemeToggle";
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
        <div className="animate-aurora absolute -bottom-40 -left-24 size-[34rem] rounded-full bg-[radial-gradient(circle_at_center,var(--glow-navy),transparent_65%)] blur-3xl" style={{ animationDelay: "-3s" }} />
        <div className="animate-aurora absolute top-1/2 left-2/3 size-[28rem] rounded-full bg-[radial-gradient(circle_at_center,var(--glow-violet),transparent_65%)] blur-3xl" style={{ animationDelay: "-9s" }} />
      </div>

      {/* Nav — frosted glass */}
      <header className="sticky top-0 z-40 flex items-center justify-between border-b border-border/50 bg-background/60 px-6 py-4 backdrop-blur-xl md:px-12">
        <div className="flex items-center gap-2">
          <div className="flex size-9 items-center justify-center rounded-xl bg-gradient-brand text-white shadow-md shadow-blue-500/25">
            <ActivityIcon className="size-5" />
          </div>
          <span className="text-lg font-semibold tracking-tight">MediCore<span className="text-gradient-brand">HMS</span></span>
        </div>
        <nav className="hidden items-center gap-8 text-sm font-medium text-muted-foreground md:flex">
          <a href="#features" className="transition-colors hover:text-foreground">Features</a>
          <a href="#stats" className="transition-colors hover:text-foreground">Platform</a>
          <a href="#cta" className="transition-colors hover:text-foreground">Get started</a>
        </nav>
        <div className="flex items-center gap-2">
          <ThemeToggle />
          <Link href="/login">
            <Button variant="ghost" size="sm" className="hidden sm:inline-flex">
              Sign in
            </Button>
          </Link>
          <Link href="/register">
            <Button size="sm" className="bg-gradient-brand shadow-md shadow-blue-500/25">
              Get started
            </Button>
          </Link>
        </div>
      </header>

      {/* Hero — 2-column: copy + glass 3D mockup */}
      <AnimatedHero className="relative mx-auto max-w-7xl px-6 pt-16 pb-24 md:px-12 md:pt-24 lg:grid lg:grid-cols-[1.02fr_0.98fr] lg:items-center lg:gap-14">
        <div className="relative z-10 max-w-3xl">
          <Badge variant="secondary" className="mb-6 gap-1.5 rounded-full border-primary/20 bg-primary/10 px-3 py-1 text-primary">
            <BellIcon className="size-3" /> Realtime care coordination
          </Badge>
          <h1 className="text-4xl font-semibold leading-[1.08] tracking-tight md:text-6xl">
            <SplitWords text="The hospital operating system for" />
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
              <MagneticButton className="inline-flex h-11 items-center gap-2 rounded-lg bg-gradient-brand px-6 text-sm font-medium text-white shadow-lg shadow-blue-500/25 transition-shadow hover:shadow-card-hover">
                Start free <ArrowRightIcon className="size-4" />
              </MagneticButton>
            </Link>
            <Link href="/login">
              <MagneticButton className="inline-flex h-11 items-center gap-2 rounded-lg border border-border/70 bg-card/60 px-6 text-sm font-medium text-foreground shadow-sm backdrop-blur-md transition-colors hover:border-primary/40 hover:text-primary">
                Explore the demo
              </MagneticButton>
            </Link>
          </div>
        </div>

        {/* Glass 3D dashboard mockup — dark azure glass so white text reads in both themes */}
        <div data-reveal className="relative z-10 hidden lg:block">
          <div className="relative overflow-hidden rounded-3xl border border-white/20 bg-white shadow-card-hover backdrop-blur-2xl dark:border-white/10">
            {/* Window chrome */}
            <div className="relative flex items-center justify-between border-b border-white/15 px-5 py-3">
              <div className="flex items-center gap-1.5">
                <span className="size-2.5 rounded-full bg-rose-400/80" />
                <span className="size-2.5 rounded-full bg-amber-400/80" />
                <span className="size-2.5 rounded-full bg-emerald-400/80" />
              </div>
              <span className="text-xs font-medium tracking-wide text-black">mediCore · live</span>
              <span className="inline-flex items-center gap-1.5 rounded-full border border-white/15 bg-white/10 px-2 py-0.5 text-[10px] font-semibold tracking-wide text-black">
                <span className="size-1.5 rounded-full bg-emerald-300 text-black" /> OPD 12
              </span>
            </div>
            <div className="relative h-[24rem]">
              <div className="pointer-events-none absolute inset-0">
                <Hero3DSceneLazy />
              </div>
              {/* Overlay caption chips */}
              <div className="absolute inset-x-0 bottom-0 flex items-center justify-between gap-3 p-5">
                <div className="rounded-xl border border-white/20 bg-white/10 px-4 py-3 backdrop-blur-md">
                  <p className="text-[11px] font-semibold tracking-widest text-black uppercase">Live queue</p>
                  <p className="mt-0.5 text-xl font-semibold text-black">12 waiting</p>
                </div>
                <div className="rounded-xl border border-white/20 bg-white/10 px-4 py-3 text-right backdrop-blur-md">
                  <p className="text-[11px] font-semibold tracking-widest text-white/60 uppercase">Bed census</p>
                  <p className="mt-0.5 text-xl font-semibold text-black">86% full</p>
                </div>
              </div>
            </div>
          </div>
          {/* Floating glass chips — theme-aware so text is readable on light surfaces */}
          <div className="animate-float absolute -left-8 top-14 flex items-center gap-2.5 rounded-xl border border-border/50 bg-card/70 px-3.5 py-2.5 shadow-lg backdrop-blur-xl dark:border-white/10 dark:bg-white/10">
            <div className="flex size-8 items-center justify-center rounded-lg bg-gradient-brand text-white">
              <CalendarClockIcon className="size-4" />
            </div>
            <div>
              <p className="text-xs font-semibold text-foreground">Appointment booked</p>
              <p className="text-[11px] text-muted-foreground">Dr. Sharma · 09:30</p>
            </div>
          </div>
          <div className="animate-float absolute -right-6 bottom-24 flex items-center gap-2.5 rounded-xl border border-border/50 bg-card/70 px-3.5 py-2.5 shadow-lg backdrop-blur-xl dark:border-white/10 dark:bg-white/10" style={{ animationDelay: "-3s" }}>
            <div className="flex size-8 items-center justify-center rounded-lg bg-gradient-brand text-white">
              <ShieldCheckIcon className="size-4" />
            </div>
            <div>
              <p className="text-xs font-semibold text-foreground">Payment received</p>
              <p className="text-[11px] text-muted-foreground">INR 2,450 · Invoice #0041</p>
            </div>
          </div>
        </div>

        {/* Faint 3D behind copy on mobile */}
        <div className="pointer-events-none absolute inset-0 -z-10 opacity-30 lg:hidden">
          <Hero3DSceneLazy />
        </div>
      </AnimatedHero>

      {/* Feature grid */}
      <section id="features" className="mx-auto max-w-7xl px-6 py-20 md:px-12">
        <div className="mb-12 max-w-2xl">
          <p data-reveal className="text-xs font-semibold tracking-widest text-primary uppercase">Platform</p>
          <h2 data-reveal className="mt-2 text-3xl font-semibold tracking-tight md:text-4xl">
            Everything your hospital runs on
          </h2>
          <p data-reveal className="mt-3 text-muted-foreground">
            Six integrated pillars — from the master patient index to billing and connected care.
          </p>
        </div>
        <AnimatedHero className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
          {FEATURES.map((feature) => {
            const Icon = feature.icon;
            return (
              <GradientBorderCard key={feature.title} animated className="h-full bg-card/50 backdrop-blur-xl transition-colors hover:bg-card/70">
                <div className="flex h-full flex-col gap-4 p-6">
                  <div className="flex size-11 items-center justify-center rounded-xl bg-gradient-brand-soft text-primary ring-1 ring-primary/15">
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
        <AnimatedHero className="grid gap-4 rounded-3xl border border-border/60 bg-card/50 p-8 shadow-card backdrop-blur-xl sm:grid-cols-2 lg:grid-cols-4">
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

      {/* CTA — azure gradient panel */}
      <section id="cta" className="mx-auto max-w-7xl px-6 py-24 md:px-12">
        <AnimatedHero className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-blue-950 via-blue-700 to-sky-500 p-10 text-center shadow-card-hover md:p-16">
          <div aria-hidden className="pointer-events-none absolute inset-0">
            <div className="animate-aurora absolute -top-24 left-1/3 size-96 rounded-full bg-[radial-gradient(circle_at_center,rgba(125,211,252,0.35),transparent_65%)] blur-3xl" />
            <div className="absolute -bottom-24 -right-24 size-96 rounded-full bg-[radial-gradient(circle_at_center,rgba(59,130,246,0.4),transparent_65%)] blur-3xl" />
            <div className="absolute inset-0 bg-dots opacity-[0.08]" />
          </div>
          <Badge className="mb-4 rounded-full border-white/20 bg-white/10 text-white backdrop-blur-md">
            Ready when you are
          </Badge>
          <h2 className="mx-auto max-w-2xl text-3xl font-semibold tracking-tight text-white md:text-5xl">
            One platform for your entire hospital
          </h2>
          <p data-reveal className="mx-auto mt-4 max-w-xl text-white/70">
            Join modern care teams running on MediCore. Sign in to your dashboard or create a staff account to explore.
          </p>
          <div data-reveal className="mt-8 flex justify-center">
            <Link href="/register">
              <MagneticButton className="inline-flex h-11 items-center gap-2 rounded-lg bg-white px-8 text-sm font-semibold text-blue-800 shadow-lg transition-colors hover:bg-sky-50">
                Get started <ArrowRightIcon className="size-4" />
              </MagneticButton>
            </Link>
          </div>
        </AnimatedHero>
      </section>

      {/* Footer */}
      <footer className="rounded-t-3xl border-t border-border bg-gradient-brand">
        <div className="mx-auto flex max-w-7xl flex-col items-center justify-between gap-4 px-6 py-8 text-sm text-muted-foreground md:flex-row md:px-12">
          <div className="flex items-center gap-2">
            <ActivityIcon className="size-4 text-white" />
            <span className="font-semibold text-white">MediCore HMS</span>
          </div>
          <p className="font-semibold text-white">Built for hospitals that care. © {new Date().getFullYear()} MediCore Health.</p>
        </div>
      </footer>
    </main>
  );
}
