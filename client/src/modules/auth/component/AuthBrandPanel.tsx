import type { LucideIcon } from "lucide-react";
import { ActivityIcon } from "lucide-react";

interface Perk {
  icon: LucideIcon;
  title: string;
  description: string;
}

/**
 * Azure gradient brand panel shared by the login/register split-screen layouts.
 * Uses glass perk cards so the panel reads modern (not heavy navy) in both themes.
 */
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
    <div className="relative hidden w-[46%] overflow-hidden bg-gradient-to-br from-blue-950 via-blue-700 to-sky-500 text-white lg:flex lg:flex-col">
      <div aria-hidden className="pointer-events-none absolute inset-0">
        <div className="absolute -top-32 -left-24 size-[36rem] rounded-full bg-[radial-gradient(circle_at_center,rgba(125,211,252,0.28),transparent_65%)] blur-3xl" />
        <div className="absolute right-0 bottom-0 size-[30rem] translate-x-1/3 translate-y-1/3 rounded-full bg-[radial-gradient(circle_at_center,rgba(59,130,246,0.35),transparent_65%)] blur-3xl" />
        <div className="absolute top-1/4 right-1/4 size-[20rem] rounded-full bg-[radial-gradient(circle_at_center,rgba(167,139,250,0.22),transparent_65%)] blur-3xl" />
        <div className="absolute inset-0 bg-dots opacity-[0.08]" />
      </div>

      <div className="relative flex items-center gap-2.5 p-10">
        <div className="flex size-9 items-center justify-center rounded-xl bg-white/15 text-white shadow-lg ring-1 ring-white/25 backdrop-blur-md">
          <ActivityIcon className="size-5" />
        </div>
        <span className="text-lg font-semibold tracking-tight text-white">
          MediCore<span className="bg-gradient-to-r from-sky-200 to-cyan-100 bg-clip-text text-transparent">HMS</span>
        </span>
      </div>

      <div className="relative mx-auto flex w-full max-w-md flex-1 flex-col justify-center px-10">
        <p className="text-xs font-semibold tracking-widest text-sky-200/90 uppercase">{eyebrow}</p>
        <h1 className="mt-4 bg-gradient-to-r from-white via-sky-100 to-cyan-100 bg-clip-text text-4xl leading-tight font-semibold tracking-tight text-transparent">
          {headline}
        </h1>
        <p className="mt-4 text-sm leading-relaxed text-white/70">{subheadline}</p>

        <div className="mt-10 space-y-4">
          {perks.map((perk) => {
            const Icon = perk.icon;
            return (
              <div
                key={perk.title}
                className="flex items-start gap-3.5 rounded-xl border border-white/15 bg-white/10 p-3.5 backdrop-blur-md transition-colors hover:bg-white/15"
              >
                <div className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-white/15 text-sky-100 ring-1 ring-white/20">
                  <Icon className="size-4.5" />
                </div>
                <div>
                  <p className="text-sm font-medium text-white">{perk.title}</p>
                  <p className="mt-0.5 text-xs leading-relaxed text-white/60">{perk.description}</p>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <div className="relative p-10 text-xs text-white/60">
        © {new Date().getFullYear()} MediCore Health · Built for hospitals that care.
      </div>
    </div>
  );
}
