import type { LucideIcon } from "lucide-react";
import { ActivityIcon } from "lucide-react";

import { GradientText } from "@/shared/components/gradient/GradientText";

interface Perk {
  icon: LucideIcon;
  title: string;
  description: string;
}

/** Dark navy brand panel shared by the login/register split-screen layouts. */
export function AuthBrandPanel({
  eyebrow,
  headline,
  subheadline,
  perks,
}: {
  eyebrow: string;
  headline: string;
  subheadline: string;
  perks: Perk[];
}) {
  return (
    <div className="relative hidden w-[46%] overflow-hidden bg-sidebar text-sidebar-foreground lg:flex lg:flex-col">
      <div aria-hidden className="pointer-events-none absolute inset-0">
        <div className="absolute -top-32 -left-24 size-[36rem] rounded-full bg-[radial-gradient(circle_at_center,var(--glow-cyan),transparent_65%)] blur-3xl" />
        <div className="absolute right-0 bottom-0 size-[30rem] translate-x-1/3 translate-y-1/3 rounded-full bg-[radial-gradient(circle_at_center,var(--glow-navy),transparent_65%)] blur-3xl" />
      </div>

      <div className="relative flex items-center gap-2.5 p-10">
        <div className="flex size-9 items-center justify-center rounded-xl bg-gradient-brand text-white shadow-lg shadow-cyan-500/25">
          <ActivityIcon className="size-5" />
        </div>
        <span className="text-lg font-semibold tracking-tight text-white">
          MediCore<span className="text-gradient-brand">HMS</span>
        </span>
      </div>

      <div className="relative mx-auto flex w-full max-w-md flex-1 flex-col justify-center px-10">
        <p className="text-xs font-semibold tracking-widest text-cyan-300/80 uppercase">{eyebrow}</p>
        <h1 className="mt-4 text-4xl leading-tight font-semibold tracking-tight text-white">
          <GradientText className="text-4xl leading-tight font-semibold tracking-tight">{headline}</GradientText>
        </h1>
        <p className="mt-4 text-sm leading-relaxed text-sidebar-foreground/60">{subheadline}</p>

        <div className="mt-10 space-y-6">
          {perks.map((perk) => {
            const Icon = perk.icon;
            return (
              <div key={perk.title} className="flex items-start gap-3.5">
                <div className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-white/5 text-cyan-300 ring-1 ring-white/10">
                  <Icon className="size-4.5" />
                </div>
                <div>
                  <p className="text-sm font-medium text-white">{perk.title}</p>
                  <p className="mt-0.5 text-xs leading-relaxed text-sidebar-foreground/50">{perk.description}</p>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <div className="relative p-10 text-xs text-sidebar-foreground/40">
        © {new Date().getFullYear()} MediCore Health · Built for hospitals that care.
      </div>
    </div>
  );
}
